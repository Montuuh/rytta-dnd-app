import { useMemo, useRef, useState } from 'react'
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
import { usePhone } from '@/shared/ui/use-viewport'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, Hammer, PackageSearch, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { catalogueQuery, useInventoryAction } from '../api'
import type { ItemDefinition } from '../domain/item'
import { DefinitionEditor, type GiveOutcome } from './definition-editor'
import { ItemIcon } from './item-icon'
import { Stepper } from './stepper'
import { newRequestId } from '@/shared/lib/request-id'

type Step = 'choose' | 'existing' | 'create'

/** DM "Add item" on a character's satchel: give an existing storeroom item, or forge a new one
 * that lands in this satchel (RYT-032). Each pick and amount keeps its own idempotency key. */
export function AddItemChooser({
  campaignId,
  character,
  onClose,
  onDone,
}: {
  campaignId: string
  character: { id: string; name: string }
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const phone = usePhone()
  const [step, setStep] = useState<Step>('choose')
  const catalogue = useQuery({
    ...catalogueQuery(state.user!.id, campaignId),
    enabled: step === 'existing',
  })
  const action = useInventoryAction(campaignId)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [amount, setAmount] = useState<number | null>(1)
  const [failed, setFailed] = useState(false)
  const requests = useRef(new Map<string, string>())
  const items = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    return (catalogue.data ?? [])
      .filter((item) => !item.archived && item.name.toLocaleLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, i18n.language))
  }, [catalogue.data, search, i18n.language])
  const item = catalogue.data?.find((d) => d.id === picked && !d.archived) ?? null
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
      onDone(t('addItem.given', { item: item.name, amount: quantity, name: character.name }))
    } catch {
      setFailed(true)
    }
  }
  if (step === 'create')
    return (
      <DefinitionEditor
        campaignId={campaignId}
        definition={null}
        allowGive
        initialGive={[character.id]}
        title={t('store.createFor', { name: character.name })}
        returnFocusToOpener={false}
        onClose={onClose}
        onSaved={(saved: ItemDefinition, outcome?: GiveOutcome) =>
          onDone(
            outcome?.failed.length
              ? t('store.givePartial', { name: saved.name, names: outcome.failed.join(', ') })
              : outcome?.given.length
                ? t('store.createdFor', { name: saved.name, names: outcome.given.join(', ') })
                : t('catalogue.savedName', { name: saved.name }),
          )
        }
      />
    )
  return (
    <Drawer
      opened
      returnFocus={false}
      position={phone ? 'bottom' : 'right'}
      size={phone ? (step === 'choose' ? 'auto' : '92%') : 480}
      title={t('addItem.title', { name: character.name })}
      onClose={() => !action.isPending && onClose()}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
      className="add-item-drawer"
    >
      {step === 'choose' && (
        <div
          className="add-choice"
          role="group"
          aria-label={t('addItem.title', { name: character.name })}
        >
          <UnstyledButton
            className="add-choice-card"
            data-autofocus
            onClick={() => setStep('existing')}
          >
            <span className="add-choice-icon" aria-hidden="true">
              <PackageSearch size={26} />
            </span>
            <span className="add-choice-copy">
              <span className="add-choice-title">{t('addItem.existing')}</span>
              <span className="add-choice-hint">{t('addItem.existingHint')}</span>
            </span>
          </UnstyledButton>
          <UnstyledButton className="add-choice-card" onClick={() => setStep('create')}>
            <span className="add-choice-icon" aria-hidden="true">
              <Hammer size={26} />
            </span>
            <span className="add-choice-copy">
              <span className="add-choice-title">{t('addItem.create')}</span>
              <span className="add-choice-hint">
                {t('addItem.createHint', { name: character.name })}
              </span>
            </span>
          </UnstyledButton>
        </div>
      )}
      {step === 'existing' && (
        <Stack gap="md">
          <Button
            variant="subtle"
            w="fit-content"
            leftSection={<ArrowLeft size={16} aria-hidden="true" />}
            disabled={action.isPending}
            onClick={() => setStep('choose')}
          >
            {t('common.back')}
          </Button>
          <TextInput
            label={t('addItem.search')}
            leftSection={<Search size={16} aria-hidden="true" />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            data-autofocus
          />
          {catalogue.isPending && <Text role="status">{t('common.loading')}</Text>}
          {catalogue.isError && (
            <Alert color="red" role="alert">
              {t('query.error')}{' '}
              <Button variant="subtle" onClick={() => void catalogue.refetch()}>
                {t('common.retry')}
              </Button>
            </Alert>
          )}
          {catalogue.data && catalogue.data.every((d) => d.archived) && (
            <Stack gap="xs" align="flex-start">
              <Text>{t('addItem.empty')}</Text>
              <Button
                variant="light"
                leftSection={<Hammer size={16} aria-hidden="true" />}
                onClick={() => setStep('create')}
              >
                {t('addItem.create')}
              </Button>
            </Stack>
          )}
          {catalogue.data && items.length === 0 && search.trim() && (
            <Text c="dimmed">{t('store.noResults')}</Text>
          )}
          {items.length > 0 && (
            <div className="add-pick-list" role="group" aria-label={t('addItem.pickGroup')}>
              {items.map((entry) => {
                const on = entry.id === picked
                return (
                  <UnstyledButton
                    key={entry.id}
                    aria-pressed={on}
                    className="add-pick-row"
                    disabled={action.isPending}
                    onClick={() => {
                      setPicked(entry.id)
                      setFailed(false)
                    }}
                  >
                    <span className={`store-glyph rarity-${entry.rarity}`} aria-hidden="true">
                      <ItemIcon icon={entry.icon} imagePath={entry.image_path} size={22} />
                    </span>
                    <span className="store-row-body">
                      <span className="store-row-name user-copy">{entry.name}</span>
                      <span className="store-row-meta">
                        {t(`inventory.category.${entry.category}`)} ·{' '}
                        {t(`inventory.rarity.${entry.rarity}`)}
                      </span>
                    </span>
                    <span className="add-pick-check" aria-hidden="true">
                      {on && <Check size={18} />}
                    </span>
                  </UnstyledButton>
                )
              })}
            </div>
          )}
          <div className="pick-dock">
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
                  : t('addItem.give', { amount: amount ?? 1, name: character.name })
                : t('addItem.pickFirst')}
            </Button>
          </div>
        </Stack>
      )}
    </Drawer>
  )
}
