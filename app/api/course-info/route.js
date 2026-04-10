import { NextResponse } from 'next/server';

// Purdue catalog uses 5-digit course numbers (e.g., CS25000, MA26100).
// Users often type short forms like "CS250" or "MA261" — pad those up.
function normalizeCourseNumber(num) {
  if (num.length === 3) return num + '00';  // 250 → 25000
  if (num.length === 4) return num + '0';   // 2610 → 26100 (rare but exists)
  return num;                               // already 5 digits
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  const match = code.trim().replace(/[\s\-_]+/g, '').match(/^([A-Za-z]+)(\d+)/);
  if (!match) return NextResponse.json({ error: 'Invalid course code' }, { status: 400 });

  const subject = match[1].toUpperCase();
  const number = normalizeCourseNumber(match[2]);

  try {
    const url = `https://api.purdue.io/odata/Courses?$filter=Subject/Abbreviation eq '${subject}' and Number eq '${number}'&$select=Title,CreditHours`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 86400 },
    });

    if (!res.ok) throw new Error(`purdue.io responded ${res.status}`);

    const json = await res.json();
    const course = json?.value?.[0];
    if (!course) return NextResponse.json({ found: false });

    return NextResponse.json({
      found: true,
      title: course.Title,
      creditHours: course.CreditHours,
    });
  } catch (err) {
    return NextResponse.json({ found: false, error: err.message });
  }
}
