import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Alert, Button, Menu, Radio, Stack, Text, UnstyledButton } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Ellipsis,
  Gift,
  GitMerge,
  Pencil,
  Store,
  Trash2,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { newRequestId } from '@/shared/lib/request-id'
import { localizedDescription } from '@/shared/lib/translations'
import { Drawer, Modal } from '@/shared/ui/overlays'
import { usePhone } from '@/shared/ui/use-viewport'
import { rosterQuery, useDistributeLoot } from '../api'
import type { ItemDefinition } from '../domain/item'
import { ItemIcon } from './item-icon'
import { NoCharacters } from './no-characters'
import { useItemText } from './item-text'
import { Stepper } from './stepper'
import './item-sheet.css'

const maxQuantity = 1000

/**
 * The item sheet of the storeroom: the item read-only, then in one row Give, Edit and a ⋯ menu
 * with the rest. Give swaps the sheet to a short step (quantity, one character) and sends the
 * existing distribute operation for that one item and recipient; the page says the result.
 * A bottom sheet on phones, a dialog from 48em.
 */
export function ItemSheet({
  campaignId,
  item,
  onClose,
  onEdit,
  onShop,
  onMerge,
  onDelete,
  onTemplate,
  onShare,
  onGiven,
}: {
  campaignId: string
  item: ItemDefinition
  onClose: () => void
  onEdit: () => void
  onShop: () => void
  onMerge: () => void
  onDelete: () => void
  onTemplate: () => void
  /** "Share among several": the loot view opens with this item already in it. */
  onShare: () => void
  /** The item reached the character: the page leaves its status line and the sheet closes. */
  onGiven: (character: string, quantity: number) => void
}) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const phone = usePhone()
  const text = useItemText()
  const roster = useQuery(rosterQuery(state.user!.id, campaignId))
  const grant = useDistributeLoot(campaignId)
  const [step, setStep] = useState<'read' | 'give'>('read')
  const [quantity, setQuantity] = useState<number | null>(1)
  const [chosen, setChosen] = useState<string | null>(null)
  const request = useRef({ key: '', id: '' })
  const sending = useRef(false)
  const focused = useRef(false)
  const failure = useRef<HTMLDivElement>(null)
  // The pressed button went busy and dropped focus: the failure is where the keyboard is, and
  // Retry is the next stop.
  const failedAt = grant.isError ? grant.submittedAt : 0
  useEffect(() => {
    if (failedAt) failure.current?.focus()
  }, [failedAt])
  const name = text.nameOf(item)
  const characters = roster.data ?? []
  // Exactly one character: nothing to choose, so it is already chosen.
  const target = chosen ?? (characters.length === 1 ? characters[0]!.id : null)
  const character = characters.find((entry) => entry.id === target)
  const description = localizedDescription(item, i18n.language)
  const facts = text.facts(item)

  // The give step puts focus on the chosen character, else on the first one, once they are there.
  useEffect(() => {
    if (step !== 'give' || focused.current || !roster.data?.length) return
    focused.current = true
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>('.give-chars input:checked, .give-chars input')
        ?.focus({ preventScroll: true }),
    )
  }, [step, roster.data])
  // Nobody to give to: the Give button that had focus is gone, so Back takes it and focus stays in
  // the sheet.
  const nobody = roster.data?.length === 0
  useEffect(() => {
    if (step !== 'give' || !nobody) return
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('.item-sheet-back')?.focus({ preventScroll: true }),
    )
    return () => cancelAnimationFrame(frame)
  }, [step, nobody])

  const give = async () => {
    if (!character || sending.current) return
    const allocations = [
      {
        character_id: character.id,
        definition_id: item.id,
        quantity: quantity ?? 1,
        revision: item.revision,
      },
    ]
    // A retry after a failure repeats the same request, so nothing is delivered twice.
    const key = JSON.stringify(allocations)
    if (request.current.key !== key) request.current = { key, id: newRequestId() }
    sending.current = true
    try {
      await grant.mutateAsync({ allocations, name: null, requestId: request.current.id })
      onGiven(character.name, quantity ?? 1)
    } catch {
      /* The sheet keeps the same payload and request for Retry. */
    } finally {
      sending.current = false
    }
  }
  const known: Record<string, string> = {
    stale: t('loot.changed'),
    gone: t('loot.changed'),
    forbidden: t('inventory.error.forbidden'),
  }
  const definite = grant.error ? known[grant.error.message] : undefined
  const close = () => {
    if (!sending.current) onClose()
  }
  // A change to what is sent starts over: the failure of the last try no longer applies.
  const edited = () => {
    if (grant.isError) grant.reset()
  }
  const backToItem = () => {
    edited()
    setStep('read')
    // The Give button is where the user was: focus returns to it once the item is back.
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('.item-sheet-actions button')?.focus(),
    )
  }

  const read = (
    <Stack gap="md">
      <div className="item-sheet-head">
        <ItemIcon
          icon={item.icon}
          imagePath={item.image_path}
          category={item.category}
          basicKey={item.basic_key}
          viewable
          name={name}
          size={48}
          frame={`store-glyph item-sheet-glyph rarity-${item.rarity}`}
        />
        <p className="item-sheet-line">
          {[text.meta(item), text.price(item)].join(' · ')}
          {item.is_template ? ` · ${t('items.template.mark')}` : ''}
        </p>
      </div>
      {description && (
        <p className="item-sheet-description user-copy preserve-lines">{description}</p>
      )}
      {facts.length > 0 && (
        <ul className="item-sheet-facts" aria-label={t('store.properties')}>
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      )}
      <div className="item-sheet-actions">
        <Button
          size="md"
          leftSection={<Gift size={18} aria-hidden="true" />}
          onClick={() => setStep('give')}
        >
          {t('store.give')}
        </Button>
        <div className="item-sheet-more">
          <Button
            size="md"
            variant="outline"
            leftSection={<Pencil size={18} aria-hidden="true" />}
            onClick={onEdit}
          >
            {t('catalogue.edit')}
          </Button>
          <Menu position="top-end" withinPortal zIndex={400}>
            <Menu.Target>
              <ActionIcon
                variant="default"
                size={44}
                aria-label={t('store.moreFor', { name })}
                title={t('common.moreActions')}
              >
                <Ellipsis size={20} aria-hidden="true" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {(item.origin !== 'player' || item.value_gp !== null) && (
                <Menu.Item leftSection={<Store size={18} aria-hidden="true" />} onClick={onShop}>
                  {t('catalogue.addToShop')}
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={
                  item.is_template ? (
                    <BookmarkCheck size={18} aria-hidden="true" />
                  ) : (
                    <Bookmark size={18} aria-hidden="true" />
                  )
                }
                onClick={onTemplate}
              >
                {t(item.is_template ? 'items.template.remove' : 'items.template.add')}
              </Menu.Item>
              <Menu.Item leftSection={<GitMerge size={18} aria-hidden="true" />} onClick={onMerge}>
                {t('items.merge.open')}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="var(--danger)"
                leftSection={<Trash2 size={18} aria-hidden="true" />}
                onClick={onDelete}
              >
                {t('store.delete')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>
    </Stack>
  )

  const giving =
    roster.data?.length === 0 ? (
      <Stack gap="md">
        <BackToItem onBack={backToItem} />
        <NoCharacters campaignId={campaignId} />
      </Stack>
    ) : (
      <Stack gap="md">
        <BackToItem onBack={backToItem} disabled={grant.isPending} />
        <Stepper
          label={t('inventory.card.amount')}
          value={quantity}
          min={1}
          max={maxQuantity}
          required
          disabled={grant.isPending}
          onChange={(next) => {
            edited()
            setQuantity(next)
          }}
        />
        {roster.isPending && <Text role="status">{t('common.loading')}</Text>}
        {roster.isError && (
          <Alert color="red" role="alert">
            {t('query.error')}{' '}
            <Button variant="subtle" onClick={() => void roster.refetch()}>
              {t('common.retry')}
            </Button>
          </Alert>
        )}
        {characters.length > 0 && (
          <Radio.Group
            value={target}
            onChange={(next) => {
              edited()
              setChosen(next)
            }}
            label={t('store.giveWho')}
            classNames={{ label: 'give-who' }}
          >
            <div className="give-chars">
              {characters.map((entry) => (
                <Radio
                  key={entry.id}
                  value={entry.id}
                  label={entry.name}
                  disabled={grant.isPending}
                  classNames={{ root: 'give-char', label: 'user-copy' }}
                />
              ))}
            </div>
          </Radio.Group>
        )}
        {grant.isError && (
          <Alert ref={failure} tabIndex={-1} color="red" role="alert">
            {definite ?? t('loot.retry')}
          </Alert>
        )}
        <Button
          size="md"
          fullWidth
          loading={grant.isPending}
          disabled={!character || Boolean(definite)}
          onClick={() => void give()}
        >
          {grant.isError && !definite
            ? t('common.retry')
            : character
              ? t('store.giveTo', { name: character.name })
              : t('store.giveChoose')}
        </Button>
        <UnstyledButton className="quiet-link item-sheet-share" onClick={onShare}>
          <Users size={16} aria-hidden="true" />
          {t('store.giveSeveral')}
        </UnstyledButton>
      </Stack>
    )

  const title = step === 'give' ? t('store.giveTitle', { name }) : name
  const body = step === 'give' ? giving : read
  return phone ? (
    <Drawer
      opened
      onClose={close}
      returnFocus={false}
      position="bottom"
      size="auto"
      title={title}
      closeOnEscape={!grant.isPending}
      closeOnClickOutside={!grant.isPending}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
      classNames={{ title: 'item-sheet-title user-copy' }}
    >
      {body}
    </Drawer>
  ) : (
    <Modal
      opened
      onClose={close}
      returnFocus={false}
      centered
      size="md"
      title={title}
      closeOnEscape={!grant.isPending}
      closeOnClickOutside={!grant.isPending}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
      classNames={{ title: 'item-sheet-title user-copy' }}
    >
      {body}
    </Modal>
  )
}

/** The give step's way back to the item, as the loot picker has it. */
function BackToItem({ onBack, disabled }: { onBack: () => void; disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <Button
      variant="subtle"
      className="item-sheet-back"
      w="fit-content"
      leftSection={<ArrowLeft size={16} aria-hidden="true" />}
      disabled={disabled}
      onClick={onBack}
    >
      {t('common.back')}
    </Button>
  )
}
