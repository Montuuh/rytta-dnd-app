/** RYT-125: one date format for ledgers, orders and trade history ("17 nov 2026, 14:18"). */
export const formatWhen = (value: string | number | Date, language: string) =>
  new Date(value).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' })
