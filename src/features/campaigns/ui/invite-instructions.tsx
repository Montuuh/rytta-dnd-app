import { useRef, useState } from 'react'
import { Button, Group, Stack, Text, Textarea } from '@mantine/core'
import { Check, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function InviteInstructions({
  email,
  campaign,
  onClose,
}: {
  email: string
  campaign: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const instructions = useRef<HTMLTextAreaElement>(null)
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  const text = t('activation.invite.instructions', {
    campaign,
    email,
    url: new URL(import.meta.env.BASE_URL, window.location.origin).href,
  })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
    } catch {
      setStatus('manual')
      instructions.current?.focus()
      instructions.current?.select()
    }
  }

  return (
    <Stack>
      <Text fw={600} className="user-copy">
        {t('activation.invite.created', { email })}
      </Text>
      <Textarea
        ref={instructions}
        label={t('activation.invite.share')}
        value={text}
        readOnly
        autosize
        minRows={4}
      />
      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" onClick={onClose}>
          {t('activation.invite.done')}
        </Button>
        <Button
          data-invite-instructions
          data-autofocus
          onClick={() => void copy()}
          leftSection={
            status === 'copied' ? (
              <Check size={18} aria-hidden="true" />
            ) : (
              <Copy size={18} aria-hidden="true" />
            )
          }
        >
          {t('activation.invite.copy')}
        </Button>
      </Group>
      {status !== 'idle' && (
        <Text role="status" size="sm">
          {t(status === 'copied' ? 'activation.invite.copied' : 'activation.invite.copyError')}
        </Text>
      )}
    </Stack>
  )
}
