import type { accountEn } from './account-en'

/** RYT-115: exportar y eliminar la cuenta en Ajustes, y el aviso tras eliminarla. */
export const accountEs = {
  'account.title': 'Tu cuenta',
  'account.help': 'Llévate una copia de tus datos o elimina tu cuenta para siempre.',
  'account.deletedUser': 'Cuenta eliminada',

  'account.export.heading': 'Tus datos',
  'account.export.copy':
    'Un archivo JSON con tu perfil, tus membresías, los personajes que juegas, su inventario y lo que creaste en tus mesas. Las notas solo del DM nunca se incluyen.',
  'account.export.button': 'Descargar mis datos',
  'account.export.busy': 'Preparando tu archivo…',
  'account.export.done': 'Guardado como {{file}}.',
  'account.export.truncated': 'El archivo incluye las primeras {{rows}} filas de: {{sections}}.',
  'account.section.memberships': 'membresías',
  'account.section.characters': 'personajes',
  'account.section.inventory': 'inventario',
  'account.section.invitations': 'invitaciones',
  'account.section.shop_orders': 'pedidos de tienda',
  'account.section.trades': 'intercambios',
  'account.section.item_proposals': 'propuestas de objetos',
  'account.section.rest_requests': 'solicitudes de descanso',
  'account.section.character_events': 'historial de personajes',
  'account.section.inventory_events': 'historial de inventario',
  'account.section.combat_events': 'historial de combate',
  'account.section.item_definitions': 'objetos que creaste',
  'account.section.glossary_entries': 'entradas del glosario',
  'account.section.content_packs': 'paquetes de contenido',
  'account.section.other': 'otros apartados',
  'account.export.error': 'No pudimos preparar tus datos. Inténtalo de nuevo.',
  'account.export.offline': 'Sin conexión. Reconecta para descargar tus datos.',
  'account.export.signIn': 'Tu sesión terminó. Inicia sesión de nuevo para descargar tus datos.',

  'account.delete.heading': 'Dejar Rytta',
  'account.delete.copy':
    'Es permanente. Las campañas donde eres el único miembro y sus imágenes se van con ella. Las campañas compartidas conservan su historial sin tu nombre.',
  'account.delete.button': 'Eliminar mi cuenta…',

  'account.dialog.title': 'Eliminar tu cuenta',
  'account.dialog.loading': 'Comprobando tus campañas…',
  'account.dialog.loadError': 'No pudimos comprobar tus campañas. Inténtalo de nuevo.',
  'account.dialog.close': 'Cerrar',

  'account.blocked.lead':
    'Eres el único DM de estas campañas y aún tienen más miembros. No puedes eliminar tu cuenta hasta que eso cambie.',
  'account.blocked.others': 'Otros miembros: {{count}}',
  'account.blocked.open': 'Miembros',
  'account.blocked.openLabel': 'Miembros de {{name}}',
  'account.blocked.ways':
    'Hay dos salidas: pasar el rol de DM a otro miembro, o quitar a los demás miembros. Después vuelve aquí.',

  'account.confirm.deletes': 'Qué se elimina',
  'account.confirm.deletes1': 'Tu perfil y tus membresías.',
  'account.confirm.deletes2': 'Las campañas donde eres el único miembro, con todo su contenido.',
  'account.confirm.deletes3': 'Las imágenes que subiste a esas campañas.',
  'account.confirm.stays': 'Qué se queda',
  'account.confirm.stays1': 'Tu historial en las campañas compartidas, sin tu nombre.',
  'account.confirm.stays2':
    'Tus personajes en las campañas compartidas, que vuelven a la reserva de la campaña.',
  'account.confirm.final': 'No se puede deshacer.',
  'account.confirm.download': 'Descargar mis datos antes',
  'account.confirm.label': 'Escribe {{word}} para confirmar',
  'account.confirm.hint':
    'El botón se activa al escribir la palabra en inglés; las mayúsculas dan igual.',
  'account.confirm.submit': 'Eliminar cuenta para siempre',
  'account.confirm.busy': 'Eliminando…',
  'account.confirm.cancel': 'Conservar mi cuenta',

  'account.error.blocked':
    'Una campaña bloqueó la eliminación, pero ahora no aparece ninguna. Inténtalo de nuevo; si falla otra vez, espera un momento.',
  'account.error.confirmation': 'La palabra no coincide. Escríbela tal como se muestra.',
  'account.error.storage':
    'No pudimos quitar tus imágenes subidas, así que no se eliminó nada. Inténtalo de nuevo.',
  'account.error.offline': 'Sin conexión. No se envió nada: reconecta y vuelve a pulsar Eliminar.',
  'account.error.signIn': 'Tu sesión terminó. Inicia sesión de nuevo y reintenta.',
  'account.error.unavailable': 'No pudimos eliminar tu cuenta. Inténtalo de nuevo en un momento.',

  'account.done.title': 'Tu cuenta se eliminó',
  'account.done.deleted': 'Tus datos y tu registro de acceso ya no existen.',
  'account.done.disabled':
    'Tus datos ya no existen. Tu registro de acceso está desactivado: no sirve para iniciar sesión y no guarda datos de la aplicación. Podrás pedir que se elimine cuando el servicio publique su dirección de contacto.',
  'account.done.kept':
    'Tus datos ya no existen. Tu registro de acceso sigue ahí, sin datos de la aplicación. Podrás pedir que se elimine cuando el servicio publique su dirección de contacto.',
  'account.done.disabledContact':
    'Tus datos ya no existen. Tu registro de acceso está desactivado y no sirve para iniciar sesión. Para que se elimine, escribe al titular.',
  'account.done.keptContact':
    'Tus datos ya no existen, pero tu registro de acceso sigue ahí. Para que se elimine, escribe al titular.',
  'account.done.email': 'Escribir al titular',
  'account.done.privacy': 'Ver quién gestiona el servicio',
  'account.done.dismiss': 'Cerrar aviso',
} satisfies Record<keyof typeof accountEn, string>
