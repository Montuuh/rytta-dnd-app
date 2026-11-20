import { useEffect } from 'react'
import { Button, Group, Radio, SimpleGrid, Stack, Text } from '@mantine/core'
import { BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGlossary } from '@/features/glossary'
import { traitRef } from '../../domain/resources'
import type { Build } from '../../domain/sheet'
import { choiceKeys, traitChoices, type ChoiceKey } from '../../domain/srd'
import { optionText, type Body } from './species-option-text'

const choiceName = (choice: ChoiceKey, option: string) =>
  `srd.choice.${choice}.${option}` as 'srd.choice.giantAncestry.fire'

/** RYT-111: the species options the SRD requires, asked in the wizard as the sheet stores them. */
export function SpeciesOptions({
  build,
  onChoose,
}: {
  build: Build
  onChoose: (key: ChoiceKey, value: string) => void
}) {
  const { t } = useTranslation()
  const glossary = useGlossary()
  const keys = choiceKeys.filter((key) => traitChoices[key].species === build.speciesKey)
  const requestBodies = glossary?.requestBodies
  useEffect(() => {
    if (keys.length > 0) requestBodies?.()
  }, [keys.length, requestBodies])
  if (keys.length === 0) return null
  return (
    <>
      {keys.map((key) => {
        const ref = traitRef(build.speciesKey, key)
        const body = glossary?.bodies?.[ref] as Body | undefined
        return (
          <Radio.Group
            key={key}
            label={t(`srd.trait.${key}`)}
            value={build.choices?.[key] ?? null}
            onChange={(value) => onChoose(key, value)}
            required
          >
            <Stack gap="xs" mt="xs">
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs" className="species-options">
                {traitChoices[key].options.map((option) => {
                  const label = t(choiceName(key, option))
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
                  {t('wizard.optionRules', { trait: t(`srd.trait.${key}`) })}
                </Button>
              )}
            </Stack>
          </Radio.Group>
        )
      })}
    </>
  )
}
