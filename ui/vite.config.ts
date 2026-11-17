import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// `make console-dev` runs the API on :8081 with reload; Vite proxies /api to it.
// Built into the Python package so FastAPI serves API + UI from one origin/port.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "../src/emulator_ui/static", emptyOutDir: true },
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: { "/api": { target: "http://127.0.0.1:8081", changeOrigin: false } },
  },
  test: { environment: "node" },
});
