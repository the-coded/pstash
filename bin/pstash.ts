/**
 * @module bin/pstash
 *
 * CLI entry point — invoked when the user runs `pstash` from the
 * shell. Delegates to {@link module:cli}.`run`.
 *
 * The shebang (`#!/usr/bin/env node`) is injected by tsup at build
 * time via `banner`, so it must not be present in source.
 */

import { run } from "../src/cli.js"

run()
