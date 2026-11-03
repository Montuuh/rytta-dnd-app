import { useState } from 'react'
import {
  Button,
  Checkbox,
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
import { concentrationDc, halfDamage, type Combatant, type HpMode } from '../domain/combat'

const quickAmounts = [1, 5, 10] as const
const maxAmount = 9999

/**
 * Damage, healing or temporary hit points for one or many targets. Damage can be halved per
 * target (a successful save). The server applies the change atomically; nothing is computed
 * from cached hit points here except the concentration reminder.
 */
export function AmountDialog({
  targets,
  initialMode,
  allowTemp = true,
  pending,
  close,
  apply,
}: {
  targets: Combatant[]
  initialMode: HpMode
  allowTemp?: boolean
  pending: boolean
  close: () => void
  apply: (mode: HpMode, hits: { combatant_id: string; amount: number }[]) => void
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<HpMode>(initialMode)
  const [amount, setAmount] = useState<number | string>('')
  const [halved, setHalved] = useState<ReadonlySet<string>>(new Set())
  const value = typeof amount === 'number' ? amount : Number.NaN
  const valid = Number.isInteger(value) && value >= 0 && value <= maxAmount
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
  const amountFor = (target: Combatant) =>
    mode === 'damage' && halved.has(target.id) ? halfDamage(value) : value
  const single = targets.length === 1 ? targets[0] : undefined
  const title = t(`combat.amount.${mode}`)
  const modes = [
    { value: 'damage', label: t('sheet.damage') },
    { value: 'heal', label: t('sheet.heal') },
    ...(allowTemp ? [{ value: 'temp', label: t('sheet.setTemp') }] : []),
  ]
  return (
    <Modal
      opened
      onClose={close}
      title={single ? `${title}: ${single.name}` : title}
      className="hp-dialog combat-amount"
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid || pending) return
          apply(
            mode,
            targets.map((target) => ({ combatant_id: target.id, amount: amountFor(target) })),
          )
        }}
      >
        <Stack gap="sm">
          <SegmentedControl
            fullWidth
            value={mode}
            onChange={(next) => setMode(next as HpMode)}
            aria-label={t('combat.amount.mode')}
            className="hp-mode"
            data={modes}
          />
          <NumberInput
            hideControls
            data-autofocus
            label={t('combat.amount.label')}
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
                ? t('combat.amount.damageHint')
                : mode === 'temp'
                  ? t('combat.amount.tempHint')
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
                +{chip}
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
          {targets.length > 1 || mode === 'damage' ? (
            <fieldset className="combat-targets">
              <legend>{t('combat.amount.targets')}</legend>
              <Stack gap={6}>
                {targets.map((target) => (
                  <Group key={target.id} justify="space-between" wrap="nowrap" gap="xs">
                    <Text size="sm" fw={600} className="combat-target-name">
                      {valid
                        ? t('combat.amount.result', {
                            name: target.name,
                            amount: amountFor(target),
                          })
                        : target.name}
                    </Text>
                    {mode === 'damage' && (
                      <Checkbox
                        size="md"
                        label={t('combat.amount.half')}
                        aria-label={t('combat.amount.halfFor', { name: target.name })}
                        checked={halved.has(target.id)}
                        onChange={(event) => {
                          const next = new Set(halved)
                          if (event.currentTarget.checked) next.add(target.id)
                          else next.delete(target.id)
                          setHalved(next)
                        }}
                      />
                    )}
                  </Group>
                ))}
              </Stack>
            </fieldset>
          ) : null}
          {mode === 'damage' && valid && value > 0 && (
            <div aria-live="polite">
              {targets
                .filter((target) => target.concentration)
                .map((target) => (
                  <Text key={target.id} size="sm" className="combat-dc">
                    {t('combat.concentration.dc', {
                      name: target.name,
                      dc: concentrationDc(amountFor(target)),
                      spell: target.concentration ?? '',
                    })}
                  </Text>
                ))}
            </div>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={close}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || pending} loading={pending}>
              {t('combat.amount.apply')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

/** Numeric initiative total with a large keypad; Players type their own d20 + bonus. */
export function InitiativeDialog({
  combatant,
  bonus,
  dm,
  pending,
  close,
  save,
}: {
  combatant: Combatant
  bonus: number | null
  dm: boolean
  pending: boolean
  close: () => void
  save: (total: number) => void
}) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState<number | string>(combatant.initiative ?? '')
  const value = typeof amount === 'number' ? amount : Number.NaN
  const valid = Number.isInteger(value) && value >= -20 && value <= 99
  const press = (digit: number) =>
    setAmount((current) => {
      const next = Number(`${typeof current === 'number' ? current : ''}${digit}`)
      return next > 99 ? current : next
    })
  const signedBonus = bonus === null ? '' : bonus >= 0 ? `+${bonus}` : String(bonus)
  return (
    <Modal
      opened
      onClose={close}
      title={t('combat.initiative.title', { name: combatant.name })}
      className="hp-dialog combat-initiative"
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (valid && !pending) save(value)
        }}
      >
        <Stack gap="sm">
          <Text size="sm">
            {dm || bonus === null
              ? t('combat.initiative.hintDm', { name: combatant.name })
              : t('combat.initiative.hint', { bonus: signedBonus })}
          </Text>
          <NumberInput
            hideControls
            data-autofocus
            label={t('combat.initiative.total')}
            min={-20}
            max={99}
            allowDecimal={false}
            inputMode="numeric"
            value={amount}
            onChange={setAmount}
            className="hp-amount"
          />
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
              onClick={() =>
                setAmount((current) => {
                  const text = typeof current === 'number' ? String(current).slice(0, -1) : ''
                  return text && text !== '-' ? Number(text) : ''
                })
              }
            >
              <Delete size={20} aria-hidden="true" />
            </UnstyledButton>
          </div>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={close}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || pending} loading={pending}>
              {t('combat.initiative.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
