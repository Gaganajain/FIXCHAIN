import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Defaults match the README; override to point a second dashboard at another backend.
    port: Number(process.env.FIXCHAIN_WEB_PORT ?? 5173),
    proxy: { "/api": process.env.FIXCHAIN_API ?? "http://127.0.0.1:8000" },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { react: ["react", "react-dom"], charts: ["recharts"], motion: ["framer-motion"], icons: ["lucide-react"] },
      },
    },
  },
});
