/**
 * @module tests/utils/validation
 * Tests for Zod-based validation helper utilities.
 */

import { describe, it, expect } from "vitest"
import { z } from "zod"
import {
  safeParseJson,
  parseJsonWithSchema,
  validateWithSchema,
  isValid,
} from "../../src/utils/validation.js"

// ─── Test schema ─────────────────────────────────────────────────────────────

const UserSchema = z.object({
  name: z.string().min(1),
  age: z.number().nonnegative().int(),
})

// ─── safeParseJson ────────────────────────────────────────────────────────────

describe("safeParseJson", () => {
  it("returns parsed object for valid JSON object", () => {
    const result = safeParseJson('{"name": "Alice", "age": 30}')
    expect(result).toEqual({ name: "Alice", age: 30 })
  })

  it("returns parsed array for valid JSON array", () => {
    const result = safeParseJson("[1, 2, 3]")
    expect(result).toEqual([1, 2, 3])
  })

  it("returns parsed primitive for valid JSON primitive", () => {
    expect(safeParseJson("42")).toBe(42)
    expect(safeParseJson('"hello"')).toBe("hello")
    expect(safeParseJson("true")).toBe(true)
    expect(safeParseJson("null")).toBeNull()
  })

  it("returns null for invalid JSON", () => {
    expect(safeParseJson("not json")).toBeNull()
    expect(safeParseJson("")).toBeNull()
    expect(safeParseJson("{unclosed")).toBeNull()
    expect(safeParseJson("undefined")).toBeNull()
  })
})

// ─── parseJsonWithSchema ──────────────────────────────────────────────────────

describe("parseJsonWithSchema", () => {
  it("returns typed data for valid JSON matching the schema", () => {
    const result = parseJsonWithSchema('{"name": "Alice", "age": 30}', UserSchema)
    expect(result.name).toBe("Alice")
    expect(result.age).toBe(30)
  })

  it("throws with 'Invalid JSON' message on invalid JSON", () => {
    expect(() => parseJsonWithSchema("not json", UserSchema)).toThrow("Invalid JSON")
  })

  it("throws with 'Validation failed' on schema mismatch", () => {
    expect(() => parseJsonWithSchema('{"name": "", "age": 30}', UserSchema)).toThrow(
      "Validation failed",
    )
  })

  it("includes context in error message when provided", () => {
    expect(() => parseJsonWithSchema("not json", UserSchema, "user.json")).toThrow("in user.json")
  })

  it("includes context in validation error when provided", () => {
    expect(() => parseJsonWithSchema('{"name": "A", "age": -1}', UserSchema, "user.json")).toThrow(
      "for user.json",
    )
  })

  it("throws on negative age (schema constraint)", () => {
    expect(() => parseJsonWithSchema('{"name": "Alice", "age": -1}', UserSchema)).toThrow()
  })
})

// ─── validateWithSchema ──────────────────────────────────────────────────────

describe("validateWithSchema", () => {
  it("returns data for valid input", () => {
    const result = validateWithSchema({ name: "Bob", age: 25 }, UserSchema)
    expect(result.name).toBe("Bob")
    expect(result.age).toBe(25)
  })

  it("throws on invalid data", () => {
    expect(() => validateWithSchema({ name: 123 }, UserSchema)).toThrow("Validation failed")
  })

  it("throws on null input", () => {
    expect(() => validateWithSchema(null, UserSchema)).toThrow()
  })

  it("includes context in error message when provided", () => {
    expect(() => validateWithSchema({ name: 123 }, UserSchema, "my-context")).toThrow("my-context")
  })
})

// ─── isValid ─────────────────────────────────────────────────────────────────

describe("isValid", () => {
  it("returns true for valid data matching the schema", () => {
    expect(isValid({ name: "Alice", age: 30 }, UserSchema)).toBe(true)
  })

  it("returns false for data with wrong types", () => {
    expect(isValid({ name: 123, age: 30 }, UserSchema)).toBe(false)
  })

  it("returns false for null", () => {
    expect(isValid(null, UserSchema)).toBe(false)
  })

  it("returns false for an empty object", () => {
    expect(isValid({}, UserSchema)).toBe(false)
  })

  it("returns false for a string", () => {
    expect(isValid("string", UserSchema)).toBe(false)
  })

  it("returns false for negative age (constraint violation)", () => {
    expect(isValid({ name: "Alice", age: -1 }, UserSchema)).toBe(false)
  })
})
