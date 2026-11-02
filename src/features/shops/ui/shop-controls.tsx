import { useId } from 'react'
import {
  ActionIcon,
  Chip,
  Group,
  Paper,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core'
import { Archive, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  draftOf,
  type AdminShop,
  type ShopAdmin,
  type ShopDraft,
  type ShopMode,
  type ShopVisibility,
} from '../domain/shops'
import { useAutoSave } from './use-auto-save'

/** Character toggles: who can see a shop or a listing. One tap per character. */
export function AccessChips({
  characters,
  value,
  label,
  onChange,
}: {
  characters: ShopAdmin['characters']
  value: string[]
  label: string
  onChange: (ids: string[]) => void
}) {
  const { t } = useTranslation()
  const labelId = useId()
  return (
    <div>
      <Text size="sm" fw={500} mb={6} id={labelId}>
        {label}
      </Text>
      <Chip.Group multiple value={value} onChange={onChange}>
        <Group gap="xs" role="group" aria-labelledby={labelId} className="access-chips">
          {characters.map((c) => (
            <Chip key={c.id} value={c.id} className="access-chip">
              <span className="user-copy">{c.name}</span>
            </Chip>
          ))}
        </Group>
      </Chip.Group>
      {value.length === 0 && (
        <Text size="xs" c="dimmed" mt={4}>
          {t('admin.accessHint')}
        </Text>
      )}
    </div>
  )
}

/**
 * Everything about a shop that the DM changes during play, saved as it changes: open switch,
 * who sees it, how purchases work and the resale rate. Rapid changes are merged and sent in
 * order (useAutoSave); the save pill reports progress where the DM is looking.
 */
export function ShopControls({
  shop,
  characters,
  saveDraft,
  onRename,
  onArchive,
}: {
  shop: AdminShop
  characters: ShopAdmin['characters']
  saveDraft: (draft: ShopDraft, revision: number) => Promise<unknown>
  onRename: () => void
  onArchive: () => void
}) {
  const { t } = useTranslation()
  const { view, change } = useAutoSave({
    server: draftOf(shop),
    revision: shop.revision,
    save: saveDraft,
  })
  return (
    <Paper p="lg" className="shop-header shop-controls">
      <Stack gap="lg">
        <Group justify="space-between" align="start" wrap="nowrap">
          <div className="shop-controls-title">
            <Title order={2} id={`shop-${shop.id}`} className="user-copy">
              {shop.name}
            </Title>
            {shop.description && (
              <Text size="sm" c="dimmed" className="user-copy">
                {shop.description}
              </Text>
            )}
          </div>
          <Group gap={4} wrap="nowrap">
            <ActionIcon
              variant="subtle"
              size={44}
              aria-label={t('admin.shop.renameNamed', { name: shop.name })}
              onClick={onRename}
            >
              <Pencil size={18} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              size={44}
              aria-label={t('admin.shop.archiveNamed', { name: shop.name })}
              onClick={onArchive}
            >
              <Archive size={18} />
            </ActionIcon>
          </Group>
        </Group>
        <Text size="xs" c="dimmed">
          {t('admin.shop.autoSaveHint')}
        </Text>

        <Switch
          size="lg"
          checked={view.is_open}
          label={t(view.is_open ? 'admin.shop.isOpen' : 'admin.shop.isClosed')}
          description={t('admin.shop.openHelp')}
          onChange={(e) => change({ is_open: e.currentTarget.checked })}
          className="shop-open-switch"
        />

        <div>
          <Text size="sm" fw={500} mb={6} id={`visibility-${shop.id}`}>
            {t('admin.shop.visibility')}
          </Text>
          <SegmentedControl
            fullWidth
            aria-labelledby={`visibility-${shop.id}`}
            value={view.visibility}
            onChange={(visibility) => change({ visibility: visibility as ShopVisibility })}
            data={(['hidden', 'party', 'selected'] as const).map((v) => ({
              value: v,
              label: t(`admin.visibility.shop.${v}`),
            }))}
            className="wrap-segments"
          />
          {view.visibility === 'selected' && (
            <div className="controls-indent">
              <AccessChips
                label={t('admin.shop.access')}
                characters={characters}
                value={view.access}
                onChange={(access) => change({ access })}
              />
            </div>
          )}
        </div>

        <div>
          <Text size="sm" fw={500} mb={6} id={`mode-${shop.id}`}>
            {t('admin.shop.mode')}
          </Text>
          <SegmentedControl
            fullWidth
            aria-labelledby={`mode-${shop.id}`}
            value={view.mode}
            onChange={(mode) => change({ mode: mode as ShopMode })}
            data={[
              { value: 'auto', label: t('shop.mode.auto') },
              { value: 'approval', label: t('shop.mode.approval') },
            ]}
            className="wrap-segments"
          />
          <Text size="xs" c="dimmed" mt={4}>
            {t(`shop.modeHelp.${view.mode}`)}
          </Text>
        </div>

        <div>
          <Group justify="space-between" mb={6}>
            <Text size="sm" fw={500}>
              {t('admin.shop.resale')}
            </Text>
            <Text size="sm" fw={600} aria-hidden="true">
              {view.resale_percent === 0
                ? t('admin.shop.notBuying')
                : t('admin.shop.resaleValue', { value: view.resale_percent })}
            </Text>
          </Group>
          <Slider
            thumbLabel={t('admin.shop.resale')}
            thumbValueText={(value) =>
              value === 0 ? t('admin.shop.notBuying') : t('admin.shop.resaleValue', { value })
            }
            min={0}
            max={100}
            step={5}
            value={view.resale_percent}
            label={(value) => `${value} %`}
            marks={[0, 25, 50, 75, 100].map((value) => ({ value, label: `${value}%` }))}
            onChange={(value) => change({ resale_percent: value }, 500)}
            className="touch-slider"
            thumbSize={32}
          />
          <Text size="xs" c="dimmed" mt={28}>
            {t('admin.shop.resaleHelp')}
          </Text>
        </div>
      </Stack>
    </Paper>
  )
}
