import type { HistoryItem } from './sheet'
import { abilityKeys, conditionKeys, skillKeys } from './srd'

/**
 * RYT-070 history lines: each server change (field, before, after) becomes translatable lines.
 * The UI owns the words; this module only decides what is worth saying.
 */
export type HistoryLine =
  | { key: 'number'; field: string; before: number | null; after: number }
  | { key: 'text'; field: string; before: string; after: string }
  | { key: 'toggle'; field: string; on: boolean }
  | { key: 'added' | 'removed'; field: string; name: string }
  | { key: 'edited'; field: string }
  | { key: 'completed' }
  | { key: 'created' }
  | { key: 'slot'; level: number; before: number; after: number }
  | { key: 'tracker'; id: string; before: number; after: number }
  | { key: 'ability'; ability: string; before: number; after: number }
  | { key: 'skill'; skill: string; before: string | null; after: string | null }

export type HistoryFamily = 'hp' | 'play' | 'sheet' | 'identity' | 'resources'

const num = (value: unknown) => (typeof value === 'number' ? value : null)
const str = (value: unknown) => (typeof value === 'string' ? value : '')
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const named = (value: unknown) =>
  list(value).flatMap((item) => {
    const entry = record(item)
    return typeof entry.id === 'string' && typeof entry.name === 'string'
      ? [{ id: entry.id, name: entry.name, max: num(entry.max) }]
      : []
  })

/** Text fields that are long or free-form: the history says they were edited. */
const prose = new Set(['notes', 'appearance', 'languages', 'proficiencies', 'alignment'])
/** Presentation and bookkeeping keys never shown. */
const quiet = new Set([
  'layout',
  'removed',
  'origin',
  'subclassKey',
  'abilityMethod',
  'classLabel',
  'speciesLabel',
  'backgroundLabel',
  'casterKind',
  'spellAbility',
  'hitDie',
])

export function familyOf(item: HistoryItem): HistoryFamily {
  const table = item.kind.split(':')[0]
  if (table === 'character_vitals')
    return item.changes.some((c) => ['current_hp', 'temp_hp'].includes(c.field)) ? 'hp' : 'play'
  if (table === 'character_sheets') return 'sheet'
  if (table === 'character_resources') return 'resources'
  return 'identity'
}

function buildLines(field: string, before: unknown, after: unknown): HistoryLine[] {
  if (quiet.has(field)) return []
  if (prose.has(field)) return [{ key: 'edited', field }]
  if (field === 'baseAbilities' || field === 'bonuses') {
    const a = record(before)
    const b = record(after)
    return abilityKeys.flatMap((ability) => {
      const from = num(a[ability]) ?? 0
      const to = num(b[ability]) ?? 0
      return from === to ? [] : [{ key: 'ability' as const, ability, before: from, after: to }]
    })
  }
  if (field === 'skills') {
    const a = record(before)
    const b = record(after)
    return skillKeys.flatMap((skill) => {
      const from = typeof a[skill] === 'string' ? (a[skill] as string) : null
      const to = typeof b[skill] === 'string' ? (b[skill] as string) : null
      return from === to ? [] : [{ key: 'skill' as const, skill, before: from, after: to }]
    })
  }
  if (field === 'saves') {
    const a = new Set(list(before).map(String))
    const b = new Set(list(after).map(String))
    return [
      ...[...b].filter((x) => !a.has(x)).map((name) => ({ key: 'added' as const, field, name })),
      ...[...a].filter((x) => !b.has(x)).map((name) => ({ key: 'removed' as const, field, name })),
    ]
  }
  if (field === 'features' || field === 'spells' || field === 'trackers') {
    const a = new Map(named(before).map((item) => [item.id, item]))
    const b = new Map(named(after).map((item) => [item.id, item]))
    const lines: HistoryLine[] = [
      ...[...b.values()]
        .filter((item) => !a.has(item.id))
        .map((item) => ({ key: 'added' as const, field, name: item.name })),
      ...[...a.values()]
        .filter((item) => !b.has(item.id))
        .map((item) => ({ key: 'removed' as const, field, name: item.name })),
    ]
    if (field === 'trackers')
      for (const item of b.values()) {
        const old = a.get(item.id)
        if (old && old.max !== null && item.max !== null && old.max !== item.max)
          lines.push({
            key: 'number',
            field: `trackerMax:${item.name}`,
            before: old.max,
            after: item.max,
          })
      }
    return lines
  }
  if (typeof after === 'number' || typeof before === 'number')
    return num(after) === null
      ? []
      : [{ key: 'number', field, before: num(before), after: num(after)! }]
  if (typeof after === 'string' || typeof before === 'string')
    return [{ key: 'text', field, before: str(before), after: str(after) }]
  return [{ key: 'edited', field }]
}

export function describeHistory(item: HistoryItem): HistoryLine[] {
  if (item.kind === 'characters:INSERT') return [{ key: 'created' }]
  const lines: HistoryLine[] = []
  for (const change of item.changes) {
    const { field, before, after } = change
    if (field === 'status') {
      if (after === 'complete') lines.push({ key: 'completed' })
      continue
    }
    if (field.startsWith('build.')) {
      // Completing a draft writes the whole build; the 'completed' line says enough.
      if (before === null && item.changes.some((c) => c.field === 'status')) continue
      lines.push(...buildLines(field.slice(6), before, after))
      continue
    }
    if (field === 'conditions') {
      const a = new Set(list(before).map(String))
      const b = new Set(list(after).map(String))
      for (const key of conditionKeys) {
        if (b.has(key) && !a.has(key)) lines.push({ key: 'added', field, name: key })
        if (a.has(key) && !b.has(key)) lines.push({ key: 'removed', field, name: key })
      }
      continue
    }
    if (field === 'slots_used') {
      const a = list(before)
      const b = list(after)
      b.forEach((value, index) => {
        const from = num(a[index]) ?? 0
        const to = num(value) ?? 0
        if (from !== to) lines.push({ key: 'slot', level: index + 1, before: from, after: to })
      })
      continue
    }
    if (field === 'tracker_uses') {
      const a = record(before)
      const b = record(after)
      for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const from = num(a[id]) ?? 0
        const to = num(b[id]) ?? 0
        if (from !== to) lines.push({ key: 'tracker', id, before: from, after: to })
      }
      continue
    }
    if (typeof after === 'boolean') {
      lines.push({ key: 'toggle', field, on: after === true })
      continue
    }
    if (field === 'portrait_path' || field === 'archived_at') {
      lines.push(
        field === 'archived_at'
          ? { key: 'toggle', field, on: after !== null }
          : { key: 'edited', field },
      )
      continue
    }
    if (typeof after === 'number' || typeof before === 'number') {
      if (num(after) !== null)
        lines.push({ key: 'number', field, before: num(before), after: num(after)! })
      continue
    }
    lines.push({ key: 'text', field, before: str(before), after: str(after) })
  }
  return lines
}
