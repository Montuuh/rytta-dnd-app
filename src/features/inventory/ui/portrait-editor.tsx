import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { Button, Group, Modal, SegmentedControl, Slider, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { usePhone } from '@/shared/ui/use-viewport'

/** RYT-074 portrait output: a 512px WebP square, like the previous centre crop. */
const out = 512
const maxZoom = 4
type Mode = 'crop' | 'fit'
type View = { zoom: number; cx: number; cy: number }

/** The square of the image shown at a zoom (1 = the image covers the square exactly). */
function cropRect(width: number, height: number, view: View) {
  const scale = (out / Math.min(width, height)) * view.zoom
  const side = out / scale
  const half = side / 2
  const cx = Math.min(Math.max(view.cx, half), width - half)
  const cy = Math.min(Math.max(view.cy, half), height - half)
  return { sx: cx - half, sy: cy - half, side, cx, cy, scale }
}
/** The whole image inside the square, centred, with black bars on the short sides. */
function fitRect(width: number, height: number) {
  const scale = out / Math.max(width, height)
  const w = width * scale
  const h = height * scale
  return { dx: (out - w) / 2, dy: (out - h) / 2, w, h }
}

function paint(canvas: HTMLCanvasElement, bitmap: ImageBitmap, mode: Mode, view: View) {
  const context = canvas.getContext('2d')
  if (!context) return
  context.fillStyle = '#000'
  context.fillRect(0, 0, out, out)
  if (mode === 'fit') {
    const { dx, dy, w, h } = fitRect(bitmap.width, bitmap.height)
    context.drawImage(bitmap, dx, dy, w, h)
    return
  }
  const { sx, sy, side } = cropRect(bitmap.width, bitmap.height, view)
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out)
}

/** Always opened after choosing an image (P9): crop a square or keep it whole with bars. */
export function PortraitEditor({
  file,
  name,
  onCancel,
  onSave,
  pending,
  error,
}: {
  error: boolean
  file: File
  name: string
  onCancel: () => void
  onSave: (image: Blob) => void
  pending: boolean
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const canvas = useRef<HTMLCanvasElement>(null)
  const previews = useRef<(HTMLCanvasElement | null)[]>([])
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [unreadable, setUnreadable] = useState(false)
  const [mode, setMode] = useState<Mode>('crop')
  const [view, setView] = useState<View>({ zoom: 1, cx: 0, cy: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)

  useEffect(() => {
    let alive = true
    let loaded: ImageBitmap | null = null
    createImageBitmap(file)
      .then((image) => {
        loaded = image
        if (!alive) return image.close()
        setBitmap(image)
        setView({ zoom: 1, cx: image.width / 2, cy: image.height / 2 })
      })
      .catch(() => alive && setUnreadable(true))
    return () => {
      alive = false
      loaded?.close()
    }
  }, [file])

  useEffect(() => {
    if (!bitmap || !canvas.current) return
    const frame = requestAnimationFrame(() => {
      if (!canvas.current) return
      paint(canvas.current, bitmap, mode, view)
      for (const preview of previews.current) {
        const context = preview?.getContext('2d')
        if (!preview || !context) continue
        context.clearRect(0, 0, preview.width, preview.height)
        context.drawImage(canvas.current, 0, 0, preview.width, preview.height)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [bitmap, mode, view])

  /** Moves the view by screen pixels of the on-screen square. */
  const pan = useCallback(
    (dx: number, dy: number) => {
      if (!bitmap || !canvas.current) return
      const shown = canvas.current.getBoundingClientRect().width || out
      setView((current) => {
        const rect = cropRect(bitmap.width, bitmap.height, current)
        const factor = out / shown / rect.scale
        const next = cropRect(bitmap.width, bitmap.height, {
          ...current,
          cx: rect.cx - dx * factor,
          cy: rect.cy - dy * factor,
        })
        return { ...current, cx: next.cx, cy: next.cy }
      })
    },
    [bitmap],
  )
  const zoomTo = (zoom: number) =>
    setView((current) => ({ ...current, zoom: Math.min(maxZoom, Math.max(1, zoom)) }))

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'crop') return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: view.zoom }
    }
  }
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const last = pointers.current.get(event.pointerId)
    if (!last) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      zoomTo((pinch.current.zoom * distance) / Math.max(1, pinch.current.distance))
      return
    }
    pan(event.clientX - last.x, event.clientY - last.y)
  }
  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }
  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (mode !== 'crop') return
    const step = event.shiftKey ? 40 : 10
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    if (moves[event.key]) {
      event.preventDefault()
      pan(...moves[event.key]!)
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      zoomTo(view.zoom + 0.1)
    } else if (event.key === '-') {
      event.preventDefault()
      zoomTo(view.zoom - 0.1)
    }
  }
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    // A non-passive wheel listener so the page does not scroll while zooming.
    const onWheel = (event: WheelEvent) => {
      if (mode !== 'crop') return
      event.preventDefault()
      setView((current) => ({
        ...current,
        zoom: Math.min(maxZoom, Math.max(1, current.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08))),
      }))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [mode, bitmap])

  const save = () => {
    if (!bitmap) return
    const target = document.createElement('canvas')
    target.width = target.height = out
    paint(target, bitmap, mode, view)
    target.toBlob((blob) => blob && onSave(blob), 'image/webp', 0.85)
  }
  return (
    <Modal
      opened
      onClose={onCancel}
      fullScreen={phone}
      size="lg"
      title={
        <span className="block-sheet-title user-copy">{t('portrait.editorTitle', { name })}</span>
      }
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      {unreadable ? (
        <Stack>
          <Text role="alert">{t('portrait.unreadable')}</Text>
          <Group justify="flex-end">
            <Button onClick={onCancel}>{t('panel.close')}</Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="md">
          <SegmentedControl
            fullWidth
            aria-label={t('portrait.mode')}
            value={mode}
            onChange={(value) => setMode(value as Mode)}
            data={[
              { value: 'crop', label: t('portrait.crop') },
              { value: 'fit', label: t('portrait.fit') },
            ]}
            className="portrait-mode"
          />
          <Text size="sm" c="dimmed" id="portrait-help">
            {t(mode === 'crop' ? 'portrait.cropHint' : 'portrait.fitHint')}
          </Text>
          <div className="portrait-stage" data-mode={mode}>
            <canvas
              ref={canvas}
              width={out}
              height={out}
              className="portrait-canvas"
              tabIndex={mode === 'crop' ? 0 : -1}
              role="img"
              aria-label={t('portrait.area')}
              aria-describedby="portrait-help"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
            />
            <span className="portrait-ring" aria-hidden="true" />
          </div>
          {mode === 'crop' && (
            <div className="portrait-zoom">
              <Text size="sm" fw={500} id="portrait-zoom" mb="sm">
                {t('portrait.zoom')}
              </Text>
              <Slider
                min={1}
                max={maxZoom}
                step={0.05}
                value={view.zoom}
                onChange={zoomTo}
                label={(value) => `${value.toFixed(1)}×`}
                thumbProps={{ 'aria-labelledby': 'portrait-zoom' }}
                thumbSize={28}
              />
            </div>
          )}
          <div>
            <Text size="sm" c="dimmed" mb={6}>
              {t('portrait.preview')}
            </Text>
            <Group gap="md" align="flex-end" aria-hidden="true">
              {[72, 48, 32].map((size, index) => (
                <canvas
                  key={size}
                  ref={(element) => {
                    previews.current[index] = element
                  }}
                  width={size * 2}
                  height={size * 2}
                  className="portrait-preview"
                  style={{ width: size, height: size }}
                />
              ))}
            </Group>
          </div>
          {error && (
            <Text size="sm" role="alert" c="red">
              {t('inventory.portrait.error')}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onCancel}>
              {t('action.cancel')}
            </Button>
            <Button onClick={save} loading={pending} disabled={!bitmap}>
              {t('portrait.save')}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
