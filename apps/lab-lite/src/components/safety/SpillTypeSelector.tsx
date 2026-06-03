'use client'

import { useTranslations } from 'next-intl'
import { SpillType, RiskTier } from '@/types/spill-protocol'

/**
 * Spill Type Selection — Story 47.5
 *
 * Four large color-coded buttons: one per spill type, ordered from lowest to highest risk.
 * Colors match the risk tier:
 *   blue   → URINE (LOW)
 *   amber  → BLOOD_SERUM (MODERATE)
 *   orange → CHEMICAL_REAGENT (HIGH)
 *   red    → CULTURE_MICROBIOLOGY (CRITICAL)
 *
 * Emergency UI principles: large touch targets (min 64px), large text (min 18px),
 * high contrast, no animations that delay information. RTL-safe via logical CSS.
 */

interface SpillTypeSelectorProps {
  onSelect: (spillType: SpillType) => void
  onClose: () => void
}

interface SpillButton {
  type: SpillType
  riskTier: RiskTier
  labelKey: string
  riskLabelKey: string
  backgroundColor: string
  borderColor: string
}

const SPILL_BUTTONS: SpillButton[] = [
  {
    type: SpillType.URINE,
    riskTier: RiskTier.LOW,
    labelKey: 'safety.spill.types.urine',
    riskLabelKey: 'safety.spill.riskTiers.low',
    backgroundColor: '#1d4ed8',
    borderColor: '#1e40af',
  },
  {
    type: SpillType.BLOOD_SERUM,
    riskTier: RiskTier.MODERATE,
    labelKey: 'safety.spill.types.bloodserum',
    riskLabelKey: 'safety.spill.riskTiers.moderate',
    backgroundColor: '#b45309',
    borderColor: '#92400e',
  },
  {
    type: SpillType.CHEMICAL_REAGENT,
    riskTier: RiskTier.HIGH,
    labelKey: 'safety.spill.types.chemicalreagent',
    riskLabelKey: 'safety.spill.riskTiers.high',
    backgroundColor: '#ea580c',
    borderColor: '#c2410c',
  },
  {
    type: SpillType.CULTURE_MICROBIOLOGY,
    riskTier: RiskTier.CRITICAL,
    labelKey: 'safety.spill.types.culturemicrobiology',
    riskLabelKey: 'safety.spill.riskTiers.critical',
    backgroundColor: '#dc2626',
    borderColor: '#b91c1c',
  },
]

export function SpillTypeSelector({ onSelect, onClose }: SpillTypeSelectorProps) {
  const t = useTranslations()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="spill-selector-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(0,0,0,0.9)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        gap: '1rem',
      }}
      dir="auto"
    >
      {/* Title */}
      <h1
        id="spill-selector-title"
        style={{
          color: 'white',
          fontSize: '1.75rem',
          fontWeight: 700,
          margin: 0,
          textAlign: 'center',
        }}
      >
        {t('safety.spill.selector.title')}
      </h1>
      <p
        style={{
          color: '#fca5a5',
          fontSize: '1.125rem',
          margin: 0,
          textAlign: 'center',
        }}
      >
        {t('safety.spill.selector.subtitle')}
      </p>

      {/* Spill type buttons */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          width: '100%',
          maxWidth: '28rem',
        }}
      >
        {SPILL_BUTTONS.map(({ type, labelKey, riskLabelKey, backgroundColor, borderColor }) => (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            style={{
              backgroundColor,
              borderColor,
              borderWidth: '2px',
              borderStyle: 'solid',
              color: 'white',
              borderRadius: '0.5rem',
              padding: '1.25rem 1.5rem',
              cursor: 'pointer',
              minHeight: '64px',
              textAlign: 'start',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            <span
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                lineHeight: 1.2,
              }}
            >
              {t(labelKey as any)}
            </span>
            <span
              style={{
                fontSize: '0.875rem',
                opacity: 0.85,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t(riskLabelKey as any)} {t('safety.spill.selector.riskLabel')}
            </span>
          </button>
        ))}

        {/* Cancel */}
        <button
          type="button"
          onClick={onClose}
          style={{
            backgroundColor: 'transparent',
            color: '#9ca3af',
            border: '1px solid #4b5563',
            borderRadius: '0.5rem',
            padding: '1rem 1.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
            minHeight: '56px',
            textAlign: 'center',
          }}
        >
          {t('safety.spill.selector.cancel')}
        </button>
      </div>
    </div>
  )
}
