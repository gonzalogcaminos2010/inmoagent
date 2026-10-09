import { defineConfig } from "vite";
export default defineConfig({
  root: "apps/web",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  build: { outDir: "../../dist/web", emptyOutDir: true },
});
