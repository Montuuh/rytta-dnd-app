import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { GlossaryTerm, GlossaryText, glossaryIds } from '@/features/glossary'
import { ActionIcon, Alert, Drawer, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core'
import { DrawerRoot } from '@/shared/ui/overlays'
import { usePhone } from '@/shared/ui/use-viewport'
import {
  ArrowLeftRight,
  ChevronDown,
  Ellipsis,
  Gift,
  Hand,
  Pencil,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useItemOffer } from '@/shared/lib/item-offer'
import { formatGp } from '@/shared/lib/money'
import { localizedDescription, localizedName } from '@/shared/lib/translations'
import { slotsFor } from '../domain/equipment'
import {
  isUsable,
  unitPounds,
  UNDO_WINDOW_MS,
  type ItemDefinition,
  type ItemStack,
} from '../domain/item'
import { useWeightFormat } from './use-weight'
import { HoldSeal } from './hold-seal'
import { ItemIcon } from './item-icon'
import { Stepper } from './stepper'
import { useFuseLeft } from './use-fuse-left'

export type CardActions = {
  use: () => void
  remove: (amount: number) => void
  equip: () => void
  grant: (amount: number) => void
  edit: () => void
}

/** The parchment "trading card" for one stack. Actions are seals and quiet links, not buttons. */
export function ItemCard({
  stack,
  total,
  definition,
  canEdit,
  dm,
  pending,
  actions,
  error,
  undo,
  onClose,
}: {
  stack: ItemStack
  /** Units of this item in the satchel, across stacks (the tile shows them as one). */
  total: number
  definition: ItemDefinition
  canEdit: boolean
  dm: boolean
  pending: boolean
  actions: CardActions
  error: string | null
  /** The latest undoable change; `used` marks a use of this very stack. */
  undo: {
    message: string
    used: boolean
    startedAt: number
    onUndo: () => void
    onExpire: () => void
  } | null
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { format } = useWeightFormat()
  const phone = usePhone()
  const [amount, setAmount] = useState<number | null>(1)
  // RYT-149: discarding and sharing open under the seal, one at a time.
  const [panel, setPanel] = useState<'discard' | 'offer' | 'give' | null>(null)
  const [shareAmount, setShareAmount] = useState<number | null>(1)
  const discardId = useId()
  const discardBody = useRef<HTMLDivElement>(null)
  const shareHeading = useRef<HTMLHeadingElement>(null)
  const offers = useItemOffer()
  const usedRevision = useRef<number | null>(null)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  // A failed request leaves the stack unchanged, so the same revision may be used again.
  useEffect(() => {
    if (error) usedRevision.current = null
  }, [error])
  // The DM's field also grants, so it only stops at 1000; a Player can only discard what the stack holds.
  const limit = dm ? 1000 : stack.quantity
  const count = Math.min(amount ?? 1, limit)
  // What "Discard" will take is never more than the stack, so the button says exactly that.
  const discard = Math.min(count, stack.quantity)
  const props = definition.properties
  const name = localizedName(definition, i18n.language)
  const description = localizedDescription(definition, i18n.language)
  const facts: [string, ReactNode][] = [
    [t('inventory.card.weight'), format(unitPounds(definition), 3)],
    [t('inventory.card.category'), t(`inventory.category.${definition.category}`)],
  ]
  // RYT-104: what one unit gives when used, and what a container holds. Units a Player added
  // by themselves never feed supplies or lighten the load, so their card does not promise it.
  if (stack.source !== 'player' && (props.rations || props.water))
    facts.push([
      t('items.supplies.perUnit'),
      [
        props.rations ? t('items.supplies.rationsEach', { count: props.rations }) : null,
        props.water ? t('items.supplies.waterEach', { count: props.water }) : null,
      ]
        .filter(Boolean)
        .join(' · '),
    ])
  if (props.container)
    facts.push([
      t('items.container.holds'),
      props.container.loadReductionPercent
        ? t(
            stack.source === 'player'
              ? 'items.container.holdsUnearned'
              : 'items.container.holdsReduced',
            {
              weight: format(props.container.capacityLb, 1),
              percent: props.container.loadReductionPercent,
            },
          )
        : format(props.container.capacityLb, 1),
    ])
  if (props.base !== undefined)
    facts.push([
      t('inventory.card.armor'),
      props.dexCap === 0
        ? String(props.base)
        : typeof props.dexCap === 'number'
          ? t('inventory.card.armorCapped', { base: props.base, cap: props.dexCap })
          : t('inventory.card.armorDex', { base: props.base }),
    ])
  const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`
  if (props.acBonus !== undefined && (definition.category === 'shield' || props.acBonus !== 0))
    facts.push([
      definition.category === 'shield' ? t('inventory.card.shield') : t('inventory.forge.acBonus'),
      signed(props.acBonus),
    ])
  if (props.attackBonus) facts.push([t('inventory.forge.attackBonus'), signed(props.attackBonus)])
  if (props.damageBonus) facts.push([t('inventory.forge.damageBonus'), signed(props.damageBonus)])
  if (props.speedBonus)
    facts.push([
      t('inventory.forge.speedBonus'),
      `${signed(props.speedBonus)} ${t('inventory.card.feet')}`,
    ])
  if (props.dice)
    facts.push([
      t('inventory.card.damage'),
      <>
        {props.dice}
        {props.versatileDice ? ` (${props.versatileDice})` : ''}
        {props.damageType && (
          <>
            {' '}
            <GlossaryTerm id={glossaryIds.damage(props.damageType)}>
              {t(`inventory.damage.${props.damageType}`)}
            </GlossaryTerm>
          </>
        )}
      </>,
    ])
  // RYT-008: weapon properties link to their SRD rules.
  const properties: [string, string][] = []
  if (props.finesse) properties.push(['finesse', t('inventory.forge.finesse')])
  if (props.thrown) properties.push(['thrown', t('glossary.property.thrown')])
  if (props.versatileDice) properties.push(['versatile', t('glossary.property.versatile')])
  if (definition.slot_kind === 'two_hands' && props.dice)
    properties.push(['two-handed', t('glossary.property.twoHanded')])
  if (properties.length)
    facts.push([
      t('glossary.weaponProperties'),
      properties.map(([key, label], index) => (
        <span key={key}>
          {index > 0 && ', '}
          <GlossaryTerm id={glossaryIds.property(key)}>{label}</GlossaryTerm>
        </span>
      )),
    ])
  if (props.range)
    facts.push([t('inventory.card.range'), `${props.range} ${t('inventory.card.feet')}`])
  if (props.stealthDisadvantage)
    facts.push([
      t('inventory.card.stealth'),
      <GlossaryTerm key="stealth" id="rule.disadvantage">
        {t('inventory.card.disadvantage')}
      </GlossaryTerm>,
    ])
  if (dm && definition.value_gp !== null)
    facts.push([
      t('inventory.card.value'),
      `${formatGp(definition.value_gp, i18n.language)} ${t('inventory.card.gp')}`,
    ])
  const equippable = slotsFor(definition.slot_kind).length > 0
  const usable = isUsable(definition.category)
  // What one unit gives, when the item says so in numbers; the seal spends exactly one.
  const effect =
    usable && stack.source !== 'player' && (props.rations || props.water)
      ? [
          props.rations ? t('items.supplies.rationsEach', { count: props.rations }) : null,
          props.water ? t('items.supplies.waterEach', { count: props.water }) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null
  // Offer and Give need someone to trade with, so they only exist where the viewer acts as the
  // card's character; an equipped stack is not tradeable.
  const sharing =
    canEdit && !dm && offers !== null && offers.partners.length > 0 && !stack.equipped_slot
  const shareLimit = stack.quantity
  const shareCount = Math.min(shareAmount ?? 1, shareLimit)
  // Focus moves once the panel is on screen and the menu has handed focus back to its trigger.
  const focusTarget = useRef<'discard' | 'share' | 'menu' | null>(null)
  useEffect(() => {
    const target = focusTarget.current
    if (!target) return
    focusTarget.current = null
    const id = window.setTimeout(() => {
      const element =
        target === 'discard'
          ? (discardBody.current?.querySelector<HTMLElement>('input') ??
            discardBody.current?.querySelector<HTMLElement>('button'))
          : target === 'share'
            ? shareHeading.current
            : menuTrigger.current
      element?.focus()
      element?.scrollIntoView({ block: 'nearest' })
    }, 0)
    return () => window.clearTimeout(id)
  }, [panel])
  // A chosen menu item hands focus to its panel instead of back to the menu button.
  const [handOff, setHandOff] = useState(false)
  // Escape inside the menu closes only the menu, never the card under it.
  const [menuOpen, setMenuOpen] = useState(false)
  const open = (next: typeof panel) => {
    setHandOff(true)
    focusTarget.current = next === 'discard' ? 'discard' : next ? 'share' : null
    setPanel(next)
  }
  const closeShare = () => {
    focusTarget.current = 'menu'
    setPanel(null)
  }
  const waitingFor =
    offers?.waiting?.itemId === stack.id
      ? offers.partners.find((p) => p.id === offers.waiting?.partnerId)?.name
      : undefined
  const discardControls = (
    <>
      {(dm || stack.quantity > 1) && (
        <div className="item-card-amount">
          <Stepper
            label={t(dm ? 'inventory.card.amount' : 'inventory.card.discardCount')}
            min={1}
            max={limit}
            required
            longPress
            value={Math.min(amount ?? 1, limit)}
            maxMessage={
              dm
                ? undefined
                : t(
                    total > stack.quantity
                      ? 'inventory.card.onlyInStack'
                      : 'inventory.card.onlyHave',
                    { count: stack.quantity },
                  )
            }
            onChange={setAmount}
          />
          {stack.quantity > 1 && (
            <UnstyledButton
              className="quiet-link item-card-all"
              aria-disabled={pending || undefined}
              onClick={() => setAmount(stack.quantity)}
            >
              {t('inventory.card.all', { count: stack.quantity })}
            </UnstyledButton>
          )}
        </div>
      )}
    </>
  )
  return (
    <DrawerRoot
      opened
      onClose={onClose}
      closeOnEscape={!menuOpen}
      position={phone ? 'bottom' : 'right'}
      size={phone ? 'auto' : 420}
      classNames={{ content: 'item-card-drawer' }}
    >
      <Drawer.Overlay />
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>
            <span className="user-copy">{name}</span>
          </Drawer.Title>
          <Group gap={4} wrap="nowrap" className="item-card-tools">
            {sharing && (
              <Menu
                position="bottom-end"
                withinPortal
                shadow="md"
                withInitialFocusPlaceholder={false}
                returnFocus={!handOff}
                opened={menuOpen}
                onChange={setMenuOpen}
                onOpen={() => setHandOff(false)}
              >
                <Menu.Target>
                  <ActionIcon
                    ref={menuTrigger}
                    variant="subtle"
                    color="gray"
                    size={44}
                    aria-label={t('inventory.card.more')}
                  >
                    <Ellipsis size={22} aria-hidden="true" />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown className="item-card-menu" aria-label={t('inventory.card.more')}>
                  <Menu.Item
                    className="item-card-menu-danger"
                    leftSection={<Trash2 size={18} aria-hidden="true" />}
                    onClick={() => open('discard')}
                  >
                    {t('inventory.card.discardOpen')}
                  </Menu.Item>
                  {sharing && (
                    <Menu.Item
                      leftSection={<ArrowLeftRight size={18} aria-hidden="true" />}
                      onClick={() => open('offer')}
                    >
                      {t('inventory.card.offerTo')}
                    </Menu.Item>
                  )}
                  {sharing && (
                    <Menu.Item
                      leftSection={<Gift size={18} aria-hidden="true" />}
                      onClick={() => open('give')}
                    >
                      {t('inventory.card.giveTo')}
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
            <Drawer.CloseButton aria-label={t('common.close')} size={44} />
          </Group>
        </Drawer.Header>
        <Drawer.Body>
          <article
            className={`item-card rarity-${definition.rarity}`}
            aria-labelledby="item-card-name"
          >
            <header className="item-card-head">
              <ItemIcon
                icon={definition.icon}
                imagePath={definition.image_path}
                category={definition.category}
                size={40}
                viewable
                name={name}
                frame="item-card-icon"
              />
              <div>
                {/* The drawer's title shows the name; this heading names the article for readers. */}
                <h3 id="item-card-name" className="item-card-name user-copy visually-hidden">
                  {name}
                </h3>
                <Text size="sm" className="item-card-rarity">
                  {t(`inventory.rarity.${definition.rarity}`)} · ×{stack.quantity}
                  {total > stack.quantity && ` · ${t('inventory.card.inTotal', { count: total })}`}
                </Text>
              </div>
            </header>
            <dl className="item-card-facts">
              {facts.map(([label, value]) => (
                // A sentence-long value takes the whole row instead of wrapping to six lines in a
                // half-width tile at large text (RYT-108).
                <div
                  key={label}
                  className={typeof value === 'string' && value.length > 28 ? 'is-wide' : undefined}
                >
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {description && (
              <Text size="sm" className="item-card-description user-copy preserve-lines">
                <GlossaryText text={description} />
              </Text>
            )}
            {error && (
              <Alert color="red" role="alert" mb="sm">
                {error}
              </Alert>
            )}
            {canEdit && (
              <Stack gap="md" className="item-card-actions">
                {usable && (
                  <p className="item-card-effect">
                    {effect && <span className="user-copy">{effect}</span>}
                    <small>{t('inventory.card.spends', { count: stack.quantity })}</small>
                  </p>
                )}
                <Group justify="center" gap="xl">
                  {usable && (
                    <HoldSeal
                      label={t('inventory.card.useLabel', {
                        name,
                        left: stack.quantity - 1,
                      })}
                      hint={t('inventory.card.holdToUse')}
                      confirmLabel={t('inventory.card.useNow')}
                      disabled={pending}
                      onConfirm={() => {
                        // A double tap (two activations before the stack reloads) spends one
                        // unit, not two: the second would only repeat the same revision.
                        if (pending || usedRevision.current === stack.revision) return
                        usedRevision.current = stack.revision
                        actions.use()
                      }}
                    >
                      <ItemIcon
                        icon={definition.icon}
                        imagePath={definition.image_path}
                        size={26}
                      />
                      <span>{t('inventory.card.use')}</span>
                    </HoldSeal>
                  )}
                  {equippable && (
                    <UnstyledButton
                      className="socket-action"
                      aria-disabled={pending || undefined}
                      onClick={() => !pending && actions.equip()}
                    >
                      <span className="socket-ring" aria-hidden="true">
                        <Hand size={22} />
                      </span>
                      <span>{t('inventory.card.equip')}</span>
                    </UnstyledButton>
                  )}
                </Group>
                <div aria-live="polite" className="item-card-live">
                  {undo && !error && (
                    <CardResult
                      text={
                        undo.used
                          ? t('inventory.card.usedLeft', { count: stack.quantity })
                          : undo.message
                      }
                      startedAt={undo.startedAt}
                      pending={pending}
                      onUndo={undo.onUndo}
                      onExpire={undo.onExpire}
                    />
                  )}
                  {waitingFor && (
                    <Text size="sm" className="item-card-waiting user-copy">
                      {t('inventory.share.waiting', { name: waitingFor })}
                    </Text>
                  )}
                </div>
                {(panel === 'offer' || panel === 'give') && offers && (
                  <section className="item-card-share" aria-labelledby={`${discardId}-share`}>
                    <h4
                      id={`${discardId}-share`}
                      ref={shareHeading}
                      tabIndex={-1}
                      className="item-card-share-title user-copy"
                    >
                      {t(
                        panel === 'give'
                          ? 'inventory.share.giveTitle'
                          : 'inventory.share.offerTitle',
                        { name },
                      )}
                    </h4>
                    {panel === 'give' && (
                      <Text size="sm" c="dimmed">
                        {t('inventory.share.giveNote')}
                      </Text>
                    )}
                    {shareLimit > 1 && (
                      <Stepper
                        label={t('inventory.share.count')}
                        min={1}
                        max={shareLimit}
                        required
                        longPress
                        value={shareCount}
                        maxMessage={t('inventory.card.onlyInStack', { count: shareLimit })}
                        onChange={setShareAmount}
                      />
                    )}
                    <div
                      role="group"
                      aria-label={t('inventory.share.to')}
                      className="item-card-partners"
                    >
                      {offers.partners.map((partner) => {
                        const reason =
                          offers.waiting?.partnerId === partner.id
                            ? t('inventory.share.waitingShort')
                            : offers.waiting
                              ? t('trade.otherOpen')
                              : offers.tradingWith && offers.tradingWith !== partner.id
                                ? t('trade.otherOpen')
                                : partner.busy && offers.tradingWith !== partner.id
                                  ? t('trade.partnerIsBusy', { name: partner.name })
                                  : null
                        const blocked = Boolean(reason) || pending
                        return (
                          <UnstyledButton
                            key={partner.id}
                            className="item-card-partner"
                            aria-disabled={blocked || undefined}
                            aria-describedby={reason ? `${discardId}-${partner.id}` : undefined}
                            onClick={() => {
                              if (blocked) return
                              offers.offer({
                                partnerId: partner.id,
                                partnerName: partner.name,
                                itemId: stack.id,
                                quantity: shareCount,
                                give: panel === 'give',
                              })
                              closeShare()
                            }}
                          >
                            <span className="user-copy">{partner.name}</span>
                            {reason && <small id={`${discardId}-${partner.id}`}>{reason}</small>}
                          </UnstyledButton>
                        )
                      })}
                    </div>
                    <UnstyledButton className="quiet-link" onClick={closeShare}>
                      {t('common.cancel')}
                    </UnstyledButton>
                  </section>
                )}
                {dm && discardControls}
                <div className="item-card-discard">
                  <UnstyledButton
                    className="item-card-disclosure"
                    aria-expanded={panel === 'discard'}
                    aria-controls={`${discardId}-discard`}
                    onClick={() => (panel === 'discard' ? setPanel(null) : open('discard'))}
                  >
                    <span>{t('inventory.card.discardOpen')}</span>
                    <ChevronDown size={18} aria-hidden="true" className="item-card-chevron" />
                  </UnstyledButton>
                  <div
                    id={`${discardId}-discard`}
                    ref={discardBody}
                    hidden={panel !== 'discard'}
                    className="item-card-discard-body"
                  >
                    {!dm && discardControls}
                    <UnstyledButton
                      className="item-card-discard-button"
                      aria-disabled={pending || undefined}
                      onClick={() => !pending && actions.remove(discard)}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                      {t('inventory.card.discard', { amount: discard })}
                    </UnstyledButton>
                  </div>
                </div>
                {dm && (
                  <Group justify="space-between" gap="xs" className="item-card-links">
                    <UnstyledButton
                      className="quiet-link"
                      aria-disabled={pending || undefined}
                      onClick={() => !pending && actions.grant(count)}
                    >
                      <Gift size={16} aria-hidden="true" />
                      {t('inventory.card.giveMore', { amount: count })}
                    </UnstyledButton>
                    <UnstyledButton className="quiet-link" onClick={actions.edit}>
                      <Pencil size={16} aria-hidden="true" />
                      {t('inventory.card.edit')}
                    </UnstyledButton>
                  </Group>
                )}
              </Stack>
            )}
          </article>
        </Drawer.Body>
      </Drawer.Content>
    </DrawerRoot>
  )
}

/** RYT-149: what the last change did, right under the seal, with undo and the fuse burning down. */
function CardResult({
  text,
  startedAt,
  pending,
  onUndo,
  onExpire,
}: {
  text: string
  startedAt: number
  pending: boolean
  onUndo: () => void
  onExpire: () => void
}) {
  const { t } = useTranslation()
  const left = useFuseLeft(startedAt, onExpire)
  return (
    <div className="card-result">
      <div className="card-result-row">
        <Text size="sm" className="user-copy card-result-text">
          {text}
        </Text>
        <UnstyledButton
          className="undo-seal small"
          aria-disabled={pending || undefined}
          onClick={() => !pending && onUndo()}
        >
          <Undo2 size={16} aria-hidden="true" />
          {t('inventory.undo.action')}
          <span className="visually-hidden">
            {t('inventory.undo.left', { minutes: Math.ceil(left / 60_000) })}
          </span>
        </UnstyledButton>
      </div>
      <span className="card-result-fuse" aria-hidden="true">
        <span style={{ transform: `scaleX(${left / UNDO_WINDOW_MS})` }} />
      </span>
    </div>
  )
}
