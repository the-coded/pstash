/**
 * @module tests/config/loader
 * Tests for the global config loader (~/.pstashrc).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock node:fs/promises before importing loader
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
}))

import { readFile, writeFile, access } from "node:fs/promises"
import { resolveLocalPath, configExists, loadConfig, saveConfig } from "../../src/config/loader.js"
import { homedir } from "node:os"

const validConfig = {
  version: "1.0.0",
  remote: "https://github.com/user/my-personal-stash.git",
  localPath: "~/.pstash",
  autoSync: true,
  projects: {},
  defaults: {
    keepOnPop: false,
    compression: true,
    removeAfterSave: false,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── resolveLocalPath ─────────────────────────────────────────────────────────

describe("resolveLocalPath", () => {
  it('expands "~/.pstash" to an absolute path', () => {
    const result = resolveLocalPath("~/.pstash")
    expect(result).not.toContain("~")
    expect(result).toContain(homedir())
    expect(result.endsWith(".pstash")).toBe(true)
  })

  it('expands "~/stash" to home + "stash"', () => {
    const result = resolveLocalPath("~/stash")
    expect(result).toBe(`${homedir()}/stash`)
  })

  it("returns absolute paths as-is (resolved)", () => {
    const result = resolveLocalPath("/absolute/path")
    expect(result).toBe("/absolute/path")
  })

  it("resolves relative paths to absolute", () => {
    const result = resolveLocalPath("relative/path")
    expect(result).not.toContain("~")
    expect(result.startsWith("/")).toBe(true)
  })
})

// ─── configExists ─────────────────────────────────────────────────────────────

describe("configExists", () => {
  it("returns true when the config file is accessible", async () => {
    vi.mocked(access).mockResolvedValueOnce(undefined)
    const result = await configExists()
    expect(result).toBe(true)
    expect(access).toHaveBeenCalledOnce()
  })

  it("returns false when the config file does not exist (ENOENT)", async () => {
    vi.mocked(access).mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
    const result = await configExists()
    expect(result).toBe(false)
  })
})

// ─── loadConfig ──────────────────────────────────────────────────────────────

describe("loadConfig", () => {
  it("loads and validates a valid config object", async () => {
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(validConfig))
    const config = await loadConfig()
    expect(config.remote).toBe(validConfig.remote)
    expect(config.defaults.compression).toBe(true)
  })

  it("applies Zod defaults for missing optional fields", async () => {
    const minimal = {
      version: "1.0.0",
      remote: "https://github.com/user/repo.git",
      defaults: {
        keepOnPop: false,
        compression: true,
        removeAfterSave: false,
      },
    }
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(minimal))
    const config = await loadConfig()
    // localPath should default to "~/.pstash"
    expect(config.localPath).toBe("~/.pstash")
    expect(config.projects).toEqual({})
  })

  it("throws with 'Config file not found' when file is missing", async () => {
    vi.mocked(readFile).mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
    await expect(loadConfig()).rejects.toThrow("Config file not found")
  })

  it("throws with 'not valid JSON' when file contains bad JSON", async () => {
    vi.mocked(readFile).mockResolvedValueOnce("{ not valid json }")
    await expect(loadConfig()).rejects.toThrow("not valid JSON")
  })

  it("throws with 'Config validation failed' on schema mismatch", async () => {
    // remote is required (min length 1) — missing it should fail validation
    const invalid = { version: "1.0.0" }
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(invalid))
    await expect(loadConfig()).rejects.toThrow("Config validation failed")
  })
})

// ─── saveConfig ──────────────────────────────────────────────────────────────

describe("saveConfig", () => {
  it("writes validated config as formatted JSON", async () => {
    vi.mocked(writeFile).mockResolvedValueOnce(undefined)
    await saveConfig(validConfig as Parameters<typeof saveConfig>[0])
    expect(writeFile).toHaveBeenCalledOnce()
    const [, content] = vi.mocked(writeFile).mock.calls[0]!
    const parsed = JSON.parse(content as string)
    expect(parsed.remote).toBe(validConfig.remote)
    expect(parsed.version).toBe(validConfig.version)
  })

  it("ends the written JSON with a newline", async () => {
    vi.mocked(writeFile).mockResolvedValueOnce(undefined)
    await saveConfig(validConfig as Parameters<typeof saveConfig>[0])
    const [, content] = vi.mocked(writeFile).mock.calls[0]!
    expect((content as string).endsWith("\n")).toBe(true)
  })
})
