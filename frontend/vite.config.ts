import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// A interface compilada é embutida no aplicativo Python (servida em 127.0.0.1).
export default defineConfig({
  plugins: [react()],
  build: { outDir: "../backend/geomina/static", emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:8765" } },
});
