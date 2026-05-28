# ADR-003: Git as Storage and Synchronization Backend

**Status:** Accepted
**Date:** 2026-05-27

## Context

pstash-cli needs to persist stashed files across sessions and synchronize them across multiple machines. The storage solution must be:
- Reliable and well-understood
- Work offline with eventual sync
- Give the user full control over where data lives
- Not require a hosted service or API keys

## Decision

**Use a private git repository as the sole storage backend.** All stash data is stored as files in a git repo (default: `~/.pstash`), synced to a user-provided remote (GitHub, GitLab, self-hosted, etc.) via standard `git pull --rebase` / `git push`.

### How it works

1. `pstash init` clones the user's private data repo to `~/.pstash`
2. `pstash save` writes files + metadata to `~/.pstash/<project>/<stash-id>/`
3. Git operations (`simple-git`) handle commit, push, pull
4. `autoSync` config flag controls automatic pull-before-read / push-after-write

### Git operations wrapper

`GitManager` class wraps `simple-git` with methods for the exact operations needed:
- `clone()`, `initNewRepo()` — setup
- `commitAll()` — stage all + commit
- `push()`, `pull()`, `sync()` — sync with remote
- `removeAndCommit()` — delete stash + commit

## Consequences

### Positive

- **Version history for free** — git tracks every save/delete/update
- **Offline-first** — works without network; syncs when available
- **User owns the data** — hosted on their own repo, no vendor lock-in
- **Cross-platform** — git works everywhere Node.js runs
- **Transparent** — users can inspect `~/.pstash` with standard git tools
- **No infrastructure** — no server, no database, no cloud service to maintain

### Negative

- **Large files** — git is not ideal for large binary files (no LFS integration yet)
- **Merge conflicts** — concurrent stash operations from different machines could conflict (mitigated by `--rebase` and unique stash IDs)
- **No file locking** — concurrent pstash invocations on the same machine could theoretically corrupt state
- **SSH key setup** — users must configure git SSH keys (standard developer setup, but a barrier for some)
- **Repo size growth** — stash data accumulates in git history (mitigated by `pstash clean` + `pstash drop`)

### Alternatives Considered

- **SQLite** — rejected; not git-syncable, adds binary dependency
- **Cloud API (S3, Supabase)** — rejected; requires API keys, vendor lock-in, not offline-first
- **Syncthing/Dropbox** — rejected; external dependency, no programmatic control
- **rsync** — rejected; no versioning, complex setup for multi-machine sync
