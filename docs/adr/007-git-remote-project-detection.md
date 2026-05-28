# ADR-007: Automatic Project Detection via Git Remote

**Status:** Accepted
**Date:** 2026-05-27

## Context

pstash organizes stashes by project name. Users run `pstash save` from different project directories, and the tool needs to determine which project the stash belongs to — without requiring the user to specify it every time.

## Decision

**Automatically detect the project name from the git remote URL, with a configurable alias system for overrides.**

### Detection order (in `ProjectDetector.detect()`)

1. Parse the `origin` remote URL → extract repo name
   - `git@github.com:the-coded/scena.git` → `scena`
   - `https://github.com/the-coded/scena.git` → `scena`
2. If no `origin`, try any other configured remote
3. Fallback: `basename(process.cwd())`

### Alias resolution (in `ProjectDetector.resolveAlias()`)

After detection, the raw name is checked against aliases in `~/.pstashrc`:

```json
{
  "projects": {
    "scena": {
      "aliases": ["e2e-gen", "scena-cli"]
    }
  }
}
```

If the detected name `"e2e-gen"` matches an alias, it resolves to `"scena"`.

### Override

Users can always bypass detection with `--project <name>` on any command.

## Consequences

### Positive

- **Zero config for common case** — if you're in a git repo with an origin, it just works
- **Handles renames** — repo can be renamed on GitHub without breaking existing stashes (via aliases)
- **Multi-remote aware** — falls back to non-origin remotes
- **Explicit override** — `--project` flag for edge cases

### Negative

- **Directory name fallback is fragile** — if not in a git repo, the directory name might be generic (e.g., `src`, `app`)
- **Regex-based URL parsing** — the `/([^/]+?)(\.git)?$/` regex covers common patterns but might miss exotic remote URL formats
- **No caching** — `detect()` runs `git remote` on every invocation (fast in practice, but technically redundant within a single command session)

### Alternatives Considered

- **Explicit project name always required** — rejected; too much friction for the common case
- **Config file per project** (e.g., `.pstashrc` in project root) — rejected; pollutes project directories
- **Package.json `name` field** — rejected; not all projects are Node.js, and monorepos have nested packages
