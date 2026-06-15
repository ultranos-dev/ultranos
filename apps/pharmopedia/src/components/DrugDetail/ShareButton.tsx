import { Pressable, Share, StyleSheet } from 'react-native'
import { Share2 } from 'lucide-react-native'
import { ImpactFeedbackStyle } from 'expo-haptics'
import { Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { hapticImpact } from '@/lib/haptics'

interface Props {
  atcCode: string
  drugName: string
}

export function ShareButton({ atcCode, drugName }: Props) {
  const colors = useThemeColors()

  async function handleShare() {
    void hapticImpact(ImpactFeedbackStyle.Light)
    await Share.share({
      message: `${drugName}\npharmopedia://drug/${atcCode}`,
    })
  }

  return (
    <Pressable testID="share-button" style={styles.btn} onPress={() => void handleShare()}>
      <Share2 size={22} color={colors.textSecondary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: { paddingTop: 2, paddingStart: Spacing[2] },
})
