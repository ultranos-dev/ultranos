import { StyleSheet } from 'react-native'
import {
  consumerColors,
  consumerSpacing,
  consumerTypography,
  consumerBorderRadius,
} from '@ultranos/ui-kit'

export { consumerColors, consumerSpacing, consumerTypography, consumerBorderRadius }

/**
 * Common Consumer theme styles for the Health Passport app.
 * Warm purples/teals, soft surfaces, large touch targets.
 */
export const consumerStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: consumerColors.surface,
    paddingHorizontal: consumerSpacing.screenPadding,
  },
  card: {
    backgroundColor: consumerColors.surfaceElevated,
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: consumerColors.border,
  },
  headerText: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
    color: consumerColors.textPrimary,
  },
  subheaderText: {
    fontSize: consumerTypography.subheaderSize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: consumerColors.textPrimary,
  },
  bodyText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightBody,
    color: consumerColors.textSecondary,
    lineHeight: 24,
  },
  captionText: {
    fontSize: consumerTypography.captionSize,
    color: consumerColors.textMuted,
  },
  label: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: consumerColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
})
