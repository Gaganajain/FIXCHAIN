/** @type {import('tailwindcss').Config} */
// FIXCHAIN identity: deep-navy mission-control chrome, sky/cyan actions, clean light work surfaces.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        bg: "#F4F6FA",
        panel: "#FFFFFF",
        raised: "#EEF2F7",
        line: "#E2E8F0",
        ink: { DEFAULT: "#0F172A", 2: "#475569", 3: "#64748B" },
        brand: { DEFAULT: "#011E3E", 2: "#0B3D71" },
        night: { DEFAULT: "#020F22", 2: "#06182F", 3: "#0B2340" },
        accent: "#00F0FF",
        accentDim: "#00A8E8",
        good: "#16A34A",
        warn: "#F59E0B",
        serious: "#C2511F",
        critical: "#DC2626",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.06), 0 4px 16px rgba(15,23,42,0.05)",
        cardHover: "0 8px 24px rgba(15,23,42,0.10)",
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
