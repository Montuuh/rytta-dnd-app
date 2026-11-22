import { Button, Text } from '@mantine/core'
import { ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAdminAccess, useAdminStatus } from '../api'
import './admin.css'

/**
 * RYT-153: inside a campaign entered from the admin panel, a fixed line says so, until when, and
 * offers to leave. It shows only to the super admin, never to the campaign's members.
 */
export function AdminBanner({ campaignId }: { campaignId: string }) {
  const { t, i18n } = useTranslation()
  const status = useAdminStatus()
  const { exit } = useAdminAccess()
  const navigate = useNavigate()
  const access = status.data?.access.find((a) => a.campaign_id === campaignId)
  if (!access) return null
  const until = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' }).format(
    new Date(access.expires_at),
  )
  return (
    <div className="admin-banner" role="status">
      <ShieldCheck size={18} aria-hidden="true" />
      <Text size="sm" fw={600} className="admin-banner-text">
        {t('superAdmin.banner', { time: until })}
      </Text>
      <Button
        size="compact-md"
        variant="default"
        className="admin-banner-exit"
        loading={exit.isPending}
        onClick={() =>
          exit.mutate(campaignId, {
            onSuccess: () => void navigate(`/admin?tab=campaigns&campaign=${campaignId}`),
          })
        }
      >
        {t('superAdmin.exit')}
      </Button>
    </div>
  )
}
