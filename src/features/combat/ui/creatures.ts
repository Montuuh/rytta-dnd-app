import { useContext, useMemo } from 'react'
import type { ComboboxItem, ComboboxParsedItem, OptionsFilter } from '@mantine/core'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { PackImagesContext } from '@/shared/ui/pack-images-context'
import {
  bestiaryLanguage,
  creatureArtQuery,
  creatureArtUrl,
  monsterIndexQuery,
  packTitle,
  parseDice,
  searchKey,
  srdItems,
  statBlockSchema,
  trackersOf,
  type CreatureArt,
  type CreatureListItem,
  type CreatureSize,
  type CreatureType,
  type MonsterRow,
  type StatBlock,
} from '@/features/bestiary'
import { useGlossaryName } from '@/features/glossary'
import {
  creaturePacksQuery,
  packBodiesQuery,
  packIndexQuery,
  srdImagesQuery,
  templatesQuery,
} from '../api'
import { campaignBestiary } from '../domain/campaign-bestiary'
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
    version: template.srd_override === true || undefined,
  }
}

/**
 * Everything the DM can put in a fight (RYT-094): the creatures of the packs the campaign enabled in
 * Content, at its pinned versions and without its hidden ones, and the campaign's own creatures.
 * Each pack version loads once (index, then stat blocks in the interface language). Packs turned
 * off still load, so fights and recaps that used their creatures keep their names and stat blocks.
 */
export function useCreatureCatalog(campaignId: string) {
  const { i18n } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  const language = bestiaryLanguage(i18n.resolvedLanguage)
  const packs = useQuery(creaturePacksQuery(userId, campaignId))
  const packList = useMemo(() => packs.data ?? [], [packs.data])
  const indexes = useQueries({
    queries: packList.map((pack) => packIndexQuery(userId, campaignId, pack)),
  })
  const bodies = useQueries({
    queries: packList.map((pack) => packBodiesQuery(userId, campaignId, pack, language)),
  })
  // The CR baselines (a rules table) stay bundled until rules come from packs (RYT-165).
  const baselines = useQuery(monsterIndexQuery())
  const templates = useQuery(templatesQuery(userId, campaignId))
  const art = useQuery(creatureArtQuery())
  const srdImages = useQuery(srdImagesQuery(userId, campaignId))
  // RYT-172: pack pictures sit below the campaign's own image and above the bundled art.
  const packImages = useContext(PackImagesContext)
  const indexData = indexes.map((q) => q.data)
  const bodiesData = bodies.map((q) => q.data)
  // useQueries returns new arrays each render: memoize on their contents.
  const indexKey = indexData.map((d) => d?.version ?? '-').join()
  const bodiesKey = bodiesData.map((d) => d?.version ?? '-').join()
  const rows = useMemo(
    () => new Map(indexData.flatMap((d) => d?.rows ?? []).map((row) => [row.id, row])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [indexKey, packList],
  )
  const blocks = useMemo(
    () =>
      Object.assign({}, ...bodiesData.map((d) => d?.monsters ?? {})) as Record<string, StatBlock>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bodiesKey, packList, language],
  )
  const items = useMemo(() => {
    const own = new Map((srdImages.data ?? []).map((i) => [i.srd_id, i.image_path]))
    const artOf = (id: string | null | undefined) => (id && art.data?.[id] ? id : null)
    const fromPacks = packList.map((pack, at) => {
      // List rows name their pack in a few words: the SRD's full title would fill a phone row.
      const title = pack.srd ? 'SRD' : packTitle(pack, language)
      const list = srdItems(indexData[at]?.rows ?? [], language, { id: pack.id, title }).map(
        (item) => ({
          ...item,
          imagePath: own.get(item.id) ?? null,
          packPath: packImages.creature.get(item.id) ?? null,
          artId: artOf(item.id),
        }),
      )
      return { pack, title, items: list }
    })
    const byId = new Map(fromPacks.flatMap((p) => p.items).map((item) => [item.id, item]))
    return campaignBestiary(
      (templates.data ?? []).map((tp) => {
        const item = { ...templateItem(tp), artId: artOf(tp.srd_id) }
        // RYT-089: a version keeps its official creature's other-language name (search, gloss).
        const source = item.version && tp.srd_id ? byId.get(tp.srd_id) : undefined
        return source ? { ...item, altName: source.altName } : item
      }),
      fromPacks,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexKey, packList, templates.data, language, art.data, srdImages.data, packImages])
  const templateById = useMemo(
    () => new Map((templates.data ?? []).map((tp) => [tp.id, tp])),
    [templates.data],
  )
  const blockFor = (item: CreatureListItem | null | undefined): StatBlock | null => {
    if (!item) return null
    if (item.source === 'srd') return blocks[item.id] ?? null
    return templateBlock(templateById.get(item.id))
  }
  const enabled = packList.filter((pack) => pack.enabled)
  const indexFailed = indexes.some((q) => q.isError && !q.data)
  return {
    language,
    items,
    /** The credit of an SRD creature's bundled art, once the credits have loaded. */
    artCredit: (id: string | null | undefined): CreatureArt | null =>
      (id && art.data?.[id]) || null,
    rows,
    templateById,
    /** A pack creature's stat block, whether or not this campaign lists it (fights, recaps). */
    officialBlock: (id: string): StatBlock | null => blocks[id] ?? null,
    baselines: baselines.data?.baselines ?? [],
    traits: bodiesData.flatMap((d, at) => (packList[at]?.enabled ? (d?.traits ?? []) : [])),
    blockFor,
    srdName: (id: string) => {
      const row = rows.get(id)
      return row ? row[language] : null
    },
    /** RYT-094: the creature packs the campaign has, enabled or turned off. */
    packs: packList,
    /** The campaign uses no creature pack: the way to choose one is Content. */
    noPacks: packs.isSuccess && enabled.length === 0,
    /** More than one creature pack is enabled: list rows name their pack. */
    severalPacks: enabled.length > 1,
    /** Pack creatures this campaign lists. */
    officialCount: items.filter((item) => item.source === 'srd').length,
    /** Pack creatures the app could not read (a custom pack with incomplete entries). */
    unreadable: indexData.reduce(
      (sum, d, at) => sum + (packList[at]?.enabled ? (d?.unreadable ?? 0) : 0),
      0,
    ),
    pending: packs.isPending || templates.isPending || indexes.some((q) => q.isPending),
    bodiesPending: bodies.some((q) => q.isPending),
    error:
      packs.isError ||
      templates.isError ||
      indexes.some((q) => q.isError) ||
      bodies.some((q) => q.isError),
    /** RYT-054: the packs, a pack's creatures or the campaign creatures failed with nothing cached. */
    dataError:
      (packs.isError && !packs.data) || (templates.isError && !templates.data) || indexFailed,
    retry: () => {
      void packs.refetch()
      void templates.refetch()
      for (const q of [...indexes, ...bodies]) if (q.isError) void q.refetch()
    },
  }
}

/** The bundled art an item shows without a private image: its thumbnail and full image URLs. */
export function itemArt(item: Pick<CreatureListItem, 'artId'>) {
  return item.artId
    ? { thumb: creatureArtUrl(item.artId, 'thumb'), full: creatureArtUrl(item.artId, 'full') }
    : null
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
