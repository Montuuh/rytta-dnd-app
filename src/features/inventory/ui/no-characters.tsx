import { Anchor, Text } from '@mantine/core'
import { Trans } from 'react-i18next'
import { Link } from 'react-router'

/** Nobody to give to: one sentence with the way to Party, where characters are made. */
export function NoCharacters({ campaignId }: { campaignId: string }) {
  return (
    <Text>
      <Trans
        i18nKey="store.noCharacters"
        components={{
          party: (
            <Anchor component={Link} to={`/campaign/${campaignId}/party`} underline="always" />
          ),
        }}
      />
    </Text>
  )
}
