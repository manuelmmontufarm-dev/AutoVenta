#!/usr/bin/env node
/**
 * El guion de Manuel del 12-sep-2026, contra el bot entero.
 *
 * Esa tarde Manuel probó en producción los 24 casos de la lista, en un solo
 * chat, con /restart entre tandas y escribiendo como escribe la gente: varios
 * mensajes seguidos. Casi todo lo que falló no se veía en el simulador, porque
 * cada escenario corría solo, con el chat limpio y un mensaje por turno. Este
 * corredor repite SU conversación: las mismas cuatro tandas, en orden, con las
 * ráfagas y sus tiempos, y juzga cada turno por HECHOS de la base —medidas,
 * cotizaciones, visita, mapas, orden de los mensajes—, no por frases.
 *
 * Uso (con un simulador ya levantado):
 *   SIM_UI_URL=http://127.0.0.1:3260 SIM_APP_URL=http://127.0.0.1:3265 \
 *     SIM_DATABASE_URL=postgresql://manue@localhost/autoventa_sim \
 *     SIM_RESULTADO=/ruta/fuera/del/repo.json node scripts/sim/tras-pruebas.mjs
 */
import { writeFile } from "node:fs/promises";
import { activarBot, mandar, pausa, reiniciar, snapshot, sql } from "./lib/corredor-t115.mjs";

const MAPA = /maps\.app\.goo\.gl/;
// Tiene que PREGUNTAR: «luego vemos cuál local le queda mejor» no es la pregunta.
const PREGUNTA_LOCAL = /cu[aá]l local[^?]*\?|\*?cumbay[aá]\*? o \*?quito sur\*?\s*\?/i;
const BENEFICIO = /beneficio adicional por venir de/i;
const METRICA = (aro) => new RegExp(`\\b\\d{3}\\/\\d{2}R${aro}\\b`);

/** Espera a que el bot deje de escribir: sin mensajes ni corridas nuevas durante `quieto` ms. */
async function asentar(quieto) {
  let firma = "", desde = Date.now();
  const limite = Date.now() + 150_000;
  while (Date.now() < limite) {
    const s = await snapshot();
    const f = `${s.mensajes.length}:${s.runs.length}:${s.guardian.length}`;
    if (f !== firma) { firma = f; desde = Date.now(); }
    else if (Date.now() - desde >= quieto) return;
    await pausa(500);
  }
}

const textos = (turno) => turno.bot.filter((m) => m.tipo === "text").map((m) => m.texto ?? "");
const todo = (turno) => turno.bot.map((m) => m.texto ?? "").join(" § ");

/** Lo que TODO turno cumple, pase lo que pase. */
function invariantes(turno, { beneficioPedido = false } = {}) {
  const fallas = [];
  for (const t of textos(turno)) {
    if (/[,:;]\s*$/.test(t.trim())) fallas.push(`mensaje cortado: «${t.slice(-60)}»`);
  }
  if (!beneficioPedido && BENEFICIO.test(todo(turno))) fallas.push("mandó el beneficio de redes sin que lo pidiera");
  const ts = textos(turno);
  const iLocal = ts.findIndex((t) => PREGUNTA_LOCAL.test(t));
  if (iLocal >= 0 && iLocal !== ts.length - 1) fallas.push("la pregunta del local no fue lo último del turno");
  return fallas;
}

const TANDAS = [
  {
    id: "A", titulo: "caso 1, la forma del turno y el beneficio",
    pasos: [
      { m: "205/55R16" },
      { m: "1", juez: (t, e, a) => [
        ...(e.quotes.length > a.quotes.length ? [] : ["no cotizó la opción 1"]),
      ] },
      { m: "La promoción del 25% q son 103$.64 menos", juez: (t, e, a) => [
        ...(e.quotes.length === a.quotes.length ? [] : ["sacó una cotización nueva"]),
        ...(e.conv.visit_date ? ["anotó una visita"] : []),
        ...(/%/.test(todo(t)) && /descontad|aplicad/i.test(todo(t)) ? [] : ["no contestó sobre el descuento"]),
        ...(MAPA.test(todo(t)) ? ["mandó mapas"] : []),
      ] },
      { m: "¿Tienen algún beneficio o promoción?", beneficioPedido: true, juez: (t) => {
        const veces = (todo(t).match(BENEFICIO) ?? []).length;
        return veces === 1 ? [] : [`el beneficio salió ${veces} veces`];
      } },
    ],
  },
  {
    id: "B", titulo: "casos 3 a 8, reenvío de opciones y los dos valores",
    pasos: [
      { m: "La camioneta entró hoy a la mecánica, me dijeron que demora 15 días. Si sale antes me comunico con ustedes",
        juez: (t, e) => (e.conv.visit_date ? ["anotó una visita"] : []) },
      { m: "285/70R17" },
      { m: "2", juez: (t, e, a) => {
        const nueva = e.quotes.slice(a.quotes.length)[0];
        if (!nueva) return ["no cotizó"];
        const cant = Number((nueva.items ?? [])[0]?.quantity ?? 0);
        return cant === 4 ? [] : [`cotizó ${cant} llantas`];
      } },
      { m: "dejeme ver las opciones otra vez", juez: (t, e, a) => [
        ...(t.bot.some((m) => m.tipo === "image" && /Opciones enviadas/i.test(m.texto ?? "")) ? [] : ["no reenvió la lámina de opciones"]),
        ...(t.bot.some((m) => /reenviada/i.test(m.texto ?? "")) ? ["reenvió la cotización"] : []),
        ...(/quedo atento/i.test(todo(t)) ? ["acompañó la lámina con «Quedo atento»"] : []),
        ...(e.quotes.length === a.quotes.length ? [] : ["sacó una cotización nueva"]),
      ] },
      { m: ["Deme los dos valores de la kenda", "de las opciones", "que me mando"], rafaga: true, juez: (t, e, a) => [
        ...(e.quotes.length === a.quotes.length ? [] : ["recotizó"]),
        // Cuántos precios depende de la lámina que armó el modelo (a veces trae
        // una sola Kenda): se exige que dé valores y que no repregunte.
        ...(/\$\s?\d/.test(todo(t)) ? [] : ["no dio ningún precio"]),
        ...(/se refiere a/i.test(todo(t)) ? ["repreguntó en vez de dar los valores"] : []),
      ] },
      { m: "Buen día pero es llanta es muy baja", juez: (t) => (t.bot.length ? [] : ["dejó de contestar"]) },
      { m: "Cumbayá", juez: (t, e) => (/cumbay/i.test(e.conv.nearest_store ?? "") ? [] : ["no anotó Cumbayá"]) },
      { m: "Ya le confirmo en el transcurso del día",
        juez: (t) => (/quedamos a las [óo]rdenes/i.test(todo(t)) ? ["despidió como venta perdida"] : []) },
    ],
  },
  {
    id: "C", titulo: "ciudad y visita",
    pasos: [
      { m: ["205/55R16", "Estoy en Guayaquil"], rafaga: true, juez: (t) => [
        ...(MAPA.test(todo(t)) ? ["mandó mapas a Guayaquil"] : []),
        ...(textos(t).some((x) => PREGUNTA_LOCAL.test(x)) ? ["preguntó el local a Guayaquil"] : []),
        ...(/guayaquil/i.test(todo(t)) ? [] : ["ignoró Guayaquil"]),
      ] },
      { m: "Yo el lunes voy a estar en quito", juez: (t, e) => [
        ...(e.conv.visit_date ? ["anotó visita sin cotización"] : []),
        ...(e.alertas.some((x) => x.type === "visita_comprometida") ? ["avisó al asesor de una visita"] : []),
      ] },
      { m: "ok" },
    ],
  },
  {
    id: "D", titulo: "rin 14, tarjeta, lonas y medidas",
    pasos: [
      { m: "rin 14" },
      { m: "Que opciones tiene y precio del juego",
        juez: (t, e) => (METRICA(14).test(e.conv.tire_size ?? "") ? [`buscó ${e.conv.tire_size}, que el cliente no dio`] : []) },
      { m: ["1", "Si se realiza el pago con tarjeta cuanto sube el valor"], rafaga: true, juez: (t, e, a) => [
        ...(e.quotes.length > a.quotes.length ? [] : ["perdió el «1»: no cotizó"]),
        ...(/no sube|mismo precio|sin intereses/i.test(todo(t)) ? [] : ["no contestó la tarjeta"]),
        ...(/no (?:le )?puedo confirmar/i.test(todo(t)) ? ["se contradijo sobre la tarjeta"] : []),
      ] },
      { m: "de cuantas lonas es", juez: (t) => (t.bot.length ? [] : ["no contestó"]) },
      { m: "y tiene 32x10.50 Rin 15\nEn MT", juez: (t, e, a) => [
        ...(METRICA(15).test(todo(t)) ? ["ofreció una métrica"] : []),
        ...(e.quotes.length === a.quotes.length ? [] : ["cotizó"]),
      ] },
      { m: "y Llantas 33 * 12.5 rin 15", juez: (t) => (METRICA(15).test(todo(t)) ? ["ofreció una métrica"] : []) },
      { m: "me equivoqe:\npara un nissan Qashqai 2020 rin 17\nFalken por favor el juego 4 llantas", juez: (t, e, a) => [
        ...(e.quotes.length === a.quotes.length ? [] : ["cotizó sin la medida del cliente"]),
        ...(/su llanta dice/i.test(todo(t)) ? ["le propuso una medida para que dijera que sí"] : []),
        ...(/33X12|32X10/i.test(todo(t)) ? ["arrastró las medidas del aro 15"] : []),
      ] },
      { m: "sabe que, Que cuestan las 235,75r15",
        juez: (t, e) => (e.conv.tire_size === "235/75R15" ? [] : [`la ficha quedó en ${e.conv.tire_size}`]) },
      { m: "o sabe que, ¿Dispone llantas MT 30.5 r15?", juez: (t, e, a) => [
        ...(METRICA(15).test(todo(t)) ? ["ofreció una métrica para 30.5"] : []),
        ...(e.quotes.length === a.quotes.length ? [] : ["cotizó"]),
      ] },
      // Qué M/T hay depende del stock del catálogo (en el del simulador la
      // Falken M/T de esa medida está en cero): se juzga que muestre una y que
      // no niegue el tipo, que fue el error de la conv 18016.
      { m: "o sabe que, 265/70R17\nMT", juez: (t) => [
        ...(t.bot.some((m) => m.tipo === "image" && /Opciones enviadas/i.test(m.texto ?? "")) || /\$\s?\d/.test(todo(t)) ? [] : ["no mostró ninguna M/T"]),
        ...(/no (?:me queda|tengo|hay)[^.]{0,40}m\/t/i.test(todo(t)) ? ["negó la M/T"] : []),
      ] },
      { m: "o tiene AT 285/75/ Rin 16",
        juez: (t) => (/215\/65R16|245\/70R16|235\/70R16/.test(todo(t)) ? ["ofreció una equivalente que no calza"] : []) },
    ],
  },
];

const resultados = [];
const SOLO = process.env.SIM_TANDAS ? process.env.SIM_TANDAS.split(",") : null;
for (const tanda of TANDAS.filter((t) => !SOLO || SOLO.includes(t.id))) {
  process.stdout.write(`\n■ Tanda ${tanda.id} · ${tanda.titulo}\n`);
  await reiniciar();
  await activarBot();
  for (const paso of tanda.pasos) {
    const antes = await snapshot();
    const maxBot = Math.max(0, ...antes.mensajes.filter((m) => m.author_kind === "bot").map((m) => Number(m.id)));
    await mandar(paso.m);
    await asentar(paso.rafaga ? 15_000 : 6_000);
    const estado = await snapshot();
    const turno = {
      bot: estado.mensajes
        .filter((m) => m.author_kind === "bot" && Number(m.id) > maxBot)
        .map((m) => ({ texto: m.content, tipo: m.type })),
    };
    const fallas = [
      ...invariantes(turno, { beneficioPedido: paso.beneficioPedido }),
      ...(paso.juez ? paso.juez(turno, estado, antes) : []),
    ];
    const cliente = Array.isArray(paso.m) ? paso.m.join(" ⧸ ") : paso.m;
    process.stdout.write(`  «${cliente.replace(/\n/g, " ⏎ ")}»\n     → ${todo(turno).replace(/\n/g, " ").slice(0, 260)}\n`);
    process.stdout.write(fallas.length ? `     ❌ ${fallas.join(" · ")}\n` : "     ✅\n");
    resultados.push({ tanda: tanda.id, cliente, fallas, bot: turno.bot });
  }
}

if (process.env.SIM_RESULTADO) await writeFile(process.env.SIM_RESULTADO, JSON.stringify(resultados, null, 1));
const malos = resultados.filter((r) => r.fallas.length);
process.stdout.write(`\n${malos.length ? `❌ ${malos.length} de ${resultados.length} turnos con fallas` : `✅ ${resultados.length}/${resultados.length} turnos`}\n`);
await sql.end();
process.exit(malos.length ? 1 : 0);
