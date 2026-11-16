import { useRef, useState } from 'react'
import {
  Alert,
  Button,
  Drawer,
  Loader,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { Hammer, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { newRequestId } from '@/shared/lib/request-id'
import { localizedDescription, localizedName } from '@/shared/lib/translations'
import { usePhone } from '@/shared/ui/use-viewport'
import { catalogueSearchQuery, useInventoryAction } from '../api'
import { PickList } from './pick-list'
import { Stepper } from './stepper'
import { useWeightFormat } from './use-weight'

/**
 * RYT-105 Player "Add item": search the basic items of the campaign first and add one with an
 * amount; when nothing fits, propose a new item for the DM to review.
 */
export function PlayerAddItem({
  campaignId,
  character,
  onClose,
  onDone,
  onPropose,
}: {
  campaignId: string
  character: { id: string; name: string }
  onClose: () => void
  onDone: (message: string) => void
  /** Opens the proposal forge, seeded with what the Player searched for. */
  onPropose: (name: string) => void
}) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const { format } = useWeightFormat()
  const phone = usePhone()
  const [search, setSearch] = useState('')
  const [debounced] = useDebouncedValue(search, 250)
  const query = useQuery({
    ...catalogueSearchQuery(state.user!.id, campaignId, debounced, 60),
  })
  const action = useInventoryAction(campaignId)
  const [picked, setPicked] = useState<string | null>(null)
  const [amount, setAmount] = useState<number | null>(1)
  const [failed, setFailed] = useState(false)
  const requests = useRef(new Map<string, string>())
  // Players may add only basic catalogue items to themselves; new items go through the DM.
  const items = (query.data ?? [])
    .filter((item) => item.basic_key)
    .sort((a, b) =>
      localizedName(a, i18n.language).localeCompare(localizedName(b, i18n.language), i18n.language),
    )
  const item = items.find((entry) => entry.id === picked) ?? null
  const give = async () => {
    if (!item || action.isPending) return
    const quantity = amount ?? 1
    const key = `${item.id}:${quantity}`
    if (!requests.current.has(key)) requests.current.set(key, newRequestId())
    setFailed(false)
    try {
      await action.mutateAsync({
        kind: 'grant',
        characterId: character.id,
        definitionId: item.id,
        amount: quantity,
        requestId: requests.current.get(key),
      })
      onDone(
        t('addItem.taken', {
          item: localizedName(item, i18n.language),
          amount: quantity,
        }),
      )
    } catch {
      setFailed(true)
    }
  }
  const propose = (
    <UnstyledButton
      className="quiet-link propose-link"
      disabled={action.isPending}
      onClick={() => onPropose(search.trim())}
    >
      <Hammer size={16} aria-hidden="true" />
      {t('items.propose.open')}
    </UnstyledButton>
  )
  // Nothing to pick: proposing is the only way forward, so it is the action of the drawer.
  const nothingToPick = Boolean(query.data) && items.length === 0
  const description = item ? localizedDescription(item, i18n.language) : ''
  return (
    <Drawer
      opened
      returnFocus={false}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '92%' : 480}
      title={t('addItem.title', { name: character.name })}
      onClose={() => !action.isPending && onClose()}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
      className="add-item-drawer"
    >
      <Stack gap="md">
        <TextInput
          label={t('items.add.search')}
          placeholder={t('items.add.placeholder')}
          leftSection={<Search size={16} aria-hidden="true" />}
          rightSection={query.isFetching ? <Loader size={16} /> : undefined}
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value)
            setFailed(false)
          }}
          data-autofocus
        />
        {query.isPending && <Text role="status">{t('common.loading')}</Text>}
        {query.isError && (
          <Alert color="red" role="alert">
            {query.error.message === 'forbidden' ? t('items.add.forbidden') : t('query.error')}{' '}
            <Button variant="subtle" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          </Alert>
        )}
        {nothingToPick && (
          <Stack gap="sm">
            <Text>
              {debounced.trim()
                ? t('items.add.noMatch', { query: debounced.trim() })
                : t('items.add.noneYet')}
            </Text>
            <Button
              size="lg"
              fullWidth
              leftSection={<Hammer size={18} aria-hidden="true" />}
              disabled={action.isPending}
              onClick={() => onPropose(search.trim())}
            >
              {t('items.propose.openEmpty')}
            </Button>
          </Stack>
        )}
        {items.length > 0 && (
          <PickList
            label={t('addItem.pickGroup')}
            selected={picked}
            disabled={action.isPending}
            onPick={(id) => {
              setPicked(id)
              setFailed(false)
            }}
            entries={items.map((entry) => ({
              id: entry.id,
              name: localizedName(entry, i18n.language),
              meta: [
                t(`inventory.category.${entry.category}`),
                entry.weight_lb > 0 ? format(entry.weight_lb) : null,
              ]
                .filter(Boolean)
                .join(' · '),
              icon: entry.icon,
              imagePath: entry.image_path,
              rarity: entry.rarity,
            }))}
          />
        )}
        {items.length > 0 && propose}
        {!nothingToPick && (
          <div className="pick-dock">
            {item && description && (
              <Text size="sm" className="pick-description user-copy preserve-lines">
                {description}
              </Text>
            )}
            {item && (
              <Stepper
                label={t('inventory.card.amount')}
                min={1}
                max={1000}
                value={amount}
                onChange={setAmount}
                disabled={action.isPending}
              />
            )}
            {failed && (
              <Alert color="red" role="alert" my="xs">
                {t('addItem.error')}
              </Alert>
            )}
            <Button
              size="lg"
              fullWidth
              mt="xs"
              aria-busy={action.isPending}
              aria-disabled={action.isPending || !item || undefined}
              disabled={!item && !action.isPending}
              leftSection={action.isPending ? <Loader size={16} /> : undefined}
              onClick={() => void give()}
            >
              {item
                ? failed
                  ? t('common.retry')
                  : t('addItem.take', { amount: amount ?? 1 })
                : t('addItem.pickFirst')}
            </Button>
          </div>
        )}
      </Stack>
    </Drawer>
  )
}
