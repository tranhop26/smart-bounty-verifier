import { defineConfig } from "vite";
import { copyFile, mkdir } from "node:fs/promises";

const sitesWorker = {
  name: "sites-worker-entry",
  apply: "build",
  async closeBundle() {
    await mkdir("dist/server", { recursive: true });
    await copyFile("hosting/worker.js", "dist/server/index.js");
  },
};

export default defineConfig({
  root: "frontend",
  base: "./",
  plugins: [sitesWorker],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
