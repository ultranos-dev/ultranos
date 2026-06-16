import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { ChecklistTemplateEditor } from '@/components/safety/ChecklistTemplateEditor'
import { getDb } from '../lib/db'
import { LabRole } from '@ultranos/shared-types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: vi.fn(),
}))

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/db')>()
  return {
    ...actual,
    getChecklistTemplates: vi.fn(),
    putChecklistTemplate: vi.fn(),
    deleteChecklistTemplate: vi.fn(),
    deactivateChecklistTemplate: vi.fn(),
    resetChecklistTemplatesToDefaults: vi.fn(),
  }
})

import { useAuthSessionStore } from '@/stores/auth-session-store'
import {
  getChecklistTemplates,
  putChecklistTemplate,
  deleteChecklistTemplate,
  deactivateChecklistTemplate,
  resetChecklistTemplatesToDefaults,
} from '@/lib/db'

const mockManager = { labRole: LabRole.LAB_MANAGER }
const mockTechnician = { labRole: LabRole.LAB_TECHNICIAN }

const defaultTemplate = {
  id: 'ic-hh-01',
  category: 'Hand Hygiene',
  description: 'Hand hygiene stations stocked',
  order: 1,
  isDefault: true,
  requiresPhoto: false,
  isActive: true,
}

const customTemplate = {
  id: 'custom-001',
  category: 'Custom',
  description: 'Custom item',
  order: 10,
  isDefault: false,
  requiresPhoto: false,
  isActive: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getChecklistTemplates).mockResolvedValue([defaultTemplate, customTemplate])
  vi.mocked(putChecklistTemplate).mockResolvedValue(undefined)
  vi.mocked(deleteChecklistTemplate).mockResolvedValue(undefined)
  vi.mocked(deactivateChecklistTemplate).mockResolvedValue(undefined)
  vi.mocked(resetChecklistTemplatesToDefaults).mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChecklistTemplateEditor', () => {
  describe('access control', () => {
    it('shows access restricted message for non-manager', () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockTechnician)
      render(<ChecklistTemplateEditor />)
      expect(screen.getByText('accessRestricted')).toBeInTheDocument()
    })

    it('renders template list for manager', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => {
        expect(screen.getByText('Hand hygiene stations stocked')).toBeInTheDocument()
      })
    })
  })

  describe('template list', () => {
    it('shows all templates grouped by category', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => {
        expect(screen.getByText('Hand hygiene stations stocked')).toBeInTheDocument()
        expect(screen.getByText('Custom item')).toBeInTheDocument()
      })
    })

    it('shows no templates message when list is empty', async () => {
      vi.mocked(getChecklistTemplates).mockResolvedValue([])
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => {
        expect(screen.getByText('noTemplates')).toBeInTheDocument()
      })
    })

    it('shows default badge on default items', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => {
        expect(screen.getByText('badgeDefault')).toBeInTheDocument()
      })
    })

    it('shows deactivate button for active default items', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'deactivate' })).toBeInTheDocument()
      })
    })

    it('shows edit and delete buttons for custom items', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'edit' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'delete' })).toBeInTheDocument()
      })
    })
  })

  describe('add item', () => {
    it('opens add form when Add Item clicked', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => screen.getByRole('button', { name: 'addItem' }))

      fireEvent.click(screen.getByRole('button', { name: 'addItem' }))
      expect(screen.getByText('addItemTitle')).toBeInTheDocument()
    })

    it('calls putChecklistTemplate when form is submitted', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => screen.getByRole('button', { name: 'addItem' }))

      fireEvent.click(screen.getByRole('button', { name: 'addItem' }))

      const descInput = screen.getByPlaceholderText
        ? screen.queryByDisplayValue('')
        : null

      // Fill description field
      const inputs = screen.getAllByRole('textbox')
      const descField = inputs.find((i) => i.getAttribute('type') !== 'number')
      if (descField) {
        fireEvent.change(descField, { target: { value: 'New test item' } })
      }

      fireEvent.click(screen.getByRole('button', { name: 'save' }))

      await waitFor(() => {
        expect(putChecklistTemplate).toHaveBeenCalled()
      })
    })

    it('shows error when description is empty on submit', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => screen.getByRole('button', { name: 'addItem' }))

      fireEvent.click(screen.getByRole('button', { name: 'addItem' }))
      fireEvent.click(screen.getByRole('button', { name: 'save' }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })
  })

  describe('deactivate / activate', () => {
    it('calls deactivateChecklistTemplate for active default item', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => screen.getByRole('button', { name: 'deactivate' }))

      fireEvent.click(screen.getByRole('button', { name: 'deactivate' }))

      await waitFor(() => {
        expect(deactivateChecklistTemplate).toHaveBeenCalledWith('ic-hh-01')
      })
    })

    it('calls putChecklistTemplate with isActive:true to re-activate', async () => {
      vi.mocked(getChecklistTemplates).mockResolvedValue([
        { ...defaultTemplate, isActive: false },
      ])
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => screen.getByRole('button', { name: 'activate' }))

      fireEvent.click(screen.getByRole('button', { name: 'activate' }))

      await waitFor(() => {
        expect(putChecklistTemplate).toHaveBeenCalledWith(
          expect.objectContaining({ isActive: true }),
        )
      })
    })
  })

  describe('delete custom item', () => {
    it('calls deleteChecklistTemplate when delete button clicked', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => screen.getByRole('button', { name: 'delete' }))

      fireEvent.click(screen.getByRole('button', { name: 'delete' }))

      await waitFor(() => {
        expect(deleteChecklistTemplate).toHaveBeenCalledWith('custom-001')
      })
    })
  })

  describe('reset to defaults', () => {
    it('shows reset confirmation when Reset button clicked', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => screen.getByRole('button', { name: 'resetToDefaults' }))

      fireEvent.click(screen.getByRole('button', { name: 'resetToDefaults' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('resetConfirmMessage')).toBeInTheDocument()
    })

    it('calls resetChecklistTemplatesToDefaults on confirm', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => screen.getByRole('button', { name: 'resetToDefaults' }))

      fireEvent.click(screen.getByRole('button', { name: 'resetToDefaults' }))
      fireEvent.click(screen.getByRole('button', { name: 'confirmReset' }))

      await waitFor(() => {
        expect(resetChecklistTemplatesToDefaults).toHaveBeenCalled()
      })
    })

    it('dismisses confirmation without reset when cancel clicked', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<ChecklistTemplateEditor />)
      await waitFor(() => screen.getByRole('button', { name: 'resetToDefaults' }))

      fireEvent.click(screen.getByRole('button', { name: 'resetToDefaults' }))
      fireEvent.click(screen.getByRole('button', { name: 'cancel' }))

      expect(resetChecklistTemplatesToDefaults).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
