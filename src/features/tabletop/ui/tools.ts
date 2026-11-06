import {
  Armchair,
  CloudFog,
  DoorOpen,
  Flame,
  LocateFixed,
  MousePointer2,
  NotebookPen,
  Ruler,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { AreaShape, DamageType } from '../domain/model'

export const tools = [
  'select',
  'measure',
  'area',
  'fog',
  'door',
  'note',
  'event',
  'prop',
  'ping',
] as const
export type Tool = (typeof tools)[number]

export const toolKeys: Record<Tool, string> = {
  select: 'v',
  measure: 'm',
  area: 'a',
  fog: 'f',
  door: 'd',
  note: 'n',
  event: 'e',
  prop: 'p',
  ping: 'x',
}

export const toolIcons: Record<Tool, LucideIcon> = {
  select: MousePointer2,
  measure: Ruler,
  area: Flame,
  fog: CloudFog,
  door: DoorOpen,
  note: NotebookPen,
  event: Sparkles,
  prop: Armchair,
  ping: LocateFixed,
}

/** Tools the phone tray shows first; the rest sit under "More". */
export const phoneTools: Tool[] = ['select', 'measure', 'area', 'fog', 'door']

export interface AreaSettings {
  shape: AreaShape
  size: number
  width: number
  damage: DamageType
  label: string
}
export const defaultArea: AreaSettings = {
  shape: 'sphere',
  size: 20,
  width: 5,
  damage: 'fire',
  label: '',
}

export interface FogSettings {
  mode: 'reveal' | 'hide'
  shape: 'brush' | 'rect' | 'room'
  radius: number
}
export const defaultFog: FogSettings = { mode: 'reveal', shape: 'room', radius: 1.5 }
