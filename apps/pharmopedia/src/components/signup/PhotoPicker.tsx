import { View, Text, Image, Pressable, StyleSheet } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Camera, ImagePlus, X } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTranslation } from 'react-i18next'

export function PhotoPicker({ value, onChange }: { value: string | null; onChange: (uri: string | null) => void }) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  async function pick(from: 'library' | 'camera') {
    if (from === 'library') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) return
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 })
      if (!res.canceled && res.assets[0]) onChange(res.assets[0].uri)
    } else {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) return
      const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 })
      if (!res.canceled && res.assets[0]) onChange(res.assets[0].uri)
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.preview, { backgroundColor: colors.primary50, borderColor: colors.border }]}>
        {value ? (
          <Image testID="photo-preview" source={{ uri: value }} style={styles.previewImg} />
        ) : (
          <ImagePlus size={36} color={colors.primary600} />
        )}
        {value ? (
          <Pressable testID="photo-remove" onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel={t('signup.removePhoto')} style={[styles.removeBadge, { backgroundColor: colors.surface }]}>
            <X size={16} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Pressable testID="photo-choose" onPress={() => void pick('library')} accessibilityRole="button" style={[styles.action, { borderColor: colors.primary500 }]}>
          <ImagePlus size={16} color={colors.primary500} />
          <Text style={[styles.actionText, { color: colors.primary500 }]}>{t('signup.choosePhoto')}</Text>
        </Pressable>
        <Pressable testID="photo-camera" onPress={() => void pick('camera')} accessibilityRole="button" style={[styles.action, { borderColor: colors.primary500 }]}>
          <Camera size={16} color={colors.primary500} />
          <Text style={[styles.actionText, { color: colors.primary500 }]}>{t('signup.takePhoto')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing[4] },
  preview: { width: 120, height: 120, borderRadius: Radius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  previewImg: { width: '100%', height: '100%' },
  removeBadge: { position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: Spacing[3] },
  action: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2] },
  actionText: { fontFamily: FontFamily.sansSemibold, fontSize: FontSize.sm },
})
