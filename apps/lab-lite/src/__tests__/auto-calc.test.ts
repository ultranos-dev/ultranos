import { describe, it, expect } from 'vitest'
import { computeAutoFields } from '../lib/auto-calc'
import { TEMPLATE_REGISTRY } from '../lib/result-templates'

const CBC = TEMPLATE_REGISTRY['58410-2']
const LIPID = TEMPLATE_REGISTRY['57698-3']
const HBA1C = TEMPLATE_REGISTRY['4548-4']
const BMP = TEMPLATE_REGISTRY['51990-0']
const LFT = TEMPLATE_REGISTRY['24325-3']

describe('computeAutoFields — CBC', () => {
  it('computes MCV, MCH, MCHC from HGB, HCT, RBC', () => {
    const values: Record<string, number | null> = {
      hgb: 15.0,
      hct: 45.0,
      rbc: 5.0,
      wbc: 7.0,
      plt: 250,
      mcv: null,
      mch: null,
      mchc: null,
    }
    const result = computeAutoFields(values, CBC)

    // MCV = (Hct / RBC) * 10 = (45 / 5) * 10 = 90
    expect(result.mcv).toBeCloseTo(90.0, 1)
    // MCH = (Hgb / RBC) * 10 = (15 / 5) * 10 = 30
    expect(result.mch).toBeCloseTo(30.0, 1)
    // MCHC = (Hgb / Hct) * 100 = (15 / 45) * 100 = 33.3
    expect(result.mchc).toBeCloseTo(33.3, 1)
  })

  it('returns null for MCV when RBC is null', () => {
    const values: Record<string, number | null> = {
      hgb: 15.0,
      hct: 45.0,
      rbc: null,
      wbc: 7.0,
      plt: 250,
      mcv: null,
      mch: null,
      mchc: null,
    }
    const result = computeAutoFields(values, CBC)
    expect(result.mcv).toBeNull()
    expect(result.mch).toBeNull()
  })

  it('returns null for MCHC when HCT is null', () => {
    const values: Record<string, number | null> = {
      hgb: 15.0,
      hct: null,
      rbc: 5.0,
      wbc: 7.0,
      plt: 250,
      mcv: null,
      mch: null,
      mchc: null,
    }
    const result = computeAutoFields(values, CBC)
    expect(result.mchc).toBeNull()
  })

  it('returns null for MCV when RBC is 0 (division guard)', () => {
    const values: Record<string, number | null> = {
      hgb: 15.0,
      hct: 45.0,
      rbc: 0,
      wbc: 7.0,
      plt: 250,
      mcv: null,
      mch: null,
      mchc: null,
    }
    const result = computeAutoFields(values, CBC)
    expect(result.mcv).toBeNull()
    expect(result.mch).toBeNull()
  })

  it('rounds MCV to decimalPrecision=1', () => {
    // MCV = (43.5 / 4.7) * 10 = 92.5531...  → rounds to 92.6
    const values: Record<string, number | null> = {
      hgb: 14.0,
      hct: 43.5,
      rbc: 4.7,
      wbc: 7.0,
      plt: 250,
      mcv: null,
      mch: null,
      mchc: null,
    }
    const result = computeAutoFields(values, CBC)
    expect(result.mcv).toBeCloseTo(92.6, 1)
  })
})

describe('computeAutoFields — Lipid Panel', () => {
  it('computes VLDL and TC/HDL Ratio', () => {
    const values: Record<string, number | null> = {
      tc: 200,
      tg: 150,
      hdl: 50,
      ldl: 120,
      vldl: null,
      tc_hdl_ratio: null,
    }
    const result = computeAutoFields(values, LIPID)

    // VLDL = TG / 5 = 150 / 5 = 30
    expect(result.vldl).toBeCloseTo(30, 0)
    // TC/HDL Ratio = TC / HDL = 200 / 50 = 4.0
    expect(result.tc_hdl_ratio).toBeCloseTo(4.0, 2)
  })

  it('returns null for TC/HDL Ratio when HDL is null', () => {
    const values: Record<string, number | null> = {
      tc: 200,
      tg: 150,
      hdl: null,
      ldl: 120,
      vldl: null,
      tc_hdl_ratio: null,
    }
    const result = computeAutoFields(values, LIPID)
    expect(result.tc_hdl_ratio).toBeNull()
  })

  it('returns null for TC/HDL Ratio when HDL is 0 (division guard)', () => {
    const values: Record<string, number | null> = {
      tc: 200,
      tg: 150,
      hdl: 0,
      ldl: 120,
      vldl: null,
      tc_hdl_ratio: null,
    }
    const result = computeAutoFields(values, LIPID)
    expect(result.tc_hdl_ratio).toBeNull()
  })
})

describe('computeAutoFields — HbA1c', () => {
  it('computes eAG from HbA1c', () => {
    const values: Record<string, number | null> = {
      hba1c: 7.0,
      eag: null,
    }
    const result = computeAutoFields(values, HBA1C)
    // eAG = (28.7 * 7.0) - 46.7 = 200.9 - 46.7 = 154.2
    expect(result.eag).toBeCloseTo(154.2, 0)
  })

  it('returns null for eAG when HbA1c is null', () => {
    const values: Record<string, number | null> = { hba1c: null, eag: null }
    const result = computeAutoFields(values, HBA1C)
    expect(result.eag).toBeNull()
  })
})

describe('computeAutoFields — BMP', () => {
  it('computes BUN/Creatinine Ratio and Anion Gap', () => {
    const values: Record<string, number | null> = {
      glucose: 90,
      bun: 15,
      creatinine: 1.0,
      sodium: 140,
      potassium: 4.0,
      chloride: 102,
      co2: 24,
      calcium: 9.5,
      bun_cr_ratio: null,
      anion_gap: null,
    }
    const result = computeAutoFields(values, BMP)

    // BUN/Cr Ratio = 15 / 1.0 = 15
    expect(result.bun_cr_ratio).toBeCloseTo(15.0, 1)
    // Anion Gap = Na - (Cl + CO2) = 140 - (102 + 24) = 14
    expect(result.anion_gap).toBeCloseTo(14, 0)
  })

  it('returns null for Anion Gap when CO2 is null', () => {
    const values: Record<string, number | null> = {
      glucose: 90,
      bun: 15,
      creatinine: 1.0,
      sodium: 140,
      potassium: 4.0,
      chloride: 102,
      co2: null,
      calcium: 9.5,
      bun_cr_ratio: null,
      anion_gap: null,
    }
    const result = computeAutoFields(values, BMP)
    expect(result.anion_gap).toBeNull()
  })
})

describe('computeAutoFields — LFT', () => {
  it('computes Indirect Bilirubin', () => {
    const values: Record<string, number | null> = {
      alt: 35,
      ast: 30,
      alp: 80,
      tbil: 1.0,
      dbil: 0.2,
      albumin: 4.0,
      tp: 7.0,
      ibil: null,
    }
    const result = computeAutoFields(values, LFT)
    // Indirect Bil = Total Bil - Direct Bil = 1.0 - 0.2 = 0.8
    expect(result.ibil).toBeCloseTo(0.8, 2)
  })
})

describe('computeAutoFields — non-auto-calc fields unchanged', () => {
  it('does not modify manually entered non-auto-calc values', () => {
    const values: Record<string, number | null> = {
      hgb: 15.0,
      hct: 45.0,
      rbc: 5.0,
      wbc: 7.5,
      plt: 300,
      mcv: null,
      mch: null,
      mchc: null,
    }
    const result = computeAutoFields(values, CBC)
    expect(result.wbc).toBe(7.5)
    expect(result.plt).toBe(300)
    expect(result.hgb).toBe(15.0)
  })
})
