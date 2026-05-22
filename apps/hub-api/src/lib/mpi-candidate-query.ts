import type { SupabaseClient } from '@supabase/supabase-js'
import type { MpiCandidate } from '@ultranos/mpi-engine'
import { computePhoneticTokens, normalizeNameComponent } from '@ultranos/mpi-engine'
import { generateBlindIndex } from '@ultranos/crypto/server'
import { getFieldEncryptionKeys } from './field-encryption.js'

export interface MpiQueryInput {
  nameGiven?: string
  nameFather?: string
  nationalId?: string
  tazkiraPaperHash?: string
  biometricFingerprintHash?: string
  birthYear?: number
  addressDistrictOrigin?: string
  phone?: string
}

export async function fetchMpiCandidates(
  supabase: SupabaseClient,
  input: MpiQueryInput,
): Promise<MpiCandidate[]> {
  const { hmacKey } = getFieldEncryptionKeys()

  const phoneticGiven  = input.nameGiven  ? computePhoneticTokens(normalizeNameComponent(input.nameGiven))  : []
  const phoneticFather = input.nameFather ? computePhoneticTokens(normalizeNameComponent(input.nameFather)) : []

  const nationalIdHash = input.nationalId
    ? generateBlindIndex(input.nationalId, hmacKey)
    : null

  const rpcInput = {
    phoneticGiven,
    phoneticFather,
    ...(nationalIdHash !== null ? { nationalIdHash } : {}),
    tazkiraPaperHash:         input.tazkiraPaperHash,
    biometricFingerprintHash: input.biometricFingerprintHash,
    birthYear:                input.birthYear,
    addressDistrictOrigin:    input.addressDistrictOrigin,
    phone:                    input.phone,
  }

  const { data, error } = await supabase.rpc('fetch_mpi_candidates', { p_input: rpcInput })

  if (error) {
    console.error('[MPI_CANDIDATE_QUERY] RPC error:', { code: error.code })
    throw new Error('MPI candidate query failed')
  }

  if (!data) return []

  return (data as Record<string, unknown>[]).map((row) => ({
    id:                       String(row['id'] ?? ''),
    nameGiven:                row['name_given'] as string | undefined,
    nameFather:               row['name_father'] as string | undefined,
    nameGrandfather:          row['name_grandfather'] as string | undefined,
    namePhoneticGiven:        row['name_phonetic_given'] as string[] | undefined,
    namePhoneticFather:       row['name_phonetic_father'] as string[] | undefined,
    namePhoneticGrandfather:  row['name_phonetic_grandfather'] as string[] | undefined,
    birthYear:                row['birth_year'] as number | undefined,
    gender:                   row['gender'] as string | undefined,
    addressDistrictOrigin:    row['address_district_origin'] as string | undefined,
    addressProvinceOrigin:    row['address_province_origin'] as string | undefined,
    phone:                    row['phone'] as string | undefined,
    nationalIdHash:           row['national_id_hash'] as string | undefined,
    tazkiraPaperHash:         row['tazkira_paper_hash'] as string | undefined,
    biometricFingerprintHash: row['biometric_fingerprint_hash'] as string | undefined,
  }))
}
