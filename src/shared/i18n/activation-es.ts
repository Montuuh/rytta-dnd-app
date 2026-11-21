import type { activationEn } from './activation-en'

export const activationEs = {
  'activation.example.open': 'Ver una partida de ejemplo',
  'activation.example.title': 'Un turno, tres vistas',
  'activation.example.turn': 'Emboscada en el puente · Ronda 1 · Turno de Arin',
  'activation.example.dm': 'DM',
  'activation.example.player': 'Jugador',
  'activation.example.table': 'Pantalla compartida',
  'activation.example.dmCaption': 'El DM sigue la iniciativa y puede pasar al siguiente turno.',
  'activation.example.playerCaption':
    'En su móvil, Arin ve a quién le toca y puede terminar su turno.',
  'activation.example.tableCaption': 'Todo el grupo ve el mapa, las fichas y quién tiene el turno.',
  'activation.example.close': 'Cerrar ejemplo',
  'activation.invite.created': 'Invitación lista para {{email}}',
  'activation.invite.share': 'Comparte estas instrucciones con el jugador.',
  'activation.invite.instructions':
    'Te he invitado a {{campaign}} en Rytta. Entra en {{url}} como {{email}}, con Google o con email y contraseña, y acepta la invitación en Mis campañas.',
  'activation.invite.copy': 'Copiar instrucciones',
  'activation.invite.view': 'Ver instrucciones',
  'activation.invite.copied': 'Instrucciones copiadas',
  'activation.invite.copyError': 'Selecciona las instrucciones para copiarlas manualmente.',
  'activation.invite.done': 'Listo',
  'activation.invite.options': 'Opciones de la invitación para {{email}}',
  'activation.campaign.lastOpened': 'Última visita en este dispositivo · {{date}}',
  'activation.campaign.noVisit': 'Sin visitas previas en este dispositivo',
} satisfies Record<keyof typeof activationEn, string>
