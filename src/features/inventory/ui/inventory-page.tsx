import { useCallback, useMemo, useRef, useState } from 'react'
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
import { Backpack, BookOpen, Hammer, Shirt } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { membersQuery, useCampaign, useCampaignView } from '@/features/campaigns'
import { inventoryQuery, rosterQuery, useInventoryAction } from '../api'
import { canEquip, equippedBySlot, slotsFor } from '../domain/equipment'
import type { DefinitionDraft, InventoryEvent, ItemDefinition, ItemStack } from '../domain/item'
import { Forge } from './forge'
import { ItemCard } from './item-card'
import { ItemIcon } from './item-icon'
import { Ledger } from './ledger'
import { PaperDoll } from './paper-doll'
import { CharacterPortrait } from './portrait'
import { Satchel } from './satchel'
import { UndoFuse, type FuseEntry } from './undo-fuse'

type View = 'satchel' | 'equipment' | 'ledger' | 'catalog'
const viewIcons = { satchel: Backpack, equipment: Shirt, ledger: BookOpen, catalog: Hammer }

export function InventoryPage() {
  const { t } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  const campaign = useCampaign()
  const { playerPreview, previewUserId } = useCampaignView()
  const dm = campaign.role === 'dm'
  const enabled = (campaign.player_modules ?? []).includes('inventory')
  const roster = useQuery(rosterQuery(userId, campaign.id))
  const members = useQuery({ ...membersQuery(userId, campaign.id), enabled: dm })
  const ownerId = playerPreview ? previewUserId : userId
  const visibleRoster = useMemo(
    () => (roster.data ?? []).filter((c) => dm || c.user_id === ownerId),
    [roster.data, dm, ownerId],
  )
  const [selected, setSelected] = useState<string | null>(null)
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
  const [view, setView] = useState<View>('satchel')
  const [card, setCard] = useState<string | null>(null)
  const [forge, setForge] = useState<{ definition: ItemDefinition | null } | null>(null)
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
  const dismissFuse = useCallback(() => setFuse(null), [])

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

  const canEdit = !playerPreview && (dm || character.user_id === userId)
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
  const nameOf = (stack: ItemStack) => definitions.get(stack.definition_id)?.name ?? ''
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
        t('inventory.equipped', { name: definition.name, slot: t(`inventory.slot.${target}`) }),
      )
      if (!slot) restoreFocus(stack.quantity === 1)
    })
  }
  const actorName = (id: string | null) =>
    id === userId
      ? t('inventory.ledger.you')
      : (members.data?.find((m) => m.user_id === id)?.display_name ?? t('inventory.ledger.someone'))
  const save = (draft: DefinitionDraft, give: { characterIds: string[]; amount: number }) => {
    const definition = forge?.definition ?? null
    action.mutate(
      {
        kind: 'define',
        definitionId: definition?.id ?? null,
        expectedRevision: definition?.revision ?? null,
        draft,
      },
      {
        onError: (failure) => setError(errorText(failure.message)),
        onSuccess: async (result) => {
          const definitionId = 'definitionId' in result ? result.definitionId : definition!.id
          for (const target of give.characterIds)
            await action.mutateAsync({
              kind: 'grant',
              characterId: target,
              definitionId,
              amount: give.amount,
            })
          setForge(null)
          setNotice(
            t(definition ? 'inventory.forge.saved' : 'inventory.forge.created', {
              name: draft.name,
            }),
          )
          restoreFocus()
        },
      },
    )
  }
  const openStack = card ? stackById.get(card) : undefined
  const views: View[] = dm
    ? ['satchel', 'equipment', 'ledger', 'catalog']
    : ['satchel', 'equipment', 'ledger']

  return (
    <Stack gap="md" className="inventory-page">
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
        onChange={(value) => setView(value as View)}
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
      {error && !openStack && !forge && (
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
            openForge(null)
          }}
        />
      )}
      {data && view === 'equipment' && (
        <PaperDoll
          stacks={stacks}
          definitions={definitions}
          dexterity={data.holder.dex}
          strength={data.holder.str}
          level={data.holder.level}
          canEdit={canEdit}
          pending={action.isPending}
          portrait={portrait(112)}
          onEquip={(stack, slot) => equip(stack, slot)}
          onUnequip={(stack) =>
            run({ kind: 'unequip', itemId: stack.id, expectedRevision: stack.revision }, () =>
              setNotice(t('inventory.unequipped', { name: nameOf(stack) })),
            )
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
          pending={action.isPending || !canEdit}
          onUndo={(event: InventoryEvent) =>
            run({ kind: 'undo', eventId: event.id }, () => setNotice(t('inventory.undo.done')))
          }
        />
      )}
      {data && view === 'catalog' && dm && (
        <ul className="satchel-grid catalog-grid" aria-label={t('inventory.view.catalog')}>
          <li>
            <UnstyledButton
              className="item-tile item-tile-add"
              onClick={(event) => {
                opener.current = event.currentTarget
                openForge(null)
              }}
            >
              <span className="item-tile-icon">
                <Hammer size={26} aria-hidden="true" />
              </span>
              <span className="item-tile-name">{t('inventory.forge.title')}</span>
            </UnstyledButton>
          </li>
          {data.definitions
            .filter((d) => !d.archived)
            .map((definition) => (
              <li key={definition.id}>
                <UnstyledButton
                  className={`item-tile rarity-${definition.rarity}`}
                  aria-label={t('inventory.catalogLabel', {
                    name: definition.name,
                    rarity: t(`inventory.rarity.${definition.rarity}`),
                  })}
                  onClick={(event) => {
                    opener.current = event.currentTarget
                    openForge(definition)
                  }}
                >
                  <span className="item-tile-icon">
                    <ItemIcon icon={definition.icon} />
                  </span>
                  <span className="item-tile-name">{definition.name}</span>
                  {definition.origin === 'player' && (
                    <span className="item-origin">{t('inventory.origin.player')}</span>
                  )}
                </UnstyledButton>
              </li>
            ))}
        </ul>
      )}
      {openStack && definitions.get(openStack.definition_id) && (
        <ItemCard
          stack={openStack}
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
                  withFuse(t('inventory.fuse.used', { name: nameOf(openStack) }))(result)
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
      {forge && (
        <Forge
          definition={forge.definition}
          dm={dm && !playerPreview}
          targets={visibleRoster.map((c) => ({
            id: c.id,
            name: c.name,
            portrait: (
              <CharacterPortrait
                campaignId={campaign.id}
                characterId={c.id}
                name={c.name}
                path={c.portraitPath}
                size={40}
              />
            ),
          }))}
          pending={action.isPending}
          error={error}
          onSave={save}
          onClose={() => {
            setForge(null)
            restoreFocus()
          }}
        />
      )}
      {fuse && fuse.characterId === character.id && canEdit && !openStack && !forge && (
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
