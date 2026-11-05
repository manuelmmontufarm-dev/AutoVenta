/**
 * Semilla de una base NUEVA para el perfil activo (R-35).
 *
 * `seed-depot.ts` quedó corto para un segundo cliente: deja el esquema y los
 * prompts, pero no escribe `guardian_config`, `ai_config`, `pieces_config` ni
 * `store_hours` — en Depot esas llaves ya existían en producción y el simulador
 * las copia de allá. Una base vacía de Mundillantas no tiene de dónde copiarlas,
 * y sin ellas ni el bot se comporta como se espera ni el simulador acepta la
 * base (`AJUSTES_QUE_IMPORTAN` en `scripts/sim/sim.mjs`).
 *
 * Esta semilla generaliza aquello SIN tocarlo: los valores salen de los
 * defaults de `services/settings.ts`, que ya se derivan del perfil elegido por
 * `NEGOCIO` (los horarios, por ejemplo, salen de `horarioPorDefecto`/
 * `horasPorDia` de cada local). Es idempotente a propósito: cada llave se
 * escribe solo si no existe, así correrla sobre una base viva no pisa lo que el
 * dueño ya cambió desde Ajustes.
 *
 * Uso:  NEGOCIO=<id> npm run seed:negocio
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sql } from "./client.js";
import { ensureSchema } from "./schema.js";
import { negocio } from "../negocio/index.js";
import type { PerfilDeNegocio } from "../negocio/index.js";
import {
  DEFAULT_AI_CONFIG,
  DEFAULT_GUARDIAN_CONFIG,
  DEFAULT_PIECES_CONFIG,
  DIAS_SEMANA,
  StoreHoursSchema,
  ensureDefaultStagePrompts,
  type StoreHours,
} from "../services/settings.js";
import { savePhaseFlags } from "../services/phases.js";

/** `lun…dom` → el índice de `horasPorDia` (0 = domingo … 6 = sábado). */
const INDICE_DEL_DIA: Record<(typeof DIAS_SEMANA)[number], number> = {
  lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 0,
};

/**
 * Los horarios de arranque de cada local, desde el PERFIL.
 *
 * `DEFAULT_STORE_HOURS` de `settings.ts` cae en 08:30–17:30 los siete días para
 * todo local sin `horarioPorDefecto`, y así una base nueva le ofrecía al
 * cliente un domingo que el negocio no abre (pasó con `ejemplo`: lun–vie
 * 9–18 en su perfil, sembrado 08:30–17:30 toda la semana). Acá manda, en orden:
 * el `horarioPorDefecto` del local; si no, `horasPorDia` del negocio, día por
 * día, con `null` = cerrado.
 */
export function horariosDelPerfil(perfil: PerfilDeNegocio): StoreHours {
  const cualquierTramo = Object.values(perfil.horasPorDia).find(Boolean) ?? { open: "08:30", close: "17:30" };
  return StoreHoursSchema.parse(Object.fromEntries(perfil.locales.map((local) => {
    if (local.horarioPorDefecto) return [local.claveHorario, local.horarioPorDefecto];
    const dias = Object.fromEntries(DIAS_SEMANA.map((dia) => {
      const tramo = perfil.horasPorDia[INDICE_DEL_DIA[dia]];
      return [dia, tramo ? { ...tramo, closed: false } : { ...cualquierTramo, closed: true }];
    }));
    return [local.claveHorario, { dias, excepciones: [] }];
  })));
}

/** Las llaves de `settings` que el simulador exige (AJUSTES_QUE_IMPORTAN). */
const LLAVES_DE_ARRANQUE: Array<[string, unknown]> = [
  // El guardián nace PRENDIDO en un cliente nuevo: en Depot, Manuel quitó el
  // interruptor del panel (24-oct) porque apagarlo para ahorrar dejaba pasar
  // los errores que el cliente sí ve. El default del esquema sigue apagado
  // para no cambiar a nadie que ya exista; la semilla decide para los nuevos.
  ["guardian_config", { ...DEFAULT_GUARDIAN_CONFIG, activo: true }],
  ["ai_config", DEFAULT_AI_CONFIG],
  ["pieces_config", DEFAULT_PIECES_CONFIG],
  ["store_hours", horariosDelPerfil(negocio)],
];

/**
 * Deja la base lista para el perfil activo. Devuelve qué llaves escribió (las
 * que ya existían no se tocan), para poder afirmarlo en la prueba y en el log.
 */
export async function sembrarNegocio(): Promise<{ escritas: string[]; existentes: string[] }> {
  await ensureSchema();
  await ensureDefaultStagePrompts();

  // Las fases arrancan según PHASES_DEFAULT (como en cualquier servicio nuevo),
  // pero solo si nadie las guardó todavía: la semilla nunca apaga una fase que
  // el dueño encendió.
  const [fases] = await sql<{ hay: number }[]>`select 1 as hay from settings where key = 'phase_config'`;
  if (!fases) await savePhaseFlags({});

  const escritas: string[] = [];
  const existentes: string[] = [];
  for (const [llave, valor] of LLAVES_DE_ARRANQUE) {
    const filas = await sql<{ key: string }[]>`
      insert into settings (key, value) values (${llave}, ${sql.json(valor as never)})
      on conflict (key) do nothing
      returning key
    `;
    (filas.length ? escritas : existentes).push(llave);
  }
  return { escritas, existentes };
}

async function main(): Promise<void> {
  console.log(`🌱 Semilla para NEGOCIO=${negocio.id} (${negocio.nombre})`);
  const { escritas, existentes } = await sembrarNegocio();
  console.log("✅ Esquema y prompts por etapa listos");
  for (const llave of escritas) console.log(`✅ ${llave}: sembrada desde el perfil`);
  for (const llave of existentes) console.log(`· ${llave}: ya existía, no se toca`);
  console.log("🏁 Semilla completada.");
  await sql.end();
}

// Igual que seed-depot: como script hace todo; importado (por la prueba o por
// el simulador) solo exporta.
const esScript = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;
if (esScript) {
  main().catch((error) => {
    console.error("❌ Semilla falló:", error);
    process.exit(1);
  });
}
