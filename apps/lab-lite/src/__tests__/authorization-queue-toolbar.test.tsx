/**
 * Regression test — OPD-template remediation.
 *
 * Guards the invariant from the list-page remediation: the toolbar (search +
 * filters) stays rendered even when the list is EMPTY, so the user can still
 * search/filter. Before remediation, filter controls were gated behind a
 * `results.length > 0` branch and vanished on an empty queue.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../messages/en.json'
import type { LabResult } from '@/lib/db'
import { AuthorizationQueue } from '@/components/authorization/AuthorizationQueue'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: unknown) => unknown) =>
    selector({ session: { userId: 'u1', labRole: 'SUPERVISOR' } }),
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  )
}

describe('AuthorizationQueue — toolbar visible when empty (OPD template)', () => {
  it('renders the search field and empty state when there are no results', () => {
    render(
      <Wrapper>
        <AuthorizationQueue results={[] as LabResult[]} />
      </Wrapper>,
    )

    // Search field stays visible even with an empty list.
    // Query by placeholder — the field + its magnifier button share the aria label (guide §2g).
    expect(
      screen.getByPlaceholderText(messages.authorization.searchPlaceholder),
    ).toBeInTheDocument()

    // Sort control (part of the always-on toolbar) is present.
    expect(screen.getByLabelText(messages.authorization.sortBy)).toBeInTheDocument()

    // Empty state renders (no-data variant).
    expect(screen.getByText(messages.authorization.emptyTitle)).toBeInTheDocument()
  })
})
