import React from 'react'
import { render } from '@testing-library/react-native'
import { DrugCard } from '@/components/DrugCard'
import type { DrugSearchResult } from '@ultranos/shared-types'

const RESULT: DrugSearchResult = {
  atcCode: 'J01CA04',
  innName: 'amoxicillin',
  brandNames: ['Augmentin'],
  doseForms: ['tablet'],
  therapeuticClass: 'Antibiotic',
  localName: 'آموکسیسیلین',
}

describe('DrugCard', () => {
  it('renders INN name', () => {
    const { getByText } = render(<DrugCard result={RESULT} onPress={() => {}} />)
    expect(getByText('amoxicillin')).toBeTruthy()
  })

  it('renders ATC code', () => {
    const { getByText } = render(<DrugCard result={RESULT} onPress={() => {}} />)
    expect(getByText('J01CA04')).toBeTruthy()
  })

  it('renders local name when present', () => {
    const { getByText } = render(<DrugCard result={RESULT} onPress={() => {}} />)
    expect(getByText('آموکسیسیلین')).toBeTruthy()
  })
})
