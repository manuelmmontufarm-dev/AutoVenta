/**
 * El camino de la MEDICIÓN, separado del camino del TRANSPORTE.
 *
 * replay.mjs mueve conversaciones; este archivo decide qué de lo que salió es
 * "lo que el cliente recibió" y se lo entrega a los detectores. Vive aparte por
 * una razón concreta: el `--dry` prueba el transporte de punta a punta, pero
 * solo ejercita la medición si el bot llega a llamar tools. Con estas funciones
 * puras la medición se puede probar con datos reales de forma barata
 * (test/evalMedicion.test.ts) en vez de quedar a merced de lo que el stub
 * decida hacer ese día.
 */
import { analizarConversacion } from "./detectores.mjs";

/** ¿Este mensaje es la pieza de opciones? (imagen con `metadata.piece=options`) */
export function esPiezaOpciones(mensaje) {
  const tipo = mensaje.tipo ?? mensaje.type;
  if (tipo !== "image") return false;
  const meta = normalizarMeta(mensaje.metadata);
  if (meta && meta.piece === "options") return true;
  return /^Opciones enviadas|^Imagen de opciones NO enviada/.test(
    mensaje.texto ?? mensaje.content ?? "",
  );
}

function normalizarMeta(meta) {
  if (typeof meta !== "string") return meta ?? null;
  try { return JSON.parse(meta); } catch { return null; }
}

/**
 * Todo lo que el cliente habría recibido en un turno, en orden: primero lo que
 * escribieron las tools (la imagen de opciones, el texto con el `COT-`) y al
 * final el texto del agente.
 *
 * `cuando` se conserva POR MENSAJE. Es el punto entero del ejercicio: el
 * detector de cotizaciones duplicadas mide los minutos entre dos `COT-`, y con
 * la marca del turno dos cotizaciones emitidas con 13 s de diferencia
 * aparecerían separadas por los minutos que el cliente tardó en escribir — o
 * sea, el detector no dispararía nunca.
 *
 * @param {{content?: string, type?: string, metadata?: any, cycle?: number, created_at?: any}[]} deTools
 * @param {{texto: string, ciclo?: number, cuando?: string}|null} delAgente
 */
export function fusionarSalidas(deTools, delAgente) {
  const salidas = (deTools ?? []).map((m) => ({
    texto: m.content ?? "",
    tipo: m.type ?? "text",
    metadata: m.metadata ?? null,
    ciclo: m.cycle ?? 0,
    cuando: m.created_at instanceof Date ? m.created_at.toISOString() : (m.created_at ?? null),
  }));
  if (delAgente && delAgente.texto) {
    salidas.push({
      texto: delAgente.texto,
      tipo: "text",
      metadata: null,
      ciclo: delAgente.ciclo ?? 0,
      cuando: delAgente.cuando ?? new Date().toISOString(),
    });
  }
  return salidas;
}

/**
 * Las salidas de un turno en la forma que esperan los detectores.
 *
 * `s.cuando ?? item.cuando`: la marca del turno solo se usa cuando el mensaje
 * no trae la suya, nunca por encima de ella.
 */
export function salidasDeTurno(item, lado) {
  const lista = lado === "nuevas"
    ? (item.salidas_nuevas ?? (item.respuesta_nueva ? [{ texto: item.respuesta_nueva, tipo: "text" }] : []))
    : (item.salidas_viejas ?? (item.respuesta_vieja ? [{ texto: item.respuesta_vieja, tipo: "text" }] : []));
  return lista.map((s) => ({
    texto: s.texto ?? "",
    cuando: s.cuando ?? item.cuando,
    ciclo: s.ciclo ?? 0,
    esPiezaOpciones: esPiezaOpciones(s),
  })).filter((s) => s.texto || s.esPiezaOpciones);
}

/** Corre los detectores sobre un lado (nuevas|viejas) de TODO el replay. */
export function detectar(items, lado) {
  const porConversacion = new Map();
  for (const item of items) {
    if (!porConversacion.has(item.conversacion)) {
      porConversacion.set(item.conversacion, {
        conversationId: item.conversacion,
        cliente: item.cliente,
        medida: item.medida_conocida ?? null,
        mensajesCliente: 0,
        respuestas: [],
      });
    }
    const c = porConversacion.get(item.conversacion);
    c.mensajesCliente += 1;
    c.medida = c.medida ?? item.medida_conocida ?? null;
    c.respuestas.push(...salidasDeTurno(item, lado));
  }
  const hallazgos = [];
  for (const c of porConversacion.values()) hallazgos.push(...analizarConversacion(c));
  return { hallazgos, conversaciones: porConversacion.size };
}

/**
 * Qué detectores llegaron a ver material del que puedan hablar.
 *
 * Un detector que sale 0 → 0 tiene dos lecturas contrarias: "no encontró la
 * falla" o "no se ejecutó nunca". `cotizacion_duplicada` y `opciones_reenviadas`
 * solo pueden disparar si en las salidas hay cotizaciones o piezas de opciones;
 * si no hubo ninguna, su 0 no es un dato y el informe tiene que decirlo.
 */
export function coberturaDeDetectores(items) {
  let cotizaciones = 0;
  let piezasOpciones = 0;
  for (const lado of ["nuevas", "viejas"]) {
    for (const item of items) {
      for (const s of salidasDeTurno(item, lado)) {
        if (/COT-[A-Z0-9]+/.test(s.texto)) cotizaciones += 1;
        if (s.esPiezaOpciones) piezasOpciones += 1;
      }
    }
  }
  return {
    cotizaciones,
    piezasOpciones,
    sinEjercitar: [
      ...(cotizaciones < 2 ? ["cotizacion_duplicada"] : []),
      ...(piezasOpciones < 2 ? ["opciones_reenviadas"] : []),
    ],
  };
}
