import { useTranslation } from 'react-i18next'
import { formatGp } from '@/shared/lib/money'

/** Formats gp for the interface language: whole amounts without decimals, else two. */
export function useGp() {
  const { i18n } = useTranslation()
  return (value: number) => formatGp(value, i18n.language)
}
