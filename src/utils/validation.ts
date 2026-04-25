/**
 * @module utils/validation
 *
 * Zod validation helpers for safe I/O parsing.
 *
 * Wraps common patterns (parse JSON + validate, validate plain
 * objects, type-guard) and produces descriptive error messages
 * with the offending JSON paths.
 */

import { type z } from "zod"

/**
 * Safely parse JSON from a string.
 * Returns null on invalid JSON instead of throwing.
 */
export function safeParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/**
 * Parse JSON and validate with a Zod schema.
 * Returns parsed data or throws with a descriptive error.
 */
export function parseJsonWithSchema<T extends z.ZodTypeAny>(
  raw: string,
  schema: T,
  context?: string,
): z.infer<T> {
  const parsed = safeParseJson(raw)
  if (parsed === null) {
    throw new Error(`Invalid JSON${context ? ` in ${context}` : ""}`)
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map(i => `  - ${i.path.join(".")}: ${i.message}`).join("\n")
    throw new Error(`Validation failed${context ? ` for ${context}` : ""}:\n${issues}`)
  }

  return result.data
}

/**
 * Validate data with a Zod schema.
 * Returns parsed data or throws with a descriptive error.
 */
export function validateWithSchema<T extends z.ZodTypeAny>(
  data: unknown,
  schema: T,
  context?: string,
): z.infer<T> {
  const result = schema.safeParse(data)
  if (!result.success) {
    const issues = result.error.issues.map(i => `  - ${i.path.join(".")}: ${i.message}`).join("\n")
    throw new Error(`Validation failed${context ? ` for ${context}` : ""}:\n${issues}`)
  }

  return result.data
}

/**
 * Type guard using a Zod schema.
 */
export function isValid<T extends z.ZodTypeAny>(data: unknown, schema: T): data is z.infer<T> {
  return schema.safeParse(data).success
}
