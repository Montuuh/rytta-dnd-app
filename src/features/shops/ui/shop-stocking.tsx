import { useState } from 'react'
import {
  Alert,
  Button,
  Drawer,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { usePhone } from '@/shared/ui/use-viewport'
import { basicCatalogueQuery } from '@/features/inventory'
import { findShopType } from '../domain/shop-types'
import type { AdminShop, ShopVisibility } from '../domain/shops'
import { stockLanguage, typeItems } from '../domain/stocking'
import { ShopTypePicker, StockReview } from './shop-type-picker'
import { useShopStocking, type StockOutcome, type StockStep } from './use-stocking'
import './shops.css'

const stepKey = (step: StockStep) => `admin.type.step.${step}` as const

function useChoice(initial: string) {
  const catalogue = useQuery(basicCatalogueQuery())
  const [key, setKey] = useState(initial)
  const [excluded, setExcluded] = useState<string[]>([])
  const type = key ? findShopType(key) : undefined
  const all = type && catalogue.data ? typeItems(type, catalogue.data.items) : []
  const items = all.filter((item) => !excluded.includes(item.key))
  return { catalogue, key, setKey, excluded, setExcluded, type, all, items }
}

/** One status line and the primary action of a stocking drawer, docked at its foot. */
function Dock({
  error,
  step,
  label,
  disabled,
  onSubmit,
}: {
  error: string | null
  step: StockStep | null
  label: string
  disabled: boolean
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="pick-dock">
      {error && (
        <Alert color="red" role="alert" mb="xs">
          {error}
        </Alert>
      )}
      <Text size="sm" role="status" aria-live="polite" ta="center" mb={step ? 6 : 0}>
        {step ? t(stepKey(step)) : ''}
      </Text>
      <Button
        size="lg"
        fullWidth
        type="submit"
        disabled={disabled && !step}
        aria-disabled={Boolean(step) || disabled}
        aria-busy={Boolean(step)}
        leftSection={step ? <Loader size={16} /> : undefined}
        onClick={(event) => {
          event.preventDefault()
          if (!step && !disabled) onSubmit()
        }}
      >
        {label}
      </Button>
    </div>
  )
}

/**
 * RYT-107: a new shop takes a name and, optionally, a type that stocks it from the basic
 * catalogue at catalogue prices with unlimited stock. Everything else is set inline afterwards.
 * If stocking fails once the shop exists, the drawer stays open and the retry only stocks it.
 */
export function CreateShopDrawer({
  campaignId,
  onClose,
  onCreated,
}: {
  campaignId: string
  /** With the id of a shop that was created even though its stock did not finish. */
  onClose: (createdShopId: string | null) => void
  onCreated: (outcome: StockOutcome, name: string) => void
}) {
  const { t, i18n } = useTranslation()
  const phone = usePhone()
  const lang = stockLanguage(i18n.language)
  const stocking = useShopStocking(campaignId)
  const choice = useChoice('')
  const [name, setName] = useState('')
  const [autoName, setAutoName] = useState('')
  const [visibility, setVisibility] = useState<ShopVisibility>('hidden')
  const created = stocking.createdShopId !== null
  const locked = stocking.busy || created
  const valid = name.trim().length > 0 && name.trim().length <= 80
  const waiting = Boolean(choice.type) && choice.catalogue.isPending
  const close = () => {
    if (!stocking.busy) onClose(stocking.createdShopId)
  }
  const submit = async () => {
    if (!valid || waiting || (choice.type && choice.items.length === 0)) return
    const outcome = await stocking.run(
      {
        create: {
          name: name.trim(),
          description: '',
          visibility,
          mode: 'auto',
          resale_percent: 50,
          is_open: true,
          access: [],
          ...(choice.key ? { kind: choice.key } : {}),
        },
      },
      choice.items,
    )
    if (outcome) onCreated(outcome, name.trim())
  }
  const error = stocking.error
    ? created
      ? t('admin.type.stockFailed', { name: name.trim() })
      : t(`commerce.error.${stocking.error.code}`)
    : choice.catalogue.isError
      ? t('admin.type.catalogueError')
      : null
  return (
    <Drawer
      opened
      onClose={close}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '92%' : 'lg'}
      title={t('admin.shop.newTitle')}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Stack gap="lg">
          <TextInput
            label={t('admin.shop.name')}
            placeholder={t('admin.shop.namePlaceholder')}
            required
            maxLength={80}
            value={name}
            disabled={locked}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
          />
          <div>
            <ShopTypePicker
              value={choice.key}
              catalogue={choice.catalogue.data?.items}
              disabled={locked}
              onChange={(key) => {
                choice.setKey(key)
                choice.setExcluded([])
                // A name the DM did not type follows the type; a typed one is kept.
                const next = key ? (findShopType(key)?.name[lang] ?? '') : ''
                if (!name.trim() || name === autoName) {
                  setName(next)
                  setAutoName(next)
                }
              }}
            />
            {choice.type && (
              <Stack gap="xs" mt="sm">
                <Text size="sm" c="dimmed">
                  {choice.type.description[lang]}
                </Text>
                {choice.all.length > 0 && (
                  <StockReview
                    items={choice.all}
                    excluded={choice.excluded}
                    disabled={locked}
                    onChange={choice.setExcluded}
                  />
                )}
              </Stack>
            )}
          </div>
          <div>
            <Text size="sm" fw={500} mb={4} id="new-shop-visibility">
              {t('admin.shop.visibility')}
            </Text>
            <SegmentedControl
              fullWidth
              aria-labelledby="new-shop-visibility"
              value={visibility}
              disabled={locked}
              onChange={(v) => setVisibility(v as ShopVisibility)}
              data={(['hidden', 'party'] as const).map((v) => ({
                value: v,
                label: t(`admin.visibility.shop.${v}`),
              }))}
            />
          </div>
          <Dock
            error={error}
            step={stocking.step}
            disabled={!valid || waiting || Boolean(choice.type && choice.items.length === 0)}
            onSubmit={() => void submit()}
            label={
              created
                ? t('admin.type.finish', { count: choice.items.length })
                : choice.type
                  ? t('admin.type.createStocked', { count: choice.items.length })
                  : t('admin.shop.create')
            }
          />
        </Stack>
      </form>
    </Drawer>
  )
}

/** RYT-107: fill an existing empty shop from a type; its own type is preselected. */
export function StockFromTypeDrawer({
  campaignId,
  shop,
  onClose,
  onStocked,
}: {
  campaignId: string
  shop: AdminShop
  onClose: () => void
  onStocked: (outcome: StockOutcome) => void
}) {
  const { t, i18n } = useTranslation()
  const phone = usePhone()
  const lang = stockLanguage(i18n.language)
  const stocking = useShopStocking(campaignId)
  const choice = useChoice(shop.kind && findShopType(shop.kind) ? shop.kind : '')
  const ready = Boolean(choice.type) && choice.items.length > 0
  const submit = async () => {
    if (!ready) return
    const outcome = await stocking.run({ shopId: shop.id, kind: choice.key }, choice.items)
    if (outcome) onStocked(outcome)
  }
  return (
    <Drawer
      opened
      onClose={() => !stocking.busy && onClose()}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '92%' : 'lg'}
      title={t('admin.type.stockTitle', { shop: shop.name })}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Stack gap="lg">
          <div>
            <ShopTypePicker
              value={choice.key}
              catalogue={choice.catalogue.data?.items}
              includeEmpty={false}
              autoFocus
              disabled={stocking.busy}
              onChange={(key) => {
                choice.setKey(key)
                choice.setExcluded([])
              }}
            />
            {choice.type && (
              <Stack gap="xs" mt="sm">
                <Text size="sm" c="dimmed">
                  {choice.type.description[lang]}
                </Text>
                {choice.all.length > 0 && (
                  <StockReview
                    items={choice.all}
                    excluded={choice.excluded}
                    disabled={stocking.busy}
                    onChange={choice.setExcluded}
                  />
                )}
              </Stack>
            )}
          </div>
          <Dock
            error={
              stocking.error
                ? t(`commerce.error.${stocking.error.code}`)
                : choice.catalogue.isError
                  ? t('admin.type.catalogueError')
                  : null
            }
            step={stocking.step}
            disabled={!ready}
            onSubmit={() => void submit()}
            label={
              choice.type
                ? t('admin.type.stockCount', { count: choice.items.length })
                : t('admin.type.pickFirst')
            }
          />
        </Stack>
      </form>
    </Drawer>
  )
}
