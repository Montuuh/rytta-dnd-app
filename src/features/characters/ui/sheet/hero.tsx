import { useRef, useState } from 'react'
import { NumberInput, RingProgress, Text, Title, Tooltip, UnstyledButton } from '@mantine/core'
import { Heart, Shield, Sparkles, Swords } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlossaryTerm } from '@/features/glossary'
import { PortraitPlate } from '@/features/inventory'
import {
  applyHp,
  defaultArmorClass,
  initiative,
  passivePerception,
  proficiencyBonus,
  signed,
} from '../../domain/rules'
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

/** RYT-090 hero: the portrait plate leads, with the name on it and the HP ring on its lower
 * edge; AC and initiative are featured and the other stats sit on one quiet line. */
export function SheetHero(props: HeroProps) {
  const { t } = useTranslation()
  const { build, vitals, maxHp, level, canEdit, editing, pending, locked, commit } = props
  const [mode, setMode] = useState<HpMode | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const current = Math.min(vitals.current_hp, maxHp)
  const ratio = Math.round((current / Math.max(1, maxHp)) * 100)
  const tempRatio = Math.min(100 - ratio, Math.round((vitals.temp_hp / Math.max(1, maxHp)) * 100))
  const tone = toneOf(current, maxHp)
  const canChangeHp = canEdit && !editing && !locked
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
            <dd>{t('sheet.speedValue', { value: build.speed })}</dd>
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

function FeaturedStats({ build, armorClass }: HeroProps) {
  const { t } = useTranslation()
  return (
    <dl className="sheet-featured">
      <div className="sheet-featured-cell" data-key="ac">
        <dt>
          <GlossaryTerm id="rule.armor-class">{t('sheet.acLong')}</GlossaryTerm>
        </dt>
        <dd>
          <span className="sheet-shield">{armorClass}</span>
        </dd>
      </div>
      <div className="sheet-featured-cell" data-key="init">
        <dt>
          <GlossaryTerm id="rule.initiative">{t('sheet.initiative')}</GlossaryTerm>
        </dt>
        <dd>{signed(initiative(build))}</dd>
      </div>
    </dl>
  )
}

/** Edit mode: AC, speed and level steppers plus the maximum HP. */
function EditStats(props: HeroProps) {
  const { t } = useTranslation()
  const { build, level, maxHp, armorClass } = props
  // An AC equal to the automatic value (10 + DEX) is stored as "automatic".
  const automaticAc = defaultArmorClass(build)
  return (
    <div className="sheet-edit-stats">
      <dl className="panel-stats">
        <div className="panel-stat" data-key="ac">
          <dt>
            <GlossaryTerm id="rule.armor-class">{t('sheet.acLong')}</GlossaryTerm>
          </dt>
          <dd>
            <Stepper
              label={t('sheet.acLong')}
              name={t('panel.acName')}
              value={armorClass}
              min={0}
              max={99}
              onChange={(value) =>
                props.change((draft) => ({
                  ...draft,
                  armorClass: value,
                  build: { ...draft.build, acOverride: value === automaticAc ? null : value },
                }))
              }
            />
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
