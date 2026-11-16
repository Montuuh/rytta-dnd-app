import { z } from 'zod'

// Gold is stored in gp with two decimals: 0.01 gp is one copper piece.
export const MAX_GP = 9_999_999_999.99

export const roundGp = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const hasCentPrecision = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6

export const gpAmount = z
  .number()
  .min(0)
  .max(MAX_GP)
  .refine(hasCentPrecision)
  .transform((value) => roundGp(value))

export const formatGp = (value: number, language: string) =>
  roundGp(value).toLocaleString(language, {
    minimumFractionDigits: Number.isInteger(roundGp(value)) ? 0 : 2,
    maximumFractionDigits: 2,
  })

export const cpToGp = (copper: number) => roundGp(copper / 100)
