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
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const packageName = "@terminal-research/aion-chat-react";
const budgetPath = join(root, "bundle-budgets.json");
const budgets = JSON.parse(await readFile(budgetPath, "utf8"));

function fail(message) {
  throw new Error(message);
}

for (const [relativePath, budget] of Object.entries(budgets)) {
  const content = await readFile(join(root, relativePath));
  const rawBytes = content.byteLength;
  const gzipBytes = gzipSync(content).byteLength;
  if (rawBytes > budget.rawBytes || gzipBytes > budget.gzipBytes) {
    fail(
      `${relativePath} is ${rawBytes} raw/${gzipBytes} gzip bytes; ` +
        `budget is ${budget.rawBytes} raw/${budget.gzipBytes} gzip bytes.`,
    );
  }
  console.log(`${relativePath}: ${rawBytes} raw, ${gzipBytes} gzip bytes`);
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

const forbiddenCoreText = ["CopilotKit", "@ag-ui", "licenseKey"];
for (const marker of forbiddenCoreText) {
  if (coreCode.includes(marker)) {
    fail(`Core entry unexpectedly contains ${marker}.`);
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
      import { AionChatView } from "${packageName}";
      import { FakeAionChatTransport } from "${packageName}/testing";
      import { createApolloAionChatTransport } from "${packageName}/graphql";

      if (typeof AionChatView !== "object" &&
          typeof AionChatView !== "function") throw new Error("root export");
      if (typeof FakeAionChatTransport !== "function") {
        throw new Error("testing export");
      }
      if (typeof createApolloAionChatTransport !== "function") {
        throw new Error("graphql export");
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
