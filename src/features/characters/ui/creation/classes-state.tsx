import { Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { LibraryWait } from './library-wait'

/**
 * RYT-167: classes come only from the campaign's packs. Beside a class choice this says when they
 * are still loading (with a retry when the library cannot be reached) or when the campaign offers
 * none. Nothing is shown once there are classes to choose.
 */
export function ClassesState({
  loaded,
  offered,
  wait = true,
  quick = false,
}: {
  /** The campaign's class catalog has arrived. */
  loaded: boolean
  /** How many classes the choice lists. */
  offered: number
  /** False where another notice already waits for the library. */
  wait?: boolean
  /** The quick path, which only builds SRD classes. */
  quick?: boolean
}) {
  const { t } = useTranslation()
  if (!loaded) return wait ? <LibraryWait ready={false} subject="classes" /> : null
  if (offered > 0) return null
  return (
    <Text size="sm" role="status" className="classes-none">
      {t(quick ? 'creation.classes.noneQuick' : 'creation.classes.none')}
    </Text>
  )
}
