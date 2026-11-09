import { useRef, useState, type ReactNode } from 'react'
import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Radio,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { removeTracker, removedTracker, restoreTracker } from '../../domain/progression'
import { classResources } from '../../domain/resources'
import { restKinds, sheetBlocks, trackerDisplays, type SheetBlock } from '../../domain/sheet'
import type { PanelProps } from './panel-types'
import { BlockSheet } from './widgets'

/** RYT-073 Personalise: which blocks the sheet shows and which resources it tracks. */
export function PersonaliseDrawer({
  opened,
  onClose,
  props,
  alert,
}: {
  alert?: ReactNode
  opened: boolean
  onClose: () => void
  props: PanelProps
}) {
  const { t } = useTranslation()
  const { build, level, change, pending } = props
  const resourcesTitle = useRef<HTMLHeadingElement>(null)
  const hidden = new Set(build.layout?.hidden ?? [])
  const [name, setName] = useState('')
  const [max, setMax] = useState<number | string>(3)
  const [reset, setReset] = useState<(typeof restKinds)[number]>('long')
  const [display, setDisplay] = useState<(typeof trackerDisplays)[number]>('pips')
  const removed = classResources.filter(
    (spec) =>
      spec.classKey === build.classKey &&
      level >= spec.from &&
      (build.removed ?? []).includes(removedTracker(spec.key)),
  )
  const toggle = (block: SheetBlock, visible: boolean) =>
    change((draft) => {
      const next = new Set(draft.build.layout?.hidden ?? [])
      if (visible) next.delete(block)
      else next.add(block)
      return {
        ...draft,
        build: { ...draft.build, layout: { hidden: sheetBlocks.filter((key) => next.has(key)) } },
      }
    })
  const valid = name.trim().length > 0 && typeof max === 'number' && max >= 1 && max <= 999
  return (
    <BlockSheet opened={opened} onClose={onClose} title={t('panel.personalise')} alert={alert}>
      <Stack gap="xl">
        <section aria-labelledby="personalise-blocks">
          <Title order={3} size="h4" id="personalise-blocks">
            {t('panel.blocksTitle')}
          </Title>
          <Text size="sm" c="dimmed" mb="xs">
            {t('panel.blocksHint')}
          </Text>
          <Stack gap="xs">
            {sheetBlocks.map((block) => (
              <Switch
                key={block}
                size="md"
                label={t(`panel.block.${block}`)}
                checked={!hidden.has(block)}

                onChange={(event) => toggle(block, event.currentTarget.checked)}
              />
            ))}
          </Stack>
        </section>
        <section aria-labelledby="personalise-resources">
          <Title order={3} size="h4" id="personalise-resources" ref={resourcesTitle} tabIndex={-1}>
            {t('panel.resourcesTitle')}
          </Title>
          <Text size="sm" c="dimmed" mb="xs">
            {t('panel.resourcesHint')}
          </Text>
          {build.trackers.length === 0 && (
            <Text size="sm" c="dimmed">
              {t('sheet.noTrackers')}
            </Text>
          )}
          <ul className="feature-list">
            {build.trackers.map((tracker) => (
              <li key={tracker.id} className="feature-row">
                <div className="feature-main">
                  <Text fw={600} className="user-copy">
                    {tracker.name}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {t(tracker.key ? 'panel.classResourceLine' : 'panel.ownResourceLine', {
                      max: tracker.max,
                      reset: t(`sheet.reset.${tracker.reset}`),
                    })}
                  </Text>
                </div>
                <ActionIcon
                  size={44}
                  variant="subtle"
                  color="red"

                  aria-label={t('panel.removeNamed', { name: tracker.name })}
                  onClick={() => {
                    change(
                      (draft) => ({ ...draft, build: removeTracker(draft.build, tracker.id) }),
                      'panel.removed',
                    )
                    // The row goes away: keep keyboard focus in the section.
                    requestAnimationFrame(() => resourcesTitle.current?.focus())
                  }}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </ActionIcon>
              </li>
            ))}
          </ul>
          {removed.length > 0 && (
            <>
              <Text size="sm" fw={600} mt="sm">
                {t('panel.removedResources')}
              </Text>
              <ul className="feature-list">
                {removed.map((spec) => (
                  <li key={spec.key} className="feature-row">
                    <Text className="feature-main">
                      {t(`panel.resource.${spec.key}` as 'panel.resource.monk-focus')}
                    </Text>
                    <Button
                      variant="subtle"
                      leftSection={<RotateCcw size={16} aria-hidden="true" />}

                      onClick={() =>
                        change(
                          (draft) => ({ ...draft, build: restoreTracker(draft.build, spec.key) }),
                          'panel.added',
                        )
                      }
                    >
                      {t('panel.restore')}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section aria-labelledby="personalise-own">
          <Title order={3} size="h4" id="personalise-own">
            {t('panel.ownResource')}
          </Title>
          <Stack gap="sm" mt="xs">
            <TextInput
              label={t('wizard.trackerName')}
              placeholder={t('panel.ownResourcePlaceholder')}
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
            <NumberInput
              hideControls
              label={t('wizard.trackerMax')}
              min={1}
              max={999}
              allowDecimal={false}
              allowNegative={false}
              value={max}
              onChange={setMax}
            />
            <Radio.Group
              label={t('wizard.trackerReset')}
              value={reset}
              onChange={(value) => setReset(value as typeof reset)}
              className="panel-radios"
            >
              <Stack gap={0}>
                {restKinds.map((kind) => (
                  <Radio key={kind} value={kind} label={t(`sheet.reset.${kind}`)} />
                ))}
              </Stack>
            </Radio.Group>
            <Radio.Group
              label={t('panel.display')}
              value={display}
              onChange={(value) => setDisplay(value as typeof display)}
              className="panel-radios"
            >
              <Stack gap={0}>
                {trackerDisplays.map((kind) => (
                  <Radio key={kind} value={kind} label={t(`panel.display.${kind}`)} />
                ))}
              </Stack>
            </Radio.Group>
            <Group justify="flex-end">
              <Button
                // aria-disabled keeps focus here after adding (the name field empties).
                aria-disabled={!valid || pending || build.trackers.length >= 30 || undefined}
                onClick={() => {
                  if (!valid || pending || build.trackers.length >= 30) return
                  change(
                    (draft) => ({
                      ...draft,
                      build: {
                        ...draft.build,
                        trackers: [
                          ...draft.build.trackers,
                          {
                            id: `own-${crypto.randomUUID().slice(0, 8)}`,
                            name: name.trim(),
                            max: max as number,
                            reset,
                            display,
                          },
                        ],
                      },
                    }),
                    'panel.added',
                  )
                  setName('')
                }}
              >
                {t('panel.addResource')}
              </Button>
            </Group>
          </Stack>
        </section>
      </Stack>
    </BlockSheet>
  )
}
