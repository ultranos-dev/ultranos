'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useEncounterStore } from '@/stores/encounter-store'
import { useVitalsStore } from '@/stores/vitals-store'
import { useDiagnosisStore } from '@/stores/diagnosis-store'
import { useSoapNoteStore } from '@/stores/soap-note-store'
import { usePrescriptionStore } from '@/stores/prescription-store'
import { useAllergyStore } from '@/stores/allergy-store'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { clearSigningKeys } from '@/lib/signing-key-store'
import { clearPhiTables } from '@/lib/phi-cleanup'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join('')
}

export function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const session = useAuthSessionStore((s) => s.session)

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false)
        ref.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleLogout = useCallback(async () => {
    // Clear PHI stores (order matters — PHI before keys before auth)
    useEncounterStore.getState().clearPhiState()
    useVitalsStore.getState().clearPhiState()
    useDiagnosisStore.getState().clearPhiState()
    useSoapNoteStore.getState().clearPhiState()
    usePrescriptionStore.getState().clearPhiState()
    useAllergyStore.getState().clearPhiState()

    auditPhiAccess(AuditAction.PHI_CLEANUP, AuditResourceType.SYSTEM, 'user-logout')
    await clearPhiTables()

    encryptionKeyStore.wipe()
    clearSigningKeys()
    useAuthSessionStore.getState().clearSession()

    await getSupabaseBrowserClient().auth.signOut()
    window.location.href = '/login'
  }, [])

  if (!session) return null

  const displayName = session.email?.split('@')[0] || 'User'
  const initials = getInitials(displayName)

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="icon"
        className="h-9 w-9 bg-blue-100 text-sm font-bold text-blue-700 hover:bg-blue-200"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="User menu"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        data-testid="user-dropdown-trigger"
      >
        {initials}
      </Button>

      {isOpen && (
        <>
          <style>{`
            @keyframes dropdownIn {
              from {
                opacity: 0;
                transform: scale(0.95);
              }
              to {
                opacity: 1;
                transform: scale(1);
              }
            }
            .dropdown-enter {
              animation: dropdownIn 150ms ease-out forwards;
              transform-origin: top right;
            }
          `}</style>
          <div
            role="menu"
            className="dropdown-enter absolute end-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl bg-background/70 backdrop-blur-md ring-[0.65px] ring-gray-400/40 shadow-lg"
            data-testid="user-dropdown-menu"
          >
            <div className="border-b border-neutral-100 px-4 py-3">
              <p className="text-sm font-medium text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{session.email}</p>
            </div>
            <div className="py-1">
              <a
                href="/settings"
                role="menuitem"
                className="block px-4 py-2 text-sm text-foreground [@media(hover:hover)and(pointer:fine)]:hover:bg-muted"
                data-testid="settings-link"
              >
                Settings
              </a>
              <Button
                variant="ghost"
                role="menuitem"
                onClick={handleLogout}
                className="w-full justify-start px-4 py-2 text-destructive hover:bg-muted"
                data-testid="logout-btn"
              >
                Logout
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
