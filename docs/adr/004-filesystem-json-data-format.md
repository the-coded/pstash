# ADR-004: Filesystem JSON as Data Format

**Status:** Accepted
**Date:** 2026-05-27

## Context

Given the decision to use git as the storage backend (ADR-003), we needed a data format for stash metadata and project indices. The format must be:
- Human-readable (inspectable with `cat` / text editor)
- Git-friendly (text-based diffs, mergeable)
- Parseable without special tooling
- Validatable at read time

## Decision

**All metadata is stored as JSON files on the filesystem:**

| File | Location | Purpose |
|------|----------|---------|
| `.stash.json` | `<project>/<stash-id>/` | Per-stash metadata (id, message, files, tags, timestamps) |
| `.project.json` | `<project>/` | Per-project summary (stash count, total size, timestamps) |
| `~/.pstashrc` | Home directory | Global config (remote URL, sync settings, project aliases) |

### Directory structure

```
~/.pstash/                          (git repo)
├── my-app/
│   ├── .project.json               (project index)
│   ├── 2026-03-12_01-05_k7x2/
│   │   ├── .stash.json             (stash metadata)
│   │   ├── README.md               (stashed file)
│   │   └── notes.txt               (stashed file)
│   └── 2026-03-10_22-30_a1b2/
│       ├── .stash.json
│       └── stash.tar.gz            (compressed stash)
└── another-project/
    └── ...
```

### Validation

All JSON files are validated against Zod schemas (ADR-001) at read time:
- `StashMetadataSchema` for `.stash.json`
- `ProjectMetadataSchema` for `.project.json`
- `GlobalConfigSchema` for `~/.pstashrc`

Corrupted entries are silently skipped during listing (graceful degradation).

## Consequences

### Positive

- **Human-readable** — `cat .stash.json` shows exactly what's stored
- **Git-friendly** — JSON diffs are readable in `git log`
- **Zero dependencies** — `JSON.parse()` is built into Node.js
- **Schema-validated** — Zod catches corruption or format changes at read time
- **Dot-prefix convention** — `.stash.json` and `.project.json` are hidden by default, keeping stash directories clean

### Negative

- **No complex queries** — listing stashes by tag requires reading all `.stash.json` files sequentially
- **No transactions** — a crash during write could leave partial state (mitigated by writing metadata last)
- **Size overhead** — `.project.json` stores a formatted size string (`"268 KB"`) that must be parsed back to bytes, adding fragility
- **No atomic updates** — `Indexer.onSave()` and `Stasher.save()` are separate operations, not transactional

### Alternatives Considered

- **SQLite** — rejected; binary file doesn't diff well in git, adds native dependency
- **YAML** — rejected; more complex parsing, no advantage over JSON for structured data
- **MessagePack / CBOR** — rejected; not human-readable, overkill for metadata
- **Single monolithic index file** — rejected; merge conflicts on multi-machine sync
