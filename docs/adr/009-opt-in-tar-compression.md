# ADR-009: Opt-In Tar.gz Compression Per Stash

**Status:** Accepted
**Date:** 2026-05-27

## Context

Stash files are stored in a git repository. Storing many individual files can increase repo size and clutter the directory structure. However, compressed archives lose human readability and make git diffs opaque. We needed a compression strategy that balances storage efficiency with transparency.

## Decision

**Compression is opt-in, per stash entry. Each stash independently tracks whether it's compressed via `compressed: boolean` in `.stash.json`.**

### How it works

- **Save:** `pstash save --compress` or `config.defaults.compression = true`
- **Storage:** Individual files are replaced by a single `stash.tar.gz`
- **Restore:** Decompression is transparent — `pstash pop` and `pstash apply` handle both compressed and uncompressed stashes automatically
- **Partial restore:** For compressed stashes with a `--files` pattern, extracts to a temp directory first, then copies only matching files

### Implementation

```typescript
// src/core/compressor.ts
export async function compress(stashDir: string, fileNames: string[]): Promise<void> {
  // Creates stash.tar.gz, then removes individual files
}

export async function decompress(stashDir: string, destDir: string): Promise<void> {
  // Extracts stash.tar.gz to destination
}
```

Compression is integrated into `Stasher.save()` and `Stasher.restore()` — the command layer doesn't need to know about compression details.

### Metadata

```json
{
  "compressed": true,
  "files": [
    { "name": "README.md", "size": 1024, "hash": "sha256:a1b2c3d4e5f6" }
  ]
}
```

The `files` array always lists the original files (not `stash.tar.gz`), so listing and searching work regardless of compression state.

## Consequences

### Positive

- **User choice** — small stashes stay readable in git; large stashes can be compressed
- **Transparent restore** — the user doesn't need to know if a stash is compressed
- **Per-stash granularity** — not an all-or-nothing setting
- **Configurable default** — `defaults.compression` in `~/.pstashrc` sets the default for new stashes
- **Standard format** — tar.gz is universally understood

### Negative

- **Mixed state** — some stashes compressed, some not; slightly more complex code paths in `Stasher`
- **No retroactive compression** — existing uncompressed stashes can't be compressed in-place (would need a `pstash compact` command)
- **Archive overhead** — for very small stashes (few KB), tar.gz might be larger than individual files
- **Temp directory on partial restore** — compressed + `--files` requires extracting everything to temp, then filtering (minor performance cost)

### Alternatives Considered

- **Always compress** — rejected; loses human readability and git diff capability
- **Never compress** — rejected; wastes space for binary or large stashes
- **ZIP format** — rejected; tar.gz is more natural in Unix ecosystems, and the `tar` npm package is well-maintained
- **Git LFS** — rejected; adds complexity, requires server-side LFS support, overkill for typical stash sizes
