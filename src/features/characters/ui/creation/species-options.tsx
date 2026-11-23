import { useEffect } from 'react'
import { Button, Group, Radio, SimpleGrid, Stack, Text } from '@mantine/core'
import { BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGlossary } from '@/features/glossary'
import { localName, pickedOption, traitRef, type SpeciesDef } from '../../domain/origin-catalog'
import type { Build } from '../../domain/sheet'
import { optionText, type Body } from './species-option-text'

/** RYT-111: the species options its definition requires (RYT-171: from the campaign's packs),
 * asked in the wizard as the sheet stores them. */
export function SpeciesOptions({
  build,
  species,
  onChoose,
}: {
  build: Build
  species: SpeciesDef | null
  onChoose: (key: string, value: string) => void
}) {
  const { t, i18n } = useTranslation()
  const glossary = useGlossary()
  const choices = species?.key === build.speciesKey ? species.choices : []
  const keys = choices.map((choice) => choice.trait)
  const traitName = (key: string) => {
    const trait = species?.traits.find((item) => item.key === key)
    return trait ? localName(trait.name, i18n.language) : key
  }
  const requestBodies = glossary?.requestBodies
  useEffect(() => {
    if (keys.length > 0) requestBodies?.()
  }, [keys.length, requestBodies])
  if (keys.length === 0) return null
  return (
    <>
      {choices.map(({ trait: key, options }) => {
        const ref = traitRef(build.speciesKey, key)
        const body = glossary?.bodies?.[ref] as Body | undefined
        return (
          <Radio.Group
            key={key}
            label={traitName(key)}
            value={pickedOption(build, key) ?? null}
            onChange={(value) => onChoose(key, value)}
            required
          >
            <Stack gap="xs" mt="xs">
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs" className="species-options">
                {options.map(({ key: option, name }) => {
                  const label = localName(name, i18n.language)
                  const text = optionText(body, label)
                  return (
                    <Radio.Card
                      key={option}
                      value={option}
                      className="species-option"
                      aria-label={label}
                    >
                      <Group wrap="nowrap" align="flex-start" gap="sm">
                        <Radio.Indicator mt={2} />
                        <div>
                          <Text fw={600} size="sm">
                            {label}
                          </Text>
                          {text && (
                            <Text size="xs" c="dimmed" lineClamp={3}>
                              {text}
                            </Text>
                          )}
                        </div>
                      </Group>
                    </Radio.Card>
                  )
                })}
              </SimpleGrid>
              {glossary?.open && (
                <Button
                  variant="subtle"
                  size="compact-md"
                  mih={44}
                  leftSection={<BookOpen size={16} aria-hidden="true" />}
                  onClick={() => glossary.open(ref)}
                  className="species-options-more"
                >
                  {t('wizard.optionRules', { trait: traitName(key) })}
                </Button>
              )}
            </Stack>
          </Radio.Group>
        )
      })}
    </>
  )
}
