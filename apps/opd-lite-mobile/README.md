# OPD Lite Mobile

Mobile clinician application for field General Practitioners operating in rural and offline-prone environments across MENA and Central Asia.

## Purpose

OPD Lite Mobile provides offline-first clinical tools for field GPs conducting outreach visits, community health assessments, and primary care consultations outside fixed clinic settings. It is the mobile counterpart to OPD Lite Desktop, optimized for Android devices with limited connectivity.

## Target User

**Field General Practitioners** — clinicians providing primary care in rural areas, refugee camps, and mobile health units where reliable internet is unavailable.

## Architecture Role

OPD Lite Mobile is a **clinician spoke** in the Ultranos hub-and-spoke architecture. It operates as an offline-first node that syncs asynchronously with the Central Hub API.

- **Local storage:** SQLCipher-encrypted SQLite database
- **Key management:** Android Keystore for encryption key storage
- **Sync:** Asynchronous via the shared sync engine with HLC timestamps
- **Auth:** Biometric + TOTP for clinician access

## Status

**Scaffolded only.** Active development is deferred to a future release cycle.

This directory contains the minimal Expo project shell with correct workspace dependencies. No clinical functionality, local database, or sync integration is implemented.

For mobile identity verification requirements that will apply when this app is activated, see **Story 1.4: Mobile Identity Verification** (BACKLOG).

## Future Dependencies

When active development begins, the following will be added:

- `expo-sqlite` with SQLCipher for encrypted local storage
- `expo-secure-store` for credential and key management
- `expo-local-authentication` for biometric auth
- Full sync engine integration with offline queue
- Drug interaction checker (offline subset)

## Development

```bash
# Install dependencies
pnpm install

# Start Expo dev server
pnpm -F opd-lite-mobile start

# TypeScript check
pnpm -F opd-lite-mobile typecheck
```
