import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '@/lib/db'
import { PrescriptionEntry } from '@/components/clinical/PrescriptionEntry'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

const entry = (): DrugEntry =>
  ({ atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: ['Amoxil'], doseForms: ['capsule'], therapeuticClass: '',
     contraindications: ['Penicillin hypersensitivity'], interactions: [], adverseEvents: [],
     adultDosing: [], pediatricDosing: [], indicationsClinical: [], pregnancyClinical: {},
     administrationNotes: {}, pharmacokinetics: {} }) as unknown as DrugEntry

beforeEach(async () => {
  await db.open()
  await db.drugCatalogMirror.clear()
  await db.drugCatalogMirror.put(entry() as never)
  await db.vocabularyMedications.clear()
  await db.vocabularyMedications.put({ code: 'J01CA04', display: 'Amoxicillin', form: 'capsule', strength: '500mg', version: 1 } as never)
})

describe('PrescriptionEntry decision support', () => {
  it('shows the safety panel after selecting a medication', async () => {
    render(<PrescriptionEntry onSubmit={() => {}} patientSex="male" patientAge={40} />)
    fireEvent.change(screen.getByLabelText('searchAria'), { target: { value: 'Amox' } })
    // Wait for the listbox to appear, then click the first option
    const option = await waitFor(() => {
      const options = screen.getAllByRole('option')
      if (options.length === 0) throw new Error('no options')
      return options[0]!
    })
    fireEvent.mouseDown(option)
    await waitFor(() => expect(screen.getByTestId('drug-safety-panel')).toBeInTheDocument())
    expect(screen.getByText(/Penicillin hypersensitivity/)).toBeInTheDocument()
    expect(screen.getByTestId('monograph-trigger')).toBeInTheDocument()
  })

  it('offers a brand picker and records the brand hint', async () => {
    await db.drugBrandsMirror.clear()
    await db.drugBrandsMirror.put({ id: 'b1', genericAtcCode: 'J01CA04', brandName: 'Amoxil' } as never)
    let submitted: import('@/lib/prescription-config').PrescriptionFormData | null = null
    render(<PrescriptionEntry onSubmit={(f) => { submitted = f }} patientSex="male" patientAge={40} />)
    fireEvent.change(screen.getByLabelText('searchAria'), { target: { value: 'Amox' } })
    fireEvent.mouseDown(await waitFor(() => screen.getAllByRole('option')[0]!))
    const brandSelect = await waitFor(() => screen.getByTestId('brand-hint-select'))
    fireEvent.change(brandSelect, { target: { value: 'Amoxil' } })
    fireEvent.click(screen.getByRole('button', { name: 'addPrescription' }))
    await waitFor(() => expect(submitted).not.toBeNull())
    expect(submitted!.brandHint).toBe('Amoxil')
  })
})
