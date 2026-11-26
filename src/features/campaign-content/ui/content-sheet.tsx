import type { ReactNode } from 'react'
import { CloseButton } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/shared/ui/kit/drawer'
import { useBackToClose } from '@/shared/ui/use-back-to-close'

/**
 * RYT-184: the sheet the content panel opens its details in. It rises from the bottom on phones
 * and slides in from the right from tablet width (48em), follows the finger, closes with Escape,
 * the close button, a swipe or the phone's Back button, and gives focus back to `finalFocus`.
 * `top` stays in view above the scrolling body, `footer` below it.
 */
export function ContentSheet({
  open,
  onClose,
  onClosed,
  title,
  description,
  top,
  footer,
  finalFocus,
  tall = false,
  children,
}: {
  open: boolean
  /** Asked for by Escape, the close button, a swipe or Back; must be safe to call twice. */
  onClose: () => void
  /** The exit animation is over: unmount whatever the sheet showed. */
  onClosed: () => void
  title: string
  description?: string
  top?: ReactNode
  footer?: ReactNode
  finalFocus?: () => HTMLElement | null
  /** Fill the phone's height (a long list); otherwise the sheet is as tall as its content. */
  tall?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const wide = useMediaQuery('(min-width: 48em)', false, { getInitialValueInEffect: false })
  useBackToClose(open, onClose)
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed()
      }}
      swipeDirection={wide ? 'right' : 'down'}
      showSwipeHandle={!wide}
    >
      <DrawerContent
        finalFocus={finalFocus}
        className={cn(
          'tw:data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-3rem)]',
          tall && 'tw:data-[swipe-axis=y]:[--drawer-content-height:min(46rem,calc(100dvh-3rem))]',
          'tw:data-[swipe-axis=x]:[--drawer-content-width:min(30rem,100vw)]',
        )}
      >
        <DrawerHeader className="tw:flex-row tw:items-start tw:justify-between tw:gap-3 tw:pr-2 tw:pb-2">
          <div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1 tw:pt-2.5">
            <DrawerTitle className="user-copy tw:text-lg tw:leading-snug tw:wrap-anywhere">
              {title}
            </DrawerTitle>
            {description && (
              <DrawerDescription className="tw:text-wrap!">{description}</DrawerDescription>
            )}
          </div>
          {/* The same Mantine close button the panel's modal has; the drawer's part closes it. */}
          <DrawerClose
            render={
              <CloseButton size={44} className="tw:shrink-0" aria-label={t('common.close')} />
            }
          />
        </DrawerHeader>
        {top && <div className="tw:shrink-0 tw:px-4 tw:pb-2">{top}</div>}
        <div className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:overscroll-contain tw:px-4 tw:pb-4">
          {children}
        </div>
        {footer && (
          <div className="tw:shrink-0 tw:border-t tw:border-border tw:bg-popover tw:p-4 tw:pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
