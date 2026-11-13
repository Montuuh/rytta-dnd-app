import type { viewerEn } from './viewer-en'

/** RYT-098: el visor a pantalla completa de retratos, criaturas e imágenes de objetos. */
export const viewerEs = {
  'viewer.close': 'Cerrar la imagen',
  'viewer.zoom': 'Ampliar',
  'viewer.loading': 'Cargando la imagen',
  'viewer.unavailable': 'No se puede mostrar esta imagen ahora.',
  'viewer.open': 'Ver la imagen de {{name}}',
  'viewer.alt': 'Imagen de {{name}}',
} satisfies Record<keyof typeof viewerEn, string>
