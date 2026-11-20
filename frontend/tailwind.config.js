/** @type {import('tailwindcss').Config} */
// Paytm-style palette (deep navy brand, sky-blue accent, white rounded cards on a soft grey ground)
// plus a navy "night" chrome for Mission Control.
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
        night: { DEFAULT: "#021A3D", 2: "#06224A", 3: "#0B2D5C" },
        accent: "#00BAF2",
        accentDim: "#00BAF2",
        good: "#0B7A33",
        warn: "#C98200",
        serious: "#C2511F",
        critical: "#DC2626",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
        full: "9999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,46,110,0.05), 0 6px 20px rgba(0,46,110,0.05)",
        cardHover: "0 8px 24px rgba(0,46,110,0.10)",
      },
      keyframes: {
        ping2: { "0%": { transform: "scale(1)", opacity: "0.6" }, "100%": { transform: "scale(2.2)", opacity: "0" } },
        flow: { to: { strokeDashoffset: "-24" } },
      },
      animation: { ping2: "ping2 1.6s cubic-bezier(0,0,0.2,1) infinite", flow: "flow 1s linear infinite" },
    },
  },
  plugins: [],
};
