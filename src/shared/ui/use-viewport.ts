import { useMediaQuery } from '@mantine/hooks'

// Read the query on the first render: overlays mount when opened, and an effect-time value
// would paint the desktop variant (a side drawer) on phones before switching.
const now = { getInitialValueInEffect: false }

/** Phones: below Mantine's `sm` breakpoint (48em), where the bottom bar replaces the top row. */
export const usePhone = () => useMediaQuery('(max-width: 47.99em)', undefined, now)

/** Laptops and landscape tablets: Mantine's `md` breakpoint (62em) and up. */
export const useWide = () => useMediaQuery('(min-width: 62em)', undefined, now)
