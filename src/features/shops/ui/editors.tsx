import { useState } from 'react'
import {
  Button,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { ShopVisibility } from '../domain/shops'

/** Starting a shop takes a name; everything else is set inline afterwards. */
export function CreateShopDialog({
  busy,
  onClose,
  onCreate,
}: {
  busy: boolean
  onClose: () => void
  onCreate: (name: string, visibility: ShopVisibility) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<ShopVisibility>('hidden')
  const valid = name.trim().length > 0 && name.trim().length <= 80
  return (
    <Modal
      opened
      onClose={onClose}
      title={t('admin.shop.newTitle')}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (valid) onCreate(name.trim(), visibility)
        }}
      >
        <Stack>
          <TextInput
            label={t('admin.shop.name')}
            placeholder={t('admin.shop.namePlaceholder')}
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
          />
          <div>
            <Text size="sm" fw={500} mb={4} id="new-shop-visibility">
              {t('admin.shop.visibility')}
            </Text>
            <SegmentedControl
              fullWidth
              aria-labelledby="new-shop-visibility"
              value={visibility}
              onChange={(v) => setVisibility(v as ShopVisibility)}
              data={(['hidden', 'party'] as const).map((v) => ({
                value: v,
                label: t(`admin.visibility.shop.${v}`),
              }))}
            />
            <Text size="xs" c="dimmed" mt={4}>
              {t('admin.shop.createHelp')}
            </Text>
          </div>
          <Group justify="end">
            <Button variant="subtle" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={busy} disabled={!valid}>
              {t('admin.shop.create')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

export function RenameShopDialog({
  name: initialName,
  description: initialDescription,
  busy,
  onClose,
  onSave,
}: {
  name: string
  description: string
  busy: boolean
  onClose: () => void
  onSave: (name: string, description: string) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const valid = name.trim().length > 0
  return (
    <Modal
      opened
      onClose={onClose}
      title={t('admin.shop.editTitle')}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (valid) onSave(name.trim(), description.trim())
        }}
      >
        <Stack>
          <TextInput
            label={t('admin.shop.name')}
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
          />
          <Textarea
            label={t('admin.shop.description')}
            maxLength={2000}
            autosize
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
          />
          <Group justify="end">
            <Button variant="subtle" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={busy} disabled={!valid}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
