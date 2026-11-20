/** @type {import('tailwindcss').Config} */
// Paytm Business inspired theme: deep navy primary, bright cyan accent, white cards on light ground.
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
        raised: "#EEF2F7",
        line: "#E2E8F0",
        ink: { DEFAULT: "#0F172A", 2: "#475569", 3: "#64748B" },
        brand: { DEFAULT: "#011E3E", 2: "#0B3D71" },
        accent: "#00F0FF",
        accentDim: "#00A8E8",
        good: "#00C851",
        warn: "#F59E0B",
        serious: "#C2511F",
        critical: "#EF4444",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
        full: "9999px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,23,42,0.08), 0 4px 20px rgba(15,23,42,0.06)",
        cardHover: "0 8px 24px rgba(15,23,42,0.10)",
        sidebar: "0 4px 20px rgba(1,30,62,0.10)",
      },
    },
  },
  plugins: [],
};
