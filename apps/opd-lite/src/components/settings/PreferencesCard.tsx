'use client'

const NOTIFICATION_PREFERENCES = [
  { id: 'lab-result-alerts', label: 'Lab result alerts' },
  { id: 'sync-conflict-alerts', label: 'Sync conflict alerts' },
  { id: 'system-notifications', label: 'System notifications' },
] as const

export function PreferencesCard() {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">Preferences</h2>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
          Coming soon
        </span>
      </div>

      <div className="space-y-3">
        {NOTIFICATION_PREFERENCES.map((pref) => (
          <label
            key={pref.id}
            className="flex items-center justify-between"
          >
            <span className="text-sm text-neutral-700">{pref.label}</span>
            <input
              type="checkbox"
              disabled
              className="h-4 w-4 rounded border-neutral-300 text-blue-600 opacity-50"
              aria-label={pref.label}
            />
          </label>
        ))}
      </div>

      <p className="mt-4 text-xs text-neutral-400">
        Managed by administrator
      </p>
    </div>
  )
}
