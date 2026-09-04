import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const packageName = "@terminal-research/aion-chat-react";
const budgetPath = join(root, "bundle-budgets.json");
const budgets = JSON.parse(await readFile(budgetPath, "utf8"));

function fail(message) {
  throw new Error(message);
}

async function entryFiles(relativePath, visited = new Set()) {
  if (visited.has(relativePath)) {
    return visited;
  }
  visited.add(relativePath);
  const code = await readFile(join(root, relativePath), "utf8");
  const imports = Array.from(
    code.matchAll(/\bfrom\s+["'](\.[^"']+)["']/gu),
    (match) => match[1],
  );
  for (const specifier of imports) {
    await entryFiles(join(dirname(relativePath), specifier), visited);
  }
  return visited;
}

for (const [relativePath, budget] of Object.entries(budgets)) {
  const files = await entryFiles(relativePath);
  const contents = await Promise.all(
    Array.from(files, (file) => readFile(join(root, file))),
  );
  const rawBytes = contents.reduce((total, file) => total + file.byteLength, 0);
  const gzipBytes = contents.reduce(
    (total, file) => total + gzipSync(file).byteLength,
    0,
  );
  if (rawBytes > budget.rawBytes || gzipBytes > budget.gzipBytes) {
    fail(
      `${relativePath} is ${rawBytes} raw/${gzipBytes} gzip bytes; ` +
        `budget is ${budget.rawBytes} raw/${budget.gzipBytes} gzip bytes.`,
    );
  }
  console.log(
    `${relativePath}: ${rawBytes} raw, ${gzipBytes} gzip bytes ` +
      `(${files.size} file${files.size === 1 ? "" : "s"})`,
  );
}

const coreCode = await readFile(join(root, "dist/index.js"), "utf8");
const importSpecifiers = Array.from(
  coreCode.matchAll(/\bfrom\s+["']([^"']+)["']/gu),
  (match) => match[1],
);
const forbiddenCoreImports = [
  "@apollo/client",
  "@copilotkit",
  "@ag-ui",
  "graphql",
  "graphql-ws",
];
for (const specifier of importSpecifiers) {
  if (forbiddenCoreImports.some((prefix) => specifier.startsWith(prefix))) {
    fail(`Core entry unexpectedly imports ${specifier}.`);
  }
}

const forbiddenCoreText = [
  "CopilotKit",
  "@ag-ui",
  "licenseKey",
  "localStorage",
];
for (const marker of forbiddenCoreText) {
  if (coreCode.includes(marker)) {
    fail(`Core entry unexpectedly contains ${marker}.`);
  }
}

const standaloneCode = await readFile(
  join(root, "dist/graphql/standalone.js"),
  "utf8",
);
const standaloneImports = Array.from(
  standaloneCode.matchAll(/\bfrom\s+["']([^"']+)["']/gu),
  (match) => match[1],
);
for (const specifier of standaloneImports) {
  if (specifier === "graphql" || specifier.startsWith("@apollo/client")) {
    fail(`Standalone GraphQL entry unexpectedly imports ${specifier}.`);
  }
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "aion-chat-react-"));
try {
  const packOutput = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", temporaryRoot],
    { cwd: root, encoding: "utf8" },
  );
  const packResult = JSON.parse(packOutput)[0];
  if (!packResult?.filename) {
    fail("npm pack did not return a tarball filename.");
  }
  const tarballPath = join(temporaryRoot, packResult.filename);
  const consumerRoot = join(temporaryRoot, "consumer");
  await mkdir(consumerRoot);
  await writeFile(
    join(consumerRoot, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: {
          "@apollo/client": "3.14.0",
          [packageName]: `file:${tarballPath}`,
          graphql: "16.14.2",
          react: "19.2.0",
          "react-dom": "19.2.0",
        },
      },
      null,
      2,
    ),
  );
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--offline",
    ],
    { cwd: consumerRoot, stdio: "pipe" },
  );

  const validationPath = join(consumerRoot, "validate.mjs");
  await writeFile(
    validationPath,
    `
      import {
        AionAgentCatalogError,
        AionConversationDirectoryError,
        AionChatView,
        AionChatWorkspace,
        createInMemoryAionConversationStore,
      } from "${packageName}";
      import {
        createDirectAionA2ATransport,
        createDirectAionConversationDirectory,
      } from "${packageName}/a2a";
      import { FakeAionChatTransport } from "${packageName}/testing";
      import {
        createApolloAionAgentCatalog,
        createApolloAionChatTransport,
        createApolloAionConversationDirectory,
      } from "${packageName}/graphql";
      import {
        createStandaloneAionAgentCatalog,
        createStandaloneAionConversationDirectory,
        createStandaloneAionGraphQLClient,
      } from "${packageName}/graphql/standalone";
      import {
        createAionFilesAttachmentUploader,
      } from "${packageName}/uploads";
      import {
        createBrowserAionConversationStore,
      } from "${packageName}/storage/browser";

      if (typeof AionChatView !== "object" &&
          typeof AionChatView !== "function") throw new Error("root export");
      if (typeof AionAgentCatalogError !== "function") {
        throw new Error("catalog model export");
      }
      if (typeof AionConversationDirectoryError !== "function") {
        throw new Error("conversation directory model export");
      }
      if (typeof AionChatWorkspace !== "function") {
        throw new Error("workspace export");
      }
      if (typeof createInMemoryAionConversationStore !== "function") {
        throw new Error("memory storage export");
      }
      if (typeof FakeAionChatTransport !== "function") {
        throw new Error("testing export");
      }
      if (typeof createDirectAionA2ATransport !== "function") {
        throw new Error("a2a export");
      }
      if (typeof createDirectAionConversationDirectory !== "function") {
        throw new Error("direct directory export");
      }
      if (typeof createApolloAionChatTransport !== "function") {
        throw new Error("graphql export");
      }
      if (typeof createApolloAionAgentCatalog !== "function") {
        throw new Error("apollo catalog export");
      }
      if (typeof createApolloAionConversationDirectory !== "function") {
        throw new Error("apollo directory export");
      }
      if (typeof createStandaloneAionGraphQLClient !== "function") {
        throw new Error("standalone graphql export");
      }
      if (typeof createStandaloneAionAgentCatalog !== "function") {
        throw new Error("standalone catalog export");
      }
      if (typeof createStandaloneAionConversationDirectory !== "function") {
        throw new Error("standalone directory export");
      }
      if (typeof createAionFilesAttachmentUploader !== "function") {
        throw new Error("uploads export");
      }
      if (typeof createBrowserAionConversationStore !== "function") {
        throw new Error("browser storage export");
      }
      if (!import.meta.resolve("${packageName}/styles.css").endsWith(".css")) {
        throw new Error("styles export");
      }
    `,
  );
  execFileSync(process.execPath, [validationPath], {
    cwd: consumerRoot,
    stdio: "pipe",
  });

  const installedPackage = join(
    consumerRoot,
    "node_modules",
    "@terminal-research",
    "aion-chat-react",
  );
  await Promise.all([
    access(join(installedPackage, "BUNDLE_BUDGETS.md")),
    access(join(installedPackage, "THIRD_PARTY_NOTICES.md")),
    access(join(installedPackage, "LICENSES", "CopilotKit-MIT.txt")),
    access(join(installedPackage, "dist", "index.d.ts")),
  ]);

  const consumerRequire = createRequire(join(consumerRoot, "package.json"));
  const packageRequire = createRequire(join(installedPackage, "package.json"));
  const consumerReact = await realpath(
    consumerRequire.resolve("react/package.json"),
  );
  const packageReact = await realpath(
    packageRequire.resolve("react/package.json"),
  );
  if (consumerReact !== packageReact) {
    fail("The packed consumer resolved more than one React installation.");
  }

  const tarballSize = (await stat(tarballPath)).size;
  console.log(`packed artifact: ${tarballSize} bytes`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
