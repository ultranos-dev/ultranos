'use client'

import { useTranslations } from 'next-intl'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@ultranos/ui-kit/components/ui/dropdown-menu'
import { MoreVertical, Stethoscope, Eye, Pencil, UserCheck, UserX } from '@ultranos/ui-kit/icons'

interface PatientRowActionsProps {
  /** Patient display name — used for the accessible trigger label. */
  patientName: string
  /** Whether the patient is currently active (drives the status action label/icon). */
  isActive: boolean
  onStartEncounter: () => void
  onViewProfile: () => void
  onEditProfile: () => void
  onToggleStatus: () => void
}

/**
 * Three-dot (⋮) actions menu for a patient row. Uses the shared ui-kit dropdown
 * (semantic tokens — bg-popover, focus:bg-accent, destructive variant) so it matches
 * the app styling automatically. Rendered inside a clickable table row, so it stops
 * click propagation to keep row-navigation from firing when interacting with the menu.
 */
export function PatientRowActions({
  patientName,
  isActive,
  onStartEncounter,
  onViewProfile,
  onEditProfile,
  onToggleStatus,
}: PatientRowActionsProps) {
  const t = useTranslations('patients')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground"
          aria-label={t('rowActionsLabel', { name: patientName })}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onSelect={onStartEncounter}>
          <Stethoscope aria-hidden="true" />
          {t('actionStartEncounter')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onViewProfile}>
          <Eye aria-hidden="true" />
          {t('actionViewProfile')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEditProfile}>
          <Pencil aria-hidden="true" />
          {t('actionEditProfile')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant={isActive ? 'destructive' : 'default'}
          onSelect={onToggleStatus}
        >
          {isActive ? <UserX aria-hidden="true" /> : <UserCheck aria-hidden="true" />}
          {isActive ? t('actionDeactivate') : t('actionActivate')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
