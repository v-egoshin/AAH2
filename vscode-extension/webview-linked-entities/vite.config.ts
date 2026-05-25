import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "../dist/webview-linked-entities"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "index.html"),
      output: {
        entryFileNames: "assets/index.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  resolve: {
    alias: [
      {
        find: "@web/app/workbench",
        replacement: path.resolve(__dirname, "src/embedWorkbenchShim.ts"),
      },
      { find: "@web", replacement: path.resolve(__dirname, "../../web/src") },
      {
        find: /\/app\/workbench(\.tsx)?$/,
        replacement: path.resolve(__dirname, "src/embedWorkbenchShim.ts"),
      },
    ],
  },
});
