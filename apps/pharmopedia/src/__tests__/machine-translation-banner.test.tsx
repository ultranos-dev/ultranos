import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'
import { MachineTranslationBanner } from '@/components/DrugDetail/MachineTranslationBanner'

vi.mock('lucide-react-native', () => ({ Languages: () => null }))

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ warning: '#d97706', warningLight: '#fffbeb' }),
}))

const t = (k: string) => (k === 'drug.machineTranslatedNotice' ? 'NOTICE' : k)

describe('MachineTranslationBanner', () => {
  it('renders the localized notice', () => {
    const { getByText, getByTestId } = render(<MachineTranslationBanner t={t} />)
    expect(getByTestId('machine-translation-banner')).toBeTruthy()
    expect(getByText('NOTICE')).toBeTruthy()
  })
})
