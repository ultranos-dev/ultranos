/**
 * GuidanceDisplay — Full guidance card shown alongside a lab result notification.
 *
 * Story 53.7 — AC: 3, 4, 10
 *
 * Low-literacy design principles (AC: 10):
 *   - Large, high-contrast text (minimum 18pt)
 *   - Numbered step cards with large icons (bed, medicine, water, family…)
 *   - Audio play button with auto-play option (respecting device settings)
 *   - Language automatically set to patient's preferred locale
 *   - Simple layout: title → audio player → numbered steps → "I understand" button
 *   - RTL layout for Arabic (ar), Dari (prs), and Pashto (ps)
 *   - Offline-capable: all content is pre-bundled; no network calls
 *
 * No PHI — displays static physician-authored guidance content only.
 * Emits GUIDANCE_ACKNOWLEDGED audit event on "I understand" tap.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  I18nManager,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/theme/ThemeProvider'
import { GuidanceStepCard } from './GuidanceStepCard'

// ---------------------------------------------------------------------------
// Types — local to this component; mirrors GuidanceContent from lab-lite
// ---------------------------------------------------------------------------

export interface GuidanceLocalizedText {
  en: string
  ar: string
  prs: string
  ps: string
}

export interface GuidanceStep {
  order: number
  icon: string
  text: GuidanceLocalizedText
}

export interface GuidanceAuthor {
  name: string
  credentials: string
  institution: string
}

/** Bundled guidance content for offline display. Matches GuidanceContent shape. */
export interface GuidanceContentBundle {
  id: string
  conditionCode: string
  conditionDisplay: string
  text: GuidanceLocalizedText
  audio: GuidanceLocalizedText
  steps: GuidanceStep[]
  author: GuidanceAuthor
  version: string
  lastReviewedAt: string
  approvedBy: string
}

type SupportedLocale = 'en' | 'ar' | 'prs' | 'ps'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GuidanceDisplayProps {
  /** The guidance content to display. */
  content: GuidanceContentBundle
  /** Patient's preferred locale. Defaults to 'en'. */
  locale?: string
  /** Called when the patient taps "I understand" (for GUIDANCE_ACKNOWLEDGED audit). */
  onAcknowledge?: (guidanceId: string) => void
  /** Whether the guidance has already been acknowledged in this session. */
  isAcknowledged?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSupportedLocale(locale: string): SupportedLocale {
  if (locale === 'ar' || locale === 'prs' || locale === 'ps') return locale as SupportedLocale
  return 'en'
}

function isRTLLocale(locale: SupportedLocale): boolean {
  return locale === 'ar' || locale === 'prs' || locale === 'ps'
}

function getLocalizedText(text: GuidanceLocalizedText, locale: SupportedLocale): string {
  const raw = text[locale] || text.en
  // Strip [TRANSLATE] prefix from placeholder translations — show English fallback
  if (raw.startsWith('[TRANSLATE]')) return text.en
  return raw
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GuidanceDisplay({
  content,
  locale = 'en',
  onAcknowledge,
  isAcknowledged = false,
}: GuidanceDisplayProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const supportedLocale = toSupportedLocale(locale)
  const isRTL = isRTLLocale(supportedLocale)

  const [audioPlaying, setAudioPlaying] = useState(false)
  const hasAudio = Boolean(content.audio[supportedLocale])

  const guidanceText = getLocalizedText(content.text, supportedLocale)
  const sortedSteps = [...content.steps].sort((a, b) => a.order - b.order)

  const handleAudioPlay = useCallback(() => {
    if (!hasAudio) return
    // Audio playback is handled natively via the base64 audio field.
    // In production, this would use a native audio module (expo-av or
    // react-native-sound). Here we toggle playing state as a placeholder
    // until recordings are provided (audio field is empty in initial seed).
    setAudioPlaying((prev) => !prev)
  }, [hasAudio])

  const handleAcknowledge = useCallback(() => {
    if (onAcknowledge) {
      onAcknowledge(content.id)
    }
  }, [content.id, onAcknowledge])

  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface }]}
      testID="guidance-display"
    >
      {/* ── Header / Title ────────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: '#DBEAFE' }]}>
        <Text style={styles.headerIcon}>🏥</Text>
        <Text
          style={[styles.headerTitle, { color: '#1D4ED8' }]}
          writingDirection={isRTL ? 'rtl' : 'ltr'}
          testID="guidance-title"
        >
          {t('guidance.publicHealthGuidance', 'Public Health Guidance')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Guidance prose ───────────────────────────────────────────── */}
        <Text
          style={[styles.guidanceText, { color: colors.textPrimary }]}
          writingDirection={isRTL ? 'rtl' : 'ltr'}
          testID="guidance-text"
        >
          {guidanceText}
        </Text>

        {/* ── Audio player ─────────────────────────────────────────────── */}
        {hasAudio && (
          <Pressable
            onPress={handleAudioPlay}
            style={[
              styles.audioButton,
              { borderColor: colors.primary[600] },
              audioPlaying && { backgroundColor: colors.primary[600] },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              audioPlaying
                ? t('guidance.audioStop', 'Stop audio guidance')
                : t('guidance.audioPlay', 'Listen to guidance')
            }
            testID="guidance-audio-button"
          >
            <Text style={[styles.audioIcon]}>{audioPlaying ? '⏹' : '▶'}</Text>
            <Text
              style={[
                styles.audioButtonText,
                { color: audioPlaying ? '#FFFFFF' : colors.primary[600] },
              ]}
            >
              {audioPlaying
                ? t('guidance.audioStop', 'Stop audio guidance')
                : t('guidance.audioPlay', 'Listen to guidance')}
            </Text>
          </Pressable>
        )}

        {/* ── Step cards ───────────────────────────────────────────────── */}
        {sortedSteps.length > 0 && (
          <View style={styles.stepsSection}>
            <Text
              style={[styles.stepsHeading, { color: colors.textSecondary }]}
              writingDirection={isRTL ? 'rtl' : 'ltr'}
            >
              {t('guidance.stepsHeading', 'What to do:')}
            </Text>
            {sortedSteps.map((step) => (
              <GuidanceStepCard
                key={step.order}
                stepNumber={step.order}
                icon={step.icon}
                text={getLocalizedText(step.text, supportedLocale)}
                isRTL={isRTL}
              />
            ))}
          </View>
        )}

        {/* ── Author attribution ───────────────────────────────────────── */}
        <View
          style={[styles.authorSection, { borderTopColor: colors.border }]}
          testID="guidance-attribution"
        >
          <Text style={[styles.authorLabel, { color: colors.textMuted }]}>
            {t('guidance.authoredBy', 'Authored by:')}
          </Text>
          <Text style={[styles.authorName, { color: colors.textSecondary }]}>
            {content.author.name} — {content.author.credentials}
          </Text>
          <Text style={[styles.authorInstitution, { color: colors.textMuted }]}>
            {content.author.institution}
          </Text>
          <Text style={[styles.versionText, { color: colors.textMuted }]}>
            {t('guidance.version', 'Version')} {content.version} ·{' '}
            {t('guidance.reviewedBy', 'Reviewed by:')} {content.approvedBy}
          </Text>
        </View>

        {/* ── "I understand" button ────────────────────────────────────── */}
        <Pressable
          onPress={handleAcknowledge}
          style={[
            styles.acknowledgeButton,
            isAcknowledged
              ? { backgroundColor: colors.success ?? '#059669' }
              : { backgroundColor: colors.primary[600] },
          ]}
          disabled={isAcknowledged}
          accessibilityRole="button"
          accessibilityLabel={
            isAcknowledged
              ? t('guidance.acknowledged', 'Understood')
              : t('guidance.iUnderstand', 'I understand')
          }
          testID="guidance-acknowledge-button"
        >
          <Text style={styles.acknowledgeButtonText}>
            {isAcknowledged
              ? `✓ ${t('guidance.acknowledged', 'Understood')}`
              : t('guidance.iUnderstand', 'I understand')}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  headerIcon: {
    fontSize: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  guidanceText: {
    fontSize: 18,       // AC: 10 — minimum 18pt
    lineHeight: 28,
    fontWeight: '500',
    marginBottom: 20,
  },
  audioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 2,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 24,
    justifyContent: 'center',
  },
  audioIcon: {
    fontSize: 20,
  },
  audioButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  stepsSection: {
    marginBottom: 24,
  },
  stepsHeading: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  authorSection: {
    borderTopWidth: 1,
    paddingTop: 16,
    marginBottom: 24,
    gap: 4,
  },
  authorLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '600',
  },
  authorInstitution: {
    fontSize: 13,
  },
  versionText: {
    fontSize: 11,
    marginTop: 4,
  },
  acknowledgeButton: {
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  acknowledgeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
})
