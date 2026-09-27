/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NameInputSection } from '../components/registration/name-input-section.js'

// The shared section reads its labels from the consuming app's next-intl messages;
// mock the hook so the component renders standalone (returns the key).
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function noop() {}

describe('NameInputSection (shared, patient-kit)', () => {
  it('renders the four name inputs and marks given-name required', () => {
    render(
      <NameInputSection
        nameGiven=""
        nameFather=""
        nameGrandfather=""
        nameFamily=""
        onNameGivenChange={noop}
        onNameFatherChange={noop}
        onNameGrandfatherChange={noop}
        onNameFamilyChange={noop}
      />,
    )
    for (const id of ['name-given', 'name-family', 'name-father', 'name-grandfather']) {
      expect(document.getElementById(id)).not.toBeNull()
    }
    expect(document.getElementById('name-given')).toHaveProperty('required', true)
  })

  it('renders the live name preview from the provided name parts', () => {
    render(
      <NameInputSection
        nameGiven="Ajmal"
        nameFather="Dost Mohammad"
        nameGrandfather="Khan Baba"
        nameFamily="Milatyaar"
        onNameGivenChange={noop}
        onNameFatherChange={noop}
        onNameGrandfatherChange={noop}
        onNameFamilyChange={noop}
      />,
    )
    // Preview appears (namePreview label) and shows the given+family patient name.
    expect(screen.getByText('namePreview')).toBeTruthy()
    expect(screen.getByText('Ajmal Milatyaar')).toBeTruthy()
  })

  it('surfaces a given-name error with alert role', () => {
    render(
      <NameInputSection
        nameGiven=""
        nameFather=""
        nameGrandfather=""
        nameFamily=""
        onNameGivenChange={noop}
        onNameFatherChange={noop}
        onNameGrandfatherChange={noop}
        onNameFamilyChange={noop}
        errors={{ nameGiven: 'Required' }}
      />,
    )
    expect(screen.getByRole('alert').textContent).toBe('Required')
  })
})
