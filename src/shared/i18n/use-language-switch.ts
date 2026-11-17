import { useCallback, useRef, useState } from 'react'
import { switchLanguage, type Language } from './index'

/**
 * Switches the interface language transactionally: `pending` is the language being loaded and
 * `failed` the one that could not be, while the current language stays selected and shown.
 */
export function useLanguageSwitch() {
  const [pending, setPending] = useState<Language | null>(null)
  const [failed, setFailed] = useState<Language | null>(null)
  const latest = useRef<Language | null>(null)
  const choose = useCallback(async (language: Language) => {
    latest.current = language
    setPending(language)
    const ok = await switchLanguage(language)
    // A newer choice owns the state.
    if (latest.current !== language) return
    setPending(null)
    setFailed(ok ? null : language)
  }, [])
  return { pending, failed, choose }
}
