'use client'

import { useTranslations } from 'next-intl'
import { ProvinceAutocomplete } from '@/components/shared/ProvinceAutocomplete'
import { DistrictAutocomplete } from '@/components/shared/DistrictAutocomplete'
import type { AfghanProvince } from '@ultranos/shared-types'
import { Card } from '@/components/Card'

interface AddressFields {
  province: AfghanProvince | ''
  district: string
  village: string
}

interface GeographySectionProps {
  origin: AddressFields
  current: AddressFields
  sameAsOrigin: boolean
  onOriginChange: (address: AddressFields) => void
  onCurrentChange: (address: AddressFields) => void
  onSameAsOriginChange: (checked: boolean) => void
  isNomadic?: boolean
  onIsNomadicChange?: (checked: boolean) => void
  errors?: {
    originProvince?: string
    originDistrict?: string
    currentProvince?: string
    currentDistrict?: string
  }
}

export function GeographySection({
  origin,
  current,
  sameAsOrigin,
  onOriginChange,
  onCurrentChange,
  onSameAsOriginChange,
  isNomadic,
  onIsNomadicChange,
  errors,
}: GeographySectionProps) {
  const t = useTranslations('registration')

  return (
    <Card as="fieldset">
      <legend className="text-base font-bold text-neutral-900 mb-4">
        {t('geographySection')}
      </legend>

      {/* Origin address (required) */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-neutral-700 mb-3">
          {t('addressOrigin')}
          <span className="text-red-600 ms-0.5" aria-hidden="true">*</span>
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ProvinceAutocomplete
            value={origin.province}
            onChange={(province) =>
              onOriginChange({
                ...origin,
                province,
                district: '', // reset district when province changes
              })
            }
            label={t('province')}
            placeholder={t('provincePlaceholder')}
            required
            error={errors?.originProvince}
          />

          <DistrictAutocomplete
            province={origin.province}
            value={origin.district}
            onChange={(district) =>
              onOriginChange({ ...origin, district })
            }
            label={t('district')}
            placeholder={t('districtPlaceholder')}
            required
            error={errors?.originDistrict}
          />
        </div>

        <div className="mt-3">
          <label
            htmlFor="origin-village"
            className="mb-1 block text-sm font-semibold text-neutral-700"
          >
            {t('village')}
          </label>
          <input
            id="origin-village"
            type="text"
            className="w-full min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder={t('villagePlaceholder')}
            value={origin.village}
            onChange={(e) =>
              onOriginChange({ ...origin, village: e.target.value })
            }
          />
        </div>
      </div>

      {/* Divider */}
      <hr className="border-neutral-200 mb-4" />

      {/* Current address (optional) */}
      <div>
        <h3 className="text-sm font-bold text-neutral-700 mb-3">
          {t('addressCurrent')}
          <span className="ms-1 text-xs font-normal text-neutral-400">
            ({t('optional')})
          </span>
        </h3>

        {/* Same as origin checkbox */}
        <label className="mb-4 flex items-center gap-2 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={sameAsOrigin}
            onChange={(e) => onSameAsOriginChange(e.target.checked)}
            className="h-5 w-5 rounded border-neutral-300 text-blue-600 focus:ring-blue-400"
          />
          <span className="text-sm font-medium text-neutral-700">
            {t('sameAsOrigin')}
          </span>
        </label>

        {!sameAsOrigin && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ProvinceAutocomplete
                value={current.province}
                onChange={(province) =>
                  onCurrentChange({
                    ...current,
                    province,
                    district: '',
                  })
                }
                label={t('province')}
                placeholder={t('provincePlaceholder')}
                error={errors?.currentProvince}
              />

              <DistrictAutocomplete
                province={current.province}
                value={current.district}
                onChange={(district) =>
                  onCurrentChange({ ...current, district })
                }
                label={t('district')}
                placeholder={t('districtPlaceholder')}
                error={errors?.currentDistrict}
              />
            </div>

            <div className="mt-3">
              <label
                htmlFor="current-village"
                className="mb-1 block text-sm font-semibold text-neutral-700"
              >
                {t('village')}
              </label>
              <input
                id="current-village"
                type="text"
                className="w-full min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder={t('villagePlaceholder')}
                value={current.village}
                onChange={(e) =>
                  onCurrentChange({ ...current, village: e.target.value })
                }
              />
            </div>
          </>
        )}
      </div>

      {/* Nomadic toggle — only rendered when parent provides the callback */}
      {onIsNomadicChange && (
        <>
          <hr className="border-neutral-200 my-4" />
          <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={isNomadic ?? false}
              onChange={(e) => onIsNomadicChange(e.target.checked)}
              className="h-5 w-5 rounded border-neutral-300 text-blue-600 focus:ring-blue-400"
            />
            <span className="text-sm font-medium text-neutral-700">
              {t('isNomadic')}
            </span>
          </label>
        </>
      )}
    </Card>
  )
}
