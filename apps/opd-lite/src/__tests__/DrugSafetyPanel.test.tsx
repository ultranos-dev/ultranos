import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '@/lib/db'
import { DrugSafetyPanel } from '@/components/clinical/DrugSafetyPanel'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

const entry = (over: Partial<DrugEntry> = {}): DrugEntry =>
  ({ atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [], therapeuticClass: '',
     contraindications: ['Hypersensitivity to penicillins'],
     pregnancyClinical: { pregnancy: 'Generally considered safe in pregnancy.' },
     interactions: [], adverseEvents: [], adultDosing: [], pediatricDosing: [], indicationsClinical: [],
     administrationNotes: {}, pharmacokinetics: {}, ...over }) as unknown as DrugEntry

beforeEach(async () => { await db.open(); await db.drugCatalogMirror.clear() })

describe('DrugSafetyPanel', () => {
  it('renders contraindications from the mirror', async () => {
    await db.drugCatalogMirror.put(entry() as never)
    render(<DrugSafetyPanel atcCode="J01CA04" patientSex="male" patientAge={40} />)
    await waitFor(() => expect(screen.getByText(/Hypersensitivity to penicillins/)).toBeInTheDocument())
  })

  it('shows the pregnancy applicability note for a female patient of reproductive age', async () => {
    await db.drugCatalogMirror.put(entry() as never)
    render(<DrugSafetyPanel atcCode="J01CA04" patientSex="female" patientAge={30} />)
    await waitFor(() => expect(screen.getByTestId('pregnancy-note')).toBeInTheDocument())
  })

  it('does NOT show the pregnancy note for a male patient', async () => {
    await db.drugCatalogMirror.put(entry() as never)
    render(<DrugSafetyPanel atcCode="J01CA04" patientSex="male" patientAge={30} />)
    await waitFor(() => expect(screen.getByText(/Hypersensitivity/)).toBeInTheDocument())
    expect(screen.queryByTestId('pregnancy-note')).toBeNull()
  })

  it('shows an explicit "no data" line when contraindications are empty (rule #3)', async () => {
    await db.drugCatalogMirror.put(entry({ contraindications: [] }) as never)
    render(<DrugSafetyPanel atcCode="J01CA04" patientSex="male" patientAge={40} />)
    await waitFor(() => expect(screen.getByText('noContraindicationData')).toBeInTheDocument())
  })

  it('renders nothing when the drug is not in the mirror', async () => {
    const { container } = render(<DrugSafetyPanel atcCode="ZZZ" patientSex="male" patientAge={40} />)
    await waitFor(() => expect(container.querySelector('[data-testid="drug-safety-panel"]')).toBeNull())
  })

  it('renders the selected product identity (brand, manufacturer, strength, form, route) from props', async () => {
    await db.drugCatalogMirror.put(entry() as never)
    render(
      <DrugSafetyPanel
        atcCode="J01CA04"
        patientSex="male"
        patientAge={40}
        display="Amoxicillin"
        strength="500 mg"
        form="Capsule"
        route="PO"
        brandName="Amoxil"
        manufacturer="GSK"
      />,
    )
    const id = await screen.findByTestId('drug-identity')
    expect(id).toHaveTextContent('Amoxil')
    expect(id).toHaveTextContent('GSK')
    expect(id).toHaveTextContent('500 mg')
    expect(id).toHaveTextContent('Capsule')
    expect(id).toHaveTextContent('Oral') // 'PO' resolves to the human label
  })

  it('renders clinical highlights (indications and dosing) from the tier-2 mirror', async () => {
    await db.drugCatalogMirror.put(
      entry({
        indicationsClinical: ['Acute bacterial sinusitis'],
        adultDosing: [{ indication: 'Otitis media', adultDose: '500 mg TID', frequency: 'TID' }],
      }) as never,
    )
    render(<DrugSafetyPanel atcCode="J01CA04" patientSex="male" patientAge={40} display="Amoxicillin" />)
    await waitFor(() => expect(screen.getByText(/Acute bacterial sinusitis/)).toBeInTheDocument())
    expect(screen.getByText(/500 mg TID/)).toBeInTheDocument()
  })
})
