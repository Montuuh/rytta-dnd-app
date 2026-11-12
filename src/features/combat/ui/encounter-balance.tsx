import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Anchor, Button, Collapse, Text, UnstyledButton, VisuallyHidden } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronsRight, Lightbulb, PenLine } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAuth } from '@/features/auth'
import { isClassKey, partyOverviewQuery } from '@/features/characters'
import { xpForCr } from '@/features/bestiary'
import {
  difficultyLevels,
  encounterBalance,
  type Balance,
  type BalanceCreature,
  type BalanceMember,
  type BalanceNote,
  type SuggestionCreature,
} from '../domain/difficulty'
import type { Combatant } from '../domain/combat'
import { itemArt, useCreatureCatalog } from './creatures'
import type { Run } from './helpers'
import { bandGlyphs, formatXp, listOf, type SuggestPrefs } from './builder-parts'
import { SuggestDialog } from './encounter-suggest'
import { Token } from './token'
import './builder.css'

type Catalog = ReturnType<typeof useCreatureCatalog>

/** The draft's party and creatures as the SRD method sees them (RYT-054). */
function useBalance(campaignId: string, combatants: Combatant[], catalog: Catalog) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const overview = useQuery(partyOverviewQuery(state.user!.id, campaignId))
  const hasLair = combatants.some((c) => c.kind === 'lair')
  const inDraft = combatants.filter((c) => c.kind === 'character' && c.character_id)
  const rows = overview.data ?? []
  const classOf = (row: (typeof rows)[number] | undefined) =>
    row?.class_key && isClassKey(row.class_key)
      ? t(`srd.class.${row.class_key}`)
      : (row?.class_label ?? null)
  const party: BalanceMember[] = inDraft.length
    ? inDraft.map((c) => {
        const row = rows.find((r) => r.id === c.character_id)
        return { id: c.id, name: c.name, level: row?.level ?? null, classLabel: classOf(row) }
      })
    : rows
        .filter((r) => r.is_assigned)
        .map((r) => ({ id: r.id, name: r.name, level: r.level, classLabel: classOf(r) }))
  const creatures: BalanceCreature[] = combatants
    .filter((c) => c.kind === 'npc')
    .map((c) => {
      const side = c.side === 'ally' ? ('ally' as const) : ('enemy' as const)
      // Batches are numbered by the server ("Bandit 3"): the ledger counts them as one group.
      const base = c.name.replace(/\s+\d+$/, '')
      if (c.srd_id) {
        const row = catalog.rows.get(c.srd_id)
        return {
          key: `srd:${c.srd_id}`,
          name: catalog.srdName(c.srd_id) ?? base,
          side,
          cr: row?.cr ?? null,
          xp: row ? (hasLair && row.xpLair ? row.xpLair : row.xp) : null,
          hidden: c.hidden,
          swarm: row?.swarm === 1,
          type: row?.type ?? null,
        }
      }
      if (c.template_id) {
        const template = catalog.templateById.get(c.template_id)
        const cr = template?.challenge ?? null
        return {
          key: `hb:${c.template_id}`,
          name: template?.name ?? base,
          side,
          cr,
          xp: cr ? xpForCr(cr as Parameters<typeof xpForCr>[0]) : null,
          hidden: c.hidden,
          type: template?.creature_type ?? null,
        }
      }
      return { key: `custom:${base}`, name: base, side, cr: null, xp: null, hidden: c.hidden }
    })
  const balance = encounterBalance(party, creatures)
  const pool = useMemo<SuggestionCreature[]>(
    () =>
      catalog.items
        .filter((i) => i.cr !== null && (i.side ?? 'enemy') === 'enemy')
        .map((i) => {
          const row = i.source === 'srd' ? catalog.rows.get(i.id) : undefined
          return {
            key: i.key,
            name: i.name,
            cr: i.cr!,
            // Suggested creatures join the fight; they are not in their own lair.
            xp: row ? row.xp : xpForCr(i.cr!),
            type: i.type,
            swarm: row?.swarm === 1,
          }
        }),
    [catalog.items, catalog.rows],
  )
  return {
    balance,
    party,
    pool,
    usesLairXp: hasLair && creatures.some((c) => c.key.startsWith('srd:')),
    fromCampaign: inDraft.length === 0,
    pending: overview.isPending || catalog.pending,
    // A failed refetch keeps the last reading; only missing data replaces the card.
    error: (overview.isError && !overview.data) || catalog.dataError,
    retry: () => {
      void overview.refetch()
      catalog.retry()
    },
  }
}

/**
 * RYT-054: the difficulty instrument of a prepared fight. It reads the draft the server holds (the
 * combatants and the party's sheets), so every creature added from the bestiary, the Add tab or a
 * suggestion moves it. One action: suggest creatures to reach a difficulty.
 */
export function EncounterBalance({
  campaignId,
  encounterId,
  encounterName,
  combatants,
  run,
  pending,
}: {
  campaignId: string
  encounterId: string
  encounterName: string
  combatants: Combatant[]
  run: Run
  pending: boolean
}) {
  const { t } = useTranslation()
  const catalog = useCreatureCatalog(campaignId)
  const measured = useBalance(campaignId, combatants, catalog)
  const { balance } = measured
  const [open, setOpen] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  // Kinds, type and target survive closing the dialog (one add per opening is the usual flow).
  const [prefs, setPrefs] = useState<SuggestPrefs>({ target: null, kinds: '1' })
  const suggestButton = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  // When the High budget gets spent while the button has focus, the button gives way to a line of
  // text; focus then moves to the reading instead of falling to the page.
  const suggestFocused = useRef(false)
  const spent = !measured.pending && balance.xp >= balance.budget.high
  useEffect(() => {
    if (!spent || !suggestFocused.current) return
    suggestFocused.current = false
    const lost = !document.activeElement || document.activeElement === document.body
    if (lost) titleRef.current?.focus()
  }, [spent])
  // The dialog unmounts when it closes: focus goes back to the button that opened it, or to the
  // reading when that add spent the High budget and the button gave way to a line of text.
  const closeSuggest = () => {
    setSuggesting(false)
    requestAnimationFrame(() =>
      (suggestButton.current?.isConnected ? suggestButton.current : titleRef.current)?.focus(),
    )
  }
  // An add resolves after the new draft arrived: its notice is announced with that reading.
  const [toAnnounce, setToAnnounce] = useState<string | null>(null)
  // A notice belongs to the draft it describes: it shows once that draft arrives and leaves with
  // the next change.
  const [notice, setNotice] = useState<{ text: string; count: number; added: number } | null>(null)
  const noticeText = notice && combatants.length === notice.count ? notice.text : null
  if (
    notice &&
    combatants.length !== notice.count &&
    combatants.length !== notice.count - notice.added
  )
    setNotice(null)
  const detailsId = useId()
  const partyTitleId = useId()
  const creaturesTitleId = useId()
  // Enemies typed in without a challenge rating spend nothing, but they are not "no enemies".
  const title =
    balance.band === 'none' && balance.enemies > 0
      ? t('builder.title.unrated')
      : t(`builder.title.${balance.band}`)
  // One live region: changes made anywhere (this console, the bestiary, another DM) are announced
  // once, never on the first reading.
  const reading = `${balance.band}:${balance.xp}`
  const [seen, setSeen] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  if (toAnnounce !== null && !measured.pending) {
    setToAnnounce(null)
    setAnnouncement(
      `${toAnnounce} ${t('builder.announce', { title, xp: formatXp(balance.xp, t) })}`,
    )
  }
  if (!measured.pending && seen !== reading) {
    setSeen(reading)
    if (seen !== null)
      setAnnouncement(
        [noticeText, t('builder.announce', { title, xp: formatXp(balance.xp, t) })]
          .filter(Boolean)
          .join(' '),
      )
  }
  const region = (children: ReactNode) => (
    <section className="bld" aria-label={t('builder.region')}>
      {children}
    </section>
  )
  if (measured.pending)
    return region(
      <Text role="status" c="dimmed">
        {t('builder.loading')}
      </Text>,
    )
  if (measured.error)
    return region(
      <>
        <Text role="alert">{t('builder.error')}</Text>
        <Button variant="light" onClick={measured.retry} className="bld-retry">
          {t('common.retry')}
        </Button>
      </>,
    )
  if (balance.party === 0)
    return region(
      <>
        <Text>{t('builder.noParty')}</Text>
        <Anchor component={Link} to={`/campaign/${campaignId}/party`} className="bld-link">
          {t('builder.noPartyLink')}
        </Anchor>
      </>,
    )
  const Glyph = bandGlyphs[balance.band]
  const full = balance.xp >= balance.budget.high
  const notes = [
    ...balance.notes.map((note) => ({ key: note.kind as string, text: noteText(note, t) })),
    ...(balance.assumed.length
      ? [
          {
            key: 'assumed',
            text: t('builder.note.assumed', {
              count: balance.assumed.length,
              names: listOf(balance.assumed, t),
            }),
          },
        ]
      : []),
  ]
  return (
    <section className={`bld band-${balance.band}`} aria-label={t('builder.region')}>
      <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </VisuallyHidden>
      <div className="bld-head">
        <span className="bld-seal" aria-hidden="true">
          <Glyph size={22} />
        </span>
        <div className="bld-reading">
          <h2 className="bld-title" ref={titleRef} tabIndex={-1}>
            {title}
          </h2>
          <Text className="bld-numbers">{readingText(balance, t)}</Text>
        </div>
      </div>
      <Gauge balance={balance} />
      <Text className="bld-party-line">
        {t('builder.party', { count: balance.party, level: balance.level })}{' '}
        {measured.fromCampaign && t('builder.partyAll')}
      </Text>
      {noticeText && <Text className="bld-notice">{noticeText}</Text>}
      {full ? (
        <Text className="bld-full">
          {balance.band === 'aboveHigh'
            ? t('builder.suggest.noRoom')
            : t('builder.suggest.highSpent')}
        </Text>
      ) : (
        <Button
          ref={suggestButton}
          variant="light"
          className="bld-suggest"
          leftSection={<Lightbulb size={18} aria-hidden="true" />}
          // Focusable while a write is saving: focus comes back here after an add.
          onFocus={() => (suggestFocused.current = true)}
          onBlur={() => (suggestFocused.current = false)}
          aria-disabled={pending || undefined}
          data-disabled={pending || undefined}
          onClick={() => {
            if (!pending) setSuggesting(true)
          }}
        >
          {t('builder.suggest.open')}
        </Button>
      )}
      {notes.length > 0 && (
        <ul className="bld-notes" aria-label={t('builder.notes')}>
          {notes.map((note) => (
            <li key={note.key} className={`bld-note note-${note.key}`}>
              <PenLine size={16} aria-hidden="true" />
              <span>{note.text}</span>
            </li>
          ))}
        </ul>
      )}
      <UnstyledButton
        className="bld-more"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{t('builder.details')}</span>
        <ChevronDown size={18} aria-hidden="true" className="bld-more-chevron" />
      </UnstyledButton>
      <Collapse expanded={open} id={detailsId} transitionDuration={160}>
        <Ledgers
          balance={balance}
          party={measured.party}
          catalog={catalog}
          members={combatants}
          usesLairXp={measured.usesLairXp}
          ids={{ party: partyTitleId, creatures: creaturesTitleId }}
        />
        <Text className="bld-source">{t('builder.source')}</Text>
      </Collapse>
      {suggesting && (
        <SuggestDialog
          campaignId={campaignId}
          encounterId={encounterId}
          encounterName={encounterName}
          balance={balance}
          pool={measured.pool}
          catalog={catalog}
          prefs={prefs}
          setPrefs={setPrefs}
          run={run}
          pending={pending}
          onClose={closeSuggest}
          onAdded={(text, added) => {
            closeSuggest()
            setNotice({ text, count: combatants.length + added, added })
            setToAnnounce(text)
          }}
        />
      )}
    </section>
  )
}

function readingText(balance: Balance, t: TFunction) {
  const { budget, xp } = balance
  if (balance.band === 'none')
    return t('builder.reading.none', {
      low: formatXp(budget.low, t),
      moderate: formatXp(budget.moderate, t),
      high: formatXp(budget.high, t),
    })
  if (balance.band === 'aboveHigh')
    return t('builder.reading.over', {
      xp: formatXp(xp, t),
      over: formatXp(xp - budget.high, t),
      budget: formatXp(budget.high, t),
    })
  return balance.room === 0
    ? t('builder.reading.full', { xp: formatXp(xp, t), budget: formatXp(budget[balance.band], t) })
    : t('builder.reading.spent', {
        xp: formatXp(xp, t),
        budget: formatXp(budget[balance.band], t),
        room: formatXp(balance.room, t),
      })
}

function noteText(note: BalanceNote, t: TFunction) {
  switch (note.kind) {
    case 'many':
      return `${t('builder.note.many', { creatures: note.creatures, party: note.party })}${
        note.lowLevel ? ` ${t('builder.note.manyLow')}` : ''
      }`
    case 'statBlocks':
      return t('builder.note.statBlocks', { count: note.count })
    case 'powerful':
      return t('builder.note.powerful', {
        count: note.names.length,
        names: listOf(note.names, t),
        level: note.level,
      })
    case 'cr0':
      return t('builder.note.cr0', { names: listOf(note.names, t) })
  }
}

/**
 * A measuring instrument, not a slider: the party's three budgets are notches on a ruled track with
 * each band named inside its stretch, the spent XP is the fill and a pointer, and the stretch beyond
 * High is hatched. The scale is fixed to the party (a quarter past High), so a fight far over budget
 * pins the pointer at the end. The words above and the numbers beside it carry the reading, so the
 * drawing is decorative.
 */
function Gauge({ balance }: { balance: Balance }) {
  const { t } = useTranslation()
  const { budget, xp } = balance
  const max = Math.max(budget.high * 1.25, 1)
  const at = (value: number) => Math.min(100, (value / max) * 100)
  const beyond = xp > max
  const style = {
    '--bld-fill-ratio': Math.min(1, xp / max),
    '--bld-high': `${at(budget.high)}%`,
  } as CSSProperties
  const starts = { low: 0, moderate: budget.low, high: budget.moderate }
  return (
    <div className={`bld-gauge${beyond ? ' is-beyond' : ''}`} aria-hidden="true" style={style}>
      <div className="bld-track">
        <span className="bld-lethal" />
        <span className="bld-fill" />
        {difficultyLevels.map((level) => (
          <span
            key={level}
            className={`bld-tick tick-${level}`}
            style={{ left: `${at(budget[level])}%` }}
          />
        ))}
        {xp > 0 && (
          <span className="bld-pointer-run">
            <span className="bld-pointer">
              {beyond && <ChevronsRight size={14} className="bld-pointer-beyond" />}
            </span>
          </span>
        )}
      </div>
      {difficultyLevels.map((level) => (
        <span
          key={level}
          className={`bld-mark mark-${level}`}
          style={{ left: `${(at(starts[level]) + at(budget[level])) / 2}%` }}
        >
          <span className="bld-mark-word">{t(`builder.level.${level}`)}</span>
          <span className="bld-mark-xp">
            {t('builder.upTo', { xp: formatXp(budget[level], t) })}
          </span>
        </span>
      ))}
    </div>
  )
}

function Ledgers({
  balance,
  party,
  catalog,
  members,
  usesLairXp,
  ids,
}: {
  balance: Balance
  party: BalanceMember[]
  catalog: Catalog
  members: Combatant[]
  usesLairXp: boolean
  ids: { party: string; creatures: string }
}) {
  const { t } = useTranslation()
  /** Group keys are `side:origin`; the origin (`srd:id`, `hb:id`) is also the catalogue key. */
  const tokenFor = (groupKey: string) => {
    const origin = groupKey.slice(groupKey.indexOf(':') + 1)
    const combatant = members.find(
      (c) =>
        (c.srd_id && origin === `srd:${c.srd_id}`) ||
        (c.template_id && origin === `hb:${c.template_id}`),
    )
    const item = catalog.items.find((i) => i.key === origin)
    return { combatant, art: item ? itemArt(item)?.thumb : null }
  }
  return (
    <div className="bld-ledgers">
      <section className="bld-ledger" aria-labelledby={ids.party}>
        <h3 className="bld-ledger-title" id={ids.party}>
          {t('builder.party.title')}
        </h3>
        <ul className="bld-rows">
          {party.map((member) => (
            <li key={member.id} className="bld-row is-party">
              <span className="bld-row-what">
                <span className="bld-row-name">{member.name}</span>
                <span className="bld-row-meta">
                  {member.level === null
                    ? t('builder.party.noSheet')
                    : member.classLabel
                      ? t('builder.party.classLevel', {
                          class: member.classLabel,
                          level: member.level,
                        })
                      : t('builder.party.level', { level: member.level })}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <dl className="bld-budget">
          <dt>{t('builder.party.budget')}</dt>
          {difficultyLevels.map((level) => (
            <dd key={level}>
              <span>{t(`builder.level.${level}`)}</span>
              <strong>{t('builder.xp', { xp: formatXp(balance.budget[level], t) })}</strong>
            </dd>
          ))}
        </dl>
      </section>
      <section className="bld-ledger" aria-labelledby={ids.creatures}>
        <h3 className="bld-ledger-title" id={ids.creatures}>
          {t('builder.creatures.title')}
        </h3>
        {balance.groups.length === 0 ? (
          <Text className="bld-empty">{t('builder.creatures.empty')}</Text>
        ) : (
          <ul className="bld-rows">
            {balance.groups.map((group) => {
              const { combatant, art } = tokenFor(group.key)
              return (
                <li key={group.key} className={`bld-row${group.excluded ? ' is-excluded' : ''}`}>
                  <Token
                    name={group.name}
                    side={group.key.startsWith('ally:') ? 'ally' : 'enemy'}
                    imageKind="creature"
                    path={combatant?.image_path}
                    art={art}
                    size={36}
                  />
                  <span className="bld-row-what">
                    <span className="bld-row-name">
                      {t('builder.creatures.count', { count: group.count, name: group.name })}
                    </span>
                    <span className="bld-row-meta">
                      {group.excluded === 'ally'
                        ? t('builder.creatures.ally')
                        : group.excluded === 'unrated'
                          ? t('builder.creatures.unrated')
                          : t('builder.creatures.each', {
                              count: group.count,
                              cr: t('bestiary.crShort', { cr: group.cr }),
                              xp: formatXp(group.xpEach ?? 0, t),
                            })}
                      {group.hidden > 0 &&
                        ` · ${t('builder.creatures.hidden', { count: group.hidden })}`}
                    </span>
                  </span>
                  <span className="bld-row-xp">
                    {group.excluded ? '—' : t('builder.xp', { xp: formatXp(group.xp, t) })}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {usesLairXp && <Text className="bld-empty">{t('builder.creatures.lair')}</Text>}
      </section>
    </div>
  )
}
