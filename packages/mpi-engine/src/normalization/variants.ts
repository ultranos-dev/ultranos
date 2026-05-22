// Common Afghan/MENA name variant normalizations.
// Applied AFTER romanization and lowercasing.
// Maps spelling variants → canonical Latin form.
// ⚠ HIGH RISK: review with a native Dari/Pashto speaker before production.
export const NAME_VARIANTS: Readonly<Record<string, string>> = {
  // ── Mohammad family → muhammad ────────────────────────────────
  'mohammad': 'muhammad',
  'mohammed': 'muhammad',
  'mohamad': 'muhammad',
  'muhammed': 'muhammad',
  'mehmed': 'muhammad',
  'mohammd': 'muhammad',
  // NOTE: 'muhammadi' is a surname — not remapped
  // Arabic unvowelled romanization → canonical form
  'mhmd': 'muhammad',   // محمد (no short vowels written)
  // ── Ahmad family → ahmad ─────────────────────────────────────
  'ahmd': 'ahmad',    // أحمد (no short vowels written)
  'ahmed': 'ahmad',
  'ahamed': 'ahmad',
  'ahammed': 'ahmad',
  'ahmud': 'ahmad',
  // ── Hussein family → hussain ──────────────────────────────────
  'hussein': 'hussain',
  'hossein': 'hussain',
  'husain': 'hussain',
  'husayn': 'hussain',
  'hossain': 'hussain',
  // ── Hassan → hasan ────────────────────────────────────────────
  'hassan': 'hasan',
  // ── Omar → umar ───────────────────────────────────────────────
  'omar': 'umar',
  'omer': 'umar',
  // ── Usman → uthman ────────────────────────────────────────────
  'osman': 'uthman',
  'usman': 'uthman',
  'othman': 'uthman',
  'uthaman': 'uthman',
  // ── Ibrahim ───────────────────────────────────────────────────
  'ebrahim': 'ibrahim',
  'ebraheem': 'ibrahim',
  'ibraheem': 'ibrahim',
  // ── Yusuf ─────────────────────────────────────────────────────
  'yousef': 'yusuf',
  'youssef': 'yusuf',
  'yusef': 'yusuf',
  'yousuf': 'yusuf',
  'yuusuf': 'yusuf',
  // ── Khalid ────────────────────────────────────────────────────
  'khaled': 'khalid',
  'khaleed': 'khalid',
  // ── Rahim ─────────────────────────────────────────────────────
  'raheem': 'rahim',
  // ── Nur ───────────────────────────────────────────────────────
  'nour': 'nur',
  'noor': 'nur',
  // ── Said / Sayyid ─────────────────────────────────────────────
  'saeed': 'said',
  'saeid': 'said',
  'sayed': 'sayyid',
  'sayyed': 'sayyid',
  'seid': 'sayyid',
  // ── Female names ──────────────────────────────────────────────
  'fatema': 'fatimah',
  'fatma': 'fatimah',
  // NOTE (REVIEW NEEDED): Fatiha (فاتحة, "the opener") and Fatima (فاطمة)
  // are distinct names. This mapping may cause false-positive MPI matches.
  // Flagged for native Dari/Pashto speaker review.
  'fatiha': 'fatimah',
  'aisha': 'ayisha',
  'ayesha': 'ayisha',
  'aysha': 'ayisha',
  'mariam': 'maryam',
  'zainab': 'zaynab',
  'zeynab': 'zaynab',
  // ── Abdul compounds — normalize prefix ────────────────────────
  // NOTE: These single-word entries only match when the FULL name component
  // is exactly this token (e.g. nameGiven = 'Abdel'). They do NOT apply to
  // 'Abdel Ali' because applyVariants does whole-string lookup only.
  // Compound names with Abdul prefix are handled via the full-compound entries below.
  'abdel': 'abd',
  'abdal': 'abd',
  'abdur': 'abd',
  // Full compound forms
  'abdurrahman': 'abd al rahman',
  'abdurahman': 'abd al rahman',
  'abdulrahman': 'abd al rahman',
  'abdurrahim': 'abd al rahim',
  'abdulrahim': 'abd al rahim',
  // ── Common Afghan names ───────────────────────────────────────
  'golam': 'ghulam',
  'mirvais': 'mirwais',
}

export function applyVariants(normalized: string): string {
  return NAME_VARIANTS[normalized] ?? normalized
}
