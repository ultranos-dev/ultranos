# Story 50.3: Automated Disease Surveillance Alerts

Status: pending

## Story

As a district health officer,
I want labs to automatically alert me when positivity rates spike,
so that outbreaks are detected early from lab data — the earliest epidemiological signal.

## Acceptance Criteria

1. **Given** the lab has historical positivity rate data in the `labLogbook`, **when** the system detects a positivity rate for any test category exceeding 2x the 4-week rolling average, **then** an automated surveillance alert is generated
2. **Or** when 3 or more confirmed cases of a reportable disease are detected within a 48-hour window, **then** a surveillance alert is generated
3. **And** the alert is transmitted to the district health officer and national surveillance system (via Hub API when online, queued offline)
4. **And** the alert includes: lab location, test category, current positivity rate vs. baseline, number of cases, and time period
5. **And** the tech is notified in-app that a surveillance alert was generated
6. **And** the reportable disease list is configurable in lab settings
7. **And** alerts are logged in Dexie and audit-logged
8. **And** the surveillance engine runs on local data (offline-capable detection — alert transmission queues until online)

## Tasks / Subtasks

- [ ] Task 1: Surveillance data model & Dexie schema (AC: #3, #7)
  - [ ] 1.1 Define `SurveillanceAlert` interface in `apps/lab-lite/src/lib/surveillance-types.ts`
  - [ ] 1.2 Define `ReportableDiseaseConfig` interface for the configurable disease list
  - [ ] 1.3 Define `SurveillanceBaseline` interface for cached rolling averages
  - [ ] 1.4 Add `surveillanceAlerts`, `reportableDiseases`, and `surveillanceBaselines` tables to Dexie (next available version)
  - [ ] 1.5 Index `surveillanceAlerts` on `alertType, diseaseCode, createdAt, transmissionStatus`
  - [ ] 1.6 Create helpers: `saveSurveillanceAlert()`, `getSurveillanceAlerts()`, `getAlertsByDateRange()`, `updateAlertTransmissionStatus()`

- [ ] Task 2: Reportable disease configuration (AC: #6)
  - [ ] 2.1 Create `apps/lab-lite/src/lib/surveillance-config.ts` — default reportable disease list
  - [ ] 2.2 Default list: Malaria, Tuberculosis, Hepatitis B, Hepatitis C, Cholera, Measles, Dengue, COVID-19 (configurable per WHO IHR and Afghan MoPH requirements)
  - [ ] 2.3 Each disease entry: `diseaseCode`, `diseaseLabel`, `loincCodes[]` (matching test types), `spikeThresholdMultiplier` (default 2.0), `clusterThreshold` (default 3), `clusterWindowHours` (default 48), `isActive`
  - [ ] 2.4 Seed default configuration into Dexie `reportableDiseases` on first app load
  - [ ] 2.5 Create settings UI: `apps/lab-lite/src/components/settings/SurveillanceConfig.tsx` — list of reportable diseases with toggles and threshold editing
  - [ ] 2.6 Integrate into `LabSettingsView.tsx` as a "Surveillance" card/section

- [ ] Task 3: Rolling average calculation engine (AC: #1)
  - [ ] 3.1 Create `apps/lab-lite/src/lib/surveillance-engine.ts`
  - [ ] 3.2 Implement `calculateRollingBaseline(diseaseCode: string, asOfDate: string)` — queries `labLogbook` for the 4 weeks prior to `asOfDate`, calculates positivity rate per week, returns the average
  - [ ] 3.3 Cache baselines in `surveillanceBaselines` table with an expiry (recalculate daily or when new results arrive)
  - [ ] 3.4 Handle cold-start: if fewer than 4 weeks of data exist, use available data with a minimum-data flag; if no historical data, skip spike detection and log a warning

- [ ] Task 4: Spike detection algorithm (AC: #1)
  - [ ] 4.1 Implement `detectPositivitySpike(diseaseCode: string)` in `surveillance-engine.ts`
  - [ ] 4.2 Calculate current period positivity rate (configurable window: default = current week)
  - [ ] 4.3 Compare to 4-week rolling average baseline
  - [ ] 4.4 Trigger alert if current rate >= `spikeThresholdMultiplier` x baseline rate
  - [ ] 4.5 Include absolute minimum: do not alert if total tests < 5 in the current period (avoid false positives from small sample sizes)
  - [ ] 4.6 Return `SpikeDetectionResult` with: detected (boolean), currentRate, baselineRate, ratio, testCount, periodStart, periodEnd

- [ ] Task 5: Cluster detection algorithm (AC: #2)
  - [ ] 5.1 Implement `detectDiseaseCluster(diseaseCode: string)` in `surveillance-engine.ts`
  - [ ] 5.2 Query `labLogbook` for positive results of the given disease within the last `clusterWindowHours`
  - [ ] 5.3 Trigger alert if count >= `clusterThreshold` (default 3)
  - [ ] 5.4 De-duplicate: if a cluster alert was already generated for overlapping cases within the window, do not re-alert (check `surveillanceAlerts` for existing alerts referencing the same cases)
  - [ ] 5.5 Return `ClusterDetectionResult` with: detected (boolean), caseCount, windowStart, windowEnd, caseTimestamps (ISO strings only — no patient identifiers)

- [ ] Task 6: Alert generation and scheduling (AC: #1, #2, #5, #8)
  - [ ] 6.1 Create `apps/lab-lite/src/lib/surveillance-scheduler.ts`
  - [ ] 6.2 Implement `runSurveillanceCheck()` — iterates all active reportable diseases, runs both spike and cluster detection
  - [ ] 6.3 For each detection hit, create a `SurveillanceAlert` record in Dexie
  - [ ] 6.4 Trigger schedule: (a) after every new result authorization (real-time cluster detection), (b) daily at a configurable time for spike detection (default: 08:00 local time)
  - [ ] 6.5 Use a lightweight scheduler (setInterval with last-run check, not a full cron library) — runs only when the app is open
  - [ ] 6.6 Notify the tech in-app via the existing notification system (`NotificationPanel.tsx` / `NotificationBell.tsx`)

- [ ] Task 7: Alert format and content (AC: #4)
  - [ ] 7.1 Alert payload structure (see Data Model below): lab location, test category, alert type (spike/cluster), current rate vs. baseline (for spikes), case count and window (for clusters), timestamp
  - [ ] 7.2 Alert severity levels: `warning` (approaching threshold — 1.5x baseline), `critical` (threshold exceeded — 2x+ baseline or cluster detected)
  - [ ] 7.3 Human-readable alert message generation: e.g., "Malaria positivity rate at 18.5% (baseline: 8.2%) — 2.3x above 4-week average. 27 positive cases in the past 7 days."
  - [ ] 7.4 Alert message uses i18n keys (translated to current locale)

- [ ] Task 8: Alert transmission to Hub (AC: #3)
  - [ ] 8.1 Alerts enqueue to `syncQueue` with `resourceType: 'SurveillanceAlert'` and high priority
  - [ ] 8.2 Sync priority: between Tier 1 and Tier 2 — surveillance alerts are urgent but not patient-safety-critical in the conflict-resolution sense
  - [ ] 8.3 Hub API endpoint receives alerts and routes to configured district health officer contacts (email, SMS — Hub responsibility, not Lab-Lite)
  - [ ] 8.4 Track `transmissionStatus` on alert: `pending` (generated, not yet sent), `transmitted` (successfully sent to Hub), `failed` (transmission failed, will retry)
  - [ ] 8.5 Offline behavior: alerts generate and store locally, transmission queues until connectivity resumes

- [ ] Task 9: Alert history and dashboard (AC: #5, #7)
  - [ ] 9.1 Create `apps/lab-lite/src/app/[locale]/reports/surveillance/page.tsx`
  - [ ] 9.2 Create `apps/lab-lite/src/components/reports/SurveillanceAlertList.tsx` — lists all generated alerts
  - [ ] 9.3 Create `apps/lab-lite/src/hooks/useSurveillanceAlerts.ts`
  - [ ] 9.4 Filter by: date range, disease, alert type (spike/cluster), transmission status
  - [ ] 9.5 Each alert card shows: disease, alert type, severity badge, rate vs. baseline or case count, timestamp, transmission status
  - [ ] 9.6 Link from reports navigation and from the notification that an alert was generated

- [ ] Task 10: Audit logging (AC: #7)
  - [ ] 10.1 Emit `SURVEILLANCE_ALERT_GENERATED` when an alert is created (alert ID, disease code, alert type, severity — no patient data)
  - [ ] 10.2 Emit `SURVEILLANCE_ALERT_TRANSMITTED` when Hub confirms receipt (alert ID)
  - [ ] 10.3 Emit `SURVEILLANCE_CONFIG_UPDATED` when disease list or thresholds are modified (disease code, field changed)
  - [ ] 10.4 Emit `SURVEILLANCE_CHECK_COMPLETED` when a scheduled check finishes (diseases checked count, alerts generated count)
  - [ ] 10.5 All audit events follow `reportQueueAuditEvent()` pattern — opaque IDs, never PHI

- [ ] Task 11: i18n keys (AC: all)
  - [ ] 11.1 Add `surveillance` namespace to `apps/lab-lite/messages/en.json`
  - [ ] 11.2 Add corresponding keys to `prs.json`, `ps.json`, `ar.json`
  - [ ] 11.3 Keys needed: title, alerts, alertGenerated, spikeDetected, clusterDetected, positivityRate, baseline, currentRate, ratio, caseCount, windowHours, labLocation, testCategory, severity, warning, critical, transmitted, pending, failed, transmissionStatus, reportableDiseases, configureThresholds, spikeThreshold, clusterThreshold, clusterWindow, activeToggle, noAlerts, alertHistory, filterByDisease, filterByType, filterByDate, alertMessage (template with interpolation), checkCompleted, lastCheckAt

- [ ] Task 12: Tests (AC: all)
  - [ ] 12.1 Rolling average — correct baseline calculation from 4 weeks of mock logbook data
  - [ ] 12.2 Rolling average cold-start — fewer than 4 weeks of data handles gracefully
  - [ ] 12.3 Spike detection — rate at 2x baseline triggers alert; rate at 1.9x does not
  - [ ] 12.4 Spike detection — small sample size (< 5 tests) suppresses false positive
  - [ ] 12.5 Cluster detection — 3 cases in 48h triggers alert; 2 cases does not
  - [ ] 12.6 Cluster de-duplication — overlapping clusters do not generate duplicate alerts
  - [ ] 12.7 Alert format — generated alert contains all required fields (location, category, rate, baseline, count)
  - [ ] 12.8 Alert transmission — alert enqueues to syncQueue with correct resourceType and priority
  - [ ] 12.9 Offline — detection runs and alerts generate without network; transmission queues
  - [ ] 12.10 Configuration — modified thresholds are used in subsequent detection runs
  - [ ] 12.11 Notification — tech receives in-app notification when alert is generated
  - [ ] 12.12 Audit events — all event types emitted with correct shapes (no PHI)

## Dev Notes

### Data Model — `SurveillanceAlert`

```typescript
export interface SurveillanceAlert {
  id: string                          // UUID v4
  alertType: 'spike' | 'cluster'
  severity: 'warning' | 'critical'
  diseaseCode: string                 // e.g., 'malaria', 'tb', 'hep_b'
  diseaseLabel: string                // Denormalized display name
  labFacilityId: string               // Facility identifier
  labFacilityName: string             // Denormalized for alert readability
  labProvince: string
  labDistrict: string

  // Spike-specific fields (populated when alertType === 'spike')
  currentRate?: number                // Current period positivity rate (%)
  baselineRate?: number               // 4-week rolling average (%)
  spikeRatio?: number                 // currentRate / baselineRate
  currentPeriodTestCount?: number     // Total tests in current period
  currentPeriodPositiveCount?: number // Positive tests in current period
  periodStart?: string                // ISO 8601
  periodEnd?: string                  // ISO 8601

  // Cluster-specific fields (populated when alertType === 'cluster')
  clusterCaseCount?: number           // Number of positive cases in window
  clusterWindowStart?: string         // ISO 8601
  clusterWindowEnd?: string           // ISO 8601

  // Alert metadata
  message: string                     // Human-readable alert message (localized)
  createdAt: string                   // ISO 8601
  transmissionStatus: 'pending' | 'transmitted' | 'failed'
  transmittedAt?: string              // ISO 8601
  transmissionAttempts: number
  syncStatus: 'pending' | 'synced'
}
```

### Data Model — `ReportableDiseaseConfig`

```typescript
export interface ReportableDiseaseConfig {
  diseaseCode: string                 // Primary key: 'malaria', 'tb', 'hep_b', etc.
  diseaseLabel: string                // Display name
  loincCodes: string[]                // LOINC codes that map to this disease
  positiveResultIndicators: string[]  // Result values indicating positive (e.g., 'positive', 'detected', 'reactive')
  spikeThresholdMultiplier: number    // Default 2.0 — trigger spike alert at this multiple of baseline
  clusterThreshold: number            // Default 3 — minimum cases in window to trigger cluster alert
  clusterWindowHours: number          // Default 48 — time window for cluster detection
  isActive: boolean                   // Can be toggled in settings
  isIhrReportable: boolean            // WHO International Health Regulations mandatory
  updatedAt: string                   // ISO 8601
}
```

### Data Model — `SurveillanceBaseline`

```typescript
export interface SurveillanceBaseline {
  id: string                          // `${diseaseCode}_${asOfDate}`
  diseaseCode: string
  asOfDate: string                    // ISO 8601 date
  weeklyRates: number[]               // Positivity rates for each of the 4 weeks
  averageRate: number                 // Mean of weeklyRates
  totalTests: number                  // Total tests across 4 weeks
  totalPositive: number               // Total positive across 4 weeks
  calculatedAt: string                // ISO 8601
  dataWeeks: number                   // How many weeks of data were available (0-4)
}
```

### Spike Detection Algorithm

```
1. Calculate 4-week rolling baseline:
   - Query labLogbook for positive results of diseaseCode in [today - 35 days, today - 7 days]
   - Group by ISO week, calculate positivity rate per week
   - Average the weekly rates = baselineRate

2. Calculate current period rate:
   - Query labLogbook for results of diseaseCode in [today - 7 days, today]
   - positivityRate = positiveCount / totalCount * 100

3. Compare:
   - If totalCount < 5: suppress (too small a sample)
   - If baselineRate === 0 and positiveCount > 0: alert (any cases where there were none)
   - If currentRate >= spikeThresholdMultiplier * baselineRate: ALERT
   - If currentRate >= 1.5 * baselineRate: WARNING (approaching threshold)
   - Else: no alert
```

### Cluster Detection Algorithm

```
1. Query labLogbook for positive results of diseaseCode in [now - clusterWindowHours, now]
2. Count distinct positive cases
3. If count >= clusterThreshold: ALERT
4. De-duplicate check:
   - Query surveillanceAlerts for existing cluster alerts with same diseaseCode
     where clusterWindowEnd > (now - clusterWindowHours)
   - If an existing alert covers >= 50% of the same cases, suppress (already alerted)
```

### Default Reportable Diseases

| Disease | Code | Default LOINC Codes | Spike Multiplier | Cluster Threshold | IHR |
|---------|------|---------------------|-------------------|-------------------|-----|
| Malaria | `malaria` | RDT, microscopy | 2.0 | 3 in 48h | No |
| Tuberculosis | `tb` | AFB smear, GeneXpert | 2.0 | 3 in 48h | No |
| Hepatitis B | `hep_b` | HBsAg | 2.0 | 5 in 48h | No |
| Hepatitis C | `hep_c` | Anti-HCV | 2.0 | 5 in 48h | No |
| Cholera | `cholera` | Stool culture | 1.5 | 2 in 48h | Yes |
| Measles | `measles` | IgM serology | 2.0 | 2 in 48h | Yes |
| Dengue | `dengue` | NS1, IgM | 2.0 | 3 in 48h | No |
| COVID-19 | `covid19` | PCR, rapid antigen | 2.0 | 5 in 48h | Yes |

Note: Actual LOINC codes for these tests need to be mapped during implementation. The `loincCodes` arrays in the config should reference the codes from `loinc-categories.ts` plus any additional codes needed for surveillance-specific tests.

### Notification Integration

When an alert is generated, create an in-app notification using the existing notification infrastructure:

- Notification type: `surveillance_alert`
- Notification severity: matches alert severity (`warning` or `critical`)
- Notification message: the alert's human-readable `message` field
- On tap: navigate to `/reports/surveillance` with the alert ID highlighted
- Critical alerts should use the notification bell's badge count and potentially a toast/banner

### Existing Patterns to Follow

- **Notification:** Follow `NotificationPanel.tsx` / `NotificationBell.tsx` for in-app notification rendering
- **Settings UI:** Follow `LabSettingsView.tsx` card pattern for surveillance configuration
- **Audit pattern:** Follow `reportQueueAuditEvent()` from `audit-client.ts`
- **Sync queue:** Follow existing `syncQueue` enqueue pattern from `db.ts`
- **Hook pattern:** Follow `useUploadHistory.ts` for alert list fetching
- **Scheduling:** Use `setInterval` with `lastRunAt` persistence in Dexie (similar to audit drain worker pattern)

### PHI Safety Reminders

- Surveillance alerts contain aggregate statistics (rates, counts) — not patient-level PHI
- Alert messages must NEVER include patient names, IDs, or individual test results
- Cluster detection counts cases but does not identify them in the alert
- Audit events reference alerts by ID and disease code only
- The Hub API is responsible for routing alerts to health officers — Lab-Lite only transmits the alert payload

### Dependencies

- **Story 42.8 (Digital Lab Logbook):** Surveillance engine reads from `labLogbook` for historical rates and cluster detection. If logbook is not implemented, can fall back to `uploadQueue` with reduced fidelity.
- **Story 42.5 (Result Authorization):** Real-time cluster detection triggers after result authorization. If not implemented, surveillance runs on schedule only.
- **Existing infrastructure:** Dexie database (`db.ts`), audit client (`audit-client.ts`), notification system (`NotificationPanel.tsx`, `NotificationBell.tsx`), sync queue, `LabSettingsView.tsx`, i18n message files.
