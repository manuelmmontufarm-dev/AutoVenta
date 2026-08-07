/**
 * Registro en memoria de los `wamid` que ESTE proceso mandó.
 *
 * Sirve para una sola cosa: distinguir el eco de un mensaje nuestro del eco de
 * un mensaje que un humano escribió desde la app de WhatsApp. El primero ya
 * está (o va a estar) en la base y no cambia nada; el segundo significa que
 * alguien tomó la conversación a mano y el bot tiene que callarse.
 *
 * Por qué no basta con mirar la base: Meta puede entregar el eco ANTES de que
 * termine el `appendMessage` de nuestro propio envío, y entonces el eco se vería
 * como "mensaje ajeno" y pausaría el bot por su propia respuesta. El registro se
 * llena en cuanto la Graph API devuelve el id, que es siempre antes del eco.
 *
 * Es una caché, no una fuente de verdad: si el proceso reinicia se vacía y la
 * comprobación contra la base (el `on conflict` de appendMessage) sigue siendo
 * la red de seguridad contra duplicados.
 */

const TTL_MS = 10 * 60 * 1000;

const propios = new Map<string, number>();

/** Marca un wamid como originado aquí. Se llama al recibir el id de Meta. */
export function registrarEnviado(waMessageId: string | undefined): void {
  if (!waMessageId) return;
  propios.set(waMessageId, Date.now());
  if (propios.size > 500) limpiar();
}

/** ¿Este wamid salió de nuestro propio código en los últimos minutos? */
export function esEnvioPropio(waMessageId: string): boolean {
  limpiar();
  return propios.has(waMessageId);
}

/** Solo para las pruebas: deja el registro como recién arrancado. */
export function _resetRegistroEnviados(): void {
  propios.clear();
}

function limpiar(): void {
  const corte = Date.now() - TTL_MS;
  for (const [id, ts] of propios) if (ts < corte) propios.delete(id);
}
