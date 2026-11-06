import type { Scene } from '../domain/model'

/**
 * Painted maps get painted props and doors; ink maps and plain parchment keep the line art
 * (RYT-064). Uploaded maps are usually painted (Dungeon Alchemist, Dungeondraft, Czepeku).
 */
export const paintedScene = (scene: Pick<Scene, 'recipe' | 'look' | 'map_kind' | 'ground'>) => {
  const look = scene.recipe?.look ?? scene.look
  return look ? look === 'painted' : !(scene.map_kind === 'blank' && scene.ground === 'parchment')
}

// Shared drawing constants for the board, panels and dialogs (design-flow.md, section 2).

/** World pixels per square: generated maps are painted at this size. */
export const U = 64

export const groundColors: Record<Scene['ground'], { fill: string; grid: string }> = {
  parchment: { fill: '#e9dcc0', grid: 'rgba(91, 65, 40, 0.38)' },
  stone: { fill: '#6e665c', grid: 'rgba(20, 16, 12, 0.42)' },
  grass: { fill: '#5a7a3a', grid: 'rgba(16, 26, 8, 0.4)' },
  wood: { fill: '#8a5e3a', grid: 'rgba(30, 18, 8, 0.45)' },
  sand: { fill: '#d8c08c', grid: 'rgba(91, 65, 40, 0.35)' },
}

export const damageColors: Record<string, string> = {
  fire: '#e06a2b',
  cold: '#74b9de',
  lightning: '#e5d04a',
  thunder: '#8fa3c7',
  acid: '#b5c93a',
  poison: '#7fae4e',
  necrotic: '#7d6b91',
  radiant: '#f2d27a',
  force: '#b08ce6',
}
export const tokenColorValues: Record<string, string> = {
  amber: '#eda145',
  crimson: '#b8433a',
  forest: '#4f8a4a',
  azure: '#4c8cc4',
  violet: '#8a64c4',
  slate: '#6d7480',
  ivory: '#e8dcc4',
  ochre: '#c2913c',
}
