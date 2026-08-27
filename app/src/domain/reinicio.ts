/**
 * El comando de reinicio para probar el bot sin esperar.
 *
 * Manuel, 27-ago-2026: «cuando alguien escriba /restart al bot se olvide de la
 * memoria y reinicie, para que yo, Andrés, Joaquín y el que sea pueda testearlo
 * sin tener que esperar esas dos horas hasta que se resetee».
 *
 * QUÉ BORRA Y QUÉ NO. No inventa un camino nuevo: usa el mismo cierre +
 * reapertura que ya corre cuando un cliente vuelve a escribir después de una
 * venta. Eso sube el ciclo, y como `getHistory` filtra por `cycle =
 * current_cycle`, el agente arranca sin memoria; la ficha (medida, local, día,
 * producto) se vacía sola en el mismo update. El historial de los ciclos
 * anteriores NO se borra: queda archivado y visible en el panel, que es lo que
 * hace falta para revisar después qué pasó en una prueba.
 *
 * ALCANCE: solo la conversación de quien lo escribe. Por eso puede quedar
 * abierto a cualquiera sin riesgo para el negocio — un cliente que lo escribiera
 * por accidente perdería su propio hilo y el bot volvería a empezar con él, no
 * tocaría el de nadie más.
 *
 * Se exige que el comando SEA el mensaje entero: «¿qué hace /restart?» es una
 * pregunta, no una orden.
 */
const COMANDOS = new Set(["/restart", "/reiniciar", "/reset"]);

export function esComandoDeReinicio(texto: string): boolean {
  return COMANDOS.has(texto.trim().toLowerCase().replace(/\s+/g, ""));
}

/** Lo que se le contesta a quien lo usa: tiene que quedar claro qué pasó. */
export const MENSAJE_DE_REINICIO =
  "🔄 Listo, empezamos de cero. Olvidé la medida, la cotización, el local y la fecha de esta conversación.\n\n" +
  "Dígame qué medida busca o de qué vehículo es y arrancamos.";
