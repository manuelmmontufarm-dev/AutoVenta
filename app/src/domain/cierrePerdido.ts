/**
 * CERRAR UNA VENTA COMO PERDIDA BORRA LA CONVERSACIÓN. Que no lo decida una
 * queja de precio.
 *
 * Producción, 27-ago-2026, conv 3. El cliente tenía cotizadas 8 llantas por
 * $821.53 y escribió: **«chuta ta carisisimo oe»**. El clasificador lo leyó
 * como venta perdida:
 *
 *   02:30:24  cotizacion_enviada → perdido   «Clasificación del último mensaje»
 *
 * Cerrar deja `status='closed'`, y el mensaje siguiente REABRE la conversación
 * en un ciclo nuevo: se vacían `tire_size`, el producto, la cantidad y la
 * cotización. Por eso, dos mensajes después, el bot le pidió la medida que ya
 * tenía — no se le había olvidado, se la habían borrado. Manuel: «hasta regresó
 * a pedirme la medida que ya sabía, no entiendo por qué si ya la tenía».
 *
 * Y una queja de precio es justo lo contrario de una venta perdida: es la
 * objeción más común del oficio y el momento en que hay que vender. La rúbrica
 * ya decía «el cliente rechazó explícitamente continuar»; el modelo igual la
 * estiró. Así que el permiso deja de ser una petición y pasa a ser evidencia:
 * sin un rechazo de verdad en el texto del cliente, no se cierra.
 *
 * Las pérdidas reales siguen teniendo su camino: el asesor cierra desde el
 * panel, y el sistema le recomienda hacerlo con la alerta `recommend_close_lost`
 * cuando el cliente lleva días sin contestar.
 */
/**
 * SOLO LO SUPER OBVIO CIERRA (Manuel, 27-ago-2026).
 *
 * La lista de antes tenía dos agujeros que costaban ventas vivas:
 *
 * 1. `en otro lado` y `otro lugar` disparaban SOLOS, sin verbo de compra. «en
 *    otro lado me dan más barato» es una negociación —el mejor momento de la
 *    venta— y se leía como una despedida. Ahora el lugar solo cuenta si viene
 *    con la compra hecha: «ya compré en otro lugar».
 * 2. El colador terminaba en `isNegativeResponse`, que marca «mejor no», «solo
 *    estoy preguntando»… y **«otro día»**. «Otro día» es uno de los tres
 *    BOTONES que el propio bot le pone al cliente en la pregunta de visita
 *    (ver `domain/botones.ts`): tocar el botón del bot cerraba la venta como
 *    perdida y le borraba el ciclo. Un no blando es «todavía no», no «nunca».
 *
 * Cerrar deja `status='closed'` y el mensaje siguiente reabre en un ciclo
 * nuevo: se vacían medida, producto, cantidad y cotización. El precio de
 * equivocarse hacia el cierre es perder todo el contexto; el de no cerrar es
 * que el asesor le dé un clic en el panel. No son comparables.
 */
const RECHAZO_ROTUNDO =
  /\b(?:no me interesa|ya no me interesa|no me sirve|deje?n? de escribir\w*|no me escriba\w*|no me contacte\w*|no me moleste\w*|dar de baja|desuscribir\w*|ya no necesito)\b/;

// «Ya compré» A SECAS no cierra: puede ser «ya compré con ustedes», que es una
// venta GANADA. Para cerrar como perdida hace falta que nombre el otro lado —
// eso lo decide COMPRO_EN_OTRO_LADO.

/**
 * «Ya compré», «ya conseguí» y parientes, pero EN OTRO LADO. Se exige que la
 * compra y el otro lugar estén en el mismo mensaje: «ya compré» a secas puede
 * ser «ya compré con ustedes», que es una venta GANADA, no perdida.
 */
const COMPRO_EN_OTRO_LADO =
  /\b(?:compre|comprado|consegui|encontre|adquiri|pedi|puse|cambie|monte)\b[^.!?]{0,40}\b(?:en otro|otro lugar|otro lado|otra parte|otra llantera|en otra)\b/;

/**
 * La compra quedó hecha «acá/aquí en» otra ciudad.
 *
 * Conv 11818, 27-ago-2026: «Ya Ise el pedido aquí en Ibarra gracias». No dice
 * «otro lado», pero 50 segundos después de aceptar nuestra recomendación está
 * avisando que ya compró allá. Conv 7085: «Ya conseguí acá en manabi». Se
 * exige un verbo de compra o «hice/ise el pedido»: «hice la cotización acá en
 * Cayambe» sigue siendo negociación. Y se excluyen los dos locales reales y
 * «con ustedes/Depot», que son una venta ganada.
 */
const COMPRO_EN_OTRA_CIUDAD =
  /\b(?:(?:ya\s+)?(?:hice|ise)\s+(?:el\s+)?pedido|(?:ya\s+)?(?:compre|consegui|adquiri|pedi|monte|cambie))\b[^.!?]{0,40}\b(?:aqui|aca)\s+en\s+(?!(?:cumbaya|quito\s+sur|depot)\b)/;

/** Fuente única para cierre perdido y para no contar la compra como nuestra. */
export function comproEnOtroLugar(mensajeDelCliente: string): boolean {
  const n = normalizar(mensajeDelCliente);
  if (/\b(?:con ustedes|en depot|depot tire)\b/.test(n)) return false;
  return COMPRO_EN_OTRO_LADO.test(n) || COMPRO_EN_OTRA_CIUDAD.test(n);
}

/**
 * Quejarse del precio NUNCA cierra, ni con un «no» al lado.
 *
 * «No me alcanza» tiene un «no» y `isNegativeResponse` lo marca, pero es la
 * objeción de precio con otras palabras: el cliente sigue queriendo la llanta,
 * lo que no le cuadra es la plata. Cerrar ahí tira la cotización, la medida y
 * el local — y ese es el turno en que un vendedor recién empieza a trabajar.
 */
const QUEJA_DE_PRECIO =
  /\b(?:car[oa]s?|car[ií]simo|costoso|muy alto|elevado|no me alcanza|no alcanza|mucha plata|mucho dinero|fuera de mi presupuesto|se pasa)\b/;

const normalizar = (texto: string) =>
  texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * ¿El mensaje del cliente alcanza para cerrar la venta como perdida?
 *
 * Se exige evidencia ROTUNDA en SU texto: o dice que no le interesa / que no
 * le escriban más, o dice que ya compró nombrando el otro lado. Todo lo demás
 * —quejarse del precio, pedir tiempo, «mejor no», «otro día», discutir la
 * marca— es la conversación de venta, no su final.
 */
export function puedeCerrarComoPerdido(mensajeDelCliente: string): boolean {
  const n = normalizar(mensajeDelCliente);
  // Un rechazo rotundo manda siempre: si dice «no me interesa» aunque además
  // se queje del precio, se respeta.
  if (RECHAZO_ROTUNDO.test(n) || comproEnOtroLugar(n)) return true;
  // En la duda NO se cierra: dejar viva una conversación muerta la cierra el
  // asesor con un clic; cerrar una viva le borra el ciclo al cliente. Y en la
  // duda entra TODO lo demás — el no blando, la queja de precio, el «otro
  // día» del botón. Ver el comentario de RECHAZO_ROTUNDO.
  return false;
}

/**
 * La despedida cuando la venta se perdió de verdad.
 *
 * Producción, 27-ago, conv 4732: el cliente escribió «Gracias ya compré en otro
 * lugar» y en el MISMO turno recibió «¿Qué día cree que puede pasar por Depot
 * Tire Cumbayá? … con 25 % de descuento, $73.92 menos». No lo escribió el
 * modelo: lo pegó `insistirConLoQueFalta`, que lee la base y no el mensaje del
 * cliente. Insistirle con el descuento a alguien que acaba de decir que compró
 * en otro lado es el peor mensaje posible — y encima queda por escrito.
 *
 * Manuel pidió que en ese caso la última palabra sea esta. No cuesta nada, y
 * el cliente que compró llantas hoy vuelve por alineación en tres meses.
 */
export const DESPEDIDA_VENTA_PERDIDA =
  "Me alegro por su compra 🙌 Cualquier revisión, mantenimiento o llantas que necesite " +
  "después, aquí estamos para ayudarle 🤝";

/**
 * Y cuando el no es rotundo pero NO fue una compra («no me interesa», «no me
 * escriban más»), felicitarlo por una compra que no hizo sonaría a bot. Se
 * agradece y se deja la puerta abierta, sin insistir.
 */
export const DESPEDIDA_SIN_COMPRA =
  "Entendido, gracias por avisar 🤝 Aquí estamos para cuando lo necesite.";

/**
 * ¿Cuál de las dos despedidas le toca a este mensaje? `null` si el mensaje no
 * cierra nada y la conversación sigue.
 */
export function despedidaQueCorresponde(mensajeDelCliente: string): string | null {
  const n = normalizar(mensajeDelCliente);
  if (comproEnOtroLugar(n)) return DESPEDIDA_VENTA_PERDIDA;
  if (RECHAZO_ROTUNDO.test(n)) return DESPEDIDA_SIN_COMPRA;
  return null;
}
