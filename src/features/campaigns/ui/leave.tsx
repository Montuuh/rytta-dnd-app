import { useEffect, useId, useRef } from 'react'
import { Alert, Button, Loader, Menu, Modal, Stack, Text } from '@mantine/core'
import { LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useAuth } from '@/features/auth'
import { useCampaignAction } from '../api'
import { MembershipError, type LeaveBlock } from '../domain/campaign'
import './leave.css'

/**
 * RYT-095: "Leave campaign" in a menu, in the danger colour. While blocked it stays reachable by
 * the arrow keys (aria-disabled, not disabled) and, for the only DM, carries the reason.
 */
export function LeaveCampaignItem({
  block,
  onSelect,
}: {
  block: LeaveBlock
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const hintId = useId()
  const blocked = block !== null
  return (
    <>
      <Menu.Item
        leftSection={<LogOut size={18} aria-hidden="true" />}
        rightSection={
          block === 'checking' ? (
            <span aria-hidden="true">
              <Loader size={14} />
            </span>
          ) : undefined
        }
        className="leave-item"
        // Mantine derives aria-disabled from `disabled`, which would also drop the item from
        // arrow-key navigation; set it on the element instead.
        ref={(node: HTMLButtonElement | null) => {
          if (!node) return
          if (blocked) node.setAttribute('aria-disabled', 'true')
          else node.removeAttribute('aria-disabled')
        }}
        aria-describedby={block === 'last-dm' ? hintId : undefined}
        data-blocked={blocked || undefined}
        closeMenuOnClick={!blocked}
        onClick={() => !blocked && onSelect()}
      >
        {t('members.leave')}
      </Menu.Item>
      {block === 'last-dm' && (
        <Menu.Label id={hintId} className="leave-hint">
          {t('leave.lastDm')}
        </Menu.Label>
      )}
    </>
  )
}

/**
 * RYT-095: the one confirmation to leave a campaign. Failures stay in the dialog and the confirm
 * button retries. On success the campaign caches are gone (useCampaignAction) and the member lands
 * on My campaigns with the outcome. `onClose` is a cancel (the opener restores focus); `onLeft`
 * only closes, since the page underneath is about to change.
 */
export function LeaveCampaignDialog({
  campaign,
  onClose,
  onLeft,
}: {
  campaign: { id: string; name: string }
  onClose: () => void
  onLeft: () => void
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const navigate = useNavigate()
  const action = useCampaignAction()
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (action.isError) errorRef.current?.focus()
  }, [action.isError])
  const lastDm = action.error instanceof MembershipError && action.error.reason === 'last-dm'
  const leave = () =>
    // mutateAsync, not mutate callbacks: the page that opened the dialog can unmount once the
    // campaign leaves the cache, and the member must still land on My campaigns.
    action
      .mutateAsync({ kind: 'member', campaignId: campaign.id, userId: state.user!.id, role: null })
      .then(
        () => {
          onLeft()
          void navigate('/', { replace: true, state: { leftCampaign: campaign.name } })
        },
        // The failure is shown from the mutation state and the dialog stays open to retry.
        () => undefined,
      )
  return (
    <Modal
      opened
      centered
      onClose={() => !action.isPending && onClose()}
      title={
        <span className="leave-title user-copy">{t('leave.title', { name: campaign.name })}</span>
      }
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <Stack>
        <Text className="leave-body">{t('leave.body')}</Text>
        {action.isError && (
          <Alert ref={errorRef} tabIndex={-1} color="red" role="alert">
            {t(lastDm ? 'leave.lastDm' : 'leave.error')}
          </Alert>
        )}
        <div className="leave-actions">
          <Button variant="subtle" data-autofocus disabled={action.isPending} onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button
            color="red"
            variant="light"
            leftSection={<LogOut size={18} aria-hidden="true" />}
            loading={action.isPending}
            disabled={lastDm}
            onClick={() => void leave()}
          >
            {t('members.leave')}
          </Button>
        </div>
      </Stack>
    </Modal>
  )
}
