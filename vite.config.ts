import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/renderer"),
    },
  },
  root: ".",
  server: {
    port: Number(process.env.VITE_PORT ?? 5174),
    strictPort: true,
    watch: {
      // Electron writes its userData files (Code Cache, GPUCache, DIPS, etc.)
      // into teller-instance-* when --user-data-dir points inside the project root.
      // Without this, Vite would detect every write and trigger a full page reload.
      ignored: ["**/teller-instance-*/**"],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
