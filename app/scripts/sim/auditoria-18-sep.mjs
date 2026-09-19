#!/usr/bin/env node
/**
 * Las familias de la auditoría del 13 al 18-sep-2026, contra el bot entero.
 *
 * Cada escenario es la conversación real que falló (el número de conversación
 * va en el título), con los mismos mensajes y las mismas ráfagas, y se juzga
 * por HECHOS de la base —cotizaciones, mapas, láminas, visita— y no por frases.
 *
 * Uso, con un simulador ya levantado (`npm run sim`):
 *   node scripts/sim/auditoria-18-sep.mjs            # todos
 *   SIM_SOLO=A1,A3 node scripts/sim/auditoria-18-sep.mjs
 */
import { activarBot, mandar, pausa, reiniciar, sql } from "./lib/corredor-t115.mjs";

const MAPA = /maps\.app\.goo\.gl/;
const PREGUNTA_LOCAL = /cu[aá]l local[^?]*\?|cumbay[aá]\*? o \*?(?:depot tire )?quito sur[^?]*\?/gi;
const todo = (t) => t.bot.map((m) => m.texto ?? "").join(" § ");
const cotizaciones = (t) => t._estado.quotes.length;
const PERFIL_BAJO = /\b(?:1[5-9]\d|2[01]\d)\/(?:35|40|45|50)R\d{2}\b/;
const ANUNCIO_KR601 = {
  titulo: "Depot Tire",
  texto: "¿Buscas agarre, duración y seguridad en cualquier terreno? La Kenda Klever KR601 es la llanta ideal para tu próxima aventura. Listas en Depot Tire con instalación inmediata.",
};

const ESCENARIOS = [
  {
    id: "A1", titulo: "conv 19710 · opción única: «Sí por favor» cotiza",
    pasos: [
      { m: ["¡Hola! Quiero más información", "Llantas 285/75/16"] },
      { m: "285/75/16 MT" },
      { m: "Sí por favor", juez: (t, antes) => (cotizaciones(t) > antes ? [] : ["dijo que sí y no salió la cotización"]) },
    ],
  },
  {
    id: "A2", titulo: "conv 19879 · el «Ok» no repite el descuento y manda los mapas ofrecidos",
    pasos: [
      { m: "255/70R16" },
      { m: "3" },
      { m: "Al contado cuanto es el descuento" },
      { m: "Ok", juez: (t, _a, previo) => [
        ...(/efectivo|descuento/i.test(todo(t)) ? ["repitió lo del descuento ante un «Ok»"] : []),
        ...(/sigue vigente/i.test(todo(t)) ? ["el «Ok» disparó otra vuelta de cotizar («sigue vigente»)"] : []),
        ...(t.sinRespuesta ? [] : (todo(t).match(PREGUNTA_LOCAL) ?? []).length > 1 ? ["preguntó el local más de una vez"] : []),
        ...(/ubicaci[oó]n/i.test(todo(previo)) && !MAPA.test(todo(previo)) && !MAPA.test(todo(t)) ? ["ofreció la ubicación, le dijeron Ok y no mandó los mapas"] : []),
      ] },
      { m: "Ok", juez: (t) => (/efectivo|descuento|sigue vigente/i.test(todo(t)) ? ["repitió el tema al segundo «Ok»"] : []) },
    ],
  },
  {
    id: "A3", titulo: "conv 3 (18-sep) · «2» + «por favor»: una cotización y una sola pregunta de local",
    pasos: [
      { m: "185/55R15" },
      { m: ["2", "por favor"], juez: (t, antes) => {
        const preguntas = (todo(t).match(PREGUNTA_LOCAL) ?? []).length;
        return [
          ...(cotizaciones(t) === antes + 1 ? [] : [`cotizaciones nuevas: ${cotizaciones(t) - antes}`]),
          ...(preguntas <= 1 ? [] : [`preguntó el local ${preguntas} veces`]),
          ...(/sigue vigente/i.test(todo(t)) ? ["corrió una segunda vuelta de cotizar («sigue vigente»)"] : []),
        ];
      } },
    ],
  },
  {
    id: "A4", titulo: "conv 3735 · medida + «Gracias»: lámina sí, cotización no",
    pasos: [
      { m: ["255 70 R 16 AT", "Gracias"], juez: (t, antes) => (cotizaciones(t) === antes ? [] : ["cotizó sin que el cliente eligiera"]) },
    ],
  },
  {
    id: "A5", titulo: "conv 20211 · «Rin 17 para camioneta 4x4» no recibe llantas de auto",
    pasos: [
      { m: "¡Hola! Quiero más información" },
      { m: "Precio Rin 17 para camioneta 4x4", juez: (t) => (PERFIL_BAJO.test(todo(t)) ? [`ofreció perfil bajo: ${todo(t).match(PERFIL_BAJO)[0]}`] : []) },
    ],
  },
  {
    id: "A6", titulo: "conv 20527 · «las del anuncio pero en rin 16» con el anuncio de la KR601",
    pasos: [
      { m: ["¡Hola! Quiero más información", "En lá q están en el anuncio pero en rin 16"], extra: { anuncio: ANUNCIO_KR601 },
        juez: (t) => [
          ...(PERFIL_BAJO.test(todo(t)) || /ZE310|KR20\b|R330/i.test(todo(t)) ? ["ofreció llantas de auto a quien venía por la KR601"] : []),
        ] },
    ],
  },
  {
    id: "B1", titulo: "conv 20427 · dijo «al sur de Quito»: solo Quito Sur y no se pregunta el local",
    pasos: [
      { m: "185/65R14" },
      { m: "Dónde está ubicado los locales ya q yo me ubico al sur de Quito", juez: (t) => [
        ...(/NQeNN8csyAnRkJDJ7|quito sur/i.test(todo(t)) ? [] : ["no mandó el mapa de Quito Sur"]),
        ...(/QnMBPXKc1o8igbsp8/.test(todo(t)) ? ["mandó también el mapa de Cumbayá"] : []),
        ...((todo(t).match(PREGUNTA_LOCAL) ?? []).length ? ["volvió a preguntar el local"] : []),
      ] },
    ],
  },
  {
    id: "B2", titulo: "conv 20589 · «fin de semana» es una fecha: no se pide el día exacto",
    pasos: [
      { m: "205/55R16" },
      { m: "1" },
      { m: "Cumbayá" },
      { m: "fin de semana", juez: (t) => [
        ...(t._estado.conv.visit_date ? [] : ["no registró la visita"]),
        ...(/d[ií]a exacto|qu[eé] d[ií]a/i.test(todo(t)) ? ["volvió a pedir el día"] : []),
      ] },
      { m: "Ok", juez: (t) => (/qu[eé] d[ií]a|d[ií]a exacto/i.test(todo(t)) ? ["pidió el día después del «Ok»"] : []) },
    ],
  },
  {
    id: "B3", titulo: "conv 20017 · la A/T 4W no es 70/30",
    pasos: [
      { m: "¡Hola! Quiero más información Buenos días Sres precio de la llanta AT 235/75R15 de ser posible unas fotografías por favor",
        juez: (t) => (/70\s?%|30\s?%/.test(todo(t)) ? ["dijo 70/30"] : []) },
      { m: "y esa falken para que tipo de uso es, cuanto asfalto y cuanta tierra", juez: (t) => (/70\s?%|30\s?%/.test(todo(t)) ? ["dijo 70/30"] : []) },
    ],
  },
  {
    id: "B4", titulo: "Joaquín 14-sep · se presenta como Martín y no niega ser un asistente virtual",
    pasos: [
      { m: "¡Hola! Quiero más información", juez: (t) => (/Soy Mart[ií]n, de Depot Tire/.test(todo(t)) ? [] : ["no se presentó como Martín"]) },
      { m: "estoy hablando con una persona o con un robot?", juez: (t) => [
        ...(/soy una persona|no soy un (?:bot|robot)|soy humano/i.test(todo(t)) ? ["negó ser un bot"] : []),
        ...(/asistente/i.test(todo(t)) ? [] : ["no dijo que es un asistente"]),
      ] },
    ],
  },
  {
    id: "C1", titulo: "conv 19457 · medida nueva + «En Kenda» es una búsqueda, no una elección: no cotiza solo",
    pasos: [
      { m: "225/65R17 para 80% ciudad y 20% campo" },
      { m: ["Y en 215 70 r16", "En Kenda"], juez: (t, antes) => (cotizaciones(t) === antes ? [] : ["cotizó sin que el cliente eligiera"]) },
    ],
  },
  {
    id: "C2", titulo: "conv 19706 · el «Si» al asesor fija la medida que el asesor preguntó",
    pasos: [
      { m: "Falken 165/75 r16" },
      { antes: async () => {
          const [c] = await sql`select id, current_cycle from conversations order by id desc limit 1`;
          await sql`insert into messages (conversation_id, role, content, direction, type, status, author_kind, cycle)
            values (${c.id}, 'assistant', 'Disculpe usted se referia a  la 265/75R16?', 'outbound', 'text', 'sent', 'owner', ${c.current_cycle})`;
          await sql`update conversations set assigned_to='bot', bot_paused_until=null where id=${c.id}`;
        },
        m: "Si", juez: (t) => [
          ...(t._estado.conv.tire_size === "265/75R16" ? [] : [`la ficha quedó en ${t._estado.conv.tire_size}`]),
          ...(/165\/75/.test(todo(t)) ? ["siguió hablando de 165/75R16"] : []),
        ] },
    ],
  },
  {
    id: "C3", titulo: "convs 20471/20663 · «yo le aviso»: el seguimiento automático no sale",
    pasos: [
      { m: "205/55R16" },
      { m: "1" },
      { m: "yo le aviso", despues: async (t) => {
          const convId = t._estado.conv.id;
          // Solo el PRIMER recordatorio: en producción salen escalonados, y adelantar
          // los tres a la vez deja que el aviso interno del asesor cancele a los otros.
          const n = await sql`update follow_up_jobs set due_at = now() where conversation_id=${convId} and status='scheduled' and type='in_window_first' returning id`;
          if (!n.length) return ["no había ningún seguimiento programado que probar"];
          await pausa(20_000);
          const jobs = await sql`select status, cancel_reason from follow_up_jobs where id in ${sql(n.map((j) => j.id))}`;
          const seguimientos = await sql`select content from messages where conversation_id=${convId} and metadata ? 'followUpJobId'`;
          console.log(`     ⏱ jobs: ${jobs.map((j) => `${j.status}/${j.cancel_reason ?? "-"}`).join(", ")}`);
          return [
            ...(seguimientos.length ? [`salió un seguimiento: «${seguimientos[0].content.slice(0, 80)}»`] : []),
            ...(jobs.some((j) => String(j.cancel_reason ?? "").includes("el_cliente_avisa")) ? [] : ["ningún job se canceló por «el_cliente_avisa»"]),
          ];
        } },
    ],
  },
];

const solo = (process.env.SIM_SOLO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
await activarBot().catch(() => undefined);
let fallas = 0;
for (const e of ESCENARIOS.filter((x) => !solo.length || solo.includes(x.id))) {
  await reiniciar();
  console.log(`\n━━ ${e.id} · ${e.titulo}`);
  let previo = null;
  for (const paso of e.pasos) {
    const antes = previo ? cotizaciones(previo) : 0;
    if (paso.antes) await paso.antes();
    const t = await mandar(paso.m, paso.extra ?? {});
    await pausa(1500);
    console.log(`  👤 ${t.cliente}`);
    for (const m of t.bot) console.log(`  🤖 ${m.tipo === "text" ? "" : `<${m.tipo}> `}${(m.texto ?? "").replace(/\n+/g, " ⏎ ").slice(0, 260)}`);
    console.log(`     ⚙︎ ${t.herramientas.join(", ") || "—"} · guardián: ${t.guardian.map((g) => g.verdict).join(",") || "—"}`);
    const malas = [...(paso.juez ? paso.juez(t, antes, previo) : []), ...(paso.despues ? await paso.despues(t) : [])];
    if (paso.juez || paso.despues) console.log(malas.length ? `  ❌ ${malas.join(" · ")}` : "  ✅ pasó");
    fallas += malas.length;
    previo = t;
  }
}
console.log(`\n${fallas ? `❌ ${fallas} falla(s)` : "✅ todo pasó"}`);
await sql.end();
process.exit(fallas ? 1 : 0);
