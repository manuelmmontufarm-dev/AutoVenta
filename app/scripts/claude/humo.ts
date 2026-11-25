/**
 * HUMO DE CLAUDE: ¿las peticiones que el bot arma de verdad pasan por Anthropic?
 *
 *   npm run claude:humo                                   # Fable 5.2 y Haiku 5.5
 *   npm run claude:humo -- --modelos claude-opus-5-5,claude-sonnet-5-5
 *   npm run claude:humo -- --esfuerzo medium
 *
 * Es lo PRIMERO que se corre cuando llega la clave, antes de gastar un lote del
 * simulador: cuesta centavos y tarda un minuto. Las pruebas de `test/chatClaude`
 * comprueban la traducción sin red; esto comprueba lo que solo el API real
 * puede decir — que acepta cada forma de petición, que el razonamiento de una
 * ronda vuelve válido en la siguiente, que el caché pega, y cuánto tarda.
 *
 * Pasa por `completarChat`, la misma puerta que usan el vendedor y el Guardián,
 * con la rúbrica y el esquema REALES del Guardián. No toca la base ni WhatsApp.
 *
 * La clave sale de app/.env.sim (`ANTHROPIC_API_KEY=`), nunca de app/.env: son
 * tokens de prueba y no se le cobran a ningún cliente.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ChatCompletion, ChatCompletionMessageParam } from "openai/resources/chat/completions";

const arg = (n: string, d: string): string => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const APP = resolve(import.meta.dirname, "../..");

function claveDePruebas(): string {
  const ruta = resolve(APP, ".env.sim");
  const linea = existsSync(ruta) ? readFileSync(ruta, "utf8").split("\n").find((l) => l.startsWith("ANTHROPIC_API_KEY=")) : null;
  const clave = process.env.ANTHROPIC_API_KEY_SIM ?? linea?.slice("ANTHROPIC_API_KEY=".length).trim();
  if (!clave) {
    console.error("\n  ❌  Falta la clave de Anthropic de PRUEBAS.\n\n      Agregá una línea en app/.env.sim (ese archivo no se versiona):\n\n        ANTHROPIC_API_KEY=sk-ant-…\n");
    process.exit(2);
  }
  return clave;
}

// config.ts exige estas variables al cargarse; acá no se usa ninguna de verdad.
process.env.ANTHROPIC_API_KEY = claveDePruebas();
process.env.OPENAI_API_KEY ||= "no-se-usa";
process.env.DATABASE_URL = "postgresql://localhost/no-se-usa";
// Nada de proxies heredados de la terminal: el humo le habla a Anthropic, salvo
// que se pida a mano otra dirección (un doble local, para probar este script).
if (arg("base-url", "")) process.env.ANTHROPIC_BASE_URL = arg("base-url", "");
else delete process.env.ANTHROPIC_BASE_URL;

const { completarChat, tokensEscritosEnCache } = await import("../../src/agent/chat.js");
const { costoEnUsd } = await import("../../src/services/billing.js");
const { ESQUEMA_SALIDA, INSTRUCCIONES } = await import("../../src/services/guardian.js");
const { sql } = await import("../../src/db/client.js");

const MODELOS = arg("modelos", "claude-fable-5-2,claude-haiku-5-5").split(",").map((m) => m.trim()).filter(Boolean);
const ESFUERZO = arg("esfuerzo", "low") as "low" | "medium" | "high";
const sinOpenAI = null as never;

const HERRAMIENTAS = [
  {
    type: "function" as const,
    function: {
      name: "buscar_llanta",
      description: "Busca en el catálogo las llantas disponibles de una medida. Devuelve marca, diseño, precio y stock.",
      parameters: { type: "object", properties: { medida: { type: "string", description: "Medida, p. ej. 205/55R16" } }, required: ["medida"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generar_cotizacion",
      description: "Genera la cotización formal de un producto del catálogo. Es la única forma de cotizar.",
      parameters: { type: "object", properties: { code: { type: "string" }, cantidad: { type: "integer" } }, required: ["code", "cantidad"] },
    },
  },
];

// Un system largo a propósito: por debajo de ~512 tokens Anthropic no cachea y
// la prueba del caché no diría nada. El del bot real mide más que esto.
const SYSTEM_VENDEDOR = [
  "Eres el asistente de ventas por WhatsApp de una llantera de Quito. Atiendes de usted, breve y concreto, en español de Ecuador.",
  "Tu trabajo es llevar al cliente de la medida a la cotización: confirmas la medida, buscas en el catálogo con buscar_llanta, ofreces opciones reales y cotizas con generar_cotizacion.",
  "REGLAS: nunca inventes precios, stock ni promociones: todo dato sale de una herramienta. Nunca preguntes la cantidad: se cotiza el juego de 4 salvo que el cliente diga otra. No repitas preguntas que el cliente ya respondió.",
  "Si el cliente da una medida completa (ancho/perfil y aro), búscala en este mismo turno sin pedir confirmación. Si da solo el aro, pregunta el ancho y el perfil en una sola línea.",
  "Cuando una herramienta devuelve opciones, preséntalas en una lista corta con marca, diseño y precio unitario, y cierra preguntando si le cotiza el juego de 4.",
  "Si el cliente pide hablar con una persona, dile que un asesor lo contacta por este mismo chat. No des teléfonos ni direcciones que no estén en tus hechos.",
  ...Array.from({ length: 14 }, (_, i) => `Detalle de política ${i + 1}: los beneficios incluidos (alineación, balanceo, válvulas y nitrógeno) se mencionan solo si el cliente pregunta o al cotizar; las garantías dependen de la marca y se explican sin prometer plazos que no estén escritos; los pagos con tarjeta y en efectivo tienen el mismo precio salvo que un hecho del turno diga otra cosa.`),
].join("\n\n");

interface Fila { modelo: string; prueba: string; ok: boolean; nota: string; ms: number; entrada: number; leido: number; escrito: number; salida: number; razon: number; usd: number }
const filas: Fila[] = [];

async function medir(modelo: string, prueba: string, llamar: () => Promise<ChatCompletion>, revisar: (r: ChatCompletion) => string | null): Promise<ChatCompletion | null> {
  const inicio = Date.now();
  try {
    const r = await llamar();
    const ms = Date.now() - inicio;
    const u = r.usage!;
    const leido = u.prompt_tokens_details?.cached_tokens ?? 0;
    const escrito = tokensEscritosEnCache(r);
    const problema = revisar(r);
    filas.push({
      modelo, prueba, ok: !problema, nota: problema ?? (r.model !== modelo ? `atendió ${r.model}` : ""), ms,
      entrada: u.prompt_tokens, leido, escrito, salida: u.completion_tokens, razon: u.completion_tokens_details?.reasoning_tokens ?? 0,
      usd: costoEnUsd(r.model, { input: u.prompt_tokens, cached: leido, cacheWrite: escrito, output: u.completion_tokens }),
    });
    return problema ? null : r;
  } catch (error) {
    const e = error as { status?: number; message?: string };
    filas.push({ modelo, prueba, ok: false, nota: `${e.status ?? ""} ${e.message ?? String(error)}`.trim().slice(0, 220), ms: Date.now() - inicio, entrada: 0, leido: 0, escrito: 0, salida: 0, razon: 0, usd: 0 });
    return null;
  }
}

for (const modelo of MODELOS) {
  const pedir = (messages: ChatCompletionMessageParam[], extra: Record<string, unknown> = {}) => () => completarChat(sinOpenAI, {
    model: modelo, messages, tools: HERRAMIENTAS, tool_choice: "auto", parallel_tool_calls: false, max_completion_tokens: 2048, ...extra,
  }, { esfuerzo: ESFUERZO });

  // 1) El turno del vendedor, con la forma exacta de agent.ts: system, historial
  //    que empieza en el bot, hechos del turno detrás del historial, y el cliente.
  const turno: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_VENDEDOR },
    { role: "assistant", content: "Buenos días, ¿en qué le puedo ayudar?" },
    { role: "user", content: "hola buenas" },
    { role: "assistant", content: "Con gusto. ¿Qué medida de llanta necesita?" },
    { role: "system", content: "HECHO (fuente determinística): el cliente llegó desde un anuncio de Kenda." },
    { role: "system", content: "BENEFICIOS VIGENTES: alineación y balanceo incluidos en el juego de 4." },
    { role: "user", content: "205/55R16 para un Chevrolet Cruze" },
  ];
  const r1 = await medir(modelo, "vendedor · ronda 1 (debe buscar)", pedir(turno),
    (r) => (r.choices[0].message.tool_calls?.[0]?.type === "function" && r.choices[0].message.tool_calls[0].function.name === "buscar_llanta" ? null : `no llamó buscar_llanta: ${JSON.stringify(r.choices[0].message).slice(0, 160)}`));
  if (r1) {
    const llamada = r1.choices[0].message.tool_calls![0];
    const conResultado: ChatCompletionMessageParam[] = [
      ...turno,
      r1.choices[0].message,
      { role: "tool", tool_call_id: llamada.id, content: JSON.stringify({ medida: "205/55R16", opciones: [{ code: "K205", marca: "KENDA", diseno: "KR203", precio_unitario: 78.5, stock: 12 }, { code: "F205", marca: "FALKEN", diseno: "ZE310", precio_unitario: 96.0, stock: 8 }] }) },
      { role: "system", content: "RECORDATORIO: presenta las opciones y ofrece cotizar el juego de 4. No cotices todavía." },
    ];
    // 2) La ronda siguiente reenvía el razonamiento de la anterior y debe leer del caché.
    const r2 = await medir(modelo, "vendedor · ronda 2 (razonamiento + caché)", pedir(conResultado),
      (r) => (!r.choices[0].message.content ? "sin texto"
        : (r.usage!.prompt_tokens_details?.cached_tokens ?? 0) === 0 ? "contestó, pero NO leyó nada del caché"
          : null));
    if (r2) {
      // 3) El rescate: misma lista de herramientas, prohibido llamarlas.
      await medir(modelo, "rescate (herramientas prohibidas)", pedir([
        ...conResultado.slice(0, -1),
        { role: "system", content: "Se acabaron los intentos con herramientas. Responde AHORA al cliente con lo que ya sabes." },
      ], { tool_choice: "none" }), (r) => (r.choices[0].message.tool_calls?.length ? "llamó una herramienta con tool_choice none" : r.choices[0].message.content ? null : "sin texto"));
      // 4) La vuelta forzada: un system justo después de un texto del asistente.
      await medir(modelo, "vuelta forzada (debe cotizar)", pedir([
        ...conResultado,
        r2.choices[0].message,
        { role: "user", content: "la kenda, cotíceme" },
        { role: "assistant", content: "Con gusto, le preparo la Kenda." },
        { role: "system", content: "TE FALTÓ LA OBLIGACIÓN DEL TURNO: el cliente pidió la cotización y no llamaste generar_cotizacion. Llámala AHORA con code K205 y 4 llantas." },
      ]), (r) => (r.choices[0].message.tool_calls?.some((c) => c.type === "function" && c.function.name === "generar_cotizacion") ? null : `no cotizó: ${JSON.stringify(r.choices[0].message).slice(0, 160)}`));
    }
  }

  // 5) El Guardián, con su rúbrica y su esquema reales. El borrador «correcto»
  //    es el que gpt-5.5 aprueba hoy: opciones numeradas con total y «¿la 1 o
  //    la 2?» (24-nov: el anterior lo corregían gpt-5.5 y los 4 Claude por igual). Dos veces: la segunda
  //    tiene que leer la rúbrica del caché (es el 60 % de lo que paga Depot).
  const guardian = (borrador: string) => () => completarChat(sinOpenAI, {
    model: modelo,
    messages: [
      { role: "system", content: INSTRUCCIONES },
      { role: "user", content: `CONVERSACIÓN:\nCLIENTE: 205/55R16 para un Cruze\n\nHECHOS DUROS: catálogo 205/55R16 → KENDA KR203 $78.50 (stock 12); FALKEN ZE310 $96.00 (stock 8).\n\nBORRADOR A REVISAR:\n${borrador}` },
    ],
    response_format: ESQUEMA_SALIDA as never,
    max_completion_tokens: 2000,
    stream: false,
  }, { esfuerzo: ESFUERZO });
  const veredicto = (esperado: string) => (r: ChatCompletion): string | null => {
    try {
      const v = JSON.parse(r.choices[0].message.content ?? "") as { veredicto?: string };
      return v.veredicto === esperado ? null : `esperaba «${esperado}» y dijo «${v.veredicto}»`;
    } catch { return `no devolvió JSON: ${(r.choices[0].message.content ?? "").slice(0, 120)}`; }
  };
  await medir(modelo, "guardián · borrador correcto", guardian("Tenemos dos opciones en 205/55R16:\n\n1 · KENDA KR203 — $78.50 c/u · 4 = $314.00\n2 · FALKEN ZE310 — $96.00 c/u · 4 = $384.00\n\n¿Le cotizo la 1 o la 2?"), veredicto("aprobar"));
  await medir(modelo, "guardián · precio inventado (+caché)", guardian("Tenemos la KENDA KR203 en 205/55R16 a $59.90 c/u con envío gratis a todo el país. ¿Le cotizo el juego de 4 llantas?"),
    (r) => veredicto("corregir")(r) ?? ((r.usage!.prompt_tokens_details?.cached_tokens ?? 0) === 0 ? "corrigió, pero la rúbrica NO se leyó del caché" : null));

  // 6) El clasificador: tope de 128 y JSON sin esquema.
  await medir(modelo, "clasificador (json_object, tope 128)", () => completarChat(sinOpenAI, {
    model: modelo, max_completion_tokens: 128, response_format: { type: "json_object" },
    messages: [{ role: "user", content: 'Clasifica el último mensaje del cliente en una etapa: nuevo, medida_confirmada, seleccionando. Devuelve SOLO JSON {"stage":"..."}.\n\nCLIENTE: necesito 205/55R16' }],
  }, { esfuerzo: ESFUERZO }), (r) => { try { return (JSON.parse(r.choices[0].message.content ?? "") as { stage?: string }).stage ? null : "JSON sin stage"; } catch { return "no devolvió JSON"; } });
}

await sql.end({ timeout: 1 }).catch(() => undefined);

console.log(`\nHumo de Claude · esfuerzo ${ESFUERZO}\n`);
console.log("  " + ["", "modelo".padEnd(19), "prueba".padEnd(40), "seg".padStart(5), "entrada".padStart(8), "leído".padStart(7), "escrito".padStart(8), "salida".padStart(7), "razona".padStart(7), "$".padStart(8)].join(" "));
for (const f of filas) {
  console.log("  " + [f.ok ? "✅" : "❌", f.modelo.padEnd(19), f.prueba.padEnd(40), (f.ms / 1000).toFixed(1).padStart(5), String(f.entrada).padStart(8), String(f.leido).padStart(7), String(f.escrito).padStart(8), String(f.salida).padStart(7), String(f.razon).padStart(7), f.usd.toFixed(4).padStart(8)].join(" ") + (f.nota ? `\n       ↳ ${f.nota}` : ""));
}
const fallas = filas.filter((f) => !f.ok).length;
console.log(`\n  ${filas.length - fallas} de ${filas.length} pruebas pasaron · gastado $${filas.reduce((a, f) => a + f.usd, 0).toFixed(3)}`);
console.log("  Qué mirar: «seg» del vendedor contra los ~3,5 s de gpt-5.5 y del Guardián contra ~2 s (su tope es 20 s);\n  «leído» > 0 en las rondas marcadas con caché; «razona» es lo que Claude piensa y gpt-5.5 no paga.\n");
process.exit(fallas ? 1 : 0);
