/**
 * @module core/detector
 *
 * Project detection — identifies the current project by git remote
 * or directory name, and resolves aliases declared in the global config.
 *
 * Detection order:
 * 1. Parse the `origin` git remote URL → repo name.
 * 2. Fallback to the basename of `process.cwd()`.
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

export class ProjectDetector {
  /**
   * Detects the current project name based on git remote or directory name.
   *
   * Detection order:
   * 1. Git origin remote → extract repo name
   * 2. Fallback → basename of cwd
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
        // git@github.com:gabemule/scena.git → scena
        // https://github.com/gabemule/scena.git → scena
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
   * Gets the current git branch name. Returns undefined if not in a git repo.
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
   * Gets the current git commit hash. Returns undefined if not in a git repo.
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
   * e.g. "e2e-gen" → "scena" (if configured as alias)
   */
  resolveAlias(name: string, config: GlobalConfig): string {
    for (const [projectName, meta] of Object.entries(config.projects)) {
      if (meta.aliases.includes(name)) return projectName
    }
    return name
  }

  /**
   * Resolves detected project name against config aliases.
   */
  async detectAndResolve(config: GlobalConfig): Promise<string> {
    const detected = await this.detect()
    return this.resolveAlias(detected, config)
  }
}
