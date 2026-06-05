/**
 * PasswordStrengthBar — presentational component (no internal state).
 * Exported from @ultranos/ui-kit.
 */

export function getPasswordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password || password.length < 8) return 0
  let score = 1 // length >= 8
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[!@#$%^&*()\-_=+[\]{};':"\\|,.<>/?`~]/.test(password)) score++
  return score as 1 | 2 | 3 | 4
}

export interface PasswordStrengthBarProps {
  /** Score computed by caller via getPasswordStrength() */
  strength: 0 | 1 | 2 | 3 | 4
  /** Translated label e.g. "Weak" — component is i18n-agnostic */
  label: string
}

const SEGMENT_COLOR: Record<number, string> = {
  1: 'bg-destructive',
  2: 'bg-amber-500',
  3: 'bg-blue-500',
  4: 'bg-primary',
}

export function PasswordStrengthBar({ strength, label }: PasswordStrengthBarProps) {
  return (
    <div className={`flex items-center gap-2 ${strength === 0 ? 'invisible' : ''}`}>
      <div className="flex flex-1 gap-1" data-testid="strength-segments">
        {([1, 2, 3, 4] as const).map((seg) => (
          <div
            key={seg}
            data-testid="strength-segment"
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              seg <= strength ? SEGMENT_COLOR[strength] : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
