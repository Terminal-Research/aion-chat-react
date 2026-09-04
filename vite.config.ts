import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    cssCodeSplit: true,
    lib: {
      entry: {
        "a2a/direct": resolve(import.meta.dirname, "src/a2a/index.ts"),
        index: resolve(import.meta.dirname, "src/index.ts"),
        "graphql/apollo": resolve(import.meta.dirname, "src/graphql/index.ts"),
        "graphql/standalone": resolve(
          import.meta.dirname,
          "src/graphql/standalone.ts",
        ),
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
        /^@phosphor-icons\/react\//,
        "@apollo/client",
        "@apollo/client/core",
        "graphql",
        "graphql-ws",
      ],
    },
    sourcemap: true,
  },
});
