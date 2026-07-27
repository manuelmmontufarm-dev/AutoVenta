/**
 * Stub compatible con la API de OpenAI.
 *
 * El SDK lo toma sin tocar código: lee OPENAI_BASE_URL del entorno cuando no se
 * le pasa `baseURL` explícito (openai/client.js:140).
 *
 * Devuelve respuestas deterministas por fixture, con el set mínimo que la
 * práctica recomienda: normal, con tool-call, negativa, malformada y vacía.
 * Sirve para separar dos preguntas que si no se mezclan: "¿aguanta la carga?"
 * y "¿el modelo contesta bien?". Aquí solo se responde la primera.
 *
 * Uso: node stub-openai.mjs [--port 4611] [--latency 150] [--log ruta.jsonl]
 */
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, value, index, list) => {
    if (value.startsWith("--")) acc.push([value.slice(2), list[index + 1]]);
    return acc;
  }, []),
);

const port = Number(args.port ?? 4611);
const logPath = args.log ?? "openai-calls.jsonl";
// Latencia artificial: un stub que responde en 1 ms esconde exactamente los
// timeouts que un modelo lento provocaría en producción.
const latencyMs = Number(args.latency ?? 150);
const jitterMs = Number(args.jitter ?? 100);

writeFileSync(logPath, "");
const stats = { chat: 0, classifier: 0, followUpCopy: 0, agent: 0, toolCalls: 0, other: 0 };

const RESPUESTAS = [
  "¡Claro que sí! 😊 Para darte opciones reales necesito la medida que aparece en el costado de tu llanta, algo como 205/55R16. ¿Me la compartes?",
  "Perfecto, con esa medida tengo varias opciones. ¿Priorizas duración, comodidad o precio? Así te recomiendo la que mejor te calce 🛞",
  "Buenísimo. Te preparo la cotización con esa opción. ¿La quieres para las cuatro llantas o solo el par delantero?",
  "Listo, ya te dejo la cotización armada. ¿Te queda cómodo pasar esta semana por el local, o prefieres que te reserve las llantas?",
];

const ETAPAS = ["nuevo", "medida_confirmada", "seleccionando", "cotizacion_enviada", "seguimiento_venta"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clasificarPeticion(body) {
  const texto = JSON.stringify(body.messages ?? []);
  if (body.response_format?.type === "json_object") {
    if (texto.includes("SECCIÓN COMERCIAL")) return "classifier";
    if (texto.includes("seguimientos de WhatsApp")) return "followUpCopy";
    if (texto.includes("gerente de ventas")) return "juez";
    return "json_desconocido";
  }
  return "agent";
}

/** Cuenta los turnos de usuario para avanzar el guion de forma determinista. */
function turnoDe(body) {
  return (body.messages ?? []).filter((m) => m.role === "user").length;
}

function respuestaChat(kind, body) {
  if (kind === "classifier") {
    // El prompt del clasificador trae "Etapa actual: X". Se avanza un paso desde
    // ahí, para que las conversaciones recorran el embudo de verdad: si el stub
    // devolviera siempre la misma etapa, el kanban quedaría todo en "nuevo" y
    // no se probaría setStage bajo escritura concurrente, que es donde
    // aparecerían las carreras.
    const prompt = (body.messages ?? []).map((m) => m.content ?? "").join("\n");
    const actual = prompt.match(/Etapa actual:\s*(\w+)/)?.[1] ?? "nuevo";
    const indice = ETAPAS.indexOf(actual);
    const siguiente = ETAPAS[Math.min(indice + 1, ETAPAS.length - 1)] ?? "nuevo";
    return { content: JSON.stringify({ stage: indice === -1 ? "nuevo" : siguiente }) };
  }
  if (kind === "juez") {
    // Notas fijas: solo sirven para comprobar que el cableado del evaluador
    // funciona. Un juez de verdad requiere el modelo real.
    return { content: JSON.stringify({ utilidad: 4, naturalidad: 4, precision: 4, accion: 4, comentario: "stub" }) };
  }
  if (kind === "followUpCopy") {
    return { content: JSON.stringify({ text: "Quedé pendiente de lo que hablamos 😊 ¿Te ayudo a dejar listo el siguiente paso?" }) };
  }
  // Agente: por defecto texto directo. La tool se ejercita solo cuando el
  // historial ya tiene resultados, para no entrar en bucle con el catálogo vacío.
  const yaUsoTool = (body.messages ?? []).some((m) => m.role === "tool");
  const turno = turnoDe(body);
  if (!yaUsoTool && turno === 2 && (body.tools ?? []).some((t) => t.function?.name === "buscar_llantas")) {
    stats.toolCalls += 1;
    return {
      content: null,
      tool_calls: [{
        id: `call_stub_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        type: "function",
        function: { name: "buscar_llantas", arguments: JSON.stringify({ medida: "205/55R16" }) },
      }],
    };
  }
  return { content: RESPUESTAS[Math.min(turno - 1, RESPUESTAS.length - 1)] ?? RESPUESTAS[0] };
}

const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; });
  req.on("end", async () => {
    const body = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
    const url = req.url ?? "";

    if (!url.includes("/chat/completions")) {
      // /v1/responses (investigación de fitment con web_search) y cualquier otra:
      // se responde vacío para que el código tome su camino de fallback.
      stats.other += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ output_text: "", output: [] }));
      return;
    }

    const kind = clasificarPeticion(body);
    stats.chat += 1;
    stats[kind] = (stats[kind] ?? 0) + 1;

    await sleep(latencyMs + Math.random() * jitterMs);

    const message = respuestaChat(kind, body);
    appendFileSync(logPath, `${JSON.stringify({
      at: new Date().toISOString(), kind, model: body.model,
      userTurns: turnoDe(body), toolCall: Boolean(message.tool_calls),
    })}\n`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: `chatcmpl-stub-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body.model ?? "gpt-4o-mini",
      choices: [{
        index: 0,
        message: { role: "assistant", content: message.content ?? null, ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}) },
        finish_reason: message.tool_calls ? "tool_calls" : "stop",
      }],
      usage: { prompt_tokens: 800, completion_tokens: 120, total_tokens: 920 },
    }));
  });
});

server.listen(port, () => {
  console.log(`[stub-openai] escuchando en :${port} · latencia=${latencyMs}±${jitterMs} ms`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => {
    console.log(`[stub-openai] ${JSON.stringify(stats)}`);
    server.close(() => process.exit(0));
  });
}
