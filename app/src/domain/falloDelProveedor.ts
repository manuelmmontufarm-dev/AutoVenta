/**
 * ¿EL QUE SE CAYÓ FUE EL PROVEEDOR, O FUIMOS NOSOTROS?
 *
 * La diferencia decide qué recibe el cliente. Si el modelo se enredó con las
 * herramientas o devolvió vacío, pedirle que repita tiene sentido: el segundo
 * intento puede salir bien. Si el proveedor está caído o sin créditos, no:
 * el segundo intento va a fallar igual y el cliente se queda con dos mensajes
 * de error en vez de uno.
 *
 * Pasó el 11-sep a las 08:34. La cuenta de OpenAI se quedó sin créditos y dos
 * clientes con la conversación viva recibieron «Disculpa, tuve un problema
 * procesando tu mensaje. ¿Me lo repites por favor?» (convs 18596 y 18843). Dos
 * minutos después el bot se apagó y esos chats quedaron sin nadie hasta que un
 * asesor los vio.
 *
 * Se mira el código de estado antes que el texto: `status` es lo que manda el
 * SDK y no cambia con el idioma ni con la redacción del mensaje.
 */

/** Los códigos que significan «no es por lo que mandaste». */
const ESTADOS_DEL_PROVEEDOR = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

/**
 * Las formas en que llega cuando no hay `status`: un error de red del fetch, o
 * un mensaje que empieza con el código.
 */
const TEXTO_DEL_PROVEEDOR =
  /\b(?:429|500|502|503|504|529)\b|\binsufficient_quota\b|\brate.?limit\b|\bno credits remaining\b|\bservice unavailable\b|\bbad gateway\b|\binternal server error\b|\bconnection error\b|\b(?:ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN)\b|\btimed? ?out\b|\bsocket hang up\b|\boverloaded\b/i;

/** Lo nuestro, aunque el texto traiga un número que parezca de estado. */
const CULPA_NUESTRA =
  /\bmax_iterations\b|\bempty_response\b|\bcontext_length_exceeded\b|\binvalid_request_error\b|\binvalid schema\b|\bunsupported\b/i;

export function esFalloDelProveedor(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") return ESTADOS_DEL_PROVEEDOR.has(status);
  const texto = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (CULPA_NUESTRA.test(texto)) return false;
  return TEXTO_DEL_PROVEEDOR.test(texto);
}
