/**
 * Qué es un error y qué no.
 *
 * El tab «Errores» se había vuelto un cajón de sastre: cabían ahí la ventana de
 * 24 h por cerrar, las tareas de seguimiento, las visitas sin confirmar y los
 * clientes que pedían asesor. Nada de eso es un error — son estados normales
 * del negocio, y todos ya tienen su sitio propio en Cotizados, Piden asesor o
 * el pipeline. Al mezclarlos, el contador del tab marcaba decenas todo el día y
 * el asesor dejaba de mirarlo: cuando todo es una alerta, nada lo es.
 *
 * Tres clases, y la separación importa porque cada una tiene un dueño distinto:
 *
 *  · `conversacion` — el bot se rompió DENTRO del chat: se repitió, se atascó,
 *    saludó a mitad de hilo, el cliente se molestó. Lo arregla el asesor
 *    entrando a esa conversación. Es lo único que merece llamarse «error».
 *
 *  · `tecnico` — falló la plomería: no salió el envío, hace falta una plantilla
 *    aprobada, el aviso al asesor no se entregó. El asesor no puede hacer nada
 *    con esto; es trabajo del desarrollador. Por eso en pantalla y en el
 *    reporte se muestra sólo el número del cliente afectado, sin ficha ni
 *    acciones: el dato que sirve para depurar, no una tarea comercial falsa.
 *
 *  · `operativo` — no es un error. Estado del negocio que ya se ve en otro
 *    lado. Fuera del tab.
 *
 * Ante un tipo desconocido se asume `conversacion`: un tipo nuevo es mucho más
 * probable que sea un modo de fallo nuevo que una señal de negocio nueva, y
 * equivocarse hacia «visible» se nota y se corrige; hacia «oculto», no.
 */

export type ClaseAlerta = "conversacion" | "tecnico" | "operativo";

/**
 * Fallos de infraestructura. Cada uno lleva la etiqueta corta que se le enseña
 * a quien mira el tab: suficiente para saber qué se rompió, sin prometerle al
 * asesor que él puede arreglarlo.
 */
const TECNICOS: Record<string, string> = {
  send_error: "No salió un mensaje",
  template_required: "Falta plantilla aprobada",
  advisor_notification_failed: "Aviso al asesor no salió",
  advisor_notification_undelivered: "Asesor no recibe avisos",
};

/**
 * Señales de negocio que NUNCA son errores.
 *
 * `window_closing` encabeza la lista y es el caso que originó todo esto: que se
 * acabe la ventana de 24 h de WhatsApp es el reloj de Meta corriendo, no un
 * fallo del bot. Ya no se crea (ver `reconcileFollowUpAlerts`), pero la entrada
 * se queda para que las filas viejas queden clasificadas igual.
 */
const OPERATIVOS = new Set([
  "window_closing",
  "two_follow_ups_no_reply",
  "advisor_follow_up",
  "recommend_close_lost",
  "visit_not_confirmed",
  "visita_comprometida",
  "visita_manana",
  "visita_hoy",
  // Reintroducida el 14-ago SOLO como aviso de WhatsApp al asesor de local: es
  // el reloj de Meta corriendo, sigue sin ser un error y sigue fuera del tab.
  "ventana_por_cerrar",
  "human_requested",
  // El reloj del chat olvidado (29-ago): el bot retomó un chat con 12 h sin
  // respuesta del asesor. Operativo, no error: es información para el asesor.
  "rescate_chat_olvidado",
  "customer_ready_to_buy",
  "quote_created",
  "envio_fuera_de_cobertura",
  "caso_sin_resolver",
]);

export function clasificarAlerta(type: string): ClaseAlerta {
  if (type in TECNICOS) return "tecnico";
  if (OPERATIVOS.has(type)) return "operativo";
  return "conversacion";
}

/** Etiqueta corta para las alertas técnicas. Vacía para el resto. */
export function etiquetaTecnica(type: string): string {
  return TECNICOS[type] ?? "";
}

export function esErrorDeConversacion(type: string): boolean {
  return clasificarAlerta(type) === "conversacion";
}

export function esProblemaTecnico(type: string): boolean {
  return clasificarAlerta(type) === "tecnico";
}
