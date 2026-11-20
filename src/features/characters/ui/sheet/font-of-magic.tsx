import { useState } from 'react'
import { Button, SegmentedControl, Text } from '@mantine/core'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlossaryTerm } from '@/features/glossary'
import { Modal } from '@/shared/ui/overlays'
import { slotsFor } from '../../domain/rules'
import type { Build, Vitals } from '../../domain/sheet'
import {
  convertSlot,
  createSlot,
  createSlotTable,
  pointsLeft,
  slotsLeft,
  sorceryPointsKey,
} from '../../domain/sorcery'

type Mode = 'create' | 'convert'

/** RYT-110 Font of Magic: Sorcery Points into a spell slot, or a slot into points, in one write
 * of the play state (slots and points together). Unpayable levels are listed but disabled. */
export function FontOfMagic({
  build,
  level,
  vitals,
  canEdit,
  commit,
  onOpenChange,
}: {
  build: Build
  level: number
  vitals: Vitals
  canEdit: boolean
  commit: (values: Vitals) => void
  /** The sheet under this dialog keeps open on Escape while it is up. */
  onOpenChange?: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  const [mode, setMode] = useState<Mode>('create')
  const [choice, setChoice] = useState<number | null>(null)
  const points = pointsLeft(build, vitals) ?? 0
  const pointsMax = build.trackers.find((tracker) => tracker.key === sorceryPointsKey)?.max ?? 0
  const spentPoints = pointsMax - points
  const lefts = slotsLeft(build, level, vitals)
  const maxSlot = slotsFor(build.casterKind, level).reduce(
    (top, count, index) => (count > 0 || (lefts[index] ?? 0) > 0 ? index + 1 : top),
    0,
  )
  const rows =
    mode === 'create'
      ? createSlotTable.map((row) => ({
          level: row.level,
          detail: t('font.costPoints', { count: row.cost }),
          next: createSlot(build, level, vitals, row.level),
          locked:
            level < row.from
              ? t('font.fromLevel', { level: row.from })
              : points < row.cost
                ? t('font.shortPoints', { count: row.cost, left: points })
                : null,
        }))
      : Array.from({ length: maxSlot }, (_, index) => ({
          level: index + 1,
          detail: t('font.gainPoints', { count: index + 1, left: lefts[index] ?? 0 }),
          next: convertSlot(build, level, vitals, index + 1),
          locked:
            (lefts[index] ?? 0) === 0
              ? t('font.noSlotLeft')
              : spentPoints < index + 1
                ? t('font.pointsFull', { count: index + 1 })
                : null,
        }))
  const picked = rows.find((row) => row.level === choice && row.next)
  const show = (open: boolean) => {
    setOpened(open)
    onOpenChange?.(open)
  }
  const close = () => {
    show(false)
    setChoice(null)
  }
  return (
    <>
      <div className="resource-option font-of-magic">
        <Text size="sm" className="resource-option-name">
          <GlossaryTerm id="feature.sorcerer-font-of-magic">{t('font.title')}</GlossaryTerm>
        </Text>
        <Button
          variant="subtle"
          mih={44}
          disabled={!canEdit}
          onClick={() => show(true)}
          className="font-of-magic-open"
        >
          {t('font.open')}
        </Button>
      </div>
      <Modal
        opened={opened}
        onClose={close}
        title={t('font.title')}
        closeButtonProps={{ 'aria-label': t('panel.close'), size: 44 }}
        classNames={{ body: 'cast-body' }}
      >
        <div className="cast-form">
          <SegmentedControl
            fullWidth
            className="font-of-magic-mode"
            value={mode}
            onChange={(value) => {
              setMode(value as Mode)
              setChoice(null)
            }}
            data={[
              { value: 'create', label: t('font.create') },
              { value: 'convert', label: t('font.convert') },
            ]}
          />
          <Text size="sm" c="dimmed" role="status">
            {t('font.pointsLeft', { count: points })}
          </Text>
          <fieldset className="cast-choices">
            <legend className="cast-legend">{t('font.levelHeading')}</legend>
            {rows.map((row) => {
              const disabled = !row.next
              return (
                <label
                  key={row.level}
                  className="cast-option"
                  data-checked={choice === row.level || undefined}
                  data-disabled={disabled || undefined}
                >
                  <input
                    type="radio"
                    name="font-level"
                    className="cast-option-input"
                    checked={choice === row.level}
                    disabled={disabled}
                    onChange={() => setChoice(row.level)}
                  />
                  <span className="cast-option-copy">
                    <span className="cast-option-label">
                      {t('cast.slotLevel', { level: row.level })}
                    </span>
                    <span className="cast-option-detail">{row.locked ?? row.detail}</span>
                  </span>
                  <Check size={18} className="cast-option-check" aria-hidden="true" />
                </label>
              )
            })}
          </fieldset>
          <Button
            size="lg"
            fullWidth
            disabled={!picked}
            onClick={() => {
              if (!picked?.next) return
              commit(picked.next)
              close()
            }}
          >
            {picked
              ? t(mode === 'create' ? 'font.doCreate' : 'font.doConvert', { level: picked.level })
              : t('font.pickLevel')}
          </Button>
        </div>
      </Modal>
    </>
  )
}
