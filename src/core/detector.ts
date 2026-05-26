/**
 * @module core/detector
 *
 * Project detection — identifies the current project by git remote
 * or directory name, and resolves aliases declared in the global config.
 *
 * Detection order:
 * 1. Parse the `origin` git remote URL → repo name.
 * 2. Fallback to any other configured git remote → repo name.
 * 3. Fallback to the basename of `process.cwd()`.
 *
 * @example
 * ```ts
 * const detector = new ProjectDetector()
 * const project = await detector.detectAndResolve(config)
 * // → "scena" (resolved through aliases if needed)
 * ```
 */

import { basename } from "node:path"
import { simpleGit } from "simple-git"
import type { GlobalConfig } from "../schemas.js"

/**
 * Detects and resolves the current project name based on git remotes,
 * directory name, and config-declared aliases.
 */
export class ProjectDetector {
  /**
   * Detects the current project name based on git remote or directory name.
   *
   * Detection order:
   * 1. Git `origin` remote → extract repo name
   * 2. Any other git remote → extract repo name
   * 3. Fallback → basename of `process.cwd()`
   *
   * @returns Detected project name (raw, before alias resolution)
   */
  async detect(): Promise<string> {
    try {
      const git = simpleGit(process.cwd())
      const isRepo = await git.checkIsRepo()
      if (!isRepo) return basename(process.cwd())

      const remotes = await git.getRemotes(true)
      const origin = remotes.find(r => r.name === "origin")

      if (origin?.refs.fetch) {
        // Extract repo name from remote URL:
        // git@github.com:the-coded/scena.git → scena
        // https://github.com/the-coded/scena.git → scena
        const match = /\/([^/]+?)(\.git)?$/.exec(origin.refs.fetch)
        if (match?.[1]) return match[1]
      }

      // Try upstream or any other remote
      for (const remote of remotes) {
        if (remote.refs.fetch) {
          const match = /\/([^/]+?)(\.git)?$/.exec(remote.refs.fetch)
          if (match?.[1]) return match[1]
        }
      }
    } catch {
      // Not a git repo or no remotes — use directory name
    }

    return basename(process.cwd())
  }

  /**
   * Gets the current git branch name.
   *
   * @returns Current branch name, or `undefined` if not in a git repo or on error
   */
  async getCurrentBranch(): Promise<string | undefined> {
    try {
      const git = simpleGit(process.cwd())
      const isRepo = await git.checkIsRepo()
      if (!isRepo) return undefined

      const branch = await git.revparse(["--abbrev-ref", "HEAD"])
      return branch.trim()
    } catch {
      return undefined
    }
  }

  /**
   * Gets the current git commit hash (full SHA).
   *
   * @returns Current commit hash, or `undefined` if not in a git repo or on error
   */
  async getCurrentCommit(): Promise<string | undefined> {
    try {
      const git = simpleGit(process.cwd())
      const isRepo = await git.checkIsRepo()
      if (!isRepo) return undefined

      const commit = await git.revparse(["HEAD"])
      return commit.trim()
    } catch {
      return undefined
    }
  }

  /**
   * Resolves a project name by checking aliases in the global config.
   * e.g. `"e2e-gen"` → `"scena"` if `scena.aliases` includes `"e2e-gen"`.
   *
   * @param name - Raw project name to resolve
   * @param config - Global config containing project aliases
   * @returns Canonical project name, or `name` unchanged if no alias matches
   */
  resolveAlias(name: string, config: GlobalConfig): string {
    for (const [projectName, meta] of Object.entries(config.projects)) {
      if (meta.aliases.includes(name)) return projectName
    }
    return name
  }

  /**
   * Detects the current project and resolves it against config aliases.
   *
   * @param config - Global config containing project aliases
   * @returns Canonical project name (alias-resolved)
   */
  async detectAndResolve(config: GlobalConfig): Promise<string> {
    const detected = await this.detect()
    return this.resolveAlias(detected, config)
  }
}
