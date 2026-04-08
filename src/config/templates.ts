/**
 * src/config/templates.ts
 *
 * Default config templates for new installations.
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
    },
  }
}

/**
 * README template for the data repo (my-personal-stash).
 */
export const DATA_REPO_README = `# My Personal Stash

> Managed by [pstash](https://github.com/gabemule/personal-stash-cli) — Git-backed personal file stash.

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
`
