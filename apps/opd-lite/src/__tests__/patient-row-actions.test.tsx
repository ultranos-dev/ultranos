import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PatientRowActions } from '@/components/patients/PatientRowActions'

// t returns the key so we can assert on stable identifiers.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  MoreVertical: () => <svg data-testid="icon-more" />,
  Stethoscope: () => <svg data-testid="icon-stethoscope" />,
  Eye: () => <svg data-testid="icon-eye" />,
  Pencil: () => <svg data-testid="icon-pencil" />,
  UserCheck: () => <svg data-testid="icon-user-check" />,
  UserX: () => <svg data-testid="icon-user-x" />,
}))

// Render the dropdown inline (no radix portal/pointer gymnastics) so items are
// always visible and DropdownMenuItem.onSelect maps to a click.
vi.mock('@ultranos/ui-kit/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onSelect,
    variant,
  }: {
    children: React.ReactNode
    onSelect?: () => void
    variant?: string
  }) => (
    <button type="button" data-variant={variant ?? 'default'} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}))

function setup(isActive: boolean) {
  const handlers = {
    onStartEncounter: vi.fn(),
    onViewProfile: vi.fn(),
    onEditProfile: vi.fn(),
    onToggleStatus: vi.fn(),
  }
  render(<PatientRowActions patientName="Ajmal Milatyaar" isActive={isActive} {...handlers} />)
  return handlers
}

describe('PatientRowActions', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the trigger and all four actions', () => {
    setup(true)
    expect(screen.getByTestId('icon-more')).toBeInTheDocument()
    expect(screen.getByText('actionStartEncounter')).toBeInTheDocument()
    expect(screen.getByText('actionViewProfile')).toBeInTheDocument()
    expect(screen.getByText('actionEditProfile')).toBeInTheDocument()
  })

  it('shows Deactivate (destructive) for an active patient', () => {
    setup(true)
    const btn = screen.getByText('actionDeactivate').closest('button')
    expect(btn).toHaveAttribute('data-variant', 'destructive')
    expect(screen.queryByText('actionActivate')).not.toBeInTheDocument()
  })

  it('shows Activate (default) for an inactive patient', () => {
    setup(false)
    const btn = screen.getByText('actionActivate').closest('button')
    expect(btn).toHaveAttribute('data-variant', 'default')
    expect(screen.queryByText('actionDeactivate')).not.toBeInTheDocument()
  })

  it('fires the matching handler for each action', () => {
    const h = setup(true)
    fireEvent.click(screen.getByText('actionStartEncounter'))
    fireEvent.click(screen.getByText('actionViewProfile'))
    fireEvent.click(screen.getByText('actionEditProfile'))
    fireEvent.click(screen.getByText('actionDeactivate'))
    expect(h.onStartEncounter).toHaveBeenCalledOnce()
    expect(h.onViewProfile).toHaveBeenCalledOnce()
    expect(h.onEditProfile).toHaveBeenCalledOnce()
    expect(h.onToggleStatus).toHaveBeenCalledOnce()
  })
})
