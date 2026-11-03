import type { ReactNode, Ref } from 'react'
import { Text, Title } from '@mantine/core'

/** The one page heading: an h1 with a short lede, plus primary actions and the refresh
 * control on the same band. Phones keep the band compact so content starts above the fold. */
export function PageHead({
  title,
  description,
  eyebrow,
  actions,
  refresh,
  headingRef,
  titleClassName,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  refresh?: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
  titleClassName?: string
  children?: ReactNode
}) {
  return (
    <div className="page-head">
      <div className="page-head-main">
        {eyebrow && <Text className="eyebrow">{eyebrow}</Text>}
        <Title
          order={1}
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className={titleClassName}
        >
          {title}
        </Title>
        {description && <Text className="page-head-lede">{description}</Text>}
        {children}
      </div>
      {(actions || refresh) && (
        <div className="page-head-actions">
          {actions}
          {refresh && <div className="page-head-refresh">{refresh}</div>}
        </div>
      )}
    </div>
  )
}
