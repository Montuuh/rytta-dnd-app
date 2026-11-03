import { useEffect, useRef, useState } from 'react'
import { Group, Slider, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { modifiedPrice, type AdminShop, type ShopAdmin } from '../domain/shops'

function ModifierSlider({
  shop,
  character,
  sample,
  save,
}: {
  shop: AdminShop
  character: ShopAdmin['characters'][number]
  sample: number | null
  save: (percent: number) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const current = shop.modifiers.find((m) => m.character_id === character.id)?.percent ?? 0
  // The value the DM chose, shown until the server row agrees. The latest value is always
  // sent; keyboard bursts are coalesced and a change made mid-save is sent right after it.
  const [chosen, setChosen] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const queue = useRef({ latest: null as number | null, sending: false, timer: 0 })
  useEffect(() => () => window.clearTimeout(queue.current.timer), [])
  if (chosen !== null && chosen === current && !sending) setChosen(null)
  const value = chosen ?? current
  const flush = () => {
    const q = queue.current
    if (q.sending) {
      q.timer = window.setTimeout(flush, 150)
      return
    }
    if (q.latest === null) return
    const next = q.latest
    q.latest = null
    q.sending = true
    setSending(true)
    save(next)
      .catch(() => setChosen(null))
      .finally(() => {
        q.sending = false
        setSending(false)
      })
  }
  const describe = (v: number) =>
    v === 0
      ? t('admin.modifier.none')
      : v < 0
        ? t('admin.modifier.discount', { value: -v })
        : t('admin.modifier.markup', { value: v })
  return (
    <div className="modifier-row">
      <Group justify="space-between" mb={6} wrap="wrap" gap={4}>
        <Text fw={600} className="user-copy">
          {character.name}
        </Text>
        <Text
          size="sm"
          fw={600}
          className={value < 0 ? 'modifier-text-discount' : value > 0 ? 'modifier-text-markup' : ''}
          aria-hidden="true"
        >
          {describe(value)}
          {sample !== null && value !== 0 && (
            <Text span size="xs" c="dimmed" ml={6}>
              {t('admin.modifier.sample', { from: sample, to: modifiedPrice(sample, value) })}
            </Text>
          )}
        </Text>
      </Group>
      <Slider
        thumbLabel={t('admin.modifier.thumb', { name: character.name })}
        thumbValueText={describe}
        min={-50}
        max={50}
        step={5}
        value={value}
        label={(v) => t('admin.modifier.mark', { value: v > 0 ? `+${v}` : `${v}` })}
        // Bare numbers keep the end marks inside a 390px screen at 150% text.
        marks={[-50, -25, 0, 25, 50].map((v) => ({ value: v, label: v > 0 ? `+${v}` : `${v}` }))}
        onChange={(v) => {
          setChosen(v)
          queue.current.latest = v
          window.clearTimeout(queue.current.timer)
          queue.current.timer = window.setTimeout(flush, 500)
        }}
        thumbSize={32}
        className="touch-slider"
      />
    </div>
  )
}

/** Per-character discount or surcharge: drag or use the arrow keys; saved automatically. */
export function PriceModifiers({
  shop,
  characters,
  save,
}: {
  shop: AdminShop
  characters: ShopAdmin['characters']
  save: (characterId: string, name: string, percent: number) => Promise<unknown>
}) {
  const { t } = useTranslation()
  if (characters.length === 0) return null
  const sample = shop.listings[0]?.price ?? null
  return (
    <section aria-labelledby={`modifiers-${shop.id}`}>
      <Title order={3} mt="xl" mb={4} id={`modifiers-${shop.id}`}>
        {t('admin.modifier.title')}
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        {t('admin.modifier.help')}
      </Text>
      <Stack gap="xl">
        {characters.map((c) => (
          <ModifierSlider
            key={c.id}
            shop={shop}
            character={c}
            sample={sample}
            save={(percent) => save(c.id, c.name, percent)}
          />
        ))}
      </Stack>
    </section>
  )
}
