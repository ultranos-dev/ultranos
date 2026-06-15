'use client'

interface FieldResolutionRowProps {
  field: string
  label: string
  survivorValue: unknown
  duplicateValue: unknown
  resolution: 'survivor' | 'duplicate' | undefined
  onResolve: (source: 'survivor' | 'duplicate') => void
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export function FieldResolutionRow({
  field,
  label,
  survivorValue,
  duplicateValue,
  resolution,
  onResolve,
}: FieldResolutionRowProps) {
  const survivorStr = formatValue(survivorValue)
  const duplicateStr = formatValue(duplicateValue)
  const isDifferent = survivorStr !== duplicateStr

  return (
    <tr className={isDifferent ? 'bg-warning/10/30' : ''}>
      <td className="px-4 py-3 text-sm font-medium text-foreground">{label}</td>
      <td className={`px-4 py-3 text-sm ${resolution === 'survivor' ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
        {survivorStr}
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-4">
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input
              type="radio"
              name={`resolve-${field}`}
              checked={resolution === 'survivor'}
              onChange={() => onResolve('survivor')}
              className="h-4 w-4 border-border text-primary focus:ring-primary/30"
            />
            Survivor
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input
              type="radio"
              name={`resolve-${field}`}
              checked={resolution === 'duplicate'}
              onChange={() => onResolve('duplicate')}
              className="h-4 w-4 border-border text-primary focus:ring-primary/30"
            />
            Duplicate
          </label>
        </div>
      </td>
      <td className={`px-4 py-3 text-sm ${resolution === 'duplicate' ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
        {duplicateStr}
      </td>
    </tr>
  )
}
