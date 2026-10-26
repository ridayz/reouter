import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 9800,
    proxy: {
      "/api": "http://127.0.0.1:9301",
      "/v1": "http://127.0.0.1:9301",
    },
  },
});
