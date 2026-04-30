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
    'w-full rounded-lg border bg-white px-4 py-3 text-base text-neutral-900 ' +
    'placeholder:text-neutral-400 transition-colors focus:outline-none focus:ring-2'

  if (status === 'panic') {
    return `${base} border-red-500 focus:border-red-500 focus:ring-red-200`
  }
  if (status === 'warning') {
    return `${base} border-amber-500 focus:border-amber-500 focus:ring-amber-200`
  }
  return `${base} border-neutral-200 focus:border-primary-400 focus:ring-primary-200`
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
        <h3 className="text-2xl font-black tracking-tight text-neutral-900">
          Weight
        </h3>
        <div className="mt-2 flex items-center gap-3">
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
          <span className="text-sm font-semibold text-neutral-500">kg</span>
        </div>
      </div>

      {/* Height */}
      <div>
        <h3 className="text-2xl font-black tracking-tight text-neutral-900">
          Height
        </h3>
        <div className="mt-2 flex items-center gap-3">
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
          <span className="text-sm font-semibold text-neutral-500">cm</span>
        </div>
      </div>

      {/* BMI (calculated, read-only) */}
      {bmi !== null && (
        <div
          className={
            'rounded-lg px-4 py-3 ' +
            (rangeStatuses.bmi === 'panic'
              ? 'border border-red-500 bg-red-50'
              : rangeStatuses.bmi === 'warning'
                ? 'border border-amber-500 bg-amber-50'
                : 'bg-neutral-50')
          }
        >
          <span className="text-sm font-semibold text-neutral-500">BMI</span>
          <span className="ms-2 text-xl font-black text-neutral-900">
            {bmi.toFixed(1)}
          </span>
        </div>
      )}

      {/* Blood Pressure */}
      <div>
        <h3 className="text-2xl font-black tracking-tight text-neutral-900">
          Blood Pressure
        </h3>
        <div className="mt-2 flex items-center gap-3">
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
          <span className="text-lg font-bold text-neutral-400">/</span>
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
          <span className="text-sm font-semibold text-neutral-500">mmHg</span>
        </div>
      </div>

      {/* Temperature */}
      <div>
        <h3 className="text-2xl font-black tracking-tight text-neutral-900">
          Temperature
        </h3>
        <div className="mt-2 flex items-center gap-3">
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
          <span className="text-sm font-semibold text-neutral-500">°C</span>
        </div>
      </div>
    </div>
  )
}
