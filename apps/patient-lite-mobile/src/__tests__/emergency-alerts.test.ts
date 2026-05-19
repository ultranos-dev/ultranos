import { renderHook, act } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { Audio } from 'expo-av'
import { useEmergencyAlerts } from '@/hooks/useEmergencyAlerts'

describe('useEmergencyAlerts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('triggers haptic feedback on severe allergy alert', async () => {
    const { result } = renderHook(() => useEmergencyAlerts())

    await act(async () => {
      await result.current.triggerAlert('severe-allergy', 'allergy-1')
    })

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium)
  })

  it('triggers haptic + audio on contraindicated drug alert', async () => {
    const { result } = renderHook(() => useEmergencyAlerts())

    await act(async () => {
      await result.current.triggerAlert('contraindicated-drug', 'drug-1')
    })

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium)
    expect(Audio.Sound.createAsync).toHaveBeenCalled()
  })

  it('only triggers once per view key (no re-render duplicates)', async () => {
    const { result } = renderHook(() => useEmergencyAlerts())

    await act(async () => {
      await result.current.triggerAlert('severe-allergy', 'allergy-1')
    })
    await act(async () => {
      await result.current.triggerAlert('severe-allergy', 'allergy-1')
    })

    // Should only fire once
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1)
  })

  it('triggers separately for different view keys', async () => {
    const { result } = renderHook(() => useEmergencyAlerts())

    await act(async () => {
      await result.current.triggerAlert('severe-allergy', 'allergy-1')
    })
    await act(async () => {
      await result.current.triggerAlert('severe-allergy', 'allergy-2')
    })

    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2)
  })

  it('resetAlerts clears triggered state', async () => {
    const { result } = renderHook(() => useEmergencyAlerts())

    await act(async () => {
      await result.current.triggerAlert('severe-allergy', 'allergy-1')
    })
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.resetAlerts()
    })

    await act(async () => {
      await result.current.triggerAlert('severe-allergy', 'allergy-1')
    })
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2)
  })
})
