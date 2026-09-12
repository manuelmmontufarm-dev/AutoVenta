#!/usr/bin/env node
/**
 * Los casos de la auditoría del 8 al 11-sep-2026 que cotizaron la medida
 * equivocada, corridos contra el bot entero.
 *
 * Uso (con un simulador ya levantado):
 *   SIM_APP_URL=http://localhost:3305 SIM_DATABASE_URL=postgres://…/autoventa_sim_medida \
 *     node scripts/sim/medida-auditoria.mjs
 *
 * Cada escenario es un chat real. El juicio es sobre lo que el CLIENTE habría
 * recibido: qué medida se cotizó, contra qué medida se rotuló la lámina, y si
 * el bot pidió lo que le faltaba en vez de adivinarlo.
 */
import { writeFile } from "node:fs/promises";
import { correrEscenario, textoDeTodos, sql } from "./lib/corredor-t115.mjs";

const ESCENARIOS = [
  {
    id: "A1",
    familia: "medida",
    titulo: "conv 18821 · «32x10.50 Rin 15» + «En MT» → cotizó KR29 215/75R15 por $726.83",
    mensajes: ["¡Hola! Quiero más información", "32x10.50 Rin 15", "En MT", "Listo gracias", "Si yo necesito 4"],
    juzgar: (r) => {
      const fallas = [];
      const cots = r.estadoFinal?.cotizaciones ?? [];
      const metricas = cots.flatMap((c) => c.items ?? []).filter((i) => /^\d{3}\/\d{2}R\d{2}$/.test(i.sizeLabel ?? ""));
      if (metricas.length) {
        fallas.push(`cotizó una medida métrica (${metricas.map((i) => i.sizeLabel).join(", ")}) para un pedido en pulgadas`);
      }
      if (r.estadoFinal?.tire_size && /^\d{3}\/\d{2}R\d{2}$/.test(r.estadoFinal.tire_size)) {
        fallas.push(`la ficha quedó con la medida métrica ${r.estadoFinal.tire_size}`);
      }
      return fallas;
    },
  },
  {
    id: "A2",
    familia: "medida",
    titulo: "conv 18535 · «Llantas 33 * 12.5 rin 15» → «no me aparece stock» con 6 en bodega",
    mensajes: ["¡Hola! Quiero más informaciónl. Llantas 33 * 12.5 rin 15", "Llantas 33 * 12.5 rin 15"],
    juzgar: (r) => {
      const fallas = [];
      const texto = textoDeTodos(r.turnos);
      const ficha = r.estadoFinal?.tire_size ?? "";
      if (ficha && !/33/.test(ficha)) fallas.push(`la ficha quedó con ${ficha} en vez de la medida pedida`);
      if (/0R15/.test(ficha)) fallas.push("la ficha quedó con la medida rota 0R15");
      if (/necesito la medida exacta/i.test(texto)) fallas.push("pidió la medida exacta habiéndola recibido");
      return fallas;
    },
  },
  {
    id: "B1",
    familia: "vehiculo",
    titulo: "conv 18684 · «Qashqai 2020 rin 17» → cotizó 215/45R17 sin medida del cliente",
    mensajes: [
      "¡Hola! Quiero más información",
      "para un nissan Qashqai 2020 rin 17",
      "Falken por favor el juego 4 llantas",
    ],
    juzgar: (r) => {
      const fallas = [];
      const cots = r.estadoFinal?.cotizaciones ?? [];
      if (cots.length) {
        fallas.push(`cotizó ${cots.map((c) => (c.items ?? []).map((i) => i.sizeLabel).join("/")).join(", ")} sin que el cliente escribiera su medida`);
      }
      return fallas;
    },
  },
  {
    id: "C1",
    familia: "medida",
    titulo: "conv 18893 · «Que cuestan las 235,75r15» → pidió la medida exacta",
    mensajes: ["¡Hola! Quiero más información", "Que cuestan las 235,75r15"],
    juzgar: (r) => {
      const fallas = [];
      const texto = textoDeTodos(r.turnos);
      if (/necesito la medida exacta/i.test(texto)) fallas.push("pidió la medida exacta habiéndola recibido");
      if (r.estadoFinal?.tire_size !== "235/75R15") {
        fallas.push(`la ficha quedó con ${r.estadoFinal?.tire_size ?? "nada"} en vez de 235/75R15`);
      }
      return fallas;
    },
  },
  {
    id: "D1",
    familia: "medida",
    titulo: "conv 18677 · «¿Dispone llantas MT 30.5 r15?» → ofreció 215/75R15 como «la única»",
    mensajes: ["¡Hola! Quiero más información", "Buenas tardes.", "¿Dispone llantas MT 30.5 r15?"],
    juzgar: (r) => {
      const fallas = [];
      const texto = textoDeTodos(r.turnos);
      if (/es la única que tengo para lo que me pidió/i.test(texto)) {
        fallas.push("dijo «la única que tengo para lo que me pidió» sobre una medida distinta");
      }
      if (r.estadoFinal?.tire_size && /^\d{3}\/\d{2}R\d{2}$/.test(r.estadoFinal.tire_size)) {
        fallas.push(`la ficha quedó con la métrica ${r.estadoFinal.tire_size} por una medida en pulgadas`);
      }
      return fallas;
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
  resultados.push({ id: escenario.id, titulo: escenario.titulo, fallas, turnos: r.turnos, estadoFinal: r.estadoFinal });
  for (const [i, t] of r.turnos.entries()) {
    const dicho = (t.bot ?? []).map((b) => (b.tipo === "image" ? `[imagen] ${b.texto}` : b.texto)).join(" § ");
    process.stdout.write(`   ${i + 1}. «${escenario.mensajes[i]}»\n      → ${dicho.slice(0, 220) || "(sin respuesta)"}\n`);
    if (t.herramientas?.length) process.stdout.write(`      herramientas: ${t.herramientas.join(", ")}\n`);
  }
  const cots = r.estadoFinal?.cotizaciones ?? [];
  process.stdout.write(`   ficha: medida=${r.estadoFinal?.tire_size ?? "—"} · cotizaciones: ${cots.length ? cots.map((c) => `${c.numero} ${(c.items ?? []).map((i) => `${i.quantity}× ${i.sizeLabel}`).join(", ")}`).join(" | ") : "ninguna"}\n`);
  process.stdout.write(fallas.length ? `   ❌ ${fallas.join(" · ")}\n` : "   ✅ sin fallas\n");
}

await writeFile(
  new URL("./medida-auditoria-resultado.json", import.meta.url),
  JSON.stringify(resultados, null, 1),
);
const malos = resultados.filter((r) => r.fallas.length);
process.stdout.write(`\n${malos.length ? `❌ ${malos.length} de ${resultados.length} con fallas` : `✅ ${resultados.length}/${resultados.length}`}\n`);
await sql.end();
process.exit(malos.length ? 1 : 0);
