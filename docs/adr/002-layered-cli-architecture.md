# ADR-002: Layered CLI Architecture — Commands → Core → Utils

**Status:** Accepted
**Date:** 2026-05-27

## Context

CLI tools can range from a single-file script to a fully abstracted application with dependency injection, service layers, and repositories. pstash-cli has 13 commands with shared business logic (stashing, git operations, project detection, indexing). We needed a structure that balances separation of concerns with simplicity.

## Decision

**Three-layer architecture with clear responsibility boundaries:**

```
src/commands/   → Orchestration layer (CLI-specific)
src/core/       → Business logic layer (reusable)
src/utils/      → Pure utility functions (stateless)
```

### Layer responsibilities

| Layer | Does | Doesn't |
|-------|------|---------|
| `commands/` | Parse CLI options, orchestrate core classes, format output, handle user prompts | Contain business logic, know about file formats |
| `core/` | Stash operations, git management, project detection, indexing, compression | Know about CLI framework, print to stdout |
| `utils/` | File I/O helpers, formatting, time parsing, validation | Hold state, depend on core or commands |

### No DI container, no interfaces

Core classes are instantiated directly in command handlers. There are no abstract interfaces or dependency injection — classes are concrete and constructors take simple values (paths, configs).

## Consequences

### Positive

- **Easy to navigate** — a new contributor can find any feature in <30 seconds
- **Low abstraction tax** — no DI, no factory patterns, no service locators
- **Testable** — core classes can be tested independently by passing a temp directory path
- **Clear dependency direction** — commands → core → utils (no cycles)

### Negative

- **Some duplication** — the sync pattern (pull-before, push-after) is repeated across ~9 command files instead of being a shared orchestration helper
- **Business logic leaks** — `commands/diff.ts` contains an LCS diff algorithm (~100 lines) that belongs in `core/` or `utils/`
- **No enforced boundaries** — nothing prevents a utility from importing core (relies on discipline)

### Alternatives Considered

- **Single-file commands** (all logic inline) — rejected; too tangled at 13 commands
- **Full Clean Architecture** (use cases, repositories, entities) — rejected; overkill for a CLI tool
- **Service-oriented** (singleton services with DI) — rejected; unnecessary complexity for this scale
