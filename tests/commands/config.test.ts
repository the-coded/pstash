/**
 * @module tests/commands/config
 *
 * Tests for `pstash config` — list/get/set, dot-notation keys, type coercion,
 * and JSON output.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const loaderMocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn().mockResolvedValue(undefined),
  CONFIG_PATH: "/fake/.pstashrc",
}))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("../../src/config/loader.js", () => loaderMocks)

// ─── Imports ──────────────────────────────────────────────────────────────────

import { configCommand } from "../../src/commands/config.js"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  version: "1.0.0",
  remote: "git@github.com:user/stash.git",
  localPath: "~/.pstash",
  autoSync: true,
  projects: {},
  defaults: { keepOnPop: false, compression: false, removeAfterSave: false },
  ...overrides,
})

let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
  loaderMocks.loadConfig.mockResolvedValue(makeConfig())
})

// ─── List ────────────────────────────────────────────────────────────────────

describe("configCommand — list", () => {
  it("prints all values when no key is given", async () => {
    await configCommand(undefined, undefined, {})

    const printed = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n")
    expect(printed).toContain("remote")
    expect(printed).toContain("autoSync")
    expect(printed).toContain("defaults.compression")
  })

  it("--json prints the entire config as JSON", async () => {
    await configCommand(undefined, undefined, { json: true })

    const lastCall = logSpy.mock.calls.at(-1) as unknown[] | undefined
    const parsed = JSON.parse(String(lastCall?.[0])) as { remote: string }
    expect(parsed.remote).toBe("git@github.com:user/stash.git")
  })
})

// ─── Get ─────────────────────────────────────────────────────────────────────

describe("configCommand — get", () => {
  it("prints a top-level value", async () => {
    await configCommand("remote", undefined, {})

    expect(logSpy).toHaveBeenCalledWith("git@github.com:user/stash.git")
  })

  it("prints a nested value via dot notation", async () => {
    await configCommand("defaults.compression", undefined, {})

    expect(logSpy).toHaveBeenCalledWith("false")
  })

  it("--json prints the value as JSON", async () => {
    await configCommand("autoSync", undefined, { json: true })

    expect(logSpy).toHaveBeenCalledWith("true")
  })

  it("throws when the key is unknown", async () => {
    await expect(configCommand("nope", undefined, {})).rejects.toThrow("Config key not found")
  })
})

// ─── Set ─────────────────────────────────────────────────────────────────────

describe("configCommand — set", () => {
  it("sets a boolean value at a nested path", async () => {
    await configCommand("defaults.compression", "true", {})

    expect(loaderMocks.saveConfig).toHaveBeenCalledOnce()
    const updated = loaderMocks.saveConfig.mock.calls[0]?.[0] as ReturnType<typeof makeConfig>
    expect(updated.defaults.compression).toBe(true)
  })

  it("sets a string value at the top level", async () => {
    await configCommand("remote", "git@github.com:user/new.git", {})

    expect(loaderMocks.saveConfig).toHaveBeenCalledOnce()
    const updated = loaderMocks.saveConfig.mock.calls[0]?.[0] as ReturnType<typeof makeConfig>
    expect(updated.remote).toBe("git@github.com:user/new.git")
  })

  it("does not mutate the original config object (deep clones)", async () => {
    const original = makeConfig()
    loaderMocks.loadConfig.mockResolvedValue(original)

    await configCommand("defaults.compression", "true", {})

    expect(original.defaults.compression).toBe(false)
  })

  it("throws when the key is not in the settable list", async () => {
    await expect(configCommand("version", "9.9.9", {})).rejects.toThrow("Unknown config key")
    expect(loaderMocks.saveConfig).not.toHaveBeenCalled()
  })

  it("throws when a boolean key receives a non-boolean string", async () => {
    await expect(configCommand("autoSync", "maybe", {})).rejects.toThrow(
      `Invalid value for "autoSync"`,
    )
    expect(loaderMocks.saveConfig).not.toHaveBeenCalled()
  })
})
