/**
 * PatientNameAge — inline "First name · 29y" display.
 *
 * Wraps the name in <bdi> so an RTL name (Arabic/Dari/Pashto) never visually
 * jumbles with the LTR age, and renders a "·" separator between them. Mirrors the
 * pattern already used on the orders OrderCard so name/age read consistently
 * across the board. Data-minimized: first name + age only (CLAUDE.md Rule #7).
 */
export function PatientNameAge({
  firstName,
  ageLabel,
  fallbackName = '—',
  className,
}: {
  firstName: string
  /** Pre-formatted age label (e.g. "29y"), or undefined/empty to omit. */
  ageLabel?: string
  fallbackName?: string
  className?: string
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className ?? ''}`}>
      <bdi className="truncate">{firstName || fallbackName}</bdi>
      {ageLabel ? (
        <>
          <span aria-hidden="true" className="text-muted-foreground">·</span>
          <span className="whitespace-nowrap font-numeric font-normal text-muted-foreground">
            {ageLabel}
          </span>
        </>
      ) : null}
    </span>
  )
}
