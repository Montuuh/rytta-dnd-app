import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProgressionNames } from '../domain/progression'
import type { Tracker } from '../domain/sheet'

type ResourceKey = 'panel.resource.monk-focus'
const nameKey = (key: string) => `panel.resource.${key}` as ResourceKey

/**
 * Resources Rytta adds are stored under their key and translated when drawn, so a sheet reads in
 * the interface language. Sheets saved before this stored the translated text: they still read
 * correctly (`trackerLabel` prefers the key when the catalogue knows it).
 */
export function useResourceNames(): ProgressionNames {
  const { t } = useTranslation()
  return useMemo(() => ({ resource: (key) => key, match: (key) => [t(nameKey(key))] }), [t])
}

/** The name to show for a resource: translated for keyed ones, as written for the player's own. */
export function useTrackerLabel() {
  const { t, i18n } = useTranslation()
  return (tracker: Pick<Tracker, 'key' | 'name'>) =>
    tracker.key && i18n.exists(nameKey(tracker.key))
      ? t(nameKey(tracker.key), { defaultValue: tracker.name })
      : tracker.name
}
