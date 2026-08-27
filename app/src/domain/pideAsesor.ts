/**
 * EL AGUJERO NEGRO: 151 CLIENTES CALLADOS PARA SIEMPRE.
 *
 * Auditoría de producción, 27-ago-2026, sobre 1.244 conversaciones: **167
 * clientes escribieron último y nunca recibieron respuesta**. De esos, 155
 * estaban en `assigned_to='human'` sin que ningún asesor hubiera escrito NUNCA,
 * y 151 tenían `bot_paused_until = 'infinity'`. Lo que dijeron para merecerlo:
 *
 *   «Precio dd cada llanta rim 15 /55»                       (conv 6439)
 *   «En qué precio está está versión»                        (conv 11274)
 *   «Cumbaya si va bien este sábado, quiero ver las llantas
 *    para decidir»                                           (conv 11251)
 *   «Valor de la Kenda en las medidas R14_60_195»            (conv 1939)
 *
 * Ventas vivas, algunas con el día de visita puesto, en silencio permanente.
 *
 * TRES FALLAS ENCADENADAS, y esta es la primera:
 *
 * 1. El detector era `/\b(asesor|humano|persona|vendedor|hablar con alguien)\b/`
 *    — LA PALABRA SUELTA. El propio bot dice «se lo confirma el asesor en
 *    tienda» en casi todos los turnos, así que al cliente le bastaba con
 *    repetirlo («¿y qué dice el asesor?», «gracias al asesor») para quedar
 *    marcado. «persona» y «vendedor» son peores todavía.
 * 2. La pausa se ponía en `infinity`, y `devolverAlBotSiVencioLaPausa` solo
 *    devuelve el chat cuando la pausa VENCE. Infinity no vence nunca.
 * 3. El bot ni siquiera acusaba recibo: `handleInboundFollowUpState` pone la
 *    pausa en la línea 90 de index.ts y `isBotPaused` corta en la 182, así que
 *    el turno donde el cliente pide el asesor sale mudo.
 *
 * Acá vive la primera. Ahora se exige un PEDIDO, no una mención.
 *
 * Puro a propósito: se prueba sin base y sin modelo.
 */

const normalizar = (texto: string) =>
  (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** A quién puede pedir que le pasen. */
const QUIEN = "(?:asesor\\w*|vendedor\\w*|humano|persona|alguien|encargad\\w+|due[nñ]\\w+|jefe|supervisor)";

/**
 * Las formas de PEDIRLO. Todas exigen un verbo de contacto o de traspaso:
 * mencionar al asesor no es pedirlo.
 */
const PIDE_ASESOR = new RegExp(
  // «quiero/necesito/puedo hablar con un asesor», «me gustaría hablar con alguien»
  `(?:quiero|quisiera|necesito|puedo|podr[ií]a|me\\s+gustar[ií]a|deseo|prefiero)\\s+(?:\\w+\\s+){0,3}(?:hablar|comunicarme|conversar|tratar)\\s+con\\s+(?:un[ao]?\\s+|el\\s+|la\\s+)?${QUIEN}`
  // «me pasa con un asesor», «páseme con alguien», «me comunica con el vendedor»
  + `|(?:me\\s+)?(?:pasa|pase|pasas|pasen|paseme|comunica|comunique|transfiere|transfiera|deriva|derive|conecta)\\s+(?:me\\s+)?con\\s+(?:un[ao]?\\s+|el\\s+|la\\s+)?${QUIEN}`
  // «quiero un asesor», «necesito una persona», «páseme un asesor»
  + `|(?:quiero|quisiera|necesito|deseo|dame|deme|p[aá]same|p[aá]seme|me\\s+da)\\s+(?:un[ao]?\\s+|el\\s+|la\\s+)?${QUIEN}`
  // «hablar con un asesor por favor», «con un humano por favor»
  + `|hablar\\s+con\\s+(?:un[ao]?\\s+|el\\s+|la\\s+)?${QUIEN}`
  // «atiende un humano?», «hay alguien real?», «esto es un bot?»
  + `|(?:atiende|contesta|responde|hay|est[aá])\\s+(?:me\\s+)?(?:un[ao]?\\s+)?(?:${QUIEN}|real)\\b`
  + `|\\b(?:eres|sos|es)\\s+(?:un\\s+)?(?:bot|robot|m[aá]quina|ia|inteligencia artificial)\\b`
  + `|\\bno\\s+quiero\\s+(?:hablar\\s+con\\s+)?(?:un\\s+)?(?:bot|robot|m[aá]quina)\\b`,
);

/**
 * ¿El cliente está PIDIENDO que lo atienda una persona?
 *
 * Falso para todo lo demás, incluido nombrar al asesor —que es lo que el bot le
 * enseña a decir en cada turno— y preguntar por él.
 */
export function pideUnAsesor(mensajeDelCliente: string): boolean {
  return PIDE_ASESOR.test(normalizar(mensajeDelCliente));
}

/**
 * Lo que el bot contesta ANTES de callarse.
 *
 * Sin esto el pedido cae en un silencio que el cliente no puede distinguir de
 * un chat roto: no sabe si su mensaje llegó, ni cuándo le van a contestar. Es
 * un mensaje y cuesta cero.
 */
export const AVISO_DE_TRASPASO =
  "Listo, ya le avisé a un asesor para que le escriba por aquí 🤝\n"
  + "Si mientras tanto necesita un precio o una medida, dígame nomás y se lo paso al toque.";
