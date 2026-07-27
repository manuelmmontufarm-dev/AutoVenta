/**
 * Los cinco escenarios de carga. Cada uno devuelve las métricas crudas que
 * después juzga verify.mjs; ninguno decide por su cuenta si pasó.
 */
import { buildInboundPayload, deliverWebhook, makeWamid, sleep } from "./lib/meta.mjs";

/** Guiones reales de cliente, del mismo tono que el simulador del hub. */
const GUIONES = [
  ["Buenas, necesito llantas", "Es una 205/55R16", "¿Cuál me recomiendas para ciudad?", "Perfecto, ¿tienen stock?"],
  ["Hola, cotización para mi carro por favor", "205/55R16, es un Corolla", "¿Cuánto sale el juego de 4?", "¿Puedo pasar el sábado?"],
  ["buenos días", "necesito 4 llantas 205/55R16", "quiero la más duradera", "ok, resérvamelas"],
  ["Quiero cambiar mis llantas", "La medida es 205/55R16", "¿Qué diferencia hay entre las opciones?", "Me quedo con la primera"],
];

/**
 * Cada escenario usa su propio rango de teléfonos. Compartirlos hacía que las
 * conversaciones se arrastraran de un escenario al siguiente y el historial
 * creciera, así que el guion enlatado del stub se repetía y parecía un envío
 * duplicado del bot cuando no lo era.
 */
export const RANGOS = { A: 900_000, B: 910_000, C: 920_000, E: 930_000 };

function nuevoCliente(index, runId, rangoBase) {
  return {
    index,
    // Rango reservado para pruebas; nunca coincide con un cliente real.
    phone: `59399${String(rangoBase + index).padStart(6, "0")}`,
    name: `Cliente Carga ${index + 1}`,
    guion: GUIONES[index % GUIONES.length],
    runId,
  };
}

export function crearClientes(cantidad, runId, rangoBase = RANGOS.A) {
  return Array.from({ length: cantidad }, (_, i) => nuevoCliente(i, runId, rangoBase));
}

async function enviarTurno(ctx, cliente, turno, copia = 0) {
  const waMessageId = makeWamid(cliente.runId, cliente.index, turno, copia);
  const payload = buildInboundPayload({
    from: cliente.phone,
    name: cliente.name,
    text: cliente.guion[turno],
    waMessageId,
    phoneId: ctx.phoneId,
  });
  const result = await deliverWebhook({ baseUrl: ctx.baseUrl, payload, appSecret: ctx.appSecret });
  ctx.acks.push({ waMessageId, phone: cliente.phone, texto: cliente.guion[turno], ...result });
  return { waMessageId, ...result };
}

/**
 * A — Ráfaga fría: 50 clientes a la vez, 4 turnos cada uno.
 * Espera el debounce entre turnos: si no, mediría el agrupador, no la carga.
 */
export async function escenarioA(ctx, clientes) {
  const esperaEntreTurnos = ctx.debounceMs + 3_000;
  await Promise.all(clientes.map(async (cliente) => {
    for (let turno = 0; turno < cliente.guion.length; turno += 1) {
      await enviarTurno(ctx, cliente, turno);
      await sleep(esperaEntreTurnos);
    }
  }));
  return { mensajesEnviados: clientes.length * 4 };
}

/**
 * B — Duplicados de Meta. La entrega es at-least-once: el mismo wamid puede
 * llegar varias veces durante un hipo de red. Reenvía el 20 % tres veces, en
 * paralelo, que es el caso que de verdad rompe una deduplicación floja.
 */
export async function escenarioB(ctx, clientes) {
  const conDuplicado = clientes.filter((_, i) => i % 5 === 0);
  let duplicadosEnviados = 0;
  await Promise.all(clientes.map(async (cliente) => {
    const duplica = conDuplicado.includes(cliente);
    await enviarTurno(ctx, cliente, 0);
    if (duplica) {
      // Mismo wamid (copia=0), enviado 2 veces más EN PARALELO.
      await Promise.all([enviarTurno(ctx, cliente, 0), enviarTurno(ctx, cliente, 0)]);
      duplicadosEnviados += 2;
    }
    await sleep(ctx.debounceMs + 3_000);
  }));
  return { clientesConDuplicado: conDuplicado.length, duplicadosEnviados };
}

/**
 * C — Ráfaga del mismo usuario por debajo del debounce. Cinco mensajes en 2 s
 * deben producir UNA respuesta que considere los cinco textos.
 */
export async function escenarioC(ctx, clientes) {
  const subconjunto = clientes.slice(0, 10);
  await Promise.all(subconjunto.map(async (cliente) => {
    for (let i = 0; i < 5; i += 1) {
      const waMessageId = makeWamid(cliente.runId, cliente.index, 90 + i);
      const payload = buildInboundPayload({
        from: cliente.phone, name: cliente.name,
        text: `parte ${i + 1} de mi mensaje`, waMessageId, phoneId: ctx.phoneId,
      });
      const result = await deliverWebhook({ baseUrl: ctx.baseUrl, payload, appSecret: ctx.appSecret });
      ctx.acks.push({ waMessageId, phone: cliente.phone, texto: `parte ${i + 1} de mi mensaje`, ...result });
      await sleep(400);
    }
    await sleep(ctx.debounceMs + 4_000);
  }));
  return { clientesEnRafaga: subconjunto.length, mensajesPorCliente: 5 };
}
