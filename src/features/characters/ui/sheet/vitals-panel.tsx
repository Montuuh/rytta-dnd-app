import { useState } from 'react'
import {
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { Delete } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { applyHp } from '../../domain/rules'
import type { Vitals } from '../../domain/sheet'
import { toneOf } from './hp-tone'

export type HpMode = 'damage' | 'heal' | 'temp'
const quickAmounts = [1, 5, 10] as const
const maxAmount = 9999

export function HpDialog({
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
