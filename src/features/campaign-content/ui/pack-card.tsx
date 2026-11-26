import { Button, Switch } from '@mantine/core'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PackCover } from '@/shared/ui/pack-cover'
import { packInUse, type ContentPack } from '../domain/content'
import { packSwitchId, usePackLine } from './pack-line'

/**
 * RYT-184: a pack is a book: its cover, its short name in the serif face, one line of what it
 * brings and one switch for all of it. "Personalizar" opens its categories.
 */
export function PackCard({
  pack,
  name,
  userId,
  busy,
  onToggle,
  onPersonalise,
}: {
  pack: ContentPack
  name: string
  userId: string | undefined
  busy: boolean
  onToggle: (enabled: boolean) => void
  onPersonalise: (opener: HTMLElement) => void
}) {
  const { t } = useTranslation()
  const line = usePackLine(pack)
  return (
    <li className="tw:flex tw:flex-col tw:gap-1 tw:border-b tw:border-border tw:py-3 tw:last:border-b-0">
      <div className="tw:flex tw:items-start tw:gap-3">
        <PackCover path={pack.cover} title={name} userId={userId} />
        <div className="tw:min-w-0 tw:flex-1">
          <h3 className="user-copy tw:m-0 tw:font-heading tw:text-base tw:leading-snug tw:font-semibold tw:wrap-anywhere">
            {name}
          </h3>
          <p
            className="tw:m-0 tw:mt-0.5 tw:text-sm tw:leading-snug tw:text-muted-foreground"
            data-testid="pack-line"
          >
            {line}
          </p>
        </div>
        <Switch
          id={packSwitchId(pack)}
          className="content-switch tw:self-start tw:-mt-[11px]"
          checked={packInUse(pack)}
          // Busy, not disabled: the switch keeps its place in the tab order and its focus.
          aria-disabled={busy || undefined}
          onChange={(event) => {
            if (!busy) onToggle(event.currentTarget.checked)
          }}
          aria-label={t('campaignContent.usePack', { pack: name })}
        />
      </div>
      {pack.offered && packInUse(pack) && (
        <Button
          variant="subtle"
          size="compact-md"
          // Under the text, not under the cover: cover and gap are 3.5rem, less the button's 0.625rem padding.
          className="tw:ml-[calc(3.5rem-0.625rem)] tw:self-start"
          style={{ minHeight: 44 }}
          rightSection={<ChevronRight size={18} aria-hidden="true" />}
          onClick={(event) => onPersonalise(event.currentTarget)}
          aria-label={t('campaignContent.personaliseLabel', { pack: name })}
        >
          {t('campaignContent.personalise')}
        </Button>
      )}
    </li>
  )
}
