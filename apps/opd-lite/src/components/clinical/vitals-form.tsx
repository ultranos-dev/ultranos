'use client'

export type RangeStatus = 'normal' | 'warning' | 'panic'

interface VitalsFormProps {
  weight: string
  height: string
  systolic: string
  diastolic: string
  temperature: string
  onWeightChange: (value: string) => void
  onHeightChange: (value: string) => void
  onSystolicChange: (value: string) => void
  onDiastolicChange: (value: string) => void
  onTemperatureChange: (value: string) => void
  bmi: number | null
  rangeStatuses: Partial<Record<string, RangeStatus>>
}

function inputClasses(status?: RangeStatus): string {
  const base =
    'w-full rounded-lg border bg-background px-4 py-3 text-base text-foreground ' +
    'placeholder:text-muted-foreground transition-colors focus:outline-none focus:ring-2'

  if (status === 'panic') {
    return `${base} border-destructive focus:border-destructive focus:ring-destructive/20`
  }
  if (status === 'warning') {
    return `${base} border-warning focus:border-warning focus:ring-warning/20`
  }
  return `${base} border-border focus:border-primary focus:ring-ring`
}

export function VitalsForm({
  weight,
  height,
  systolic,
  diastolic,
  temperature,
  onWeightChange,
  onHeightChange,
  onSystolicChange,
  onDiastolicChange,
  onTemperatureChange,
  bmi,
  rangeStatuses,
}: VitalsFormProps) {
  return (
    <div className="space-y-6">
      {/* Weight */}
      <div>
        <label
          htmlFor="vital-weight"
          className="mb-1 block text-sm font-semibold text-foreground"
        >
          Weight
        </label>
        <div className="mt-1 flex items-center gap-3">
          <input
            id="vital-weight"
            aria-label="Weight"
            type="number"
            value={weight}
            onChange={(e) => onWeightChange(e.target.value)}
            placeholder="0"
            min={0.5}
            max={500}
            step={0.1}
            className={inputClasses(rangeStatuses.weight)}
          />
          <span className="text-sm font-semibold text-muted-foreground">kg</span>
        </div>
      </div>

      {/* Height */}
      <div>
        <label
          htmlFor="vital-height"
          className="mb-1 block text-sm font-semibold text-foreground"
        >
          Height
        </label>
        <div className="mt-1 flex items-center gap-3">
          <input
            id="vital-height"
            aria-label="Height"
            type="number"
            value={height}
            onChange={(e) => onHeightChange(e.target.value)}
            placeholder="0"
            min={20}
            max={300}
            step={0.1}
            className={inputClasses(rangeStatuses.height)}
          />
          <span className="text-sm font-semibold text-muted-foreground">cm</span>
        </div>
      </div>

      {/* BMI (calculated, read-only) */}
      {bmi !== null && (
        <div
          className={
            'rounded-lg px-4 py-3 ' +
            (rangeStatuses.bmi === 'panic'
              ? 'border border-destructive bg-destructive/5'
              : rangeStatuses.bmi === 'warning'
                ? 'border border-warning bg-warning/5'
                : 'bg-muted')
          }
        >
          <span className="text-sm font-semibold text-muted-foreground">BMI</span>
          <span className="ms-2 text-xl font-black text-foreground">
            {bmi.toFixed(1)}
          </span>
        </div>
      )}

      {/* Blood Pressure */}
      <div>
        <label
          htmlFor="vital-systolic"
          className="mb-1 block text-sm font-semibold text-foreground"
        >
          Blood Pressure
        </label>
        <div className="mt-1 flex items-center gap-3">
          <input
            id="vital-systolic"
            aria-label="Systolic"
            type="number"
            value={systolic}
            onChange={(e) => onSystolicChange(e.target.value)}
            placeholder="Sys"
            min={40}
            max={300}
            step={1}
            className={inputClasses(rangeStatuses.systolic)}
          />
          <span className="text-lg font-bold text-muted-foreground">/</span>
          <input
            id="vital-diastolic"
            aria-label="Diastolic"
            type="number"
            value={diastolic}
            onChange={(e) => onDiastolicChange(e.target.value)}
            placeholder="Dia"
            min={20}
            max={200}
            step={1}
            className={inputClasses(rangeStatuses.diastolic)}
          />
          <span className="text-sm font-semibold text-muted-foreground">mmHg</span>
        </div>
      </div>

      {/* Temperature */}
      <div>
        <label
          htmlFor="vital-temperature"
          className="mb-1 block text-sm font-semibold text-foreground"
        >
          Temperature
        </label>
        <div className="mt-1 flex items-center gap-3">
          <input
            id="vital-temperature"
            aria-label="Temperature"
            type="number"
            value={temperature}
            onChange={(e) => onTemperatureChange(e.target.value)}
            placeholder="36.5"
            min={25}
            max={47}
            step={0.1}
            className={inputClasses(rangeStatuses.temperature)}
          />
          <span className="text-sm font-semibold text-muted-foreground">°C</span>
        </div>
      </div>
    </div>
  )
}
