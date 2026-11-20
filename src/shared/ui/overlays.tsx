import {
  Drawer as MantineDrawer,
  Modal as MantineModal,
  type DrawerProps,
  type DrawerRootProps,
  type ModalProps,
} from '@mantine/core'
import { useBackToClose } from './use-back-to-close'

/**
 * Mantine's Modal and Drawer with phone and browser Back wired in (`useBackToClose`): Back closes
 * the overlay and the page stays. Use these instead of the Mantine components so every overlay
 * behaves the same. `onClose` must be idempotent; an overlay that refuses to close while busy
 * should also refuse Escape and its close button.
 */
export function Modal(props: ModalProps) {
  useBackToClose(props.opened, props.onClose)
  return <MantineModal {...props} />
}

export function Drawer(props: DrawerProps) {
  useBackToClose(props.opened, props.onClose)
  return <MantineDrawer {...props} />
}

/** `Drawer.Root` with Back wired in, for a drawer that composes its own header (Drawer.Header). */
export function DrawerRoot(props: DrawerRootProps) {
  useBackToClose(props.opened, props.onClose)
  return <MantineDrawer.Root {...props} />
}
