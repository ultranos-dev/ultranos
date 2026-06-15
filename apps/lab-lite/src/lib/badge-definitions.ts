/**
 * Badge Catalogue — Story 46.7
 *
 * Defines all available badges. Badges use personal achievement language
 * ("You achieved...", "Your dedication...") — never comparative language.
 * No leaderboards, no comparisons to other techs.
 */

import type { Badge } from '@/lib/quality-streak-types'

export const BADGE_CATALOGUE: Badge[] = [
  // ── Streak badges ────────────────────────────────────────────────────────

  {
    id: 'streak-qc-7',
    name: '7-Day QC Streak',
    description: 'You maintained passing QC results for 7 consecutive days. Your consistency builds confidence in every result.',
    icon: 'Flame',
    category: 'streak',
    requirement: { type: 'streak_days', streakType: 'qc_passing', target: 7 },
  },
  {
    id: 'streak-qc-30',
    name: '30-Day QC Streak',
    description: 'You kept QC within limits for 30 consecutive days. A month of reliable, high-quality science.',
    icon: 'Star',
    category: 'streak',
    requirement: { type: 'streak_days', streakType: 'qc_passing', target: 30 },
  },
  {
    id: 'streak-qc-90',
    name: '90-Day QC Streak',
    description: 'You achieved 90 consecutive days of passing QC. Your dedication to quality is exceptional.',
    icon: 'Trophy',
    category: 'streak',
    requirement: { type: 'streak_days', streakType: 'qc_passing', target: 90 },
  },
  {
    id: 'streak-rej-7',
    name: '7-Day Zero Rejections',
    description: 'Seven days with zero rejected samples. Your careful sample handling makes a difference.',
    icon: 'Shield',
    category: 'streak',
    requirement: { type: 'streak_days', streakType: 'zero_rejection', target: 7 },
  },
  {
    id: 'streak-rej-30',
    name: '30-Day Zero Rejections',
    description: 'You went 30 days without a single sample rejection. That represents real precision in your work.',
    icon: 'ShieldCheck',
    category: 'streak',
    requirement: { type: 'streak_days', streakType: 'zero_rejection', target: 30 },
  },

  // ── Training badges ──────────────────────────────────────────────────────

  {
    id: 'training-first',
    name: 'First Module Completed',
    description: 'You completed your first learning module. Every expert started with one step.',
    icon: 'BookOpen',
    category: 'training',
    requirement: { type: 'count', target: 1 },
  },
  {
    id: 'training-5',
    name: '5 Modules Completed',
    description: 'You have completed 5 learning modules. Your professional development is growing.',
    icon: 'GraduationCap',
    category: 'training',
    requirement: { type: 'count', target: 5 },
  },
  {
    id: 'training-10',
    name: '10 Modules Completed',
    description: 'Ten modules complete. You are building a broad and deep foundation of knowledge.',
    icon: 'Award',
    category: 'training',
    requirement: { type: 'count', target: 10 },
  },
  {
    id: 'training-all',
    name: 'All Modules Completed',
    description: 'You have completed every available learning module. That is a remarkable achievement.',
    icon: 'Medal',
    category: 'training',
    requirement: { type: 'count', target: 999 }, // evaluator handles 'all' via completion rate = 100%
  },

  // ── Quality badges ───────────────────────────────────────────────────────

  {
    id: 'quality-cv-3pct',
    name: 'CV Below 3% — 3 Months',
    description: 'You kept hemoglobin CV below 3% for three consecutive months. Your precision is laboratory-standard excellent.',
    icon: 'LineChart',
    category: 'quality',
    requirement: { type: 'metric_threshold', metricType: 'hemoglobin_cv', target: 3, operator: 'lte' },
  },
  {
    id: 'quality-zero-rej-month',
    name: 'Zero Rejection Month',
    description: 'You completed an entire month without a single sample rejection. A testament to your attention to detail.',
    icon: 'CheckCircle',
    category: 'quality',
    requirement: { type: 'metric_threshold', metricType: 'rejection_rate', target: 0, operator: 'lte' },
  },
  {
    id: 'quality-perfect-quarter',
    name: 'Perfect Quality Quarter',
    description: 'You achieved zero rejections and passing QC for an entire quarter. Your quality work is exceptional.',
    icon: 'Gem',
    category: 'quality',
    requirement: { type: 'streak_days', streakType: 'qc_passing', target: 65 }, // ~3 months working days
  },

  // ── Milestone badges ─────────────────────────────────────────────────────

  {
    id: 'milestone-first-cert',
    name: 'First Certification Milestone',
    description: 'You reached your first certification milestone. Your professional growth is documented and recognised.',
    icon: 'Certificate',
    category: 'milestone',
    requirement: { type: 'count', target: 1 }, // evaluated via earnedBadges count in 'training' category
  },
]

/** Fast lookup by badge ID. */
export const BADGE_BY_ID: Readonly<Record<string, Badge>> = Object.fromEntries(
  BADGE_CATALOGUE.map((b) => [b.id, b]),
)
