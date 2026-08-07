#!/usr/bin/env node
/**
 * Saca de la base de PRODUCCIÓN el historial completo de conversaciones con sus
 * mensajes en orden, para que replay.mjs se lo vuelva a servir al bot nuevo.
 *
 * ── SOLO LECTURA ────────────────────────────────────────────────────────────
 * Esta es la base viva de Depot. Aquí no se escribe NADA: la conexión se abre
 * en modo `default_transaction_read_only`, así que si algún día alguien agrega
 * un `update` de más, Postgres lo rechaza en vez de obedecerlo. La garantía no
 * depende de que quien edite el archivo se acuerde de la regla.
 *
 * Uso:
 *   node scripts/eval/extraer.mjs               # todo el historial
 *   node scripts/eval/extraer.mjs --dias 14     # últimos 14 días
 *   node scripts/eval/extraer.mjs --limite 20   # las 20 conversaciones MÁS RECIENTES
 *   node scripts/eval/extraer.mjs --dry         # sin base: copia las fixtures
 *
 * Salida: scripts/eval/datos/historial.json   (con --dry: historial.dry.json)
 *
 * Los dos modos escriben a archivos DISTINTOS a propósito. Era la única etapa
 * que compartía nombre entre `--dry` y la corrida real, y la secuencia natural
 * —extraer de producción, probar el cableado con `--dry`, correr el replay— le
 * pisaba a la corrida real su entrada con 8 conversaciones inventadas.
 */
import { resolve } from "node:path";
import {
  APP, FIXTURES, cargarEnv, escribirJson, flags, leerJson, ruta, titulo, avisoDry,
} from "./lib/comun.mjs";

const f = flags();
const DIAS = f.numero("dias", null);
const LIMITE = f.numero("limite", null);
const SALIDA = f.valor("salida", ruta(f.dry ? "historial.dry.json" : "historial.json"));
const COMMIT = f.valor("commit", null);

async function main() {
  titulo("EXTRACCIÓN DEL HISTORIAL", f.dry ? "dry" : "producción (solo lectura)");

  if (f.dry) {
    avisoDry("no se toca ninguna base; se copian las conversaciones sintéticas de fixtures/.");
    const fixtures = leerJson(resolve(FIXTURES, "historial.json"));
    escribirJson(SALIDA, { ...fixtures, fuente: "fixtures", dry: true });
    console.log(`✅ ${fixtures.conversaciones.length} conversaciones sintéticas → ${SALIDA}`);
    console.log("   (archivo aparte: NO pisa el historial real de datos/historial.json)\n");
    return;
  }

  cargarEnv(resolve(APP, ".env"));
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("Falta DATABASE_URL (ponla en .env o en el entorno).");
    process.exit(1);
  }
  if (/localhost|127\.0\.0\.1/.test(DATABASE_URL)) {
    console.log("ℹ️  DATABASE_URL apunta a localhost: se extrae de una base local, no de Depot.");
  }

  const { default: postgres } = await import("postgres");
  const sql = postgres(DATABASE_URL, {
    prepare: false,
    max: 2,
    // El candado real: la sesión entera es de solo lectura del lado del servidor.
    connection: { default_transaction_read_only: "on" },
  });

  const desde = DIAS ? new Date(Date.now() - DIAS * 86_400_000) : new Date(0);

  // `--limite` se queda con las conversaciones MÁS RECIENTES, no con las más
  // viejas: quien pide una muestra pequeña quiere ver cómo se está portando el
  // bot ahora. El recorte va en una subconsulta con `order by ... desc` y el
  // orden cronológico se restaura afuera, que es como lo espera el replay.
  const conversaciones = LIMITE
    ? await sql`
        select * from (
          select c.id, c.phone, c.name, c.stage, c.status, c.tire_size, c.vehicle,
                 c.current_cycle, c.created_at, c.closed_reason,
                 exists (select 1 from sales_history s
                         where s.conversation_id = c.id and s.outcome = 'ganado') as ganado
          from conversations c
          where c.created_at >= ${desde}
          order by c.created_at desc
          limit ${LIMITE}
        ) recientes
        order by created_at
      `
    : await sql`
        select c.id, c.phone, c.name, c.stage, c.status, c.tire_size, c.vehicle,
               c.current_cycle, c.created_at, c.closed_reason,
               exists (select 1 from sales_history s
                       where s.conversation_id = c.id and s.outcome = 'ganado') as ganado
        from conversations c
        where c.created_at >= ${desde}
        order by c.created_at
      `;

  const ids = conversaciones.map((c) => c.id);
  const mensajes = ids.length
    ? await sql`
        select conversation_id, direction, author_kind, content, type, status,
               created_at, metadata, cycle, wa_message_id
        from messages
        where conversation_id in ${sql(ids)} and type <> 'note'
        order by conversation_id, created_at, id
      `
    : [];

  // El modelo que atendió cada conversación: sin esto, «el bot viejo» no tiene
  // apellido y el informe no puede decir contra QUÉ se está comparando.
  const corridas = ids.length
    ? await sql`
        select conversation_id, model, error, latency_ms, input_tokens, output_tokens, created_at
        from ai_runs
        where conversation_id in ${sql(ids)}
        order by conversation_id, created_at
      `
    : [];

  const porConversacion = new Map();
  for (const m of mensajes) {
    if (!porConversacion.has(m.conversation_id)) porConversacion.set(m.conversation_id, []);
    porConversacion.get(m.conversation_id).push(m);
  }
  const corridasPor = new Map();
  for (const r of corridas) {
    if (!corridasPor.has(r.conversation_id)) corridasPor.set(r.conversation_id, []);
    corridasPor.get(r.conversation_id).push(r);
  }

  const salida = {
    generadoEn: new Date().toISOString(),
    fuente: "produccion",
    commitBot: COMMIT,
    periodoDias: DIAS,
    desde: DIAS ? desde.toISOString() : null,
    conversaciones: conversaciones.map((c) => {
      const msgs = porConversacion.get(c.id) ?? [];
      const suyas = corridasPor.get(c.id) ?? [];
      return {
        id: c.id,
        phone: c.phone,
        name: c.name,
        stage: c.stage,
        status: c.status,
        tire_size: c.tire_size,
        vehicle: c.vehicle,
        current_cycle: c.current_cycle,
        created_at: c.created_at,
        closed_reason: c.closed_reason,
        ganado: c.ganado,
        modelosViejos: [...new Set(suyas.map((r) => r.model))],
        erroresViejos: suyas.filter((r) => r.error).length,
        mensajes: msgs.map((m) => ({
          direction: m.direction,
          author_kind: m.author_kind,
          type: m.type,
          status: m.status,
          cycle: m.cycle,
          created_at: m.created_at,
          content: m.content,
          metadata: m.metadata ?? null,
          wa_message_id: m.wa_message_id,
        })),
      };
    }),
  };

  escribirJson(SALIDA, salida);
  const inbound = salida.conversaciones.reduce(
    (s, c) => s + c.mensajes.filter((m) => m.direction === "inbound").length, 0,
  );
  console.log(`✅ ${salida.conversaciones.length} conversaciones · ${mensajes.length} mensajes · ${inbound} turnos de cliente`);
  console.log(`   modelos viejos: ${[...new Set(corridas.map((r) => r.model))].join(", ") || "(sin ai_runs)"}`);
  console.log(`📁 ${SALIDA}\n`);

  await sql.end();
}

main().catch((e) => {
  // `postgres.railway.internal` solo resuelve DENTRO de la red privada de
  // Railway: desde este portátil no existe. Es el tropiezo más probable de la
  // primera corrida y sin este mensaje parece un bug del script.
  if (e?.code === "ENOTFOUND" && /railway\.internal/.test(String(e.hostname ?? ""))) {
    console.error(
      `❌ ${e.hostname} solo resuelve dentro de la red privada de Railway.\n\n` +
      "   Desde fuera hay dos caminos:\n" +
      "   · usar la URL pública del proxy (Railway → Postgres → Connect → Public Network):\n" +
      "       DATABASE_URL='postgresql://…@…proxy.rlwy.net:PUERTO/railway' node scripts/eval/extraer.mjs\n" +
      "   · o correr este script dentro de Railway (`railway run node scripts/eval/extraer.mjs`).\n\n" +
      "   Sigue siendo solo lectura en los dos casos.",
    );
    process.exit(1);
  }
  console.error("💥", e);
  process.exit(1);
});
