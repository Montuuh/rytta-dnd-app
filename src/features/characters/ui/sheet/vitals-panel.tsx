import { useRef, useState } from 'react'
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Progress,
  Stack,
  Text,
} from '@mantine/core'
import { Heart, Minus, Plus, Shield, Swords } from 'lucide-react'
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
  const tone = ratio > 50 ? 'healthy' : ratio > 25 ? 'wounded' : 'critical'
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
        <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
          <div>
            <Text size="sm" c="dimmed" id="hp-label">
              {t('sheet.hp')}
            </Text>
            <Text className="hp-value" aria-describedby="hp-label">
              <span className="hp-current">{vitals.current_hp}</span>
              <span className="hp-max"> / {sheet.max_hp}</span>
            </Text>
            <Text size="sm" className="hp-temp">
              {vitals.temp_hp > 0 ? t('sheet.tempValue', { value: vitals.temp_hp }) : ' '}
            </Text>
          </div>
          {canEdit && (
            <Group gap="xs" wrap="nowrap">
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
        </Group>
        <Progress
          value={ratio}
          size="md"
          mt="xs"
          className="hp-bar"
          aria-label={t('sheet.hpValue', { current: vitals.current_hp, max: sheet.max_hp })}
        />
        {canEdit && (
          <div className="hp-actions">
            <Button
              variant="light"
              leftSection={<Swords size={16} aria-hidden="true" />}
              onClick={(event) => open('damage', event.currentTarget)}
            >
              {t('sheet.damage')}
            </Button>
            <Button
              variant="light"
              leftSection={<Heart size={16} aria-hidden="true" />}
              onClick={(event) => open('heal', event.currentTarget)}
            >
              {t('sheet.heal')}
            </Button>
            <Button
              variant="default"
              leftSection={<Shield size={16} aria-hidden="true" />}
              onClick={(event) => open('temp', event.currentTarget)}
            >
              {t('sheet.setTemp')}
            </Button>
          </div>
        )}
        {exhaustion !== undefined && exhaustion > 0 && (
          <Text size="sm" mt="sm" className="sheet-exhaustion">
            {t('sheet.exhaustion', { value: exhaustion })}
          </Text>
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
          mode={mode}
          pending={pending}
          close={() => {
            setMode(null)
            requestAnimationFrame(() => opener.current?.focus())
          }}
          apply={(amount) => {
            const next =
              mode === 'temp'
                ? { ...vitals, temp_hp: amount }
                : applyHp(vitals, sheet.max_hp, mode, amount)
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
  mode,
  pending,
  close,
  apply,
}: {
  mode: HpMode
  pending: boolean
  close: () => void
  apply: (amount: number) => void
}) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState<number | string>('')
  const value = typeof amount === 'number' ? amount : Number.NaN
  const valid = Number.isInteger(value) && value >= 0 && value <= 9999
  return (
    <Modal
      opened
      onClose={close}
      title={t(`sheet.hpDialog.${mode}`)}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (valid && !pending) apply(value)
        }}
      >
        <Stack>
          <NumberInput
            hideControls
            data-autofocus
            label={t('sheet.amount')}
            min={0}
            max={9999}
            allowDecimal={false}
            allowNegative={false}
            inputMode="numeric"
            value={amount}
            onChange={setAmount}
            description={
              mode === 'damage'
                ? t('sheet.hpDialog.damageHint')
                : mode === 'temp'
                  ? t('sheet.hpDialog.tempHint')
                  : undefined
            }
          />
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
