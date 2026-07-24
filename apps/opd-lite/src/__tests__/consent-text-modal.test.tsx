import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConsentTextModal } from '../components/registration/ConsentTextModal'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('ConsentTextModal', () => {
  it('renders with DialogTitle showing consent document title when open', () => {
    render(<ConsentTextModal open={true} onClose={vi.fn()} />)

    // DialogTitle renders "consentDocumentTitle" (mocked t returns the key)
    expect(screen.getByText('consentDocumentTitle')).toBeInTheDocument()
    // Radix Dialog gives role=dialog
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not render dialog content when closed', () => {
    render(<ConsentTextModal open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('language tab switch changes the active tab', () => {
    render(<ConsentTextModal open={true} onClose={vi.fn()} />)

    // Tab list is present
    expect(screen.getByRole('tablist')).toBeInTheDocument()

    // The English tab should be in the list
    const englishTab = screen.getByText('languageEnglish')
    expect(englishTab).toBeInTheDocument()

    // Switch to Arabic
    const arabicTab = screen.getByText('languageArabic')
    fireEvent.click(arabicTab)

    // Arabic tab is now selected (aria-selected="true")
    expect(arabicTab).toHaveAttribute('aria-selected', 'true')
  })

  it('built-in X close button fires onClose', () => {
    const onClose = vi.fn()
    render(<ConsentTextModal open={true} onClose={onClose} />)

    // DialogContent renders a built-in X close button with sr-only text "Close" (exact)
    const closeBtn = screen.getByRole('button', { name: 'Close' })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('footer close button fires onClose', () => {
    const onClose = vi.fn()
    render(<ConsentTextModal open={true} onClose={onClose} />)

    // Footer "consentDocumentClose" button
    const footerBtn = screen.getByText('consentDocumentClose')
    fireEvent.click(footerBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
