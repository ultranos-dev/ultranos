/**
 * Brand-name merge — the single safe path for combining brand names from
 * multiple sources (DrugBank seed, RxNav, regional registries) into the
 * `drug_catalog.brand_names` array.
 *
 * Safety contract (this is healthcare reference data):
 *  - Never drops an existing brand. Existing brands always come first, in order.
 *  - Case-insensitive dedup so "Augmentin" / "AUGMENTIN" don't both appear, but
 *    the first-seen spelling is preserved (we trust the seed spelling).
 *  - Trims whitespace and discards empty entries.
 *  - Pure: never mutates its inputs.
 */

/** Merge `incoming` brand names into `existing`, deduping case-insensitively. */
export function mergeBrandNames(existing: string[], incoming: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of [...existing, ...incoming]) {
    const name = (raw ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/** Brands present in `after` but not in `before` (case-insensitive). */
export function addedBrands(before: string[], after: string[]): string[] {
  const had = new Set(before.map((b) => b.trim().toLowerCase()))
  return after.filter((b) => !had.has(b.trim().toLowerCase()))
}

/**
 * Build the additive provenance patch for newly-added brands. Maps each new
 * brand (lowercased key) to its `source` tag, without overwriting any source
 * already recorded for a brand.
 */
export function brandProvenancePatch(
  existingSources: Record<string, string>,
  added: string[],
  source: string,
): Record<string, string> {
  const next = { ...existingSources }
  for (const b of added) {
    const key = b.trim().toLowerCase()
    if (!key || next[key]) continue
    next[key] = source
  }
  return next
}
