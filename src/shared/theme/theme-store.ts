import { useSyncExternalStore } from 'react'
import {
  normalizeClassTheme,
  resolveClassTheme,
  themeScheme,
  type ClassThemeId,
} from './class-themes'

/** Local preference key; index.html reads it before the first paint. */
export const classThemeKey = 'rytta-theme'
/** Pre-RYT-069 color scheme preference, read only to migrate a light default to Parchment. */
export const legacySchemeKey = 'rytta-color-scheme'

function readStored(): ClassThemeId {
  try {
    return resolveClassTheme(
      localStorage.getItem(classThemeKey),
      localStorage.getItem(legacySchemeKey),
    )
  } catch {
    return 'default'
  }
}

let current: ClassThemeId = typeof window === 'undefined' ? 'default' : readStored()
const listeners = new Set<() => void>()

/** The theme and its scheme change together, so tokens never paint the wrong scheme. */
function paint(id: ClassThemeId) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.ryttaTheme = id
  document.documentElement.dataset.mantineColorScheme = themeScheme(id)
}
paint(current)

export function getClassTheme() {
  return current
}

/** Applies a theme (and its scheme) immediately and persists it when storage is available. */
export function setClassTheme(value: ClassThemeId) {
  current = normalizeClassTheme(value)
  paint(current)
  try {
    localStorage.setItem(classThemeKey, current)
    // An explicit choice replaces the legacy scheme, so Hearth stays Hearth on the next visit.
    localStorage.removeItem(legacySchemeKey)
  } catch {
    /* The theme still applies in memory when storage is blocked. */
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useClassTheme(): ClassThemeId {
  return useSyncExternalStore(subscribe, getClassTheme, () => 'default')
}
