import { useState } from 'react'
import { Button, Group, Stack, Textarea, TextInput } from '@mantine/core'
import { Modal } from '@/shared/ui/overlays'
import { useTranslation } from 'react-i18next'

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
