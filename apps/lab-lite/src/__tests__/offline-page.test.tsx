import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import messages from '../../messages/en.json'
import OfflinePage from '../app/[locale]/(auth)/offline/page'

function renderWithI18n(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  )
}

describe('OfflinePage', () => {
  it('renders the offline message', () => {
    renderWithI18n(<OfflinePage />)

    expect(
      screen.getByText(
        /You are offline\. Lab Lite requires a network connection for uploads\. Previously cached pages are still available\./
      )
    ).toBeInTheDocument()
  })

  it('renders a Try Again button that reloads the page', async () => {
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })

    renderWithI18n(<OfflinePage />)

    const button = screen.getByRole('button', { name: /try again/i })
    expect(button).toBeInTheDocument()

    await userEvent.click(button)
    expect(reloadMock).toHaveBeenCalledOnce()
  })
})
