/**
 * RYT-154: copyable art prompts for every image picker. One art direction for the whole project
 * (docs/interface-art.md) and one template per kind of picture, filled with what is on screen and
 * the framing the picker keeps. The prompt is English on purpose (owner choice, 2026-11-22): image
 * tools follow English best; names stay as the user wrote them. Nothing here calls an image
 * service: the text is copied and pasted by the user.
 */
export type ArtKind = 'character' | 'creature' | 'item' | 'shop' | 'card' | 'map'

export type ArtSubject = {
  kind: ArtKind
  /** The name on screen, kept as written. */
  name: string
  /** Data keys already in the app (creature type, rarity, category, class, shop type, size…). */
  traits?: readonly (string | null | undefined | false)[]
  /** What the user wrote about it (an item's description): only its look is asked of it. */
  details?: string
}

const noBorrowing = 'Not in the style of any named artist, studio, game or existing work.'

/** Shared by every picture but items: the house style and what never appears. */
export const artDirection = `Art direction: painterly fantasy illustration, warm amber light on deep umber shadows, rich but muted colours, soft brushwork. No text, letters, numbers, logos, watermarks, borders or frames. ${noBorrowing}`

/**
 * Items are painted like the app's own item pictures: the same sentence as the item batches of the
 * image queue (art/queue/requests.json), so a user's picture sits beside them without standing out.
 */
export const itemStyle =
  'Style: original painterly dark-fantasy still life, rich oil-paint brushwork, a single subject centred with generous margin on a very dark warm umber background (#140F0B) that fades to near-black at every edge, soft warm amber rim light from the upper left, restrained palette of oak brown, iron grey, cream, muted red, ochre and moss. No text, no letters, no numbers, no logos, no watermark, no frame, no border, no people, no faces, no hands.'
const detailLimit = 300

/** What each picker keeps: subject framing, format and background. */
const templates: Record<Exclude<ArtKind, 'item'>, { subject: string; framing: string }> = {
  character: {
    subject: 'Character portrait for a tabletop role-playing game',
    framing:
      'Framing: head and shoulders, three-quarter view, the face in the centre. Square 1:1, 1024×1024 px, plain dark umber background (#140F0B). Only this one character.',
  },
  creature: {
    subject: 'Creature portrait for a tabletop role-playing game bestiary',
    framing:
      'Framing: the whole creature, centred, filling most of the frame. Square 1:1, 1024×1024 px, plain dark umber background (#140F0B), no scenery.',
  },
  shop: {
    subject: 'Shop interior banner for a tabletop role-playing game',
    framing:
      'Framing: wide establishing view of the shop interior with its wares. Landscape 16:9, 1920×1080 px. Keep the important part in the middle horizontal band (it is also shown cropped to 3:1) and the lower third darker. No people in the foreground.',
  },
  card: {
    subject: 'Story card illustration for a tabletop role-playing game, shown on the table screen',
    framing:
      'Framing: one clear scene or object that reads at a glance. Landscape 16:9, 1920×1080 px, calm edges.',
  },
  map: {
    subject: 'Battle map for a tabletop role-playing game',
    framing:
      'Framing: strict top-down view, even lighting, no perspective. Landscape 16:9, 3840×2160 px. No grid lines, no tokens, no characters, no labels.',
  },
}

/** `very_rare` → `very rare`; unknown keys stay readable. */
const words = (value: string) => value.replace(/[_-]+/g, ' ').trim()

/** User text sits inside double quotes in the prompt: one line, its own quotes as apostrophes. */
const oneLine = (value: string) => value.trim().replace(/\s+/g, ' ').replaceAll('"', "'")

/** The description on one line, cut at a word when it is long. */
function look(details: string | undefined) {
  const text = oneLine(details ?? '')
  if (text.length <= detailLimit) return text
  const cut = text.slice(0, detailLimit)
  // A word that the limit splits goes whole; one that ends at the limit stays.
  return `${(text[detailLimit] === ' ' ? cut : cut.replace(/\s+\S*$/, '')).trimEnd()}…`
}

export function artPrompt(subject: ArtSubject): string {
  const name = oneLine(subject.name)
  const traits = (subject.traits ?? [])
    .filter((trait): trait is string => typeof trait === 'string' && trait.trim() !== '')
    .map(words)
  if (subject.kind === 'item') {
    const what = [name ? `"${name}"` : null, traits.length ? `(${traits.join(', ')})` : null]
      .filter(Boolean)
      .join(' ')
    const details = look(subject.details)
    return [
      `Create a square (1:1) image, 1024×1024 px. Item icon: ${what || 'one object'}. Bold simple silhouette that reads clearly at thumbnail size.`,
      details &&
        `Its description, only for what it looks like (ignore rules and numbers): "${details}"`,
      itemStyle,
      noBorrowing,
    ]
      .filter(Boolean)
      .join('\n')
  }
  const template = templates[subject.kind]
  const about = [name ? `"${name}"` : null, ...traits].filter(Boolean).join(', ')
  return [`${template.subject}${about ? `: ${about}.` : '.'}`, template.framing, artDirection].join(
    '\n',
  )
}

/** Copies the prompt; false when the browser refuses the clipboard. */
export async function copyArtPrompt(subject: ArtSubject) {
  try {
    await navigator.clipboard.writeText(artPrompt(subject))
    return true
  } catch {
    return false
  }
}
