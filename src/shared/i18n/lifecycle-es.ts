import type { lifecycleEn } from './lifecycle-en'

// RYT-032 item delete, linked price sync, the reworked forge and DM "Add item" for a character.
export const lifecycleEs = {
  'store.delete': 'Eliminar',
  'store.deleteItem': 'Eliminar {{name}}',
  'lifecycle.deleteTitle': '¿Eliminar {{name}}?',
  'lifecycle.deleteBody': 'Sale del almacén y ya no se podrá dar ni vender.',
  'lifecycle.checking': 'Comprobando dónde se usa este objeto…',
  'lifecycle.impactShops_one': 'Se retira de {{count}} tienda:',
  'lifecycle.impactShops_other': 'Se retira de {{count}} tiendas:',
  'lifecycle.impactHolders_one':
    '{{count}} personaje lo conserva en su mochila ({{units}} en total). No se le quita nada.',
  'lifecycle.impactHolders_other':
    '{{count}} personajes lo conservan en sus mochilas ({{units}} en total). No se les quita nada.',
  'lifecycle.impactNone': 'Ninguna tienda lo vende y ningún personaje lo lleva.',
  'lifecycle.openOrders_one':
    'Hay {{count}} pedido abierto con este objeto. Respóndelo en Tiendas antes de eliminarlo.',
  'lifecycle.openOrders_other':
    'Hay {{count}} pedidos abiertos con este objeto. Respóndelos en Tiendas antes de eliminarlo.',
  'lifecycle.impactError':
    'No se pudo comprobar dónde se usa este objeto. Reintenta antes de eliminarlo.',
  'lifecycle.deleteConfirm': 'Eliminar objeto',
  'lifecycle.keep': 'Conservar',
  'lifecycle.deleted': '{{name}} se eliminó del almacén.',
  'lifecycle.deleteError': 'No se pudo eliminar el objeto. Puedes reintentarlo.',
  'lifecycle.stale': 'Otra persona cambió este objeto. Revísalo y vuelve a intentarlo.',
  'lifecycle.syncTitle': '¿Actualizar precios en tiendas?',
  'lifecycle.syncBody':
    'El valor de {{name}} ahora es {{value}} po. Estas tiendas lo venden a otro precio.',
  'lifecycle.syncShops': 'Tiendas que actualizar',
  'lifecycle.syncCurrent': 'Ahora',
  'lifecycle.syncApply_one': 'Actualizar {{count}} precio',
  'lifecycle.syncApply_other': 'Actualizar {{count}} precios',
  'lifecycle.syncSkip': 'Mantener precios',
  'lifecycle.syncDone_one': '{{name}} guardado y {{count}} precio de tienda actualizado.',
  'lifecycle.syncDone_other': '{{name}} guardado y {{count}} precios de tienda actualizados.',
  'lifecycle.syncError': 'No se pudieron actualizar los precios. Reintenta o mantenlos.',
  'forge.preview': 'Vista previa del objeto',
  'forge.unnamed': 'Objeto sin nombre',
  'forge.dropTitle': 'Suelta una imagen aquí o elige un archivo',
  'forge.dropActive': 'Suelta para usar esta imagen',
  'forge.replaceImage': 'Cambiar imagen',
  'forge.weightUnit': '{{value}} lb',
  'forge.properties': 'Detalles de combate',
  'addItem.title': 'Añadir un objeto para {{name}}',
  'addItem.existing': 'Objeto existente',
  'addItem.existingHint': 'Elige uno del almacén y cuántas unidades.',
  'addItem.create': 'Crear nuevo',
  'addItem.createHint': 'Fórjalo ahora. Se guarda en el almacén y se entrega a {{name}}.',
  'addItem.search': 'Buscar en el almacén',
  'addItem.empty': 'El almacén está vacío. Crea un objeto nuevo.',
  'addItem.pickGroup': 'Objetos del almacén',
  'addItem.give': 'Dar {{amount}} a {{name}}',
  'addItem.pickFirst': 'Elige primero un objeto',
  'addItem.given': '{{item}} ×{{amount}} entregado a {{name}}.',
  'addItem.error': 'No se pudo dar el objeto. Puedes reintentarlo.',
} satisfies Record<keyof typeof lifecycleEn, string>
