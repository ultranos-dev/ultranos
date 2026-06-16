import { useTranslation } from 'react-i18next'
import { AFGHAN_PROVINCES, type AfghanProvince } from '@ultranos/shared-types'
import { PickerField } from './PickerField'

export function ProvincePicker({ value, onChange }: { value: string; onChange: (p: AfghanProvince) => void }) {
  const { t } = useTranslation()
  return (
    <PickerField
      testID="province-picker"
      label={t('signup.province')}
      placeholder={t('signup.provincePlaceholder')}
      value={value}
      options={[...AFGHAN_PROVINCES]}
      onSelect={(v) => onChange(v as AfghanProvince)}
    />
  )
}
