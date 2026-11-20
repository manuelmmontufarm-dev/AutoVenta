/**
 * Lo único que sale del servidor del cliente: llamadas HTTPS hacia el bot.
 * No se abre ningún puerto en su máquina ni nadie entra desde afuera.
 */
import { hostname } from "node:os";

export const VERSION = "1.0.0";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @returns {Promise<{ status: number, cuerpo: any }>} La respuesta del bot, sea 200 o un rechazo
 * (409/422 traen el motivo en `cuerpo.error`). Lanza solo si no hubo respuesta.
 */
export async function llamar(config, ruta, { metodo = "POST", cuerpo, tipo, intentos = 3, pausaMs = 4000 } = {}) {
  let ultimo;
  for (let intento = 1; intento <= intentos; intento += 1) {
    try {
      const r = await fetch(`${config.servidor}/conector${ruta}`, {
        method: metodo,
        headers: {
          "x-conector-key": config.clave,
          "x-conector-equipo": hostname(),
          "x-conector-version": VERSION,
          ...(tipo ? { "Content-Type": tipo } : {}),
        },
        body: cuerpo,
        signal: AbortSignal.timeout(90_000),
      });
      const textoRespuesta = await r.text();
      let json = null;
      try { json = JSON.parse(textoRespuesta); } catch { /* una página de error del proxy */ }
      // 5xx y 429 se reintentan; lo demás es una respuesta de verdad.
      if (r.status >= 500 || r.status === 429) {
        ultimo = new Error(`El bot contestó ${r.status}: ${json?.error ?? textoRespuesta.slice(0, 200)}`);
      } else {
        return { status: r.status, cuerpo: json ?? { ok: false, error: textoRespuesta.slice(0, 200) } };
      }
    } catch (error) {
      const causa = error.cause ?? {};
      const motivo = error.name === "TimeoutError" ? "no contestó a tiempo" : causa.code ?? causa.errors?.[0]?.code ?? causa.message ?? error.message;
      ultimo = new Error(`No pude llegar al bot (${config.servidor}): ${motivo}`);
    }
    if (intento < intentos) await espera(pausaMs * intento);
  }
  throw ultimo;
}

export const enviarCsv = (config, ruta, nombre, csv, opciones = {}) =>
  llamar(config, `${ruta}?nombre=${encodeURIComponent(nombre)}${opciones.ensayo ? "&ensayo=1" : ""}`, {
    cuerpo: csv,
    tipo: "text/csv; charset=utf-8",
    ...opciones,
  });

export const latido = (config, error = null, opciones = {}) =>
  llamar(config, "/latido", {
    cuerpo: JSON.stringify(error ? { error } : {}),
    tipo: "application/json",
    intentos: 1,
    ...opciones,
  });
