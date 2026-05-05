import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// Server deps to bundle to reduce openat(2) syscalls and improve cold-start.
//
// IMPORTANT: Native modules (those shipping a .node binary via node-pre-gyp or
// node-gyp) must NOT be added here.  esbuild cannot bundle them because they
// pull in optional peer deps and non-JS assets.
// Known native deps that must stay external: argon2, bufferutil, bcrypt, sharp.
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "helmet",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
  "openid-client",
  "node-cron",
  "memoizee",
  "p-limit",
  "p-retry",
  "csv-parse",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    // argon2 is a native module; its transitive deps must also be external.
    external: [
      ...externals,
      "@mapbox/node-pre-gyp",
      "mock-aws-s3",
      "aws-sdk",
      "nock",
    ],
    loader: {
      ".html": "text",
    },
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
