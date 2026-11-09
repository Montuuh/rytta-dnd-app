import type { ReactNode } from 'react'
import { ActionIcon, Drawer, Group, Text } from '@mantine/core'
import { Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePhone } from '@/shared/ui/use-viewport'
import { useLongPress } from '@/shared/ui/use-long-press'

/** RYT-073: a block's detail opens over the sheet: a bottom sheet on phones, a side sheet from
 * 48em. Mantine traps focus, closes on Escape and returns focus to the tile that opened it. */
export function BlockSheet({
  opened,
  onClose,
  title,
  children,
  alert,
  closeOnEscape = true,
}: {
  opened: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** A save error, repeated inside the sheet so it is never hidden behind it. */
  alert?: ReactNode
  /** Mantine closes every open modal on Escape; a sheet under the library keeps open. */
  closeOnEscape?: boolean
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position={phone ? 'bottom' : 'right'}
      size={phone ? 'auto' : 'md'}
      title={<span className="block-sheet-title">{title}</span>}
      className="block-sheet"
      // Phones: as tall as the content needs, never over the whole screen.
      styles={phone ? { content: { maxHeight: '88dvh' } } : undefined}
      closeOnEscape={closeOnEscape}
      closeButtonProps={{ 'aria-label': t('panel.close'), size: 44 }}
    >
      {alert}
      {children}
    </Drawer>
  )
}

/** −/+ around a value; holding a button steps by five (useLongPress). */
export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  name,
  disabled,
  format,
}: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  label: string
  /** The noun inside "Raise …" / "Subir …", cased for the language; defaults to the label. */
  name?: string
  disabled?: boolean
  format?: (value: number) => string
}) {
  const { t } = useTranslation()
  const named = name ?? label
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next))
    if (!disabled && clamped !== value) onChange(clamped)
  }
  const down = useLongPress(
    () => set(value - 1),
    () => set(value - 5),
  )
  const up = useLongPress(
    () => set(value + 1),
    () => set(value + 5),
  )
  return (
    <Group gap={4} wrap="nowrap" className="stepper" role="group" aria-label={label}>
      <ActionIcon
        size={44}
        variant="default"
        aria-label={t('panel.decrease', { label: named })}
        aria-disabled={disabled || value <= min || undefined}
        {...down}
      >
        <Minus size={18} aria-hidden="true" />
      </ActionIcon>
      <output className="stepper-value" aria-live="polite">
        {format ? format(value) : value}
      </output>
      <ActionIcon
        size={44}
        variant="default"
        aria-label={t('panel.increase', { label: named })}
        aria-disabled={disabled || value >= max || undefined}
        {...up}
      >
        <Plus size={18} aria-hidden="true" />
      </ActionIcon>
    </Group>
  )
}

/** Large pools (Lay on Hands, Sorcery Points): spend and restore with a stepper, not 50 pips. */
export function Counter({
  name,
  max,
  used,
  disabled,
  onChange,
}: {
  name: string
  max: number
  used: number
  disabled: boolean
  onChange: (used: number) => void
}) {
  const { t } = useTranslation()
  const left = Math.max(0, max - used)
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(0, next))
    if (!disabled && clamped !== used) onChange(clamped)
  }
  const spend = useLongPress(
    () => set(used + 1),
    () => set(used + 5),
  )
  const restore = useLongPress(
    () => set(used - 1),
    () => set(used - 5),
  )
  return (
    <Group gap="xs" wrap="nowrap" className="counter">
      <ActionIcon
        size={44}
        variant="default"
        aria-label={t('sheet.useOne', { name })}
        aria-disabled={disabled || left === 0 || undefined}
        {...spend}
      >
        <Minus size={18} aria-hidden="true" />
      </ActionIcon>
      <div className="counter-meter" aria-hidden="true">
        <span style={{ width: `${(left / Math.max(1, max)) * 100}%` }} />
      </div>
      <ActionIcon
        size={44}
        variant="default"
        aria-label={t('sheet.restoreOne', { name })}
        aria-disabled={disabled || used === 0 || undefined}
        {...restore}
      >
        <Plus size={18} aria-hidden="true" />
      </ActionIcon>
      <Text className="counter-value" aria-live="polite">
        {t('sheet.usesLeft', { left, max })}
      </Text>
    </Group>
  )
}
