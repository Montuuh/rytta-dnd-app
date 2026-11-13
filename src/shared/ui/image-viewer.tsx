import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react'
import { ActionIcon, Loader, Modal, Text, VisuallyHidden } from '@mantine/core'
import { useElementSize, useReducedMotion } from '@mantine/hooks'
import { X, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { focusWhenReady } from './focus-when-ready'
import {
  containedSize,
  isDoubleTap,
  maxUpscale,
  minZoom,
  panBy,
  pinch,
  toggleZoom,
  wholePicture,
  type Point,
  type Size,
  type Tap,
  type Zoom,
} from './image-zoom'
import './image-viewer.css'

/*
 * Escape closes the topmost viewer and nothing under it. Mantine's modals and drawers each listen
 * for Escape on the window in the capture phase, in the order they mounted, so a drawer under a
 * viewer would close with it. This listener is registered when the module loads, before any
 * component that renders a viewer can mount its drawer, and stops the event while a viewer is open.
 */
const openViewers: Array<() => void> = []
if (typeof window !== 'undefined')
  window.addEventListener(
    'keydown',
    (event) => {
      const close = openViewers.at(-1)
      if (event.key !== 'Escape' || event.isComposing || !close) return
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
    },
    { capture: true },
  )

type Gesture =
  | { pinch: true; start: Zoom; from: readonly [Point, Point] }
  | { pinch: false; start: Zoom; from: Point; moved: boolean }

const stop = (event: SyntheticEvent) => event.stopPropagation()

export type ImageViewerProps = {
  opened: boolean
  onClose: () => void
  /** The subject's name, the dialog title. */
  title: string
  src: string | null | undefined
  alt: string
  /** The address is on its way (a signed URL). */
  loading?: boolean
  /** There is nothing to show (the address could not be read). */
  unavailable?: boolean
  /** Under the picture: a credit, a short description. */
  caption?: ReactNode
  /** At the foot: what can be done with the picture (change it, remove it). */
  actions?: ReactNode
  /**
   * Where focus goes when the viewer closes from its close button or Escape. By default, the
   * control that was focused when it opened; `false` leaves it to the caller.
   */
  returnFocus?: RefObject<HTMLElement | null> | false
  /** The picture's own size, used until it loads. */
  width?: number
  height?: number
  /** The address failed to load; the caller may offer another one. */
  onError?: (src: string) => void
  zIndex?: number
}

/**
 * RYT-098: one full-screen viewer for every portrait, creature and item picture. A dark curtain
 * (the same in every theme) shows the whole picture, never cropped, under a bar with its name and
 * a close button. A double tap or double click zooms 2× at that point and back; while zoomed a
 * drag pans; two fingers pinch between 1× and 4×. The zoom resets when it closes.
 */
export function ImageViewer({
  opened,
  onClose,
  title,
  src,
  alt,
  loading = false,
  unavailable = false,
  caption,
  actions,
  returnFocus,
  width,
  height,
  onError,
  zIndex = 430,
}: ImageViewerProps) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const [broken, setBroken] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [natural, setNatural] = useState<Size>({ width: width ?? 0, height: height ?? 0 })
  const stage = useRef<HTMLDivElement | null>(null)
  const size = useElementSize()
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  const lastTap = useRef<Tap | null>(null)

  // Each opening counts, and remembers what had focus before the focus moves into the viewer.
  const [session, setSession] = useState(() => ({
    opened,
    opener: opened ? document.activeElement : null,
    round: 0,
  }))
  if (session.opened !== opened)
    setSession({
      opened,
      opener: opened ? document.activeElement : session.opener,
      round: session.round + 1,
    })

  // Each opening, address and stage size starts on the whole picture: closing resets the zoom
  // and a rotated screen shows everything again.
  const view = `${session.round}|${src}|${size.width}|${size.height}`
  const [zoomState, setZoomState] = useState({ view, zoom: wholePicture })
  const zoom = zoomState.view === view ? zoomState.zoom : wholePicture
  // Gestures read the zoom they last set, which can be ahead of the last render.
  const latest = useRef<{ view: string; zoom: Zoom } | null>(null)
  const setZoom = (next: Zoom) => {
    latest.current = { view, zoom: next }
    setZoomState({ view, zoom: next })
  }
  const live = () => (latest.current?.view === view ? latest.current.zoom : wholePicture)

  const requestClose = () => {
    onClose()
    if (returnFocus === false) return
    const opener = session.opener
    focusWhenReady(() => {
      const node = returnFocus ? returnFocus.current : opener
      return node instanceof HTMLElement && node.isConnected ? node : null
    })
  }
  const closeOnEscape = useEffectEvent(requestClose)

  // While open it owns Escape.
  useEffect(() => {
    if (!opened) return
    pointers.current.clear()
    gesture.current = null
    lastTap.current = null
    const entry = () => closeOnEscape()
    openViewers.push(entry)
    return () => {
      openViewers.splice(openViewers.indexOf(entry), 1)
    }
  }, [opened])

  const showing = Boolean(src) && !loading && !unavailable && broken !== src
  const zoomed = zoom.scale > minZoom

  const geometry = () => {
    const rect = stage.current?.getBoundingClientRect()
    const room = { width: rect?.width ?? 0, height: rect?.height ?? 0 }
    return { stage: room, picture: containedSize(natural, room), rect }
  }
  const local = (event: PointerEvent, rect: DOMRect | undefined): Point => ({
    x: event.clientX - (rect ? rect.left + rect.width / 2 : 0),
    y: event.clientY - (rect ? rect.top + rect.height / 2 : 0),
  })
  const begin = (moved: boolean) => {
    const [first, second] = [...pointers.current.values()]
    gesture.current = second
      ? { pinch: true, start: live(), from: [first!, second] }
      : first
        ? { pinch: false, start: live(), from: first, moved }
        : null
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!showing || (event.pointerType === 'mouse' && event.button !== 0)) return
    try {
      // A drag keeps panning when the finger leaves the stage.
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // A pointer the browser no longer tracks cannot be captured; the gesture still works.
    }
    pointers.current.set(event.pointerId, local(event, geometry().rect))
    begin(pointers.current.size > 1)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    const { stage: room, picture, rect } = geometry()
    pointers.current.set(event.pointerId, local(event, rect))
    const active = gesture.current
    if (!active) return
    const [first, second] = [...pointers.current.values()]
    if (!first) return
    if (active.pinch) {
      if (!second) return
      setMoving(true)
      setZoom(pinch(active.start, active.from, [first, second], picture, room))
      return
    }
    const delta = { x: first.x - active.from.x, y: first.y - active.from.y }
    if (!active.moved && Math.hypot(delta.x, delta.y) < 6) return
    active.moved = true
    if (active.start.scale <= minZoom) return
    setMoving(true)
    setZoom(panBy(active.start, delta, picture, room))
  }
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const point = pointers.current.get(event.pointerId)
    if (!point) return
    pointers.current.delete(event.pointerId)
    const active = gesture.current
    if (pointers.current.size > 0) {
      // A pinch that loses a finger goes on as a drag with the one that stays.
      begin(true)
      return
    }
    gesture.current = null
    setMoving(false)
    if (cancelled || !active || active.pinch || active.moved) {
      lastTap.current = null
      return
    }
    const tap = { ...point, time: event.timeStamp }
    if (!isDoubleTap(lastTap.current, tap)) {
      lastTap.current = tap
      return
    }
    lastTap.current = null
    const { stage: room, picture } = geometry()
    setZoom(toggleZoom(live(), point, picture, room))
  }

  return (
    <Modal.Root
      opened={opened}
      onClose={requestClose}
      fullScreen
      zIndex={zIndex}
      closeOnEscape={false}
      returnFocus={false}
      transitionProps={{ transition: 'fade', duration: reduceMotion ? 0 : 160 }}
      classNames={{
        root: 'image-viewer',
        overlay: 'image-viewer-overlay',
        content: 'image-viewer-content',
        header: 'image-viewer-bar',
        title: 'image-viewer-title user-copy',
      }}
      // The viewer is portalled, but React still bubbles its events to whatever rendered it: a
      // tap inside must not reach a row or tile around the picture. Keys keep bubbling: the focus
      // trap listens on the document.
      onClick={stop}
      onPointerDown={stop}
      onPointerUp={stop}
      onMouseDown={stop}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{title}</Modal.Title>
          {showing && (
            <ActionIcon
              className="image-viewer-control"
              variant="subtle"
              size={44}
              radius="xl"
              aria-label={t('viewer.zoom')}
              aria-pressed={zoomed}
              onClick={() => {
                const { stage: room, picture } = geometry()
                setZoom(toggleZoom(live(), { x: 0, y: 0 }, picture, room))
              }}
            >
              {zoomed ? (
                <ZoomOut size={22} aria-hidden="true" />
              ) : (
                <ZoomIn size={22} aria-hidden="true" />
              )}
            </ActionIcon>
          )}
          <ActionIcon
            className="image-viewer-control"
            variant="subtle"
            size={44}
            radius="xl"
            data-autofocus
            aria-label={t('viewer.close')}
            onClick={requestClose}
          >
            <X size={24} aria-hidden="true" />
          </ActionIcon>
        </Modal.Header>
        {/* A plain body: Mantine's would make the whole caption and actions the description. */}
        <div className="image-viewer-body">
          <figure className="image-viewer-figure">
            <div
              ref={(node) => {
                stage.current = node
                size.ref(node)
              }}
              className="image-viewer-stage"
              data-zoomed={zoomed || undefined}
              data-moving={moving || undefined}
              aria-busy={(opened && loading) || undefined}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => onPointerEnd(event, false)}
              onPointerCancel={(event) => onPointerEnd(event, true)}
            >
              {loading ? (
                <span role="status" className="image-viewer-state">
                  <Loader color="var(--viewer-accent)" />
                  <VisuallyHidden>{t('viewer.loading')}</VisuallyHidden>
                </span>
              ) : showing && src ? (
                <img
                  key={src}
                  className="image-viewer-picture"
                  src={src}
                  alt={alt}
                  width={natural.width || undefined}
                  height={natural.height || undefined}
                  decoding="async"
                  draggable={false}
                  style={{
                    transform: `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.scale})`,
                    // A small picture stops at twice its own size, centred, instead of blurring.
                    maxWidth: natural.width ? natural.width * maxUpscale : undefined,
                    maxHeight: natural.height ? natural.height * maxUpscale : undefined,
                  }}
                  onLoad={(event) => {
                    const image = event.currentTarget
                    if (image.naturalWidth > 0)
                      setNatural({ width: image.naturalWidth, height: image.naturalHeight })
                  }}
                  onError={() => {
                    setBroken(src)
                    onError?.(src)
                  }}
                />
              ) : (
                <Text className="image-viewer-state image-viewer-missing">
                  {t('viewer.unavailable')}
                </Text>
              )}
            </div>
            {caption && <figcaption className="image-viewer-caption">{caption}</figcaption>}
          </figure>
          {actions && <div className="image-viewer-actions">{actions}</div>}
        </div>
      </Modal.Content>
    </Modal.Root>
  )
}

/**
 * A picture that opens the viewer: the button around it (sized and styled by `className`, at least
 * 44px) and the viewer it opens, which gives focus back to it. Never inside another control.
 */
export function ViewerButton({
  src,
  title,
  alt,
  label,
  className,
  children,
}: {
  src: string
  /** The subject's name, the viewer's title. */
  title: string
  alt: string
  /** The button's accessible name ("View the image of …"). */
  label: string
  className?: string
  children: ReactNode
}) {
  const [viewing, setViewing] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={opener}
        type="button"
        className={className}
        aria-haspopup="dialog"
        aria-label={label}
        onClick={() => setViewing(true)}
      >
        {children}
      </button>
      {viewing && (
        <ImageViewer
          opened
          onClose={() => setViewing(false)}
          title={title}
          src={src}
          alt={alt}
          returnFocus={opener}
        />
      )}
    </>
  )
}
