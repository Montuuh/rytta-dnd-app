import type { usernameEn } from './username-en'

/** RYT-078: el nombre de usuario de la cuenta. */
export const usernameEs = {
  'username.section': 'Tu nombre de usuario',
  'username.sectionHelp':
    'Un solo nombre para todas tus campañas. Tus DM lo ven en su lista de miembros.',
  'username.label': 'Nombre de usuario',
  'username.hint': 'De 3 a 24 letras, números o _.',
  'username.checking': 'Comprobando…',
  'username.available': 'Disponible',
  'username.current': 'Es tu nombre de usuario.',
  'username.saved': 'Guardado. Tus mesas ya ven este nombre.',
  'username.save': 'Guardar nombre',
  'username.loading': 'Cargando tu nombre de usuario…',
  'username.problem.length': 'Usa de 3 a 24 caracteres.',
  'username.problem.characters': 'Usa solo letras sin tilde, números y _.',
  'username.problem.reserved': 'Ese nombre está reservado. Prueba otro.',
  'username.error.taken': 'Otra persona ya usa ese nombre. Prueba otro.',
  'username.error.reserved': 'Ese nombre está reservado. Prueba otro.',
  'username.error.invalid': 'Usa de 3 a 24 letras sin tilde, números o _.',
  'username.error.offline': 'Estás sin conexión. Reconecta para guardarlo.',
  'username.error.unavailable': 'No pudimos cargar tu nombre de usuario.',
  'username.promptTitle': 'Elige tu nombre de usuario',
  'username.doneTitle': 'Ya tienes nombre de usuario',
  'username.promptCopy':
    'Tus DM lo verán en lugar de tu correo. Es el mismo en todas tus campañas y puedes cambiarlo en Perfil › Ajustes.',
  'username.promptSave': 'Usar este nombre',
  'username.later': 'Más tarde',
  'username.close': 'Cerrar',
  'username.retry': 'Reintentar',
  'username.checkFailed': 'No pudimos comprobar este nombre ahora. Puedes guardarlo igualmente.',
  'username.error.saveFailed': 'No pudimos guardar tu nombre. Inténtalo de nuevo.',
  'username.promptDone': 'Tus DM te verán como {{name}}. Puedes cambiarlo en Perfil › Ajustes.',
} satisfies Record<keyof typeof usernameEn, string>
