#!/usr/bin/env node
/**
 * El doble local que hace posible un `--dry` que MIDA algo.
 *
 * ── Por qué existe, si ya hay scripts/loadtest/stub-openai.mjs ──────────────
 * Aquel stub responde otra pregunta: "¿aguanta la carga?". Para eso le basta
 * devolver texto, y su única tool-call apunta a un nombre que en el bot no
 * existe (`buscar_llantas`, con ese plural), así que el agente NUNCA llama una
 * tool. Consecuencia medida: en el `--dry` viejo `tools_usadas` salía `[]` en
 * los 17 turnos y los detectores `cotizacion_duplicada` y `opciones_reenviadas`
 * jamás se ejecutaban con datos — justo los dos que dependen de lo que las
 * tools escriben. El `--dry` validaba el transporte y no la medición.
 *
 * Este doble sirve DOS APIs y guía al bot por el camino completo:
 *
 *   · /v1/chat/completions  — OpenAI. Guion determinista por conversación:
 *       buscar_llanta → preparar_opciones → generar_cotizacion (×2 con dos
 *       productos de idéntico precio, que es como se ve una cotización
 *       duplicada de verdad) → texto de cierre.
 *   · /contifico/producto/  — Contífico. Un catálogo mínimo en memoria, con
 *       las medidas de las fixtures. Sin esto `ensureCatalogReady()` revienta y
 *       ninguna tool llega a escribir un mensaje.
 *
 * Nada sale a la red: el catálogo son objetos de este archivo y los precios
 * caen al snapshot de assets/precios-interbot.json.
 *
 * Uso: node stub-eval.mjs --port 4699 --log ruta.jsonl
 */
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";

// ── Catálogo de mentira, con forma de Contífico ──────────────────────────────

/** Las medidas que aparecen en fixtures/historial.json, más la del caso Creta. */
const MEDIDAS = [
  "265/65R17", "225/65R17", "235/75R15", "195/65R15",
  "185/65R15", "205/55R16", "235/45R19", "215/60R17",
];

/**
 * Tres marcas por medida. Las dos primeras comparten precio A PROPÓSITO: el
 * candado anti-duplicado del bot bloquea recotizar el MISMO código, así que la
 * única forma de reproducir el caso KLEVER (dos números de cotización por la
 * misma compra) es cotizar dos productos distintos que suman lo mismo.
 */
const MARCAS = [
  { marca: "MICHELIN", diseno: "PRIMACY 4", precio: 62 },
  { marca: "BRIDGESTONE", diseno: "TURANZA T005", precio: 62 },
  { marca: "KENDA", diseno: "KR23 VEZDA", precio: 41 },
];

export const PRODUCTOS = MEDIDAS.flatMap((medida, i) =>
  MARCAS.map((m, j) => {
    const codigo = `EVAL${String(i + 1).padStart(2, "0")}${String(j + 1).padStart(2, "0")}`;
    return {
      id: `id-${codigo}`,
      codigo,
      nombre: `LLANTA ${medida} ${m.marca} ${m.diseno}`,
      descripcion: `LLANTA ${medida} ${m.marca} ${m.diseno}`,
      marca_nombre: m.marca,
      estado: "A",
      tipo: "PRO",
      pvp1: m.precio,
      pvp2: m.precio,
      pvp3: m.precio,
      pvp4: m.precio,
      porcentaje_iva: 15,
      cantidad_stock: 20,
    };
  }),
);

// ── Guion del agente ─────────────────────────────────────────────────────────

const CIERRES = [
  "Le comparto las opciones que sí tenemos en esa medida 🛞 ¿Cuál le llama más la atención?",
  "Ahí le va todo con precio final. ¿Le cuadra pasar esta semana por Cumbayá o por Quito Sur?",
  "Listo, quedó armada la cotización. ¿La dejamos separada a su nombre?",
];

const MEDIDA_RE = /(\d{3})\s*\/\s*(\d{2})\s*R\s*(\d{2})/i;
const PIDE_PRECIO = /precio|cu[áa]nto|cuanto|cotiz|juego|sale|vale|cost/i;

function ultimoTextoDelCliente(mensajes) {
  for (let i = mensajes.length - 1; i >= 0; i -= 1) {
    if (mensajes[i]?.role === "user") return String(mensajes[i].content ?? "");
  }
  return "";
}

function llamadasPrevias(mensajes) {
  const nombres = [];
  for (const m of mensajes) {
    for (const tc of m?.tool_calls ?? []) {
      if (tc?.function?.name) nombres.push(tc.function.name);
    }
  }
  return nombres;
}

function codigosVistos(mensajes) {
  const texto = mensajes.filter((m) => m?.role === "tool").map((m) => String(m.content ?? "")).join("\n");
  return [...new Set(texto.match(/EVAL\d{4}/g) ?? [])];
}

/** Código por marca, leído de lo que devolvió `buscar_llanta` (code → marca). */
function codigoPorMarca(mensajes) {
  const texto = mensajes.filter((m) => m?.role === "tool").map((m) => String(m.content ?? "")).join("\n");
  const mapa = new Map();
  for (const [, codigo, marca] of texto.matchAll(/"code":"(EVAL\d{4})","marca":"([^"]+)"/g)) {
    if (!mapa.has(marca.toUpperCase())) mapa.set(marca.toUpperCase(), codigo);
  }
  return mapa;
}

let secuencia = 0;
const idLlamada = () => `call_eval_${(secuencia += 1).toString().padStart(6, "0")}`;

const llamar = (nombre, argumentos) => ({
  content: null,
  tool_calls: [{
    id: idLlamada(),
    type: "function",
    function: { name: nombre, arguments: JSON.stringify(argumentos) },
  }],
});

/**
 * El guion. Determinista: la misma conversación produce siempre lo mismo, que
 * es lo que permite comparar dos corridas del harness entre sí.
 */
export function siguientePaso(body) {
  const mensajes = body.messages ?? [];
  const disponibles = new Set((body.tools ?? []).map((t) => t?.function?.name).filter(Boolean));
  const yaLlamadas = llamadasPrevias(mensajes);
  const cuantas = (n) => yaLlamadas.filter((x) => x === n).length;
  const texto = ultimoTextoDelCliente(mensajes);
  const medida = texto.match(MEDIDA_RE) ?? mensajes.map((m) => String(m.content ?? "")).join("\n").match(MEDIDA_RE);
  const codigos = codigosVistos(mensajes);

  if (medida && disponibles.has("buscar_llanta") && cuantas("buscar_llanta") === 0) {
    return llamar("buscar_llanta", {
      flotacion: null,
      width: Number(medida[1]),
      aspect: Number(medida[2]),
      rim: Number(medida[3]),
    });
  }

  // Cliente que ya sabe qué marca quiere y pregunta el precio: se cotiza
  // directo, sin volver a mandarle el catálogo. Es lo que hace el bot real y es
  // el único camino por el que una conversación llega a DOS cotizaciones —
  // preparar_opciones y generar_cotizacion cierran el turno, así que dos
  // cotizaciones seguidas nunca caben en el mismo turno.
  const marcas = codigoPorMarca(mensajes);
  const marcaPedida = [...marcas.keys()].find((m) => new RegExp(m, "i").test(texto));
  if (marcaPedida && PIDE_PRECIO.test(texto) && disponibles.has("generar_cotizacion")
      && cuantas("generar_cotizacion") === 0) {
    return llamar("generar_cotizacion", {
      items: [{ code: marcas.get(marcaPedida), cantidad: 4 }],
      nombre_cliente: "Cliente",
      incluir_pdf: false,
    });
  }

  if (codigos.length && disponibles.has("preparar_opciones") && cuantas("preparar_opciones") === 0) {
    return llamar("preparar_opciones", {
      codes: codigos.slice(0, 3),
      nombre_cliente: "Cliente",
      recomendado: codigos[0],
      motivo: "rinde más kilómetros en ciudad y carretera por el mismo precio",
    });
  }

  // Solo se cotiza si el cliente preguntó por plata: cotizar sin que lo pidan
  // sería inventar un comportamiento que el bot real no tiene.
  const quiereCotizar = PIDE_PRECIO.test(texto) || PIDE_PRECIO.test(
    mensajes.filter((m) => m.role === "user").map((m) => String(m.content ?? "")).join(" "),
  );
  if (quiereCotizar && codigos.length >= 2 && disponibles.has("generar_cotizacion")) {
    const hechas = cuantas("generar_cotizacion");
    // Dos cotizaciones seguidas por productos de igual precio: el caso KLEVER.
    // El bot NUEVO tiene un candado que lo evita por código, no por importe —
    // que este camino exista es exactamente lo que el detector debe ver.
    if (hechas < 2) {
      return llamar("generar_cotizacion", {
        items: [{ code: codigos[hechas] ?? codigos[0], cantidad: 4 }],
        nombre_cliente: "Cliente",
        incluir_pdf: false,
      });
    }
  }

  const turnosUsuario = mensajes.filter((m) => m.role === "user").length;
  return { content: CIERRES[Math.min(turnosUsuario - 1, CIERRES.length - 1)] ?? CIERRES[0] };
}

// ── Respuestas con formato JSON ──────────────────────────────────────────────

const ETAPAS = ["nuevo", "medida_confirmada", "seleccionando", "cotizacion_enviada", "seguimiento_venta"];

function respuestaJson(body) {
  const prompt = (body.messages ?? []).map((m) => String(m.content ?? "")).join("\n");
  if (/SECCIÓN COMERCIAL|Etapa actual:/.test(prompt)) {
    const actual = prompt.match(/Etapa actual:\s*(\w+)/)?.[1] ?? "nuevo";
    const i = ETAPAS.indexOf(actual);
    return { content: JSON.stringify({ stage: i === -1 ? "nuevo" : ETAPAS[Math.min(i + 1, ETAPAS.length - 1)] }) };
  }
  if (/seguimientos de WhatsApp/.test(prompt)) {
    return { content: JSON.stringify({ text: "Quedé pendiente de lo que hablamos 😊 ¿Seguimos?" }) };
  }
  return { content: JSON.stringify({}) };
}

// ── Servidor ─────────────────────────────────────────────────────────────────

export function levantar({ port = 4699, log = null, latencia = 5 } = {}) {
  if (log) writeFileSync(log, "");
  const anotar = (fila) => { if (log) appendFileSync(log, `${JSON.stringify(fila)}\n`); };

  const server = createServer((req, res) => {
    let crudo = "";
    req.on("data", (c) => { crudo += c; });
    req.on("end", async () => {
      const url = req.url ?? "";
      const responder = (codigo, objeto) => {
        res.writeHead(codigo, { "Content-Type": "application/json" });
        res.end(JSON.stringify(objeto));
      };

      // Contífico: catálogo completo en la primera página.
      if (url.includes("/producto")) {
        const pagina = Number(new URL(url, "http://x").searchParams.get("page") ?? 1);
        anotar({ at: new Date().toISOString(), tipo: "contifico", pagina });
        return responder(200, pagina > 1 ? [] : PRODUCTOS);
      }

      if (!url.includes("/chat/completions")) {
        // /v1/responses (investigación de fitment con web_search) y demás: vacío,
        // para que el bot tome su camino de fallback sin salir a internet.
        anotar({ at: new Date().toISOString(), tipo: "otra", url });
        return responder(200, { output_text: "", output: [] });
      }

      const body = (() => { try { return JSON.parse(crudo); } catch { return {}; } })();
      await new Promise((r) => setTimeout(r, latencia));
      const mensaje = body.response_format?.type === "json_object"
        ? respuestaJson(body)
        : siguientePaso(body);
      anotar({
        at: new Date().toISOString(),
        tipo: body.response_format?.type === "json_object" ? "json" : "agente",
        model: body.model,
        tool: mensaje.tool_calls?.[0]?.function?.name ?? null,
      });
      return responder(200, {
        id: `chatcmpl-eval-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model ?? "stub-eval",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: mensaje.content ?? null,
            ...(mensaje.tool_calls ? { tool_calls: mensaje.tool_calls } : {}),
          },
          finish_reason: mensaje.tool_calls ? "tool_calls" : "stop",
        }],
        usage: { prompt_tokens: 800, completion_tokens: 120, total_tokens: 920 },
      });
    });
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

const esPrincipal = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (esPrincipal) {
  const arg = (n, d) => {
    const i = process.argv.indexOf(`--${n}`);
    return i >= 0 ? process.argv[i + 1] : d;
  };
  levantar({ port: Number(arg("port", 4699)), log: arg("log", null) })
    .then(() => console.log(`[stub-eval] escuchando en :${arg("port", 4699)}`));
}
