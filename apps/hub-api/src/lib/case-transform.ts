/**
 * Case transformation utilities for converting between camelCase (JS)
 * and snake_case (PostgreSQL) naming conventions.
 *
 * Architecture doc: "Apply snake_case mapping when writing to Supabase,
 * but use camelCase in the TypeScript UI logic."
 *
 * These utilities are applied at the Supabase query boundary (via db helpers),
 * NOT in tRPC middleware, so TypeScript types stay honest through the procedure body.
 */

/**
 * Converts a camelCase string to snake_case.
 * Handles consecutive uppercase (acronyms) correctly:
 *   "firstName" → "first_name"
 *   "SOAPNote"  → "soap_note"
 *   "patientID" → "patient_id"
 */
export function camelToSnake(str: string): string {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
}

/**
 * Converts a snake_case string to camelCase.
 * Examples: "first_name" → "firstName", "created_at" → "createdAt"
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z\d])/gi, (_, letter: string) => letter.toUpperCase())
}

/**
 * Recursively transforms all keys in an object from camelCase to snake_case.
 * Used before writing to Supabase.
 */
export function toSnakeCase<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(toSnakeCase) as T
  if (typeof obj !== 'object') return obj

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[camelToSnake(key)] = toSnakeCase(value)
  }
  return result as T
}

/**
 * Recursively transforms all keys in an object from snake_case to camelCase.
 * Used after reading from Supabase.
 */
export function toCamelCase<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(toCamelCase) as T
  if (typeof obj !== 'object') return obj

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[snakeToCamel(key)] = toCamelCase(value)
  }
  return result as T
}
