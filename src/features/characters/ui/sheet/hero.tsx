import { useRef, useState } from 'react'
import { Button, NumberInput, RingProgress, Switch, Text } from '@mantine/core'
import { Heart, Shield, Swords } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlossaryTerm } from '@/features/glossary'
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

/** RYT-073 hero: the HP ring is the one bold element; AC, initiative, speed, proficiency,
 * passive Perception and level sit beside it as plain stat cells. */
export function SheetHero(props: PanelProps & { exhaustion: number | undefined }) {
  const { t } = useTranslation()
  const { build, vitals, maxHp, level, armorClass, canEdit, editing, pending, locked, commit } =
    props
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
  // An AC equal to the automatic value (10 + DEX) is stored as "automatic".
  const automaticAc = defaultArmorClass(build)
  const stats = [
    { key: 'ac', term: 'rule.armor-class', label: t('sheet.acLong'), value: String(armorClass) },
    {
      key: 'init',
      term: 'rule.initiative',
      label: t('sheet.initiative'),
      value: signed(initiative(build)),
    },
    {
      key: 'speed',
      term: 'rule.speed',
      label: t('sheet.speed'),
      value: t('sheet.speedValue', { value: build.speed }),
    },
    {
      key: 'prof',
      term: 'rule.proficiency',
      label: t('sheet.proficiency'),
      value: signed(proficiencyBonus(level)),
    },
    {
      key: 'pp',
      term: 'rule.passive-perception',
      label: t('sheet.passivePerception'),
      value: String(passivePerception(build, level)),
    },
  ]
  return (
    <section className={`panel-hero hp-${tone}`} aria-labelledby="panel-hp-title">
      <h2 id="panel-hp-title" className="visually-hidden">
        {t('sheet.hp')}
      </h2>
      <div className="panel-hp">
        <RingProgress
          size={124}
          thickness={11}
          roundCaps
          className="hp-ring"
          role="img"
          rootColor="var(--app-bg)"
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
        <div className="panel-hp-meta">
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
          {editing && (
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
          )}
        </div>
      </div>
      <dl className="panel-stats">
        {stats.map((stat) => (
          <div key={stat.key} className="panel-stat" data-key={stat.key}>
            <dt>
              <GlossaryTerm id={stat.term}>{stat.label}</GlossaryTerm>
            </dt>
            <dd>
              {editing && stat.key === 'ac' ? (
                <div className="panel-stat-edit">
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
                </div>
              ) : editing && stat.key === 'speed' ? (
                <div className="panel-stat-edit">
                  <Stepper
                    label={t('sheet.speed')}
                    name={t('panel.speedName')}
                    value={build.speed}
                    min={0}
                    max={200}
                    onChange={(value) =>
                      props.change((draft) => ({
                        ...draft,
                        build: { ...draft.build, speed: value },
                      }))
                    }
                  />
                </div>
              ) : (
                stat.value
              )}
            </dd>
          </div>
        ))}
        <div className="panel-stat" data-key="level">
          <dt>{t('wizard.level')}</dt>
          <dd>
            {editing ? (
              <div className="panel-stat-edit">
                <Stepper
                  label={t('wizard.level')}
                  name={t('panel.levelName')}
                  value={level}
                  min={1}
                  max={20}
                  onChange={(value) => props.change((draft) => ({ ...draft, level: value }))}
                />
              </div>
            ) : (
              level
            )}
          </dd>
        </div>
      </dl>
      <div className="panel-hp-row">
        <Switch
          size="md"
          className="panel-inspiration"
          label={t('sheet.inspiration')}
          checked={vitals.heroic_inspiration}
          disabled={!canEdit}
          onChange={(event) =>
            commit({ ...vitals, heroic_inspiration: event.currentTarget.checked })
          }
        />
      </div>
      {canChangeHp && (
        <div className="hp-actions" role="group" aria-label={t('sheet.hpMode')}>
          <Button
            variant="light"
            className="hp-action is-damage"
            leftSection={<Swords size={18} aria-hidden="true" />}
            onClick={(event) => open('damage', event.currentTarget)}
          >
            {t('sheet.damage')}
          </Button>
          <Button
            variant="light"
            className="hp-action is-heal"
            leftSection={<Heart size={18} aria-hidden="true" />}
            onClick={(event) => open('heal', event.currentTarget)}
          >
            {t('sheet.heal')}
          </Button>
          <Button
            variant="light"
            className="hp-action is-temp"
            leftSection={<Shield size={18} aria-hidden="true" />}
            onClick={(event) => open('temp', event.currentTarget)}
          >
            {t('sheet.setTemp')}
          </Button>
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
