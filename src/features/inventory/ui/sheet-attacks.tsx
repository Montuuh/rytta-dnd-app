import { Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { inventoryQuery } from '../api'
import { AttackLines } from './paper-doll'

/** Attack lines from equipped weapons, rendered inside the character sheet. */
export function SheetAttacks({
  campaignId,
  characterId,
}: {
  campaignId: string
  characterId: string
}) {
  const { state } = useAuth()
  const query = useQuery(inventoryQuery(state.user!.id, campaignId, characterId))
  if (!query.data) return query.isPending ? <Text size="sm">…</Text> : null
  return (
    <AttackLines
      stacks={query.data.stacks}
      definitions={new Map(query.data.definitions.map((d) => [d.id, d]))}
      strength={query.data.holder.str}
      dexterity={query.data.holder.dex}
      level={query.data.holder.level}
    />
  )
}
