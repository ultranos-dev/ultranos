'use client'

/**
 * Notification preferences. These are not yet user-editable (managed by the org
 * administrator), so the toggles are rendered disabled — the checked state is
 * illustrative of the org default, not a live control.
 */
const NOTIFICATION_PREFERENCES = [
  { id: 'lab-result-alerts', label: 'Lab result alerts', on: true },
  { id: 'sync-conflict-alerts', label: 'Sync conflict alerts', on: true },
  { id: 'system-notifications', label: 'System notifications', on: false },
] as const

export function PreferencesCard() {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <h3 className="border-b border-border px-[18px] py-4 text-[15px] font-bold text-foreground">
        Preferences
      </h3>

      <div className="divide-y divide-border">
        {NOTIFICATION_PREFERENCES.map((pref) => (
          <label
            key={pref.id}
            className="flex items-center justify-between px-[18px] py-[14px]"
          >
            <span className="text-sm font-semibold text-foreground">{pref.label}</span>
            {/* Disabled toggle — visual switch backed by a real (disabled) checkbox */}
            <span className="relative inline-flex h-[22px] w-10 shrink-0 items-center">
              <input
                type="checkbox"
                disabled
                defaultChecked={pref.on}
                className="peer sr-only"
                aria-label={pref.label}
              />
              <span className="h-[22px] w-10 rounded-full bg-muted transition-colors peer-checked:bg-primary" />
              <span className="absolute start-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-[18px] rtl:peer-checked:-translate-x-[18px]" />
            </span>
          </label>
        ))}
      </div>
    </section>
  )
}
