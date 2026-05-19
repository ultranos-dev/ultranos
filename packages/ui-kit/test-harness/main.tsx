/**
 * UI Kit Test Harness — renders all patient-facing components in isolation.
 * Used by Playwright RTL screenshot tests to capture baselines.
 *
 * The page direction is controlled by a `?dir=rtl` query parameter,
 * which mirrors how the Playwright projects set locale/direction.
 */
import { createRoot } from 'react-dom/client'
import { AppShell } from '../src/AppShell'
import { DirectionalIcon } from '../src/components/DirectionalIcon'
import { LanguageSelector } from '../src/components/LanguageSelector'
import { ClinicalTerm } from '../src/components/ClinicalTerm'
import { SessionWarningToast } from '../src/SessionWarningToast'
import { StaleDataBanner } from '../src/StaleDataBanner'
import { ReAuthModal } from '../src/ReAuthModal'

// Read direction from query string: ?dir=rtl
const params = new URLSearchParams(window.location.search)
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr'
const lang = dir === 'rtl' ? 'ar' : 'en'

// Set document direction
document.documentElement.setAttribute('dir', dir)
document.documentElement.setAttribute('lang', lang)

// Show ReAuthModal only when ?modal=reauth is present
const showReAuthModal = params.get('modal') === 'reauth'

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div className="component-section" data-testid={id}>
      <h2>{title}</h2>
      {children}
    </div>
  )
}

function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function PillIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3" />
    </svg>
  )
}

function App() {
  return (
    <div>
      <h1 style={{ fontSize: '1rem', marginBlockEnd: '1rem', color: '#333' }}>
        UI Kit Components — dir=&quot;{dir}&quot;
      </h1>

      <Section id="appshell" title="AppShell">
        <AppShell
          appName="Test App"
          navItems={[
            { label: 'Home', href: '/', active: true },
            { label: 'Patients', href: '/patients' },
            { label: 'Settings', href: '/settings' },
          ]}
          user={{ name: 'Dr. Ahmed', email: 'ahmed@clinic.org', role: 'Physician', initials: 'DA' }}
          onSignOut={() => {}}
          languageSelector={<LanguageSelector currentLocale={lang === 'ar' ? 'ar' : 'en'} onLocaleChange={() => {}} />}
        >
          <div style={{ padding: '1rem', color: '#666' }}>
            Main content area. This text should flow naturally in both LTR and RTL directions.
          </div>
        </AppShell>
      </Section>

      <Section id="directional-icon-nav" title="DirectionalIcon — Navigation (mirrors in RTL)">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <DirectionalIcon category="navigation">
            <ChevronRight />
          </DirectionalIcon>
          <span>ChevronRight — should mirror in RTL</span>
        </div>
      </Section>

      <Section id="directional-icon-medical" title="DirectionalIcon — Medical (never mirrors)">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <DirectionalIcon category="medical">
            <PillIcon />
          </DirectionalIcon>
          <span>Pill icon — must NOT mirror in RTL</span>
        </div>
      </Section>

      <Section id="language-selector" title="LanguageSelector">
        <LanguageSelector
          currentLocale={lang === 'ar' ? 'ar' : 'en'}
          onLocaleChange={() => {}}
        />
      </Section>

      <Section id="clinical-term" title="ClinicalTerm">
        <p>
          {dir === 'rtl' ? 'يتناول المريض ' : 'Patient is taking '}
          <ClinicalTerm>Amoxicillin 500mg</ClinicalTerm>
          {dir === 'rtl' ? ' ثلاث مرات يومياً' : ' three times daily'}
        </p>
      </Section>

      <Section id="session-warning" title="SessionWarningToast">
        <div style={{ position: 'relative', height: '60px' }}>
          <div style={{ position: 'absolute', insetInlineEnd: 0, insetBlockEnd: 0 }}>
            <SessionWarningToast remainingSeconds={120} onStaySignedIn={() => {}} />
          </div>
        </div>
      </Section>

      <Section id="stale-data-banner" title="StaleDataBanner">
        <StaleDataBanner
          lastSyncedAt={null}
          failedCount={3}
          onSyncNow={() => {}}
        />
      </Section>

      {showReAuthModal && (
        <Section id="reauth-modal" title="ReAuthModal">
          <ReAuthModal
            userEmail="ahmed@clinic.org"
            onReAuth={async () => false}
            onSignOut={() => {}}
          />
        </Section>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
