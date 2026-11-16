import { useSyncExternalStore } from 'react'

// Weights are stored in pounds with three decimals. Kilograms are presentation only and use
// the conversion of the Spanish rulebooks: 1 lb = 0.5 kg.
export type WeightUnit = 'kg' | 'lb'

export const KG_PER_LB = 0.5
const STORAGE_KEY = 'rytta.weight-unit'

const round3 = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000

export const lbToKg = (pounds: number) => round3(pounds * KG_PER_LB)
export const kgToLb = (kilograms: number) => round3(kilograms / KG_PER_LB)
export const fromPounds = (pounds: number, unit: WeightUnit) =>
  unit === 'kg' ? lbToKg(pounds) : round3(pounds)
export const toPounds = (value: number, unit: WeightUnit) =>
  unit === 'kg' ? kgToLb(value) : round3(value)

export const defaultWeightUnit = (language: string): WeightUnit =>
  language.toLowerCase().startsWith('en') ? 'lb' : 'kg'

export const formatWeightValue = (
  pounds: number,
  unit: WeightUnit,
  language: string,
  maximumFractionDigits = 2,
) => fromPounds(pounds, unit).toLocaleString(language, { maximumFractionDigits })

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

// The preference belongs to the signed-in account: each user of a shared device keeps their own.
// Signed out (or in the demo) it is the device's.
let owner: string | null = null
const storageKey = () => (owner ? `${STORAGE_KEY}:${owner}` : STORAGE_KEY)

/** Called when the signed-in identity changes, so the unit follows the account. */
export const setWeightUnitOwner = (userId: string | null) => {
  if (owner === userId) return
  owner = userId
  notify()
}

const readStored = (): WeightUnit | null => {
  try {
    const stored = window.localStorage.getItem(storageKey())
    return stored === 'kg' || stored === 'lb' ? stored : null
  } catch {
    return null
  }
}

/** Saves the unit, or forgets it (`null`) so it follows the interface language again. */
export const setWeightUnit = (unit: WeightUnit | null) => {
  try {
    if (unit) window.localStorage.setItem(storageKey(), unit)
    else window.localStorage.removeItem(storageKey())
  } catch {
    // The preference stays for this page only when storage is unavailable.
  }
  notify()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The unit the user chose, or `null` while it follows the interface language. */
export const useStoredWeightUnit = (): WeightUnit | null =>
  useSyncExternalStore(subscribe, readStored, () => null)

/** The chosen unit, or the default of the interface language when none was chosen. */
export const useWeightUnit = (language: string): WeightUnit =>
  useStoredWeightUnit() ?? defaultWeightUnit(language)
