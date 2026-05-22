export const WEIGHTS = {
  GIVEN_NAME_HIGH:        30,  // Jaro-Winkler ≥ 0.92 on normalized form
  GIVEN_NAME_LOW:         15,  // Jaro-Winkler 0.85–0.91
  FATHER_NAME_HIGH:       30,
  FATHER_NAME_LOW:        15,
  GRANDFATHER_NAME_HIGH:  20,
  GRANDFATHER_NAME_LOW:   10,
  BIRTH_YEAR_EXACT:       20,
  BIRTH_YEAR_NEAR:         8,  // ±1–2 years (handles approximate DOB)
  GENDER_EXACT:           10,
  DISTRICT_ORIGIN_EXACT:  20,
  PROVINCE_ORIGIN_EXACT:   5,  // only when district does NOT match
  PHONE_EXACT:            25,
} as const

export const THRESHOLDS = {
  BLOCK: 90,
  WARN:  60,
} as const
