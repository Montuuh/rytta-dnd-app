import { useEffect, useId, useRef, useState } from 'react'
import { Alert, Button, Group, Loader, Stack, Text } from '@mantine/core'
import { Dices, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { newRequestId } from '@/shared/lib/request-id'
import { Modal } from '@/shared/ui/overlays'
import { useSetDiceSettings } from '../api'
import { createDiceRequestIds, sameDiceSettings, visibilityChange } from '../domain/dice-settings'
import {
  CampaignSettingsError,
  diceModes,
  rollVisibilities,
  type DiceMode,
  type DiceSettings,
  type RollVisibility,
} from '../domain/settings'

/** One group of exclusive choices: a legend, and a row per option with its consequence. */
function ChoiceGroup<T extends string>({
  legend,
  name,
  options,
  value,
  saved,
  onChange,
}: {
  legend: string
  name: string
  options: readonly { value: T; title: string; hint: string }[]
  value: T
  /** The value the campaign holds now. */
  saved: T
  onChange: (next: T) => void
}) {
  const { t } = useTranslation()
  return (
    <fieldset className="dice-set-group">
      <legend className="dice-set-legend">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="dice-set-option">
          <input
            type="radio"
            className="visually-hidden"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span className="dice-set-mark" aria-hidden="true" />
          <span className="dice-set-text">
            <span className="dice-set-title">
              {option.title}
              {saved === option.value && (
                <span className="dice-set-current">{t('diceSettings.current')}</span>
              )}
            </span>
            <span className="dice-set-hint">{option.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

/**
 * RYT-133: the DM chooses how the table rolls (physical dice, dice in the app, or each Player
 * chooses on their device) and who reads the rolls made or recorded in the app. Like the party
 * level, a change goes through one confirmation and one idempotent request: retrying after a
 * failure repeats the same request id, so the change is never applied twice.
 */
export function DiceSettingsControl({
  campaignId,
  current,
}: {
  campaignId: string
  current: DiceSettings
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const mutation = useSetDiceSettings(campaignId)
  const [edited, setEdited] = useState<DiceSettings | null>(null)
  const [asking, setAsking] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const ids = useRef(createDiceRequestIds(newRequestId))
  const apply = useRef<HTMLButtonElement>(null)
  const alert = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const shown = edited ?? current
  const changed = !sameDiceSettings(shown, current)
  const pending = mutation.isPending
  const edit = (patch: Partial<DiceSettings>) => {
    // A new value asks again: what was said about the last one no longer applies.
    setSaved(null)
    const next = { ...shown, ...patch }
    setEdited(sameDiceSettings(next, current) ? null : next)
  }
  // The reason is where the keyboard is: focus moves to it, the retry is the next stop.
  const failedAt = mutation.isError ? mutation.submittedAt : 0
  useEffect(() => {
    if (failedAt) alert.current?.focus()
  }, [failedAt])
  const open = () => {
    mutation.reset()
    setAsking(true)
  }
  const close = () => {
    if (pending) return
    setAsking(false)
    mutation.reset()
    // A question that is closed starts over: no id outlives it.
    ids.current.reset()
  }
  const confirm = () => {
    // The id belongs to the change from what the campaign holds now to what was asked for.
    const from = current
    const to = shown
    mutation.mutate(
      { settings: to, requestId: ids.current.idFor(from, to) },
      {
        onSuccess: () => {
          ids.current.done(from, to)
          setEdited(null)
          setAsking(false)
          setSaved(t('diceSettings.saved'))
        },
      },
    )
  }
  const reason = mutation.error instanceof CampaignSettingsError ? mutation.error.reason : null
  const errorKey =
    reason === 'forbidden' || reason === 'invalid' || reason === 'request-mismatch'
      ? reason
      : 'unavailable'
  const modeOptions = diceModes.map((value) => ({
    value,
    title: t(`diceSettings.mode.${value}`),
    hint: t(`diceSettings.mode.${value}Hint`),
  }))
  const visibilityOptions = rollVisibilities.map((value) => ({
    value,
    title: t(`diceSettings.visibility.${value}`),
    hint: t(`diceSettings.visibility.${value}Hint`),
  }))
  const visibility = visibilityChange(current.roll_visibility, shown.roll_visibility)
  return (
    <section aria-labelledby={titleId} className="dice-set">
      <div className="dice-set-head">
        <div className="dice-set-seal" aria-hidden="true">
          <Dices size={26} />
        </div>
        <h2 id={titleId} className="dm-subheading" ref={heading} tabIndex={-1}>
          {t('diceSettings.title')}
        </h2>
      </div>
      <Text size="sm" c="dimmed">
        {t('diceSettings.hint')}
      </Text>
      <ChoiceGroup<DiceMode>
        legend={t('diceSettings.modeLegend')}
        name={`${titleId}-mode`}
        options={modeOptions}
        value={shown.dice_mode}
        saved={current.dice_mode}
        onChange={(dice_mode) => edit({ dice_mode })}
      />
      <ChoiceGroup<RollVisibility>
        legend={t('diceSettings.visibilityLegend')}
        name={`${titleId}-visibility`}
        options={visibilityOptions}
        value={shown.roll_visibility}
        saved={current.roll_visibility}
        onChange={(roll_visibility) => edit({ roll_visibility })}
      />
      {changed && (
        <Group>
          <Button ref={apply} onClick={open}>
            {t('diceSettings.apply')}
          </Button>
        </Group>
      )}
      <div role="status" className="dice-set-saved">
        {saved}
      </div>
      <Modal
        opened={asking}
        onClose={close}
        title={t('diceSettings.confirmTitle')}
        closeOnEscape={!pending}
        closeOnClickOutside={!pending}
        returnFocus={false}
        onExitTransitionEnd={() => {
          const target = apply.current?.isConnected ? apply.current : heading.current
          target?.focus()
        }}
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44, disabled: pending }}
      >
        <Stack>
          <ul className="dice-set-summary">
            {shown.dice_mode !== current.dice_mode && (
              <li>
                <span>{t('diceSettings.modeLegend')}</span>
                <strong>{t(`diceSettings.mode.${shown.dice_mode}`)}</strong>
              </li>
            )}
            {shown.roll_visibility !== current.roll_visibility && (
              <li>
                <span>{t('diceSettings.visibilityLegend')}</span>
                <strong>{t(`diceSettings.visibility.${shown.roll_visibility}`)}</strong>
              </li>
            )}
          </ul>
          {shown.dice_mode !== current.dice_mode && (
            <Text size="sm">{t(`diceSettings.confirmMode.${shown.dice_mode}`)}</Text>
          )}
          {visibility !== 'same' && (
            <Text size="sm">{t(`diceSettings.confirmVisibility.${visibility}`)}</Text>
          )}
          {mutation.isError && (
            <Alert
              ref={alert}
              tabIndex={-1}
              color="red"
              role="alert"
              icon={<TriangleAlert size={18} aria-hidden="true" />}
              title={t('diceSettings.errorTitle')}
            >
              {t(`diceSettings.error.${errorKey}`)}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={close} aria-disabled={pending || undefined}>
              {t('action.cancel')}
            </Button>
            <Button
              data-autofocus
              // Busy, not disabled: focus stays on the button and in the dialog.
              aria-disabled={pending || undefined}
              aria-busy={pending || undefined}
              leftSection={pending ? <Loader size={16} aria-hidden="true" /> : undefined}
              onClick={() => !pending && confirm()}
            >
              {mutation.isError && errorKey === 'unavailable'
                ? t('common.retry')
                : t('action.confirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </section>
  )
}
