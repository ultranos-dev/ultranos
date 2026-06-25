import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '@/lib/db'
import { PrescriptionEntry } from '@/components/clinical/PrescriptionEntry'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

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
    fireEvent.change(screen.getByLabelText(/Search medications/i), { target: { value: 'Amox' } })
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
})
