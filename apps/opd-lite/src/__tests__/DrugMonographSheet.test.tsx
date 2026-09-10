import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '@/lib/db'
import { DrugMonographSheet } from '@/components/clinical/DrugMonographSheet'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

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
    await waitFor(() => expect(screen.getByText('limitedDataAvailable')).toBeInTheDocument())
  })

  it('shows brand presentations and storage instructions in the drawer', async () => {
    await db.drugBrandsMirror.clear()
    await db.drugBrandPresentationsMirror.clear()
    await db.drugCatalogMirror.put({
      atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: ['Amoxil'], doseForms: ['Capsule'],
      therapeuticClass: '', mechanismOfAction: 'x', contraindications: [], adverseEvents: [], interactions: [],
      adultDosing: [], pediatricDosing: [], indicationsClinical: [], pregnancyClinical: {}, administrationNotes: {},
      pharmacokinetics: { halfLife: '1 hour' }, storageInstructions: { en: 'Store below 25°C' },
    } as never)
    await db.drugBrandsMirror.bulkPut([
      { id: 'b1', genericAtcCode: 'J01CA04', brandName: 'Amoxil', manufacturer: 'GSK' },
    ] as never[])
    await db.drugBrandPresentationsMirror.bulkPut([
      { id: 'p1', brandId: 'b1', strength: '500 mg', doseForm: 'Capsule', packSize: 14, packUnit: 'capsules' },
    ] as never[])

    render(<DrugMonographSheet atcCode="J01CA04" label="Amoxicillin" />)
    fireEvent.click(screen.getByTestId('monograph-trigger'))
    await waitFor(() => expect(screen.getByText(/Amoxil/)).toBeInTheDocument())
    expect(screen.getByText(/500 mg/)).toBeInTheDocument()
    expect(screen.getByText(/Store below 25/)).toBeInTheDocument()
  })
})
