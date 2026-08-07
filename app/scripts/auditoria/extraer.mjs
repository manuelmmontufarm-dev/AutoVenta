#!/usr/bin/env node
/**
 * Extrae los datos crudos de una auditoría de ventas: todas las conversaciones
 * del periodo, sus mensajes, y los DETECTORES DETERMINÍSTICOS de fallas.
 *
 * Por qué determinístico y no "que el modelo lea los chats y opine": un conteo
 * que cambia de corrida en corrida no sirve para saber si una mejora funcionó.
 * Los números salen de reglas fijas sobre la base; el criterio y las hipótesis
 * los pone después el análisis del skill, sobre estos mismos números.
 *
 * Uso:
 *   DATABASE_URL='postgresql://…' node scripts/auditoria/extraer.mjs --dias 14
 *
 * Salida: JSON por stdout (o a --salida archivo.json).
 */
import postgres from "postgres";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};

const DIAS = Number(opt("dias", 14));
const SALIDA = opt("salida", null);
/**
 * Commit del bot que produjo estas conversaciones (de /health). Sin él, un
 * "mejoró" no se puede atribuir a ningún cambio: queda en el historial.
 *   --commit $(curl -s https://…/health | grep -o '"commit":"[a-f0-9]*"' | cut -d'"' -f4)
 */
const COMMIT = opt("commit", null);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL. Ejemplo:\n  DATABASE_URL='postgresql://…' node scripts/auditoria/extraer.mjs --dias 14");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 2 });

// ── Detectores ───────────────────────────────────────────────────────────────
// Cada uno responde a una falla concreta que se vio en chats reales. El `id` es
// la llave estable con la que se compara entre corridas: NO renombrar sin migrar
// el historial, o los gráficos de tendencia pierden el hilo.

const ERROR_PROCESAMIENTO = /tuve un problema procesando tu mensaje|¿me repites por favor\?/i;
const PIDE_FOTO = /(mánd|mand|enví|envi|compárt|adjunt|pued[ae]s?\s+(?:enviar|mandar)|podr[íi]as?\s+(?:enviar|mandar))[^.?!]{0,50}(foto|imagen)|foto de la etiqueta|foto del costado|foto de la puerta|una foto de/i;
const SALUDO_INICIAL = /^\s*(?:¡\s*)?(?:hola|buen[oa]s(?:\s+(?:d[íi]as|tardes|noches))?)\s*[!.,]/i;
const PIEZA_FALLIDA = /no se pudo volver a dibujar la pieza|no pude generar la imagen|no logr[ée] enviar la imagen/i;
const ES_COTIZACION = /COT-[A-Z0-9]+/;
const SIN_FICHA = /no tengo una ficha t[ée]cnica verificada|no tengo una medida verificada/i;

/** Pregunta = el bot terminó pidiendo un dato en vez de avanzar la venta. */
const esPregunta = (texto) => /\?/.test(texto);

/** Similitud barata por palabras — para detectar la MISMA pregunta repetida. */
function similitud(a, b) {
  const norm = (t) => new Set(
    t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3),
  );
  const A = norm(a), B = norm(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes += 1;
  return comunes / Math.min(A.size, B.size);
}

const mediana = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function main() {
  const desde = new Date(Date.now() - DIAS * 86_400_000);

  const conversaciones = await sql`
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
               created_at, metadata
        from messages
        where conversation_id in ${sql(ids)} and type <> 'note'
        order by conversation_id, created_at
      `
    : [];

  const corridas = await sql`
    select model, error, latency_ms, input_tokens, output_tokens, created_at
    from ai_runs where created_at >= ${desde}
  `;

  // Intentos que el guardián de salida BLOQUEÓ antes de llegar al cliente.
  // Señal clave: si el prompt mejora de verdad, el modelo deja de intentarlo;
  // si solo el guardián lo tapa, estos números siguen altos.
  const intentosBloqueados = await sql`
    select type, count(*)::int as n
    from bot_alerts
    where type like 'guard_%' and created_at >= ${desde}
    group by type
  `.catch(() => []);

  // ── Agrupar mensajes por conversación ──────────────────────────────────────
  const porConversacion = new Map();
  for (const m of mensajes) {
    if (!porConversacion.has(m.conversation_id)) porConversacion.set(m.conversation_id, []);
    porConversacion.get(m.conversation_id).push(m);
  }

  const hallazgos = [];   // una fila por incidencia detectada
  const porChat = [];     // una fila por conversación, con sus métricas

  for (const c of conversaciones) {
    const msgs = porConversacion.get(c.id) ?? [];
    const bot = msgs.filter((m) => m.direction === "outbound" && m.author_kind === "bot");
    const cliente = msgs.filter((m) => m.direction === "inbound");

    const indiceCotizacion = msgs.findIndex((m) => ES_COTIZACION.test(m.content ?? ""));
    const cotizo = indiceCotizacion >= 0;
    const antesDeCotizar = cotizo ? msgs.slice(0, indiceCotizacion) : msgs;
    const preguntasAntes = antesDeCotizar
      .filter((m) => m.direction === "outbound" && esPregunta(m.content ?? "")).length;
    const turnosAntes = antesDeCotizar.filter((m) => m.direction === "inbound").length;

    const marcar = (detector, mensaje, extra = {}) => hallazgos.push({
      detector,
      conversationId: c.id,
      cliente: c.name ?? c.phone,
      cuando: mensaje?.created_at ?? c.created_at,
      extracto: (mensaje?.content ?? "").slice(0, 220),
      ...extra,
    });

    for (const [i, m] of bot.entries()) {
      const texto = m.content ?? "";

      if (ERROR_PROCESAMIENTO.test(texto)) marcar("error_procesamiento", m);
      if (PIEZA_FALLIDA.test(texto)) marcar("pieza_fallida", m);
      if (SIN_FICHA.test(texto)) marcar("sin_ficha_verificada", m);

      // Pedir foto es una falla dura: el bot NO puede leer imágenes, así que la
      // conversación queda trabada esperando algo que nunca va a poder usar.
      if (PIDE_FOTO.test(texto)) marcar("pide_foto_que_no_puede_leer", m);

      // Preguntar teniendo ya la medida = fricción pura: podía cotizar.
      if (c.tire_size && esPregunta(texto) && !ES_COTIZACION.test(texto)
          && (!cotizo || new Date(m.created_at) < new Date(msgs[indiceCotizacion].created_at))) {
        marcar("pregunta_teniendo_medida", m, { medida: c.tire_size });
      }

      // Misma pregunta dos veces seguidas.
      const previa = bot[i - 1]?.content ?? "";
      if (previa && esPregunta(texto) && similitud(texto, previa) >= 0.6) {
        marcar("pregunta_repetida", m);
      }

      // Mensaje CALCADO al anterior (caso Ricardo Nitro, 5-ago: dos disculpas
      // idénticas seguidas). Spam puro: el cliente ya lo recibió.
      if (previa && texto.trim().toLowerCase() === previa.trim().toLowerCase()) {
        marcar("mensaje_duplicado", m);
      }

      // Disculpa tras disculpa: el bot está atascado y el cliente abandonado.
      if (ERROR_PROCESAMIENTO.test(texto) && ERROR_PROCESAMIENTO.test(previa)) {
        marcar("disculpas_seguidas", m);
      }

      // Volver a saludar a mitad de conversación (caso Jordian, 5-ago):
      // delata al bot y confunde — el hilo ya estaba abierto.
      if (i > 0 && SALUDO_INICIAL.test(texto)) {
        marcar("saludo_repetido", m);
      }
    }

    // Cotizaciones duplicadas: dos COT- distintas con el mismo monto en < 10 min.
    //
    // Cada cotización sale en DOS mensajes (la imagen y el texto que la explica)
    // y cada uno escribe el monto a su manera: "$638.59" en la imagen, "$638,60"
    // en el texto. Comparar mensajes consecutivos en crudo hacía que el caso
    // KLEVER del 5-ago —dos números para la misma compra con 13 s de diferencia—
    // se contara como 0. Se compara una sola entrada por número de cotización y
    // el monto normalizado a centavos.
    const montoEnCentavos = (texto) => {
      const bruto = (texto ?? "").match(/\$\s?([\d.,]+)/)?.[1];
      if (!bruto) return null;
      // "1.173,15" y "1,173.15" y "638.59" → centavos enteros.
      const sinMiles = bruto.replace(/[.,](?=\d{3}\b)/g, "");
      return Math.round(Number(sinMiles.replace(",", ".")) * 100);
    };
    const cotizaciones = [];
    for (const m of bot) {
      const cot = (m.content ?? "").match(/COT-[A-Z0-9]+/)?.[0];
      if (!cot || cotizaciones.some((x) => x.cot === cot)) continue;
      cotizaciones.push({ m, cot, monto: montoEnCentavos(m.content) });
    }
    for (let i = 1; i < cotizaciones.length; i += 1) {
      const a = cotizaciones[i - 1], b = cotizaciones[i];
      const minutos = (new Date(b.m.created_at) - new Date(a.m.created_at)) / 60_000;
      if (a.cot !== b.cot && a.monto === b.monto && minutos <= 10) {
        marcar("cotizacion_duplicada", b.m, { previa: a.cot, duplicada: b.cot, minutos: Number(minutos.toFixed(1)) });
      }
    }

    // Tenía la medida y nunca cotizó: la venta más barata que se dejó ir.
    if (c.tire_size && !cotizo) marcar("con_medida_sin_cotizar", msgs.at(-1), { medida: c.tire_size });

    // El último mensaje es una pregunta del bot que el cliente nunca contestó.
    const ultimo = msgs.at(-1);
    if (ultimo && ultimo.direction === "outbound" && esPregunta(ultimo.content ?? "")
        && Date.now() - new Date(ultimo.created_at).getTime() > 24 * 3_600_000) {
      marcar("abandono_tras_pregunta", ultimo);
    }

    porChat.push({
      conversationId: c.id,
      cliente: c.name ?? c.phone,
      etapa: c.stage,
      estado: c.status,
      medida: c.tire_size,
      ganado: c.ganado,
      mensajesCliente: cliente.length,
      mensajesBot: bot.length,
      cotizo,
      preguntasAntesDeCotizar: preguntasAntes,
      turnosAntesDeCotizar: turnosAntes,
    });
  }

  // ── Métricas del periodo ───────────────────────────────────────────────────
  const conMedida = porChat.filter((c) => c.medida);
  const conCotizacion = porChat.filter((c) => c.cotizo);
  const ganados = porChat.filter((c) => c.ganado);
  const cuenta = (detector) => hallazgos.filter((h) => h.detector === detector).length;
  const chatsAfectados = (detector) =>
    new Set(hallazgos.filter((h) => h.detector === detector).map((h) => h.conversationId)).size;

  const pct = (n, d) => (d ? Number(((n / d) * 100).toFixed(1)) : 0);

  const metricas = {
    // Embudo — lo único que mide si el bot está VENDIENDO.
    conversaciones: porChat.length,
    conMedida: conMedida.length,
    conCotizacion: conCotizacion.length,
    ganados: ganados.length,
    tasaMedidaACotizacion: pct(conCotizacion.length, conMedida.length),
    tasaCotizacionAVenta: pct(ganados.length, conCotizacion.length),
    tasaGlobal: pct(ganados.length, porChat.length),

    // Fricción — cuánto le cuesta al cliente llegar a un precio.
    preguntasAntesDeCotizarMediana: mediana(conCotizacion.map((c) => c.preguntasAntesDeCotizar)),
    turnosAntesDeCotizarMediana: mediana(conCotizacion.map((c) => c.turnosAntesDeCotizar)),

    // Fallas — cada una con su % de chats afectados, que es lo comparable.
    fallas: Object.fromEntries([
      "error_procesamiento",
      "pide_foto_que_no_puede_leer",
      "pregunta_teniendo_medida",
      "pregunta_repetida",
      "mensaje_duplicado",
      "disculpas_seguidas",
      "saludo_repetido",
      "cotizacion_duplicada",
      "con_medida_sin_cotizar",
      "sin_ficha_verificada",
      "pieza_fallida",
      "abandono_tras_pregunta",
    ].map((d) => [d, {
      incidencias: cuenta(d),
      chatsAfectados: chatsAfectados(d),
      pctChats: pct(chatsAfectados(d), porChat.length),
    }])),

    // Lo que el guardián frenó: el modelo lo INTENTÓ aunque el cliente no lo vio.
    intentosBloqueadosPorGuardian: Object.fromEntries(
      intentosBloqueados.map((r) => [r.type.replace(/^guard_/, ""), r.n]),
    ),

    // Modelo — para comparar corridas antes/después de cambiarlo.
    modelo: {
      modelos: [...new Set(corridas.map((r) => r.model))],
      corridas: corridas.length,
      // Rescatado = agotó las rondas pero el cliente SÍ recibió respuesta útil.
      rescatados: corridas.filter((r) => r.error === "max_iterations_salvaged").length,
      errores: corridas.filter((r) => r.error && r.error !== "max_iterations_salvaged").length,
      pctErrores: pct(corridas.filter((r) => r.error && r.error !== "max_iterations_salvaged").length, corridas.length),
      latenciaMedianaMs: mediana(corridas.map((r) => r.latency_ms).filter(Boolean)),
      tokensEntrada: corridas.reduce((s, r) => s + (r.input_tokens ?? 0), 0),
      tokensSalida: corridas.reduce((s, r) => s + (r.output_tokens ?? 0), 0),
    },
  };

  const salida = {
    generadoEn: new Date().toISOString(),
    periodoDias: DIAS,
    desde: desde.toISOString(),
    fuente: "extraer.mjs",
    commitBot: COMMIT,
    metricas,
    hallazgos,
    porChat,
  };

  const json = JSON.stringify(salida, null, 2);
  if (SALIDA) {
    writeFileSync(SALIDA, json);
    console.error(`✅ ${porChat.length} conversaciones · ${hallazgos.length} hallazgos → ${SALIDA}`);
  } else {
    process.stdout.write(json);
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
