/** @type {import('tailwindcss').Config} */
// Light fintech theme: navy brand, cyan-blue highlight, white cards on a soft blue-grey ground.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        bg: "#F3F6FA",
        panel: "#FFFFFF",
        raised: "#EEF3F9",
        line: "#DCE4EE",
        ink: { DEFAULT: "#0B1F3A", 2: "#44546A", 3: "#6B7A90" },
        brand: { DEFAULT: "#002E6E", 2: "#0A3D85" },
        accent: "#00A8E8",
        good: "#0B7A33",
        warn: "#9A6200",
        serious: "#C2511F",
        critical: "#C62828",
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,31,58,0.05), 0 4px 16px rgba(11,31,58,0.04)",
      },
    },
  },
  plugins: [],
};
