#!/usr/bin/env node
/**
 * Regresiones de la auditoría de producción del 22 al 24-sep-2026.
 *
 * Cada juez consulta hechos persistidos por el bot (mensajes, ficha, piezas,
 * cotizaciones y jobs); no califica palabras sueltas de una respuesta aislada.
 *
 * Uso, con `npm run sim` ya levantado:
 *   node scripts/sim/auditoria-24-sep.mjs
 *   SIM_SOLO=F1 node scripts/sim/auditoria-24-sep.mjs
 */
import { activarBot, mandar, pausa, reiniciar, sql } from "./lib/corredor-t115.mjs";

const ESCENARIOS = [
  {
    id: "F1",
    titulo: "conv 22549 · el seguimiento no vuelve a pedir una numeración que el cliente no tiene",
    pasos: [
      {
        m: "Buenas noches, la numeración no me pida porque no tengo",
        despues: async (t) => {
          const convId = t._estado.conv.id;
          const [job] = await sql`
            update follow_up_jobs set due_at=now()
            where id=(
              select id from follow_up_jobs
              where conversation_id=${convId} and status='scheduled' and type='in_window_first'
              order by id limit 1
            ) returning id
          `;
          if (!job) return ["no se programó el primer seguimiento"];
          await pausa(20_000);
          const mensajes = await sql`
            select content from messages
            where conversation_id=${convId} and metadata ? 'followUpJobId'
            order by id
          `;
          if (!mensajes.length) return ["el job venció pero no persistió ningún seguimiento"];
          const texto = mensajes.map((m) => m.content ?? "").join("\n");
          return [
            ...(/medida|numeraci[oó]n/i.test(texto) ? [`repitió la pregunta prohibida: «${texto.slice(0, 160)}»`] : []),
            ...(/veh[ií]culo|foto/i.test(texto) ? [] : ["no ofreció vehículo o foto como vía alternativa"]),
          ];
        },
      },
    ],
  },
];

const solo = (process.env.SIM_SOLO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
await activarBot().catch(() => undefined);
let fallas = 0;
for (const escenario of ESCENARIOS.filter((e) => !solo.length || solo.includes(e.id))) {
  await reiniciar();
  console.log(`\n━━ ${escenario.id} · ${escenario.titulo}`);
  for (const paso of escenario.pasos) {
    const turno = await mandar(paso.m, paso.extra ?? {});
    await pausa(1500);
    console.log(`  👤 ${turno.cliente}`);
    for (const mensaje of turno.bot) {
      console.log(`  🤖 ${(mensaje.texto ?? "").replace(/\n+/g, " ⏎ ").slice(0, 260)}`);
    }
    const malas = paso.despues ? await paso.despues(turno) : [];
    console.log(malas.length ? `  ❌ ${malas.join(" · ")}` : "  ✅ pasó");
    fallas += malas.length;
  }
}
console.log(`\n${fallas ? `❌ ${fallas} falla(s)` : "✅ todo pasó"}`);
await sql.end();
process.exit(fallas ? 1 : 0);
