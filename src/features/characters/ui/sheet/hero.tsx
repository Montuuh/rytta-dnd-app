import { useRef, useState, type ReactNode } from 'react'
import {
  Button,
  NumberInput,
  Popover,
  RingProgress,
  Select,
  SimpleGrid,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { Heart, Shield, Sparkles, Swords } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlossaryTerm } from '@/features/glossary'
import { PortraitPlate } from '@/features/inventory'
import { chooseBackground, chooseClass, chooseSpecies } from '../../domain/creation'
import {
  applyHp,
  defaultArmorClass,
  isBackgroundKey,
  isClassKey,
  isSpeciesKey,
  passivePerception,
  proficiencyBonus,
  signed,
  type StatBreakdown,
} from '../../domain/rules'
import { backgroundKeys, classKeys, speciesKeys, subclassOf } from '../../domain/srd'
import { toneOf } from './hp-tone'
import { HpDialog, type HpMode } from './vitals-panel'
import { Stepper } from './widgets'
import type { PanelProps } from './panel-types'

type HeroProps = PanelProps & {
  exhaustion: number | undefined
  name: string
  subtitle: string
  /** Why the sheet is read-only, when it is. */
  note: string | null
}

function StatPopover({
  label,
  title,
  breakdown,
  signedBase,
  suffix = '',
  children,
}: {
  label: string
  title: string
  breakdown: StatBreakdown
  signedBase?: boolean
  suffix?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const opened = pinned || hovered
  return (
    <Popover
      opened={opened}
      onChange={(next) => {
        if (!next) {
          setPinned(false)
          setHovered(false)
        }
      }}
      onDismiss={() => {
        setPinned(false)
        setHovered(false)
      }}
      transitionProps={{ duration: 0 }}
      withinPortal
      position="bottom"
      middlewares={{ flip: true, shift: true }}
      width={260}
    >
      <Popover.Target>
        <UnstyledButton
          type="button"
          className="stat-breakdown-trigger"
          aria-label={label}
          aria-expanded={opened}
          onClick={() => setPinned((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && opened) {
              event.stopPropagation()
              setPinned(false)
              setHovered(false)
            }
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') setHovered(true)
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') setHovered(false)
          }}
        >
          {children}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown
        maw="calc(100vw - 24px)"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setHovered(true)
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setHovered(false)
        }}
      >
        <div className="stat-breakdown">
          <Text size="xs" fw={600} className="stat-breakdown-title">
            {title}
          </Text>
          <dl className="stat-breakdown-list">
            {breakdown.parts.map((part, index) => (
              <div key={part.key} className="stat-breakdown-row">
                <dt className="user-copy">{part.label ?? t(part.labelKey as 'panel.mod.base')}</dt>
                <dd>
                  {index === 0 && !signedBase
                    ? `${part.value}${suffix}`
                    : `${signed(part.value)}${suffix}`}
                </dd>
              </div>
            ))}
            <div className="stat-breakdown-row stat-breakdown-total">
              <dt>{t('panel.mod.total')}</dt>
              <dd>{`${signedBase ? signed(breakdown.total) : breakdown.total}${suffix}`}</dd>
            </div>
          </dl>
        </div>
      </Popover.Dropdown>
    </Popover>
  )
}

/** RYT-090 hero: the portrait plate leads, with the name on it and the HP ring on its lower
 * edge; AC and initiative are featured and the other stats sit on one quiet line. */
export function SheetHero(props: HeroProps) {
  const { t } = useTranslation()
  const { build, vitals, maxHp, level, canEdit, editing, pending, locked, commit, speed } = props
  const [mode, setMode] = useState<HpMode | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const current = Math.min(vitals.current_hp, maxHp)
  const ratio = Math.round((current / Math.max(1, maxHp)) * 100)
  const tempRatio = Math.min(100 - ratio, Math.round((vitals.temp_hp / Math.max(1, maxHp)) * 100))
  const tone = toneOf(current, maxHp)
  const canChangeHp = canEdit && !editing && !locked
  const unsetOrigin =
    canEdit &&
    !editing &&
    ((!build.speciesKey && !build.speciesLabel.trim()) ||
      (!build.backgroundKey && !build.backgroundLabel.trim()))
  const open = (next: HpMode, target: HTMLElement) => {
    opener.current = target
    setMode(next)
  }
  const close = () => {
    setMode(null)
    requestAnimationFrame(() => opener.current?.focus())
  }
  const inspired = vitals.heroic_inspiration
  const hpActions = [
    { mode: 'damage' as const, label: t('sheet.damage'), icon: Swords },
    { mode: 'heal' as const, label: t('sheet.heal'), icon: Heart },
    { mode: 'temp' as const, label: t('sheet.setTemp'), icon: Shield },
  ]
  return (
    <section className={`panel-hero hp-${tone}`} aria-labelledby="sheet-name">
      <PortraitPlate
        className="sheet-plate"
        fit="whole"
        campaignId={props.campaignId}
        characterId={props.characterId}
        name={props.name}
        path={props.sheet.portrait_path ?? null}
        editable={canEdit}
      >
        <div className="sheet-plate-identity">
          <Title order={1} id="sheet-name" className="user-copy">
            {props.name}
          </Title>
          <Text className="sheet-plate-sub user-copy preserve-lines">{props.subtitle}</Text>
        </div>
        {canEdit ? (
          <Tooltip
            label={t('sheet.inspiration')}
            events={{ hover: true, focus: true, touch: true }}
          >
            <UnstyledButton
              className="sheet-inspiration"
              aria-label={t('sheet.inspiration')}
              aria-pressed={inspired}
              onClick={() => commit({ ...vitals, heroic_inspiration: !inspired })}
            >
              <Sparkles size={20} aria-hidden="true" />
            </UnstyledButton>
          </Tooltip>
        ) : (
          inspired && (
            <span className="sheet-inspiration" role="img" aria-label={t('sheet.inspiration')}>
              <Sparkles size={20} aria-hidden="true" />
            </span>
          )
        )}
      </PortraitPlate>
      <div className="sheet-vitals">
        <div className="sheet-ring">
          <RingProgress
            size={116}
            thickness={10}
            roundCaps
            className="hp-ring"
            role="img"
            rootColor="var(--app-surface)"
            sections={[
              { value: ratio, color: 'var(--hp-tone)' },
              ...(tempRatio > 0 ? [{ value: tempRatio, color: 'var(--info)' }] : []),
            ]}
            aria-label={t('sheet.hpRing', { current, max: maxHp })}
            label={
              <Text className="hp-value" ta="center" aria-hidden="true">
                <span className="hp-current">{current}</span>
                <span className="hp-max">/{maxHp}</span>
              </Text>
            }
          />
          <div className="sheet-ring-meta">
            <Text size="sm">
              <GlossaryTerm id="rule.hit-points">{t('sheet.hp')}</GlossaryTerm>
            </Text>
            {vitals.temp_hp > 0 && (
              <Text size="sm" className="hp-temp">
                {t('sheet.tempValue', { value: vitals.temp_hp })}
              </Text>
            )}
            {props.exhaustion !== undefined && props.exhaustion > 0 && (
              <Text size="sm" className="sheet-exhaustion">
                <GlossaryTerm id="condition.exhaustion">
                  {t('sheet.exhaustion', { value: props.exhaustion })}
                </GlossaryTerm>
              </Text>
            )}
          </div>
        </div>
        {editing ? <EditStats {...props} /> : <FeaturedStats {...props} />}
      </div>
      {!editing && (
        <dl className="sheet-statline">
          <div>
            <dt>
              <GlossaryTerm id="rule.speed">{t('sheet.speed')}</GlossaryTerm>
            </dt>
            <dd>
              <StatPopover
                label={t('panel.breakdownAria', {
                  stat: t('sheet.speed'),
                  value: t('sheet.speedValue', { value: speed.total }),
                })}
                title={t('sheet.speed')}
                breakdown={speed}
                suffix={` ${t('inventory.card.feet')}`}
              >
                <span className="sheet-stat-stack">
                  <span>{t('sheet.speedValue', { value: speed.total })}</span>
                  {speed.modified && speed.formula && (
                    <span className="sheet-stat-formula">{speed.formula}</span>
                  )}
                </span>
              </StatPopover>
            </dd>
          </div>
          <div>
            <dt>
              <GlossaryTerm id="rule.proficiency">{t('sheet.proficiency')}</GlossaryTerm>
            </dt>
            <dd>{signed(proficiencyBonus(level))}</dd>
          </div>
          <div>
            <dt>
              <GlossaryTerm id="rule.passive-perception">
                {t('sheet.passivePerception')}
              </GlossaryTerm>
            </dt>
            <dd>{passivePerception(build, level)}</dd>
          </div>
          <div>
            <dt>{t('wizard.level')}</dt>
            <dd>{level}</dd>
          </div>
        </dl>
      )}
      {unsetOrigin && props.onStartEdit && (
        <Button variant="light" size="sm" className="sheet-origin-cta" onClick={props.onStartEdit}>
          {t('panel.completeOrigin')}
        </Button>
      )}
      {editing && <EditIdentity {...props} />}
      {props.note && (
        <Text size="sm" c="dimmed" className="sheet-note">
          {props.note}
        </Text>
      )}
      {canChangeHp && (
        <div className="sheet-hp-actions" role="group" aria-label={t('sheet.hpMode')}>
          {hpActions.map(({ mode: kind, label, icon: Icon }) => (
            <UnstyledButton
              key={kind}
              className="sheet-hp-action"
              data-kind={kind}
              onClick={(event) => open(kind, event.currentTarget)}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </UnstyledButton>
          ))}
        </div>
      )}
      {canEdit && locked && (
        <p className="panel-lock" role="note">
          <Swords size={18} aria-hidden="true" />
          {t('panel.locked')}
        </p>
      )}
      {mode && (
        <HpDialog
          initialMode={mode}
          vitals={vitals}
          max={maxHp}
          pending={pending}
          close={close}
          apply={(chosen, amount) => {
            commit(
              chosen === 'temp'
                ? { ...vitals, temp_hp: amount }
                : applyHp(vitals, maxHp, chosen, amount),
            )
            close()
          }}
        />
      )}
    </section>
  )
}

function FeaturedStats({ armorClass, ac, init }: HeroProps) {
  const { t } = useTranslation()
  return (
    <dl className="sheet-featured">
      <div className="sheet-featured-cell" data-key="ac">
        <dt>
          <GlossaryTerm id="rule.armor-class">{t('sheet.acLong')}</GlossaryTerm>
        </dt>
        <dd>
          <StatPopover
            label={t('panel.breakdownAria', { stat: t('sheet.acLong'), value: String(armorClass) })}
            title={t('sheet.acLong')}
            breakdown={ac}
          >
            <span className="sheet-stat-stack">
              <span className="sheet-shield">{armorClass}</span>
              {ac.overridden ? (
                <span className="sheet-stat-formula">{t('panel.mod.manualShort')}</span>
              ) : (
                ac.modified &&
                ac.formula && <span className="sheet-stat-formula">{ac.formula}</span>
              )}
            </span>
          </StatPopover>
        </dd>
      </div>
      <div className="sheet-featured-cell" data-key="init">
        <dt>
          <GlossaryTerm id="rule.initiative">{t('sheet.initiative')}</GlossaryTerm>
        </dt>
        <dd>
          <StatPopover
            label={t('panel.breakdownAria', {
              stat: t('sheet.initiative'),
              value: signed(init.total),
            })}
            title={t('sheet.initiative')}
            breakdown={init}
            signedBase
          >
            <span className="sheet-stat-stack">
              <span>{signed(init.total)}</span>
              {init.modified && init.formula && (
                <span className="sheet-stat-formula">{init.formula}</span>
              )}
            </span>
          </StatPopover>
        </dd>
      </div>
    </dl>
  )
}

function EditIdentity({ build, name, change }: HeroProps) {
  const { t } = useTranslation()
  const originNamer = (kind: 'trait' | 'feat', key: string) =>
    t(`srd.${kind}.${key}` as 'srd.trait.darkvision')
  const srdSubclass = isClassKey(build.classKey) ? subclassOf[build.classKey] : undefined
  const classSelect = isClassKey(build.classKey) ? build.classKey : 'custom'
  const speciesSelect = isSpeciesKey(build.speciesKey)
    ? build.speciesKey
    : build.speciesKey === 'custom' || build.speciesLabel.trim()
      ? 'custom'
      : ''
  const backgroundSelect = isBackgroundKey(build.backgroundKey)
    ? build.backgroundKey
    : build.backgroundKey === 'custom' || build.backgroundLabel.trim()
      ? 'custom'
      : ''
  return (
    <fieldset className="plain-fieldset sheet-identity-edit">
      <legend>
        <Text size="sm" fw={600}>
          {t('panel.identity')}
        </Text>
      </legend>
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
        <TextInput
          label={t('creation.name')}
          required
          maxLength={100}
          value={name}
          error={name.trim() ? undefined : t('creation.nameRequired')}
          onChange={(event) => {
            const nextName = event.currentTarget.value
            change((draft) => ({ ...draft, name: nextName }))
          }}
        />
        <Select
          label={t('wizard.class')}
          data={[
            ...classKeys.map((key) => ({ value: key, label: t(`srd.class.${key}`) })),
            { value: 'custom', label: t('creation.customClass') },
          ]}
          value={classSelect}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          onChange={(value) => {
            if (!value) return
            change((draft) => {
              const label = isClassKey(value)
                ? t(`srd.class.${value}`)
                : isClassKey(draft.build.classKey)
                  ? ''
                  : draft.build.classLabel
              const next = chooseClass(draft.build, value, label)
              const keepSubclass =
                !isClassKey(value) || !next.subclassKey || next.subclassKey === subclassOf[value]
              return {
                ...draft,
                build: keepSubclass ? next : { ...next, subclassKey: '', subclass: '' },
              }
            })
          }}
        />
        {classSelect === 'custom' && (
          <TextInput
            label={t('wizard.customName')}
            maxLength={60}
            value={build.classLabel}
            onChange={(event) => {
              const label = event.currentTarget.value
              change((draft) => ({
                ...draft,
                build: { ...draft.build, classKey: 'custom', classLabel: label },
              }))
            }}
          />
        )}
        {srdSubclass && (
          <Select
            label={t('wizard.subclass')}
            data={[
              { value: '', label: t('panel.noSubclass') },
              {
                value: srdSubclass,
                label: t(`srd.subclass.${srdSubclass}` as 'srd.subclass.lore'),
              },
              { value: 'custom', label: t('panel.otherSubclass') },
            ]}
            value={build.subclassKey ? build.subclassKey : build.subclass ? 'custom' : ''}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            onChange={(value) =>
              change((draft) => ({
                ...draft,
                build: {
                  ...draft.build,
                  subclassKey: value === srdSubclass ? value : '',
                  subclass:
                    value === srdSubclass
                      ? t(`srd.subclass.${srdSubclass}` as 'srd.subclass.lore')
                      : value === 'custom'
                        ? draft.build.subclass
                        : '',
                },
              }))
            }
          />
        )}
        {!build.subclassKey && (srdSubclass === undefined || build.subclass) && (
          <TextInput
            label={t('panel.subclassName')}
            maxLength={60}
            value={build.subclass}
            onChange={(event) => {
              const value = event.currentTarget.value
              change((draft) => ({ ...draft, build: { ...draft.build, subclass: value } }))
            }}
          />
        )}
        <Select
          label={t('wizard.species')}
          data={[
            { value: '', label: t('sheet.unset') },
            ...speciesKeys.map((key) => ({ value: key, label: t(`srd.species.${key}`) })),
            { value: 'custom', label: t('wizard.customSpecies') },
          ]}
          value={speciesSelect}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          onChange={(value) => {
            const nextKey = value ?? ''
            change((draft) => {
              const label = isSpeciesKey(nextKey)
                ? t(`srd.species.${nextKey}`)
                : nextKey === 'custom'
                  ? isSpeciesKey(draft.build.speciesKey)
                    ? ''
                    : draft.build.speciesLabel
                  : ''
              return { ...draft, build: chooseSpecies(draft.build, nextKey, label, originNamer) }
            })
          }}
        />
        {speciesSelect === 'custom' && (
          <TextInput
            label={t('wizard.customSpecies')}
            maxLength={60}
            value={build.speciesLabel}
            onChange={(event) => {
              const label = event.currentTarget.value
              change((draft) => ({
                ...draft,
                build: { ...draft.build, speciesKey: 'custom', speciesLabel: label },
              }))
            }}
          />
        )}
        <Select
          label={t('wizard.background')}
          data={[
            { value: '', label: t('sheet.unset') },
            ...backgroundKeys.map((key) => ({ value: key, label: t(`srd.background.${key}`) })),
            { value: 'custom', label: t('wizard.customBackground') },
          ]}
          value={backgroundSelect}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          onChange={(value) => {
            const nextKey = value ?? ''
            change((draft) => {
              const label = isBackgroundKey(nextKey)
                ? t(`srd.background.${nextKey}`)
                : nextKey === 'custom'
                  ? isBackgroundKey(draft.build.backgroundKey)
                    ? ''
                    : draft.build.backgroundLabel
                  : ''
              const prevBonuses = draft.build.bonuses
              return {
                ...draft,
                build: {
                  ...chooseBackground(draft.build, nextKey, label, originNamer),
                  bonuses: prevBonuses,
                },
              }
            })
          }}
        />
        {backgroundSelect === 'custom' && (
          <TextInput
            label={t('wizard.customBackground')}
            maxLength={60}
            value={build.backgroundLabel}
            onChange={(event) => {
              const label = event.currentTarget.value
              change((draft) => ({
                ...draft,
                build: { ...draft.build, backgroundKey: 'custom', backgroundLabel: label },
              }))
            }}
          />
        )}
      </SimpleGrid>
    </fieldset>
  )
}

/** Edit mode: AC bonus/override, speed and level steppers plus the maximum HP. */
function EditStats(props: HeroProps) {
  const { t } = useTranslation()
  const { build, level, maxHp, ac } = props
  const automaticAc = ac.autoTotal ?? defaultArmorClass(build, props.equipped, level)
  return (
    <div className="sheet-edit-stats">
      <dl className="panel-stats">
        <div className="panel-stat" data-key="ac">
          <dt>
            <GlossaryTerm id="rule.armor-class">{t('sheet.acLong')}</GlossaryTerm>
          </dt>
          <dd>
            <div className="panel-ac-edit">
              <Text size="xs" c="dimmed" className="panel-ac-auto">
                {t('panel.acAutoSummary', { value: automaticAc })}
              </Text>
              <Stepper
                label={t('panel.acBonusLabel')}
                name={t('panel.acBonusName')}
                value={build.acBonus ?? 0}
                min={-20}
                max={20}
                format={signed}
                onChange={(value) =>
                  props.change((draft) => ({ ...draft, build: { ...draft.build, acBonus: value } }))
                }
              />
              <Switch
                size="sm"
                className="panel-ac-switch"
                checked={build.acOverride !== null}
                label={t('panel.acManualToggle')}
                onChange={(event) => {
                  const on = event.currentTarget.checked
                  props.change((draft) => ({
                    ...draft,
                    build: { ...draft.build, acOverride: on ? automaticAc : null },
                  }))
                }}
              />
              {build.acOverride !== null && (
                <Stepper
                  label={t('sheet.acLong')}
                  name={t('panel.acName')}
                  value={build.acOverride}
                  min={0}
                  max={99}
                  onChange={(value) =>
                    props.change((draft) => ({
                      ...draft,
                      armorClass: value,
                      build: { ...draft.build, acOverride: value },
                    }))
                  }
                />
              )}
            </div>
          </dd>
        </div>
        <div className="panel-stat" data-key="speed">
          <dt>
            <GlossaryTerm id="rule.speed">{t('sheet.speed')}</GlossaryTerm>
          </dt>
          <dd>
            <Stepper
              label={t('sheet.speed')}
              name={t('panel.speedName')}
              value={build.speed}
              min={0}
              max={200}
              onChange={(value) =>
                props.change((draft) => ({ ...draft, build: { ...draft.build, speed: value } }))
              }
            />
          </dd>
        </div>
        <div className="panel-stat" data-key="level">
          <dt>{t('wizard.level')}</dt>
          <dd>
            <Stepper
              label={t('wizard.level')}
              name={t('panel.levelName')}
              value={level}
              min={1}
              max={20}
              onChange={(value) => props.change((draft) => ({ ...draft, level: value }))}
            />
          </dd>
        </div>
      </dl>
      <NumberInput
        hideControls
        label={t('wizard.maxHp')}
        min={1}
        max={9999}
        allowDecimal={false}
        allowNegative={false}
        value={maxHp}
        onChange={(value) =>
          typeof value === 'number' &&
          props.change((draft) => ({ ...draft, maxHp: Math.min(9999, Math.max(1, value)) }))
        }
        className="panel-input"
      />
    </div>
  )
}
