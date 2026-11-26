import { useState } from 'react'
import { Anchor, Button, Loader } from '@mantine/core'
import { Plus, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { CombatErrorCode } from '../domain/combat'
import { NumberDial } from './bestiary-widgets'
import { maxAdd, type AddLine } from './encounter-add'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { StatusRail } from '@/shared/ui/rail-line'
import { ErrorAlert } from './parts'

/** The one-tap bar: a count stepper and the filled action that adds with the dialog's defaults. */
export function AddStepper({
  encounterName,
  pending,
  onAdd,
}: {
  encounterName: string
  pending: boolean
  onAdd: (count: number) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const [count, setCount] = useState<number | string>(1)
  const valid =
    typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= maxAdd
  const label = t('bestiary.add.submitTo', { count: valid ? count : 1, encounter: encounterName })
  return (
    <>
      <NumberDial
        className="bst-bar-dial"
        label={t('combat.add.count')}
        ariaLabel={t('combat.add.count')}
        icon={Users}
        min={1}
        max={maxAdd}
        value={count}
        onChange={setCount}
      />
      <Button
        className="bst-action-primary"
        data-bst-add
        // One row at any width: a long encounter name is cut with an ellipsis, the title has it all.
        title={label}
        leftSection={<Plus size={16} aria-hidden="true" />}
        disabled={!valid || pending}
        loading={pending}
        onClick={(event) => {
          if (!valid) return
          const button = event.currentTarget
          void onAdd(count)
            .then((ok) => ok && setCount(1))
            .finally(() =>
              // The button is disabled while the request runs, which drops focus onto the page. One
              // frame later it may still be disabled, so the return retries until it takes focus.
              // Focus the user moved inside the stat block stays where they put it. It must not
              // scroll: the sheet's own position is where the user was reading.
              focusWhenReady(() => button, {
                from: button,
                leaving: null,
                preventScroll: true,
                timeout: 1000,
              }),
            )
        }}
      >
        <span className="bst-add-label">{label}</span>
      </Button>
    </>
  )
}

/**
 * What the last add did, kept above the bar until the stat block closes or another add happens: a
 * ruled line whose sentence is the status (always mounted, its text swaps), with Undo and the link
 * to the encounter beside it.
 */
export function AddStatus({
  line,
  error,
  trigger,
  onDismissError,
  onUndo,
  encounterPath,
}: {
  line: AddLine | null
  error: CombatErrorCode | null
  trigger: HTMLElement | null
  onDismissError: () => void
  onUndo: () => void
  encounterPath: (id: string) => string
}) {
  const { t } = useTranslation()
  const sentence = !line
    ? null
    : line.phase === 'removed'
      ? t('bestiary.add.removed', { count: line.count, encounter: line.encounterName })
      : line.phase === 'stuck'
        ? t('bestiary.add.stuck', { count: line.left, encounter: line.encounterName })
        : [
            t('bestiary.add.line', {
              count: line.count,
              name: line.creature,
              encounter: line.encounterName,
            }),
            line.ids === null ? t('bestiary.add.noUndo') : null,
          ]
            .filter(Boolean)
            .join(' ')
  return (
    <div className="bst-add-status">
      {error && (
        <ErrorAlert
          sticky={false}
          trigger={trigger}
          onDismiss={(alert) => {
            if (alert?.contains(document.activeElement)) trigger?.focus()
            onDismissError()
          }}
        >
          {t(`combat.error.${error}`)}
        </ErrorAlert>
      )}
      <StatusRail className="bst-add-line" text={sentence} serial={line?.serial}>
        {line?.phase === 'removing' && <Loader size={14} aria-hidden="true" />}
        {line?.phase === 'added' && line.ids && (
          <Button variant="subtle" onClick={onUndo}>
            {t('bestiary.add.undo')}
          </Button>
        )}
        {line && line.phase !== 'removing' && (
          <Anchor component={Link} to={encounterPath(line.encounterId)} className="bst-add-link">
            {t('bestiary.add.openEncounter')}
          </Anchor>
        )}
      </StatusRail>
    </div>
  )
}
