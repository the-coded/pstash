/**
 * @module tests/utils/time
 * Tests for time parsing and formatting utilities.
 */

import { describe, it, expect } from "vitest"
import { parseTimespec, isAfter, isBefore, timeAgo, formatTimestamp } from "../../src/utils/time.js"

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Asserts the result is a non-null Date and returns it.
 * Used to avoid non-null assertions when parsing timespecs.
 */
function expectDate(value: Date | null): Date {
  if (!value) throw new Error("expected Date, got null")
  return value
}

// ─── parseTimespec ────────────────────────────────────────────────────────────

describe("parseTimespec", () => {
  it('parses "7d" as approximately 7 days ago', () => {
    const now = new Date()
    const result = expectDate(parseTimespec("7d"))
    const diffDays = (now.getTime() - result.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeCloseTo(7, 0)
  })

  it('parses "2w" as approximately 14 days ago', () => {
    const now = new Date()
    const result = expectDate(parseTimespec("2w"))
    const diffDays = (now.getTime() - result.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeCloseTo(14, 0)
  })

  it('parses "1m" as approximately 1 month ago', () => {
    const now = new Date()
    const result = expectDate(parseTimespec("1m"))
    const diffDays = (now.getTime() - result.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThanOrEqual(28)
    expect(diffDays).toBeLessThanOrEqual(32)
  })

  it('parses "30d" as approximately 30 days ago', () => {
    const now = new Date()
    const result = expectDate(parseTimespec("30d"))
    const diffDays = (now.getTime() - result.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeCloseTo(30, 0)
  })

  it('parses "2026-03-01" as a specific UTC date', () => {
    const result = expectDate(parseTimespec("2026-03-01"))
    expect(result.getUTCFullYear()).toBe(2026)
    expect(result.getUTCMonth()).toBe(2) // March = 2 (0-indexed)
    expect(result.getUTCDate()).toBe(1)
  })

  it("parses a full ISO datetime string", () => {
    const iso = "2026-03-12T01:05:00.000Z"
    const result = expectDate(parseTimespec(iso))
    expect(result.getTime()).toBe(new Date(iso).getTime())
  })

  it('returns null for "invalid"', () => {
    expect(parseTimespec("invalid")).toBeNull()
  })

  it('returns null for "99x" (unknown unit)', () => {
    expect(parseTimespec("99x")).toBeNull()
  })

  it('returns null for "not-a-date"', () => {
    expect(parseTimespec("not-a-date")).toBeNull()
  })

  it("is case-insensitive for unit suffix", () => {
    const lower = expectDate(parseTimespec("7d"))
    const upper = expectDate(parseTimespec("7D"))
    // Should be within 1 second of each other
    expect(Math.abs(lower.getTime() - upper.getTime())).toBeLessThan(1000)
  })
})

// ─── isAfter ─────────────────────────────────────────────────────────────────

describe("isAfter", () => {
  it("returns true when timestamp is after the cutoff date", () => {
    const cutoff = new Date("2026-01-01T00:00:00.000Z")
    expect(isAfter("2026-06-01T00:00:00.000Z", cutoff)).toBe(true)
  })

  it("returns false when timestamp is before the cutoff date", () => {
    const cutoff = new Date("2026-06-01T00:00:00.000Z")
    expect(isAfter("2026-01-01T00:00:00.000Z", cutoff)).toBe(false)
  })

  it("returns true when timestamp equals the cutoff date (inclusive)", () => {
    const date = new Date("2026-03-01T00:00:00.000Z")
    expect(isAfter("2026-03-01T00:00:00.000Z", date)).toBe(true)
  })
})

// ─── isBefore ────────────────────────────────────────────────────────────────

describe("isBefore", () => {
  it("returns true when timestamp is before the cutoff date", () => {
    const cutoff = new Date("2026-06-01T00:00:00.000Z")
    expect(isBefore("2026-01-01T00:00:00.000Z", cutoff)).toBe(true)
  })

  it("returns false when timestamp is after the cutoff date", () => {
    const cutoff = new Date("2026-01-01T00:00:00.000Z")
    expect(isBefore("2026-06-01T00:00:00.000Z", cutoff)).toBe(false)
  })

  it("returns true when timestamp equals the cutoff date (inclusive)", () => {
    const date = new Date("2026-03-01T00:00:00.000Z")
    expect(isBefore("2026-03-01T00:00:00.000Z", date)).toBe(true)
  })
})

// ─── timeAgo ─────────────────────────────────────────────────────────────────

describe("timeAgo", () => {
  it('returns "just now" for timestamps within the last minute', () => {
    const ts = new Date(Date.now() - 30 * 1000).toISOString() // 30 seconds ago
    expect(timeAgo(ts)).toBe("just now")
  })

  it('returns "X minutes ago" for timestamps a few minutes ago', () => {
    const ts = new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 minutes ago
    expect(timeAgo(ts)).toBe("5 minutes ago")
  })

  it('returns "1 minute ago" for singular', () => {
    const ts = new Date(Date.now() - 1 * 60 * 1000).toISOString()
    expect(timeAgo(ts)).toBe("1 minute ago")
  })

  it('returns "X hours ago" for timestamps hours ago', () => {
    const ts = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() // 3 hours ago
    expect(timeAgo(ts)).toBe("3 hours ago")
  })

  it('returns "X days ago" for timestamps multiple days ago', () => {
    const ts = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
    expect(timeAgo(ts)).toBe("2 days ago")
  })

  it('returns "X weeks ago" for timestamps multiple weeks ago', () => {
    const ts = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() // 2 weeks ago
    expect(timeAgo(ts)).toBe("2 weeks ago")
  })

  it('returns "X months ago" for timestamps multiple months ago', () => {
    const ts = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days ago
    expect(timeAgo(ts)).toBe("2 months ago")
  })
})

// ─── formatTimestamp ──────────────────────────────────────────────────────────

describe("formatTimestamp", () => {
  it("formats a timestamp in YYYY-MM-DD HH:mm format", () => {
    const result = formatTimestamp("2026-03-12T01:05:00.000Z")
    // Format must match YYYY-MM-DD HH:mm regardless of timezone
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it("returns consistent format for any valid ISO string", () => {
    const result = formatTimestamp("2026-12-31T23:59:00.000Z")
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })
})
