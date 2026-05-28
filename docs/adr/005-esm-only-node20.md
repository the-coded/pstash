# ADR-005: ESM-Only with Node.js 20+ Target

**Status:** Accepted
**Date:** 2026-05-27

## Context

The Node.js ecosystem has been transitioning from CommonJS (CJS) to ECMAScript Modules (ESM). Supporting both module systems adds complexity (dual `exports`, conditional `require`/`import`, different `__dirname` behavior). We needed to decide on a module strategy.

## Decision

**ESM-only. No CommonJS support. Minimum Node.js 20 (LTS).**

### Implementation

- `package.json`: `"type": "module"`
- `tsconfig.json`: `"module": "nodenext"`, `"verbatimModuleSyntax": true`
- `tsup.config.ts`: `format: ["esm"]` only
- All imports use `.js` extensions (required by ESM resolution)
- All Node.js built-ins use `node:` prefix (`node:fs/promises`, `node:path`, etc.)
- No `__dirname` / `__filename` — uses `import.meta.url` when needed
- `tsup` config: `shims: false` (no CJS compatibility shims)

### TypeScript 6.x alignment

TypeScript 6.0+ enforces `verbatimModuleSyntax` by default and has first-class ESM support. Our setup aligns with this direction.

## Consequences

### Positive

- **No dual-format complexity** — one module system, one set of rules
- **Modern tooling** — ESM is the future of Node.js; aligns with ecosystem direction
- **`node:` prefix** — explicit built-in imports, no ambiguity with npm packages
- **Tree-shaking ready** — ESM enables static analysis (relevant if used as a library)
- **Smaller bundle** — no CJS wrappers or interop code

### Negative

- **Node.js 20+ required** — excludes Node.js 18 (EOL April 2025, acceptable)
- **`.js` extension tax** — every relative import must include `.js` extension (TypeScript quirk for ESM)
- **CJS consumers excluded** — projects using `require()` cannot import pstash-cli as a library (mitigated: primary use is CLI, not library)
- **Some tools lag behind** — occasional ESM compatibility issues with older testing/mocking tools (not an issue with Vitest)

### Alternatives Considered

- **Dual CJS + ESM** — rejected; significant complexity for a CLI tool with minimal library consumers
- **CJS-only** — rejected; legacy approach, increasingly unsupported by modern dependencies
- **Node.js 18+ target** — rejected; Node.js 20 has better ESM support and is current LTS
