import { useRef, useState } from 'react'
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  RingProgress,
  SegmentedControl,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { Delete, Heart, Minus, Plus, Shield, Swords } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  applyHp,
  initiative,
  passivePerception,
  proficiencyBonus,
  signed,
} from '../../domain/rules'
import type { Build, SheetRow, Vitals } from '../../domain/sheet'

export type SheetProps = {
  build: Build
  sheet: SheetRow
  vitals: Vitals
  canEdit: boolean
  pending: boolean
  commit: (values: Vitals) => void
}
type HpMode = 'damage' | 'heal' | 'temp'
const quickAmounts = [1, 5, 10] as const
const maxAmount = 9999

function toneOf(current: number, max: number) {
  const ratio = (current / Math.max(1, max)) * 100
  return ratio > 50 ? 'healthy' : ratio > 25 ? 'wounded' : 'critical'
}

export function VitalsPanel({
  build,
  sheet,
  vitals,
  canEdit,
  pending,
  commit,
  exhaustion,
}: SheetProps & { exhaustion: number | undefined }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<HpMode | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const ratio = Math.round((vitals.current_hp / sheet.max_hp) * 100)
  const tempRatio = Math.min(100 - ratio, Math.round((vitals.temp_hp / sheet.max_hp) * 100))
  const tone = toneOf(vitals.current_hp, sheet.max_hp)
  const stats = [
    { key: 'ac', label: t('sheet.acLong'), value: String(sheet.armor_class) },
    { key: 'init', label: t('sheet.initiative'), value: signed(initiative(build)) },
    { key: 'speed', label: t('sheet.speed'), value: t('sheet.speedValue', { value: build.speed }) },
    { key: 'prof', label: t('sheet.proficiency'), value: signed(proficiencyBonus(sheet.level)) },
    {
      key: 'pp',
      label: t('sheet.passivePerception'),
      value: String(passivePerception(build, sheet.level)),
    },
  ]
  const step = (delta: number) =>
    commit(applyHp(vitals, sheet.max_hp, delta < 0 ? 'damage' : 'heal', Math.abs(delta)))
  const open = (next: HpMode, target: HTMLElement) => {
    opener.current = target
    setMode(next)
  }
  return (
    <Stack gap="sm">
      <Paper p="md" className={`hp-panel hp-${tone}`}>
        <div className="hp-head">
          <RingProgress
            size={132}
            thickness={11}
            roundCaps
            className="hp-ring"
            role="img"
            rootColor="var(--app-bg)"
            sections={[
              { value: ratio, color: 'var(--hp-tone)' },
              ...(tempRatio > 0 ? [{ value: tempRatio, color: 'var(--info)' }] : []),
            ]}
            aria-label={t('sheet.hpRing', { current: vitals.current_hp, max: sheet.max_hp })}
            label={
              <Text className="hp-value" ta="center" aria-hidden="true">
                <span className="hp-current">{vitals.current_hp}</span>
                <span className="hp-max">/{sheet.max_hp}</span>
              </Text>
            }
          />
          <div className="hp-meta">
            <Text size="sm" c="dimmed" id="hp-label">
              {t('sheet.hp')}
            </Text>
            <Text size="sm" className="hp-temp">
              {vitals.temp_hp > 0 ? t('sheet.tempValue', { value: vitals.temp_hp }) : ' '}
            </Text>
            {exhaustion !== undefined && exhaustion > 0 && (
              <Text size="sm" className="sheet-exhaustion">
                {t('sheet.exhaustion', { value: exhaustion })}
              </Text>
            )}
            {canEdit && (
              <Group gap="xs" wrap="nowrap" mt={6}>
                <ActionIcon
                  size={48}
                  variant="default"
                  aria-label={t('sheet.quickDamage', { value: 1 })}
                  disabled={pending || vitals.current_hp + vitals.temp_hp === 0}
                  onClick={() => step(-1)}
                >
                  <Minus size={20} aria-hidden="true" />
                </ActionIcon>
                <ActionIcon
                  size={48}
                  variant="default"
                  aria-label={t('sheet.quickHeal', { value: 1 })}
                  disabled={pending || vitals.current_hp >= sheet.max_hp}
                  onClick={() => step(1)}
                >
                  <Plus size={20} aria-hidden="true" />
                </ActionIcon>
              </Group>
            )}
          </div>
        </div>
        {canEdit && (
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
      </Paper>
      <dl className="sheet-stats">
        {stats.map((stat) => (
          <div key={stat.key} className="sheet-stat">
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
      {mode && (
        <HpDialog
          initialMode={mode}
          vitals={vitals}
          max={sheet.max_hp}
          pending={pending}
          close={() => {
            setMode(null)
            requestAnimationFrame(() => opener.current?.focus())
          }}
          apply={(chosen, amount) => {
            const next =
              chosen === 'temp'
                ? { ...vitals, temp_hp: amount }
                : applyHp(vitals, sheet.max_hp, chosen, amount)
            commit(next)
            setMode(null)
            requestAnimationFrame(() => opener.current?.focus())
          }}
        />
      )}
    </Stack>
  )
}

function HpDialog({
  initialMode,
  vitals,
  max,
  pending,
  close,
  apply,
}: {
  initialMode: HpMode
  vitals: Vitals
  max: number
  pending: boolean
  close: () => void
  apply: (mode: HpMode, amount: number) => void
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<HpMode>(initialMode)
  const [amount, setAmount] = useState<number | string>('')
  const value = typeof amount === 'number' ? amount : Number.NaN
  const valid = Number.isInteger(value) && value >= 0 && value <= maxAmount
  const preview = valid
    ? mode === 'temp'
      ? { ...vitals, temp_hp: value }
      : applyHp(vitals, max, mode, value)
    : vitals
  const press = (digit: number) =>
    setAmount((current) => {
      const next = Number(`${typeof current === 'number' ? current : ''}${digit}`)
      return next > maxAmount ? current : next
    })
  const backspace = () =>
    setAmount((current) => {
      const text = typeof current === 'number' ? String(current).slice(0, -1) : ''
      return text ? Number(text) : ''
    })
  const previewRatio = Math.round((preview.current_hp / Math.max(1, max)) * 100)
  return (
    <Modal
      opened
      onClose={close}
      title={t(`sheet.hpDialog.${mode}`)}
      className="hp-dialog"
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (valid && !pending) apply(mode, value)
        }}
      >
        <Stack gap="sm">
          <SegmentedControl
            fullWidth
            value={mode}
            onChange={(next) => setMode(next as HpMode)}
            aria-label={t('sheet.hpMode')}
            className="hp-mode"
            data={[
              { value: 'damage', label: t('sheet.damage') },
              { value: 'heal', label: t('sheet.heal') },
              { value: 'temp', label: t('sheet.setTemp') },
            ]}
          />
          <NumberInput
            hideControls
            data-autofocus
            label={t('sheet.amount')}
            min={0}
            max={maxAmount}
            allowDecimal={false}
            allowNegative={false}
            inputMode="numeric"
            value={amount}
            onChange={setAmount}
            className="hp-amount"
            description={
              mode === 'damage'
                ? t('sheet.hpDialog.damageHint')
                : mode === 'temp'
                  ? t('sheet.hpDialog.tempHint')
                  : undefined
            }
          />
          <div className="hp-chips" role="group" aria-label={t('sheet.quickChips')}>
            {quickAmounts.map((chip) => (
              <Button
                key={chip}
                variant="default"
                onClick={() =>
                  setAmount((current) =>
                    Math.min(maxAmount, (typeof current === 'number' ? current : 0) + chip),
                  )
                }
              >
                {mode === 'damage' ? '−' : '+'}
                {chip}
              </Button>
            ))}
          </div>
          <div className="keypad" role="group" aria-label={t('sheet.keypad')}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <UnstyledButton key={digit} className="keypad-key" onClick={() => press(digit)}>
                {digit}
              </UnstyledButton>
            ))}
            <UnstyledButton className="keypad-key is-muted" onClick={() => setAmount('')}>
              {t('sheet.keypadClear')}
            </UnstyledButton>
            <UnstyledButton className="keypad-key" onClick={() => press(0)}>
              0
            </UnstyledButton>
            <UnstyledButton
              className="keypad-key is-muted"
              aria-label={t('sheet.keypadBackspace')}
              onClick={backspace}
            >
              <Delete size={20} aria-hidden="true" />
            </UnstyledButton>
          </div>
          <div className={`hp-preview hp-${toneOf(preview.current_hp, max)}`} aria-live="polite">
            <div className="hp-preview-bar" aria-hidden="true">
              <span style={{ width: `${previewRatio}%` }} />
            </div>
            <Text size="sm" fw={600}>
              {mode === 'temp'
                ? t('sheet.tempPreview', { value: preview.temp_hp })
                : t('sheet.hpPreview', { value: `${preview.current_hp}/${max}` })}
            </Text>
          </div>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={close}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || pending}>
              {t('sheet.apply')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
