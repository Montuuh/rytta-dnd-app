import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Alert, Button, Group, Loader, Stack, Text } from '@mantine/core'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { newRequestId } from '@/shared/lib/request-id'
import { Drawer, Modal } from '@/shared/ui/overlays'
import { usePhone } from '@/shared/ui/use-viewport'
import { useSetDiceSettings } from '../api'
import { createDiceRequestIds, visibilityChange } from '../domain/dice-settings'
import {
  CampaignSettingsError,
  diceModes,
  type DiceSettings,
  type RollVisibility,
} from '../domain/settings'
import './dice-settings.css'

/** Default first, then wider, then narrower. */
const visibilityOrder: readonly RollVisibility[] = ['roller_dm', 'table', 'roller']

type Setting = 'dice_mode' | 'roll_visibility'

/**
 * The options of one setting as a radio group of buttons: arrow keys move the focus without
 * choosing, and Enter, Space or a tap chooses, so moving through the options never asks the
 * question once per option.
 */
function OptionList({
  idPrefix,
  label,
  options,
  value,
  onChoose,
}: {
  idPrefix: string
  label: string
  options: readonly { value: string; title: string; hint: string }[]
  value: string
  onChoose: (value: string) => void
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (event: KeyboardEvent, index: number) => {
    const last = options.length - 1
    const to =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? (index + 1) % options.length
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? (index + last) % options.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (to === null) return
    event.preventDefault()
    refs.current[to]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className="dice-options">
      {options.map((option, index) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            id={`${idPrefix}-${option.value}`}
            ref={(node) => {
              refs.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-autofocus={checked || undefined}
            className="dice-option"
            onKeyDown={(event) => move(event, index)}
            onClick={() => onChoose(option.value)}
          >
            <span className="dice-option-mark" aria-hidden="true" />
            <span className="dice-option-text">
              <span className="dice-option-title">{option.title}</span>
              <span className="dice-option-hint">{option.hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * RYT-133: the DM chooses how the table rolls (physical dice, dice in the app, or each Player
 * chooses on their device) and who reads the rolls made or recorded in the app. RYT-180: two rows
 * show the current values; a row opens a sheet with the options, and choosing another one asks
 * once for that single change. Like the party level, a change goes through one confirmation and
 * one idempotent request: retrying after a failure repeats the same request id, so the change is
 * never applied twice.
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
  const idPrefix = useId()
  const mutation = useSetDiceSettings(campaignId)
  const phone = usePhone()
  const [sheet, setSheet] = useState<Setting | null>(null)
  // The sheet keeps its title while it fades out.
  const [lastSheet, setLastSheet] = useState<Setting>('dice_mode')
  const [asking, setAsking] = useState<DiceSettings | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const ids = useRef(createDiceRequestIds(newRequestId))
  const rows = useRef<Partial<Record<Setting, HTMLButtonElement | null>>>({})
  const alert = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const pending = mutation.isPending
  const sheetOpen = useRef(false)
  const keepSheet = useRef(false)
  useEffect(() => {
    sheetOpen.current = sheet !== null
  }, [sheet])
  // The reason is where the keyboard is: focus moves to it, the retry is the next stop.
  const failedAt = mutation.isError ? mutation.submittedAt : 0
  useEffect(() => {
    if (failedAt) alert.current?.focus()
  }, [failedAt])

  const openSheet = (setting: Setting) => {
    setSaved(null)
    setLastSheet(setting)
    setSheet(setting)
  }
  const choose = (setting: Setting, value: string) => {
    if (current[setting] === value) {
      setSheet(null)
      return
    }
    mutation.reset()
    setAsking({ ...current, [setting]: value } as DiceSettings)
  }
  const closeQuestion = () => {
    if (pending) return
    setAsking(null)
    mutation.reset()
    // A question that is closed starts over: no id outlives it.
    ids.current.reset()
    // The same Escape or outside tap must not also reach the sheet under it.
    keepSheet.current = true
    window.setTimeout(() => {
      keepSheet.current = false
    }, 0)
  }
  const confirm = () => {
    if (!asking) return
    // The id belongs to the change from what the campaign holds now to what was asked for.
    const from = current
    const to = asking
    mutation.mutate(
      { settings: to, requestId: ids.current.idFor(from, to) },
      {
        onSuccess: () => {
          ids.current.done(from, to)
          setAsking(null)
          setSheet(null)
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
  const visibilityOptions = visibilityOrder.map((value) => ({
    value,
    title: t(`diceSettings.visibility.${value}`),
    hint: t(`diceSettings.visibility.${value}Hint`),
  }))
  const visibility = asking
    ? visibilityChange(current.roll_visibility, asking.roll_visibility)
    : 'same'
  const settings: { key: Setting; label: string; value: string }[] = [
    {
      key: 'dice_mode',
      label: t('diceSettings.modeLegend'),
      value: t(`diceSettings.mode.${current.dice_mode}`),
    },
    {
      key: 'roll_visibility',
      label: t('diceSettings.visibilityLegend'),
      value: t(`diceSettings.visibility.${current.roll_visibility}`),
    },
  ]
  const sheetTitle = t(
    lastSheet === 'dice_mode' ? 'diceSettings.modeLegend' : 'diceSettings.visibilityLegend',
  )
  const sheetBody = (
    <OptionList
      idPrefix={idPrefix}
      label={sheetTitle}
      options={lastSheet === 'dice_mode' ? modeOptions : visibilityOptions}
      value={current[lastSheet]}
      onChoose={(value) => choose(lastSheet, value)}
    />
  )
  const sheetProps = {
    opened: sheet !== null,
    onClose: () => {
      if (!keepSheet.current) setSheet(null)
    },
    title: sheetTitle,
    returnFocus: false,
    // The question above the sheet takes Escape and outside taps first.
    closeOnEscape: asking === null,
    closeOnClickOutside: asking === null,
    // Back on the row that opened the sheet.
    onExitTransitionEnd: () => (rows.current[lastSheet] ?? heading.current)?.focus(),
    closeButtonProps: { 'aria-label': t('panel.close'), size: 44 },
    className: 'dice-sheet',
  }
  return (
    <section aria-labelledby={titleId} className="dice-panel">
      <h2 id={titleId} className="dm-subheading dm-panel-title" ref={heading} tabIndex={-1}>
        {t('dm.panelDice')}
      </h2>
      <ul className="dice-rows">
        {settings.map((setting) => (
          <li key={setting.key}>
            <button
              type="button"
              ref={(node) => {
                rows.current[setting.key] = node
              }}
              className="dice-row"
              aria-haspopup="dialog"
              onClick={() => openSheet(setting.key)}
            >
              <span className="dice-row-text">
                <span className="dice-row-label">{setting.label}</span>
                <span className="dice-row-value">{setting.value}</span>
              </span>
              <ChevronRight size={20} aria-hidden="true" className="dice-row-chevron" />
            </button>
          </li>
        ))}
      </ul>
      <div role="status" className="dice-saved">
        {saved}
      </div>
      {!phone ? (
        <Modal {...sheetProps} centered size="md">
          {sheetBody}
        </Modal>
      ) : (
        <Drawer {...sheetProps} position="bottom" size="auto">
          {sheetBody}
        </Drawer>
      )}
      <Modal
        opened={asking !== null}
        onClose={closeQuestion}
        title={t('diceSettings.confirmTitle')}
        closeOnEscape={!pending}
        closeOnClickOutside={!pending}
        returnFocus={false}
        centered
        // Above the sheet it was asked from, whichever of the two mounted first.
        zIndex={300}
        onExitTransitionEnd={() => {
          // After a Cancel the sheet is still open: the option that was current takes the focus.
          // A saved change closes the sheet too, and its own handler returns focus to the row.
          if (!sheetOpen.current) return
          const option = document.getElementById(`${idPrefix}-${current[lastSheet]}`)
          if (option?.isConnected) option.focus()
        }}
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44, disabled: pending }}
      >
        <Stack>
          {asking && (
            <>
              <ul className="dice-summary">
                {asking.dice_mode !== current.dice_mode && (
                  <li>
                    <span>{t('diceSettings.modeLegend')}</span>
                    <strong>{t(`diceSettings.mode.${asking.dice_mode}`)}</strong>
                  </li>
                )}
                {asking.roll_visibility !== current.roll_visibility && (
                  <li>
                    <span>{t('diceSettings.visibilityLegend')}</span>
                    <strong>{t(`diceSettings.visibility.${asking.roll_visibility}`)}</strong>
                  </li>
                )}
              </ul>
              {asking.dice_mode !== current.dice_mode && (
                <Text size="sm">{t(`diceSettings.confirmMode.${asking.dice_mode}`)}</Text>
              )}
              {visibility !== 'same' && (
                <Text size="sm">
                  {t(
                    visibility === 'narrower' && asking.roll_visibility === 'roller'
                      ? 'diceSettings.confirmVisibility.narrowerRoller'
                      : `diceSettings.confirmVisibility.${visibility}`,
                  )}
                </Text>
              )}
            </>
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
            <Button variant="subtle" onClick={closeQuestion} aria-disabled={pending || undefined}>
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
