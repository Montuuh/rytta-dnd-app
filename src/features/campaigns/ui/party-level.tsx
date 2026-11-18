import { useRef, useState } from 'react'
import { Alert, Button, Group, Stack, Text } from '@mantine/core'
import { Minus, Plus, TriangleAlert, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { config } from '@/shared/lib/config'
import { newRequestId } from '@/shared/lib/request-id'
import { Modal } from '@/shared/ui/overlays'
import { useLongPress } from '@/shared/ui/use-long-press'
import { useSetPartyLevel } from '../api'
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
  const demo = config.VITE_DATA_MODE === 'demo'
  const [edited, setEdited] = useState<number | null>(null)
  // `undefined`: no question open; `null`: asking to clear the level.
  const [asking, setAsking] = useState<number | null | undefined>(undefined)
  const [saved, setSaved] = useState<string | null>(null)
  const ids = useRef(new Map<string, string>())
  const apply = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const start = current ?? suggested ?? minLevel
  const shown = edited ?? start
  const changed = shown !== current
  const pending = mutation.isPending
  const move = (delta: number) =>
    setEdited((value) => {
      const next = Math.min(maxLevel, Math.max(minLevel, (value ?? start) + delta))
      return next === current ? null : next
    })
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
  const close = () => {
    if (pending) return
    setAsking(undefined)
    mutation.reset()
  }
  const confirm = (level: number | null) => {
    const key = String(level)
    let requestId = ids.current.get(key)
    if (!requestId) {
      requestId = newRequestId()
      ids.current.set(key, requestId)
    }
    mutation.mutate(
      { level, requestId },
      {
        onSuccess: () => {
          ids.current.delete(key)
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
              disabled={demo || shown <= minLevel}
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
              disabled={demo || shown >= maxLevel}
              {...raise}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
          {changed && !demo && (
            <Button ref={apply} onClick={() => open(shown)}>
              {t('partyLevel.set', { level: shown })}
            </Button>
          )}
          {current !== null && !changed && !demo && (
            <Button variant="subtle" onClick={() => open(null)}>
              {t('partyLevel.clear')}
            </Button>
          )}
        </Group>
        {demo && (
          <Text size="sm" c="dimmed">
            {t('partyLevel.demo')}
          </Text>
        )}
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
          const target = apply.current?.isConnected ? apply.current : heading.current
          target?.focus()
        }}
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44, disabled: pending }}
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
              loading={pending}
              data-autofocus
              onClick={() => asking !== undefined && confirm(asking)}
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
