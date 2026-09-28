'use client'

import { useTranslations } from 'next-intl'

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
    'w-full rounded-xl border bg-background px-4 py-3 text-base text-foreground ' +
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
  const t = useTranslations('vitals')

  return (
    <div className="space-y-4">
      {/* Weight */}
      <div>
        <label
          htmlFor="vital-weight"
          className="mb-1 block text-sm font-semibold text-foreground"
        >
          {t('weight')}
        </label>
        <div className="mt-1 flex items-center gap-3">
          <input
            id="vital-weight"
            aria-label={t('weight')}
            type="number"
            value={weight}
            onChange={(e) => onWeightChange(e.target.value)}
            placeholder="0"
            min={0.5}
            max={500}
            step={0.1}
            aria-invalid={rangeStatuses.weight === 'panic' || rangeStatuses.weight === 'warning'}
            className={inputClasses(rangeStatuses.weight)}
          />
          <span className="text-sm font-semibold text-muted-foreground">{t('unitKg')}</span>
        </div>
        {rangeStatuses.weight === 'panic' && (
          <p className="mt-1 text-xs font-semibold text-destructive">{t('rangeCritical')}</p>
        )}
        {rangeStatuses.weight === 'warning' && (
          <p className="mt-1 text-xs font-semibold text-warning">{t('rangeWarning')}</p>
        )}
      </div>

      {/* Height */}
      <div>
        <label
          htmlFor="vital-height"
          className="mb-1 block text-sm font-semibold text-foreground"
        >
          {t('height')}
        </label>
        <div className="mt-1 flex items-center gap-3">
          <input
            id="vital-height"
            aria-label={t('height')}
            type="number"
            value={height}
            onChange={(e) => onHeightChange(e.target.value)}
            placeholder="0"
            min={20}
            max={300}
            step={0.1}
            aria-invalid={rangeStatuses.height === 'panic' || rangeStatuses.height === 'warning'}
            className={inputClasses(rangeStatuses.height)}
          />
          <span className="text-sm font-semibold text-muted-foreground">{t('unitCm')}</span>
        </div>
        {rangeStatuses.height === 'panic' && (
          <p className="mt-1 text-xs font-semibold text-destructive">{t('rangeCritical')}</p>
        )}
        {rangeStatuses.height === 'warning' && (
          <p className="mt-1 text-xs font-semibold text-warning">{t('rangeWarning')}</p>
        )}
      </div>

      {/* BMI (calculated, read-only) */}
      {bmi !== null && (
        <>
          <div
            className={
              'rounded-xl px-4 py-3 ' +
              (rangeStatuses.bmi === 'panic'
                ? 'border border-destructive bg-destructive/5'
                : rangeStatuses.bmi === 'warning'
                  ? 'border border-warning bg-warning/5'
                  : 'bg-muted')
            }
          >
            <span className="text-sm font-semibold text-muted-foreground">{t('bmi')}</span>
            <span className="ms-2 text-xl font-bold tabular-nums text-foreground">
              {bmi.toFixed(1)}
            </span>
          </div>
          {rangeStatuses.bmi === 'panic' && (
            <p className="mt-1 text-xs font-semibold text-destructive">{t('rangeCritical')}</p>
          )}
          {rangeStatuses.bmi === 'warning' && (
            <p className="mt-1 text-xs font-semibold text-warning">{t('rangeWarning')}</p>
          )}
        </>
      )}

      {/* Blood Pressure */}
      <div>
        <label
          htmlFor="vital-systolic"
          className="mb-1 block text-sm font-semibold text-foreground"
        >
          {t('bloodPressure')}
        </label>
        <div className="mt-1 flex items-center gap-3">
          <input
            id="vital-systolic"
            aria-label={t('placeholderSys')}
            type="number"
            value={systolic}
            onChange={(e) => onSystolicChange(e.target.value)}
            placeholder={t('placeholderSys')}
            min={40}
            max={300}
            step={1}
            aria-invalid={rangeStatuses.systolic === 'panic' || rangeStatuses.systolic === 'warning'}
            className={inputClasses(rangeStatuses.systolic)}
          />
          <span className="text-lg font-bold text-muted-foreground">/</span>
          <input
            id="vital-diastolic"
            aria-label={t('placeholderDia')}
            type="number"
            value={diastolic}
            onChange={(e) => onDiastolicChange(e.target.value)}
            placeholder={t('placeholderDia')}
            min={20}
            max={200}
            step={1}
            aria-invalid={rangeStatuses.diastolic === 'panic' || rangeStatuses.diastolic === 'warning'}
            className={inputClasses(rangeStatuses.diastolic)}
          />
          <span className="text-sm font-semibold text-muted-foreground">{t('unitMmHg')}</span>
        </div>
        {(rangeStatuses.systolic === 'panic' || rangeStatuses.diastolic === 'panic') && (
          <p className="mt-1 text-xs font-semibold text-destructive">{t('rangeCritical')}</p>
        )}
        {(rangeStatuses.systolic === 'warning' || rangeStatuses.diastolic === 'warning') &&
          rangeStatuses.systolic !== 'panic' && rangeStatuses.diastolic !== 'panic' && (
          <p className="mt-1 text-xs font-semibold text-warning">{t('rangeWarning')}</p>
        )}
      </div>

      {/* Temperature */}
      <div>
        <label
          htmlFor="vital-temperature"
          className="mb-1 block text-sm font-semibold text-foreground"
        >
          {t('temperature')}
        </label>
        <div className="mt-1 flex items-center gap-3">
          <input
            id="vital-temperature"
            aria-label={t('temperature')}
            type="number"
            value={temperature}
            onChange={(e) => onTemperatureChange(e.target.value)}
            placeholder="36.5"
            min={25}
            max={47}
            step={0.1}
            aria-invalid={rangeStatuses.temperature === 'panic' || rangeStatuses.temperature === 'warning'}
            className={inputClasses(rangeStatuses.temperature)}
          />
          <span className="text-sm font-semibold text-muted-foreground">{t('unitCelsius')}</span>
        </div>
        {rangeStatuses.temperature === 'panic' && (
          <p className="mt-1 text-xs font-semibold text-destructive">{t('rangeCritical')}</p>
        )}
        {rangeStatuses.temperature === 'warning' && (
          <p className="mt-1 text-xs font-semibold text-warning">{t('rangeWarning')}</p>
        )}
      </div>
    </div>
  )
}
