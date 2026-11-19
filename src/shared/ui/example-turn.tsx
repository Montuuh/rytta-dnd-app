import { Modal, Tabs } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { artUrl } from './art-url'
import { useBackToClose } from './use-back-to-close'
import './example-turn.css'

const views = [
  {
    id: 'dm',
    label: 'activation.example.dm',
    caption: 'activation.example.dmCaption',
    width: 820,
    height: 820,
  },
  {
    id: 'player',
    label: 'activation.example.player',
    caption: 'activation.example.playerCaption',
    width: 390,
    height: 660,
  },
  {
    id: 'table',
    label: 'activation.example.table',
    caption: 'activation.example.tableCaption',
    width: 820,
    height: 560,
  },
] as const

export function ExampleTurn({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  useBackToClose(opened, onClose)
  const language = i18n.language === 'en' ? 'en' : 'es'

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('activation.example.title')}
      size="xl"
      classNames={{ title: 'example-turn-title' }}
      closeButtonProps={{ 'aria-label': t('activation.example.close'), size: 44 }}
    >
      <p className="example-turn-context">{t('activation.example.turn')}</p>
      <Tabs defaultValue="dm" keepMounted={false}>
        <Tabs.List className="example-turn-roles" aria-label={t('activation.example.title')}>
          {views.map(({ id, label }) => (
            <Tabs.Tab key={id} value={id} data-autofocus={id === 'dm' || undefined}>
              {t(label)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {views.map(({ id, caption, width, height }) => (
          <Tabs.Panel key={id} value={id}>
            <figure className="example-turn-figure">
              <figcaption>{t(caption)}</figcaption>
              <img
                src={artUrl(`example-turn/${language}-${id}`)}
                width={width}
                height={height}
                alt=""
                draggable={false}
              />
            </figure>
          </Tabs.Panel>
        ))}
      </Tabs>
    </Modal>
  )
}
