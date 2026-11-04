import { useMemo } from 'react'
import type { ComboboxItem, ComboboxParsedItem, OptionsFilter } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import {
  bestiaryLanguage,
  monsterBodiesQuery,
  monsterIndexQuery,
  parseDice,
  searchKey,
  srdItems,
  statBlockSchema,
  trackersOf,
  type CreatureListItem,
  type CreatureSize,
  type CreatureType,
  type MonsterRow,
  type StatBlock,
} from '@/features/bestiary'
import { useGlossaryName } from '@/features/glossary'
import { templatesQuery } from '../api'
import type { CombatantTemplate, NpcEntry } from '../domain/combat'

/** A template's stored stat block, when it is readable (ADR 028). */
export function templateBlock(template: CombatantTemplate | undefined | null): StatBlock | null {
  if (!template?.stat_block) return null
  const parsed = statBlockSchema.safeParse(template.stat_block)
  return parsed.success ? parsed.data : null
}

/** The size a template was built with, read back from its stat block's meta line. */
function sizeOf(block: StatBlock | null): CreatureSize[] {
  const meta = block?.meta.toLowerCase() ?? ''
  const table: [RegExp, CreatureSize][] = [
    [/\b(tiny|diminut[oa])\b/, 'tiny'],
    [/\b(small|pequeñ[oa])\b/, 'small'],
    [/\b(medium|median[oa])\b/, 'medium'],
    [/\b(large|grande)\b/, 'large'],
    [/\b(huge|enorme)\b/, 'huge'],
    [/\b(gargantuan|gargantues[co]a?)\b/, 'gargantuan'],
  ]
  return table.filter(([re]) => re.test(meta)).map(([, size]) => size)
}

export function templateItem(template: CombatantTemplate): CreatureListItem {
  const block = templateBlock(template)
  return {
    key: `hb:${template.id}`,
    source: 'homebrew',
    id: template.id,
    name: template.name,
    cr: template.challenge ?? null,
    type: (template.creature_type as CreatureType | undefined) ?? null,
    size: sizeOf(block),
    ac: template.armor_class,
    hp: template.max_hp,
    initiative: template.initiative_bonus,
    legendary: template.legendary_max,
    srdId: template.srd_id ?? null,
    imagePath: template.image_path ?? null,
    side: template.side,
  }
}

/**
 * Everything the DM can put in a fight: the bundled SRD catalogue (lazy chunks) and the campaign's
 * own creatures. Stat blocks of SRD creatures load in the interface language.
 */
export function useCreatureCatalog(campaignId: string) {
  const { i18n } = useTranslation()
  const { state } = useAuth()
  const language = bestiaryLanguage(i18n.resolvedLanguage)
  const index = useQuery(monsterIndexQuery())
  const bodies = useQuery(monsterBodiesQuery(language))
  const templates = useQuery(templatesQuery(state.user!.id, campaignId))
  const items = useMemo(
    () => [
      ...(templates.data ?? []).map(templateItem),
      ...(index.data ? srdItems(index.data.monsters, language) : []),
    ],
    [index.data, templates.data, language],
  )
  const rows = useMemo(
    () => new Map((index.data?.monsters ?? []).map((row) => [row.id, row])),
    [index.data],
  )
  const templateById = useMemo(
    () => new Map((templates.data ?? []).map((tp) => [tp.id, tp])),
    [templates.data],
  )
  const blockFor = (item: CreatureListItem | null | undefined): StatBlock | null => {
    if (!item) return null
    if (item.source === 'srd') return bodies.data?.monsters[item.id] ?? null
    return templateBlock(templateById.get(item.id))
  }
  return {
    language,
    items,
    rows,
    templateById,
    baselines: index.data?.baselines ?? [],
    traits: bodies.data?.traits ?? [],
    blockFor,
    srdName: (id: string) => {
      const row = rows.get(id)
      return row ? row[language] : null
    },
    pending: index.isPending || templates.isPending,
    bodiesPending: bodies.isPending,
    error: index.isError || templates.isError || bodies.isError,
    retry: () => {
      void index.refetch()
      void bodies.refetch()
      void templates.refetch()
    },
  }
}

/** Builds tracker labels for per-day spells from the glossary in the interface language. */
export function useSpellLabel() {
  const { t } = useTranslation()
  const glossaryName = useGlossaryName()
  return (spellId: string, perDay: number) =>
    t('bestiary.spellPerDay', {
      name: glossaryName(spellId) ?? spellId.replace(/^spell\./, '').replace(/-/g, ' '),
      count: perDay,
    })
}

/** The hit dice a creature can roll, if any ("2d8+2"). */
export function creatureFormula(block: StatBlock | null) {
  const formula = block?.hpFormula
  return formula && parseDice(formula) ? formula : undefined
}

export type AddOptions = {
  count: number
  hpMode: 'average' | 'roll'
  alias: string
  hidden: boolean
  share: boolean
  side: 'enemy' | 'ally'
}

/** The add_combatants entry for a bestiary creature, with its trackers and hit dice. */
export function npcEntryFor(
  item: CreatureListItem,
  block: StatBlock | null,
  options: AddOptions,
  spellLabel: (spellId: string, perDay: number) => string,
  row?: MonsterRow,
): NpcEntry {
  const formula = creatureFormula(block)
  const trackers = block ? trackersOf(block, spellLabel) : []
  const alias = options.alias.trim()
  return {
    kind: 'npc',
    name: item.name.slice(0, 70),
    count: options.count,
    max_hp: item.hp,
    armor_class: item.ac,
    initiative_bonus: item.initiative,
    legendary_max: row?.leg ?? item.legendary,
    side: options.side,
    hidden: options.hidden,
    share_initiative: options.count > 1 && options.share,
    ...(item.source === 'homebrew' ? { template_id: item.id } : { srd_id: item.id }),
    ...(alias ? { public_name: alias.slice(0, 70) } : {}),
    ...(options.hpMode === 'roll' && formula ? { hp_mode: 'roll' as const } : {}),
    ...(formula ? { hp_formula: formula } : {}),
    ...(trackers.length ? { trackers } : {}),
  }
}

/**
 * Accent-insensitive search for creature pickers that also matches the other language's name
 * (`searchable` maps an option value to the text it is found by).
 */
export function creatureFilter(searchable: ReadonlyMap<string, string>): OptionsFilter {
  const keys = new Map([...searchable].map(([value, text]) => [value, searchKey(text)]))
  return ({ options, search, limit }) => {
    const words = searchKey(search).split(' ').filter(Boolean)
    const keep = (item: ComboboxItem) => {
      const text = keys.get(item.value) ?? searchKey(item.label)
      return words.every((w) => text.includes(w))
    }
    // Words that start a word of the name rank first ("jo" → "joven" before "rojo").
    const score = (item: ComboboxItem) => {
      const text = ` ${keys.get(item.value) ?? searchKey(item.label)}`
      return words.filter((w) => text.includes(` ${w}`)).length
    }
    const rank = (items: ComboboxItem[]) =>
      items
        .filter(keep)
        .map((item, index) => ({ item, index, score: score(item) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((x) => x.item)
    const out: ComboboxParsedItem[] = []
    let count = 0
    for (const option of options) {
      if (count >= limit) break
      if ('group' in option) {
        const items = rank(option.items).slice(0, limit - count)
        count += items.length
        if (items.length) out.push({ ...option, items })
      } else if (keep(option)) {
        out.push(option)
        count++
      }
    }
    return out
  }
}
