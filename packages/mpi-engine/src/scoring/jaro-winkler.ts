/**
 * Jaro-Winkler string similarity in [0, 1].
 * Returns 1.0 for identical strings, 0.0 for no match.
 * Winkler prefix bonus (p=0.1, max 4 chars) is important for names
 * where shared prefixes carry identity signal (e.g., "Abd-", "Nur-").
 */
export function jaroWinkler(s1: string, s2: string): number {
  if (!s1 || !s2) return 0.0
  if (s1 === s2) return 1.0

  const len1 = s1.length
  const len2 = s2.length
  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0)

  const s1Matched = new Uint8Array(len1)
  const s2Matched = new Uint8Array(len2)
  let matches = 0

  for (let i = 0; i < len1; i++) {
    const lo = Math.max(0, i - matchDist)
    const hi = Math.min(i + matchDist + 1, len2)
    for (let j = lo; j < hi; j++) {
      if (s2Matched[j] === 1 || s1[i] !== s2[j]) continue
      s1Matched[i] = 1
      s2Matched[j] = 1
      matches++
      break
    }
  }

  if (matches === 0) return 0.0

  let t = 0
  let k = 0
  for (let i = 0; i < len1; i++) {
    if (s1Matched[i] === 0) continue
    while (s2Matched[k] === 0) k++
    if (s1[i] !== s2[k]) t++
    k++
  }

  const jaro = (matches / len1 + matches / len2 + (matches - t / 2) / matches) / 3

  // Winkler prefix bonus — up to 4 chars, scaling factor p = 0.1
  let prefix = 0
  const maxPrefix = Math.min(4, Math.min(len1, len2))
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }

  return jaro + prefix * 0.1 * (1 - jaro)
}
