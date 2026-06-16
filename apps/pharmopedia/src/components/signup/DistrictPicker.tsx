import { useTranslation } from 'react-i18next'
import { getDistrictsByProvince, type AfghanProvince } from '@ultranos/shared-types'
import { PickerField } from './PickerField'

export function DistrictPicker({ province, value, onChange }: { province: string; value: string; onChange: (d: string) => void }) {
  const { t } = useTranslation()
  const options = province ? getDistrictsByProvince(province as AfghanProvince).map((d) => d.name) : []
  return (
    <PickerField
      testID="district-picker"
      label={t('signup.district')}
      placeholder={t('signup.districtPlaceholder')}
      value={value}
      options={options}
      onSelect={onChange}
      disabled={!province}
    />
  )
}
