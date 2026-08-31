import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    cssCodeSplit: true,
    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        styles: resolve(import.meta.dirname, "src/styles/aion-chat.css"),
        testing: resolve(import.meta.dirname, "src/testing/index.ts"),
      },
      cssFileName: "styles",
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rolldownOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react-markdown",
        "remark-gfm",
      ],
    },
    sourcemap: true,
  },
});
