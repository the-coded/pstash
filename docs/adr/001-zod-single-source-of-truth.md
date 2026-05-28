# ADR-001: Zod as Single Source of Truth for Types

**Status:** Accepted
**Date:** 2026-05-27

## Context

TypeScript projects commonly maintain separate `interface`/`type` declarations alongside runtime validation logic. This creates a drift risk: types and validators can get out of sync, leading to runtime errors that the compiler can't catch.

pstash-cli validates untrusted data at multiple I/O boundaries:
- Reading `.stash.json` and `.project.json` from the filesystem
- Reading `~/.pstashrc` global config
- Parsing CLI options

We needed a single validation/typing strategy that covers all these boundaries without duplication.

## Decision

**All types are derived from Zod schemas via `z.infer<typeof Schema>`.** There are zero manual `interface` or `type` declarations in the codebase.

- Schemas live in a single file: `src/schemas.ts`
- Every data structure (stash metadata, project metadata, global config, CLI options) is defined as a Zod schema first
- TypeScript types are extracted with `z.infer<>` and exported alongside schemas
- Validation happens at every I/O boundary using `Schema.parse()` or `Schema.safeParse()`

## Consequences

### Positive

- **Zero drift** — types and validation are the same artifact
- **Single file to read** — `schemas.ts` is the complete data model for the project
- **Runtime safety** — all external data is validated before use
- **Self-documenting** — Zod schemas include defaults (`.default()`), constraints (`.min()`, `.nonnegative()`), and descriptions inline

### Negative

- **Zod is a runtime dependency** — adds ~50KB to the bundle (acceptable for a CLI)
- **Learning curve** — contributors must understand Zod syntax to modify types
- **Verbose for simple types** — `z.object({ name: z.string() })` is more verbose than `{ name: string }` for trivial cases

### Alternatives Considered

- **Manual interfaces + separate validation** — rejected due to drift risk
- **io-ts** — more mature but heavier API, weaker TypeScript inference
- **ArkType** — newer, less ecosystem support at time of decision
- **No runtime validation** — rejected; trusting filesystem JSON without validation is fragile
