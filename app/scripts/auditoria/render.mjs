#!/usr/bin/env node
/**
 * Convierte la extracción (+ el análisis del skill) en un HTML de una sola
 * página, y ADEMÁS registra la corrida en el historial.
 *
 * El historial es el punto: sin él, cada auditoría es una foto suelta y no hay
 * forma de saber si un cambio sirvió. Con él, cada corrida se compara contra la
 * anterior y contra los cambios que se aplicaron en medio.
 *
 * Uso:
 *   node scripts/auditoria/render.mjs \
 *     --datos /tmp/auditoria.json \
 *     --analisis /tmp/analisis.json \
 *     --salida ~/auditorias/2026-08-05.html
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aquí = dirname(fileURLToPath(import.meta.url));
const HISTORIAL = resolve(aquí, "registro/historial.jsonl");
const ARCHIVO = resolve(aquí, "registro/reportes");

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const datos = JSON.parse(readFileSync(opt("datos"), "utf8"));
const analisis = opt("analisis") && existsSync(opt("analisis"))
  ? JSON.parse(readFileSync(opt("analisis"), "utf8"))
  : { resumen: "", hipotesis: [], cambiosPropuestos: [], promptPropuesto: "" };

/** Sello de la corrida: `2026-08-07-0252`. Es la llave de todo el archivo. */
const SELLO = new Date(datos.generadoEn).toISOString().slice(0, 16).replace("T", "-").replace(":", "");
const CARPETA = resolve(ARCHIVO, SELLO);
// --salida es una COPIA de cortesía (para abrir o mandar); el original siempre
// se archiva en el repo. Sin eso, un reporte en /tmp se pierde y la próxima
// corrida no tiene contra qué comparar.
const SALIDA = opt("salida", null);

const historial = existsSync(HISTORIAL)
  ? readFileSync(HISTORIAL, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  : [];
// Re-renderizar la MISMA extracción (por ejemplo tras corregir el análisis) no
// debe crear una corrida nueva: se compara contra la anterior de verdad y luego
// se reemplaza la propia entrada.
const yaRegistrada = historial.find((r) => r.fecha === datos.generadoEn);
const anteriores = historial.filter((r) => r.fecha !== datos.generadoEn);
const previa = anteriores.at(-1) ?? null;

const m = datos.metricas;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ── Deltas contra la corrida anterior ────────────────────────────────────────
// `mejorSiSube` dice hacia dónde es bueno moverse: sin eso, un -40% en fallas y
// un -40% en ventas se pintarían igual.
function delta(valorActual, valorPrevio, mejorSiSube) {
  if (valorPrevio == null || valorActual == null) return { texto: "primera medición", clase: "neutro" };
  const d = Number((valorActual - valorPrevio).toFixed(1));
  if (d === 0) return { texto: "sin cambio", clase: "neutro" };
  const bueno = mejorSiSube ? d > 0 : d < 0;
  return { texto: `${d > 0 ? "+" : ""}${d}`, clase: bueno ? "bien" : "mal" };
}

const FALLAS_ETIQUETA = {
  error_procesamiento: "El bot se colgó y pidió repetir el mensaje",
  pide_foto_que_no_puede_leer: "Pidió una foto que no puede leer",
  pregunta_teniendo_medida: "Preguntó teniendo ya la medida",
  pregunta_repetida: "Repitió la misma pregunta",
  mensaje_duplicado: "Mandó el mismo mensaje calcado dos veces",
  disculpas_seguidas: "Disculpa tras disculpa: bot atascado, cliente abandonado",
  saludo_repetido: "Volvió a saludar a mitad de conversación",
  cotizacion_duplicada: "Mandó la cotización dos veces",
  con_medida_sin_cotizar: "Tenía la medida y nunca cotizó",
  sin_ficha_verificada: "Se escudó en «no tengo ficha verificada»",
  pieza_fallida: "No pudo dibujar la pieza",
  abandono_tras_pregunta: "El cliente se fue tras una pregunta del bot",
  sin_respuesta_del_bot: "El cliente escribió y el bot jamás respondió",
  pide_confirmar_cantidad: "Pidió confirmar una cantidad ya dicha",
  opciones_reenviadas: "Reenvió la pieza de opciones en el mismo ciclo",
};

const fallasOrdenadas = Object.entries(m.fallas)
  .map(([id, v]) => ({ id, ...v, etiqueta: FALLAS_ETIQUETA[id] ?? id,
    previa: previa?.metricas?.fallas?.[id]?.pctChats ?? null }))
  .sort((a, b) => b.pctChats - a.pctChats);

const ejemplos = (detector, n = 3) =>
  datos.hallazgos.filter((h) => h.detector === detector).slice(0, n);

const tarjeta = (titulo, valor, sufijo, d, nota) => `
  <div class="tarjeta">
    <p class="etiqueta">${esc(titulo)}</p>
    <p class="valor">${esc(valor)}<span class="sufijo">${esc(sufijo ?? "")}</span></p>
    <p class="delta ${d.clase}">${esc(d.texto)}${nota ? ` · ${esc(nota)}` : ""}</p>
  </div>`;

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Auditoría de ventas · AutoVenta</title>
<style>
  :root{--bg:#0b0e14;--card:#141926;--ink:#e9edf5;--muted:#93a0b8;--line:#232c3f;
        --bien:#3ddc84;--mal:#ff5c62;--neutro:#93a0b8;--acento:#ffb020}
  @media (prefers-color-scheme:light){:root{--bg:#f6f7fb;--card:#fff;--ink:#131722;--muted:#5d6880;--line:#e3e7f0}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;padding:32px 20px 64px}
  .wrap{max-width:1100px;margin:0 auto}
  h1{font-size:26px;margin:0 0 4px} h2{font-size:17px;margin:38px 0 12px;letter-spacing:.02em}
  .sub{color:var(--muted);font-size:13px;margin:0 0 28px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
  .tarjeta{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
  .etiqueta{font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin:0 0 6px}
  .valor{font-size:30px;font-weight:800;margin:0;font-variant-numeric:tabular-nums}
  .sufijo{font-size:14px;font-weight:600;color:var(--muted);margin-left:3px}
  .delta{font-size:11.5px;margin:5px 0 0;font-weight:700}
  .bien{color:var(--bien)} .mal{color:var(--mal)} .neutro{color:var(--neutro)}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
  .scroll{overflow-x:auto}
  th,td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--line);font-size:13.5px}
  th{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700}
  tr:last-child td{border-bottom:none}
  .barra{height:6px;border-radius:3px;background:var(--line);overflow:hidden;min-width:80px}
  .barra i{display:block;height:100%;background:var(--mal)}
  .ejemplo{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--acento);
           border-radius:0 10px 10px 0;padding:9px 13px;margin:7px 0;font-size:12.5px;color:var(--muted)}
  .ejemplo b{color:var(--ink);font-weight:700}
  pre{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;
      overflow-x:auto;font-size:12.5px;line-height:1.5;white-space:pre-wrap}
  .aviso{background:color-mix(in srgb,var(--acento) 12%,transparent);border:1px solid color-mix(in srgb,var(--acento) 35%,transparent);
         border-radius:12px;padding:13px 16px;font-size:13.5px;margin:14px 0}
  ul{padding-left:20px} li{margin:5px 0}
  .chat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:12px 0}
  .chat h3{margin:0 0 9px;font-size:14.5px}
  .chat h3 span{color:var(--muted);font-weight:600;font-size:12px}
  .chat dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 14px;margin:0;font-size:13px}
  .chat dt{color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;font-weight:700;padding-top:3px}
  .chat dd{margin:0}
  .rompio{color:var(--mal);font-weight:600}
  .urg{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
       padding:2px 7px;border-radius:99px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
  .urg.hoy{color:var(--mal);border-color:var(--mal)}
</style></head><body><div class="wrap">

<h1>¿Está vendiendo el bot?</h1>
<p class="sub">Últimos ${m.conversaciones ? datos.periodoDias : 0} días · ${m.conversaciones} conversaciones ·
generado ${new Date(datos.generadoEn).toLocaleString("es-EC")} ·
${previa ? `comparado contra la corrida del ${new Date(previa.fecha).toLocaleDateString("es-EC")}` : "primera corrida (sin comparación)"}</p>

<h2>El embudo</h2>
<div class="grid">
  ${tarjeta("Conversaciones", m.conversaciones, "", delta(m.conversaciones, previa?.metricas?.conversaciones, true))}
  ${tarjeta("Con medida", m.conMedida, "", delta(m.conMedida, previa?.metricas?.conMedida, true))}
  ${tarjeta("Llegaron a cotización", m.conCotizacion, "", delta(m.conCotizacion, previa?.metricas?.conCotizacion, true))}
  ${tarjeta("Ventas cerradas", m.ganados, "", delta(m.ganados, previa?.metricas?.ganados, true))}
  ${tarjeta("Medida → cotización", m.tasaMedidaACotizacion, "%", delta(m.tasaMedidaACotizacion, previa?.metricas?.tasaMedidaACotizacion, true))}
  ${tarjeta("Cotización → venta", m.tasaCotizacionAVenta, "%", delta(m.tasaCotizacionAVenta, previa?.metricas?.tasaCotizacionAVenta, true))}
</div>

<h2>Cuánto le cuesta al cliente llegar a un precio</h2>
<div class="grid">
  ${tarjeta("Preguntas antes de cotizar", m.preguntasAntesDeCotizarMediana ?? "—", " mediana",
      delta(m.preguntasAntesDeCotizarMediana, previa?.metricas?.preguntasAntesDeCotizarMediana, false),
      "menos es mejor")}
  ${tarjeta("Turnos antes de cotizar", m.turnosAntesDeCotizarMediana ?? "—", " mediana",
      delta(m.turnosAntesDeCotizarMediana, previa?.metricas?.turnosAntesDeCotizarMediana, false),
      "menos es mejor")}
  ${tarjeta("Errores del modelo", m.modelo.pctErrores, "%",
      delta(m.modelo.pctErrores, previa?.metricas?.modelo?.pctErrores, false),
      `${m.modelo.errores}/${m.modelo.corridas} corridas`)}
  ${tarjeta("Latencia", m.modelo.latenciaMedianaMs ?? "—", " ms",
      delta(m.modelo.latenciaMedianaMs, previa?.metricas?.modelo?.latenciaMedianaMs, false))}
</div>
<p class="sub" style="margin-top:10px">Modelo(s) en uso: <b>${esc(m.modelo.modelos.join(", ") || "—")}</b> ·
${m.modelo.tokensEntrada.toLocaleString("es-EC")} tokens de entrada,
${m.modelo.tokensSalida.toLocaleString("es-EC")} de salida.</p>

${Object.keys(m.intentosBloqueadosPorGuardian ?? {}).length ? `<h2>Lo que el guardián frenó (el cliente no lo vio)</h2>
<div class="aviso">El modelo <b>intentó</b> estas fallas y el guardián de salida las bloqueó antes de enviar.
Si el prompt mejora de verdad, estos números bajan; si solo el guardián tapa, se quedan altos.</div>
<div class="grid">${Object.entries(m.intentosBloqueadosPorGuardian).map(([k, v]) =>
  `<div class="tarjeta"><p class="etiqueta">${esc(k.replaceAll("_", " "))}</p><p class="valor">${v}</p>
   <p class="delta ${previa?.metricas?.intentosBloqueadosPorGuardian?.[k] != null && v < previa.metricas.intentosBloqueadosPorGuardian[k] ? "bien" : "neutro"}">${
     previa?.metricas?.intentosBloqueadosPorGuardian?.[k] != null
       ? `antes: ${previa.metricas.intentosBloqueadosPorGuardian[k]}`
       : "primera medición"}</p></div>`).join("")}
</div>` : ""}

${analisis.comparativa ? `<h2>${esc(analisis.comparativa.titulo ?? "¿Mejoró?")}</h2>
${analisis.comparativa.nota ? `<div class="aviso">${esc(analisis.comparativa.nota)}</div>` : ""}
<div class="scroll"><table>
<tr><th>Falla · por cada 100 mensajes del bot</th>${
  analisis.comparativa.periodos.map((p) => `<th>${esc(p.nombre)}<br><span style="font-weight:400;text-transform:none;letter-spacing:0">${
    esc(p.rango)} · ${p.chats} chats · ${p.msgsBot} msgs</span></th>`).join("")}<th>Veredicto</th></tr>
${analisis.comparativa.filas.map((f) => `<tr><td>${esc(f.falla)}</td>${
  analisis.comparativa.periodos.map((p, i, arr) => {
    const v = f[p.id];
    const prev = i > 0 ? f[arr[i - 1].id] : null;
    // null = el bot no habló ese día: no hay nada que comparar, ni para bien ni
    // para mal. Pintarlo de verde porque "bajó a cero" sería mentir.
    const mejora = f.mejorSiSube ? v > prev : v < prev;
    const clase = prev == null || v == null || v === prev ? "" : mejora ? "bien" : "mal";
    return `<td class="${clase}" style="font-variant-numeric:tabular-nums;font-weight:${clase ? 700 : 400}">${
      v == null ? "—" : esc(v)}</td>`;
  }).join("")}<td class="${/sin arreglar/i.test(f.veredicto ?? "") ? "mal" : /extinguida/i.test(f.veredicto ?? "") ? "bien" : "neutro"}" style="font-weight:700;font-size:12px">${esc(f.veredicto ?? "")}</td></tr>`).join("")}
</table></div>` : ""}

<h2>Dónde falla, por impacto</h2>
<div class="scroll"><table>
<tr><th>Falla</th><th>Chats afectados</th><th>%</th><th>Incidencias</th><th>vs. corrida anterior</th></tr>
${fallasOrdenadas.map((f) => {
  const d = delta(f.pctChats, f.previa, false);
  return `<tr>
    <td>${esc(f.etiqueta)}</td>
    <td>${f.chatsAfectados}</td>
    <td><div class="barra"><i style="width:${Math.min(100, f.pctChats)}%"></i></div>${f.pctChats}%</td>
    <td>${f.incidencias}</td>
    <td class="delta ${d.clase}">${esc(d.texto)}</td>
  </tr>`;
}).join("")}
</table></div>

<h2>Chats donde se ve</h2>
${fallasOrdenadas.filter((f) => f.incidencias > 0).slice(0, 5).map((f) => `
  <p style="font-size:13px;font-weight:700;margin:18px 0 4px">${esc(f.etiqueta)}</p>
  ${ejemplos(f.id).map((e) => `<div class="ejemplo">
    <b>${esc(e.cliente)}</b> · ticket ${e.conversationId} · ${new Date(e.cuando).toLocaleString("es-EC")}<br>${esc(e.extracto)}
  </div>`).join("")}
`).join("")}

${analisis.resumen ? `<h2>Lectura</h2><div class="aviso">${esc(analisis.resumen)}</div>` : ""}

${analisis.hipotesis?.length ? `<h2>Por qué pasa</h2><ul>${
  analisis.hipotesis.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}

${analisis.chats?.length ? `<h2>Lo que vivió el cliente, chat por chat</h2>
<p class="sub" style="margin:-4px 0 10px">Los conteos localizan; la transcripción explica. Cada uno se leyó completo.</p>
${analisis.chats.map((c) => `<div class="chat">
  <h3>${esc(c.cliente)} <span>· ticket ${esc(c.ticket)} · ${esc(c.cuando)}</span></h3>
  <dl>
    <dt>Pidió</dt><dd>${esc(c.pidio)}</dd>
    <dt>Pasó</dt><dd>${esc(c.paso)}</dd>
    <dt>Se rompió</dt><dd class="rompio">${esc(c.rompio)}</dd>
    <dt>Debió</dt><dd>${esc(c.debio)}</dd>
    <dt>Terminó</dt><dd>${esc(c.final)}</dd>
  </dl></div>`).join("")}` : ""}

${analisis.cambiosPropuestos?.length ? `<h2>Cambios propuestos</h2><div class="scroll"><table>
<tr><th>Cambio</th><th>Ataca</th><th>Métrica que debería moverse</th></tr>
${analisis.cambiosPropuestos.map((c) => `<tr><td>${esc(c.cambio)}</td><td>${esc(FALLAS_ETIQUETA[c.ataca] ?? c.ataca)}</td><td>${esc(c.metrica)}</td></tr>`).join("")}
</table></div>` : ""}

${analisis.arreglos?.length ? `<h2>Arreglos fuera del ciclo de prompt</h2>
<p class="sub" style="margin:-4px 0 10px">No compiten con los tres cambios de arriba: son fallas de infraestructura o de capacidad
que ningún prompt puede tapar.</p>
<div class="scroll"><table>
<tr><th>Qué</th><th>Cuándo</th><th>Por qué</th><th>Dónde</th></tr>
${analisis.arreglos.map((a) => `<tr>
  <td><b>${esc(a.titulo)}</b></td>
  <td><span class="urg ${/hoy/i.test(a.urgencia ?? "") ? "hoy" : ""}">${esc(a.urgencia)}</span></td>
  <td>${esc(a.detalle)}</td>
  <td><code style="font-size:12px;color:var(--muted)">${esc(a.donde)}</code></td>
</tr>`).join("")}
</table></div>` : ""}

${analisis.promptPropuesto ? `<h2>Prompt propuesto</h2>
<p class="sub">Pegar en el panel → Ajustes → IA, o en <code>app/src/agent/prompts.ts</code>.</p>
<pre>${esc(analisis.promptPropuesto)}</pre>` : ""}

<h2>Historial de corridas</h2>
<div class="scroll"><table>
<tr><th>Fecha</th><th>Modelo</th><th>Cotizaciones</th><th>Ventas</th><th>Medida→cot.</th><th>Preguntas antes</th><th>Cambios aplicados desde la anterior</th></tr>
${[...historial, { fecha: datos.generadoEn, metricas: m, cambiosAplicados: analisis.cambiosPropuestos?.map((c) => c.cambio) ?? [] }]
  .map((r) => `<tr>
    <td>${new Date(r.fecha).toLocaleDateString("es-EC")}</td>
    <td>${esc((r.metricas.modelo?.modelos ?? []).join(", "))}</td>
    <td>${r.metricas.conCotizacion}</td>
    <td>${r.metricas.ganados}</td>
    <td>${r.metricas.tasaMedidaACotizacion}%</td>
    <td>${r.metricas.preguntasAntesDeCotizarMediana ?? "—"}</td>
    <td>${esc((r.cambiosAplicados ?? []).join(" · ") || "—")}</td>
  </tr>`).join("")}
</table></div>
<p class="sub" style="margin-top:10px">Cada fila es una auditoría. Si un cambio no mueve su métrica en la corrida
siguiente, no funcionó — revertirlo es tan válido como insistir.</p>

</div></body></html>`;

// ── Archivo permanente ───────────────────────────────────────────────────────
// El reporte, los datos crudos y el análisis se guardan JUNTOS en el repo bajo
// el sello de la corrida. Guardar solo el HTML no alcanza: sin los datos crudos
// no se puede recalcular una métrica nueva sobre una corrida vieja, y sin el
// análisis se pierde POR QUÉ se propuso cada cambio.
mkdirSync(CARPETA, { recursive: true });
writeFileSync(resolve(CARPETA, "reporte.html"), html);
writeFileSync(resolve(CARPETA, "datos.json"), JSON.stringify(datos, null, 2));
writeFileSync(resolve(CARPETA, "analisis.json"), JSON.stringify(analisis, null, 2));

if (SALIDA) {
  mkdirSync(dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, html);
}

// Entrada del historial: TODO lo que una corrida futura necesita para comparar
// sin volver a abrir los datos crudos.
const entrada = {
  fecha: datos.generadoEn,
  sello: SELLO,
  periodoDias: datos.periodoDias,
  desde: datos.desde ?? null,
  // De dónde salieron los números. Comparar una corrida del extractor contra un
  // censo hecho a mano es comparar dos varas distintas: queda anotado.
  fuente: datos.fuente ?? "extraer.mjs",
  // Versión del bot que produjo estas conversaciones: sin esto, "mejoró" no se
  // puede atribuir a ningún cambio concreto.
  commitBot: datos.commitBot ?? null,
  metricas: m,
  hallazgosPorDetector: (datos.hallazgos ?? []).reduce((acc, h) => {
    acc[h.detector] = (acc[h.detector] ?? 0) + 1;
    return acc;
  }, {}),
  resumen: analisis.resumen ?? "",
  // Los cambios completos (qué ataca, qué métrica debería moverse), no solo el
  // título: la corrida siguiente los usa para dar veredicto.
  cambiosAplicados: analisis.cambiosPropuestos ?? [],
  reporte: `registro/reportes/${SELLO}/reporte.html`,
};

const lineas = [...anteriores, entrada]
  .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  .map((r) => JSON.stringify(r));
mkdirSync(dirname(HISTORIAL), { recursive: true });
writeFileSync(HISTORIAL, `${lineas.join("\n")}\n`);

console.log(`✅ Reporte archivado: ${CARPETA}/reporte.html`);
if (SALIDA) console.log(`   copia: ${SALIDA}`);
console.log(`📎 Historial: ${lineas.length} corrida(s)${yaRegistrada ? " (esta se re-renderizó, no se duplicó)" : ""}`);
if (previa) console.log(`   comparada contra ${previa.sello ?? previa.fecha}`);
