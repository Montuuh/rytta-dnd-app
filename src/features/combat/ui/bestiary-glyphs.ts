import {
  Bug,
  Cog,
  Droplets,
  Egg,
  Eye,
  Flame,
  Ghost,
  Mountain,
  PawPrint,
  Sparkles,
  Sprout,
  Sun,
  Tornado,
  User,
  type LucideIcon,
} from 'lucide-react'
import type { CreatureType } from '@/features/bestiary'

/**
 * One glyph per creature type (ADR 029): the type tiles, and the list tokens of creatures without
 * an image, so the eye can find "the undead" or "the dragons" in a long list. Skull stays reserved
 * for defeat.
 */
export const typeGlyphs: Record<CreatureType, LucideIcon> = {
  aberration: Eye,
  beast: PawPrint,
  celestial: Sun,
  construct: Cog,
  dragon: Egg,
  elemental: Tornado,
  fey: Sparkles,
  fiend: Flame,
  giant: Mountain,
  humanoid: User,
  monstrosity: Bug,
  ooze: Droplets,
  plant: Sprout,
  undead: Ghost,
}
