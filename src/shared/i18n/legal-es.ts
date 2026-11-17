import type { legalEn } from './legal-en'

/** RYT-115: política de privacidad y condiciones de uso. */
export const legalEs: Record<keyof typeof legalEn, string> = {
  'legal.back': 'Volver',
  'legal.draft': 'Borrador pendiente de revisión del titular',
  'legal.draftHelp':
    'Este texto es un borrador y no tiene efecto legal hasta que el titular lo apruebe.',
  'legal.effective': 'En vigor desde el {{date}}',
  'legal.draftDate': 'Borrador del {{date}}',
  'legal.contactPending': 'dirección de contacto pendiente, se publicará antes del lanzamiento',
  'legal.other.privacy': 'Leer la política de privacidad',
  'legal.other.terms': 'Leer las condiciones de uso',
  'legal.privacy': 'Política de privacidad',
  'legal.terms': 'Condiciones de uso',
  'legal.links': 'Privacidad y condiciones',
  'legal.linksHelp': 'Qué guarda Rytta sobre ti y las reglas para usarla.',

  'legal.privacy.intro':
    'Rytta es una aplicación de apoyo para el rol de mesa presencial, gestionada por su titular como un proyecto independiente y pequeño. Esta página explica qué guarda la aplicación sobre ti, dónde y qué puedes hacer al respecto.',

  'legal.privacy.who.title': 'Quién gestiona el servicio',
  'legal.privacy.who.p1':
    '{{owner}}, persona física, es responsable del tratamiento de los datos de Rytta. Contacto: {{contact}}.',
  'legal.privacy.who.pending':
    'El servicio lo gestiona su titular, que decide para qué y cómo se usan tus datos. El responsable se identificará antes del lanzamiento. Contacto: {{contact}}.',

  'legal.privacy.collect.title': 'Qué datos recogemos',
  'legal.privacy.collect.p1':
    'Solo lo que la aplicación necesita para iniciar tu sesión y llevar tus partidas:',
  'legal.privacy.collect.l1':
    'El correo y el nombre de tu cuenta de Google, que recibimos cuando inicias sesión con Google mediante Supabase Auth. Rytta nunca ve tu contraseña de Google.',
  'legal.privacy.collect.l2':
    'Tu nombre de usuario, que eliges tú y que ven los miembros de tus campañas.',
  'legal.privacy.collect.l3':
    'Lo que creas o se crea para ti: campañas, pertenencias, invitaciones (el correo invitado se guarda hasta que se acepta o caduca), personajes, inventarios, tiendas, combates, tiradas que registras en una campaña y escenas de mesa.',
  'legal.privacy.collect.l4':
    'Las imágenes y el audio que subes para criaturas, objetos, tiendas y escenas de mesa.',
  'legal.privacy.collect.p2':
    'Estos datos se usan solo para iniciar tu sesión, mostrar tus campañas a las personas con las que juegas y conservar tu partida. No se venden ni se usan para publicidad.',

  'legal.privacy.where.title': 'Dónde se guardan',
  'legal.privacy.where.p1':
    'Los datos de la cuenta y de las partidas y los archivos subidos se guardan en un proyecto de Supabase en la UE (región eu-west-1). Supabase Auth gestiona el inicio de sesión junto con Google.',
  'legal.privacy.where.p2':
    'Los archivos subidos están en almacenamiento privado y cada campaña tiene una cuota de espacio para sus imágenes. Cuando reemplazas una imagen, el archivo anterior se borra. Las páginas de la aplicación son archivos estáticos servidos por GitHub Pages que, como cualquier alojamiento web, ve datos técnicos de la petición, como tu dirección IP, cuando tu navegador las carga. Para ofrecerte actualizaciones, la aplicación también descarga de ese mismo sitio un pequeño archivo con el número de versión; no envía datos tuyos.',

  'legal.privacy.visibility.title': 'Quién ve qué',
  'legal.privacy.visibility.l1':
    'El DM de una campaña ve el correo y el nombre de usuario de cada miembro de esa campaña y las invitaciones que envió.',
  'legal.privacy.visibility.l2':
    'Los jugadores ven los datos del grupo que su DM comparte: personajes, inventarios y encuentros de esa campaña. El material solo del DM les queda oculto. Las tiradas registradas en una campaña se muestran con la visibilidad que fija su DM.',
  'legal.privacy.visibility.l3':
    'Quien no pertenece a tus campañas no puede leer tus datos de juego: la base de datos aplica estas reglas de acceso. El titular puede acceder técnicamente a la base de datos para operar el servicio.',

  'legal.privacy.local.title': 'Almacenamiento del navegador y cookies',
  'legal.privacy.local.p1': 'Rytta guarda unos pocos elementos pequeños en tu navegador:',
  'legal.privacy.local.l1': 'el token de tu sesión, para que sigas dentro;',
  'legal.privacy.local.l2': 'tu idioma, tu tema y tu unidad de peso;',
  'legal.privacy.local.l3':
    'comodidades de la interfaz, como las vistas de lista o cuadrícula, las entradas recientes del glosario, las criaturas favoritas y la última vista de mesa.',
  'legal.privacy.local.p2':
    'Rytta no tiene analítica ni cookies o scripts de publicidad o seguimiento. Si borras los datos del navegador, desaparecen estos elementos y se cierra tu sesión.',

  'legal.privacy.retention.title': 'Cuánto tiempo los guardamos',
  'legal.privacy.retention.p1':
    'Tus datos se conservan mientras exista tu cuenta, para que tus campañas sigan disponibles. Cuando eliminas tu cuenta desde Ajustes, se borran tu perfil, tus membresías y las campañas donde eres el único miembro, con sus imágenes. En las campañas compartidas se conserva el historial sin tu nombre y tus personajes vuelven a la reserva de la campaña. Las copias de seguridad de la base de datos se borran cuando caducan.',

  'legal.privacy.rights.title': 'Tus derechos',
  'legal.privacy.rights.p1':
    'Puedes ver, corregir, exportar y eliminar tus datos, y oponerte a cómo se usan. Desde Ajustes puedes cambiar tu nombre de usuario, exportar tus datos y eliminar tu cuenta. Para cualquier otra cosa, escribe al contacto indicado arriba. Si vives en la UE, también puedes reclamar ante tu autoridad de protección de datos.',

  'legal.privacy.age.title': 'Edad mínima',
  'legal.privacy.age.p1':
    'Rytta es para personas de 14 años o más, la edad a partir de la cual en España puedes consentir el tratamiento de tus datos. No conservamos a sabiendas cuentas de menores de 14 años. Si crees que una cuenta es de alguien más joven, escribe al contacto indicado arriba: la eliminaremos junto con sus datos.',

  'legal.privacy.third.title': 'Terceros',
  'legal.privacy.third.p1':
    'Google (inicio de sesión), Supabase (base de datos, inicio de sesión y archivos) y GitHub (alojamiento de las páginas) tratan datos como se describe arriba. Los dados 3D, las ilustraciones y el texto de reglas forman parte de la aplicación y se cargan desde el mismo sitio; no envían tus datos a nadie.',

  'legal.privacy.changes.title': 'Cambios en esta política',
  'legal.privacy.changes.p1':
    'Cuando cambie esta política, cambiarán esta página y su fecha. Consúltala de vez en cuando.',

  'legal.terms.intro':
    'Estas condiciones se aplican cuando usas Rytta, una aplicación de apoyo para el rol de mesa presencial. Al iniciar sesión las aceptas.',

  'legal.terms.service.title': 'El servicio',
  'legal.terms.service.p1':
    'Rytta se ofrece tal cual, sin garantía. Puede cambiar, interrumpirse o perder funciones. Guarda tus propias notas de todo lo que no puedas permitirte perder.',

  'legal.terms.age.title': 'Edad mínima',
  'legal.terms.age.p1':
    'Para usar una cuenta de Rytta debes tener al menos 14 años. Si tienes menos, no crees una cuenta.',

  'legal.terms.use.title': 'Uso aceptable',
  'legal.terms.use.p1': 'Al usar Rytta, te comprometes a no:',
  'legal.terms.use.l1': 'subir ni compartir contenido ilegal;',
  'legal.terms.use.l2':
    'subir material que no tengas derecho a usar: respeta la propiedad intelectual ajena;',
  'legal.terms.use.l3':
    'acosar a otros miembros ni intentar leer datos de campañas a las que no perteneces;',
  'legal.terms.use.l4':
    'abusar del servicio ni de sus cuotas, ni intentar saltarte sus límites o sus reglas de acceso.',

  'legal.terms.content.title': 'Tu contenido',
  'legal.terms.content.p1':
    'Lo que creas o subes sigue siendo tuyo. Permites que Rytta lo guarde y lo muestre a los miembros de tus campañas, solo para prestar el servicio.',

  'legal.terms.srd.title': 'Contenido de reglas y atribución',
  'legal.terms.srd.p1':
    'El texto de reglas del glosario y de las herramientas de personaje procede del System Reference Document, con este aviso:',

  'legal.terms.art.title': 'Ilustraciones',
  'legal.terms.art.p1':
    'Las ilustraciones de la interfaz se generaron para Rytta y pertenecen a Rytta. No pueden reutilizarse como colección aparte sin permiso.',

  'legal.terms.end.title': 'Terminar el uso',
  'legal.terms.end.p1':
    'Puedes dejar de usar Rytta y eliminar tu cuenta desde Ajustes cuando quieras. El titular puede suspender o eliminar una cuenta que incumpla estas condiciones o ponga en riesgo el servicio o a otras personas.',

  'legal.terms.liability.title': 'Limitación de responsabilidad',
  'legal.terms.liability.p1':
    'En la medida en que la ley lo permita, el titular no responde de la pérdida de datos de juego, las interrupciones ni los daños indirectos derivados de usar Rytta. Nada de esto limita derechos que la ley no permite limitar.',

  'legal.terms.law.title': 'Ley aplicable',
  'legal.terms.law.p1':
    'Estas condiciones se rigen por la ley española. Los conflictos se resolverán ante los tribunales que correspondan según la normativa española de consumidores y usuarios.',

  'legal.terms.changes.title': 'Cambios y contacto',
  'legal.terms.changes.p1':
    'Cuando cambien estas condiciones, cambiarán esta página y su fecha. Consultas: {{contact}}.',
}
