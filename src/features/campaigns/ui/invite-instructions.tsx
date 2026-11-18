import { useRef, useState } from 'react'
import { ActionIcon, Button, Group, Menu, Stack, Text, Textarea } from '@mantine/core'
import { Check, Copy, Ellipsis, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SentInvitation } from '../domain/campaign'

export function SentInvitationRow({
  invitation,
  busy,
  onShare,
  onCancel,
}: {
  invitation: SentInvitation
  busy: boolean
  onShare: (target: HTMLButtonElement) => void
  onCancel: (target: HTMLButtonElement) => void
}) {
  const { t, i18n } = useTranslation()
  const menuTrigger = useRef<HTMLButtonElement>(null)
  return (
    <li className="member-row">
      <div className="member-identity">
        <Text fw={600} className="user-copy">
          {invitation.email}
        </Text>
        <Text size="sm" c="dimmed">
          {t('hub.expires', {
            date: new Date(invitation.expires_at).toLocaleDateString(i18n.language),
          })}
        </Text>
      </div>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon
            ref={menuTrigger}
            variant="subtle"
            size={44}
            aria-label={t('activation.invite.options', { email: invitation.email })}
            disabled={busy}
          >
            <Ellipsis size={20} aria-hidden="true" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Copy size={18} aria-hidden="true" />}
            onClick={() => menuTrigger.current && onShare(menuTrigger.current)}
          >
            {t('activation.invite.view')}
          </Menu.Item>
          <Menu.Item
            color="red"
            leftSection={<X size={18} aria-hidden="true" />}
            onClick={() => menuTrigger.current && onCancel(menuTrigger.current)}
          >
            {t('members.revoke')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </li>
  )
}

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
