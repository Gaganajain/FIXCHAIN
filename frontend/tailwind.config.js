/** @type {import('tailwindcss').Config} */
// Paytm-style light theme: deep navy brand, sky-blue accent, white rounded cards on a soft grey ground.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        bg: "#F5F7FA",
        panel: "#FFFFFF",
        raised: "#EAF7FE",
        line: "#E3E9F1",
        ink: { DEFAULT: "#0B1F3A", 2: "#3F4D63", 3: "#66748A" },
        brand: { DEFAULT: "#002E6E", 2: "#0B4A9A" },
        accent: "#00BAF2",
        good: "#0B7A33",
        warn: "#9A6200",
        serious: "#C2511F",
        critical: "#C62828",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,46,110,0.05), 0 6px 20px rgba(0,46,110,0.05)",
      },
    },
  },
  plugins: [],
};
