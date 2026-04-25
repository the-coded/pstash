/**
 * @module utils/time
 *
 * Date/time helpers used by stash filtering and display:
 * parsing relative timespecs (`"7d"`, `"2w"`, `"1m"`) and
 * absolute ISO dates, comparing timestamps, and formatting
 * timestamps for the terminal.
 */

/**
 * Parses a timespec string to a Date object.
 *
 * Supports:
 * - "7d" → 7 days ago
 * - "2w" → 2 weeks ago
 * - "1m" → 1 month ago
 * - "2026-03-01" → specific date (ISO format)
 * - ISO datetime strings
 *
 * @returns Date object or null if invalid
 */
export function parseTimespec(spec: string): Date | null {
  const now = new Date()

  // Relative timespec: "7d", "2w", "1m", "30d"
  const relativeMatch = /^(\d+)([dwm])$/i.exec(spec)
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1] ?? "0", 10)
    const unit = relativeMatch[2]?.toLowerCase() ?? "d"

    const date = new Date(now)
    switch (unit) {
      case "d":
        date.setDate(date.getDate() - amount)
        break
      case "w":
        date.setDate(date.getDate() - amount * 7)
        break
      case "m":
        date.setMonth(date.getMonth() - amount)
        break
    }
    return date
  }

  // Absolute date: "2026-03-01"
  const absoluteMatch = /^\d{4}-\d{2}-\d{2}$/.exec(spec)
  if (absoluteMatch) {
    const date = new Date(spec + "T00:00:00.000Z")
    return isNaN(date.getTime()) ? null : date
  }

  // Full ISO datetime
  const date = new Date(spec)
  return isNaN(date.getTime()) ? null : date
}

/**
 * Checks if a timestamp string is after a given date.
 */
export function isAfter(timestamp: string, date: Date): boolean {
  return new Date(timestamp) >= date
}

/**
 * Checks if a timestamp string is before a given date.
 */
export function isBefore(timestamp: string, date: Date): boolean {
  return new Date(timestamp) <= date
}

/**
 * Returns a human-readable "time ago" string.
 * e.g. "2 hours ago", "3 days ago"
 */
export function timeAgo(timestamp: string): string {
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()

  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffMonths > 0) return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`
  if (diffWeeks > 0) return `${diffWeeks} week${diffWeeks > 1 ? "s" : ""} ago`
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
  if (diffMinutes > 0) return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`
  return "just now"
}

/**
 * Formats a timestamp for display.
 * e.g. "2026-03-12 01:05"
 */
export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day} ${hours}:${minutes}`
}
