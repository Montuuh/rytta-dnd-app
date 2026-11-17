import { useState } from 'react'
import { Alert, Button, Checkbox, Group, Switch, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { NumberDial } from '@/features/combat'
import { useTabletopAction } from '../api'
import {
  mapEffects,
  type Item,
  type ItemOf,
  type ItemPatch,
  type Scene,
  type Visibility,
} from '../domain/model'
import { lightRadius } from '../domain/visibility'

export function VisibilitySettings({ campaignId, scene }: { campaignId: string; scene: Scene }) {
  const { t } = useTranslation()
  const action = useTabletopAction(campaignId)
  const v = scene.visibility
  const save = (settings: Partial<Pick<Visibility, 'vision' | 'lighting' | 'radius'>>) =>
    action.mutate({ kind: 'visibility', sceneId: scene.id, settings, revision: scene.revision })
  return (
    <fieldset className="tt-fieldset tt-visibility-settings" disabled={action.isPending}>
      <legend>{t('tabletop.visibility.title')}</legend>
      <Switch
        label={t('tabletop.visibility.vision')}
        checked={v?.vision ?? false}
        disabled={action.isPending}
        onChange={(e) => save({ vision: e.currentTarget.checked })}
      />
      <Switch
        label={t('tabletop.visibility.lighting')}
        checked={v?.lighting ?? false}
        disabled={action.isPending}
        onChange={(e) => save({ lighting: e.currentTarget.checked })}
      />
      {v?.vision && (
        <NumberDial
          key={scene.id}
          commitOnBlur
          label={t('tabletop.visibility.radius')}
          value={v.radius * 5}
          min={5}
          max={120}
          step={5}
          onChange={(n) => {
            if (typeof n === 'number' && n >= 5 && n <= 120) save({ radius: Math.round(n / 5) })
          }}
        />
      )}
      <p className="tt-note">{t('tabletop.visibility.help')}</p>
      {(v?.vision || v?.lighting) && !scene.rooms?.length && (
        <p className="tt-note">{t('tabletop.visibility.noWalls')}</p>
      )}
      {action.isError && <p role="alert">{t('tabletop.error.save')}</p>}
    </fieldset>
  )
}

export function LightFields({
  item,
  onPatch,
  busy,
  characterLinked,
}: {
  item: ItemOf<'token'> | ItemOf<'prop'>
  onPatch: (patch: ItemPatch) => void
  busy: boolean
  characterLinked: boolean
}) {
  const { t } = useTranslation()
  const radius = lightRadius(item)
  const save = (data: Record<string, unknown>) =>
    onPatch({ id: item.id, data: { ...item.data, ...data } })
  return (
    <fieldset className="tt-fieldset tt-visibility-settings" disabled={busy}>
      <legend>{t('tabletop.visibility.source')}</legend>
      <Switch
        label={t('tabletop.visibility.lit')}
        checked={radius > 0 && (item.data.light_on ?? true)}
        onChange={(e) => save({ light_on: e.currentTarget.checked, light_radius: radius || 4 })}
      />
      <NumberDial
        key={item.id}
        commitOnBlur
        label={t('tabletop.visibility.lightRadius')}
        value={radius * 5}
        min={0}
        max={120}
        step={5}
        onChange={(n) => {
          if (typeof n === 'number') save({ light_radius: Math.round(n / 5) })
        }}
      />
      {item.kind === 'token' && characterLinked && (
        <>
          <p className="tt-note">{t('tabletop.visibility.allow')}</p>
          {mapEffects.map((effect) => (
            <Checkbox
              key={effect}
              label={t(`tabletop.visibility.${effect}`)}
              checked={item.data.map_actions?.includes(effect) ?? false}
              onChange={(e) =>
                save({
                  map_actions: e.currentTarget.checked
                    ? [...(item.data.map_actions ?? []), effect]
                    : (item.data.map_actions ?? []).filter((v) => v !== effect),
                })
              }
            />
          ))}
          <p className="tt-note">{t('tabletop.visibility.resources')}</p>
        </>
      )}
    </fieldset>
  )
}

export function PlayerEffects({
  campaignId,
  items,
  lighting,
}: {
  campaignId: string
  items: readonly Item[]
  lighting: boolean
}) {
  const { t } = useTranslation()
  const action = useTabletopAction(campaignId)
  const [retry, setRetry] = useState<Parameters<typeof action.mutate>[0] | null>(null)
  const tokens = items.filter(
    (i): i is ItemOf<'token'> =>
      i.kind === 'token' &&
      Boolean(i.controllable) &&
      Boolean(i.data.map_actions?.some((e) => lighting || e === 'reveal')),
  )
  if (!tokens.length) return null
  const send = (a: Parameters<typeof action.mutate>[0]) => {
    setRetry(a)
    action.mutate(a, { onSuccess: () => setRetry(null) })
  }
  return (
    <div className="tt-player-effects">
      {tokens.map((item) => (
        <fieldset className="tt-fieldset" key={item.id} disabled={action.isPending}>
          <legend>{item.label || t('tabletop.visibility.source')}</legend>
          <div className="tt-effect-actions">
            {item.data.map_actions
              ?.filter((e) => lighting || e === 'reveal')
              .map((effect) => (
                <Button
                  key={effect}
                  variant="default"
                  onClick={() =>
                    send({
                      kind: 'effect',
                      itemId: item.id,
                      effect,
                      requestId: crypto.randomUUID(),
                    })
                  }
                >
                  {t(`tabletop.visibility.${effect}`)}
                </Button>
              ))}
            {lighting &&
              lightRadius(item) > 0 &&
              (item.data.light_on ?? true) &&
              item.data.map_actions?.some((e) => e === 'torch' || e === 'light') && (
                <Button
                  variant="default"
                  onClick={() =>
                    send({
                      kind: 'effect',
                      itemId: item.id,
                      effect: 'off',
                      requestId: crypto.randomUUID(),
                    })
                  }
                >
                  {t('tabletop.visibility.off')}
                </Button>
              )}
          </div>
        </fieldset>
      ))}
      {action.isError && (
        // RYT-126 J4-25: the same alert as the rest of the map and combat screens.
        <Alert color="red" role="alert" className="tt-effect-error">
          <Group justify="space-between" gap="sm">
            <Text size="sm">{t('tabletop.error.save')}</Text>
            {retry && (
              <Button size="sm" variant="light" onClick={() => send(retry)}>
                {t('tabletop.failure.retry')}
              </Button>
            )}
          </Group>
        </Alert>
      )}
      {action.isSuccess && <p role="status">{t('tabletop.visibility.applied')}</p>}
    </div>
  )
}
