/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        gold: {
          50:  "#fdf9ed",
          100: "#faf0d0",
          200: "#f4dfa0",
          300: "#edc86a",
          400: "#e6b143",
          500: "#CFB991", // Purdue Gold
          600: "#b8973a",
          700: "#9a7830",
          800: "#7d5f29",
          900: "#674e24",
        },
        charcoal: {
          50:  "#f5f5f5",
          100: "#e8e8e8",
          200: "#d0d0d0",
          300: "#a8a8a8",
          400: "#747474",
          500: "#525252",
          600: "#3a3a3a",
          700: "#282828",
          800: "#1a1a1a",
          900: "#0f0f0f",
          950: "#080808",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      animation: {
        shimmer: "shimmer 2.5s linear infinite",
        "pulse-gold": "pulse-gold 2s ease-in-out infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% center" },
          "100%": { backgroundPosition: "200% center" },
        },
        "pulse-gold": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
    },
  },
  plugins: [],
};
