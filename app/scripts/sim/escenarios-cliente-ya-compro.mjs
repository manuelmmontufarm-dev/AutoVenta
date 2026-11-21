/**
 * EL CLIENTE QUE YA COMPRÓ, EN EL SIMULADOR (conv 469, Competimotor, 21-nov-2026).
 *
 * Con el simulador corriendo (`npm run sim -- --perfil mundillantas --catalogo-archivo …`):
 *
 *   node scripts/sim/escenarios-cliente-ya-compro.mjs            # los dos
 *   node scripts/sim/escenarios-cliente-ya-compro.mjs 469        # uno
 *   SIM_DB=autoventa_sim node scripts/sim/escenarios-cliente-ya-compro.mjs   # contra el simulador de Depot
 *   (con otros puertos: SIM_PUERTO / SIM_PUERTO_BOT)
 *
 * Los relojes se mueven en la base local del simulador (nunca en producción):
 * el hilo del ciclo 1 se escribe con los textos reales de la conv 469, la venta
 * se marca ganada por el MISMO endpoint del panel (`POST /api/hub/tickets/:id/close`,
 * con factura y monto como pide el cierre desde el 21-nov) y después el cierre
 * se corre al instante que pide cada caso. El mensaje del cliente entra por el
 * webhook firmado y lo contesta el bot entero con los modelos de producción.
 *
 *  · 469     venta ganada a las 08:48 y el cliente escribe a las 09:39 → contesta el bot
 *            CON LA FICHA: no dice «no tengo medida», no la pide, y lo pasa al asesor.
 *  · llegada el bot cotizó, quedó la visita a 3 días, y al día siguiente de la visita el
 *            cliente vuelve: el ciclo no se rota y el bot recuerda la llanta cotizada.
 */
import postgres from "postgres";

const SIM = `http://127.0.0.1:${process.env.SIM_PUERTO ?? 3210}`;
const BOT = `http://127.0.0.1:${process.env.SIM_PUERTO_BOT ?? 3205}`;
const TEL = "593900000101";
const sql = postgres(`postgresql://manue@localhost/${process.env.SIM_DB ?? "autoventa_sim_mundillantas"}`, { prepare: false, max: 2, onnotice: () => {} });
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

const PIDE_MEDIDA = /medida|\baro\b|foto (?:clara )?del costado|225\/65R17|¿cuál medida/i;
/** Lo que dijo el bot en producción el 21-nov a las 09:40. */
const NO_TENGO_MEDIDA = /no tengo una medida confirmada/i;
const PASA_AL_ASESOR = /asesor/i;

async function api(url, cuerpo) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": "sim" },
    body: JSON.stringify(cuerpo),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${url} → ${r.status} ${JSON.stringify(json)}`);
  return json;
}

const reiniciar = () => api(`${SIM}/api/reiniciar`, {});

/** Manda un mensaje del cliente y espera a que el turno termine (o a que el bot calle). */
async function enviar(texto) {
  const desde = new Date();
  await api(`${SIM}/api/enviar`, { texto });
  let ultimoCambio = Date.now();
  let visto = -1;
  for (let i = 0; i < 180; i++) {
    await esperar(1000);
    const [f] = await sql`
      select count(*)::int as n from messages m join conversations c on c.id = m.conversation_id
      where c.phone = ${TEL} and m.direction = 'outbound' and m.created_at >= ${desde}`;
    const [a] = await sql`
      select count(*)::int as n from bot_alerts b join conversations c on c.id = b.conversation_id
      where c.phone = ${TEL} and b.type = 'cliente_sin_respuesta' and b.created_at >= ${desde}`;
    if (f.n !== visto) { visto = f.n; ultimoCambio = Date.now(); }
    // Con salientes: 8 s sin nada nuevo. Sin salientes: el bot calló si hay alerta y pasaron 12 s.
    if (f.n > 0 && Date.now() - ultimoCambio > 8000) break;
    if (f.n === 0 && a.n > 0 && Date.now() - desde.getTime() > 12_000) break;
  }
  return sql`
    select m.author_kind, m.content, m.cycle from messages m join conversations c on c.id = m.conversation_id
    where c.phone = ${TEL} and m.direction = 'outbound' and m.created_at >= ${desde} order by m.id`;
}

/** El ciclo 1 de la conv 469, con sus textos reales, terminando `haceMs` antes de ahora en la despedida. */
async function hilo469() {
  const [conv] = await sql`
    insert into conversations (phone, name, stage, assigned_to, bot_paused_reason, last_customer_message_at, last_assistant_message_at)
    values (${TEL}, 'Abg Jumbo', 'seguimiento_venta', 'human', 'persona_escribio', now(), now())
    returning id`;
  // [min antes de la despedida (08:39), dirección, autor, texto]
  const hilo = [
    [1265, "inbound", "customer", "Hola. ¿Puedes darme más información sobre esto?"],
    [1264, "inbound", "customer", "Llantas 23575r15"],
    [1264, "inbound", "customer", "Tipo pantaneras"],
    [1263, "outbound", "bot", "¿Me confirma si su medida exacta es *235/75R15* o me manda una foto del costado de la llanta para validarla? 📸"],
    [1263, "inbound", "customer", "Esa es la medida exacta"],
    [1260, "inbound", "customer", "Quiero que me pase a un asesor"],
    [1260, "outbound", "bot", "Claro, ya le avisé a un asesor para que le ayude 🤝"],
    [1256, "outbound", "owner", "Muy buenos días estimado, soy Andre Pazmiño y sere su asesor comercial el día de hoy. En qué le puedo atender"],
    [1247, "outbound", "owner", "📦 *TOWNHALL TH-MT802 6PR*\n\n📏 *Medida:* 235/75R15LT <- REFORZADA\n\n💵 *Precio con Descuento:*\n     $ 109.25\n\n*Este valor es por unidad.*"],
    [1241, "inbound", "customer", "Quiero 4"],
    [1241, "inbound", "customer", "Estas"],
    [1239, "outbound", "owner", "Desea que le agende una cita o el día de hoy puede acercarse ?"],
    [1138, "outbound", "owner", "📍 *Competimotor* (Vía Quevedo km 1½ y Juan León Mera): https://maps.app.goo.gl/QTFCzK2KDRXULRwz7"],
    [778, "inbound", "customer", "Dime ayuada con un turno para mañana"],
    [778, "inbound", "customer", "De las llantas cotizadas"],
    [636, "inbound", "customer", "A las 8"],
    [557, "outbound", "owner", "Listo con todo gusto mi estimado lo estaremos esperando."],
    [34, "inbound", "customer", "Ya estoy llegando una Camioneta azul"],
    [30, "inbound", "customer", "En total sería"],
    [29, "inbound", "customer", "437"],
    [29, "outbound", "owner", "Si mi estimado ese sería el valor por las 4 llantas"],
    [2, "inbound", "customer", "Me confirma amigo si llego ?"],
    [1, "outbound", "owner", "Si ya llegó"],
    [0, "outbound", "owner", "Muchas gracias por elegir *COMPETIMOTOR* su seguridad y su confianza son lo primero 🚗🔧"],
  ];
  // Se escriben con la despedida «ahora»; `correrReloj` los manda al pasado.
  for (const [min, direccion, autor, texto] of hilo) {
    await sql`
      insert into messages (conversation_id, cycle, role, direction, type, author_kind, content, created_at)
      values (${conv.id}, 1, ${direccion === "inbound" ? "user" : "assistant"}, ${direccion}, 'text', ${autor}, ${texto},
        now() - make_interval(mins => ${min}))`;
  }
  await sql`update conversations set last_customer_message_at = now() - interval '2 minutes',
    last_assistant_message_at = now() - interval '1263 minutes' where id = ${conv.id}`;
  return conv.id;
}

/** Corre hacia atrás TODOS los relojes de la conversación (mensajes, cierre, venta, cotizaciones). */
async function correrReloj(id, ms) {
  const iv = `${Math.round(ms / 1000)} seconds`;
  await sql`update messages set created_at = created_at - ${iv}::interval where conversation_id = ${id}`;
  await sql`update quotes set created_at = created_at - ${iv}::interval where conversation_id = ${id}`;
  await sql`update sales_history set closed_at = closed_at - ${iv}::interval where conversation_id = ${id}`;
  await sql`update ai_runs set created_at = created_at - ${iv}::interval where conversation_id = ${id}`.catch(() => {});
  await sql`update conversations set
      closed_at = closed_at - ${iv}::interval,
      last_customer_message_at = last_customer_message_at - ${iv}::interval,
      last_assistant_message_at = last_assistant_message_at - ${iv}::interval,
      visit_date = visit_date - ${iv}::interval
    where id = ${id}`;
}

/** El asesor marca la venta como ganada desde el panel, 9 min después de despedirse. */
async function marcarGanada(id) {
  // Desde el 21-nov el cierre «ganado» confirma la venta con factura y monto (PR #80).
  await api(`${BOT}/api/hub/tickets/${id}/close`, {
    closure: "ganado", note: "Compro 235/75R15 TOWNHALL MT", confirmado: true,
    factura: "001-002-000012345", monto: "437",
  });
}

const estadoDe = async (id) => (await sql`
  select current_cycle, status, assigned_to, bot_paused_reason, pickup_date::text, visit_date, tire_size
  from conversations where id = ${id}`)[0];
const alertasDe = (id) => sql`
  select type, priority, summary, exact_reason from bot_alerts
  where conversation_id = ${id} and type in ('cliente_sin_respuesta', 'caso_sin_resolver', 'human_requested')
  order by id`;

const ESCENARIOS = {
  async "469"() {
    await reiniciar();
    const id = await hilo469();
    await marcarGanada(id);
    await correrReloj(id, 51 * MIN); // ganada a las 08:48, ahora son las 09:39
    const salidas = await enviar("Me confirma amigo si consiguió las llantas )");
    const estado = await estadoDe(id);
    const alertas = await alertasDe(id);
    const textos = salidas.filter((s) => s.author_kind === "bot").map((s) => s.content ?? "");
    const [corrida] = await sql`
      select tools from ai_runs where conversation_id = ${id} and route like 'commercial%' order by id desc limit 1`;
    return {
      salidas, estado, alertas, herramientas: corrida?.tools,
      checks: {
        "contestó el bot (ciclo nuevo)": textos.length > 0 && estado.current_cycle === 2,
        "no dijo «no tengo una medida confirmada»": textos.length > 0 && !textos.some((t) => NO_TENGO_MEDIDA.test(t)),
        "no pidió la medida": textos.length > 0 && !textos.some((t) => PIDE_MEDIDA.test(t)),
        "lo pasó al asesor": textos.some((t) => PASA_AL_ASESOR.test(t)),
        "aviso al asesor registrado (notificar_vendedor)": JSON.stringify(corrida?.tools ?? []).includes("notificar_vendedor")
          && alertas.some((a) => ["caso_sin_resolver", "human_requested"].includes(a.type)),
      },
    };
  },

  async llegada() {
    await reiniciar();
    const turnos = [];
    turnos.push(await enviar("Buenas, precio de 4 llantas 205/55R16"));
    turnos.push(await enviar("la 1"));
    turnos.push(await enviar("Listo, paso el martes en la mañana a ponerlas"));
    const [{ id }] = await sql`select id from conversations where phone = ${TEL}`;
    const antes = await estadoDe(id);
    const [cot] = await sql`select items from quotes where conversation_id = ${id} order by id desc limit 1`;
    if (!antes.visit_date) return { turnos, antes, checks: { "el bot registró la visita": false } };
    // Se cotizó hace 4 días y la visita quedó 3 días después: hoy es el día siguiente a la visita.
    const ahora = Date.now();
    await correrReloj(id, 4 * DIA);
    // La visita: cotizó + 3 días (= ayer), a su misma hora del día.
    await sql`update conversations set visit_date = ${new Date(ahora - DIA)} where id = ${id}`;
    const salidas = await enviar("Buenas, ayer no alcancé a ir. Todavía tienen las llantas que me cotizó?");
    const despues = await estadoDe(id);
    const textos = salidas.filter((s) => s.author_kind === "bot").map((s) => s.content ?? "");
    const marca = String(cot?.items?.[0]?.brand ?? "").toUpperCase();
    return {
      turnos, antes, despues, cotizada: cot?.items, salidas,
      checks: {
        "el bot registró la visita": true,
        "mismo ciclo (la memoria no venció)": despues.current_cycle === antes.current_cycle,
        "la ficha sigue con su medida": despues.tire_size === antes.tire_size && Boolean(despues.tire_size),
        "no pidió la medida": textos.length > 0 && !textos.some((t) => /¿[^?]*(medida|aro)[^?]*\?/i.test(t)),
        "recordó la llanta cotizada": Boolean(marca) && textos.some((t) => t.toUpperCase().includes(marca) || /205\/55R16/.test(t)),
      },
    };
  },
};

const pedidos = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ESCENARIOS);
const resultados = {};
for (const nombre of pedidos) {
  const correr = ESCENARIOS[nombre];
  if (!correr) throw new Error(`escenario desconocido: ${nombre}`);
  console.log(`\n▶ ${nombre}`);
  try {
    const r = await correr();
    resultados[nombre] = r;
    for (const s of r.salidas ?? []) console.log(`   ${s.author_kind} (ciclo ${s.cycle}): ${String(s.content ?? "").replace(/\s+/g, " ").slice(0, 300)}`);
    for (const [c, ok] of Object.entries(r.checks)) console.log(`   ${ok ? "✅" : "❌"} ${c}`);
  } catch (error) {
    resultados[nombre] = { error: String(error?.stack ?? error) };
    console.log(`   ❌ ${error?.message ?? error}`);
  }
}
const salida = process.env.SALIDA;
if (salida) (await import("node:fs")).writeFileSync(salida, JSON.stringify(resultados, null, 2));
await sql.end();
