# pstash

**Git-backed personal file stash — persistent, project-categorized, multi-machine.**

<p align="center">
  <img src="./assets/pstash.png" alt="pstash — Git-backed Personal File Stash" width="800" />
</p>

Like `git stash` but for _any_ file, on _any_ project, synced to a private remote.

```
pstash save "planning notes" *.md
pstash list
pstash pop
```

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
  - [Command Summary](#command-summary)
  - [init](#init)
  - [save](#save)
  - [update](#update)
  - [list](#list)
  - [pop](#pop)
  - [apply](#apply)
  - [sync](#sync)
  - [show](#show)
  - [drop](#drop)
  - [status](#status)
  - [clean](#clean)
  - [diff](#diff)
  - [config](#config)
- [Configuration](#configuration)
- [Stash ID Format](#stash-id-format)
- [Data Repo Structure](#data-repo-structure)
- [Requirements](#requirements)
- [License](#license)

---

## Overview

`pstash` solves a common problem: you have files (notes, drafts, WIP configs, snippets) that don't belong in the project's git history, but you want them:

- **Persistent** — not lost after a branch switch or system reset
- **Organized** — grouped by project, tagged, searchable
- **Multi-machine** — synced via a private git repo

### How it works

1. You have a private **data repo** (e.g. `my-personal-stash` on GitHub)
2. `pstash init` clones it to `~/.pstash` and creates `~/.pstashrc`
3. `pstash save` copies your files into `~/.pstash/<project>/<stash-id>/`
4. A `.stash.json` metadata file is written alongside the files
5. Changes are committed and (optionally) pushed to remote
6. `pstash pop` or `pstash apply` restores files back to your project

---

## Architecture

```
personal-stash-cli/     ← this package (CLI code)
    src/
      cli.ts            ← Commander.js setup + command registration
      commands/         ← one file per command
      core/
        stasher.ts      ← save() / restore() / delete() / list()
        indexer.ts      ← manages .project.json
        detector.ts     ← project name detection (git remote / dirname)
        git.ts          ← simple-git wrapper
        compressor.ts   ← tar.gz compress/decompress
      config/
        loader.ts       ← ~/.pstashrc read/write/validate
      schemas.ts        ← Zod SSoT for all types
      utils/            ← fs, format, time, validation, prompts

~/.pstashrc             ← global config (JSON)
~/.pstash/              ← local clone of your data repo
    <project>/
      .project.json     ← project index (count, size, aliases)
      <stash-id>/
        .stash.json     ← stash metadata
        <your-files>    ← stashed files (or stash.tar.gz)
```

**Two-repo design**: The CLI code (`pstash` npm package) is separate from the data repo (`my-personal-stash`). The data repo is yours — private, versioned by git, never published to npm.

---

## Installation

```bash
npm install -g pstash
```

> **Requirements**: Node 20+, Git

---

## Quick Start

### 1. Create a private data repo

Create a new empty private repo on GitHub/GitLab (e.g. `my-personal-stash`).

### 2. Initialize pstash

```bash
pstash init --remote https://github.com/you/my-personal-stash.git
```

This clones the repo to `~/.pstash` and creates `~/.pstashrc`.

### 3. Stash some files

```bash
# Fully interactive — prompts for a message, then a checkbox picker of
# unstaged/untracked files (with an "➕ Add custom glob pattern..." entry)
pstash save

# Stash all markdown files in current directory
pstash save "planning notes" *.md

# Stash with tags
pstash save -t docs -t wip "API design draft" docs/api.md

# Stash and remove source files
pstash save --rm "temp notes" scratch.md
```

### 4. List your stashes

```bash
pstash list
pstash list --all        # all projects
pstash list -t docs      # filter by tag
```

### 5. Restore stashes

```bash
pstash pop              # interactive selector
pstash pop 0            # newest stash
pstash apply 1          # restore without deleting
```

---

## Commands

### Command Summary

| Command             | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| [`init`](#init)     | Initialize pstash — clone data repo and create `~/.pstashrc`          |
| [`save`](#save)     | Stash files with a message, commit and sync                           |
| [`update`](#update) | Overwrite files of an existing stash (keeps the stash ID)             |
| [`list`](#list)     | List stashes for the current project (or all projects)                |
| [`pop`](#pop)       | Restore stash files to disk and **delete** the stash                  |
| [`apply`](#apply)   | Restore stash files **without deleting** the stash                    |
| [`sync`](#sync)     | Manually synchronize the stash repo (pull + push)                     |
| [`show`](#show)     | Show details or file contents of a stash entry                        |
| [`drop`](#drop)     | Delete one or more stash entries without restoring files              |
| [`status`](#status) | Show stash repository status and per-project summary                  |
| [`clean`](#clean)   | Bulk-remove old or filtered stash entries                             |
| [`diff`](#diff)     | Compare two stashes, or a stash against the current working directory |
| [`config`](#config) | View or set configuration values                                      |

---

### `init`

Initialize pstash — clone data repo and create `~/.pstashrc`.

```bash
pstash init [options]
```

| Option               | Description                                   |
| -------------------- | --------------------------------------------- |
| `-r, --remote <url>` | SSH or HTTPS URL of your data repo            |
| `-p, --path <path>`  | Local path to clone to (default: `~/.pstash`) |

**Examples:**

```bash
pstash init --remote git@github.com:you/my-stash.git
pstash init -r https://github.com/you/my-stash.git --path ~/stash
```

---

### `save`

Stash files with a message. Files are copied to the data repo, committed, and synced (pull before + push after) when `autoSync` is enabled.

```bash
pstash save [options] [message] [files...]
```

| Option                 | Description                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `-t, --tag <tag>`      | Add tag (repeatable: `-t docs -t wip`)                                                      |
| `-p, --project <name>` | Override auto-detected project name                                                         |
| `--no-sync`            | Skip auto pull+push for this operation                                                      |
| `--compress`           | Compress stash as tar.gz (overrides `defaults.compression`)                                 |
| `--rm`                 | Remove source files after saving                                                            |
| `--keep`               | Keep source files (overrides `defaults.removeAfterSave=true`)                               |
| `--unstaged`           | Auto-detect unstaged git files (modified + untracked) and stash them — ignores `[files...]` |

**Interactive mode:**

If `[message]` and `[files...]` are both omitted, `save` runs interactively:

1. Prompts for a message (`"What are you stashing?"`)
2. Shows a **checkbox picker** of your git unstaged + untracked files (space to toggle, enter to confirm)
3. Offers an `➕ Add custom glob pattern...` entry where you can type space-separated globs (e.g. `docs/*.md src/**/*.ts`)

Flags still work alongside the prompts — for example `pstash save --rm` runs interactively and then removes the source files. Passing `--unstaged` skips the picker and auto-detects the file list.

**Examples:**

```bash
pstash save                  # fully interactive (prompts message + file picker)
pstash save --rm             # interactive + remove source files afterwards
pstash save "planning notes" *.md
pstash save -t api -t draft "openapi spec" openapi.yaml
pstash save --rm "WIP code" src/experiment.ts
pstash save --compress "large archive" *.bin
pstash save --no-sync "quick local save" *.md
pstash save --unstaged "WIP before switch"
```

**Project detection order:**

1. `--project` flag
2. Git `origin` remote → extract repo name
3. Any other git remote
4. `basename(cwd)`

**Directory structure preservation:**

Files within the current directory are stored with their relative path intact. For example, `@todo/PROGRESS.md` is stored as `@todo/PROGRESS.md` inside the stash — not as a flat `PROGRESS.md`. When restored via `pop` or `apply`, subdirectories are recreated automatically. Files outside `cwd` (e.g. absolute paths) fall back to `basename` only.

---

### `update`

Overwrite the files of an existing stash. Keeps the stash's `id` and original `timestamp`, and sets `updatedAt` to now. The stash contents are **fully replaced** (not merged). Message and tags are preserved unless you pass `-m` / `-t`.

```bash
pstash update [options] [index] [files...]
```

| Option                 | Description                                                                  |
| ---------------------- | ---------------------------------------------------------------------------- |
| `-m, --message <msg>`  | Override the stash message (defaults to the existing one)                    |
| `-t, --tag <tag>`      | Replace tags (repeatable). If any tag is given, existing tags are replaced.  |
| `-p, --project <name>` | Override auto-detected project name                                          |
| `--no-sync`            | Skip auto pull+push for this operation                                       |
| `--compress`           | Compress stash as tar.gz (overrides `defaults.compression`)                  |
| `--unstaged`           | Auto-detect unstaged git files and stash them — ignores `[files...]`         |
| `--force`              | Skip confirmation prompt                                                     |
| `[index]`              | 0-based index. If omitted: interactive stash selector                        |
| `[files...]`           | Glob patterns for the new contents. If omitted: interactive file picker      |

**Examples:**

```bash
pstash update                         # interactive: pick stash + pick files
pstash update 0 *.md                  # update newest stash with current markdown files
pstash update 1 --unstaged            # update stash #1 with current unstaged files
pstash update 0 -m "revised notes" notes.md
pstash update 0 -t v2 -t docs *.md    # replaces tags with [v2, docs]
pstash update 0 --force *.md          # skip confirmation
```

---

### `list`

List stashes for the current project (or all projects).

```bash
pstash list [options]
```

| Option                 | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `-a, --all`            | Show stashes from all projects                  |
| `-p, --project <name>` | Filter by project name                          |
| `-t, --tag <tag>`      | Filter by tag                                   |
| `--since <timespec>`   | Show stashes after date (`7d`, `2w`, `1m`, ISO) |
| `--until <timespec>`   | Show stashes before date                        |
| `--preview`            | Show a preview of the first line of each file   |
| `--json`               | Output as JSON                                  |

**Examples:**

```bash
pstash list
pstash list --all --tag docs
pstash list --since 7d
pstash list --json | jq '.[0].id'
```

---

### `pop`

Restore stash files to the current directory and **delete** the stash. When `autoSync` is enabled, pulls before and pushes after.

```bash
pstash pop [options] [index]
```

| Option                  | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `-d, --dest <path>`     | Destination directory (default: current directory)           |
| `-f, --files <pattern>` | Partial restore — only files matching glob pattern           |
| `-p, --project <name>`  | Override auto-detected project name                          |
| `--force`               | Overwrite existing files                                     |
| `[index]`               | 0-based index (0 = newest). If omitted: interactive selector |

**Examples:**

```bash
pstash pop              # interactive selector
pstash pop 0            # newest stash
pstash pop 2 -d /tmp/restore
pstash pop 0 -f "*.md"   # partial restore
```

---

### `apply`

Restore stash files **without deleting** the stash (like `git stash apply`). When `autoSync` is enabled, pulls before restoring — but does **not** push (no changes to the stash repo).

```bash
pstash apply [options] [index]
```

| Option                  | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `-d, --dest <path>`     | Destination directory (default: current directory)           |
| `-f, --files <pattern>` | Partial restore — only files matching glob pattern           |
| `-p, --project <name>`  | Override auto-detected project name                          |
| `--force`               | Overwrite existing files                                     |
| `[index]`               | 0-based index (0 = newest). If omitted: interactive selector |

**Examples:**

```bash
pstash apply            # interactive selector
pstash apply 0          # apply newest stash
pstash apply 1 -d /tmp/restore
pstash apply 0 -f "*.ts"
```

---

### `sync`

Manually synchronize the stash repo with remote (pull + push). Useful when `autoSync=false` or to force a sync at any time.

```bash
pstash sync [options]
```

| Option   | Description           |
| -------- | --------------------- |
| `--pull` | Pull only (skip push) |
| `--push` | Push only (skip pull) |

**Examples:**

```bash
pstash sync          # pull + push
pstash sync --pull   # fetch updates from other machines
pstash sync --push   # upload local stashes
```

---

### `show`

Show details of a specific stash entry — metadata, file list, or file contents.

```bash
pstash show [options] [index]
```

| Option                 | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `-p, --project <name>` | Override auto-detected project name                           |
| `-f, --files`          | List stashed filenames only (no metadata)                     |
| `-c, --cat [pattern]`  | Print file contents to stdout (optional glob to filter files) |
| `--json`               | Output metadata as JSON                                       |
| `[index]`              | 0-based index. If omitted: interactive selector               |

**Examples:**

```bash
pstash show             # interactive selector
pstash show 0           # newest stash
pstash show 0 -f        # list filenames only
pstash show 0 -c        # print all file contents
pstash show 0 -c "*.md" # print only markdown files
pstash show 0 --json    # machine-readable output
```

---

### `drop`

Delete a stash entry **without restoring** its files.

```bash
pstash drop [options] [index]
```

| Option                 | Description                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `-p, --project <name>` | Override auto-detected project name                                                                |
| `-t, --tag <tag>`      | Drop all stashes with this tag                                                                     |
| `-a, --all`            | Drop all stashes in the current project (requires confirmation)                                    |
| `--force`              | Skip confirmation prompt                                                                           |
| `--dry-run`            | Preview what would be deleted                                                                      |
| `[index]`              | 0-based index. If omitted: interactive **multi-select** picker (space to toggle, enter to confirm) |

**Examples:**

```bash
pstash drop                   # interactive multi-select (space toggles, enter confirms)
pstash drop 0                 # drop newest (with confirmation)
pstash drop 0 --force         # drop without asking
pstash drop -t wip            # drop all WIP stashes
pstash drop --all             # drop everything (double-confirm)
pstash drop --all --dry-run   # preview only
```

---

### `status`

Show stash repository status — remote, local info, and per-project summary.

```bash
pstash status [options]
```

| Option      | Description       |
| ----------- | ----------------- |
| `-a, --all` | Show all projects |
| `--json`    | Output as JSON    |

**Example output:**

```
Remote:        git@github.com:you/my-stash.git
Local path:    /Users/you/.pstash
Unpushed:      2 commits

PROJECT       STASHES  TOTAL SIZE  LAST UPDATED
my-project        3     268 KB     2 hours ago
other-proj        1      12 KB     3 days ago
```

---

### `clean`

Bulk-remove old or filtered stash entries. **Requires at least one filter** (safety guard).

```bash
pstash clean [options]
```

| Option                    | Description                                        |
| ------------------------- | -------------------------------------------------- |
| `--older-than <timespec>` | Delete stashes older than this (`30d`, `2w`, `1m`) |
| `--keep <n>`              | Keep only the N most recent stashes per project    |
| `-t, --tag <tag>`         | Delete only stashes with this tag                  |
| `-a, --all`               | Clean across all projects                          |
| `-p, --project <name>`    | Override auto-detected project name                |
| `--dry-run`               | Preview what would be deleted                      |
| `--force`                 | Skip confirmation prompt                           |

**Examples:**

```bash
pstash clean --older-than 30d
pstash clean --keep 5
pstash clean -t wip --dry-run
pstash clean --older-than 7d --force
```

---

### `diff`

Compare two stashes, or a stash against the current working directory. Built-in LCS-based diff — no external tools required.

```bash
pstash diff [options] [indexA] [indexB]
```

| Option                 | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `-p, --project <name>` | Override auto-detected project name                 |
| `--files <pattern>`    | Limit diff to files matching this glob pattern      |
| `--stat`               | Show only changed file names (no inline diff)       |
| `[indexA]`             | First stash index. If omitted: interactive selector |
| `[indexB]`             | Second stash index — omit to compare against cwd    |

**Interactive mode:**

If `[indexA]` is omitted, `diff` runs interactively:

1. Prompts you to pick stash **A** (the "before" side)
2. Prompts you to pick the comparison target — either the current working directory (cwd) or another stash (skipped when only one stash exists)

**Examples:**

```bash
pstash diff             # interactive: pick stash A, then cwd or another stash
pstash diff 0 1         # compare two stashes
pstash diff 0           # compare stash 0 with cwd
pstash diff 0 1 --files "*.ts"   # limit to TypeScript files
pstash diff 0 --stat    # summary only
```

---

### `config`

View or set configuration values using dot-notation keys.

```bash
pstash config [options] [key] [value]
```

| Option       | Description                                        |
| ------------ | -------------------------------------------------- |
| `-l, --list` | List all config values (default when no key given) |
| `--json`     | Output as JSON                                     |

**Examples:**

```bash
pstash config                          # list all config
pstash config --json                   # list as JSON
pstash config autoSync                 # get value
pstash config autoSync false           # set value
pstash config defaults.compression false
pstash config defaults.keepOnPop false
```

---

## Configuration

Config is stored at `~/.pstashrc` (JSON). Example:

```json
{
  "version": "1.0.0",
  "remote": "https://github.com/you/my-personal-stash.git",
  "localPath": "~/.pstash",
  "autoSync": true,
  "projects": {
    "scena": {
      "aliases": ["e2e-gen", "scena-cli"]
    }
  },
  "defaults": {
    "keepOnPop": false,
    "compression": false,
    "removeAfterSave": false
  }
}
```

### Config Keys

| Key                        | Type      | Default     | Description                                                             |
| -------------------------- | --------- | ----------- | ----------------------------------------------------------------------- |
| `remote`                   | `string`  | —           | URL of your data repo (required)                                        |
| `localPath`                | `string`  | `~/.pstash` | Local clone path                                                        |
| `autoSync`                 | `boolean` | `true`      | Auto pull before reads, pull+push after writes                          |
| `defaults.keepOnPop`       | `boolean` | `false`     | If `true`, `pop` keeps the stash (behaves like `apply`)                 |
| `defaults.compression`     | `boolean` | `false`     | Compress stashes as `tar.gz` (use `--compress` flag to opt-in per save) |
| `defaults.removeAfterSave` | `boolean` | `false`     | Delete source files after `save`                                        |

> **`autoSync`** is the master sync switch. When enabled, pstash automatically pulls the latest changes before read operations (`list`, `show`, `diff`, `status`, `apply`) and pulls + pushes around write operations (`save`, `pop`, `drop`, `clean`). Override per-command with `--no-sync`.

### Project Aliases

Map alternative names to a canonical project:

```json
{
  "projects": {
    "scena": {
      "aliases": ["e2e-gen", "scena-cli"]
    }
  }
}
```

When `pstash` detects your project as `e2e-gen` (from git remote), it automatically resolves to `scena` — so all stashes are stored under one project name.

---

## Stash ID Format

Each stash has a unique ID: `YYYY-MM-DD_HH-mm_XXXX`

- `YYYY-MM-DD_HH-mm` — timestamp (UTC)
- `XXXX` — 4-character nanoid suffix (collision prevention for multi-machine use)

Example: `2026-03-12_01-05_k7x2`

---

## Data Repo Structure

```
my-personal-stash/
  scena/
    .project.json                    ← project index
    2026-03-12_01-05_k7x2/
      .stash.json                    ← metadata
      stash.tar.gz                   ← compressed files (default)
    2026-03-10_14-30_p9qr/
      .stash.json
      README.md                      ← uncompressed files
      notes.md
  other-project/
    .project.json
    2026-02-28_09-15_mnop/
      .stash.json
      stash.tar.gz
```

### `.stash.json` format

```json
{
  "id": "2026-03-12_01-05_k7x2",
  "project": "scena",
  "timestamp": "2026-03-12T01:05:00.000Z",
  "message": "planning notes for v2",
  "tags": ["docs", "planning"],
  "branch": "main",
  "commit": "abc123def456",
  "user": "gab@macmini",
  "files": [{ "name": "README.md", "size": 1024, "hash": "sha256:a1b2c3d4e5f6" }],
  "totalSize": 1024,
  "compressed": true
}
```

---

## Requirements

- **Node.js** 20+
- **Git** (must be installed and in PATH)
- A private git repository for your stash data

---

## License

MIT — see [LICENSE](./LICENSE)
