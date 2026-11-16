// Rytta homebrew (not SRD content): backpack tiers that lighten the load they carry.
import { gp } from './units.mjs'

const pack = (key, en, es, weightLb, cost, capacityLb, loadReductionPercent, descEn, descEs) => ({
  key,
  source: 'rytta',
  name: { en, es },
  description: { en: descEn, es: descEs },
  descriptionSource: 'rytta',
  category: 'gear',
  icon: 'backpack',
  weightLb,
  costCp: gp(cost),
  properties: { container: { capacityLb, loadReductionPercent } },
})

export const homebrew = [
  pack(
    'reinforcedBackpack',
    'Reinforced Backpack',
    'Mochila reforzada',
    6,
    15,
    40,
    10,
    'A backpack with a stitched frame and wide straps. It holds up to 40 pounds, and what it carries counts 10% lighter toward your load.',
    'Una mochila con armazón cosido y correas anchas. Soporta hasta 20 kg y lo que lleva dentro cuenta un 10 % menos para tu carga.',
  ),
  pack(
    'expeditionPack',
    'Expedition Pack',
    'Mochila de expedición',
    7,
    60,
    60,
    20,
    'A framed pack with a hip belt, built for long journeys. It holds up to 60 pounds, and what it carries counts 20% lighter toward your load.',
    'Una mochila con bastidor y cinturón lumbar, hecha para viajes largos. Soporta hasta 30 kg y lo que lleva dentro cuenta un 20 % menos para tu carga.',
  ),
  pack(
    'masterExplorersPack',
    "Master Explorer's Pack",
    'Mochila de maestro explorador',
    8,
    250,
    90,
    30,
    'A masterwork pack that spreads its weight across the whole body. It holds up to 90 pounds, and what it carries counts 30% lighter toward your load.',
    'Una mochila de artesanía maestra que reparte el peso por todo el cuerpo. Soporta hasta 45 kg y lo que lleva dentro cuenta un 30 % menos para tu carga.',
  ),
]
