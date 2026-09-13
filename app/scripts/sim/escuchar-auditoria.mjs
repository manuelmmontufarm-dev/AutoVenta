#!/usr/bin/env node
/**
 * Los casos de las familias «escuchar al cliente» y «memoria y datos» de la
 * auditoría del 8 al 11-sep-2026, corridos contra el bot entero.
 *
 * Uso (con un simulador ya levantado):
 *   SIM_UI_URL=http://127.0.0.1:3240 SIM_APP_URL=http://127.0.0.1:3205 \
 *     SIM_DATABASE_URL=postgres://…/autoventa_sim \
 *     node scripts/sim/escuchar-auditoria.mjs
 *
 * El juicio es sobre lo que el CLIENTE habría recibido.
 */
import { writeFile } from "node:fs/promises";
import { correrEscenario, textoDeTodos, sql } from "./lib/corredor-t115.mjs";

const ESCENARIOS = [
  {
    id: "E1",
    familia: "ciudad",
    titulo: "conv 18106 · «Estoy en guayaquil» → y aun así «¿a cuál local le queda mejor ir?»",
    mensajes: ["¡Hola! Quiero más información", "205/55R16", "1", "Estoy en guayaquil"],
    juzgar: (r) => {
      const fallas = [];
      const ultimo = textoDeTodos(r.turnos.slice(-1));
      if (/cu[aá]l local|cumbay[aá]\s*o\s*quito sur/i.test(ultimo)) {
        fallas.push("le preguntó a cuál local ir a un cliente de Guayaquil");
      }
      if (/maps\.app\.goo\.gl/.test(ultimo)) fallas.push("le mandó los mapas de Quito");
      if (/qu[eé] d[ií]a.*(pasar|venir|visitar)/i.test(ultimo)) fallas.push("le preguntó qué día puede pasar");
      return fallas;
    },
  },
  {
    id: "E2",
    familia: "ciudad",
    titulo: "conv 18821 · «Soy de Santo Domingo» + «voy a estar en quito» → local inventado",
    mensajes: ["¡Hola! Quiero más información", "205/55R16", "1", "Soy de Santo Domingo", "Yo el lunes voy a estar en quito"],
    juzgar: (r) => {
      const fallas = [];
      const loc = r.estadoFinal?.location_label ?? "";
      if (/elegido expl[íi]citamente/i.test(loc)) {
        fallas.push(`registró «${loc}» sin que el cliente eligiera local`);
      }
      return fallas;
    },
  },
  {
    id: "E3",
    familia: "plazo",
    titulo: "conv 18438 · «Ya le confirmo» → despedida de venta perdida",
    mensajes: ["¡Hola! Quiero más información", "205/55R16", "1", "Ya le confirmo por favor en el transcurso del día. Gracias por su amable atención"],
    juzgar: (r) => {
      const ultimo = textoDeTodos(r.turnos.slice(-1));
      return /si m[áa]s adelante lo necesita|quedamos a las [óo]rdenes/i.test(ultimo)
        ? ["lo despidió como venta perdida a quien solo pidió tiempo"] : [];
    },
  },
  {
    id: "E4",
    familia: "datos",
    titulo: "conv 17804 · «¿con tarjeta cuánto sube?» → «no puedo confirmar recargos»",
    mensajes: ["¡Hola! Quiero más información", "275/70R18", "2", "Si se realiza el pago con tarjeta cuanto sube el valor disculpe"],
    juzgar: (r) => {
      const ultimo = textoDeTodos(r.turnos.slice(-1));
      const fallas = [];
      if (/no puedo confirmar|no manejo ese dato|no tengo ese dato/i.test(ultimo)) {
        fallas.push("volvió a decir que no puede confirmar el dato de la tarjeta");
      }
      if (!/no sube|mismo precio|sin recargo|sin inter[ée]s/i.test(ultimo)) {
        fallas.push("no respondió que con tarjeta el precio es el mismo");
      }
      return fallas;
    },
  },
  {
    id: "E5",
    familia: "redes",
    // Hasta el 12-sep el beneficio salía solo tras cotizar (pedido de Joaquín).
    // Manuel lo probó ese día y cambió la regla: solo si el cliente pregunta.
    titulo: "beneficio de redes: no sale solo tras cotizar, sale una vez si lo piden (Manuel, 12-sep)",
    mensajes: ["¡Hola! Quiero más información", "205/55R16", "1", "¿Tienen algún beneficio o promoción?"],
    juzgar: (r) => {
      const cots = r.estadoFinal?.cotizaciones ?? [];
      if (!cots.length) return ["no llegó a cotizar, así que no se pudo juzgar el beneficio"];
      const fallas = [];
      const antes = textoDeTodos(r.turnos.slice(0, -1));
      const alPedirlo = textoDeTodos(r.turnos.slice(-1));
      if (/beneficio adicional por venir de/i.test(antes)) fallas.push("el beneficio salió solo, sin que lo pidiera");
      if (!/redes sociales/i.test(alPedirlo)) fallas.push("al pedirlo no mencionó el beneficio de redes sociales");
      if (!/alineaci[óo]n \+ rotaci[óo]n/i.test(alPedirlo)) fallas.push("al pedirlo no nombró la alineación + rotación");
      const veces = (textoDeTodos(r.turnos).match(/beneficio adicional por venir de/gi) ?? []).length;
      if (veces > 1) fallas.push(`el beneficio salió ${veces} veces`);
      return fallas;
    },
  },
  {
    id: "E6",
    familia: "datos",
    titulo: "convs 16974, 18294 y 18880 · «¿de cuántas lonas es?» → «no tengo ese dato»",
    mensajes: ["¡Hola! Quiero más información", "245/75R16", "De cuantas lonas es esa llanta?"],
    juzgar: (r) => {
      const ultimo = textoDeTodos(r.turnos.slice(-1));
      return /no tengo ese dato|no lo tengo confirmado|no manejo ese dato/i.test(ultimo)
        ? ["volvió a decir que no tiene el dato de las lonas"] : [];
    },
  },
];

const soloIds = process.argv.includes("--ids")
  ? process.argv[process.argv.indexOf("--ids") + 1].split(",").map((s) => s.trim().toUpperCase())
  : null;

const resultados = [];
for (const escenario of ESCENARIOS.filter((e) => !soloIds || soloIds.includes(e.id))) {
  process.stdout.write(`\n▶ ${escenario.id} · ${escenario.titulo}\n`);
  const r = await correrEscenario(escenario);
  const fallas = escenario.juzgar(r);
  for (const t of r.turnos) {
    const bot = (t.bot ?? []).map((b) => b.texto ?? "").join(" § ");
    process.stdout.write(`   «${t.cliente}»\n      → ${bot.slice(0, 220)}\n`);
  }
  process.stdout.write(fallas.length ? `   ❌ ${fallas.join(" · ")}\n` : "   ✅ sin fallas\n");
  resultados.push({ id: escenario.id, titulo: escenario.titulo, fallas, turnos: r.turnos, estadoFinal: r.estadoFinal });
}

await writeFile(
  new URL("./escuchar-auditoria-resultado.json", import.meta.url),
  JSON.stringify(resultados, null, 1),
);
const malos = resultados.filter((r) => r.fallas.length);
process.stdout.write(`\n${malos.length ? `❌ ${malos.length} de ${resultados.length} con fallas` : `✅ ${resultados.length}/${resultados.length}`}\n`);
await sql.end();
process.exit(malos.length ? 1 : 0);
