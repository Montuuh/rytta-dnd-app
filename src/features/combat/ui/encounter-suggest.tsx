import { useId, useMemo, useState } from 'react'
import { Button, Modal, Select, Stack, Text, VisuallyHidden } from '@mantine/core'
import { Crown, Dices, Layers, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { creatureTypes, type CreatureType } from '@/features/bestiary'
import { usePhone } from '@/shared/ui/use-viewport'
import {
  creatureRoom,
  difficultyBand,
  difficultyLevels,
  pickSuggestions,
  seededRandom,
  suggestionCandidates,
  type Balance,
  type DifficultyLevel,
  type Suggestion,
  type SuggestionCreature,
} from '../domain/difficulty'
import type { NpcEntry } from '../domain/combat'
import { typeGlyphs } from './bestiary-glyphs'
import { TileGroup } from './bestiary-widgets'
import { bandGlyphs, formatXp, listOf, type SuggestPrefs } from './builder-parts'
import { itemArt, npcEntryFor, useSpellLabel, type useCreatureCatalog } from './creatures'
import type { Run } from './helpers'
import { Token } from './token'

type Catalog = ReturnType<typeof useCreatureCatalog>

/** Moderate is the usual aim; once the draft spends it, the High budget is what is left. */
function firstTarget(balance: Balance): DifficultyLevel {
  return balance.budget.moderate > balance.xp ? 'moderate' : 'high'
}

const isType = (value: string | null | undefined): value is CreatureType =>
  !!value && (creatureTypes as readonly string[]).includes(value)

const nextSeed = (n: number) => (n * 48271 + 1) % 2147483647

/**
 * RYT-054: proposes creature groups that spend the XP left before the chosen difficulty (SRD 5.2.1
 * method). Each idea is one card with one action; "Other ideas" draws a new set and keeps away from
 * what was already shown while there are alternatives. Choices survive closing the dialog.
 */
export function SuggestDialog({
  encounterId,
  encounterName,
  balance,
  pool,
  catalog,
  prefs,
  setPrefs,
  run,
  pending,
  onClose,
  onAdded,
}: {
  encounterId: string
  encounterName: string
  balance: Balance
  pool: SuggestionCreature[]
  catalog: Catalog
  prefs: SuggestPrefs
  setPrefs: (next: SuggestPrefs) => void
  run: Run
  pending: boolean
  onClose: () => void
  onAdded: (text: string, added: number) => void
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const spellLabel = useSpellLabel()
  const remainingFor = (level: DifficultyLevel) => balance.budget[level] - balance.xp
  const target =
    prefs.target && remainingFor(prefs.target) > 0 ? prefs.target : firstTarget(balance)
  // Until the DM picks one, ideas follow the most common enemy type already in the fight.
  const type = prefs.type ?? (isType(balance.mainType) ? balance.mainType : 'any')
  const kinds = prefs.kinds
  const remaining = remainingFor(target)
  // The search depends on the choices; drawing another set reuses it.
  const candidates = useMemo(
    () =>
      suggestionCandidates({
        pool,
        remaining,
        party: balance.party,
        level: balance.level,
        enemies: balance.enemies,
        kinds: kinds === '2' ? 2 : 1,
        type: type === 'any' ? null : type,
      }),
    [pool, remaining, balance.party, balance.level, balance.enemies, kinds, type],
  )
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31))
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set())
  const picked = useMemo(
    () => pickSuggestions(candidates, { avoid: shown, random: seededRandom(seed) }),
    [candidates, shown, seed],
  )
  const ideas = picked.ideas
  const unseen = candidates.filter((s) => !shown.has(s.key) && !ideas.includes(s)).length
  const [status, setStatus] = useState('')
  const change = (next: Partial<SuggestPrefs>) => {
    setShown(new Set())
    setStatus('')
    setPrefs({ ...prefs, target, ...next })
  }
  const ready = !catalog.bodiesPending
  const describe = (s: Suggestion) =>
    listOf(
      s.groups.map((g) => t('builder.creatures.count', { count: g.count, name: g.creature.name })),
      t,
    )
  const add = async (s: Suggestion) => {
    if (pending || !ready) return
    const entries: NpcEntry[] = s.groups.flatMap((g) => {
      const item = catalog.items.find((i) => i.key === g.creature.key)
      if (!item) return []
      const row = item.source === 'srd' ? catalog.rows.get(item.id) : undefined
      const options = {
        count: g.count,
        hpMode: 'average' as const,
        alias: '',
        hidden: false,
        share: true,
        side: 'enemy' as const,
      }
      return [npcEntryFor(item, catalog.blockFor(item), options, spellLabel, row)]
    })
    if (entries.length !== s.groups.length) return
    if (await run({ kind: 'add', encounterId, entries }))
      onAdded(
        t('builder.suggest.added', { name: encounterName, what: describe(s) }),
        s.groups.reduce((n, g) => n + g.count, 0),
      )
  }
  const typeOptions = useMemo(
    () => [
      { value: 'any', label: t('builder.suggest.anyType') },
      ...creatureTypes
        .map((value) => ({ value, label: t(`bestiary.type.${value}`) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [t],
  )
  const TypeGlyph = isType(type) ? typeGlyphs[type] : null
  const crowded = creatureRoom(balance.party, balance.enemies) < (kinds === '2' ? 3 : 1)
  const listId = useId()
  return (
    <Modal
      opened
      onClose={onClose}
      title={t('builder.suggest.title', { name: encounterName })}
      size="lg"
      fullScreen={phone}
      closeButtonProps={{ 'aria-label': t('builder.suggest.close'), size: 44 }}
      className="bld-dialog"
    >
      <Stack gap="md">
        <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
          {status}
        </VisuallyHidden>
        <TileGroup
          legend={t('builder.suggest.target')}
          className="bld-targets"
          value={target}
          onChange={(next) => change({ target: next })}
          options={difficultyLevels.map((level) => {
            const Glyph = bandGlyphs[level]
            const left = remainingFor(level)
            return {
              value: level,
              disabled: left <= 0,
              content: (
                <span className={`bld-target band-${level}`}>
                  <Glyph size={20} aria-hidden="true" />
                  <span className="bld-target-word">{t(`builder.level.${level}`)}</span>
                  <span className="bld-target-xp">
                    {left > 0
                      ? t('builder.suggest.left', { xp: formatXp(left, t) })
                      : t('builder.suggest.reached')}
                  </span>
                </span>
              ),
            }
          })}
        />
        <div className="bld-options">
          <TileGroup
            legend={t('builder.suggest.kinds')}
            className="bst-choice-tiles bld-kinds"
            value={kinds}
            onChange={(next) => change({ kinds: next })}
            options={[
              {
                value: '1',
                content: (
                  <span className="bst-choice">
                    <Layers size={18} aria-hidden="true" />
                    <span>
                      <span className="bst-choice-title">{t('builder.suggest.oneKind')}</span>
                      <span className="bst-choice-help">{t('builder.suggest.oneKindHelp')}</span>
                    </span>
                  </span>
                ),
              },
              {
                value: '2',
                content: (
                  <span className="bst-choice">
                    <Crown size={18} aria-hidden="true" />
                    <span>
                      <span className="bst-choice-title">{t('builder.suggest.twoKinds')}</span>
                      <span className="bst-choice-help">{t('builder.suggest.twoKindsHelp')}</span>
                    </span>
                  </span>
                ),
              },
            ]}
          />
          <Select
            label={t('builder.suggest.type')}
            data={typeOptions}
            value={type}
            onChange={(next) => change({ type: next ?? 'any' })}
            allowDeselect={false}
            leftSection={TypeGlyph ? <TypeGlyph size={18} aria-hidden="true" /> : null}
            renderOption={({ option }) => {
              const Glyph = isType(option.value) ? typeGlyphs[option.value] : null
              return (
                <span className="bld-type-option">
                  {Glyph && <Glyph size={16} aria-hidden="true" />}
                  {option.label}
                </span>
              )
            }}
            comboboxProps={{ zIndex: 420 }}
          />
        </div>
        <section aria-labelledby={listId}>
          <div className="bld-ideas-head">
            <h3 className="bld-ledger-title" id={listId}>
              {t('builder.suggest.ideas')}
            </h3>
            {ideas.length > 0 && (
              <Button
                variant="subtle"
                leftSection={<Dices size={18} aria-hidden="true" />}
                className="bld-more-ideas"
                aria-disabled={unseen === 0 || undefined}
                data-disabled={unseen === 0 || undefined}
                onClick={() => {
                  if (unseen === 0) return
                  const avoid = new Set([...shown, ...ideas.map((s) => s.key)])
                  const following = nextSeed(seed)
                  const next = pickSuggestions(candidates, {
                    avoid,
                    random: seededRandom(following),
                  })
                  setShown(avoid)
                  setSeed(following)
                  setStatus(
                    next.fresh > 0
                      ? t('builder.suggest.newIdeas', { count: next.fresh })
                      : t('builder.suggest.noNew'),
                  )
                }}
              >
                {t('builder.suggest.more')}
              </Button>
            )}
          </div>
          {remaining <= 0 ? (
            <Text className="bld-empty">{t('builder.suggest.noRoom')}</Text>
          ) : crowded ? (
            <Text className="bld-empty">{t('builder.suggest.crowded')}</Text>
          ) : ideas.length === 0 ? (
            <Text className="bld-empty">{t('builder.suggest.none')}</Text>
          ) : (
            <IdeaList
              ideas={ideas}
              balance={balance}
              catalog={catalog}
              encounterName={encounterName}
              disabled={pending || !ready}
              describe={describe}
              onAdd={(s) => void add(s)}
            />
          )}
          {ideas.length > 0 && unseen === 0 && (
            <Text className="bld-empty bld-no-new">{t('builder.suggest.noNew')}</Text>
          )}
        </section>
        {!ready && (
          <Text role="status" c="dimmed">
            {t('builder.suggest.loading')}
          </Text>
        )}
        <Text className="bld-rules">{t('builder.suggest.rules')}</Text>
      </Stack>
    </Modal>
  )
}

function IdeaList({
  ideas,
  balance,
  catalog,
  encounterName,
  disabled,
  describe,
  onAdd,
}: {
  ideas: Suggestion[]
  balance: Balance
  catalog: Catalog
  encounterName: string
  disabled: boolean
  describe: (s: Suggestion) => string
  onAdd: (s: Suggestion) => void
}) {
  const { t } = useTranslation()
  const listId = useId()
  return (
    <ul className="bld-ideas">
      {ideas.map((s) => {
        const band = difficultyBand(balance.xp + s.xp, balance.budget)
        const Glyph = bandGlyphs[band]
        const headingId = `${listId}-${s.key}`
        const what = describe(s)
        return (
          <li key={s.key} className="bld-idea">
            <div className="bld-idea-tokens" aria-hidden="true">
              {s.groups.map((g) => {
                const item = catalog.items.find((i) => i.key === g.creature.key)
                return (
                  <Token
                    key={g.creature.key}
                    name={g.creature.name}
                    side="enemy"
                    imageKind="creature"
                    path={item?.imagePath}
                    art={item ? itemArt(item)?.thumb : null}
                    size={44}
                  />
                )
              })}
            </div>
            <div className="bld-idea-body">
              <h4 className="bld-idea-title" id={headingId}>
                {what}
              </h4>
              <ul className="bld-idea-groups">
                {s.groups.map((g) => {
                  const TypeGlyph = isType(g.creature.type) ? typeGlyphs[g.creature.type] : null
                  return (
                    <li key={g.creature.key}>
                      {TypeGlyph && <TypeGlyph size={14} aria-hidden="true" />}
                      {t('builder.suggest.groupMeta', {
                        count: g.count,
                        name: g.creature.name,
                        cr: t('bestiary.crShort', { cr: g.creature.cr }),
                        xp: formatXp(g.creature.xp, t),
                      })}
                    </li>
                  )
                })}
              </ul>
              <div className="bld-idea-total">
                <strong>{t('builder.xp', { xp: formatXp(s.xp, t) })}</strong>
                <span className={`bld-idea-band band-${band}`}>
                  <Glyph size={16} aria-hidden="true" />
                  {t('builder.suggest.result', {
                    level:
                      band === 'aboveHigh' || band === 'none'
                        ? t(`builder.title.${band}`)
                        : t(`builder.level.${band}`),
                  })}
                </span>
                <Button
                  variant="light"
                  className="bld-idea-add"
                  leftSection={<Plus size={18} aria-hidden="true" />}
                  aria-disabled={disabled || undefined}
                  data-disabled={disabled || undefined}
                  aria-label={t('builder.suggest.addNamed', { what, name: encounterName })}
                  onClick={() => onAdd(s)}
                >
                  {t('builder.suggest.add')}
                </Button>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
