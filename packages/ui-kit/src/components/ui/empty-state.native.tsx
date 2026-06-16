import * as React from 'react'
import { View, Text, Pressable, StyleSheet, I18nManager } from 'react-native'

/**
 * Native (React Native) implementation of EmptyState.
 * Metro automatically prefers `.native.tsx` over `.tsx` for RN builds.
 * Props are intentionally identical to the web version so call-sites are portable.
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
            <Icon size={16} color="#6b7280" />
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
          <Icon size={24} color="#6b7280" />
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
    paddingHorizontal: 16,
    paddingVertical: 32,
    gap: 8,
  },
  mdIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mdTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  mdDescription: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 280,
  },
  mdAction: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  mdActionText: {
    fontSize: 14,
    color: '#374151',
  },
  smContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
  },
  smContainerRtl: {
    flexDirection: 'row-reverse',
  },
  smIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  smTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  smTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  smDescription: {
    fontSize: 12,
    color: '#6b7280',
  },
  smAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    flexShrink: 0,
  },
  smActionText: {
    fontSize: 12,
    color: '#374151',
  },
})
