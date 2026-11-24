import { useDeferredValue, useRef, useState } from 'react'
import { Alert, Button, Group, Loader, Select, Stack, Text, TextInput } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { adminCampaignsQuery } from '@/features/admin'
import { useAuth } from '@/features/auth'
import { Modal } from '@/shared/ui/overlays'
import { usePhone } from '@/shared/ui/use-viewport'
import { offersQuery, useOfferAction } from '../api'
import {
  libraryErrorCode,
  packTitle,
  type ContentLanguage,
  type ContentPack,
} from '../domain/library'

/**
 * RYT-163: the campaigns a private pack is offered to (owner choice P5 A). The owner adds
 * campaigns they run as DM; a super admin can also find any campaign. Removing a campaign stops its
 * reads at once (P6 A); adding it again gives back what it had enabled.
 */
export function OffersDialog({
  pack,
  language,
  onClose,
}: {
  pack: ContentPack
  language: ContentLanguage
  onClose: () => void
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const { state } = useAuth()
  const userId = state.user?.id ?? ''
  const offers = useQuery(offersQuery(userId, pack.id))
  const action = useOfferAction(pack.id)
  const [choice, setChoice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const deferred = useDeferredValue(search.trim())
  const superAdmin = offers.data?.super_admin ?? false
  const found = useQuery({
    ...adminCampaignsQuery(userId, deferred),
    enabled: superAdmin && deferred.length >= 2,
  })
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLHeadingElement>(null)
  const offered = offers.data?.offered ?? []
  const offeredIds = new Set(offered.map((campaign) => campaign.id))
  const mine = (offers.data?.mine ?? []).filter((campaign) => !offeredIds.has(campaign.id))
  const others = (found.data ?? []).filter((campaign) => !offeredIds.has(campaign.id)).slice(0, 8)
  const title = packTitle(pack, language)
  const change = async (campaignId: string, name: string, value: boolean) => {
    if (action.isPending) return
    setError(null)
    setNotice(null)
    try {
      await action.mutateAsync({ campaignId, offered: value })
      setNotice(t(value ? 'library.offers.added' : 'library.offers.removed', { name }))
      if (value) setChoice(null)
      listRef.current?.focus()
    } catch (caught) {
      setError(
        t(`library.error.${libraryErrorCode(caught instanceof Error ? caught.message : '')}`),
      )
    }
  }
  const busy = action.isPending
  return (
    <Modal
      opened
      onClose={() => !busy && onClose()}
      title={t('library.offers.title', { pack: title })}
      fullScreen={phone}
      size="lg"
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44, disabled: busy }}
    >
      <Stack gap="md">
        {offers.isPending && <Loader size="sm" aria-label={t('library.offers.loading')} />}
        {offers.isError && (
          <Alert color="red" role="alert">
            {t('library.offers.loadError')}{' '}
            <Button variant="subtle" onClick={() => void offers.refetch()}>
              {t('common.retry')}
            </Button>
          </Alert>
        )}
        {offers.data && (
          <>
            <Text size="sm">{t('library.offers.lede')}</Text>
            <div role="status" aria-live="polite">
              {notice && <Text size="sm">{notice}</Text>}
            </div>
            {error && (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            )}
            <section aria-labelledby="lib-offers-list" className="lib-offers">
              <h3 id="lib-offers-list" className="lib-offers-title" tabIndex={-1} ref={listRef}>
                {t('library.offers.list', { count: offered.length })}
              </h3>
              {offered.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t('library.offers.none')}
                </Text>
              ) : (
                <ul className="lib-offer-list">
                  {offered.map((campaign) => (
                    <li key={campaign.id}>
                      <span className="user-copy">{campaign.name}</span>
                      <Button
                        variant="subtle"
                        color="red"
                        aria-disabled={busy || undefined}
                        leftSection={<X size={16} aria-hidden="true" />}
                        aria-label={t('library.offers.removeOne', { name: campaign.name })}
                        onClick={() => void change(campaign.id, campaign.name, false)}
                      >
                        {t('library.offers.remove')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {mine.length > 0 && (
              <Group align="flex-end" gap="xs" wrap={phone ? 'wrap' : 'nowrap'}>
                <Select
                  className="lib-offer-pick"
                  label={t('library.offers.mine')}
                  placeholder={t('library.offers.pick')}
                  data={mine.map((campaign) => ({ value: campaign.id, label: campaign.name }))}
                  value={choice}
                  onChange={setChoice}
                  disabled={busy}
                />
                <Button
                  leftSection={<Plus size={16} aria-hidden="true" />}
                  disabled={!choice}
                  aria-disabled={busy || undefined}
                  onClick={() => {
                    const campaign = mine.find((item) => item.id === choice)
                    if (campaign) void change(campaign.id, campaign.name, true)
                  }}
                >
                  {t('library.offers.add')}
                </Button>
              </Group>
            )}
            {!superAdmin && mine.length === 0 && offered.length === 0 && (
              <Text size="sm" c="dimmed">
                {t('library.offers.noCampaigns')}
              </Text>
            )}
            {superAdmin && (
              <section aria-labelledby="lib-offers-any" className="lib-offers">
                <h3 id="lib-offers-any" className="lib-offers-title">
                  {t('library.offers.any')}
                </h3>
                <TextInput
                  type="search"
                  aria-label={t('library.offers.searchLabel')}
                  placeholder={t('library.offers.search')}
                  leftSection={<Search size={16} aria-hidden="true" />}
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                />
                {found.isFetching && <Loader size="xs" aria-label={t('library.offers.loading')} />}
                {deferred.length >= 2 && found.data && others.length === 0 && (
                  <Text size="sm" c="dimmed">
                    {t('library.offers.noResults')}
                  </Text>
                )}
                {others.length > 0 && (
                  <ul className="lib-offer-list">
                    {others.map((campaign) => (
                      <li key={campaign.id}>
                        <span className="user-copy">{campaign.name}</span>
                        <Button
                          variant="light"
                          aria-disabled={busy || undefined}
                          leftSection={<Plus size={16} aria-hidden="true" />}
                          aria-label={t('library.offers.addOne', { name: campaign.name })}
                          onClick={() => void change(campaign.id, campaign.name, true)}
                        >
                          {t('library.offers.add')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} disabled={busy}>
            {t('library.offers.done')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
