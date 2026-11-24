import {
  creatureReference,
  referencePack,
  type CreatureListItem,
  type CreaturePack,
} from '@/features/bestiary'

/** One enabled or turned-off pack of the campaign, its title and its creatures as list items. */
export type PackCreatures<S extends CreatureListItem> = {
  pack: CreaturePack
  title: string
  items: S[]
}

/** The campaign pack a stored creature reference comes from (bare keys are the SRD's). */
export function packOf(packs: readonly CreaturePack[], reference: string) {
  const ref = referencePack(reference)
  return packs.find((pack) => (ref === null ? pack.srd : pack.ref === ref))
}

/**
 * RYT-089, RYT-094: the campaign's bestiary. Its own creatures always; the creatures of every pack
 * it enabled for creatures, minus the hidden ones; and a creature with a campaign version shows that
 * version in its place (hidden with it, and set aside while its pack is turned off). The packs
 * themselves never change.
 */
export function campaignBestiary<S extends CreatureListItem, T extends CreatureListItem>(
  own: T[],
  packs: readonly PackCreatures<S>[],
): (S | T)[] {
  const all = packs.map((p) => p.pack)
  const hidden = new Set(
    packs.flatMap(({ pack }) => pack.hidden.map((key) => creatureReference(pack, key))),
  )
  const listed: T[] = []
  for (const item of own) {
    if (!item.version || !item.srdId) {
      listed.push(item)
      continue
    }
    const pack = packOf(all, item.srdId)
    if (!pack?.enabled || hidden.has(item.srdId)) continue
    const title = packs.find((p) => p.pack.id === pack.id)!.title
    listed.push({ ...item, packId: pack.id, pack: title })
  }
  const versioned = new Set(listed.filter((item) => item.version).map((item) => item.srdId))
  const official = packs
    .filter(({ pack }) => pack.enabled)
    .flatMap(({ items }) => items.filter((i) => !hidden.has(i.id) && !versioned.has(i.id)))
  return [...listed, ...official]
}
