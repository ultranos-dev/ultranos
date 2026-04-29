'use client'

import { Command } from 'cmdk'
import { useCallback } from 'react'

const FOCUSABLE_SELECTOR =
  'input, textarea, select, button, [tabindex]:not([tabindex="-1"])'

/** Clinical actions available in the command palette. */
const CLINICAL_COMMANDS = [
  { id: 'vitals', label: 'Vitals', sectionId: 'vitals', shortcut: 'V' },
  { id: 'subjective', label: 'Subjective', sectionId: 'soap-subjective', shortcut: 'S' },
  { id: 'objective', label: 'Objective', sectionId: 'soap-objective', shortcut: 'O' },
  { id: 'assessment', label: 'Assessment', sectionId: 'assessment', shortcut: 'A' },
] as const

export type ClinicalCommandId = (typeof CLINICAL_COMMANDS)[number]['id']

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect?: (commandId: ClinicalCommandId) => void
}

/**
 * Focuses the DOM section matching the selected command.
 * Deferred to next frame so the palette overlay unmounts first.
 */
function focusSection(sectionId: string) {
  requestAnimationFrame(() => {
    const el =
      document.querySelector<HTMLElement>(`[data-section="${sectionId}"]`) ??
      document.getElementById(sectionId)

    if (!el) return

    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const focusable = el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    if (focusable) {
      focusable.focus()
    } else {
      el.focus()
    }
  })
}

export function CommandPalette({ open, onOpenChange, onSelect }: CommandPaletteProps) {
  const handleSelect = useCallback(
    (commandId: string) => {
      const cmd = CLINICAL_COMMANDS.find((c) => c.id === commandId)
      if (cmd) {
        focusSection(cmd.sectionId)
        onSelect?.(commandId as ClinicalCommandId)
      }
      onOpenChange(false)
    },
    [onOpenChange, onSelect],
  )

  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
        return
      }
      if (e.key === 'Tab') {
        const focusables = e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    },
    [onOpenChange],
  )

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onKeyDown={handleDialogKeyDown}
    >
      {/* Backdrop with glassmorphism blur */}
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Palette container */}
      <Command
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-neutral-200 bg-white/95 shadow-lg backdrop-blur-md"
        label="Clinical Command Palette"
      >
        <Command.Input
          placeholder="Search clinical actions..."
          className="w-full border-b border-neutral-200 bg-transparent px-4 py-3 text-base font-medium text-neutral-900 outline-none placeholder:text-neutral-400"
          autoFocus
        />
        <Command.List className="max-h-72 overflow-y-auto p-2">
          <Command.Empty className="px-4 py-6 text-center text-sm text-neutral-400">
            No matching actions found.
          </Command.Empty>

          <Command.Group heading="Clinical Sections" className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {CLINICAL_COMMANDS.map((cmd) => (
              <Command.Item
                key={cmd.id}
                value={cmd.id}
                keywords={[cmd.label]}
                onSelect={handleSelect}
                className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-700 transition-colors data-[selected=true]:bg-primary-50 data-[selected=true]:text-primary-700"
              >
                <span>{cmd.label}</span>
                <kbd className="rounded border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 text-xs font-semibold text-neutral-500">
                  {cmd.shortcut}
                </kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-neutral-200 px-4 py-2 text-xs text-neutral-400">
          <span>
            <kbd className="rounded border border-neutral-200 bg-neutral-100 px-1 py-0.5 font-semibold">↑↓</kbd> Navigate
          </span>
          <span>
            <kbd className="rounded border border-neutral-200 bg-neutral-100 px-1 py-0.5 font-semibold">↵</kbd> Select
          </span>
          <span>
            <kbd className="rounded border border-neutral-200 bg-neutral-100 px-1 py-0.5 font-semibold">Esc</kbd> Close
          </span>
        </div>
      </Command>
    </div>
  )
}
