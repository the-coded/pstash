/**
 * @module utils/version
 *
 * Centralized helper for reading the pstash CLI version from `package.json`.
 *
 * Instead of hard-coding the version anywhere, every part of the codebase that
 * displays a version should call {@link getCliVersion} so the value stays in
 * sync with `package.json` automatically.
 *
 * The lookup walks up from this module's location until it finds a
 * `package.json` whose `name` is `pstash`. This makes it robust to different
 * build layouts (`src/` during dev, `dist/bin/`/`dist/index.js` after `tsup`).
 *
 * @example
 * import { getCliVersion } from "./utils/version.js"
 * const version = await getCliVersion()
 * console.log(`pstash v${version}`)
 */

import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { exists } from "./fs.js"

/** Fallback returned when the package.json cannot be located or read. */
const FALLBACK_VERSION = "0.0.0"

/** Maximum number of parent directories to traverse looking for package.json. */
const MAX_TRAVERSAL_DEPTH = 6

/**
 * Reads the pstash CLI version from the bundled `package.json`.
 *
 * Walks up the directory tree from this file looking for a `package.json`
 * whose `name` is `pstash`. Returns {@link FALLBACK_VERSION} if anything
 * fails — this function never throws.
 *
 * @returns The semver string declared in `package.json` (e.g. `"0.1.0"`),
 *   or `"0.0.0"` if the lookup fails.
 *
 * @example
 * const version = await getCliVersion()
 * program.version(version, "-v, --version", "Output the current version")
 */
export async function getCliVersion(): Promise<string> {
  try {
    let dir = dirname(fileURLToPath(import.meta.url))
    for (let i = 0; i < MAX_TRAVERSAL_DEPTH; i++) {
      const candidate = join(dir, "package.json")
      if (await exists(candidate)) {
        const pkg = JSON.parse(await readFile(candidate, "utf-8")) as {
          name?: string
          version?: string
        }
        if (pkg.name === "pstash" && pkg.version) {
          return pkg.version
        }
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return FALLBACK_VERSION
  } catch {
    return FALLBACK_VERSION
  }
}
