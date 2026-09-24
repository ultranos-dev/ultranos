import * as React from 'react'
import { View, Text, Pressable, StyleSheet, I18nManager } from 'react-native'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../tokens.native.js'

/**
 * Native (React Native) implementation of EmptyState.
 * Metro automatically prefers `.native.tsx` over `.tsx` for RN builds.
 * Props are intentionally identical to the web version so call-sites are portable.
 *
 * Colors/spacing/radius/type come from `tokens.native` (never hardcoded hex) —
 * per the CLAUDE.md Native Design Tokens rule.
 */
export interface EmptyStateProps {
  title: string
  description?: string
  icon?: React.ComponentType<{ size?: number; color?: string }>
  action?: { label: string; onClick: () => void }
  size?: 'md' | 'sm'
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  size = 'md',
}: EmptyStateProps) {
  if (size === 'sm') {
    return (
      <View style={[styles.smContainer, I18nManager.isRTL && styles.smContainerRtl]}>
        {Icon !== undefined && (
          <View style={styles.smIconWrapper}>
            <Icon size={16} color={Colors.textMuted} />
          </View>
        )}
        <View style={styles.smTextBlock}>
          <Text style={styles.smTitle}>{title}</Text>
          {description !== undefined && (
            <Text style={styles.smDescription}>{description}</Text>
          )}
        </View>
        {action !== undefined && (
          <Pressable onPress={action.onClick} style={styles.smAction}>
            <Text style={styles.smActionText}>{action.label}</Text>
          </Pressable>
        )}
      </View>
    )
  }

  return (
    <View style={styles.mdContainer}>
      {Icon !== undefined && (
        <View style={styles.mdIconWrapper}>
          <Icon size={24} color={Colors.textMuted} />
        </View>
      )}
      <Text style={styles.mdTitle}>{title}</Text>
      {description !== undefined && (
        <Text style={styles.mdDescription}>{description}</Text>
      )}
      {action !== undefined && (
        <Pressable onPress={action.onClick} style={styles.mdAction}>
          <Text style={styles.mdActionText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  mdContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[8],
    gap: Spacing[2],
  },
  mdIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mdTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  mdDescription: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  mdAction: {
    marginTop: Spacing[1],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mdActionText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  smContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: Spacing[4],
  },
  smContainerRtl: {
    flexDirection: 'row-reverse',
  },
  smIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  smTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  smTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  smDescription: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  smAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    flexShrink: 0,
  },
  smActionText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
})
