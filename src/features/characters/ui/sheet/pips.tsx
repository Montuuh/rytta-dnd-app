import { Group, Text, UnstyledButton } from '@mantine/core'

/** Tappable use markers: an available pip spends one use, a spent pip restores one.
 * Every pip is a 44px button with an explicit label; the count is also shown as text. */
export function Pips({
  max,
  used,
  disabled,
  spendLabel,
  restoreLabel,
  onChange,
  countLabel,
}: {
  max: number
  used: number
  disabled: boolean
  spendLabel: string
  restoreLabel: string
  onChange: (used: number) => void
  countLabel: string
}) {
  const left = Math.max(0, max - used)
  return (
    <Group gap={0} wrap="wrap" className="pips">
      {Array.from({ length: max }, (_, index) => {
        const available = index < left
        return (
          <UnstyledButton
            key={index}
            className="pip"
            data-available={available || undefined}
            disabled={disabled}
            aria-label={
              disabled
                ? `${countLabel} (${index + 1}/${max})`
                : `${available ? spendLabel : restoreLabel} (${index + 1}/${max})`
            }
            onClick={() => onChange(available ? used + 1 : used - 1)}
          >
            <span className="pip-mark" aria-hidden="true" />
          </UnstyledButton>
        )
      })}
      <Text size="sm" c="dimmed" ml="xs" className="pip-count">
        {countLabel}
      </Text>
    </Group>
  )
}
