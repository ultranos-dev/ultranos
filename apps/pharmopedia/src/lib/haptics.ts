import * as Haptics from 'expo-haptics'

export async function hapticImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
): Promise<void> {
  try {
    await Haptics.impactAsync(style)
  } catch {
    // Haptics unavailable (emulator, unsupported device) — silent no-op
  }
}

export async function hapticNotification(
  type: Haptics.NotificationFeedbackType,
): Promise<void> {
  try {
    await Haptics.notificationAsync(type)
  } catch {
    // Silent no-op
  }
}

export async function hapticSelection(): Promise<void> {
  try {
    await Haptics.selectionAsync()
  } catch {
    // Silent no-op
  }
}
