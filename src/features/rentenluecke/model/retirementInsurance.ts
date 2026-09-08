import type { RetirementIncomeStream, RetirementIncomeStreamKind } from './types'

export type InsuranceStatus = 'kvdr' | 'voluntary' | 'unknown'
export type InsuranceTreatment = 'include' | 'exclude' | 'review'
export type InsuranceRates = {
  pensionKv: number
  generalKv: number
  passiveKv: number
  pv: number
}
export type RetirementInsurance = {
  enabled: boolean
  status: InsuranceStatus
  rates: InsuranceRates
  portfolioBaseMonthlyToday: number
}

export const INSURANCE_REFERENCE = {
  year: 2026,
  verifiedOn: '2026-09-08',
  rates: { pensionKv: 0.0875, generalKv: 0.175, passiveKv: 0.169, pv: 0.036 },
  childlessPv: 0.042,
  sources: {
    bmgContributions: 'https://www.bundesgesundheitsministerium.de/beitraege',
    bmgCare: 'https://www.bundesgesundheitsministerium.de/themen/pflege/online-ratgeber-pflege/die-pflegeversicherung/finanzierung.html',
    drv: 'https://www.deutsche-rentenversicherung.de/DRV/DE/Rente/In-der-Rente/Kranken-und-Pflegeversicherung-der-Rentner/kranken-und-pflegeversicherung-der-rentner.html',
  },
} as const

export function createDefaultRetirementInsurance(): RetirementInsurance {
  return { enabled: false, status: 'unknown', rates: { ...INSURANCE_REFERENCE.rates }, portfolioBaseMonthlyToday: 0 }
}

// Planning defaults, deliberately not an eligibility or contribution-liability engine.
export const INSURANCE_DEFAULT_MATRIX: Record<InsuranceStatus, Record<RetirementIncomeStreamKind, InsuranceTreatment>> = {
  kvdr: {
    'gesetzliche-rente': 'include', betriebsrente: 'include', 'private-rente': 'review',
    'rental-income': 'exclude', 'side-income': 'review', 'bridge-income': 'review', other: 'review',
  },
  voluntary: {
    'gesetzliche-rente': 'include', betriebsrente: 'include', 'private-rente': 'include',
    'rental-income': 'include', 'side-income': 'include', 'bridge-income': 'review', other: 'review',
  },
  unknown: {
    'gesetzliche-rente': 'review', betriebsrente: 'review', 'private-rente': 'review',
    'rental-income': 'review', 'side-income': 'review', 'bridge-income': 'review', other: 'review',
  },
}

export function getInsuranceTreatment(stream: RetirementIncomeStream, status: InsuranceStatus): InsuranceTreatment {
  return stream.insuranceTreatment ?? INSURANCE_DEFAULT_MATRIX[status][stream.kind ?? 'other']
}

export function getStreamInsuranceRates(stream: RetirementIncomeStream, rates: InsuranceRates) {
  const defaultKv = stream.kind === 'gesetzliche-rente' ? rates.pensionKv
    : stream.kind === 'private-rente' || stream.kind === 'rental-income' ? rates.passiveKv : rates.generalKv
  return { kv: stream.kvRateOverride ?? defaultKv, pv: stream.pvRateOverride ?? rates.pv }
}

export type InsuranceWarning = { code: 'unknown-status' | 'review-stream' | 'combined-haircut'; streamId?: string }
export function getInsuranceWarnings(streams: readonly RetirementIncomeStream[], insurance: RetirementInsurance): InsuranceWarning[] {
  if (!insurance.enabled) return []
  const warnings: InsuranceWarning[] = insurance.status === 'unknown' ? [{ code: 'unknown-status' }] : []
  for (const stream of streams) {
    if (getInsuranceTreatment(stream, insurance.status) === 'review') warnings.push({ code: 'review-stream', streamId: stream.id })
    if (stream.amountBasis === 'gross' && !stream.separateDeductions) warnings.push({ code: 'combined-haircut', streamId: stream.id })
  }
  return warnings
}
