import { useRef, useState } from 'react'
import { Button, Modal, NumberInput, Slider, Switch } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { MonitorSmartphone } from 'lucide-react'
import { TileGroup } from '@/features/combat'
import { usePhone } from '@/shared/ui/use-viewport'
import { useTabletopAction } from '../api'
import {
  baseSizes,
  defaultCalibration,
  pixelsPerInch,
  reportedResolution,
  screenInches,
  squarePx,
  squaresThatFit,
  toSetup,
  tvSizes,
  type Calibration,
} from '../domain/calibration'

/** The table setup (ADR 032): one square under each miniature base. */
export function CalibrationDialog({
  opened,
  onClose,
  campaignId,
  current,
}: {
  opened: boolean
  onClose: () => void
  campaignId: string
  current: Calibration | null
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  // Stays mounted while closed so Mantine returns focus to the opener; the form inside
  // unmounts on close and starts from the saved setup on every opening.
  return (
    <Modal
      closeButtonProps={{ 'aria-label': t('tabletop.close'), size: 44 }}
      opened={opened}
      onClose={onClose}
      title={t('tabletop.setup.title')}
      size="lg"
      fullScreen={phone}
    >
      <CalibrationForm onClose={onClose} campaignId={campaignId} current={current} />
    </Modal>
  )
}

function CalibrationForm({
  onClose,
  campaignId,
  current,
}: {
  onClose: () => void
  campaignId: string
  current: Calibration | null
}) {
  const { t, i18n } = useTranslation()
  const action = useTabletopAction(campaignId)
  const [c, setC] = useState<Calibration>(current ?? defaultCalibration)
  // "Other" sends focus to the exact field below it.
  const exactDiagonal = useRef<HTMLInputElement>(null)
  const exactBase = useRef<HTMLInputElement>(null)
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 })
  const fit = squaresThatFit(c)
  const inches = screenInches(c)
  const tv = tvSizes.includes(c.diagonalIn as (typeof tvSizes)[number])
    ? String(c.diagonalIn)
    : 'other'
  const base = baseSizes.includes(c.baseMm as (typeof baseSizes)[number])
    ? String(c.baseMm)
    : 'other'
  return (
    <div className="tt-form">
      <p className="tt-note">{t('tabletop.setup.intro')}</p>
      <TileGroup
        legend={t('tabletop.setup.diagonal')}
        className="tt-tiles-compact"
        value={tv}
        onChange={(value) =>
          value === 'other'
            ? exactDiagonal.current?.focus()
            : setC({ ...c, diagonalIn: Number(value) })
        }
        options={[
          ...tvSizes.map((size) => ({
            value: String(size),
            content: <span>{t('tabletop.setup.inches', { value: size })}</span>,
          })),
          { value: 'other', content: <span>{t('tabletop.setup.other')}</span> },
        ]}
      />
      <NumberInput
        ref={exactDiagonal}
        hideControls
        label={t('tabletop.setup.diagonalExact')}
        value={c.diagonalIn}
        min={5}
        max={200}
        decimalScale={1}
        suffix="″"
        onChange={(v) => setC({ ...c, diagonalIn: Number(v) || c.diagonalIn })}
      />
      <fieldset className="tt-fieldset">
        <legend>{t('tabletop.setup.resolution')}</legend>
        <div className="tt-row">
          <NumberInput
            hideControls
            label={t('tabletop.setup.width')}
            value={c.pxW}
            min={320}
            max={16384}
            allowDecimal={false}
            suffix=" px"
            onChange={(v) => setC({ ...c, pxW: Number(v) || c.pxW })}
          />
          <NumberInput
            hideControls
            label={t('tabletop.setup.height')}
            value={c.pxH}
            min={240}
            max={16384}
            allowDecimal={false}
            suffix=" px"
            onChange={(v) => setC({ ...c, pxH: Number(v) || c.pxH })}
          />
        </div>
        <Button
          variant="default"
          leftSection={<MonitorSmartphone size={18} aria-hidden="true" />}
          onClick={() =>
            setC({ ...c, ...reportedResolution(window.screen, window.devicePixelRatio || 1) })
          }
        >
          {t('tabletop.setup.thisScreen')}
        </Button>
        <p className="tt-note">{t('tabletop.setup.thisScreenHelp')}</p>
      </fieldset>
      <TileGroup
        legend={t('tabletop.setup.base')}
        className="tt-tiles-compact tt-base-tiles"
        value={base}
        onChange={(value) =>
          value === 'other' ? exactBase.current?.focus() : setC({ ...c, baseMm: Number(value) })
        }
        options={[
          ...baseSizes.map((size) => ({
            value: String(size),
            content: (
              <span className="tt-base-tile">
                <span
                  className="tt-base-disc"
                  style={{ ['--mm' as string]: String(size) }}
                  aria-hidden="true"
                />
                <span>
                  {size === 25.4
                    ? t('tabletop.setup.inch')
                    : t('tabletop.setup.mm', { value: size })}
                </span>
              </span>
            ),
          })),
          { value: 'other', content: <span>{t('tabletop.setup.other')}</span> },
        ]}
      />
      <NumberInput
        ref={exactBase}
        hideControls
        label={t('tabletop.setup.baseExact')}
        value={c.baseMm}
        min={10}
        max={80}
        decimalScale={1}
        suffix=" mm"
        onChange={(v) => setC({ ...c, baseMm: Number(v) || c.baseMm })}
      />
      <div>
        <p className="tt-slider-label" id="tt-fine">
          {t('tabletop.setup.fine', {
            value: new Intl.NumberFormat(i18n.language, { style: 'percent' }).format(c.fine),
          })}
        </p>
        <Slider
          thumbLabel={t('tabletop.setup.fineLabel')}
          value={c.fine}
          min={0.9}
          max={1.1}
          step={0.005}
          label={(v) => `${Math.round(v * 1000) / 10}%`}
          onChange={(fine) => setC({ ...c, fine })}
        />
        <p className="tt-note">{t('tabletop.setup.fineHelp')}</p>
      </div>
      <Switch
        label={t('tabletop.setup.flip')}
        description={t('tabletop.setup.flipHelp')}
        checked={c.flip}
        onChange={(e) => setC({ ...c, flip: e.currentTarget.checked })}
      />
      <output className="tt-result" aria-live="polite">
        <span className="tt-result-main">
          {t('tabletop.setup.result', { cols: fit.cols, rows: fit.rows })}
        </span>
        <span className="tt-result-meta">
          {t('tabletop.setup.resultMeta', {
            ppi: number.format(pixelsPerInch(c)),
            square: number.format(squarePx(c)),
            width: number.format(inches.width * 2.54),
            height: number.format(inches.height * 2.54),
          })}
        </span>
      </output>
      {action.isError && (
        <p className="tt-error" role="alert">
          {t('tabletop.error.save')}
        </p>
      )}
      <div className="tt-dialog-foot">
        <Button variant="subtle" onClick={onClose}>
          {t('tabletop.cancel')}
        </Button>
        <Button
          onClick={() =>
            action.mutate({ kind: 'live', patch: { screen: toSetup(c) } }, { onSuccess: onClose })
          }
          loading={action.isPending}
        >
          {t('tabletop.setup.save')}
        </Button>
      </div>
    </div>
  )
}

/**
 * A ruler on the table screen: five squares at the calibrated size with millimetre ticks and the
 * outline of the chosen base, to check against a real miniature.
 */
export function TableRuler({ square, baseMm }: { square: number; baseMm: number }) {
  const { t } = useTranslation()
  const count = 5
  const mm = square / baseMm
  return (
    <figure className="tt-ruler" aria-label={t('tabletop.ruler.label', { count })}>
      <svg width={square * count + 2} height={square + 28} aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <rect
            key={i}
            x={1 + i * square}
            y={1}
            width={square}
            height={square}
            className="tt-ruler-square"
          />
        ))}
        <circle
          cx={1 + square / 2}
          cy={1 + square / 2}
          r={square / 2 - 1}
          className="tt-ruler-base"
        />
        {Array.from({ length: Math.floor((square * count) / mm) + 1 }, (_, i) => (
          <line
            key={i}
            x1={1 + i * mm}
            x2={1 + i * mm}
            y1={square + 2}
            y2={square + (i % 10 === 0 ? 16 : i % 5 === 0 ? 11 : 7)}
            className="tt-ruler-tick"
          />
        ))}
      </svg>
      <figcaption>{t('tabletop.ruler.caption', { mm: baseMm })}</figcaption>
    </figure>
  )
}
