# Audio Result Explanations — Physician-Approved Scripts

This directory holds plain-language audio explanations for lab results, designed for
low-literacy patients (Story 45.4).

## Directory Structure

```
results/
├── cbc/         # Blood Work — CBC (LOINC 58410-2)
├── lipid/       # Lipid Panel (LOINC 57698-3)
├── hba1c/       # HbA1c (LOINC 4548-4)
├── bmp/         # Basic Metabolic Panel (LOINC 51990-0)
├── liver/       # Liver Function Tests (LOINC 24325-3)
├── tsh/         # Thyroid — TSH (LOINC 3016-3)
├── ua/          # Urinalysis (LOINC 24356-8)
└── fbs/         # Fasting Glucose (LOINC 1558-6)
```

## File Naming Convention

```
{analyte}-{interpretation}-{locale}.mp3
```

Examples:
- `cbc/cbc-normal-en.mp3`
- `cbc/cbc-low-prs.mp3`
- `lipid/lipidPanel-critical-high-ar.mp3`

Locales: `en` (English), `ar` (Arabic), `prs` (Dari), `ps` (Pashto)

Interpretations: `normal`, `low`, `high`, `critical-low`, `critical-high`

## HARD RULE — Never AI-Generated

All audio files MUST be:
1. Written by a physician in plain language
2. Recorded by a human (physician or professional narrator)
3. Reviewed and approved by a physician (tracked in `audio-result-scripts.ts` via
   `approvedBy` and `approvedAt` fields)
4. Versioned for traceability

## Audio Specifications

- Format: MP3, 128 kbps, mono
- Duration: 15–30 seconds (~30 KB per file)
- Total budget: 8 categories × 5 interpretations × 4 locales × 30 KB ≈ 4.8 MB

## Recording Workflow (Production)

1. Physician writes plain-language script in English
2. Medical translators translate to Dari, Pashto, Arabic
3. Scripts recorded by native speakers
4. Supervising physician reviews and approves
5. Files encoded as MP3 and added here
6. `audio-result-scripts.ts` updated with `approvedBy` and `approvedAt`

## MVP Placeholder Files

MVP placeholder files are silent 1-second MP3 clips. They unblock UI development
while physician recording is pending. Placeholders will not play in production
because `isScriptApproved()` returns false for entries without `approvedBy`.
