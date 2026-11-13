import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  NumberInput,
  Stack,
  Switch,
  Title,
} from '@mantine/core'
import {
  Archive,
  Backpack,
  Coins,
  Droplets,
  Ellipsis,
  EyeOff,
  Flame,
  Heart,
  Link2,
  Lock,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  Radio,
  ScrollText,
  Shield,
  Unlink,
  UserRound,
  Utensils,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useCampaign } from '@/features/campaigns'
import { GlossaryTerm, glossaryIds } from '@/features/glossary'
import { PortraitPlate } from '@/features/inventory'
import { TradeButton } from '@/features/trades'
import { newRequestId } from '@/shared/lib/request-id'
import { useLongPress } from '@/shared/ui/use-long-press'
import { useCharacterAction, useResourceAction } from '../api'
import type { Character } from '../domain/character'
import { hpTone, teammateLive, type HpTone, type PartyMember } from '../domain/party'
import { isClassKey } from '../domain/rules'
import type { Condition } from '../domain/srd'
import type { SheetSummary } from '../domain/sheet'
import { CreationChooser } from './creation/chooser'
import './party.css'

const exhaustionLevels = 6
const ledgerFields = [
  { field: 'gold', icon: Coins, short: 'characters.gold', long: 'characters.gold' },
  { field: 'water_units', icon: Droplets, short: 'party.water', long: 'characters.water_units' },
  { field: 'rations', icon: Utensils, short: 'party.rations', long: 'characters.rations' },
] as const
type LedgerField = (typeof ledgerFields)[number]['field']
export type ResourceError = 'stale' | 'unavailable' | null

function useClassLevel() {
  const { t } = useTranslation()
  return (classKey: string | null, classLabel: string | null, level: number | null) =>
    level === null
      ? null
      : t('sheet.classLevel', {
          class: classKey && isClassKey(classKey) ? t(`srd.class.${classKey}`) : (classLabel ?? ''),
          level,
        })
}

/** RYT-097: the own character, led by its portrait: name on the art, then HP, AC, exhaustion,
 * the purse and the way into the sheet. */
export function HeroPlate({
  character,
  summary,
  live,
  portrait,
  sheetPath,
  inventoryPath,
}: {
  character: Character
  summary: SheetSummary | undefined
  live: PartyMember | undefined
  portrait: string | null
  sheetPath: string
  inventoryPath?: string
}) {
  const { t } = useTranslation()
  const classLevel = useClassLevel()
  const campaign = useCampaign()
  const nameId = `character-${character.id}`
  const complete = summary?.status === 'complete' ? summary : null
  const exhaustion = character.character_resources.exhaustion
  return (
    <article className="party-hero" aria-labelledby={nameId}>
      <div className="party-hero-inner">
        <PortraitPlate
          className="party-plate-art party-hero-art"
          campaignId={campaign.id}
          characterId={character.id}
          name={character.name}
          path={portrait}
        >
          <div className="party-plate-identity">
            <p className="eyebrow party-plate-eyebrow">{t('party.hero')}</p>
            <Title order={2} id={nameId} tabIndex={-1} className="party-plate-name user-copy">
              {character.name}
            </Title>
            {complete && (
              <p className="party-plate-sub user-copy">
                {classLevel(complete.class_key, complete.class_label, complete.level)}
              </p>
            )}
          </div>
        </PortraitPlate>
        <div className="party-plate-body party-hero-body">
          {complete && (
            <Vitals
              current={complete.current_hp}
              max={complete.max_hp}
              temp={complete.temp_hp}
              armorClass={complete.armor_class}
              size="lg"
            />
          )}
          {summary?.status === 'draft' && (
            <SheetDraft character={character} summary={summary} path={sheetPath} />
          )}
          <div className="party-hero-status">
            <ExhaustionDots level={exhaustion} labelled />
            <ConditionList name={character.name} conditions={live?.conditions ?? []} />
          </div>
          <Ledger character={character} />
          {summary?.status !== 'draft' && (
            <div className="party-hero-actions">
              <Button
                component={Link}
                to={sheetPath}
                className="party-hero-sheet"
                leftSection={<ScrollText size={18} aria-hidden="true" />}
                aria-describedby={nameId}
              >
                {t('sheet.view')}
              </Button>
              {inventoryPath && (
                <Link to={inventoryPath} className="party-quiet-link">
                  <Backpack size={18} aria-hidden="true" />
                  {t('party.openInventory')}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

/** RYT-097: a teammate as a 4:5 portrait card. Live state only when the DM shares it; the trade
 * icon sits on the portrait either way. */
export function TeammateCard({
  member,
  campaignId,
  portrait,
}: {
  member: PartyMember
  campaignId: string
  portrait: string | null
}) {
  const { t } = useTranslation()
  const classLevel = useClassLevel()
  const live = teammateLive(member)
  const hidden = !member.shares_live
  const headingId = `teammate-${member.id}`
  const sub =
    member.sheet_status === 'complete'
      ? classLevel(member.class_key, member.class_label, member.level)
      : null
  const note = hidden
    ? t('party.liveHidden')
    : member.sheet_status === 'draft'
      ? t('party.liveDraft')
      : t('party.liveNoSheet')
  const hp = live
    ? [
        t('sheet.hpValue', { current: live.current, max: live.max }),
        live.temp > 0 ? t('party.liveTemp', { value: live.temp }) : null,
      ]
        .filter(Boolean)
        .join(', ')
    : ''
  return (
    <article
      className="party-mate"
      data-hidden={hidden || undefined}
      data-tone={live?.tone}
      aria-labelledby={headingId}
    >
      <PortraitPlate
        className="party-mate-art"
        campaignId={campaignId}
        characterId={member.id}
        name={member.name}
        path={portrait}
      >
        {live && (
          <span className="party-mate-band" aria-hidden="true">
            <span style={{ '--hp': `${live.ratio}%` } as CSSProperties} />
          </span>
        )}
        {hidden && (
          <span className="party-mate-lock" aria-hidden="true">
            <Lock size={16} />
          </span>
        )}
        <TradeButton partnerId={member.id} name={member.name} />
      </PortraitPlate>
      <div className="party-mate-body">
        <Title order={3} id={headingId} className="party-mate-name user-copy">
          {member.name}
        </Title>
        {sub && <p className="party-mate-sub user-copy">{sub}</p>}
        {live ? (
          <>
            <div className="party-mate-vitals">
              <span className="party-mate-hp" role="img" aria-label={hp}>
                <Heart size={15} aria-hidden="true" />
                <span aria-hidden="true">
                  {live.current}
                  <span className="party-mate-max">/{live.max}</span>
                </span>
                {live.temp > 0 && (
                  <span className="party-mate-temp" aria-hidden="true">
                    +{live.temp}
                  </span>
                )}
              </span>
              {live.armorClass !== null && (
                <span
                  className="party-mate-ac"
                  role="img"
                  aria-label={t('party.liveAc', { value: live.armorClass })}
                >
                  <Shield size={15} aria-hidden="true" />
                  <span aria-hidden="true">{live.armorClass}</span>
                </span>
              )}
            </div>
            {live.exhaustion > 0 && <ExhaustionDots level={live.exhaustion} />}
            <ConditionList name={member.name} conditions={live.conditions} />
          </>
        ) : (
          <p className="party-mate-note">{note}</p>
        )}
      </div>
    </article>
  )
}

/** RYT-097: the DM's plate: art and name, owner, live sharing and the menu, vitals and the
 * counters (gold, water, rations, exhaustion) on the existing transactional resource RPC. */
export function DmPlate({
  character,
  summary,
  live,
  portrait,
  owner,
  onAssign,
  onResources,
  onArchive,
  onShareError,
  onShareSaved,
  onResourceError,
}: {
  character: Character
  summary: SheetSummary | undefined
  live: PartyMember | undefined
  portrait: string | null
  /** The Player's display name, or null when unknown. */
  owner: string | null
  onAssign: (target: HTMLElement) => void
  onResources: (target: HTMLElement) => void
  onArchive: (target: HTMLElement) => void
  onShareError: () => void
  onShareSaved: () => void
  onResourceError: (error: ResourceError) => void
}) {
  const { t } = useTranslation()
  const classLevel = useClassLevel()
  const campaign = useCampaign()
  const nameId = `character-${character.id}`
  const sheetPath = `/campaign/${campaign.id}/party/${character.id}`
  const complete = summary?.status === 'complete' ? summary : null
  return (
    <article className="party-dm" aria-labelledby={nameId}>
      <PortraitPlate
        className="party-plate-art party-dm-art"
        campaignId={campaign.id}
        characterId={character.id}
        name={character.name}
        path={portrait}
      >
        <div className="party-plate-identity">
          <Title order={2} id={nameId} tabIndex={-1} className="party-plate-name user-copy">
            <Link to={sheetPath} className="party-plate-name-link">
              {character.name}
            </Link>
          </Title>
          {complete && (
            <p className="party-plate-sub user-copy">
              {classLevel(complete.class_key, complete.class_label, complete.level)}
            </p>
          )}
        </div>
      </PortraitPlate>
      <div className="party-plate-body party-dm-body">
        <div className="party-dm-meta">
          <p className="party-dm-owner user-copy" data-free={!character.user_id || undefined}>
            <UserRound size={16} aria-hidden="true" />
            {character.user_id
              ? t('characters.playerName', { name: owner ?? t('characters.assigned') })
              : t('characters.unassigned')}
          </p>
          {live && (
            <LiveShareToggle
              campaignId={campaign.id}
              characterId={character.id}
              name={character.name}
              shared={live.shares_live}
              onError={onShareError}
              onSuccess={onShareSaved}
            />
          )}
          <CharacterMenu
            character={character}
            sheetPath={sheetPath}
            itemPath={`/campaign/${campaign.id}/members?panel=items&create=${character.id}`}
            inventoryPath={`/campaign/${campaign.id}/inventory?character=${character.id}`}
            onAssign={onAssign}
            onResources={onResources}
            onArchive={onArchive}
          />
        </div>
        {complete && (
          <Vitals
            current={complete.current_hp}
            max={complete.max_hp}
            temp={complete.temp_hp}
            armorClass={complete.armor_class}
            size="md"
          />
        )}
        {summary?.status === 'draft' && (
          <SheetDraft character={character} summary={summary} path={sheetPath} />
        )}
        <DmCounters character={character} campaignId={campaign.id} onError={onResourceError} />
      </div>
    </article>
  )
}

/** HP as a large serif number with the maximum and temporary HP, an 8px meter and the AC seal. */
function Vitals({
  current,
  max,
  temp,
  armorClass,
  size,
}: {
  current: number
  max: number
  temp: number
  armorClass: number
  size: 'lg' | 'md'
}) {
  const { t } = useTranslation()
  const { ratio, tone } = hpTone(current, max)
  const tempRatio = Math.min(100 - ratio, Math.round((temp / Math.max(1, max)) * 100))
  const label = [
    t('sheet.hpValue', { current, max }),
    temp > 0 ? t('party.liveTemp', { value: temp }) : null,
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <div className="party-vitals" data-size={size} data-tone={tone}>
      <div className="party-vitals-hp">
        <div className="party-hp" role="img" aria-label={label}>
          <Heart className="party-hp-heart" aria-hidden="true" />
          <span className="party-hp-now" aria-hidden="true">
            {current}
          </span>
          <span className="party-hp-max" aria-hidden="true">
            /{max}
          </span>
          {temp > 0 && (
            <span className="party-hp-temp" aria-hidden="true">
              {t('party.liveTemp', { value: temp })}
            </span>
          )}
        </div>
        <HpMeter ratio={ratio} tempRatio={tempRatio} tone={tone} />
      </div>
      <AcSeal value={armorClass} />
    </div>
  )
}

function HpMeter({ ratio, tempRatio, tone }: { ratio: number; tempRatio: number; tone: HpTone }) {
  return (
    <span className="party-meter" data-tone={tone} aria-hidden="true">
      <span className="party-meter-hp" style={{ width: `${ratio}%` }} />
      {tempRatio > 0 && <span className="party-meter-temp" style={{ width: `${tempRatio}%` }} />}
    </span>
  )
}

/** Armor class as a shield seal with the number inside and the abbreviation under it. */
function AcSeal({ value }: { value: number }) {
  const { t } = useTranslation()
  return (
    <span className="party-seal" role="img" aria-label={t('party.liveAc', { value })}>
      <span className="party-seal-shield" aria-hidden="true">
        <Shield strokeWidth={1.5} />
        <span className="party-seal-value">{value}</span>
      </span>
      <span className="party-seal-label" aria-hidden="true">
        {t('party.acShort')}
      </span>
    </span>
  )
}

/** Read-only exhaustion: a flame and six dots, filled up to the level. */
function ExhaustionDots({ level, labelled = false }: { level: number; labelled?: boolean }) {
  const { t } = useTranslation()
  return (
    <span
      className="party-dots"
      data-active={level > 0 || undefined}
      role="img"
      aria-label={t('characters.exhaustionLevel', { level })}
    >
      <Flame size={16} aria-hidden="true" />
      {labelled && (
        <span className="party-dots-label" aria-hidden="true">
          {t('characters.exhaustion')}
        </span>
      )}
      <span className="party-dots-row" aria-hidden="true">
        {Array.from({ length: exhaustionLevels }, (_, index) => (
          <span key={index} data-filled={index < level || undefined} />
        ))}
      </span>
      {level > exhaustionLevels && (
        <span className="party-dots-more" aria-hidden="true">
          {level}
        </span>
      )}
    </span>
  )
}

function ConditionList({ name, conditions }: { name: string; conditions: Condition[] }) {
  const { t } = useTranslation()
  if (conditions.length === 0) return null
  return (
    <ul className="party-conditions" aria-label={t('party.liveConditions', { name })}>
      {conditions.map((condition) => (
        <li key={condition}>
          <GlossaryTerm id={glossaryIds.condition(condition)}>
            {t(`srd.condition.${condition}`)}
          </GlossaryTerm>
        </li>
      ))}
    </ul>
  )
}

/** The purse as a three-column ledger: gold, water and rations. */
function Ledger({ character }: { character: Character }) {
  const { t, i18n } = useTranslation()
  return (
    <dl className="party-ledger">
      {ledgerFields.map(({ field, icon: Icon, short }) => (
        <div key={field} className="party-ledger-cell" data-kind={field}>
          <dt>
            <Icon size={16} aria-hidden="true" />
            {t(short)}
          </dt>
          <dd className="party-ledger-value">
            {character.character_resources[field].toLocaleString(i18n.language)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** The DM's counters: the same ledger with gold opening its editor, water and rations on
 * steppers (hold for ×5) and the six exhaustion pips. */
function DmCounters({
  character,
  campaignId,
  onError,
}: {
  character: Character
  campaignId: string
  onError: (error: ResourceError) => void
}) {
  const { t, i18n } = useTranslation()
  const resource = useResourceAction(campaignId, character.id)
  const values = character.character_resources
  const [goldOpen, setGoldOpen] = useState(false)
  const goldButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (resource.error) onError(resource.error.message === 'stale' ? 'stale' : 'unavailable')
  }, [resource.error, onError])
  const limit = (field: LedgerField | 'exhaustion') =>
    field === 'gold' ? Number.MAX_SAFE_INTEGER : 2147483647
  const send = (field: LedgerField | 'exhaustion', change: (current: number) => number) =>
    resource.apply((current) => {
      onError(null)
      return { [field]: Math.min(limit(field), Math.max(0, change(current[field]))) }
    })
  const step = (field: LedgerField | 'exhaustion') => (delta: number) => {
    const next = values[field] + delta
    if (next < 0 || next > limit(field)) return
    send(field, (value) => value + delta)
  }
  const exhaustion = values.exhaustion
  return (
    <>
      <dl className="party-ledger" data-editable>
        {ledgerFields.map(({ field, icon: Icon, short, long }) => {
          const value = values[field]
          const label = t(long)
          return (
            <div key={field} className="party-ledger-cell" data-kind={field}>
              <dt>
                <Icon size={16} aria-hidden="true" />
                {t(short)}
              </dt>
              {field === 'gold' ? (
                <dd>
                  {/* The value and its pencil key are one control, aligned with the steppers. */}
                  <button
                    ref={goldButton}
                    type="button"
                    className="party-gold-button"
                    aria-label={t('catalogue.editGold', { name: character.name, value })}
                    onClick={() => setGoldOpen(true)}
                  >
                    <span className="party-ledger-value">
                      {value.toLocaleString(i18n.language)}
                    </span>
                    <span className="party-gold-key" aria-hidden="true">
                      <Pencil size={16} />
                    </span>
                  </button>
                </dd>
              ) : (
                <dd>
                  <span className="party-ledger-value">{value.toLocaleString(i18n.language)}</span>
                  <span className="party-ledger-steps">
                    <StepButton
                      delta={-1}
                      label={`${t('characters.decrease', { field: label })} · ${character.name}`}
                      disabled={value <= 0}
                      step={step(field)}
                    />
                    <StepButton
                      delta={1}
                      label={`${t('characters.increase', { field: label })} · ${character.name}`}
                      disabled={value >= limit(field)}
                      step={step(field)}
                    />
                  </span>
                </dd>
              )}
            </div>
          )
        })}
      </dl>
      <div className="party-dm-exhaustion" data-active={exhaustion > 0 || undefined}>
        <p className="party-dm-exhaustion-head">
          <Flame size={16} aria-hidden="true" />
          {t('characters.exhaustion')}
          <span className="party-dm-exhaustion-value">
            {exhaustion}
            <span aria-hidden="true">/{exhaustionLevels}</span>
          </span>
        </p>
        {exhaustion <= exhaustionLevels ? (
          <div
            className="exhaustion-pips"
            role="group"
            aria-label={t('characters.exhaustionLevel', { level: exhaustion })}
          >
            {Array.from({ length: exhaustionLevels }, (_, index) => {
              const level = index + 1
              const filled = level <= exhaustion
              // Pressing the current top level steps down one level; each pip says what it does.
              const target = level === exhaustion ? level - 1 : level
              const action = t(
                target > exhaustion ? 'party.exhaustionUp' : 'party.exhaustionDown',
                {
                  level: target,
                },
              )
              return (
                <button
                  key={level}
                  type="button"
                  className="exhaustion-pip"
                  data-filled={filled || undefined}
                  // The visible number leads the name (WCAG 2.5.3); the rest says what a tap does.
                  aria-label={`${level} · ${action} · ${character.name}`}
                  title={action}
                  onClick={() => send('exhaustion', () => target)}
                >
                  <span aria-hidden="true">{level}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <span className="party-ledger-steps">
            <StepButton
              delta={-1}
              label={`${t('characters.decrease', { field: t('characters.exhaustion') })} · ${character.name}`}
              disabled={false}
              step={step('exhaustion')}
            />
            <StepButton
              delta={1}
              label={`${t('characters.increase', { field: t('characters.exhaustion') })} · ${character.name}`}
              disabled={exhaustion >= limit('exhaustion')}
              step={step('exhaustion')}
            />
          </span>
        )}
      </div>
      {goldOpen && (
        <GoldEditor
          character={character}
          onClose={() => {
            setGoldOpen(false)
            requestAnimationFrame(() => goldButton.current?.focus())
          }}
        />
      )}
    </>
  )
}

/** A sheet still being made: the note and the one way forward. The character exists, so it
 * reuses the roster's keys (unfinished sheet, finish sheet) whether it is blank or started. */
function SheetDraft({
  character,
  summary,
  path,
}: {
  character: Character
  summary: SheetSummary
  path: string
}) {
  const { t } = useTranslation()
  const [chooser, setChooser] = useState(false)
  const describedBy = `character-${character.id}`
  return (
    <div className="party-draft">
      <p className="party-draft-note">
        <ScrollText size={16} aria-hidden="true" />
        {t('roster.draft')}
      </p>
      {summary.class_label ? (
        <Button component={Link} to={`${path}/create?mode=full`} aria-describedby={describedBy}>
          {t('roster.continueSheet')}
        </Button>
      ) : (
        <>
          {/* RYT-072: the three doors open over the party list. */}
          <Button
            aria-describedby={describedBy}
            aria-haspopup="dialog"
            onClick={() => setChooser(true)}
          >
            {t('roster.continueSheet')}
          </Button>
          <CreationChooser
            opened={chooser}
            onClose={() => setChooser(false)}
            name={character.name}
            characterPath={path}
          />
        </>
      )}
    </div>
  )
}

/** DM-only per-character switch for RYT-031 live sharing. Optimistic while the RPC runs. */
function LiveShareToggle({
  campaignId,
  characterId,
  name,
  shared,
  onError,
  onSuccess,
}: {
  campaignId: string
  characterId: string
  name: string
  shared: boolean
  onError: () => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const action = useCharacterAction(campaignId)
  const on =
    action.isPending && action.variables?.kind === 'liveSharing' ? action.variables.enabled : shared
  return (
    <div className="live-share-toggle" data-on={on || undefined}>
      <Switch
        size="md"
        checked={on}
        label={t('party.shareLabel')}
        aria-label={`${t('party.shareLabel')} · ${name}`}
        title={t('party.shareToggle', { name })}
        aria-busy={action.isPending || undefined}
        thumbIcon={
          on ? <Radio size={12} aria-hidden="true" /> : <EyeOff size={12} aria-hidden="true" />
        }
        onChange={() => {
          if (action.isPending) return
          action.mutate({ kind: 'liveSharing', characterId, enabled: !on }, { onError, onSuccess })
        }}
      />
    </div>
  )
}

function CharacterMenu({
  character,
  sheetPath,
  itemPath,
  inventoryPath,
  onAssign,
  onResources,
  onArchive,
}: {
  character: Character
  sheetPath: string
  itemPath: string
  inventoryPath: string
  onAssign: (target: HTMLElement) => void
  onResources: (target: HTMLElement) => void
  onArchive: (target: HTMLElement) => void
}) {
  const { t } = useTranslation()
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <Menu position="bottom-end" withinPortal withInitialFocusPlaceholder={false}>
      <Menu.Target>
        <ActionIcon
          ref={trigger}
          variant="subtle"
          size={44}
          className="party-dm-more"
          aria-label={t('characters.moreFor', { name: character.name })}
          title={t('common.moreActions')}
        >
          <Ellipsis size={20} aria-hidden="true" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          component={Link}
          to={sheetPath}
          leftSection={<ScrollText size={18} aria-hidden="true" />}
        >
          {t('sheet.view')}
        </Menu.Item>
        <Menu.Item
          component={Link}
          to={inventoryPath}
          leftSection={<Backpack size={18} aria-hidden="true" />}
        >
          {t('party.openInventory')}
        </Menu.Item>
        <Menu.Item
          component={Link}
          to={itemPath}
          leftSection={<PackagePlus size={18} aria-hidden="true" />}
        >
          {t('store.createFor', { name: character.name })}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<Pencil size={18} aria-hidden="true" />}
          onClick={() => trigger.current && onResources(trigger.current)}
        >
          {t('characters.edit')}
        </Menu.Item>
        <Menu.Item
          leftSection={
            character.user_id ? (
              <Unlink size={18} aria-hidden="true" />
            ) : (
              <Link2 size={18} aria-hidden="true" />
            )
          }
          onClick={() => trigger.current && onAssign(trigger.current)}
        >
          {t(character.user_id ? 'characters.unassign' : 'characters.assign')}
        </Menu.Item>
        {/* RYT-044: unassigned characters can be archived here; Player characters from the
            roster manager. */}
        {!character.user_id && (
          <Menu.Item
            leftSection={<Archive size={18} aria-hidden="true" />}
            onClick={() => trigger.current && onArchive(trigger.current)}
          >
            {t('roster.archive')}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}

function StepButton({
  delta,
  label,
  disabled,
  step,
}: {
  delta: 1 | -1
  label: string
  disabled: boolean
  step: (amount: number) => void
}) {
  const { t } = useTranslation()
  // aria-disabled (not native disabled) keeps keyboard focus on the control while the RPC runs.
  const press = useLongPress(
    () => !disabled && step(delta),
    () => !disabled && step(delta * 5),
  )
  return (
    <ActionIcon
      type="button"
      variant="default"
      size={44}
      className="stepper-btn"
      aria-label={label}
      title={t('characters.holdHint')}
      aria-disabled={disabled || undefined}
      data-inert={disabled || undefined}
      {...press}
    >
      {delta < 0 ? <Minus size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
    </ActionIcon>
  )
}

function GoldEditor({ character, onClose }: { character: Character; onClose: () => void }) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const action = useCharacterAction(campaign.id)
  const [gold, setGold] = useState<number | string>(character.character_resources.gold)
  const [attempted, setAttempted] = useState(false)
  const errorMessage = useRef<HTMLDivElement>(null)
  const request = useRef(newRequestId())
  const valid = typeof gold === 'number' && Number.isSafeInteger(gold) && gold >= 0
  return (
    <Modal
      opened
      onClose={() => !action.isPending && onClose()}
      title={t('catalogue.goldTitle', { name: character.name })}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid || action.isPending) return
          setAttempted(true)
          action.mutate(
            {
              kind: 'resources',
              characterId: character.id,
              values: { ...character.character_resources, gold: gold as number },
              requestId: request.current,
            },
            {
              onSuccess: onClose,
              onError: () => requestAnimationFrame(() => errorMessage.current?.focus()),
            },
          )
        }}
      >
        <Stack>
          <NumberInput
            data-autofocus
            label={t('characters.gold')}
            value={gold}
            onChange={setGold}
            min={0}
            max={Number.MAX_SAFE_INTEGER}
            allowDecimal={false}
            allowNegative={false}
            hideControls
            readOnly={attempted}
          />
          {action.isError && (
            <Alert ref={errorMessage} tabIndex={-1} color="red" role="alert">
              {t(
                action.error.message === 'stale' ? 'characters.stale' : 'catalogue.operationError',
              )}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" disabled={action.isPending} onClick={onClose}>
              {t('action.cancel')}
            </Button>
            <Button
              type="submit"
              aria-disabled={action.isPending || undefined}
              aria-busy={action.isPending}
              leftSection={action.isPending ? <Loader size={16} /> : undefined}
              disabled={!valid || action.error?.message === 'stale'}
            >
              {t(attempted ? 'common.retry' : 'characters.saveGold')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
