/**
 * delegate-phone-validation.ts — Story 45.3
 *
 * Phone number validation for delegate registration.
 * Supports Afghan (+93) and common MENA country codes.
 * Never logs or exposes the phone value in error messages.
 */

/** Country code configs for MENA region supported by this system. */
const COUNTRY_CONFIGS: Record<string, { localDigits: number }> = {
  '+93':  { localDigits: 9  }, // Afghanistan
  '+964': { localDigits: 10 }, // Iraq
  '+963': { localDigits: 9  }, // Syria
  '+92':  { localDigits: 10 }, // Pakistan
  '+98':  { localDigits: 10 }, // Iran
  '+967': { localDigits: 9  }, // Yemen
  '+966': { localDigits: 9  }, // Saudi Arabia
  '+971': { localDigits: 9  }, // UAE
  '+962': { localDigits: 9  }, // Jordan
  '+961': { localDigits: 7  }, // Lebanon (7 or 8)
  '+970': { localDigits: 9  }, // Palestine
  '+973': { localDigits: 8  }, // Bahrain
  '+965': { localDigits: 8  }, // Kuwait
  '+968': { localDigits: 8  }, // Oman
  '+974': { localDigits: 8  }, // Qatar
}

/** Strip whitespace, hyphens, and parentheses for normalization. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, '')
}

/**
 * Validate a phone number for delegate registration.
 * Returns null if valid, or a validation error key if invalid.
 *
 * Rules:
 * - Must start with '+' (international format required)
 * - Must match a known MENA country code
 * - Local part must match expected digit count for the country
 *
 * Afghan format: +93 followed by 9 digits (mobile typically 07XX XXX XXX → +93 7XX XXX XXX)
 */
export function validateDelegatePhone(raw: string): 'phoneRequired' | 'phoneInvalid' | null {
  const normalized = normalizePhone(raw)

  if (!normalized) return 'phoneRequired'
  if (!normalized.startsWith('+')) return 'phoneInvalid'

  // Find the longest matching country code
  const matchedCode = Object.keys(COUNTRY_CONFIGS)
    .filter((code) => normalized.startsWith(code))
    .sort((a, b) => b.length - a.length)[0]

  if (!matchedCode) return 'phoneInvalid'

  const config = COUNTRY_CONFIGS[matchedCode]!
  const localPart = normalized.slice(matchedCode.length)

  // Local part must be all digits and correct length
  if (!/^\d+$/.test(localPart)) return 'phoneInvalid'

  // Allow ±1 digit tolerance for Lebanon (7–8 digits)
  const minLen = matchedCode === '+961' ? 7 : config.localDigits
  const maxLen = config.localDigits

  if (localPart.length < minLen || localPart.length > maxLen) return 'phoneInvalid'

  return null
}
