/**
 * @module core/git
 *
 * Cross-platform git operations wrapper around `simple-git`.
 *
 * All operations target a single repo path (the local stash data repo)
 * and avoid `execSync` so they work the same on macOS, Linux and Windows.
 *
 * @example
 * ```ts
 * const git = new GitManager(repoPath)
 * await git.commitAll("save: notes")
 * await git.push()
 * ```
 */

import { join } from "node:path"
import { writeFile } from "node:fs/promises"
import { simpleGit } from "simple-git"
import { ensureDir } from "../utils/fs.js"

export class GitManager {
  private repoPath: string

  constructor(repoPath: string) {
    this.repoPath = repoPath
  }

  /**
   * Clones a remote repository to the local path.
   * Used during `pstash init`.
   */
  async clone(remoteUrl: string, targetPath: string): Promise<void> {
    const git = simpleGit()
    await git.clone(remoteUrl, targetPath)
  }

  /**
   * Initializes a new empty git repo at the local path.
   * Used when the remote repo is empty (no initial commit).
   */
  async initNewRepo(repoPath: string, remoteUrl: string): Promise<void> {
    await ensureDir(repoPath)
    const git = simpleGit(repoPath)
    await git.init()
    await git.addRemote("origin", remoteUrl)
    await this.configureLineEndings(repoPath)

    // Create initial README
    await writeFile(
      join(repoPath, "README.md"),
      "# My Personal Stash\n\nManaged by pstash.\n",
      "utf-8",
    )
    await git.add("README.md")
    await git.commit("init: initial commit")
  }

  /**
   * Configures consistent line endings for the stash repo.
   * Prevents cross-platform issues between macOS, Linux, and Windows.
   * Uses simple-git instead of .gitattributes to avoid committing config.
   */
  async configureLineEndings(repoPath: string): Promise<void> {
    const git = simpleGit(repoPath)
    await git.addConfig("core.autocrlf", "false")
    await git.addConfig("core.eol", "lf")
  }

  /**
   * Stages all changes and creates a commit.
   */
  async commitAll(message: string): Promise<void> {
    const git = simpleGit(this.repoPath)
    await git.add("-A")
    const status = await git.status()
    if (status.files.length === 0) return // Nothing to commit
    await git.commit(message)
  }

  /**
   * Pushes to the remote origin.
   */
  async push(): Promise<void> {
    const git = simpleGit(this.repoPath)
    try {
      await git.push("origin", "HEAD")
    } catch {
      // Try pushing with --set-upstream for first push
      await git.push(["--set-upstream", "origin", "HEAD"])
    }
  }

  /**
   * Pulls from the remote origin.
   */
  async pull(): Promise<void> {
    const git = simpleGit(this.repoPath)
    await git.pull("origin", undefined, { "--rebase": null })
  }

  /**
   * Pulls then pushes (full sync).
   */
  async sync(): Promise<void> {
    await this.pull()
    await this.push()
  }

  /**
   * Returns the number of commits not yet pushed to remote.
   */
  async getUnpushedCount(): Promise<number> {
    try {
      const git = simpleGit(this.repoPath)
      const log = await git.log(["origin/HEAD..HEAD"])
      return log.total
    } catch {
      return 0
    }
  }

  /**
   * Returns the timestamp of the last remote sync (last fetch).
   */
  async getLastSyncTime(): Promise<string | null> {
    try {
      const git = simpleGit(this.repoPath)
      const log = await git.log(["origin/HEAD", "-1"])
      return log.latest?.date ?? null
    } catch {
      return null
    }
  }

  /**
   * Removes a directory from the git index and filesystem, then commits.
   */
  async removeAndCommit(relPath: string, message: string): Promise<void> {
    const git = simpleGit(this.repoPath)
    await git.rm(["-r", relPath])
    await git.commit(message)
  }
}
