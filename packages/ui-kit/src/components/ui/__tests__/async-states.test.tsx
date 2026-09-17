import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AsyncStates } from '../async-states.js'
import type { AsyncStatus } from '../../../hooks/use-async-data.js'

// ─── helpers ────────────────────────────────────────────────────────────────

function makeState<T>(
  status: AsyncStatus,
  data?: T,
  extra?: { error?: unknown; reload?: () => void }
) {
  return { status, data, error: extra?.error, reload: extra?.reload }
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('AsyncStates', () => {
  it('loading status renders loading node, NOT empty message', () => {
    render(
      <AsyncStates state={makeState('loading')} loading={<div>Loading spinner</div>}>
        {() => <div>Content</div>}
      </AsyncStates>
    )
    expect(screen.getByText('Loading spinner')).toBeInTheDocument()
    expect(screen.queryByText('Nothing here yet')).toBeNull()
    expect(screen.queryByText('Content')).toBeNull()
  })

  it('loading status renders default skeleton when no loading prop', () => {
    const { container } = render(
      <AsyncStates state={makeState('loading')}>
        {() => <div>Content</div>}
      </AsyncStates>
    )
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByText('Nothing here yet')).toBeNull()
  })

  it('error status renders error node and NOT empty message', () => {
    render(
      <AsyncStates
        state={makeState('error', undefined, { error: new Error('oops') })}
        errorState={<div>Custom error UI</div>}
      >
        {() => <div>Content</div>}
      </AsyncStates>
    )
    expect(screen.getByText('Custom error UI')).toBeInTheDocument()
    expect(screen.queryByText('Nothing here yet')).toBeNull()
  })

  it('error status renders default EmptyState with retry action', () => {
    const reload = vi.fn()
    render(
      <AsyncStates state={makeState('error', undefined, { reload })}>
        {() => <div>Content</div>}
      </AsyncStates>
    )
    expect(screen.getByText('Unable to load')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument()
    const retryBtn = screen.getByRole('button', { name: /retry/i })
    expect(retryBtn).toBeInTheDocument()
  })

  it('clicking retry calls state.reload', () => {
    const reload = vi.fn()
    render(
      <AsyncStates state={makeState('error', undefined, { reload })}>
        {() => <div>Content</div>}
      </AsyncStates>
    )
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('clicking retry calls onRetry prop over state.reload when both provided', () => {
    const reload = vi.fn()
    const onRetry = vi.fn()
    render(
      <AsyncStates state={makeState('error', undefined, { reload })} onRetry={onRetry}>
        {() => <div>Content</div>}
      </AsyncStates>
    )
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
  })

  it('error status uses custom labels', () => {
    const reload = vi.fn()
    render(
      <AsyncStates
        state={makeState('error', undefined, { reload })}
        labels={{ errorTitle: 'Oops', errorDescription: 'Network issue', retry: 'Try again' }}
      >
        {() => <div>Content</div>}
      </AsyncStates>
    )
    expect(screen.getByText('Oops')).toBeInTheDocument()
    expect(screen.getByText('Network issue')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('ready + empty data renders empty node, NOT children', () => {
    render(
      <AsyncStates state={makeState('ready', [])} empty={<div>No items found</div>}>
        {() => <div>Content</div>}
      </AsyncStates>
    )
    expect(screen.getByText('No items found')).toBeInTheDocument()
    expect(screen.queryByText('Content')).toBeNull()
  })

  it('ready + empty data renders default empty state when no empty prop', () => {
    render(
      <AsyncStates state={makeState('ready', [])}>
        {() => <div>Content</div>}
      </AsyncStates>
    )
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
    expect(screen.queryByText('Content')).toBeNull()
  })

  it('ready + null data uses defaultIsEmpty correctly', () => {
    render(
      <AsyncStates state={makeState<string | null>('ready', null)}>
        {() => <div>Content</div>}
      </AsyncStates>
    )
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
  })

  it('ready + data renders children with the data', () => {
    const items = ['Alpha', 'Bravo', 'Charlie']
    render(
      <AsyncStates state={makeState('ready', items)}>
        {(data) => (
          <ul>
            {data.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </AsyncStates>
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Bravo')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
    expect(screen.queryByText('Nothing here yet')).toBeNull()
  })

  it('custom isEmpty function controls empty vs data branches', () => {
    // Custom isEmpty: treats { count: 0 } as empty
    render(
      <AsyncStates
        state={makeState('ready', { count: 0 })}
        isEmpty={(d) => d == null || (d as { count: number }).count === 0}
        empty={<div>Custom empty</div>}
      >
        {(data) => <div>Count is {data.count}</div>}
      </AsyncStates>
    )
    expect(screen.getByText('Custom empty')).toBeInTheDocument()
    expect(screen.queryByText(/Count is/)).toBeNull()
  })
})
