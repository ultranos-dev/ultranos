# Story 45.4: Plain-Language Audio Result Summaries

Status: ready-for-dev

## Story

As a patient who cannot read,
I want to hear my lab results explained in simple language in my own language,
So that I understand what my results mean without needing someone to read to me.

## Acceptance Criteria

1. **Given** a result has been released and the patient or delegate accesses it, **when** they tap the audio button on the result view, **then** a pre-recorded, physician-approved audio explanation plays in the patient's language (Dari, Pashto, Arabic, or English)
2. **And** the explanation uses plain language: not "Hemoglobin: 9.2 g/dL [L]" but "Your blood strength is a little low. This is not dangerous but your doctor will discuss it with you."
3. **And** a visual color indicator (green/yellow/red) accompanies each result field for at-a-glance understanding
4. **And** the audio scripts are physician-authored, versioned, and bundled offline
5. **And** the audio is never AI-generated — only curated, reviewed scripts are used

## Tasks / Subtasks

- [ ] **Task 1: Audio script template system** (AC: #1, #2, #4, #5)
  - [ ] 1.1 Create `apps/lab-lite/src/lib/audio-result-scripts.ts` — script registry mapping test categories to audio explanations:
    ```typescript
    export interface AudioResultScript {
      id: string                    // e.g. "cbc-hemoglobin-low"
      testCategory: string          // LOINC category code
      resultField: string           // specific analyte (e.g. "hemoglobin")
      interpretation: 'normal' | 'low' | 'high' | 'critical-low' | 'critical-high'
      version: string               // e.g. "1.0.0"
      approvedBy: string            // physician who approved the script
      approvedAt: string            // ISO 8601
      audioFiles: Record<string, string>  // locale -> file path
      plainTextScripts: Record<string, string> // locale -> plain language text (fallback if audio fails)
    }
    ```
  - [ ] 1.2 Create the initial script registry with entries for each LOINC category in `loinc-categories.ts` (CBC, Lipid Panel, HbA1c, Basic Metabolic Panel, Liver Function, TSH, Urinalysis, Fasting Glucose) x each interpretation level (normal, low, high, critical-low, critical-high)
  - [ ] 1.3 Each script entry references 4 audio files (one per locale: en, ar, prs, ps) stored in `apps/lab-lite/public/audio/results/`
  - [ ] 1.4 Plain-text fallback scripts are stored in the registry for cases where audio playback fails (device speaker issues, etc.)
  - [ ] 1.5 Add a `SCRIPT_MANIFEST_VERSION` constant to track the overall script bundle version for cache invalidation

- [ ] **Task 2: Audio file organization and Service Worker precaching** (AC: #4)
  - [ ] 2.1 Create directory structure: `apps/lab-lite/public/audio/results/{category}/{interpretation}-{locale}.mp3` — e.g. `public/audio/results/cbc/hemoglobin-low-prs.mp3`
  - [ ] 2.2 For MVP, create placeholder audio files (short silence or TTS-generated placeholders) that will be replaced with physician-recorded audio. Document the recording workflow in the dev notes.
  - [ ] 2.3 Register all audio files in the Service Worker precache manifest (`apps/lab-lite/src/app/sw.ts`) — these files must be available offline
  - [ ] 2.4 Total audio budget estimate: 8 test categories x 5 interpretation levels x 4 locales x ~30KB avg = ~4.8MB. Verify this fits within the PWA cache budget.
  - [ ] 2.5 Implement a versioned manifest check: when `SCRIPT_MANIFEST_VERSION` changes, the SW updates the audio cache

- [ ] **Task 3: Color-coded result indicator component** (AC: #3)
  - [ ] 3.1 Create `apps/lab-lite/src/components/results/ResultColorIndicator.tsx` — visual indicator showing result interpretation as a color:
    - Green (`#16A34A`): normal range
    - Yellow (`#EAB308`): slightly abnormal (low or high, not critical)
    - Red (`#DC2626`): critical (critical-low or critical-high)
  - [ ] 3.2 Render as a colored dot/pill next to each result field with the interpretation label in the patient's language
  - [ ] 3.3 Include an accessible label (`aria-label`) with the interpretation text for screen readers
  - [ ] 3.4 Colors must be paired with text labels and icon shapes (circle-check for green, triangle-alert for yellow, octagon-x for red) for colorblind accessibility
  - [ ] 3.5 The component accepts: `interpretation: 'normal' | 'low' | 'high' | 'critical-low' | 'critical-high'` and maps to the color/icon

- [ ] **Task 4: Audio result player component** (AC: #1, #2)
  - [ ] 4.1 Create `apps/lab-lite/src/components/results/AudioResultPlayer.tsx` — plays the pre-recorded audio explanation for a specific result field
  - [ ] 4.2 Props: `testCategory: string`, `resultField: string`, `interpretation: string`, `locale: string`
  - [ ] 4.3 Resolves the correct audio file from the script registry (Task 1)
  - [ ] 4.4 UI: large play button (thumb-friendly, 48px minimum touch target), progress bar, replay button
  - [ ] 4.5 If audio file is not found or fails to load, display the plain-text fallback script in large, readable font
  - [ ] 4.6 Uses HTML5 `<audio>` element — no streaming dependency, file served from local cache
  - [ ] 4.7 Auto-play is NOT enabled — the patient must explicitly tap the play button (respect user control)
  - [ ] 4.8 Volume control: respect device volume, no app-level volume control needed

- [ ] **Task 5: Result summary view with audio integration** (AC: #1, #2, #3)
  - [ ] 5.1 Create `apps/lab-lite/src/components/results/PatientResultSummary.tsx` — a patient-facing result summary component designed for low-literacy users
  - [ ] 5.2 For each result field: show the test name (localized plain language, not LOINC code), the color indicator (Task 3), and the audio play button (Task 4)
  - [ ] 5.3 Layout: vertical stack of result cards, each card containing: icon representing the test type, plain-language test name, color indicator, audio play button, and optional plain-text explanation (expandable)
  - [ ] 5.4 Do NOT show raw numeric values or reference ranges in the patient view — these are for the clinician view only. The patient sees: test name + color + audio explanation.
  - [ ] 5.5 Add a "Play All" button at the top that sequentially plays all audio explanations for the patient's results
  - [ ] 5.6 This component is designed for integration into Patient-Lite's result view — Lab-Lite builds it, Patient-Lite consumes it. Export as a shared component or document the contract for Patient-Lite to replicate.

- [ ] **Task 6: Integration with result authorization flow** (AC: #1)
  - [ ] 6.1 When a result is authorized (Story 42.5), generate the interpretation mapping (normal/low/high/critical) for each result field based on reference ranges
  - [ ] 6.2 Store the interpretation alongside the result in Dexie so the audio script can be resolved without re-computing
  - [ ] 6.3 Create `apps/lab-lite/src/lib/result-interpretation.ts` — function `interpretResult(value: number, referenceRange: { low: number, high: number, criticalLow?: number, criticalHigh?: number }): Interpretation` that returns the interpretation level

- [ ] **Task 7: Script versioning and physician approval tracking** (AC: #4, #5)
  - [ ] 7.1 Each audio script entry includes `version`, `approvedBy`, and `approvedAt` fields — these are set when the physician records and approves the script
  - [ ] 7.2 When a script is updated (new version), the old version's audio files are retained in the cache until the next major SW update cycle — ensures patients who accessed results under the old version can still play them
  - [ ] 7.3 Add a metadata display on the clinician-facing result view: "Audio script v1.0.0, approved by Dr. [Name] on [Date]" — visible to clinicians, not patients
  - [ ] 7.4 NEVER auto-generate audio scripts — the registry enforces that every script has a physician-approved version. Scripts without an approved version show the plain-text fallback only.

- [ ] **Task 8: i18n** (AC: #1, #2)
  - [ ] 8.1 Add translation keys in all 4 locale files under `results.audio` namespace:
    - `results.audio.playExplanation`, `results.audio.replay`, `results.audio.playAll`, `results.audio.audioUnavailable`
    - `results.audio.interpretation.normal`, `.low`, `.high`, `.criticalLow`, `.criticalHigh`
    - Plain-language test names: `results.audio.testName.cbc`, `.lipidPanel`, `.hba1c`, `.metabolicPanel`, `.liverFunction`, `.tsh`, `.urinalysis`, `.fastingGlucose`
    - Plain-language result explanations (used as text fallback): `results.audio.explanation.{category}.{interpretation}` — e.g. `results.audio.explanation.cbc.hemoglobin.low` = "Your blood strength is a little low..."

- [ ] **Task 9: Tests** (AC: all)
  - [ ] 9.1 Unit test: Audio script registry resolves correct audio file per test category + interpretation + locale
  - [ ] 9.2 Unit test: `interpretResult()` correctly maps values to interpretation levels including edge cases (exactly at boundary, below critical, above critical)
  - [ ] 9.3 Unit test: Script registry rejects entries without `approvedBy` (no un-approved scripts)
  - [ ] 9.4 Component test: ResultColorIndicator — renders correct color+icon for each interpretation level
  - [ ] 9.5 Component test: AudioResultPlayer — plays correct audio file, shows fallback text on audio error
  - [ ] 9.6 Component test: PatientResultSummary — renders all result fields with color indicators and audio buttons, does NOT show raw numeric values
  - [ ] 9.7 Component test: "Play All" button sequentially plays all audio files
  - [ ] 9.8 Data minimization test: PatientResultSummary does NOT render raw numeric values, reference ranges, or LOINC codes — only plain-language names + colors + audio
  - [ ] 9.9 RTL snapshot test: ResultColorIndicator, AudioResultPlayer, PatientResultSummary in LTR and RTL
  - [ ] 9.10 Offline test: verify audio playback works from SW cache without network
  - [ ] 9.11 AI prohibition test: verify no script entry has `approvedBy` set to an AI/automated value (enforce the "never AI-generated" rule programmatically)

## Dev Notes

### NEVER AI-Generated Audio — This Is a Hard Rule

Per AC #5 and CLAUDE.md healthcare safety rules, audio result explanations are NEVER auto-generated by AI. Every audio script must be:
1. Written by a physician in plain language
2. Recorded by a human (physician or professional narrator)
3. Reviewed and approved by a physician (tracked via `approvedBy` and `approvedAt`)
4. Versioned for traceability

The `AudioResultScript` registry enforces this by requiring `approvedBy` and `approvedAt` fields. The build/test pipeline should assert that no script entry has these fields empty or set to automated values.

### Plain Language Guidelines

The audio scripts follow plain language principles for low-literacy audiences:
- **No medical jargon:** "Blood strength" not "hemoglobin", "Sugar level" not "glucose", "Liver health check" not "hepatic panel"
- **No numbers:** Patients hear "a little low" or "in the healthy range", not "9.2 g/dL"
- **Action-oriented:** Always end with what the patient should do: "Your doctor will discuss this with you" or "No action needed, your results are healthy"
- **Reassuring tone:** Even abnormal results should not cause panic. "This is not dangerous right now, but your doctor needs to talk with you about it."
- **Short:** Each explanation is 15-30 seconds of audio (roughly 3-5 sentences)

### Color-Coded Result Indicators

The green/yellow/red system maps to clinical interpretation:
- **Green (normal):** Value is within the reference range
- **Yellow (low or high):** Value is outside the reference range but not in the critical zone
- **Red (critical-low or critical-high):** Value is in the critical/panic range

This mapping is derived from the reference ranges stored with the lab result. The `interpretResult()` function in `result-interpretation.ts` performs this mapping.

### Audio File Production Workflow

For initial development, create placeholder audio files (silent or TTS-generated) to unblock UI development. The production audio recording workflow:

1. Physician writes plain-language script in English
2. Script is translated to Dari, Pashto, Arabic by medical translators
3. Scripts are recorded by native speakers (or the physician for English)
4. Recordings are reviewed and approved by the supervising physician
5. Audio files are encoded as MP3 (128kbps, mono, ~30KB per 30-second clip)
6. Files are added to `public/audio/results/` and the script registry is updated

### Integration with Patient-Lite

The `PatientResultSummary` component is built in Lab-Lite but designed for consumption in Patient-Lite's result view. Options:
- **Option A (recommended):** Build the component in `packages/ui-kit/` so both apps can import it
- **Option B:** Build in Lab-Lite, document the contract, and have Patient-Lite reimplement with the same design

The audio files and script registry would need to be duplicated in Patient-Lite's public assets, or served from a shared CDN / Hub endpoint.

### Service Worker Audio Cache Budget

Estimated audio asset size: 8 categories x 5 interpretations x 4 locales x 30KB = ~4.8MB. This is well within typical PWA cache limits (50-100MB). However, as the test menu grows, this will scale linearly. Consider lazy-loading audio for less common tests in future iterations.

### Relationship to LOINC Categories

The audio scripts map to the test categories defined in `apps/lab-lite/src/lib/loinc-categories.ts`. Each LOINC category has multiple result fields (e.g., CBC has hemoglobin, WBC, platelets, etc.). For MVP, create one summary audio per category per interpretation level. Per-analyte audio can be added in future iterations.

### Project Structure Notes

- New components: `apps/lab-lite/src/components/results/ResultColorIndicator.tsx`, `apps/lab-lite/src/components/results/AudioResultPlayer.tsx`, `apps/lab-lite/src/components/results/PatientResultSummary.tsx`
- New files: `apps/lab-lite/src/lib/audio-result-scripts.ts`, `apps/lab-lite/src/lib/result-interpretation.ts`, `apps/lab-lite/public/audio/results/` directory tree
- Modified files: `apps/lab-lite/src/app/sw.ts` (precache audio files), all 4 locale message files (result audio translations)

### References

- CLAUDE.md: Healthcare safety rules — AI-generated clinical content requires physician confirmation gate; drug/clinical content must never be auto-committed
- `apps/lab-lite/src/lib/loinc-categories.ts` — test categories that need audio scripts
- Story 42.5: Result Authorization Workflow — integration point for interpretation generation
- Story 45.1: Consent capture — audio playback pattern reference
- `apps/lab-lite/src/app/sw.ts` — Service Worker for offline audio caching
- WCAG AA: color indicators must be paired with shapes/text for colorblind accessibility
