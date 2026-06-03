'use client'

interface MergePreviewProps {
  survivorName: string
  duplicateName: string
  resolutions: Record<string, 'survivor' | 'duplicate'>
  fields: string[]
}

const FIELD_LABELS: Record<string, string> = {
  name_given: 'Name Given',
  name_father: 'Name Father',
  name_grandfather: 'Name Grandfather',
  gender: 'Gender',
  birth_year: 'Birth Year',
  address_district_origin: 'District Origin',
  address_province_origin: 'Province Origin',
}

export function MergePreview({
  survivorName,
  duplicateName,
  resolutions,
  fields,
}: MergePreviewProps) {
  const fromSurvivor = fields.filter((f) => resolutions[f] === 'survivor')
  const fromDuplicate = fields.filter((f) => resolutions[f] === 'duplicate')
  const fieldsChanging = fromDuplicate

  return (
    <div className="space-y-4">
      {/* Warning banner */}
      <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
        <p className="text-sm font-semibold text-warning">Merge is reversible for 72 hours</p>
        <p className="mt-1 text-xs text-warning/80">
          After the 72-hour unmerge window expires, this merge becomes permanent and cannot be undone.
        </p>
      </div>

      {/* Summary card */}
      <div className="rounded-3xl bg-card p-5 border border-border">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          <span className="wavy-divider">Merge Summary</span>
        </h3>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Survivor (kept)</span>
            <span className="font-medium text-foreground">{survivorName}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Duplicate (deactivated)</span>
            <span className="font-medium text-foreground">{duplicateName}</span>
          </div>

          <div className="my-3 border-t border-border" />

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Fields from survivor</span>
            <span className="font-medium text-foreground">{fromSurvivor.length}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Fields from duplicate</span>
            <span className="font-medium text-foreground">{fromDuplicate.length}</span>
          </div>
        </div>

        {/* Fields that will change */}
        {fieldsChanging.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fields that will change on survivor</p>
            <ul className="mt-2 space-y-1">
              {fieldsChanging.map((field) => (
                <li key={field} className="flex items-center gap-2 text-sm text-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  {FIELD_LABELS[field] ?? field}
                </li>
              ))}
            </ul>
          </div>
        )}

        {fieldsChanging.length === 0 && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">No fields will change on the survivor record. The duplicate will be deactivated.</p>
          </div>
        )}
      </div>
    </div>
  )
}
