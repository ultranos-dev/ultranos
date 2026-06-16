/**
 * peer-network-rtl-snapshots.test.tsx
 *
 * RTL snapshot tests for Story 46.4 Peer Network components.
 * Verifies that layout classes use logical CSS properties and that components
 * render identically in both LTR and RTL document directions.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import 'fake-indexeddb/auto'

// ── Shared mocks ──────────────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const msgs: Record<string, string> = {
      pageTitle: 'Ask a Tech',
      resolved: 'Resolved',
      flagged: 'Flagged',
      mentor: 'Mentor',
      noResponses: 'No responses yet',
      noPosts: 'No posts yet',
      backToFeed: 'Back',
      responses: 'Responses',
      addResponse: 'Add Response',
      flagContent: 'Flag',
      flagSubmitted: 'Flagged',
      cancel: 'Cancel',
      submitFlag: 'Submit',
      flagging: 'Flagging…',
      errorUnexpected: 'Unexpected error',
      photoAlt: 'Photo',
      markResolved: 'Mark Resolved',
      filterByStatus: 'Filter by status',
      filterByCategory: 'Filter by category',
      filterByTag: 'Filter by tag',
      statusAll: 'All',
      statusActive: 'Active',
      statusResolved: 'Resolved',
      statusFlagged: 'Flagged',
      categoryAll: 'All Categories',
      askQuestion: 'Ask Question',
      loading: 'Loading…',
      responseCount: `${String(params?.count ?? 0)} responses`,
      'categories.hematology': 'Hematology',
      'flagReason.inappropriate': 'Inappropriate',
      'flagReason.phi_detected': 'PHI Detected',
      'flagReason.spam': 'Spam',
      'flagReason.other': 'Other',
      flagDetailsPlaceholder: 'Details…',
    }
    return msgs[key] ?? key
  },
}))

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    peer_posts: {
      where: () => ({ equals: () => ({ sortBy: () => Promise.resolve([]) }) }),
      orderBy: () => ({ reverse: () => ({ toArray: () => Promise.resolve([]) }) }),
    },
    peer_responses: {
      where: () => ({ equals: () => ({ sortBy: () => Promise.resolve([]) }) }),
    },
    moderation_flags: {
      put: vi.fn().mockResolvedValue(undefined),
    },
  }),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: null }) => unknown) =>
    selector({ session: null }),
}))

vi.mock('@ultranos/ui-kit/components/ui/empty-state', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  MessageCircle: () => <svg data-testid="icon-message-circle" />,
  MessageSquare: () => <svg data-testid="icon-message-square" />,
}))

// ── Lazy imports after mocks ──────────────────────────────────────────────────

import { FlagButton } from '@/components/peer-network/FlagButton'
import { PostFeed } from '@/components/peer-network/PostFeed'
import type { PeerPost, PeerResponse } from '@/lib/peer-network-types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePost(overrides: Partial<PeerPost> = {}): PeerPost {
  return {
    id: 'post-001',
    authorId: 'tech-001',
    authorDisplayName: 'Lab Tech #123',
    title: 'Strange precipitate in reagent',
    body: 'Seeing white precipitate in CBC reagent.',
    photos: [],
    labContext: { category: 'hematology' },
    tags: ['reagent'],
    status: 'active',
    createdAt: new Date('2026-01-01').toISOString(),
    updatedAt: new Date('2026-01-01').toISOString(),
    syncStatus: 'synced',
    responseCount: 2,
    ...overrides,
  }
}

afterEach(() => {
  document.dir = 'ltr'
})

// ── FlagButton ────────────────────────────────────────────────────────────────

describe('FlagButton RTL snapshots', () => {
  it('renders in LTR', () => {
    document.dir = 'ltr'
    const { container } = render(<FlagButton targetId="post-001" targetType="post" />)
    expect(container).toMatchSnapshot()
  })

  it('renders in RTL', () => {
    document.dir = 'rtl'
    const { container } = render(<FlagButton targetId="post-001" targetType="post" />)
    expect(container).toMatchSnapshot()
  })

  it('uses logical CSS class for flag dialog layout', () => {
    document.dir = 'rtl'
    const { container } = render(<FlagButton targetId="post-001" targetType="post" />)
    // The flag button itself should not use directional positioning classes
    const btn = container.querySelector('button')
    expect(btn?.className).not.toMatch(/\bleft-\b|\bright-\b/)
  })
})

// ── PostFeed (empty state) ────────────────────────────────────────────────────

describe('PostFeed RTL snapshots', () => {
  it('renders empty state in LTR', async () => {
    document.dir = 'ltr'
    const { container, findByTestId } = render(
      <PostFeed onSelectPost={() => {}} onCreatePost={() => {}} />,
    )
    await findByTestId('empty-state')
    expect(container).toMatchSnapshot()
  })

  it('renders empty state in RTL', async () => {
    document.dir = 'rtl'
    const { container, findByTestId } = render(
      <PostFeed onSelectPost={() => {}} onCreatePost={() => {}} />,
    )
    await findByTestId('empty-state')
    expect(container).toMatchSnapshot()
  })

  it('filter row uses ms-auto for the "Ask Question" button (logical margin)', () => {
    document.dir = 'rtl'
    const { container } = render(
      <PostFeed onSelectPost={() => {}} onCreatePost={() => {}} />,
    )
    const askBtn = container.querySelector('button')
    expect(askBtn?.className).toMatch(/ms-auto/)
  })
})
