/**
 * @module config/templates
 *
 * Default config templates and seed files for fresh pstash installs.
 *
 * Provides:
 * - {@link createDefaultConfig} — builds a {@link GlobalConfig} from defaults
 * - {@link DATA_REPO_README} — initial README for the data repo
 * - {@link DATA_REPO_GITIGNORE} — initial `.gitignore` for the data repo
 */

import type { GlobalConfig } from "../schemas.js"

/**
 * Creates a default GlobalConfig for new pstash installations.
 */
export function createDefaultConfig(remote: string, localPath = "~/.pstash"): GlobalConfig {
  return {
    version: "1.0.0",
    remote,
    localPath,
    autoSync: true,
    projects: {},
    defaults: {
      keepOnPop: false,
      compression: false,
      removeAfterSave: false,
      maxFileSizeMb: 50,
    },
  }
}

/**
 * README template for the data repo (my-personal-stash).
 */
export const DATA_REPO_README = `# My Personal Stash

> Managed by [pstash](https://github.com/the-coded/pstash-cli) — Git-backed personal file stash.

## Structure

\`\`\`
my-personal-stash/
├── <project-name>/
│   ├── .project.json         # Project metadata
│   └── YYYY-MM-DD_HH-mm_XXXX/  # Stash entries
│       ├── .stash.json       # Stash metadata
│       └── <files...>
\`\`\`

## Usage

This repo is managed automatically by \`pstash\`. Do not edit manually.

\`\`\`bash
pstash save "message" *.md    # Save files
pstash list                   # List stashes
pstash pop 0                  # Restore latest
pstash sync                   # Sync with remote
\`\`\`
`

/**
 * .gitignore template for the data repo.
 */
export const DATA_REPO_GITIGNORE = `.DS_Store
Thumbs.db
*.log
.env
.env.*
!.env.example

# Build and dependency output — regenerable, and it bloats every clone
node_modules/
dist/
build/
.venv/
__pycache__/
var/

# Heavy binaries: the data repo is pushed to git, and GitHub rejects
# files over 100 MB outright
*.mp4
*.mov
*.mkv
*.zip
*.db
`
