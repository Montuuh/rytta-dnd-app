import {
  generatorVersion,
  type GeneratedMap,
  type GeneratedNote,
  type GeneratorOptions,
  type MapKind,
} from './core'
import { crypt, dungeon } from './dungeon'
import { cave, forest } from './outdoor'
import { tavern } from './tavern'
import type { ItemPatch, Recipe, Room } from '../model'

export * from './core'
export * from './outline'

/** Smallest maps each kind can lay out well. */
export const minimumSize: Record<MapKind, { cols: number; rows: number }> = {
  dungeon: { cols: 16, rows: 12 },
  crypt: { cols: 18, rows: 12 },
  cave: { cols: 14, rows: 10 },
  forest: { cols: 14, rows: 10 },
  tavern: { cols: 18, rows: 14 },
}
export const maximumSize = 80

export const sizePresets = [
  { key: 'small', cols: 24, rows: 18 },
  { key: 'medium', cols: 32, rows: 24 },
  { key: 'large', cols: 48, rows: 32 },
] as const

export function normalizeOptions(options: GeneratorOptions): GeneratorOptions {
  const min = minimumSize[options.kind]
  return {
    ...options,
    cols: Math.max(min.cols, Math.min(maximumSize, Math.round(options.cols))),
    rows: Math.max(min.rows, Math.min(maximumSize, Math.round(options.rows))),
    seed: Math.abs(Math.trunc(options.seed)) % 1_000_000,
    secret: options.secret && (options.kind === 'dungeon' || options.kind === 'crypt'),
    wide: options.wide && options.kind === 'dungeon',
    traps:
      (options.traps ?? false) &&
      (options.kind === 'dungeon' || options.kind === 'crypt' || options.kind === 'cave'),
  }
}

/** A scene holds at most this many items when it is created (the save contract). */
export const maximumItems = 600

export function generateMap(input: GeneratorOptions): GeneratedMap {
  const options = normalizeOptions(input)
  const map = (() => {
    switch (options.kind) {
      case 'dungeon':
        return dungeon(options)
      case 'crypt':
        return crypt(options)
      case 'cave':
        return cave(options)
      case 'forest':
        return forest(options)
      case 'tavern':
        return tavern(options)
    }
  })()
  // Doors and notes first: furniture is what gives way on very large maps.
  const room = Math.max(0, maximumItems - map.doors.length - map.notes.length)
  return map.props.length > room ? { ...map, props: map.props.slice(0, room) } : map
}

export const recipeOf = (options: GeneratorOptions): Recipe => ({
  kind: options.kind,
  seed: options.seed,
  look: options.look,
  density: options.density,
  secret: options.secret,
  wide: options.wide,
  traps: options.traps ?? false,
  version: generatorVersion,
})

/**
 * The generated rooms, doors, props and DM notes as scene data (everything stays editable).
 * `describe` writes a note's title and text in the DM's language.
 */
export function sceneContent(
  map: GeneratedMap,
  describe?: (note: GeneratedNote) => { label: string; text: string },
): { rooms: Room[]; items: ItemPatch[] } {
  const items: ItemPatch[] = [
    ...map.doors.map((d) => ({
      kind: 'door' as const,
      x: d.x,
      y: d.y,
      w: 1,
      h: 0.25,
      rotation: d.rotation,
      data: {
        state: d.locked ? 'locked' : 'closed',
        ...(d.secret ? { secret: true } : {}),
        rooms: d.rooms.slice(0, 2),
      },
    })),
    ...map.props.map((p) => ({
      kind: 'prop' as const,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      rotation: p.rotation,
      data: { prop: p.prop },
    })),
    ...(describe
      ? map.notes.map((n) => {
          const { label, text } = describe(n)
          return {
            kind: 'note' as const,
            x: n.x,
            y: n.y,
            w: 1,
            h: 1,
            rotation: 0,
            label: label.slice(0, 80),
            data: {},
            secret: { text: text.slice(0, 4000) },
          }
        })
      : []),
  ]
  return {
    rooms: map.rooms
      .filter((r) => r.rects.length > 0 && r.rects.length <= 400)
      .slice(0, 400)
      .map(({ id, rects }) => ({ id, rects })),
    items: items.slice(0, maximumItems),
  }
}

export const newSeed = () => Math.floor(Math.random() * 1_000_000)
