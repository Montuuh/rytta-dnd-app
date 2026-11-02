import { useRef, useState } from 'react'
import {
  Alert,
  Button,
  Loader,
  Drawer,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { useCampaign, useCampaignView } from '@/features/campaigns'
import {
  catalogueQuery,
  rosterQuery,
  useInventoryAction,
  DefinitionEditor,
  ItemIcon,
  itemCategories,
  type ItemDefinition,
} from '@/features/inventory'
import { CatalogueShopPicker } from '@/features/shops'

export function CampaignItemsPage() {
  const campaign = useCampaign()
  const { playerPreview } = useCampaignView()
  const { t } = useTranslation()
  if (campaign.role !== 'dm' || playerPreview)
    return <Alert>{t('inventory.error.forbidden')}</Alert>
  return <CampaignCatalogue campaignId={campaign.id} />
}
function CampaignCatalogue({ campaignId }: { campaignId: string }) {
  const { state } = useAuth()
  const { t } = useTranslation()
  const query = useQuery(catalogueQuery(state.user!.id, campaignId))
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>('all')
  const [editor, setEditor] = useState<{ item: ItemDefinition | null } | null>(null)
  const [give, setGive] = useState<ItemDefinition | null>(null)
  const [shop, setShop] = useState<ItemDefinition | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const items = (query.data ?? []).filter(
    (item) =>
      !item.archived &&
      (category === 'all' || item.category === category) &&
      item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  )
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={1}>{t('catalogue.title')}</Title>
        <Button onClick={() => setEditor({ item: null })}>{t('catalogue.create')}</Button>
      </Group>
      <Text c="dimmed">{t('catalogue.intro')}</Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput
          label={t('catalogue.search')}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <Select
          label={t('inventory.forge.category')}
          value={category}
          onChange={setCategory}
          allowDeselect={false}
          data={['all', ...itemCategories].map((value) => ({
            value,
            label: t(`inventory.category.${value}` as 'inventory.category.all'),
          }))}
        />
      </SimpleGrid>
      {notice && <Alert role="status">{notice}</Alert>}
      {query.isPending && <Text role="status">{t('common.loading')}</Text>}
      {query.isError && (
        <Alert color="red" role="alert">
          {t('query.error')}{' '}
          <Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>
        </Alert>
      )}
      {query.data && items.length === 0 && (
        <Paper p="lg">
          <Text>{t('catalogue.empty')}</Text>
        </Paper>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {items.map((item) => (
          <Paper key={item.id} p="md" withBorder>
            <Stack>
              <Group wrap="nowrap">
                <ItemIcon icon={item.icon} imagePath={item.image_path} size={72} />
                <div style={{ minWidth: 0 }}>
                  <Title order={2} className="user-copy" size="h3">
                    {item.name}
                  </Title>
                  <Text size="sm" c="dimmed">
                    {t(`inventory.category.${item.category}`)}
                  </Text>
                </div>
              </Group>
              <Group gap="xs">
                <Button variant="light" onClick={() => setEditor({ item })}>
                  {t('catalogue.edit')}
                </Button>
                <Button variant="default" onClick={() => setGive(item)}>
                  {t('catalogue.give')}
                </Button>
                {item.origin !== 'player' && (
                  <Button variant="default" onClick={() => setShop(item)}>
                    {t('catalogue.addToShop')}
                  </Button>
                )}
              </Group>
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
      {editor && (
        <DefinitionEditor
          campaignId={campaignId}
          definition={editor.item}
          onClose={() => setEditor(null)}
          onSaved={(item) => {
            setEditor(null)
            setNotice(t('catalogue.savedName', { name: item.name }))
          }}
        />
      )}
      {give && <GiveItem campaignId={campaignId} item={give} onClose={() => setGive(null)} />}
      {shop && (
        <CatalogueShopPicker campaignId={campaignId} item={shop} onClose={() => setShop(null)} />
      )}
    </Stack>
  )
}
function GiveItem({
  campaignId,
  item,
  onClose,
}: {
  campaignId: string
  item: ItemDefinition
  onClose: () => void
}) {
  const { state } = useAuth()
  const { t } = useTranslation()
  const roster = useQuery(rosterQuery(state.user!.id, campaignId))
  const action = useInventoryAction(campaignId)
  const [character, setCharacter] = useState<string | null>(null)
  const [amount, setAmount] = useState<number | string>(1)
  const [attempted, setAttempted] = useState(false)
  const opener = useRef(document.activeElement as HTMLElement | null)
  const dismiss = () => {
    onClose()
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus()
    })
  }
  const request = useRef(crypto.randomUUID())
  return (
    <Drawer
      opened
      title={t('catalogue.give')}
      returnFocus={false}
      onClose={() => !action.isPending && dismiss()}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      <Stack>
        <Text>{item.name}</Text>
        {roster.isPending && <Text role="status">{t('common.loading')}</Text>}
        {roster.isError && (
          <Alert role="alert">
            {t('query.error')}
            <Button onClick={() => void roster.refetch()}>{t('common.retry')}</Button>
          </Alert>
        )}
        {roster.data?.length === 0 && <Text>{t('inventory.noCharacters')}</Text>}
        <Select
          label={t('catalogue.character')}
          value={character}
          onChange={setCharacter}
          disabled={attempted}
          data={(roster.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
        <NumberInput
          label={t('inventory.card.amount')}
          value={amount}
          onChange={setAmount}
          disabled={attempted}
          min={1}
          max={1000}
          allowDecimal={false}
          hideControls
        />
        {action.isError && (
          <Alert role="alert" color="red">
            {t('catalogue.operationError')}
          </Alert>
        )}
        <Button
          aria-disabled={action.isPending || undefined}
          aria-busy={action.isPending}
          leftSection={action.isPending ? <Loader size={16} /> : undefined}
          disabled={!character || typeof amount !== 'number' || amount < 1}
          onClick={() => {
            if (action.isPending || !character || typeof amount !== 'number') return
            setAttempted(true)
            action.mutate(
              {
                kind: 'grant',
                characterId: character,
                definitionId: item.id,
                amount,
                requestId: request.current,
              },
              { onSuccess: dismiss },
            )
          }}
        >
          {t(attempted ? 'common.retry' : 'catalogue.give')}
        </Button>
      </Stack>
    </Drawer>
  )
}
