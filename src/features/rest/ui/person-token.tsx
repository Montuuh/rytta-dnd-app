import { Token } from '@/features/combat'
import { useClassEmblems } from '@/features/characters'
import { useCampaignPortraits } from '@/features/inventory'

/**
 * RYT-126 J4-22: one avatar for a person at the rest, in the campfire seats and in the list below:
 * the portrait when there is one, else the initial with the class emblem as a badge (the painted
 * emblems are dark, so on their own they read as "out of the fight").
 */
export function PersonToken({
  campaignId,
  characterId,
  name,
  size,
  viewable = false,
}: {
  campaignId: string
  characterId: string
  name: string
  size: number
  viewable?: boolean
}) {
  const portraits = useCampaignPortraits(campaignId)
  const emblems = useClassEmblems(campaignId)
  return (
    <Token
      name={name}
      side="party"
      imageKind="character"
      path={portraits.get(characterId) ?? null}
      emblem={emblems(characterId)?.thumb ?? null}
      size={size}
      viewable={viewable}
    />
  )
}
