# ADR-008: Commander.js with Centralized Error Handling

**Status:** Accepted
**Date:** 2026-05-27

## Context

pstash-cli has 13 commands, all async. Commander.js `.action()` callbacks are synchronous by design — unhandled promise rejections in async handlers would crash silently or produce cryptic errors. We needed a consistent error handling strategy.

## Decision

**A single `withErrorHandling()` higher-order function wraps every command handler, bridging async handlers with Commander's sync API.**

### Implementation

```typescript
// src/cli.ts
function withErrorHandling(fn: (...args: any[]) => Promise<void>) {
  return (...args: any[]) => fn(...args).catch(handleError)
}

function handleError(err: unknown): never {
  if (err instanceof Error) {
    console.error(`Error: ${err.message}`)
  } else {
    console.error("An unknown error occurred")
  }
  process.exit(1)
}

// Usage
program
  .command("save")
  .action(withErrorHandling(async (files, opts) => { ... }))
```

### What this means

- Every command handler is an `async function` that can throw freely
- Errors bubble up to `handleError`, which prints a clean message and exits with code 1
- No try/catch needed in individual command files (unless for local recovery)
- No custom error class hierarchy — plain `Error` with descriptive messages

### CLI option validation

Commander.js parses flags and arguments into an untyped `opts` object. We do **not** validate CLI options with Zod at the CLI boundary. Instead:
- Commander handles type coercion (strings, booleans, arrays)
- Zod validates data at I/O boundaries (reading files, configs)
- Type assertions in `cli.ts` bridge Commander's untyped output

## Consequences

### Positive

- **Single error boundary** — no duplicated try/catch across 13 commands
- **Clean user output** — errors show `Error: <message>`, not stack traces
- **Simple** — ~15 lines of code for the entire error handling system
- **Non-zero exit code** — scripts can detect failures via `process.exit(1)`

### Negative

- **No error classification** — all errors are treated equally (no distinction between user errors, I/O errors, and bugs)
- **Late type errors** — CLI options are cast (`opts.tag as string[]`), not validated; type mismatches surface downstream
- **No recovery** — every unhandled error terminates the process (acceptable for a CLI, not for a library)
- **Stack traces lost** — helpful for debugging but hidden from users (could add `--verbose` flag in the future)

### Alternatives Considered

- **Per-command try/catch** — rejected; boilerplate duplication across 13 commands
- **Custom error class hierarchy** (`StashNotFoundError`, `ConfigError`, etc.) — deferred; not justified at current scale
- **Zod validation at CLI boundary** — considered but deferred; Commander's type coercion is sufficient for now
