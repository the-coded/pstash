/**
 * @module pstash
 *
 * Public API surface of `pstash` for programmatic use.
 *
 * Re-exports stable types and functions that consumers can rely on:
 * - Zod schemas and inferred types from {@link module:schemas}
 * - Config loader/saver from {@link module:config/loader}
 * - Default config templates from {@link module:config/templates}
 *
 * The CLI entry point lives in `bin/pstash.ts` and is not part of
 * the importable surface.
 *
 * @example
 * ```ts
 * import { loadConfig, createDefaultConfig } from "pstash"
 *
 * const config = await loadConfig()
 * ```
 */

export * from "./schemas.js"
export * from "./config/loader.js"
export * from "./config/templates.js"
