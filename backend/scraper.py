"""
Purdue course scraper for BoilerGPA.

Scrapes selfservice.mypurdue.purdue.edu and stores course data in SQLite.
Adapted from BoilerClasses' scrape.py — same source, stored locally instead of JSON files.

Usage:
    python scraper.py                          # defaults to current semester
    python scraper.py -sem "Fall 2025"
    python scraper.py -sem "Spring 2026" --force   # re-scrape even if already in DB
"""

import argparse
import logging
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import ui
from tqdm import tqdm
from webdriver_manager.chrome import ChromeDriverManager

from db import init_db, is_semester_scraped, upsert_course

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("scraper")

SCHEDULE_URL = "https://selfservice.mypurdue.purdue.edu/prod/bwckschd.p_disp_dyn_sched"

SUBJECT_CODES = [
    "AAE", "AAS", "ABE", "ACCT", "AD", "AFT", "AGEC", "AGR", "AGRY", "AMST",
    "ANSC", "ANTH", "ARAB", "ARCH", "ASAM", "ASEC", "ASL", "ASM", "ASTR", "AT",
    "BAND", "BCHM", "BIOL", "BME", "BMS", "BTNY", "BUS", "CAND", "CCE", "CDIS",
    "CGT", "CHE", "CHM", "CHNS", "CIT", "CLCS", "CLPH", "CM", "CMGT", "CMPL",
    "CNIT", "COM", "CPB", "CS", "CSCI", "CSR", "DANC", "DCTC", "DSB", "EAPS",
    "ECE", "ECET", "ECON", "EDCI", "EDPS", "EDST", "EEE", "ENE", "ENGL", "ENGR",
    "ENGT", "ENTM", "ENTR", "EPCS", "EXPL", "FIN", "FLM", "FNR", "FR", "FS",
    "GEP", "GER", "GRAD", "GREK", "GS", "GSLA", "HDFS", "HEBR", "HER", "HETM",
    "HHS", "HIST", "HK", "HONR", "HORT", "HSCI", "HSOP", "HTM", "IBE", "IDE",
    "IDIS", "IE", "IET", "ILS", "IMPH", "INT", "IT", "ITAL", "JPNS", "JWST",
    "KOR", "LA", "LALS", "LATN", "LC", "LING", "MA", "MATH", "MCMP", "ME",
    "MET", "MFET", "MGMT", "MIS", "MKTG", "MSE", "MSL", "MSPE", "MUS", "NRES",
    "NS", "NUCL", "NUPH", "NUR", "NUTR", "OBHR", "OLS", "OPP", "PES", "PHIL",
    "PHPR", "PHRM", "PHSC", "PHYS", "POL", "PSY", "PTGS", "PUBH", "QM", "REAL",
    "REG", "REL", "RPMP", "RUSS", "SCI", "SCLA", "SCOM", "SFS", "SLHS", "SOC",
    "SPAN", "STAT", "STRT", "SYS", "TCM", "TDM", "TECH", "THTR", "TLI", "VCS",
    "VIP", "VM", "WGSS",
]

# Schedule types that are support/lab sections — don't count their instructors
# as the primary course instructor (mirrors BoilerClasses logic)
SUPPORT_SCHED_TYPES = {
    "Laboratory",
    "Laboratory Preparation",
    "Recitation",
    "Practice Study Observation",
}


def make_driver() -> webdriver.Chrome:
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    return webdriver.Chrome(
        service=Service(ChromeDriverManager().install()),
        options=options,
    )


def _parse_credits(cred_str: str) -> tuple[int, int]:
    """Parse a credit-hour string like '3', '1 to 4', '1 or 3' into (min, max)."""
    try:
        if " to " in cred_str:
            lo, hi = cred_str.split(" to ")
            return int(float(lo)), int(float(hi))
        if " or " in cred_str:
            parts = [int(float(p)) for p in cred_str.split(" or ")]
            return min(parts), max(parts)
        val = int(float(cred_str))
        return val, val
    except Exception:
        return 3, 3


def scrape_subject(driver: webdriver.Chrome, subject: str, semester: str) -> list[dict]:
    """
    Scrape all courses for one subject code in a semester.
    Returns a list of course dicts ready to pass to upsert_course().
    """
    driver.get(SCHEDULE_URL)

    # Pick semester
    sem_select = ui.Select(driver.find_element(By.NAME, "p_term"))
    try:
        sem_select.select_by_visible_text(semester)
    except Exception:
        try:
            sem_select.select_by_visible_text(f"{semester} (View only)")
        except Exception:
            logger.warning(f"Semester '{semester}' not found in dropdown")
            return []

    driver.find_element(By.XPATH, "//input[@type='submit']").click()
    time.sleep(1)

    # Pick subject
    subj_select = ui.Select(driver.find_element(By.XPATH, "//select[@name='sel_subj']"))
    try:
        subj_select.select_by_value(subject)
    except Exception:
        return []  # subject doesn't exist this semester

    # West Lafayette campus only
    camp_select = ui.Select(driver.find_element(By.XPATH, "//select[@name='sel_camp']"))
    camp_select.deselect_all()
    camp_select.select_by_value("PWL")

    driver.find_element(By.XPATH, "//input[@type='submit']").click()
    time.sleep(3)

    tables = driver.find_elements(
        By.XPATH,
        "//table[@summary='This layout table is used to present the sections found']",
    )
    if not tables:
        return []

    tbody = tables[0].find_element(By.TAG_NAME, "tbody")
    ths = tbody.find_elements(By.CLASS_NAME, "ddlabel")
    tds = tbody.find_elements(
        By.XPATH, "//td[@class='dddefault' and a[text()='View Catalog Entry']]"
    )

    if len(ths) != len(tds):
        logger.warning(f"{subject}: row count mismatch (ths={len(ths)}, tds={len(tds)})")
        return []

    seen: dict[str, dict] = {}       # full_id → course struct
    catalog_links: dict[str, str] = {}  # full_id → catalog URL (first occurrence only)

    for th, td in zip(ths, tds):
        a_tag = th.find_element(By.TAG_NAME, "a")
        parts = a_tag.get_attribute("innerHTML").split(" - ")
        title = parts[0].replace("&amp;", "&").replace("&nbsp;", " ").strip()

        code_parts = parts[-2].split(" ") if len(parts) >= 3 else ["", ""]
        subj_code = code_parts[0]
        course_num = code_parts[1] if len(code_parts) > 1 else ""

        full_id = course_num + title  # stable dedupe key within a subject scrape

        try:
            info_table = td.find_element(By.TAG_NAME, "table")
        except Exception:
            continue

        cells = info_table.find_elements(By.TAG_NAME, "td")
        sched_type = cells[-2].text.strip() if len(cells) >= 2 else ""
        raw_instructors = cells[-1].text.split(",") if cells else []
        instructors = [p.split("(")[0].strip() for p in raw_instructors if p.strip()]

        if full_id in seen:
            # Merge instructor data for non-support sections
            if sched_type not in SUPPORT_SCHED_TYPES:
                seen[full_id]["instructors"].extend(instructors)
        else:
            seen[full_id] = {
                "subject": subj_code,
                "number": course_num,
                "title": title,
                "description": "",
                "credits_min": 3,
                "credits_max": 3,
                "instructors": instructors if sched_type not in SUPPORT_SCHED_TYPES else [],
            }
            links = td.find_elements(By.TAG_NAME, "a")
            if links:
                catalog_links[full_id] = links[0].get_attribute("href")

    # Fetch catalog pages for description + credit hours
    for full_id in tqdm(catalog_links, desc=f"  {subject} catalog", leave=False):
        try:
            driver.get(catalog_links[full_id])
            els = driver.find_elements(By.CLASS_NAME, "ntdefault")
            if not els:
                continue
            html_line = els[0].get_attribute("innerHTML").split("\n")[1]
            desc = html_line.split(".00.")[-1].replace("&nbsp;", " ").replace("&amp;", "&").strip()
            cred_str = html_line.split(".00.")[0].split(": ")[-1]
            lo, hi = _parse_credits(cred_str)
            seen[full_id]["description"] = desc
            seen[full_id]["credits_min"] = lo
            seen[full_id]["credits_max"] = hi
        except Exception as e:
            logger.debug(f"Catalog fetch failed for {full_id}: {e}")

    # Deduplicate and clean instructors
    courses = []
    for course in seen.values():
        insts = list(dict.fromkeys(i for i in course["instructors"] if i and i != "TBA"))
        course["instructors"] = insts if insts else ["TBA"]
        courses.append(course)

    return courses


def scrape_semester(semester: str, force: bool = False) -> None:
    """
    Scrape all subjects for a semester and store in SQLite.
    Skips subjects that failed gracefully; resumes if interrupted (DB is written per-subject).
    """
    init_db()

    if not force and is_semester_scraped(semester):
        logger.info(f"'{semester}' already in DB — pass --force to re-scrape")
        return

    driver = make_driver()
    total_courses = 0
    try:
        for subject in tqdm(SUBJECT_CODES, desc="Subjects"):
            try:
                courses = scrape_subject(driver, subject, semester)
                for c in courses:
                    upsert_course(
                        subject=c["subject"],
                        number=c["number"],
                        title=c["title"],
                        description=c["description"],
                        credits_min=c["credits_min"],
                        credits_max=c["credits_max"],
                        semester=semester,
                        instructors=c["instructors"],
                    )
                total_courses += len(courses)
                if courses:
                    logger.info(f"{subject}: {len(courses)} courses saved")
            except Exception as e:
                logger.warning(f"{subject}: failed ({e}), skipping")
    finally:
        driver.quit()

    logger.info(f"Done — {total_courses} courses saved for '{semester}'")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scrape Purdue courses into SQLite")
    parser.add_argument("-sem", default="Spring 2025", dest="sem", help="Semester to scrape")
    parser.add_argument("--force", action="store_true", help="Re-scrape even if already in DB")
    args = parser.parse_args()
    scrape_semester(args.sem, force=args.force)
