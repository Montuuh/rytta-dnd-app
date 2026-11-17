import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Backpack, BookOpen, Shirt } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { membersQuery, useCampaign, useCampaignView, useIsRealDm } from '@/features/campaigns'
import { newRequestId } from '@/shared/lib/request-id'
import { localizedName } from '@/shared/lib/translations'
import { inventoryQuery, rosterQuery, useInventoryAction, useProposeItem } from '../api'
import { canEquip, equippedBySlot, slotsFor } from '../domain/equipment'
import type {
  DefinitionDraft,
  InventoryEvent,
  ItemDefinition,
  ItemStack,
  Supplies,
} from '../domain/item'
import { AddItemChooser } from './add-item-chooser'
import { DefinitionEditor } from './definition-editor'
import { Forge, type ForgeExtra } from './forge'
import { PlayerAddItem } from './player-add-item'
import { ProposalShelf } from './proposal-shelf'
import { ItemCard } from './item-card'
import { Ledger } from './ledger'
import { PaperDoll } from './paper-doll'
import { CharacterPortrait } from './portrait'
import { PurseBar } from './purse-bar'
import './inventory-journey.css'
import { Satchel } from './satchel'
import { UndoFuse, type FuseEntry } from './undo-fuse'

type View = 'satchel' | 'equipment' | 'ledger'
const viewIcons = { satchel: Backpack, equipment: Shirt, ledger: BookOpen }

export function InventoryPage() {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  const campaign = useCampaign()
  const { playerPreview, previewUserId } = useCampaignView()
  const dm = campaign.role === 'dm'
  const realDm = useIsRealDm()
  const enabled = (campaign.player_modules ?? []).includes('inventory')
  const roster = useQuery(rosterQuery(userId, campaign.id))
  const members = useQuery({ ...membersQuery(userId, campaign.id), enabled: dm })
  const ownerId = playerPreview ? previewUserId : userId
  const visibleRoster = useMemo(
    () => (roster.data ?? []).filter((c) => dm || c.user_id === ownerId),
    [roster.data, dm, ownerId],
  )
  const [params] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(params.get('character'))
  const characterId =
    selected && visibleRoster.some((c) => c.id === selected)
      ? selected
      : (visibleRoster[0]?.id ?? null)
  const character = visibleRoster.find((c) => c.id === characterId)
  const inventory = useQuery({
    ...inventoryQuery(userId, campaign.id, characterId ?? ''),
    enabled: Boolean(characterId),
  })
  const action = useInventoryAction(campaign.id)
  const [view, setView] = useState<View>(
    params.get('view') === 'equipment' ? 'equipment' : 'satchel',
  )
  const [card, setCard] = useState<string | null>(null)
  const [forge, setForge] = useState<{ definition: ItemDefinition | null } | null>(null)
  const [adding, setAdding] = useState(false)
  const [searching, setSearching] = useState(false)
  const [proposing, setProposing] = useState<{ name: string } | null>(null)
  const propose = useProposeItem(campaign.id)
  const proposalRequest = useRef({ payload: '', id: newRequestId() })
  const [fuse, setFuse] = useState<(FuseEntry & { characterId: string }) | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // The opener can vanish (an equipped or emptied stack leaves the satchel); fall back
  // to the page heading so focus never drops to the document body.
  const restoreFocus = (openerLeaves = false) =>
    requestAnimationFrame(() =>
      opener.current?.isConnected && !openerLeaves
        ? opener.current.focus()
        : heading.current?.focus(),
    )
  const dismissFuse = useCallback(() => setFuse(null), [setFuse])
  // J3-18: a result line belongs to the moment it happened; it fades on its own.
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 8000)
    return () => window.clearTimeout(id)
  }, [notice])

  if (!dm && !enabled)
    return (
      <Stack>
        <Title order={1}>{t('module.inventory')}</Title>
        <Paper p="xl">
          <Text>{t('inventory.hidden')}</Text>
        </Paper>
      </Stack>
    )
  if (roster.isPending) return <Text role="status">{t('common.loading')}</Text>
  if (roster.isError)
    return (
      <Alert color="red" role="alert">
        {t('query.error')}{' '}
        <Button variant="subtle" onClick={() => void roster.refetch()}>
          {t('common.retry')}
        </Button>
      </Alert>
    )
  if (!character)
    return (
      <Stack>
        <Title order={1}>{t('module.inventory')}</Title>
        <Paper p="xl">
          <Text>{t(dm ? 'inventory.noCharacters' : 'characters.emptyPlayer')}</Text>
        </Paper>
      </Stack>
    )

  const canEdit = realDm || character.user_id === userId
  const data = inventory.data
  const definitions = new Map((data?.definitions ?? []).map((d) => [d.id, d]))
  const stacks = data?.stacks ?? []
  const stackById = new Map(stacks.map((s) => [s.id, s]))
  const portrait = (size: number, editable = false) => (
    <CharacterPortrait
      campaignId={campaign.id}
      characterId={character.id}
      name={character.name}
      path={data?.holder.portraitPath ?? character.portraitPath}
      size={size}
      editable={editable}
      viewable
    />
  )
  const errorText = (code: string) =>
    t(
      (
        {
          stale: 'inventory.error.stale',
          conflict: 'inventory.error.conflict',
          occupied: 'inventory.error.occupied',
          insufficient: 'inventory.error.insufficient',
          forbidden: 'inventory.error.forbidden',
          tooMany: 'items.propose.tooMany',
          cents: 'inventory.error.cents',
        } as const
      )[code as 'stale'] ?? 'inventory.error.unavailable',
    )
  const run = (
    request: Parameters<typeof action.mutate>[0],
    done?: (result: Awaited<ReturnType<typeof action.mutateAsync>>) => void,
  ) => {
    setNotice(null)
    setError(null)
    action.mutate(request, {
      onSuccess: done,
      onError: (failure) => setError(errorText(failure.message)),
    })
  }
  const withFuse =
    (message: string) => (result: { event_id?: string } | { definitionId: string }) => {
      if ('event_id' in result && result.event_id)
        setFuse({
          eventId: result.event_id,
          message,
          startedAt: Date.now(),
          characterId: character.id,
        })
    }
  const openForge = (definition: ItemDefinition | null) => {
    action.reset()
    setError(null)
    setForge({ definition })
  }
  const nameOf = (stack: ItemStack) => {
    const definition = definitions.get(stack.definition_id)
    return definition ? localizedName(definition, i18n.language) : ''
  }
  // RYT-104: food and drink report what they added to the character's supplies.
  const suppliesText = (supplies: Supplies | undefined) =>
    supplies && (supplies.rations > 0 || supplies.water > 0)
      ? [
          supplies.rations > 0
            ? t('items.supplies.gainedRations', { count: supplies.rations })
            : '',
          supplies.water > 0 ? t('items.supplies.gainedWater', { count: supplies.water }) : '',
        ]
          .filter(Boolean)
          .join(' ')
      : ''
  const equip = (stack: ItemStack, slot?: ItemStack['equipped_slot']) => {
    const definition = definitions.get(stack.definition_id)
    if (!definition) return
    const equipped = equippedBySlot(stacks, definitions)
    const target =
      slot ??
      slotsFor(definition.slot_kind).find((s) => canEquip(definition.slot_kind, s, equipped))
    if (!target) {
      setCard(null)
      setView('equipment')
      setNotice(t('inventory.error.occupied'))
      return
    }
    run({ kind: 'equip', itemId: stack.id, expectedRevision: stack.revision, slot: target }, () => {
      setCard(null)
      setNotice(
        t('inventory.equipped', { name: nameOf(stack), slot: t(`inventory.slot.${target}`) }),
      )
      if (!slot) restoreFocus(stack.quantity === 1)
    })
  }
  // RYT-115: deleting an account sets its audit actor to null; inventory writes always have an actor.
  const actorName = (id: string | null) =>
    id === null
      ? t('account.deletedUser')
      : id === userId
        ? t('inventory.ledger.you')
        : (members.data?.find((m) => m.user_id === id)?.display_name ??
          t('inventory.ledger.someone'))
  const sendProposal = (draft: DefinitionDraft, extra: ForgeExtra) => {
    const payload = {
      name: draft.name,
      description: draft.description,
      ...(draft.translations ? { translations: draft.translations } : {}),
      category: draft.category,
      icon: draft.icon,
      rarity: draft.rarity,
      slot_kind: draft.slot_kind,
      properties: draft.properties,
      weight_lb: draft.weight_lb,
      ...(extra.suggestedGp === null ? {} : { suggested_value_gp: extra.suggestedGp }),
    }
    const key = JSON.stringify([payload, extra.amount])
    if (proposalRequest.current.payload !== key)
      proposalRequest.current = { payload: key, id: newRequestId() }
    setError(null)
    propose.mutate(
      {
        draft: payload,
        characterId: character.id,
        quantity: extra.amount,
        requestId: proposalRequest.current.id,
      },
      {
        onError: (failure) => setError(errorText(failure.message)),
        onSuccess: () => {
          setProposing(null)
          setNotice(t('items.propose.sent', { name: draft.name }))
          restoreFocus()
        },
      },
    )
  }
  const openStack = card ? stackById.get(card) : undefined
  const views: View[] = ['satchel', 'equipment', 'ledger']

  return (
    <Stack
      gap="md"
      className="inventory-page"
      data-undo={(fuse && fuse.characterId === character.id && canEdit) || undefined}
    >
      <header className="inventory-head">
        {portrait(72, canEdit)}
        <div>
          <Title order={1} ref={heading} tabIndex={-1}>
            {t('module.inventory')}
          </Title>
          <Text c="dimmed" className="user-copy">
            {character.name}
          </Text>
        </div>
      </header>
      {data && <PurseBar name={character.name} gold={data.gold} />}
      {dm && visibleRoster.length > 1 && (
        <div className="camp-roster" role="group" aria-label={t('inventory.roster')}>
          {visibleRoster.map((c) => (
            <UnstyledButton
              key={c.id}
              aria-pressed={c.id === character.id}
              className="roster-chip"
              onClick={() => setSelected(c.id)}
            >
              <CharacterPortrait
                campaignId={campaign.id}
                characterId={c.id}
                name={c.name}
                path={c.portraitPath}
                size={40}
              />
              <span className="user-copy">{c.name}</span>
            </UnstyledButton>
          ))}
        </div>
      )}
      {dm && !enabled && (
        <Text size="sm" c="dimmed">
          {t('inventory.hiddenForPlayers')}
        </Text>
      )}
      <SegmentedControl
        fullWidth
        className="view-switch"
        aria-label={t('inventory.views')}
        value={view}
        onChange={(value) => {
          setView(value as View)
          setNotice(null)
        }}
        data={views.map((value) => {
          const Icon = viewIcons[value]
          return {
            value,
            label: (
              <span className="view-switch-label">
                <Icon size={18} aria-hidden="true" />
                <span>{t(`inventory.view.${value}`)}</span>
              </span>
            ),
          }
        })}
      />
      {/* Announce through an out-of-flow live region; show the text only when present. */}
      <div aria-live="polite" className="visually-hidden-live">
        {notice}
      </div>
      {notice && (
        <Text size="sm" aria-hidden="true" className="inventory-notice">
          {notice}
        </Text>
      )}
      {error && !openStack && !forge && !proposing && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      {inventory.isPending && <Text role="status">{t('common.loading')}</Text>}
      {inventory.isError && (
        <Alert color="red" role="alert">
          {t('query.error')}{' '}
          <Button variant="subtle" onClick={() => void inventory.refetch()}>
            {t('common.retry')}
          </Button>
        </Alert>
      )}
      {data && view === 'satchel' && (
        <Satchel
          stacks={stacks}
          definitions={definitions}
          strength={data.holder.str}
          canAdd={canEdit}
          onOpen={(stack, target) => {
            opener.current = target
            setCard(stack.id)
          }}
          onAdd={(target) => {
            opener.current = target
            action.reset()
            setError(null)
            // DMs choose between an existing storeroom item and a new one (RYT-032); Players
            // search the catalogue first and propose what is missing (RYT-105).
            if (dm && !playerPreview) setAdding(true)
            else setSearching(true)
          }}
        />
      )}
      {data && view === 'satchel' && (
        <ProposalShelf
          campaignId={campaign.id}
          characterId={character.id}
          canCancel={canEdit && !(dm && !playerPreview)}
        />
      )}
      {data && view === 'equipment' && (
        <PaperDoll
          stacks={stacks}
          definitions={definitions}
          effectiveAc={data.holder.armorClass}
          dexterity={data.holder.dex}
          strength={data.holder.str}
          level={data.holder.level}
          monkLevel={data.holder.monkLevel}
          canEdit={canEdit}
          pending={action.isPending}
          portrait={portrait(112)}
          onEquip={(stack, slot) => equip(stack, slot)}
          onUnequip={(stack, done) =>
            run({ kind: 'unequip', itemId: stack.id, expectedRevision: stack.revision }, () => {
              setNotice(t('inventory.unequipped', { name: nameOf(stack) }))
              done?.()
            })
          }
        />
      )}
      {data && view === 'ledger' && (
        <Ledger
          events={data.events}
          stacks={stackById}
          definitions={definitions}
          dm={dm && !playerPreview}
          userId={userId}
          actorName={actorName}
          ordersHref={`/campaign/${campaign.id}/shops?tab=orders`}
          pending={action.isPending || !canEdit}
          onUndo={(event: InventoryEvent) =>
            run({ kind: 'undo', eventId: event.id }, () => setNotice(t('inventory.undo.done')))
          }
        />
      )}
      {openStack && definitions.get(openStack.definition_id) && (
        <ItemCard
          stack={openStack}
          total={stacks
            .filter((s) => s.definition_id === openStack.definition_id && !s.equipped_slot)
            .reduce((sum, s) => sum + s.quantity, 0)}
          definition={definitions.get(openStack.definition_id)!}
          canEdit={canEdit}
          dm={dm && !playerPreview}
          pending={action.isPending}
          error={error}
          undo={
            fuse && fuse.characterId === character.id && canEdit
              ? {
                  message: fuse.message,
                  onUndo: () =>
                    run({ kind: 'undo', eventId: fuse.eventId }, () => {
                      setFuse(null)
                      setNotice(t('inventory.undo.done'))
                    }),
                }
              : null
          }
          onClose={() => {
            setCard(null)
            setError(null)
            restoreFocus()
          }}
          actions={{
            use: () =>
              run(
                {
                  kind: 'use',
                  itemId: openStack.id,
                  expectedRevision: openStack.revision,
                  amount: 1,
                },
                (result) => {
                  const gained = 'supplies' in result ? suppliesText(result.supplies) : ''
                  withFuse(
                    [t('inventory.fuse.used', { name: nameOf(openStack) }), gained]
                      .filter(Boolean)
                      .join(' '),
                  )(result)
                  if (gained) setNotice(gained)
                  // The last unit leaves the satchel with its card; keep focus on the page.
                  if (openStack.quantity === 1) {
                    setCard(null)
                    restoreFocus(true)
                  }
                },
              ),
            remove: (amount) =>
              run(
                {
                  kind: 'remove',
                  itemId: openStack.id,
                  expectedRevision: openStack.revision,
                  amount,
                },
                (result) => {
                  withFuse(t('inventory.fuse.removed', { name: nameOf(openStack), amount }))(result)
                  if (amount >= openStack.quantity) {
                    setCard(null)
                    restoreFocus(true)
                  }
                },
              ),
            equip: () => equip(openStack),
            grant: (amount) =>
              run(
                {
                  kind: 'grant',
                  characterId: character.id,
                  definitionId: openStack.definition_id,
                  amount,
                },
                withFuse(t('inventory.fuse.granted', { name: nameOf(openStack), amount })),
              ),
            edit: () => {
              setCard(null)
              openForge(definitions.get(openStack.definition_id)!)
            },
          }}
        />
      )}
      {adding && dm && !playerPreview && (
        <AddItemChooser
          campaignId={campaign.id}
          character={{ id: character.id, name: character.name }}
          onClose={() => {
            setAdding(false)
            restoreFocus()
          }}
          onDone={(message) => {
            setAdding(false)
            setNotice(message)
            restoreFocus()
          }}
        />
      )}
      {forge && dm && !playerPreview && (
        <DefinitionEditor
          campaignId={campaign.id}
          definition={forge.definition}
          onClose={() => {
            setForge(null)
            restoreFocus()
          }}
          onSaved={(item) => {
            setForge(null)
            setNotice(t('catalogue.savedName', { name: item.name }))
            restoreFocus()
          }}
        />
      )}
      {searching && (
        <PlayerAddItem
          campaignId={campaign.id}
          character={{ id: character.id, name: character.name }}
          onClose={() => {
            setSearching(false)
            restoreFocus()
          }}
          onDone={(message) => {
            setSearching(false)
            setNotice(message)
            restoreFocus()
          }}
          onPropose={(name) => {
            setSearching(false)
            propose.reset()
            setError(null)
            setProposing({ name })
          }}
        />
      )}
      {proposing && (
        <Forge
          campaignId={campaign.id}
          definition={null}
          initial={{
            name: proposing.name,
            category: 'gear',
            icon: 'package',
            rarity: 'common',
            weight_lb: 0,
            value_gp: null,
            description: '',
            translations: null,
            slot_kind: 'none',
            properties: {},
          }}
          mode="proposal"
          title={t('items.propose.titleFor', { name: character.name })}
          targets={[]}
          pending={propose.isPending}
          error={error}
          onSave={sendProposal}
          onClose={() => {
            if (propose.isPending) return
            setProposing(null)
            setError(null)
            restoreFocus()
          }}
        />
      )}
      {fuse &&
        fuse.characterId === character.id &&
        canEdit &&
        !openStack &&
        !forge &&
        !adding &&
        !searching &&
        !proposing && (
          <UndoFuse
            entry={fuse}
            pending={action.isPending}
            onDismiss={dismissFuse}
            onUndo={() =>
              run({ kind: 'undo', eventId: fuse.eventId }, () => {
                setFuse(null)
                setNotice(t('inventory.undo.done'))
              })
            }
          />
        )}
    </Stack>
  )
}
