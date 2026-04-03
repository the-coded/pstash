import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    "bin/pstash": "bin/pstash.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: true,
  shims: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: [
    // Keep all deps external (they're in node_modules)
    "commander",
    "zod",
    "chalk",
    "ora",
    "simple-git",
    "globby",
    "date-fns",
    "pretty-bytes",
    "tar",
    "nanoid",
    "micromatch",
    "@inquirer/prompts",
  ],
})
