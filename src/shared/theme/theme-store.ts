import { useSyncExternalStore } from 'react'
import { normalizeClassTheme, type ClassThemeId } from './class-themes'

/** Local preference key; index.html reads it before the first paint. */
export const classThemeKey = 'rytta-theme'

function readStored(): ClassThemeId {
  try {
    return normalizeClassTheme(localStorage.getItem(classThemeKey))
  } catch {
    return 'default'
  }
}

let current: ClassThemeId = typeof window === 'undefined' ? 'default' : readStored()
const listeners = new Set<() => void>()

function paint(id: ClassThemeId) {
  if (typeof document !== 'undefined') document.documentElement.dataset.ryttaTheme = id
}
paint(current)

export function getClassTheme() {
  return current
}

/** Applies a class theme immediately and persists it when storage is available. */
export function setClassTheme(value: ClassThemeId) {
  current = normalizeClassTheme(value)
  paint(current)
  try {
    localStorage.setItem(classThemeKey, current)
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
