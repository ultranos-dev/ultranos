import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '@/lib/db'
import { DrugMonographSheet } from '@/components/clinical/DrugMonographSheet'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const entry = (): DrugEntry =>
  ({ atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [], therapeuticClass: '',
     mechanismOfAction: 'Inhibits bacterial cell-wall synthesis.',
     contraindications: ['Penicillin hypersensitivity'], adverseEvents: [], interactions: [],
     adultDosing: [], pediatricDosing: [], indicationsClinical: ['Bacterial infections'],
     pregnancyClinical: {}, administrationNotes: {}, pharmacokinetics: { halfLife: '1 hour' } }) as unknown as DrugEntry

beforeEach(async () => { await db.open(); await db.drugCatalogMirror.clear() })

describe('DrugMonographSheet', () => {
  it('opens the drawer and shows monograph content from the mirror', async () => {
    await db.drugCatalogMirror.put(entry() as never)
    render(<DrugMonographSheet atcCode="J01CA04" label="Amoxicillin 500mg" />)
    fireEvent.click(screen.getByTestId('monograph-trigger'))
    await waitFor(() => expect(screen.getByText(/Inhibits bacterial cell-wall synthesis/)).toBeInTheDocument())
    expect(screen.getByText(/Bacterial infections/)).toBeInTheDocument()
  })

  it('shows a limited-data hint when the drug is not in the mirror', async () => {
    render(<DrugMonographSheet atcCode="ZZZ" label="Unknown" />)
    fireEvent.click(screen.getByTestId('monograph-trigger'))
    await waitFor(() => expect(screen.getByText(/Limited data available/i)).toBeInTheDocument())
  })
})
