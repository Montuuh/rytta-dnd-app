import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Group, Loader, Stack, Text } from '@mantine/core'
import { Minus, Plus, TriangleAlert, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { newRequestId } from '@/shared/lib/request-id'
import { Modal } from '@/shared/ui/overlays'
import { useLongPress } from '@/shared/ui/use-long-press'
import { useSetPartyLevel } from '../api'
import { createPartyRequestIds } from '../domain/party-level'
import { CampaignSettingsError } from '../domain/settings'

const minLevel = 1
const maxLevel = 20

/**
 * RYT-130: the DM raises the party level here. Players whose finished character is below it get
 * the guided level-up on their sheet; no sheet changes until its Player confirms. Setting, lowering
 * and clearing all go through one confirmation and one idempotent request: retrying after a
 * failure repeats the same request id, so the level is never applied twice.
 */
export function PartyLevelControl({
  campaignId,
  current,
  below,
  suggested,
}: {
  campaignId: string
  /** The level the campaign holds; null when the DM has not set one. */
  current: number | null
  /** Characters below the party level, once the party list has loaded. */
  below?: number
  /** Where the stepper starts while no level is set: the highest level among finished sheets. */
  suggested?: number
}) {
  const { t } = useTranslation()
  const mutation = useSetPartyLevel(campaignId)
  const [edited, setEdited] = useState<number | null>(null)
  // `undefined`: no question open; `null`: asking to clear the level.
  const [asking, setAsking] = useState<number | null | undefined>(undefined)
  const [saved, setSaved] = useState<string | null>(null)
  const ids = useRef(createPartyRequestIds(newRequestId))
  const apply = useRef<HTMLButtonElement>(null)
  const alert = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const start = current ?? suggested ?? minLevel
  const shown = edited ?? start
  const changed = shown !== current
  const pending = mutation.isPending
  const move = (delta: number) => {
    // A new value asks again: what was said about the last one no longer applies.
    setSaved(null)
    setEdited((value) => {
      const next = Math.min(maxLevel, Math.max(minLevel, (value ?? start) + delta))
      return next === current ? null : next
    })
  }
  const lower = useLongPress(
    () => move(-1),
    () => move(-5),
  )
  const raise = useLongPress(
    () => move(1),
    () => move(5),
  )
  const open = (level: number | null) => {
    mutation.reset()
    setAsking(level)
  }
  // The reason is where the keyboard is: focus moves to it, the retry is the next stop.
  const failedAt = mutation.isError ? mutation.submittedAt : 0
  useEffect(() => {
    if (failedAt) alert.current?.focus()
  }, [failedAt])
  const close = () => {
    if (pending) return
    setAsking(undefined)
    mutation.reset()
    // A question that is closed starts over: no id outlives it.
    ids.current.reset()
  }
  const confirm = (level: number | null) => {
    // The id belongs to the change from what the campaign holds now to the level asked for.
    const from = current
    mutation.mutate(
      { level, requestId: ids.current.idFor(from, level) },
      {
        onSuccess: () => {
          ids.current.done(from, level)
          setEdited(null)
          setAsking(undefined)
          setSaved(level === null ? t('partyLevel.cleared') : t('partyLevel.saved', { level }))
        },
      },
    )
  }
  const reason = mutation.error instanceof CampaignSettingsError ? mutation.error.reason : null
  const errorKey =
    reason === 'forbidden' || reason === 'invalid' || reason === 'request-mismatch'
      ? reason
      : 'unavailable'
  const raising = asking !== undefined && asking !== null && (current === null || asking > current)
  return (
    <section aria-labelledby="party-level-title" className="party-level">
      <div className="party-level-head">
        <div className="party-level-seal" aria-hidden="true">
          {current ?? '–'}
        </div>
        <h2 id="party-level-title" className="dm-subheading" ref={heading} tabIndex={-1}>
          {t('partyLevel.title')}
          <span className="visually-hidden"> {current ?? t('partyLevel.unset')}</span>
        </h2>
      </div>
      <div className="party-level-body">
        <Text size="sm" c="dimmed">
          {t(current === null ? 'partyLevel.hintUnset' : 'partyLevel.hintSet')}
        </Text>
        {current !== null && below !== undefined && (
          <p className="party-level-below" data-open={below > 0 || undefined}>
            <Users size={16} aria-hidden="true" />
            {below > 0 ? t('partyLevel.below', { count: below }) : t('partyLevel.allUp')}
          </p>
        )}
        <Group gap="sm" className="party-level-controls">
          <div className="party-level-stepper" role="group" aria-label={t('partyLevel.valueName')}>
            <button
              type="button"
              className="party-level-step"
              aria-label={t('partyLevel.decrease')}
              disabled={shown <= minLevel}
              {...lower}
            >
              <Minus size={18} aria-hidden="true" />
            </button>
            <output className="party-level-value" aria-live="polite">
              {shown}
            </output>
            <button
              type="button"
              className="party-level-step"
              aria-label={t('partyLevel.increase')}
              disabled={shown >= maxLevel}
              {...raise}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
          {/* RYT-151: "Invite player" is the panel's filled action; setting the level is outlined
              and only answers once the stepper differs from the level the campaign holds. */}
          <Button ref={apply} variant="outline" disabled={!changed} onClick={() => open(shown)}>
            {t('partyLevel.set', { level: shown })}
          </Button>
          {current !== null && !changed && (
            <Button variant="subtle" onClick={() => open(null)}>
              {t('partyLevel.clear')}
            </Button>
          )}
        </Group>
        <div role="status" className="party-level-saved">
          {saved}
        </div>
      </div>
      <Modal
        opened={asking !== undefined}
        onClose={close}
        title={
          asking === null || asking === undefined
            ? t('partyLevel.confirmClearTitle')
            : t('partyLevel.confirmTitle', { level: asking })
        }
        closeOnEscape={!pending}
        closeOnClickOutside={!pending}
        returnFocus={false}
        onExitTransitionEnd={() => {
          // After a save the button is disabled again, so focus goes to the heading instead.
          const target =
            apply.current?.isConnected && !apply.current.disabled ? apply.current : heading.current
          target?.focus()
        }}
        closeButtonProps={{ 'aria-label': t('panel.close'), size: 44, disabled: pending }}
      >
        <Stack>
          <Text>
            {asking === null
              ? t('partyLevel.confirmClear')
              : raising
                ? t('partyLevel.confirmRaise', { level: asking })
                : t('partyLevel.confirmLower')}
          </Text>
          {mutation.isError && (
            <Alert
              ref={alert}
              tabIndex={-1}
              color="red"
              role="alert"
              icon={<TriangleAlert size={18} aria-hidden="true" />}
              title={t('partyLevel.errorTitle')}
            >
              {t(`partyLevel.error.${errorKey}`)}
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
              onClick={() => !pending && asking !== undefined && confirm(asking)}
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
