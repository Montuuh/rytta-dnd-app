import { Paper, Stack, Text } from '@mantine/core'
import { PageHead } from '@/shared/ui/page-head'
import { useTranslation } from 'react-i18next'
import { useCampaign } from '@/features/campaigns'
import { ShopAdminPanel } from './admin-panel'
import { Storefront } from './storefront'

/** DMs manage shops; Players (and a DM previewing a Player) see the storefront. */
export function ShopsPage() {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const enabled = (campaign.player_modules ?? []).includes('shops')
  if (campaign.role === 'dm') return <ShopAdminPanel playersSeeShops={enabled} />
  if (!enabled)
    return (
      <Stack>
        <PageHead title={t('module.shops')} />
        <Paper p="xl">
          <Text>{t('shop.hiddenModule')}</Text>
        </Paper>
      </Stack>
    )
  return <Storefront />
}
