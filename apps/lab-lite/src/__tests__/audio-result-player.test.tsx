/**
 * Tests for Story 45.4 — Plain-Language Audio Result Summaries
 * Task 9.5: AudioResultPlayer — correct audio file, fallback on error
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — set up before importing the component under test
// ---------------------------------------------------------------------------

// next-intl: key → key (so assertions use raw translation keys)
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// We use two different module mock modes — one for "unapproved" (MVP default)
// and one for "approved" (tests that verify the player UI is shown).
// The vi.mock factory runs once; we use vi.mocked + mockReturnValueOnce to vary
// per test.

const mockResolveAudioScript = vi.fn()
const mockIsScriptApproved = vi.fn()

vi.mock('@/lib/audio-result-scripts', () => ({
  resolveAudioScript: (...args: unknown[]) => mockResolveAudioScript(...args),
  isScriptApproved: (script: unknown) => mockIsScriptApproved(script),
}))

// HTMLMediaElement.play / pause are not implemented in jsdom
beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    writable: true,
    value: vi.fn().mockResolvedValue(undefined),
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    writable: true,
    value: vi.fn(),
  })
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Import AFTER mocks are declared
import { AudioResultPlayer } from '../components/results/AudioResultPlayer'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APPROVED_SCRIPT = {
  id: 'cbc-normal',
  testCategory: '58410-2',
  resultField: 'cbc',
  interpretation: 'normal' as const,
  version: '1.0.0',
  approvedBy: 'Dr. Jane Smith',
  approvedAt: '2026-01-01T00:00:00.000Z',
  audioFiles: {
    en: '/audio/results/cbc/cbc-normal-en.mp3',
    ar: '/audio/results/cbc/cbc-normal-ar.mp3',
    prs: '/audio/results/cbc/cbc-normal-prs.mp3',
    ps: '/audio/results/cbc/cbc-normal-ps.mp3',
  },
  plainTextScripts: {
    en: 'Your blood count is in the normal range.',
    ar: 'تعداد دمك في النطاق الطبيعي.',
    prs: 'شمارش خون شما در محدوده طبیعی است.',
    ps: 'ستاسو د وینې شمیرنه د نورمال سیما کې ده.',
  },
}

const UNAPPROVED_SCRIPT = {
  ...APPROVED_SCRIPT,
  approvedBy: '',
  approvedAt: '',
}

function renderPlayer(overrides: Partial<React.ComponentProps<typeof AudioResultPlayer>> = {}) {
  return render(
    <AudioResultPlayer
      testCategory="58410-2"
      resultField="cbc"
      interpretation="normal"
      locale="en"
      {...overrides}
    />,
  )
}

// ---------------------------------------------------------------------------
// 9.5 — Fallback when script is NOT approved (MVP default state)
// ---------------------------------------------------------------------------

describe('AudioResultPlayer — fallback (unapproved script)', () => {
  beforeEach(() => {
    mockResolveAudioScript.mockReturnValue(UNAPPROVED_SCRIPT)
    mockIsScriptApproved.mockReturnValue(false)
  })

  it('does NOT render the audio element', () => {
    renderPlayer()
    expect(document.querySelector('audio')).toBeNull()
  })

  it('renders the audioUnavailable label', () => {
    renderPlayer()
    expect(screen.getByText('audioUnavailable')).toBeInTheDocument()
  })

  it('renders the plain-text fallback content', () => {
    renderPlayer()
    expect(screen.getByText(UNAPPROVED_SCRIPT.plainTextScripts.en)).toBeInTheDocument()
  })

  it('does NOT render a play button', () => {
    renderPlayer()
    expect(screen.queryByTestId('play-button')).toBeNull()
  })
})

describe('AudioResultPlayer — fallback when script resolves to null', () => {
  beforeEach(() => {
    mockResolveAudioScript.mockReturnValue(null)
    mockIsScriptApproved.mockReturnValue(false)
  })

  it('renders the audioUnavailable label when no script found', () => {
    renderPlayer()
    expect(screen.getByText('audioUnavailable')).toBeInTheDocument()
  })

  it('does not crash and renders no audio element', () => {
    const { container } = renderPlayer()
    expect(container.querySelector('audio')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 9.5 — Audio player when script IS approved
// ---------------------------------------------------------------------------

describe('AudioResultPlayer — audio player (approved script)', () => {
  beforeEach(() => {
    mockResolveAudioScript.mockReturnValue(APPROVED_SCRIPT)
    mockIsScriptApproved.mockReturnValue(true)
  })

  it('renders the hidden audio element with the correct src', () => {
    renderPlayer({ locale: 'en' })
    const audio = screen.getByTestId('audio-element') as HTMLAudioElement
    expect(audio).toBeInTheDocument()
    expect(audio.src).toContain('/audio/results/cbc/cbc-normal-en.mp3')
  })

  it('renders the audio element with the ar locale src', () => {
    renderPlayer({ locale: 'ar' })
    const audio = screen.getByTestId('audio-element') as HTMLAudioElement
    expect(audio.src).toContain('/audio/results/cbc/cbc-normal-ar.mp3')
  })

  it('audio element does NOT have autoplay set (AC: user must tap play)', () => {
    renderPlayer()
    const audio = screen.getByTestId('audio-element') as HTMLAudioElement
    expect(audio.autoplay).toBe(false)
  })

  it('renders a play button', () => {
    renderPlayer()
    expect(screen.getByTestId('play-button')).toBeInTheDocument()
  })

  it('renders a replay button', () => {
    renderPlayer()
    expect(screen.getByTestId('replay-button')).toBeInTheDocument()
  })

  it('renders a progress bar with role="progressbar"', () => {
    renderPlayer()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('play button has minimum 48px touch target (h-12 w-12 = 48px)', () => {
    renderPlayer()
    const btn = screen.getByTestId('play-button')
    expect(btn.className).toMatch(/h-12/)
    expect(btn.className).toMatch(/w-12/)
  })

  it('clicking play invokes audio.play()', () => {
    renderPlayer()
    fireEvent.click(screen.getByTestId('play-button'))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  })

  it('shows pause button after clicking play', () => {
    renderPlayer()
    fireEvent.click(screen.getByTestId('play-button'))
    expect(screen.getByTestId('pause-button')).toBeInTheDocument()
    expect(screen.queryByTestId('play-button')).toBeNull()
  })

  it('clicking replay resets currentTime to 0 and calls play()', () => {
    renderPlayer()
    const audio = screen.getByTestId('audio-element') as HTMLAudioElement
    fireEvent.click(screen.getByTestId('replay-button'))
    expect(audio.currentTime).toBe(0)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// 9.5 — Fallback on audio error after approved script
// ---------------------------------------------------------------------------

describe('AudioResultPlayer — fallback on audio error', () => {
  beforeEach(() => {
    mockResolveAudioScript.mockReturnValue(APPROVED_SCRIPT)
    mockIsScriptApproved.mockReturnValue(true)
    // Make play() reject to simulate audio error
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      writable: true,
      value: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
    })
  })

  it('shows the audioUnavailable fallback when audio.play() rejects', async () => {
    renderPlayer()
    fireEvent.click(screen.getByTestId('play-button'))
    // After play rejects, the component should transition to fallback
    // (State update is async due to catch handler; wait for DOM update)
    await vi.waitFor(() => {
      expect(screen.getByText('audioUnavailable')).toBeInTheDocument()
    })
  })
})
