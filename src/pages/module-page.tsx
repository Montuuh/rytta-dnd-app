import { Button, Text, Title } from '@mantine/core'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArtPlate } from '@/shared/ui/art'

/** Catch-all route: any address without a page, including modules that have not shipped. */
export function ModulePage() {
  const { t } = useTranslation()
  const { campaignId } = useParams()
  return (
    <section className="not-found">
      <ArtPlate name="empty/not-found" size={200} />
      <Title order={1}>{t('page.notFound')}</Title>
      <Text c="dimmed">{t('page.notFoundHelp')}</Text>
      <Button component={Link} to={campaignId ? `/campaign/${campaignId}` : '/'}>
        {t(campaignId ? 'page.goCampaign' : 'page.goHome')}
      </Button>
    </section>
  )
}
