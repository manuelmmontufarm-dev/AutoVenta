/**
 * CUÁNTOS TOKENS PESA LA RÚBRICA DEL GUARDIÁN — CONTADOS, NO ESTIMADOS.
 *
 * El plan de adelgazar al guardián contaba «tokens» como caracteres ÷ 4 (la
 * regla 22 decía 611 y eran 469). Para decidir qué recorte vale la pena hace
 * falta el número exacto, y OpenAI lo da sin generar nada:
 * `responses.inputTokens.count`. Se cuenta la MISMA petición del guardián
 * (instrucciones + contexto de muestra + esquema de salida) con la rúbrica de
 * dos árboles de código, y la diferencia es exacta.
 *
 * Después traduce esa diferencia a plata con cómo se cobra de verdad: la
 * rúbrica va al principio de la petición y producción la tiene en caché en
 * casi todas las llamadas (4.864 tokens cacheados en 1.182 de 1.415 llamadas,
 * 7 días al 12-sep-2026), así que un token de rúbrica cuesta casi siempre
 * $0,50/M y no $5/M.
 *
 *   node scripts/guardian/contar-tokens-rubrica.mjs --a <árbol> --b <árbol>
 *
 * Cada árbol es la raíz de un checkout con `app/dist` compilado (npm run build).
 * Usa la clave de `.env.sim` (la de pruebas), no la del bot.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const aquí = dirname(fileURLToPath(import.meta.url));
const raízApp = resolve(aquí, "../..");
const argv = process.argv.slice(2);
const valor = (nombre, porDefecto = null) => {
  const i = argv.indexOf(`--${nombre}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : porDefecto;
};

for (const archivo of [".env", ".env.sim"]) {
  try {
    for (const linea of readFileSync(resolve(raízApp, archivo), "utf8").split("\n")) {
      const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* opcional */ }
}
delete process.env.OPENAI_BASE_URL;
process.env.WHATSAPP_TOKEN ||= "x"; process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x"; process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "593999000111";

const OpenAI = createRequire(resolve(raízApp, "package.json"))("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODELO = valor("modelo", process.env.OPENAI_GUARDIAN_MODEL || "gpt-5.5");

// Supuestos de cobro, medidos en producción (ai_runs, 7 días al 12-sep-2026).
const LLAMADAS_POR_CONVERSACION = Number(valor("llamadas", "4.37"));
const PCT_LLAMADAS_CON_RUBRICA_EN_CACHE = Number(valor("pct-cache", "0.961"));
const PCT_SEGUIMIENTO = Number(valor("pct-seguimiento", "0.294")); // 416 de 1.415
const TARIFA = { input: 5, cachedInput: 0.5 }; // gpt-5.5, igual que services/billing.ts

/** Un contexto de muestra con la forma de `armarContexto`. Es el mismo en A y B. */
const CONTEXTO = `== HECHOS REGISTRADOS ==
Medidas que el cliente pidió: 225/70R15
Vehículo: MAZDA BT 50
Local ya elegido: (ninguno)
Visita registrada: (ninguna)
Cotización vigente: ninguna

== CONVERSACIÓN (lo más reciente al final) ==
CLIENTE: ¡Hola! Quiero más información sobre el costo de un juego completo de llantas 225/70 R15 para camioneta MAZDA BT 50
BOT: Opciones enviadas: KENDA KR100 · KENDA KR33A · KENDA KR15
CLIENTE: 2...o 3...por favor... gracias

== BORRADOR ==
La opción 2, equilibrada, es la KENDA KR33A en 225/70R15: $132.84 c/u con IVA.`;

async function cargarArbol(raiz) {
  const guardian = await import(pathToFileURL(resolve(raiz, "app/dist/services/guardian.js")).href);
  // INSTRUCCIONES_SEGUIMIENTO no se exporta: se lee del fuente del mismo árbol.
  const fuente = readFileSync(resolve(raiz, "app/src/services/guardian.ts"), "utf8");
  const seguimiento = fuente.match(/const INSTRUCCIONES_SEGUIMIENTO = `([\s\S]*?)`;/)?.[1] ?? "";
  return { INSTRUCCIONES: guardian.INSTRUCCIONES, ESQUEMA: guardian.ESQUEMA_SALIDA, seguimiento };
}

async function contar({ instrucciones, input, esquema }) {
  const js = esquema?.json_schema;
  const r = await openai.responses.inputTokens.count({
    model: MODELO,
    ...(instrucciones ? { instructions: instrucciones } : {}),
    input,
    ...(js ? { text: { format: { type: "json_schema", name: js.name, schema: js.schema, strict: js.strict } } } : {}),
  });
  return r.input_tokens;
}

async function medir(nombre, raiz) {
  const a = await cargarArbol(raiz);
  const vacio = await contar({ input: CONTEXTO });
  const conRubrica = await contar({ instrucciones: a.INSTRUCCIONES, input: CONTEXTO, esquema: a.ESQUEMA });
  const soloEsquema = await contar({ input: CONTEXTO, esquema: a.ESQUEMA });
  const conSeguimiento = await contar({ input: `${CONTEXTO}\n${a.seguimiento}` });
  return {
    nombre, raiz,
    peticionTurno: conRubrica,
    rubrica: conRubrica - soloEsquema,
    esquema: soloEsquema - vacio,
    bloqueSeguimiento: conSeguimiento - vacio,
    caracteresRubrica: a.INSTRUCCIONES.length,
  };
}

const A = valor("a"), B = valor("b");
if (!A || !B) {
  console.error("Uso: node scripts/guardian/contar-tokens-rubrica.mjs --a <árbol antes> --b <árbol después>");
  process.exit(1);
}
const [ma, mb] = [await medir("A (antes)", resolve(A)), await medir("B (después)", resolve(B))];
console.table([ma, mb].map(({ raiz, ...m }) => ({ ...m, "car/token": +(m.caracteresRubrica / m.rubrica).toFixed(2) })));

const dTurno = ma.rubrica - mb.rubrica;
const dSeguimiento = mb.bloqueSeguimiento - ma.bloqueSeguimiento;
// Por llamada: la rúbrica viaja en TODAS; el bloque de seguimiento solo en esas.
const dPorLlamada = dTurno - PCT_SEGUIMIENTO * dSeguimiento;
const precioToken = (PCT_LLAMADAS_CON_RUBRICA_EN_CACHE * TARIFA.cachedInput + (1 - PCT_LLAMADAS_CON_RUBRICA_EN_CACHE) * TARIFA.input) / 1e6;
const ahorroConv = dPorLlamada * precioToken * LLAMADAS_POR_CONVERSACION;
const ahorroFrio = dPorLlamada * (TARIFA.input / 1e6) * LLAMADAS_POR_CONVERSACION;

console.log(`\nRúbrica: ${ma.rubrica} → ${mb.rubrica} tokens (${dTurno >= 0 ? "−" : "+"}${Math.abs(dTurno)}).`);
console.log(`Bloque de seguimiento: ${ma.bloqueSeguimiento} → ${mb.bloqueSeguimiento} tokens.`);
console.log(`Neto por llamada del guardián: ${dPorLlamada.toFixed(0)} tokens.`);
console.log(`Ahorro por conversación con el caché de producción: $${ahorroConv.toFixed(5)}`);
console.log(`Ahorro por conversación si NADA estuviera en caché:   $${ahorroFrio.toFixed(5)} (techo)`);
