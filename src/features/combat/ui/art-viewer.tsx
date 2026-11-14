import { useState, type RefObject } from 'react'
import { Anchor, Button, Text, VisuallyHidden } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, ImagePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import type { CreatureArt } from '@/features/bestiary'
import { ImageViewer } from '@/shared/ui/image-viewer'
import { combatImageQuery } from '../api'

/**
 * A combat picture in the shared viewer (RYT-098): a character's portrait, or a creature's own image
 * with its bundled art as the fallback, as the token does. Bundled art carries a museum-style label
 * beneath with its author, licence and source (the attribution the licence asks for); the DM's own
 * image can say whose it is. One quiet action where the image can be changed.
 */
export function ArtViewer({
  name,
  imageKind = 'creature',
  imagePath,
  art,
  credit = null,
  ownNote,
  returnFocus,
  onChange,
  onClose,
}: {
  name: string
  imageKind?: 'creature' | 'character'
  /** The private image: a portrait, the campaign creature's own, or the DM's image of an SRD one. */
  imagePath: string | null | undefined
  /** The bundled art at full size, shown without a readable private image. */
  art: string | null | undefined
  /** The bundled art's credit, shown whenever the bundled art is what the viewer shows. */
  credit?: CreatureArt | null
  /** The DM's own image: a campaign creature's, or the DM's image of an SRD creature. */
  ownNote?: 'campaign' | 'srd'
  returnFocus?: RefObject<HTMLElement | null>
  /** Opens the file picker; omitted where the image is only viewed. */
  onChange?: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const own = useQuery(
    combatImageQuery(state.user?.id ?? 'anonymous', imageKind, imagePath ?? null),
  )
  const [broken, setBroken] = useState<string | null>(null)
  const ownFailed = own.isError || (own.data !== undefined && broken === own.data)
  const showingOwn = Boolean(imagePath) && !ownFailed
  const src = showingOwn ? own.data : art
  const external = <VisuallyHidden>{t('bestiary.art.newTab')}</VisuallyHidden>
  const caption =
    !showingOwn && credit ? (
      <div className="bst-art-label">
        <dl>
          <div>
            <dt>{t('bestiary.art.author')}</dt>
            <dd>{credit.author}</dd>
          </div>
          <div>
            <dt>{t('bestiary.art.license')}</dt>
            <dd>
              {credit.licenseUrl ? (
                <Anchor href={credit.licenseUrl} target="_blank" rel="noopener noreferrer">
                  {credit.license}
                  <ExternalLink size={14} aria-hidden="true" />
                  {external}
                </Anchor>
              ) : (
                credit.license
              )}
            </dd>
          </div>
          <div>
            <dt>{t('bestiary.art.source')}</dt>
            <dd>
              <Anchor href={credit.source} target="_blank" rel="noopener noreferrer">
                {t(`bestiary.art.origin.${credit.origin}`)}
                <ExternalLink size={14} aria-hidden="true" />
                {external}
              </Anchor>
            </dd>
          </div>
        </dl>
        <Text size="sm" c="dimmed" className="bst-art-note">
          {t(credit.origin === 'generated' ? 'bestiary.art.generated' : 'bestiary.art.adapted')}
        </Text>
      </div>
    ) : showingOwn && ownNote ? (
      <Text size="sm" c="dimmed" className="bst-art-label">
        {t(ownNote === 'srd' ? 'bestiary.art.ownSrd' : 'bestiary.art.own')}
      </Text>
    ) : undefined
  return (
    <ImageViewer
      opened
      onClose={onClose}
      title={name}
      src={src}
      alt={t(imageKind === 'character' ? 'combat.image.portrait' : 'combat.image.creature', {
        name,
      })}
      loading={showingOwn && own.isPending}
      unavailable={!src}
      // New uploads are 1024px squares (older ones 512; the viewer reads the real size on load).
      width={showingOwn ? 1024 : credit?.width}
      height={showingOwn ? 1024 : credit?.height}
      onError={setBroken}
      returnFocus={returnFocus}
      caption={caption}
      actions={
        onChange && (
          <Button
            variant="default"
            leftSection={<ImagePlus size={16} aria-hidden="true" />}
            onClick={onChange}
          >
            {t('bestiary.art.change')}
          </Button>
        )
      }
    />
  )
}
