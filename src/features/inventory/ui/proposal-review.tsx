import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { Drawer } from '@/shared/ui/overlays'
import { useWindowEvent } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, GitMerge, Hammer, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { formatGp } from '@/shared/lib/money'
import { newRequestId } from '@/shared/lib/request-id'
import { StatusRail } from '@/shared/ui/rail-line'
import { localizedDescription, localizedName } from '@/shared/lib/translations'
import { usePhone } from '@/shared/ui/use-viewport'
import { proposalsQuery, useResolveProposal } from '../api'
import type { Resolution } from '../data/repository'
import { proposalToDraft, sortProposals, type ItemProposal } from '../domain/catalogue'
import { draftIssue, type DefinitionDraft, type ItemDefinition } from '../domain/item'
import { Forge } from './forge'
import { ItemIcon } from './item-icon'
import { statusGlyphs } from './item-visuals'
import { PickList } from './pick-list'
import { Stepper } from './stepper'
import { useWeightFormat } from './use-weight'
import './catalogue.css'

type Step = 'detail' | 'merge' | 'reject'
const resolveErrors: Record<string, string> = {
  stale: 'items.review.stale',
  closed: 'items.review.closed',
  gone: 'items.merge.gone',
  cents: 'inventory.error.cents',
}

/** The draft sent to `resolve_item_proposal`: definition fields and the DM's price. */
const acceptDraft = (draft: DefinitionDraft) => ({
  name: draft.name,
  description: draft.description,
  ...(draft.translations ? { translations: draft.translations } : {}),
  category: draft.category,
  icon: draft.icon,
  rarity: draft.rarity,
  slot_kind: draft.slot_kind,
  properties: draft.properties,
  weight_lb: draft.weight_lb,
  value_gp: draft.value_gp,
})

/**
 * RYT-105 DM review of Player proposals, from the storeroom. A proposal opens on its card: edit it
 * in the forge and accept (creates the item and gives it), merge it into an existing item, or
 * reject it with a note the Player reads beside their satchel.
 */
export function ProposalReview({
  campaignId,
  items,
  onClose,
  onNotice,
}: {
  campaignId: string
  /** Live storeroom items, for merging a proposal into one. */
  items: ItemDefinition[]
  onClose: () => void
  onNotice: (message: string) => void
}) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const phone = usePhone()
  const { format } = useWeightFormat()
  /** Who the proposal is for, for the list row; a Player named like their character is not repeated. */
  const proposedFor = (p: ItemProposal) => {
    const character = p.character_name ?? ''
    const player = p.proposer_name ?? ''
    return !player || player.toLocaleLowerCase() === character.toLocaleLowerCase()
      ? t('items.review.fromOne', { character })
      : t('items.review.from', { character, player })
  }
  const query = useQuery(proposalsQuery(state.user!.id, campaignId, null))
  const resolve = useResolveProposal(campaignId)
  const [openId, setOpenId] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('detail')
  const [forging, setForging] = useState(false)
  const [note, setNote] = useState('')
  const [quantity, setQuantity] = useState<number | null>(1)
  /** The last answer given while other proposals still wait, said on the list in view. */
  const [result, setResultState] = useState<{ text: string; serial: number } | null>(null)
  const resultSerial = useRef(0)
  const setResult = (text: string | null) =>
    setResultState(text === null ? null : { text, serial: ++resultSerial.current })
  const [target, setTarget] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const requests = useRef(new Map<string, string>())
  const listHeading = useRef<HTMLHeadingElement>(null)
  const headword = useRef<HTMLHeadingElement>(null)
  const mergeLink = useRef<HTMLButtonElement>(null)
  const rejectLink = useRef<HTMLButtonElement>(null)
  const stepField = useRef<HTMLElement | null>(null)
  const holdStepField = (node: HTMLElement | null) => {
    stepField.current = node
  }
  /** Focus follows every step change: the drawer's own autofocus only runs when it opens. */
  const focusSoon = (target: { current: HTMLElement | null }) =>
    requestAnimationFrame(() => target.current?.focus())
  const sorted = useMemo(() => sortProposals(query.data ?? []), [query.data])
  const pending = sorted.filter((p) => p.status === 'pending')
  const closed = sorted.filter((p) => p.status !== 'pending' && p.status !== 'cancelled')
  const proposal = sorted.find((p) => p.id === openId) ?? null
  // A proposal with a blank name still has a heading and a row to open it from.
  const nameOf = (p: ItemProposal) =>
    localizedName(p.draft, i18n.language).trim() || t('store.noProposalName')
  const open = (p: ItemProposal) => {
    resolve.reset()
    setResult(null)
    setOpenId(p.id)
    setStep('detail')
    setNote('')
    setQuantity(p.quantity)
    setTarget(null)
    setSearch('')
    focusSoon(headword)
  }
  // One proposal waiting: opening the review lands on its card, so accepting it is the next tap.
  const [landed, setLanded] = useState<'no' | 'list' | 'card'>('no')
  if (landed === 'no' && query.data) {
    const only = pending.length === 1 ? pending[0]! : null
    setLanded(only ? 'card' : 'list')
    if (only) {
      setOpenId(only.id)
      setQuantity(only.quantity)
    }
  }
  useEffect(() => {
    if (landed === 'card') headword.current?.focus()
  }, [landed])
  const goTo = (next: Step) => {
    const from = step
    setStep(next)
    focusSoon(next === 'detail' ? (from === 'merge' ? mergeLink : rejectLink) : stepField)
  }
  // Escape inside a step goes back to the proposal (the typed note stays); on the detail and the
  // list it closes the drawer as usual.
  const inStep = Boolean(openId) && step !== 'detail'
  useWindowEvent(
    'keydown',
    (event) => {
      if (!inStep || event.key !== 'Escape' || event.isComposing || resolve.isPending) return
      event.preventDefault()
      goTo('detail')
    },
    { capture: true },
  )
  const back = () => {
    setOpenId(null)
    requestAnimationFrame(() => listHeading.current?.focus())
  }
  const decide = (p: ItemProposal, decision: Resolution, message: string) => {
    if (resolve.isPending) return
    const payload = { ...decision, note }
    const key = JSON.stringify([p.id, p.revision, payload])
    if (!requests.current.has(key)) requests.current.set(key, newRequestId())
    resolve.mutate(
      {
        proposal: { id: p.id, revision: p.revision },
        decision: payload,
        requestId: requests.current.get(key)!,
      },
      {
        onSuccess: () => {
          setForging(false)
          // The last proposal closes the view and the storeroom list says it; otherwise the
          // list of what is left says it.
          if (pending.every((entry) => entry.id === p.id)) {
            onNotice(message)
            onClose()
          } else {
            setResult(message)
            back()
          }
        },
      },
    )
  }
  const errorKey = resolve.error
    ? (resolveErrors[resolve.error.message] ?? 'items.review.error')
    : null
  /** The draft the forge would send untouched; direct accept is offered only when it is valid. */
  const proposed = proposal ? proposalToDraft(proposal.draft, true) : null
  const issue = proposed ? draftIssue(proposed) : null
  const acceptNow = (p: ItemProposal) =>
    decide(
      p,
      {
        resolution: 'accept',
        draft: acceptDraft(proposalToDraft(p.draft, true)),
        quantity: p.quantity,
      },
      t('items.review.accepted', { name: nameOf(p), character: p.character_name ?? '' }),
    )
  const merged = items.find((item) => item.id === target) ?? null
  const candidates = items
    .filter((item) => !item.archived)
    .filter((item) =>
      [item.name, localizedName(item, i18n.language)].some((label) =>
        label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
      ),
    )
    .sort((a, b) => localizedName(a, i18n.language).localeCompare(localizedName(b, i18n.language)))

  if (forging && proposal)
    return (
      <Forge
        campaignId={campaignId}
        definition={null}
        initial={proposalToDraft(proposal.draft, true)}
        mode="dm"
        targets={[]}
        initialAmount={proposal.quantity}
        amountLabel={t('items.review.quantity', { name: proposal.character_name ?? '' })}
        title={t('items.review.forgeTitle', { name: nameOf(proposal) })}
        submitLabel={t('items.review.accept', { name: proposal.character_name ?? '' })}
        pending={resolve.isPending}
        error={errorKey ? t(errorKey as 'items.review.error') : null}
        onClose={() => {
          if (resolve.isPending) return
          resolve.reset()
          setForging(false)
        }}
        onSave={(draft, extra) =>
          decide(
            proposal,
            { resolution: 'accept', draft: acceptDraft(draft), quantity: extra.amount },
            t('items.review.accepted', {
              name: draft.name,
              character: proposal.character_name ?? '',
            }),
          )
        }
      />
    )

  const row = (p: ItemProposal) => {
    const Glyph = statusGlyphs[p.status]
    return (
      <li key={p.id}>
        <UnstyledButton className="review-row" onClick={() => open(p)}>
          <span className={`store-glyph rarity-${p.draft.rarity}`} aria-hidden="true">
            <ItemIcon icon={p.draft.icon} size={22} />
          </span>
          <span className="store-row-body">
            <span className="store-row-name user-copy">
              {nameOf(p)} <span className="proposal-qty">×{p.quantity}</span>
            </span>
            <span className="store-row-meta">
              {p.status === 'pending' ? proposedFor(p) : t(`items.proposals.status.${p.status}`)}
            </span>
          </span>
          {p.status === 'pending' ? (
            <ChevronRight size={18} aria-hidden="true" />
          ) : (
            <Glyph size={16} aria-hidden="true" />
          )}
        </UnstyledButton>
      </li>
    )
  }

  return (
    <Drawer
      opened
      returnFocus={false}
      closeOnEscape={!inStep}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '92%' : 520}
      title={t('items.review.title')}
      onClose={() => !resolve.isPending && onClose()}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      {/* Mounted for both views, so a message set as the list returns is announced. */}
      <StatusRail className="review-result" text={result?.text ?? null} serial={result?.serial} />
      {!proposal && (
        <Stack gap="md">
          {query.isPending && <Text role="status">{t('common.loading')}</Text>}
          {query.isError && (
            <Alert color="red" role="alert">
              {query.error.message === 'forbidden' ? t('items.review.forbidden') : t('query.error')}{' '}
              <Button variant="subtle" onClick={() => void query.refetch()}>
                {t('common.retry')}
              </Button>
            </Alert>
          )}
          {query.data && (
            <>
              <Title order={3} ref={listHeading} tabIndex={-1} className="shelf-title">
                {t('items.review.pending', { count: pending.length })}
              </Title>
              {pending.length > 0 && <ul className="review-list">{pending.map(row)}</ul>}
              {closed.length > 0 && (
                <>
                  <Title order={3} className="shelf-title">
                    {t('items.review.recent')}
                  </Title>
                  <ul className="review-list">{closed.slice(0, 10).map(row)}</ul>
                </>
              )}
            </>
          )}
        </Stack>
      )}
      {proposal && (
        <Stack gap="md">
          <Button
            variant="subtle"
            w="fit-content"
            leftSection={<ArrowLeft size={16} aria-hidden="true" />}
            disabled={resolve.isPending}
            onClick={() => (step === 'detail' ? back() : goTo('detail'))}
          >
            {step === 'detail' ? t('items.review.back') : t('common.back')}
          </Button>
          <article className={`item-card rarity-${proposal.draft.rarity}`}>
            <header className="item-card-head">
              <ItemIcon icon={proposal.draft.icon} size={40} frame="item-card-icon" />
              <div>
                <h3
                  ref={headword}
                  className="item-card-name user-copy"
                  data-autofocus
                  tabIndex={-1}
                >
                  {nameOf(proposal)}
                </h3>
                <Text size="sm" className="item-card-rarity">
                  {t(`inventory.rarity.${proposal.draft.rarity}`)} ·{' '}
                  {t(`inventory.category.${proposal.draft.category}`)} · ×{proposal.quantity}
                </Text>
              </div>
            </header>
            <dl className="item-card-facts">
              <div>
                <dt>{t('items.review.for')}</dt>
                <dd className="user-copy">
                  {[proposal.character_name, proposal.proposer_name]
                    .filter(
                      (name, at, all) =>
                        name &&
                        all.findIndex((x) => x?.toLowerCase() === name.toLowerCase()) === at,
                    )
                    .join(' · ')}
                </dd>
              </div>
              <div>
                <dt>{t('inventory.card.weight')}</dt>
                <dd>{format(proposal.draft.weight_lb, 3)}</dd>
              </div>
              <div>
                <dt>{t('items.review.suggested')}</dt>
                <dd>
                  {proposal.draft.suggested_value_gp === undefined
                    ? t('items.review.noSuggestion')
                    : t('store.value', {
                        value: formatGp(proposal.draft.suggested_value_gp, i18n.language),
                      })}
                </dd>
              </div>
            </dl>
            {localizedDescription(proposal.draft, i18n.language) && (
              <Text size="sm" className="item-card-description user-copy preserve-lines">
                {localizedDescription(proposal.draft, i18n.language)}
              </Text>
            )}
            {proposal.status !== 'pending' && (
              <Text size="sm" role="status">
                {t(`items.proposals.status.${proposal.status}`)}
                {proposal.dm_note ? ` · ${proposal.dm_note}` : ''}
              </Text>
            )}
          </article>
          {errorKey && step === 'detail' && (
            <Alert color="red" role="alert">
              {t(errorKey as 'items.review.error')}
            </Alert>
          )}
          {proposal.status === 'pending' && step === 'detail' && (
            <Stack gap="sm">
              {issue ? (
                <Text size="sm" c="dimmed">
                  {t(issue === 'name' ? 'items.review.needsName' : 'items.review.needsDice')}
                </Text>
              ) : (
                <Button
                  size="md"
                  aria-disabled={resolve.isPending || undefined}
                  aria-busy={resolve.isPending}
                  leftSection={resolve.isPending ? <Loader size={16} /> : undefined}
                  onClick={() => acceptNow(proposal)}
                >
                  {t('items.review.acceptNow', { name: proposal.character_name ?? '' })}
                </Button>
              )}
              <Button
                size="md"
                variant={issue ? 'filled' : 'outline'}
                leftSection={<Hammer size={18} aria-hidden="true" />}
                onClick={() => {
                  resolve.reset()
                  setForging(true)
                }}
              >
                {t('items.review.edit')}
              </Button>
              <Group gap="xs" justify="space-between">
                <UnstyledButton
                  ref={mergeLink}
                  className="quiet-link"
                  onClick={() => goTo('merge')}
                >
                  <GitMerge size={16} aria-hidden="true" />
                  {t('items.review.mergeOpen')}
                </UnstyledButton>
                <UnstyledButton
                  ref={rejectLink}
                  className="quiet-link danger"
                  onClick={() => goTo('reject')}
                >
                  <X size={16} aria-hidden="true" />
                  {t('items.review.rejectOpen')}
                </UnstyledButton>
              </Group>
            </Stack>
          )}
          {proposal.status === 'pending' && step === 'merge' && (
            <Stack gap="sm">
              <TextInput
                label={t('items.review.mergeGroup')}
                leftSection={<Search size={16} aria-hidden="true" />}
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                ref={holdStepField}
                data-autofocus
              />
              {candidates.length === 0 ? (
                <Text c="dimmed">{t('store.noMatch')}</Text>
              ) : (
                <PickList
                  label={t('items.review.mergeGroup')}
                  selected={target}
                  onPick={setTarget}
                  disabled={resolve.isPending}
                  entries={candidates.map((item) => ({
                    id: item.id,
                    name: localizedName(item, i18n.language),
                    meta: t(`inventory.category.${item.category}`),
                    icon: item.icon,
                    imagePath: item.image_path,
                    rarity: item.rarity,
                  }))}
                />
              )}
              <Stepper
                label={t('items.review.quantity', { name: proposal.character_name ?? '' })}
                min={1}
                max={1000}
                value={quantity}
                onChange={setQuantity}
              />
              <Textarea
                autosize
                minRows={2}
                maxLength={500}
                label={t('items.review.note')}
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
              />
            </Stack>
          )}
          {proposal.status === 'pending' && step === 'reject' && (
            <Textarea
              autosize
              minRows={2}
              maxLength={500}
              ref={holdStepField}
              data-autofocus
              label={t('items.review.reason')}
              description={t('items.review.reasonHint')}
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
            />
          )}
          {errorKey && step !== 'detail' && (
            <Alert color="red" role="alert">
              {t(errorKey as 'items.review.error')}
            </Alert>
          )}
          {proposal.status === 'pending' && step === 'merge' && (
            <div className="pick-dock">
              <Button
                size="lg"
                fullWidth
                disabled={!merged && !resolve.isPending}
                aria-disabled={resolve.isPending || !merged || undefined}
                aria-busy={resolve.isPending}
                leftSection={resolve.isPending ? <Loader size={16} /> : undefined}
                onClick={() =>
                  merged &&
                  decide(
                    proposal,
                    { resolution: 'merge', definitionId: merged.id, quantity: quantity ?? 1 },
                    t('items.review.merged', {
                      name: localizedName(merged, i18n.language),
                      character: proposal.character_name ?? '',
                    }),
                  )
                }
              >
                {merged
                  ? t('items.review.mergeConfirm', {
                      name: localizedName(merged, i18n.language),
                      count: quantity ?? 1,
                    })
                  : t('items.review.mergePickFirst')}
              </Button>
            </div>
          )}
          {proposal.status === 'pending' && step === 'reject' && (
            <Group justify="flex-end">
              <Button
                color="red"
                variant="light"
                size="md"
                aria-busy={resolve.isPending}
                aria-disabled={resolve.isPending || undefined}
                leftSection={resolve.isPending ? <Loader size={16} /> : undefined}
                onClick={() =>
                  decide(
                    proposal,
                    { resolution: 'reject' },
                    t('items.review.rejected', { name: nameOf(proposal) }),
                  )
                }
              >
                {t('items.review.rejectConfirm')}
              </Button>
            </Group>
          )}
        </Stack>
      )}
    </Drawer>
  )
}
