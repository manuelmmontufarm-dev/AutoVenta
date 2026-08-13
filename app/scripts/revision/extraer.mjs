#!/usr/bin/env node
/**
 * Extrae la materia prima de la REVISIÓN CONTEXTUAL: la transcripción completa
 * de cada conversación que tuvo actividad en el día, con los hechos que el bot
 * cree saber de ella (medida, local, fecha de visita, cotizaciones).
 *
 * Es la mitad "boba" del par: aquí NO hay detectores ni juicio. La auditoría de
 * ventas (scripts/auditoria) cuenta fallas con reglas fijas; esta revisión
 * existe para lo contrario — los errores que ninguna regla ve porque solo son
 * errores EN CONTEXTO: re-preguntar un dato que el cliente ya dio, confirmar
 * una cosa y registrar otra, una llanta que no corresponde al vehículo. Ese
 * juicio lo pone el modelo leyendo estas transcripciones, mensaje por mensaje.
 *
 * Uso:
 *   DATABASE_URL='postgresql://…' node scripts/revision/extraer.mjs \
 *     --fecha 2026-08-13 --salida /tmp/revision.json
 *
 * `--fecha` es el día de Guayaquil a revisar (por defecto: hoy). La ventana va
 * de las 00:00 de ese día a las 00:00 del siguiente, hora de Guayaquil.
 */
import postgres from "postgres";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};

const TZ = "America/Guayaquil";
const hoyGuayaquil = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

const FECHA = opt("fecha", hoyGuayaquil());
const SALIDA = opt("salida", null);
const COMMIT = opt("commit", null);
const DATABASE_URL = process.env.DATABASE_URL;

if (!/^\d{4}-\d{2}-\d{2}$/.test(FECHA)) {
  console.error(`--fecha inválida: ${FECHA} (se espera YYYY-MM-DD)`);
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL. Ejemplo:\n  DATABASE_URL='postgresql://…' node scripts/revision/extraer.mjs");
  process.exit(1);
}

// Guayaquil es UTC-5 sin horario de verano: el cálculo directo es correcto.
const desde = new Date(`${FECHA}T00:00:00-05:00`);
const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);

const sql = postgres(DATABASE_URL, { prepare: false, max: 2 });

const hora = (d) =>
  new Intl.DateTimeFormat("es-EC", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d);

/** Un teléfono no aporta al juicio y sí identifica: se recorta a los 4 finales. */
const telefonoCorto = (phone) => (phone ? `···${String(phone).slice(-4)}` : null);

// Todo en consultas masivas — el bucle por conversación multiplicaba la
// latencia del viaje a Railway por cuatro y se comía minutos enteros.
const ids = (await sql`
  select distinct c.id
  from conversations c
  join messages m on m.conversation_id = c.id
  where m.created_at >= ${desde} and m.created_at < ${hasta}
  order by c.id
`).map((r) => r.id);

const salida = {
  version: 1,
  fecha: FECHA,
  generadoEn: new Date().toISOString(),
  commit: COMMIT,
  totalConversaciones: ids.length,
  conversaciones: [],
};

const convs = await sql`
  select id, name, phone, stage, current_cycle, tire_size, vehicle, vehicle_year,
         selected_product_code, selected_quantity, location_label, nearest_store,
         visit_date, customer_commitment, created_at
  from conversations where id = any(${ids})
`;
// La transcripción entera, no solo el día: el error contextual vive en la
// relación entre lo de hoy y lo que se dijo antes. Tope alto por si un chat
// viejo acumuló cientos de mensajes.
const todosMensajes = await sql`
  select id, conversation_id, direction, author_kind, content, metadata, created_at
  from (
    select *, row_number() over (partition by conversation_id order by created_at desc) as rn
    from messages where conversation_id = any(${ids})
  ) t where rn <= 400
  order by conversation_id, created_at
`;
const todasCotizaciones = await sql`
  select conversation_id, quote_number, total, discount_amount, created_at, cycle,
         (select string_agg(coalesce(i->>'brand','') || ' ' || coalesce(i->>'design','') || ' x' || coalesce(i->>'quantity',''), ' + ')
            from jsonb_array_elements(items::jsonb) i) as detalle
  from quotes where conversation_id = any(${ids}) order by created_at
`;
const todasAlertas = await sql`
  select conversation_id, type, summary, exact_reason, created_at
  from bot_alerts
  where conversation_id = any(${ids}) and created_at >= ${desde} and created_at < ${hasta}
  order by created_at
`;

const porConv = (filas) => {
  const map = new Map();
  for (const f of filas) {
    const lista = map.get(f.conversation_id) ?? [];
    lista.push(f);
    map.set(f.conversation_id, lista);
  }
  return map;
};
const mensajesPorConv = porConv(todosMensajes);
const cotizacionesPorConv = porConv(todasCotizaciones);
const alertasPorConv = porConv(todasAlertas);

for (const conv of [...convs].sort((a, b) => a.id - b.id)) {
  const mensajes = mensajesPorConv.get(conv.id) ?? [];
  const cotizaciones = cotizacionesPorConv.get(conv.id) ?? [];
  const alertas = alertasPorConv.get(conv.id) ?? [];

  salida.conversaciones.push({
    id: conv.id,
    nombre: conv.name ?? null,
    telefono: telefonoCorto(conv.phone),
    etapa: conv.stage,
    hechos: {
      medida: conv.tire_size,
      vehiculo: conv.vehicle ? `${conv.vehicle}${conv.vehicle_year ? ` ${conv.vehicle_year}` : ""}` : null,
      cantidad: conv.selected_quantity,
      local: conv.nearest_store,
      ubicacion: conv.location_label,
      visita: conv.visit_date ? conv.visit_date.toISOString() : null,
      compromiso: conv.customer_commitment,
    },
    cotizaciones: cotizaciones.map((q) => ({
      numero: q.quote_number,
      total: Number(q.total),
      detalle: q.detalle,
      hora: `${new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(q.created_at)} ${hora(q.created_at)}`,
    })),
    // Agregadas por tipo, no una por fila: se han visto MILES de alertas
    // idénticas en un solo chat (window_closing repetida cada minuto), y
    // listarlas reventaría el archivo sin decir nada nuevo. El conteo alto es
    // en sí mismo un hallazgo de sistema.
    alertasDelDia: [...alertas.reduce((acc, a) => {
      const clave = `${a.type}|${a.summary ?? ""}`;
      const previa = acc.get(clave);
      if (previa) {
        previa.veces += 1;
        previa.ultimaHora = hora(a.created_at);
      } else {
        acc.set(clave, { tipo: a.type, resumen: a.summary, razon: a.exact_reason, veces: 1, primeraHora: hora(a.created_at), ultimaHora: hora(a.created_at) });
      }
      return acc;
    }, new Map()).values()],
    mensajes: mensajes.map((m) => ({
      id: m.id,
      de: m.direction === "inbound" ? "cliente" : (m.author_kind ?? "bot"),
      hoy: m.created_at >= desde && m.created_at < hasta,
      fecha: new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(m.created_at),
      hora: hora(m.created_at),
      texto: m.content ?? "",
      pieza: m.metadata?.piece ?? undefined,
    })),
  });
}

await sql.end();

const json = JSON.stringify(salida, null, 1);
if (SALIDA) {
  writeFileSync(SALIDA, json);
  console.error(`✔ ${salida.totalConversaciones} conversaciones del ${FECHA} → ${SALIDA}`);
} else {
  console.log(json);
}
