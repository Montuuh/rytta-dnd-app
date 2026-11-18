import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { ActionIcon, Button, NativeSelect, Text, TextInput } from '@mantine/core'
import { Check, Plus, Search, TriangleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlossaryTerm, useSrdLibrary } from '@/features/glossary'
import { Stepper } from '@/features/inventory'
import {
  canRaise,
  hitDieAverage,
  hitPointGain,
  type ChoiceKind,
  type HitPointChoice,
  type LevelUpChoices,
  type LevelUpGrants,
  type LevelUpPlan,
  type LevelUpRequirements,
  type LevelUpSummary,
  type SpellPick,
  improvementAmount,
  srdSubclassOf,
} from '../../domain/level-up'
import { finalAbilities, isClassKey, modifier, signed } from '../../domain/rules'
import type { Build, Feature } from '../../domain/sheet'
import { abilityKeys, type Ability } from '../../domain/srd'
import { useTrackerLabel } from '../resource-names'

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()

/** One radio card of a level-up choice: a native radio painted as a card (never colour alone). */
function ChoiceCard({
  name,
  checked,
  onChange,
  label,
  value,
  detail,
}: {
  name: string
  checked: boolean
  onChange: () => void
  label: string
  value?: ReactNode
  detail?: ReactNode
}) {
  return (
    <label className="levelup-choice" data-checked={checked || undefined}>
      <input
        type="radio"
        name={name}
        className="levelup-choice-input"
        checked={checked}
        onChange={onChange}
      />
      <span className="levelup-choice-copy">
        <span className="levelup-choice-label">{label}</span>
        {detail && <span className="levelup-choice-detail">{detail}</span>}
      </span>
      {value !== undefined && <span className="levelup-choice-value">{value}</span>}
      <Check size={18} className="levelup-choice-check" aria-hidden="true" />
    </label>
  )
}

/** The status of a required choice, in words and an icon. */
function ChoiceStatus({ missing }: { missing: boolean }) {
  const { t } = useTranslation()
  return (
    <span className="levelup-status" data-missing={missing || undefined}>
      {missing ? (
        <TriangleAlert size={14} aria-hidden="true" />
      ) : (
        <Check size={14} aria-hidden="true" />
      )}
      {t(missing ? 'levelUp.choices.missing' : 'levelUp.choices.done')}
    </span>
  )
}

// ---------------------------------------------------------------------------------------------
// 1. Hit points
// ---------------------------------------------------------------------------------------------

export function HitPointsStep({
  build,
  toLevel,
  maxHp,
  value,
  onChange,
}: {
  build: Build
  toLevel: number
  maxHp: number
  value: HitPointChoice
  onChange: (value: HitPointChoice) => void
}) {
  const { t } = useTranslation()
  const die = build.hitDie
  const con = modifier(finalAbilities(build).con)
  const average = hitDieAverage(die)
  const averageGain = hitPointGain(die, con, { kind: 'average' })!
  const gain = hitPointGain(die, con, value)
  return (
    <div className="levelup-step">
      <fieldset className="levelup-choices">
        <legend className="visually-hidden">{t('levelUp.hp.heading', { level: toLevel })}</legend>
        <ChoiceCard
          name="levelup-hp"
          checked={value.kind === 'average'}
          onChange={() => onChange({ kind: 'average' })}
          label={t('levelUp.hp.average')}
          value={`+${averageGain}`}
          detail={t('levelUp.hp.averageDetail', { die, average, mod: signed(con) })}
        />
        <ChoiceCard
          name="levelup-hp"
          checked={value.kind === 'roll'}
          onChange={() =>
            onChange({ kind: 'roll', roll: value.kind === 'roll' ? value.roll : null })
          }
          label={t('levelUp.hp.roll')}
          value={value.kind === 'roll' && gain !== null ? `+${gain}` : undefined}
          detail={t('levelUp.hp.rollDetail', { die })}
        />
      </fieldset>
      {value.kind === 'roll' && (
        <Stepper
          label={t('levelUp.hp.rollLabel', { die })}
          value={value.roll}
          min={1}
          max={die}
          placeholder={`1–${die}`}
          minMessage={t('levelUp.hp.rollMin')}
          maxMessage={t('levelUp.hp.rollMax', { die })}
          onChange={(roll) => onChange({ kind: 'roll', roll })}
          autoFocus
        />
      )}
      <div className="levelup-hpline" aria-live="polite">
        <span className="levelup-hpline-label">{t('levelUp.hp.newMax')}</span>
        {gain === null ? (
          <span className="levelup-hpline-value">{maxHp}</span>
        ) : (
          <span className="levelup-hpline-value">
            {maxHp} → <strong>{maxHp + gain}</strong>
            <span className="levelup-hpline-gain">{t('levelUp.hp.gain', { gain })}</span>
          </span>
        )}
      </div>
      <Text size="sm" c="dimmed">
        {gain !== null && average + con < 1 && value.kind === 'average'
          ? `${t('levelUp.hp.atLeastOne')} `
          : ''}
        {t('levelUp.hp.current')}
      </Text>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// 2. What the level grants
// ---------------------------------------------------------------------------------------------

function FeatureList({ features }: { features: Feature[] }) {
  const { t } = useTranslation()
  return (
    <ul className="levelup-list">
      {features.map((feature) => (
        <li key={feature.id} className="levelup-row">
          <Text fw={600} className="user-copy">
            {feature.ref ? (
              <GlossaryTerm id={feature.ref}>{feature.name}</GlossaryTerm>
            ) : (
              feature.name
            )}
          </Text>
          {feature.level && (
            <Text size="sm" c="dimmed">
              {t('panel.levelShort', { level: feature.level })}
            </Text>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Resources, proficiency bonus and spell slots a grants object lists, as plain lines. */
function useGrantLines(grants: LevelUpGrants) {
  const { t } = useTranslation()
  const label = useTrackerLabel()
  return [
    ...grants.resources.changed.map(({ tracker, from }) =>
      t('levelUp.grants.resourceChanged', { name: label(tracker), from, to: tracker.max }),
    ),
    ...grants.resources.added.map((tracker) =>
      t('levelUp.grants.resourceAdded', { name: label(tracker), max: tracker.max }),
    ),
  ].concat(
    grants.proficiency
      ? [
          t('levelUp.grants.proficiency', {
            from: signed(grants.proficiency.from),
            to: signed(grants.proficiency.to),
          }),
        ]
      : [],
    grants.slots.map((slot) => t('levelUp.grants.slot', slot)),
  )
}

export function GrantsStep({
  grants,
  customClass,
  subclassPending,
  library,
  toLevel,
  onRetryLibrary,
}: {
  toLevel: number
  grants: LevelUpGrants | null
  customClass: boolean
  subclassPending: boolean
  library: 'ready' | 'loading' | 'error'
  onRetryLibrary: () => void
}) {
  const { t } = useTranslation()
  const lines = useGrantLines(
    grants ?? {
      features: [],
      resources: { added: [], changed: [], features: 0 },
      proficiency: null,
      slots: [],
      leftOut: 0,
    },
  )
  // Features of earlier levels a sheet is missing are caught up too; they are listed apart.
  const current = grants?.features.filter((feature) => feature.level === toLevel) ?? []
  const caughtUp = grants?.features.filter((feature) => feature.level !== toLevel) ?? []
  if (library === 'loading')
    return (
      <div className="levelup-step">
        <Text role="status">{t('levelUp.glossary.loading')}</Text>
      </div>
    )
  if (library === 'error' || !grants)
    return (
      <div className="levelup-step">
        <Text role="alert">{t('levelUp.glossary.error')}</Text>
        <Button variant="light" onClick={onRetryLibrary} className="levelup-inline-button">
          {t('common.retry')}
        </Button>
      </div>
    )
  return (
    <div className="levelup-step">
      <section aria-label={t('levelUp.grants.features')} className="levelup-section">
        <h4 className="levelup-subheading">{t('levelUp.grants.features')}</h4>
        {current.length > 0 ? (
          <FeatureList features={current} />
        ) : (
          <Text size="sm" c="dimmed">
            {t(customClass ? 'levelUp.grants.custom' : 'levelUp.grants.none')}
          </Text>
        )}
        {caughtUp.length > 0 && (
          <>
            <h5 className="levelup-caption">{t('levelUp.grants.caughtUp')}</h5>
            <FeatureList features={caughtUp} />
          </>
        )}
        {subclassPending && (
          <Text size="sm" c="dimmed">
            {t('levelUp.grants.subclassLater')}
          </Text>
        )}
      </section>
      {lines.length > 0 && (
        <section aria-label={t('levelUp.grants.resources')} className="levelup-section">
          <h4 className="levelup-subheading">{t('levelUp.grants.resources')}</h4>
          <ul className="levelup-list">
            {lines.map((line) => (
              <li key={line} className="levelup-row">
                <Text>{line}</Text>
              </li>
            ))}
          </ul>
        </section>
      )}
      {grants.leftOut > 0 && (
        <Text size="sm" c="dimmed">
          {t('levelUp.grants.leftOut', { count: grants.leftOut })}
        </Text>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// 3. Choices
// ---------------------------------------------------------------------------------------------

export function ChoicesStep({
  build,
  toLevel,
  requirements,
  missing,
  choices,
  onChange,
}: {
  build: Build
  toLevel: number
  requirements: LevelUpRequirements
  missing: ChoiceKind[]
  choices: LevelUpChoices
  onChange: (next: LevelUpChoices) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="levelup-step">
      {requirements.subclass && (
        <SubclassChoice
          build={build}
          missing={missing.includes('subclass')}
          value={choices.subclass}
          onChange={(subclass) => onChange({ ...choices, subclass })}
        />
      )}
      {requirements.improvement && (
        <ImprovementChoice
          build={build}
          missing={missing.includes('improvement')}
          value={choices.improvement}
          onChange={(improvement) => onChange({ ...choices, improvement })}
        />
      )}
      {requirements.spells > 0 && (
        <SpellChoice
          build={build}
          toLevel={toLevel}
          group="spells"
          total={requirements.spells}
          levels={[1, requirements.maxSpellLevel]}
          title={t('levelUp.spells.title')}
          hint={t('levelUp.spells.hint', { level: requirements.maxSpellLevel })}
          missing={missing.includes('spells')}
          picks={choices.spells}
          others={[...choices.cantrips, ...choices.spellbook]}
          onChange={(spells) => onChange({ ...choices, spells })}
        />
      )}
      {requirements.cantrips > 0 && (
        <SpellChoice
          build={build}
          toLevel={toLevel}
          group="cantrips"
          total={requirements.cantrips}
          levels={[0, 0]}
          title={t('levelUp.cantrips.title')}
          hint={t('levelUp.cantrips.hint')}
          missing={missing.includes('cantrips')}
          picks={choices.cantrips}
          others={[...choices.spells, ...choices.spellbook]}
          onChange={(cantrips) => onChange({ ...choices, cantrips })}
        />
      )}
      {requirements.spellbook > 0 && (
        <SpellChoice
          build={build}
          toLevel={toLevel}
          group="spellbook"
          total={requirements.spellbook}
          levels={[1, requirements.maxSpellLevel]}
          title={t('levelUp.spellbook.title')}
          hint={t('levelUp.spellbook.hint')}
          missing={missing.includes('spellbook')}
          picks={choices.spellbook}
          others={[...choices.spells, ...choices.cantrips]}
          onChange={(spellbook) => onChange({ ...choices, spellbook })}
        />
      )}
    </div>
  )
}

function SubclassChoice({
  build,
  missing,
  value,
  onChange,
}: {
  build: Build
  missing: boolean
  value: LevelUpChoices['subclass']
  onChange: (value: LevelUpChoices['subclass']) => void
}) {
  const { t } = useTranslation()
  const srd = srdSubclassOf(build)
  const srdName = srd ? t(`srd.subclass.${srd}` as 'srd.subclass.lore') : ''
  const mode = value === null ? null : value.key ? 'srd' : 'custom'
  return (
    <div className="levelup-card">
      <fieldset className="levelup-fieldset">
        <legend className="levelup-legend">
          <span>{t('levelUp.subclass.title')}</span>
          <ChoiceStatus missing={missing} />
        </legend>
        <div className="levelup-choices">
          {srd && (
            <ChoiceCard
              name="levelup-subclass"
              checked={mode === 'srd'}
              onChange={() => onChange({ key: srd, name: srdName })}
              label={srdName}
            />
          )}
          <ChoiceCard
            name="levelup-subclass"
            checked={mode === 'custom'}
            onChange={() => onChange({ key: '', name: value && !value.key ? value.name : '' })}
            label={t('levelUp.subclass.custom')}
          />
        </div>
        {mode === 'custom' && (
          <TextInput
            label={t('panel.subclassName')}
            maxLength={60}
            value={value?.name ?? ''}
            data-autofocus
            onChange={(event) => onChange({ key: '', name: event.currentTarget.value })}
          />
        )}
      </fieldset>
    </div>
  )
}

function ImprovementChoice({
  build,
  missing,
  value,
  onChange,
}: {
  build: Build
  missing: boolean
  value: LevelUpChoices['improvement']
  onChange: (value: LevelUpChoices['improvement']) => void
}) {
  const { t } = useTranslation()
  const scores = finalAbilities(build)
  const mode =
    value === null ? null : value.kind === 'feat' ? 'feat' : value.split ? 'split' : 'double'
  const abilities = value?.kind === 'abilities' ? value : null
  const amount = abilities ? improvementAmount(abilities) : 2
  const toggle = (ability: Ability) => {
    if (!abilities) return
    if (!abilities.split) return onChange({ ...abilities, picks: [ability] })
    const picks = abilities.picks.includes(ability)
      ? abilities.picks.filter((pick) => pick !== ability)
      : [...abilities.picks, ability].slice(-2)
    onChange({ ...abilities, picks })
  }
  return (
    <div className="levelup-card">
      <fieldset className="levelup-fieldset">
        <legend className="levelup-legend">
          <span>{t('levelUp.improvement.title')}</span>
          <ChoiceStatus missing={missing} />
        </legend>
        <div className="levelup-choices levelup-choices-three">
          <ChoiceCard
            name="levelup-improvement"
            checked={mode === 'double'}
            onChange={() => onChange({ kind: 'abilities', split: false, picks: [] })}
            label={t('levelUp.improvement.double')}
          />
          <ChoiceCard
            name="levelup-improvement"
            checked={mode === 'split'}
            onChange={() => onChange({ kind: 'abilities', split: true, picks: [] })}
            label={t('levelUp.improvement.split')}
          />
          <ChoiceCard
            name="levelup-improvement"
            checked={mode === 'feat'}
            onChange={() =>
              onChange({ kind: 'feat', name: value?.kind === 'feat' ? value.name : '' })
            }
            label={t('levelUp.improvement.feat')}
          />
        </div>
        {abilities && (
          <div role="group" aria-label={t('levelUp.improvement.scores')}>
            <Text size="sm" c="dimmed" aria-live="polite">
              {t('levelUp.improvement.picked', {
                done: abilities.picks.length,
                total: abilities.split ? 2 : 1,
              })}
            </Text>
            <div className="levelup-abilities">
              {abilityKeys.map((ability) => {
                const on = abilities.picks.includes(ability)
                const capped = !on && !canRaise(build, ability, amount as 1 | 2)
                const from = scores[ability]
                return (
                  <button
                    key={ability}
                    type="button"
                    className="levelup-ability"
                    aria-pressed={on}
                    aria-disabled={capped || undefined}
                    data-on={on || undefined}
                    onClick={() => !capped && toggle(ability)}
                  >
                    <span className="levelup-ability-name">{t(`srd.ability.${ability}`)}</span>
                    <span className="levelup-ability-score">
                      {on
                        ? `${from} → ${from + amount}`
                        : capped
                          ? t('levelUp.improvement.capped')
                          : from}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {value?.kind === 'feat' && (
          <TextInput
            label={t('levelUp.feat.name')}
            maxLength={100}
            value={value.name}
            data-autofocus
            onChange={(event) => onChange({ kind: 'feat', name: event.currentTarget.value })}
          />
        )}
      </fieldset>
    </div>
  )
}

function SpellChoice({
  build,
  toLevel,
  missing,
  picks,
  onChange,
  group,
  total,
  levels: levelRange,
  title,
  hint,
  others,
}: {
  build: Build
  toLevel: number
  /** Which pick list this is; keeps the ids of the typed spells apart. */
  group: 'spells' | 'cantrips' | 'spellbook'
  total: number
  /** Lowest and highest spell level offered (0 for cantrips). */
  levels: [number, number]
  title: string
  hint: string
  missing: boolean
  picks: SpellPick[]
  /** Picks of the other lists: not offered twice. */
  others: SpellPick[]
  onChange: (picks: SpellPick[]) => void
}) {
  const { t } = useTranslation()
  const library = useSrdLibrary()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [manual, setManual] = useState('')
  const [manualLevel, setManualLevel] = useState('1')
  const full = picks.length >= total
  const have = useMemo(() => {
    const items = [...build.spells, ...picks, ...others]
    return {
      refs: new Set(items.map((item) => item.ref).filter(Boolean)),
      names: new Set(items.map((item) => plain(item.name))),
    }
  }, [build.spells, picks, others])
  const rows = useMemo(() => {
    if (!library) return []
    const needle = plain(deferred.trim())
    return library.spells
      .filter(
        (spell) =>
          spell.level >= levelRange[0] &&
          spell.level <= levelRange[1] &&
          (!isClassKey(build.classKey) || spell.classes.includes(build.classKey as never)) &&
          (!needle || plain(spell.name).includes(needle)) &&
          !have.refs.has(spell.id) &&
          !have.names.has(plain(spell.name)),
      )
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
  }, [library, deferred, levelRange, build.classKey, have])
  const shown = rows.slice(0, 40)
  const add = (pick: SpellPick) => !full && onChange([...picks, pick])
  const levels = Array.from(
    { length: Math.max(1, levelRange[1]) },
    (_, i) => i + 1,
  )
  return (
    <div className="levelup-card">
      <fieldset className="levelup-fieldset">
        <legend className="levelup-legend">
          <span>{title}</span>
          <ChoiceStatus missing={missing} />
        </legend>
        <Text size="sm" c="dimmed" aria-live="polite">
          {t('levelUp.spells.count', { done: picks.length, total })}
          {' · '}
          {hint}
        </Text>
        {picks.length > 0 && (
          <ul className="levelup-list" aria-label={t('levelUp.spells.picks')}>
            {picks.map((pick) => (
              <li key={pick.id} className="levelup-row">
                <Text fw={600} className="user-copy">
                  {pick.name}
                </Text>
                <ActionIcon
                  size={44}
                  variant="subtle"
                  aria-label={t('levelUp.spells.remove', { name: pick.name })}
                  onClick={() => onChange(picks.filter((item) => item.id !== pick.id))}
                >
                  <X size={18} aria-hidden="true" />
                </ActionIcon>
              </li>
            ))}
          </ul>
        )}
        <TextInput
          label={t('panel.search')}
          leftSection={<Search size={16} aria-hidden="true" />}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <Text size="sm" c="dimmed" aria-live="polite">
          {library ? t('panel.libraryCount', { count: rows.length }) : t('glossary.loading')}
        </Text>
        <ul className="levelup-list levelup-spell-list">
          {shown.map((spell) => (
            <li key={spell.id} className="levelup-row">
              <div className="levelup-row-main">
                <Text fw={600}>
                  <GlossaryTerm id={spell.id}>{spell.name}</GlossaryTerm>
                </Text>
                <Text size="sm" c="dimmed">
                  {t('glossary.spell.levelShort', { level: spell.level })}
                </Text>
              </div>
              <ActionIcon
                size={44}
                variant="light"
                aria-disabled={full || undefined}
                aria-label={t('panel.addNamed', { name: spell.name })}
                onClick={() =>
                  add({
                    id: `lib-${spell.id.slice(6)}`.slice(0, 40),
                    ref: spell.id,
                    name: spell.name,
                    level: spell.level,
                    concentration: spell.concentration,
                    ritual: spell.ritual,
                  })
                }
              >
                <Plus size={18} aria-hidden="true" />
              </ActionIcon>
            </li>
          ))}
        </ul>
        {library && rows.length === 0 && (
          <Text size="sm" c="dimmed">
            {t('levelUp.spells.none')}
          </Text>
        )}
        {rows.length > shown.length && (
          <Text size="sm" c="dimmed">
            {t('panel.refineSearch', { count: rows.length - shown.length })}
          </Text>
        )}
        <div className="levelup-manual">
          <TextInput
            label={t('levelUp.spells.manual')}
            maxLength={100}
            value={manual}
            onChange={(event) => setManual(event.currentTarget.value)}
          />
          {levelRange[1] > 0 && (
            <NativeSelect
              label={t('levelUp.spells.manualLevel')}
              value={manualLevel}
              data={levels.map((level) => ({ value: String(level), label: String(level) }))}
              onChange={(event) => setManualLevel(event.currentTarget.value)}
            />
          )}
          <Button
            variant="light"
            aria-disabled={full || !manual.trim() || undefined}
            onClick={() => {
              const name = manual.trim()
              if (!name || full) return
              add({
                id: `lvlup-${group[0]}${toLevel}-${Date.now().toString(36)}`.slice(0, 40),
                name,
                level: levelRange[1] === 0 ? 0 : Number(manualLevel),
                concentration: false,
                ritual: false,
              })
              setManual('')
            }}
          >
            {t('levelUp.spells.manualAdd')}
          </Button>
        </div>
      </fieldset>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// 4. Review and the notice after the confirm
// ---------------------------------------------------------------------------------------------

/** The lines of what a level-up changed, shared by the review and the notice. */
function ChangeList({ summary }: { summary: LevelUpSummary }) {
  const { t } = useTranslation()
  const lines = useGrantLines(summary.grants)
  return (
    <ul className="levelup-list levelup-changes">
      <li className="levelup-row">
        <Text fw={600}>
          {t('levelUp.review.level', { from: summary.fromLevel, to: summary.toLevel })}
        </Text>
      </li>
      <li className="levelup-row">
        <Text fw={600}>{t('levelUp.review.hp', { from: summary.hp.from, to: summary.hp.to })}</Text>
      </li>
      {summary.grants.features.map((feature) => (
        <li key={feature.id} className="levelup-row">
          <Text className="user-copy">
            {feature.ref ? (
              <GlossaryTerm id={feature.ref}>{feature.name}</GlossaryTerm>
            ) : (
              feature.name
            )}
          </Text>
        </li>
      ))}
      {lines.map((line) => (
        <li key={line} className="levelup-row">
          <Text>{line}</Text>
        </li>
      ))}
      {summary.abilities.map((item) => (
        <li key={item.ability} className="levelup-row">
          <Text>
            {t('levelUp.done.ability', {
              ability: t(`srd.ability.${item.ability}`),
              from: item.from,
              to: item.to,
            })}
          </Text>
        </li>
      ))}
      {summary.subclass && (
        <li className="levelup-row">
          <Text className="user-copy">
            {t('levelUp.done.subclass', { name: summary.subclass })}
          </Text>
        </li>
      )}
      {summary.feat && (
        <li className="levelup-row">
          <Text className="user-copy">{t('levelUp.done.feat', { name: summary.feat })}</Text>
        </li>
      )}
      {summary.spells.length > 0 && (
        <li className="levelup-row">
          <Text className="user-copy">
            {t('levelUp.done.spells', { list: summary.spells.join(', ') })}
          </Text>
        </li>
      )}
    </ul>
  )
}

export function ReviewStep({
  plan,
  summary,
  onChoices,
}: {
  plan: LevelUpPlan
  summary: LevelUpSummary
  onChoices: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="levelup-step">
      {plan.missing.length > 0 && (
        <div className="levelup-missing" role="alert">
          <TriangleAlert size={18} aria-hidden="true" />
          <Text size="sm">
            {t('levelUp.review.missing', {
              list: plan.missing.map((kind) => t(`levelUp.kind.${kind}`)).join(', '),
            })}
          </Text>
          <Button variant="light" onClick={onChoices} className="levelup-inline-button">
            {t('levelUp.review.goChoices')}
          </Button>
        </div>
      )}
      <ChangeList summary={summary} />
      <Text size="sm" c="dimmed">
        {t('levelUp.review.hpGain', { gain: plan.gain })}
        {plan.retroactive > 0 && (
          <>
            {'. '}
            {t('levelUp.review.hpRetro', { extra: plan.retroactive, level: plan.level })}
          </>
        )}
        {'. '}
        {t('levelUp.hp.current')}
      </Text>
    </div>
  )
}

export function DoneView({ summary }: { summary: LevelUpSummary }) {
  const { t } = useTranslation()
  return (
    <div className="levelup-step">
      <h3 className="levelup-subheading">{t('levelUp.done.changed')}</h3>
      <ChangeList summary={summary} />
    </div>
  )
}
