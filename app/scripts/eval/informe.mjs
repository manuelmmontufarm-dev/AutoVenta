#!/usr/bin/env node
/**
 * Arma el informe HTML de la evaluación.
 *
 * AUTOCONTENIDO por contrato: ni un `src=`, ni una fuente externa, ni un CDN.
 * Los gráficos se calculan aquí y salen como SVG en línea. El archivo se abre
 * con doble clic, sin internet, hoy y dentro de un año.
 *
 * Uso:
 *   node scripts/eval/informe.mjs --dry
 *   node scripts/eval/informe.mjs
 *   node scripts/eval/informe.mjs --salida ~/Desktop/informe.html
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { EVAL, flags, leerJson, ruta, titulo } from "./lib/comun.mjs";
import { ETIQUETAS, TAXONOMIA } from "./lib/detectores.mjs";
import { barraApilada, barrasComparadas, barrasSimples, esc, histogramaNotas } from "./lib/svg.mjs";

const f = flags();
const ENTRADA = f.valor("entrada", ruta(f.dry ? "calificaciones.dry.json" : "calificaciones.json"));
const SALIDA = f.valor("salida", ruta(f.dry ? "informe.dry.html" : "informe.html"));
const CENSO = resolve(EVAL, "../auditoria/registro/reportes/2026-08-05-censo/datos.json");

const fecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
const numero = (n) => (n === null || n === undefined ? "—" : new Intl.NumberFormat("es-EC").format(n));

// ── Contenido fijo: lo que cambió en el bot ──────────────────────────────────
// Cada fila apunta al archivo donde vive el cambio. Sin esa columna, la tabla
// sería una lista de promesas; con ella, cualquiera la puede verificar.
const CAMBIOS = [
  {
    tema: "Precios reales del Interbot",
    antes: "El precio de venta se reconstruía desde el costo de Contífico con divisores fijos (÷0.75, ÷0.5625 = margen 33 %).",
    ahora: "Se LEE el precio del Interbot, producto por producto. Snapshot offline de 373 productos como respaldo.",
    porque: "Al cruzar las 362 llantas presentes en ambos sistemas aparecieron 32 grupos de factores (×1.0 a ×1.7): ninguna fórmula los reproduce. La regla del 33 % solo cubría el 27 % del catálogo.",
    donde: "src/services/interbotPrices.ts · assets/precios-interbot.json",
  },
  {
    tema: "Audios del cliente",
    antes: "La nota de voz se ignoraba; el cliente recibía «tuve un problema procesando tu mensaje».",
    ahora: "Se transcribe con Whisper y entra como texto por el mismo camino que un mensaje escrito.",
    porque: "La medida dicha en un audio es la misma medida: tirarla obligaba al cliente a repetirse, y muchos no repiten.",
    donde: "src/services/transcripcion.ts",
  },
  {
    tema: "Fotos del cliente",
    antes: "El bot no leía imágenes. Pedir una foto dejaba la conversación en un callejón sin salida — 30 incidencias en el censo del 5-ago.",
    ahora: "La foto se describe con el modelo de visión (con el caption del cliente si lo hay) y el texto entra al pipeline; extractTireSizes le saca la medida.",
    porque: "En 14 días llegaron 33 fotos y casi todas eran la etiqueta de la puerta o el costado: la medida servida en bandeja.",
    donde: "src/services/vision.ts",
  },
  {
    tema: "El guardián ya no censura pedir fotos",
    antes: "El guardián de salida bloqueaba cualquier respuesta que pidiera una foto.",
    ahora: "Esa regla se retiró: pedir una foto volvió a ser una jugada válida porque el bot ya puede leerla.",
    porque: "El guardián existía para tapar una incapacidad. Resuelta la incapacidad, el candado solo estorbaba.",
    donde: "src/services/outboundGuard.ts",
  },
  {
    tema: "Enlaces y ubicación",
    antes: "La dirección se describía en texto y el cliente tenía que buscarla.",
    ahora: "Se manda el enlace de mapas del local junto con la dirección.",
    porque: "Un enlace que se toca convierte «voy a pasar» en una visita; una dirección escrita hay que copiarla.",
    donde: "src/agent/tools.ts (herramienta de locales)",
  },
  {
    tema: "Fitment del vehículo, con candado",
    antes: "Con solo el vehículo, el bot inventaba o se quedaba callado.",
    ahora: "La investigación de medidas corre con el modelo de investigación y búsqueda web; el resultado queda con candado — se ofrece como referencia y se pide confirmar en el costado antes de hablar de precios.",
    porque: "Una medida equivocada cotiza la llanta equivocada. El candado hace que un dato de internet nunca pase por dato verificado del taller.",
    donde: "src/services/vehicleFitmentResearch.ts · src/domain/fitmentResearch.ts",
  },
  {
    tema: "Escalación de modelos por iteración",
    antes: "Las 8 rondas del loop y el rescate usaban el MISMO modelo barato que ya se había atascado.",
    ahora: "Las rondas 0–3 van con el modelo principal; desde la 4 entra el modelo superior con todo el contexto ya acumulado.",
    porque: "Llegar a la ronda 4 no es «va lento», es que el principal está dando vueltas. Insistir con él era la causa #1 del «tuve un problema procesando».",
    donde: "src/agent/agent.ts (modeloDelTurno)",
  },
];

// ── Diagrama de arquitectura ─────────────────────────────────────────────────

function diagrama(cap = {}) {
  const m = (k, porDefecto = "—") => esc(cap[k] ?? porDefecto);
  const caja = (x, y, w, h, titulo, sub, clase = "") => `
    <g class="caja ${clase}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>
      <text class="t" x="${x + 12}" y="${y + 22}">${esc(titulo)}</text>
      ${sub ? `<text class="s" x="${x + 12}" y="${y + 40}">${sub}</text>` : ""}
    </g>`;
  const flecha = (x1, y1, x2, y2) => `<path class="flecha" d="M ${x1} ${y1} L ${x2} ${y2}"/>`;
  return `<figure class="grafico diagrama">
  <svg viewBox="0 0 800 430" role="img" aria-label="Arquitectura: qué modelo usa cada pieza">
    <defs>
      <marker id="punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z"/>
      </marker>
    </defs>
    ${caja(10, 14, 160, 52, "WhatsApp", "mensaje del cliente", "borde")}
    ${caja(10, 96, 160, 56, "Foto", `visión · ${m("modeloVision")}`, "analisis")}
    ${caja(10, 166, 160, 56, "Audio", `whisper · ${m("modeloTranscripcion")}`, "analisis")}
    ${caja(205, 14, 190, 52, "Pipeline", "agrupa y guarda", "borde")}
    ${caja(205, 96, 190, 74, "Loop del agente", `rondas 0-3 · ${m("modelo")}<tspan class="s2" x="217" dy="16">ronda 4+ · ${m("modeloEscalacion")}</tspan>`, "nucleo")}
    ${caja(205, 200, 190, 56, "Clasificador", `etapa · ${m("modeloClasificador")}`, "analisis")}
    ${caja(440, 96, 180, 56, "Catálogo", "Contífico + Interbot", "datos")}
    ${caja(440, 166, 180, 56, "Fitment", `web · ${m("modeloInvestigacion")}`, "analisis")}
    ${caja(440, 236, 180, 56, "Cotización", "pieza PNG + PDF", "datos")}
    ${caja(205, 286, 190, 52, "Guardián de salida", "determinístico", "borde")}
    ${caja(205, 356, 190, 52, "Envío al cliente", "en el replay: stub", "borde")}
    ${flecha(170, 40, 203, 40)}
    ${flecha(170, 124, 203, 124)}
    ${flecha(170, 194, 208, 160)}
    ${flecha(300, 66, 300, 94)}
    ${flecha(395, 124, 438, 124)}
    ${flecha(395, 133, 438, 190)}
    ${flecha(395, 142, 438, 260)}
    ${flecha(300, 170, 300, 198)}
    ${flecha(300, 256, 300, 284)}
    ${flecha(300, 338, 300, 354)}
    <text class="pie" x="440" y="330">Cada caja de análisis es UNA llamada,</text>
    <text class="pie" x="440" y="346">no un turno de conversación: ahí un</text>
    <text class="pie" x="440" y="362">modelo superior cuesta centavos</text>
    <text class="pie" x="440" y="378">y evita cotizar la llanta equivocada.</text>
  </svg>
</figure>`;
}

// ── Casos destacados ─────────────────────────────────────────────────────────

/**
 * Busca el turno que ilustra un caso. Recibe las pruebas EN ORDEN DE PRECISIÓN:
 * primero la que exige el detalle exacto (el precio, el aro), y solo si nadie
 * la cumple se cae a la más laxa. Al revés, «rt01» engancharía el primer turno
 * donde se nombra la llanta y no aquel donde aparece el precio reclamado.
 */
function buscarCaso(items, pruebas) {
  for (const prueba of pruebas) {
    const encontrado = items.find((it) => {
      const texto = `${it.mensaje ?? ""} ${it.respuesta_vieja ?? ""} ${it.respuesta_nueva ?? ""}`.toLowerCase();
      return prueba(texto, it);
    });
    if (encontrado) return encontrado;
  }
  return null;
}

function tarjetaCaso({ titulo: t, contexto, item, referencia }) {
  const cuerpo = item
    ? `<div class="dialogo">
        <p class="quien">Cliente</p><blockquote>${esc(item.mensaje)}</blockquote>
        <div class="par">
          <div class="lado antes"><p class="quien">Bot viejo${item.modelo_viejo ? ` · ${esc(item.modelo_viejo)}` : ""}</p><blockquote>${esc(item.respuesta_vieja) || "<em>no respondió</em>"}</blockquote></div>
          <div class="lado ahora"><p class="quien">Bot nuevo${item.modelo ? ` · ${esc(item.modelo)}` : ""}</p><blockquote>${esc(item.respuesta_nueva) || "<em>no respondió</em>"}</blockquote></div>
        </div>
        ${item.juicio && !item.juicio.error ? `<p class="veredicto ${esc(item.juicio.veredicto)}">Juez: <strong>${esc(item.juicio.veredicto)}</strong> · ${item.juicio.nota_vieja} → ${item.juicio.nota_nueva} · ${esc(item.juicio.comentario)}</p>` : ""}
      </div>`
    : `<p class="aviso">Este caso <strong>no apareció</strong> en la corrida cargada. Queda documentado por su valor de referencia: ${esc(referencia)}</p>`;
  return `<article class="caso">
    <h3>${esc(t)}</h3>
    <p class="contexto">${contexto}</p>
    ${cuerpo}
  </article>`;
}

// ── HTML ─────────────────────────────────────────────────────────────────────

const ESTILOS = `
:root {
  --tinta: #16191d; --tinta2: #55606d; --tinta3: #8a949f;
  --fondo: #f6f7f9; --papel: #ffffff; --linea: #e2e6ea;
  --antes: #b0453b; --ahora: #2f6f4f; --acento: #1f4f82;
  --aviso-fondo: #fdf6e3; --aviso-borde: #e3c96a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --tinta: #e9edf1; --tinta2: #a7b2be; --tinta3: #78838f;
    --fondo: #14171a; --papel: #1c2024; --linea: #2b3138;
    --antes: #d9756a; --ahora: #63b98c; --acento: #7fb2e6;
    --aviso-fondo: #2b2617; --aviso-borde: #6b5c28;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--fondo); color: var(--tinta);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px; line-height: 1.55; -webkit-text-size-adjust: 100%;
}
.hoja { max-width: 980px; margin: 0 auto; padding: 32px 20px 80px; }
header.principal { border-bottom: 3px solid var(--tinta); padding-bottom: 18px; margin-bottom: 28px; }
header.principal h1 { font-size: clamp(24px, 4vw, 34px); margin: 0 0 6px; letter-spacing: -0.02em; }
header.principal .sub { color: var(--tinta2); margin: 0; font-size: 15px; }
section { margin: 44px 0; }
h2 {
  font-size: 20px; margin: 0 0 6px; letter-spacing: -0.01em;
  border-bottom: 1px solid var(--linea); padding-bottom: 8px;
}
h2 .num { color: var(--tinta3); font-variant-numeric: tabular-nums; margin-right: 10px; }
h3 { font-size: 16px; margin: 22px 0 8px; }
p { margin: 10px 0; }
.lede { color: var(--tinta2); font-size: 15px; margin-top: 0; }
.cifras { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 20px 0; }
.cifra { background: var(--papel); border: 1px solid var(--linea); border-radius: 10px; padding: 16px; }
.cifra .n { font-size: clamp(26px, 5vw, 38px); font-weight: 650; letter-spacing: -0.03em; line-height: 1.1; font-variant-numeric: tabular-nums; }
.cifra .n.buena { color: var(--ahora); }
.cifra .n.mala { color: var(--antes); }
.cifra .et { color: var(--tinta2); font-size: 13px; margin-top: 4px; }
.cifra .pie { color: var(--tinta3); font-size: 12px; margin-top: 6px; }
.tabla-envoltura { overflow-x: auto; -webkit-overflow-scrolling: touch; }
table { border-collapse: collapse; width: 100%; min-width: 640px; background: var(--papel); font-size: 14px; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--linea); vertical-align: top; }
th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--tinta2); background: var(--fondo); }
td.tema { font-weight: 600; white-space: nowrap; }
td .donde { display: block; color: var(--tinta3); font-size: 12px; margin-top: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
figure.grafico { margin: 18px 0; background: var(--papel); border: 1px solid var(--linea); border-radius: 10px; padding: 14px; overflow-x: auto; }
figure.grafico svg { width: 100%; height: auto; display: block; min-width: 520px; }
svg text { font-family: inherit; fill: var(--tinta); }
svg .ejeY { font-size: 12px; fill: var(--tinta); }
svg .ejeX, svg .valor { font-size: 11px; fill: var(--tinta2); }
svg .nota { font-size: 10px; fill: var(--tinta3); font-style: italic; }
svg .eje { stroke: var(--linea); stroke-width: 1; }
svg .barra.antes, svg .seg.peor { fill: var(--antes); }
svg .barra.ahora, svg .seg.mejor { fill: var(--acento); }
svg .barra.ahora.buena { fill: var(--ahora); }
svg .seg.igual { fill: var(--tinta3); }
svg .dentro { font-size: 12px; fill: #fff; font-weight: 600; }
svg .caja rect { fill: var(--papel); stroke: var(--linea); stroke-width: 1.5; }
svg .caja.nucleo rect { stroke: var(--acento); stroke-width: 2; }
svg .caja.analisis rect { stroke: var(--ahora); }
svg .caja.datos rect { stroke: var(--tinta3); }
svg .caja .t { font-size: 13px; font-weight: 600; }
svg .caja .s, svg .caja .s2 { font-size: 11px; fill: var(--tinta2); }
svg .flecha { stroke: var(--tinta3); stroke-width: 1.4; fill: none; marker-end: url(#punta); }
svg marker path { fill: var(--tinta3); }
svg .pie { font-size: 11px; fill: var(--tinta3); }
.caso { background: var(--papel); border: 1px solid var(--linea); border-left: 4px solid var(--acento); border-radius: 8px; padding: 16px 18px; margin: 18px 0; }
.caso .contexto { color: var(--tinta2); font-size: 14px; }
.par { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 700px) { .par { grid-template-columns: 1fr; } }
.quien { font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--tinta3); margin: 12px 0 2px; }
blockquote { margin: 0; padding: 10px 12px; background: var(--fondo); border-radius: 6px; font-size: 14px; white-space: pre-wrap; }
.lado.antes blockquote { border-left: 3px solid var(--antes); }
.lado.ahora blockquote { border-left: 3px solid var(--ahora); }
.veredicto { font-size: 13px; color: var(--tinta2); margin-top: 12px; }
.veredicto.mejor strong { color: var(--ahora); }
.veredicto.peor strong { color: var(--antes); }
.aviso, .banner {
  background: var(--aviso-fondo); border: 1px solid var(--aviso-borde);
  border-radius: 8px; padding: 12px 14px; font-size: 14px;
}
.banner { margin: 0 0 24px; }
ul.limitaciones { padding-left: 0; list-style: none; margin: 12px 0; }
ul.limitaciones li { border-left: 3px solid var(--linea); padding: 4px 0 4px 14px; margin-bottom: 14px; font-size: 14px; }
ul.limitaciones b { display: block; }
.vacio { color: var(--tinta3); font-style: italic; }
footer { margin-top: 60px; border-top: 1px solid var(--linea); padding-top: 14px; color: var(--tinta3); font-size: 12px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; background: var(--fondo); padding: 1px 4px; border-radius: 4px; }
`;

function construir(datos, censo) {
  const d = datos.deterministico ?? {};
  const nuevas = d.nuevas ?? {};
  const viejas = d.viejas ?? {};
  const juez = datos.juez ?? {};
  const cap = datos.capacidades ?? {};
  const items = datos.items ?? [];
  const veredictos = juez.veredictos ?? { mejor: 0, igual: 0, peor: 0 };
  const juzgados = juez.juzgados ?? 0;
  const pctMejor = juzgados ? Math.round((veredictos.mejor / juzgados) * 100) : null;

  const filasFallas = TAXONOMIA
    .filter((k) => (viejas.fallas?.[k]?.incidencias ?? 0) > 0 || (nuevas.fallas?.[k]?.incidencias ?? 0) > 0)
    .map((k) => ({
      etiqueta: ETIQUETAS[k],
      antes: viejas.fallas?.[k]?.incidencias ?? 0,
      ahora: nuevas.fallas?.[k]?.incidencias ?? 0,
      nota: k === "pide_foto_que_no_puede_leer" ? "reclasificado: ya no es falla" : null,
    }));

  const porModelo = datos.totalesReplay?.porModelo ?? {};
  const filasModelo = Object.entries(porModelo)
    .sort((a, b) => b[1] - a[1])
    .map(([modelo, valor]) => ({
      etiqueta: modelo,
      valor,
      sub: modelo === cap.modeloEscalacion && modelo !== cap.modelo ? "rescate" : "",
    }));

  const casoCreta = buscarCaso(items, [
    (t) => /creta/.test(t) && /(rin|aro)\s*19|r19|235\/45/.test(t),
    (t) => /creta/.test(t),
    (t) => /(rin|aro)\s*19/.test(t),
  ]);
  const casoPrecio = buscarCaso(items, [
    (t) => /502[.,]16|489[.,]14/.test(t),
    (t) => /rt01/.test(t) && /\$/.test(t),
    (t) => /rt01/.test(t),
  ]);

  const reclas = d.reclasificados?.pide_foto_que_no_puede_leer ?? { antes: 0, ahora: 0, motivo: "" };

  return `<div class="hoja">
<header class="principal">
  <h1>AutoVenta · el bot nuevo contra el historial completo</h1>
  <p class="sub">Cada mensaje que los clientes de Depot Tire escribieron, vuelto a servir al bot de hoy.
  Replay del ${fecha(datos.replayGeneradoEn ?? datos.generadoEn)} · informe generado el ${fecha(datos.generadoEn)}${datos.modo ? ` · modo <code>${esc(datos.modo)}</code>` : ""}.</p>
</header>

${datos.dry || datos.replayDry || datos.historialSintetico ? `<p class="banner"><strong>⚠️ Informe de prueba — ningún número dice nada sobre la calidad del bot.</strong>
${datos.historialSintetico ? `Las conversaciones son <strong>SINTÉTICAS</strong> (fuente <code>${esc(datos.fuenteHistorial ?? "fixtures")}</code>), no clientes de Depot. ` : ""}${datos.replayDry ? "El replay corrió contra dobles locales del modelo y del catálogo. " : ""}${datos.juezSimulado ? "El juez está <strong>simulado</strong>: sus veredictos son ruido reproducible, no una opinión. " : ""}Sirve para comprobar que el harness funciona de punta a punta.</p>` : ""}
${!datos.dry && !datos.replayDry && datos.historialSintetico ? `<p class="banner"><strong>🚨 Incoherencia:</strong> la calificación se corrió en modo real sobre un historial sintético. Revisa <code>datos/historial.json</code> antes de mostrar esta página a nadie.</p>` : ""}

<section>
  <h2><span class="num">01</span>Resumen ejecutivo</h2>
  <p class="lede">Lo que hay que mirar primero: cuántas conversaciones se volvieron a correr, cuánto bajaron las fallas que se pueden contar sin opinar, y qué dijo un vendedor experto (modelo juez) comparando respuesta contra respuesta.</p>
  <div class="cifras">
    <div class="cifra"><div class="n">${numero(d.conversaciones)}</div><div class="et">conversaciones replayadas</div><div class="pie">${numero(d.turnos)} turnos de cliente</div></div>
    <div class="cifra"><div class="n ${(nuevas.conversacionesAfectadas ?? 0) <= (viejas.conversacionesAfectadas ?? 0) ? "buena" : "mala"}">${numero(viejas.conversacionesAfectadas)} → ${numero(nuevas.conversacionesAfectadas)}</div><div class="et">conversaciones con alguna falla</div><div class="pie">${viejas.pctAfectadas ?? 0}% → ${nuevas.pctAfectadas ?? 0}% · sin contar «pidió una foto»</div></div>
    <div class="cifra"><div class="n ${pctMejor !== null && pctMejor >= 50 ? "buena" : ""}">${pctMejor === null ? "—" : `${pctMejor}%`}</div><div class="et">turnos que el juez vio mejores</div><div class="pie">${veredictos.mejor} mejor · ${veredictos.igual} igual · ${veredictos.peor} peor</div></div>
    <div class="cifra"><div class="n">${juez.notaViejaPromedio ?? "—"} → ${juez.notaNuevaPromedio ?? "—"}</div><div class="et">nota media del juez (1–10)</div><div class="pie">${numero(juzgados)} turnos juzgados${juez.sinRespuesta ? ` · ${juez.sinRespuesta} sin respuesta` : ""}</div></div>
  </div>
  <p>La línea base del censo del 5-ago —${numero(censo?.metricas?.conversaciones)} conversaciones, ${censo?.metricas?.pctAfectadas ?? "—"} % afectadas— se conserva como referencia histórica, pero
  <strong>no es la comparación fuerte de este informe</strong>: se midió a mano desde el panel y sobre otro universo de chats.
  La comparación que sí vale es la de arriba, donde el antes y el después salen del mismo extractor, sobre las mismas conversaciones y con la misma vara.</p>
</section>

<section>
  <h2><span class="num">02</span>Qué cambió en el bot</h2>
  <p class="lede">Siete cambios entre la corrida vieja y esta. La última columna dice dónde vive cada uno, para que nadie tenga que creer en la palabra.</p>
  <div class="tabla-envoltura">
    <table>
      <thead><tr><th>Cambio</th><th>Antes</th><th>Ahora</th><th>Por qué</th></tr></thead>
      <tbody>
        ${CAMBIOS.map((c) => `<tr>
          <td class="tema">${esc(c.tema)}</td>
          <td>${esc(c.antes)}</td>
          <td>${esc(c.ahora)}<span class="donde">${esc(c.donde)}</span></td>
          <td>${esc(c.porque)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>
</section>

<section>
  <h2><span class="num">03</span>Fallas contadas por los detectores</h2>
  <p class="lede">Los mismos detectores determinísticos de la auditoría (<code>scripts/auditoria/extraer.mjs</code>), corridos sobre las respuestas viejas y las nuevas de las mismas conversaciones. No opinan: cuentan.</p>
  ${barrasComparadas(filasFallas, { etiquetaAntes: "bot viejo", etiquetaAhora: "bot nuevo" })}
  ${(() => {
    // Un 0 → 0 se lee como "no encontró la falla". A veces significa "el
    // detector no llegó a ejecutarse", que es lo contrario de un dato. Los
    // detectores que viven de lo que escriben las tools solo pueden disparar si
    // hubo cotizaciones o piezas de opciones en las salidas; cuando no las hubo,
    // el informe lo dice en vez de dejar el cero suelto.
    const cob = d.cobertura;
    if (!cob || !cob.sinEjercitar?.length) return "";
    return `<p class="aviso"><strong>Detectores sin material que mirar en esta corrida:</strong>
    ${cob.sinEjercitar.map((k) => `«${esc(ETIQUETAS[k] ?? k)}»`).join(", ")}.
    En las salidas hubo ${numero(cob.cotizaciones)} mensajes con número de cotización y ${numero(cob.piezasOpciones)} piezas de opciones.
    Su <strong>0 no es un hallazgo</strong>: es la ausencia de ocasión para hallar nada.</p>`;
  })()}
  ${(datos.totalesReplay ?? {}).turnosConTools !== undefined ? `<p class="aviso">Herramientas usadas: ${numero(datos.totalesReplay.turnosConTools)} de ${numero(d.turnos)} turnos las llamaron
  ${Object.keys(datos.totalesReplay.toolsUsadas ?? {}).length ? `(${Object.entries(datos.totalesReplay.toolsUsadas).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ×${v}`).join(" · ")})` : ""}.
  Piezas que el bot habría mandado por WhatsApp: ${Object.entries(datos.totalesReplay.piezasPorTipo ?? {}).map(([k, v]) => `${esc(k)} ×${v}`).join(" · ") || "ninguna"}.</p>` : ""}
  <p class="aviso"><strong>Reclasificación obligatoria — «pidió una foto que no puede leer»:</strong> ${esc(reclas.motivo)}
  En esta corrida: ${numero(reclas.antes)} incidencias antes, ${numero(reclas.ahora)} ahora, y <strong>ninguna de las nuevas cuenta como falla del bot</strong>.
  Fue la falla más numerosa del censo del 5-ago (${censo?.metricas?.fallas?.pide_foto_que_no_puede_leer?.incidencias ?? "—"} incidencias): dejarla dentro del total inflaría la mejora tanto como esconderla.</p>
</section>

<section>
  <h2><span class="num">04</span>El veredicto del juez</h2>
  <p class="lede">Un modelo con el papel de vendedor ecuatoriano de mostrador compara las dos respuestas al mismo mensaje. Criterio: venta primero — ¿ofrece algo concreto?, ¿repite lo ya respondido?, ¿da el precio cuando se lo piden?, ¿avanza al cierre? Modelo <code>${esc(datos.juezModelo ?? "—")}</code>, temperatura 0, prompt <code>${esc(datos.juezPromptHash ?? "")}</code>.</p>
  ${barraApilada([
    { etiqueta: "mejor", valor: veredictos.mejor ?? 0, clase: "mejor" },
    { etiqueta: "igual", valor: veredictos.igual ?? 0, clase: "igual" },
    { etiqueta: "peor", valor: veredictos.peor ?? 0, clase: "peor" },
  ])}
  <h3>Distribución de las notas</h3>
  ${histogramaNotas(juez.histogramaVieja ?? [], juez.histogramaNueva ?? [])}
  ${Object.keys(juez.fallas ?? {}).length ? `<h3>Lo que el juez le sigue reprochando al bot nuevo</h3>
  ${barrasSimples(Object.entries(juez.fallas).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ etiqueta: k.replace(/_/g, " "), valor: v })))}` : ""}
</section>

<section>
  <h2><span class="num">05</span>Qué modelo contestó cada mensaje</h2>
  <p class="lede">El loop escala solo: las primeras rondas van con el modelo barato y, si el turno se enreda, entra el superior. Esta es la repartición real de la corrida.</p>
  ${barrasSimples(filasModelo)}
  ${diagrama(cap)}
</section>

<section>
  <h2><span class="num">06</span>Casos destacados</h2>
  ${tarjetaCaso({
    titulo: "Creta con rin 19",
    contexto: "El cliente escribió «Para rin 19 / Marca hyundai / Modelo creta 2027». La respuesta correcta es 235/45R19. El bot viejo se quedó sin candidatos: el prompt de investigación le exigía tanta certeza que devolvía la lista vacía y caía en «no encontré».",
    item: casoCreta,
    referencia: "medido contra la API real el 7-ago — gpt-5.5 encontró 235/45R19 y aun así devolvió sizes:[]; gpt-4o-mini alucinó 215/60R17, la medida de la generación anterior.",
  })}
  ${tarjetaCaso({
    titulo: "RT01 315/70R17 · $502.16 → $489.14",
    contexto: "Depot reclamó el precio de esta llanta. El bot lo reconstruía desde el costo con un divisor fijo y daba $502.16; el Interbot dice $489.14, porque ese producto está en el grupo de factor ×1.2987. Ninguna fórmula reproduce los 32 grupos del catálogo: hay que leer el precio.",
    item: casoPrecio,
    referencia: "cruce de las 362 llantas presentes en Contífico y en el Interbot, 7-ago.",
  })}
</section>

<section>
  <h2><span class="num">07</span>Cómo se corrió esto</h2>
  <p>Se extrajo el historial de la base de producción <strong>en solo lectura</strong> (la sesión abre con <code>default_transaction_read_only</code>).
  Cada mensaje del cliente se volvió a servir al bot de hoy sobre una base local desechable, sembrada con <code>src/db/seed-depot.ts</code>.</p>
  <p><strong>Nadie recibió un WhatsApp.</strong> El módulo <code>src/wa/client.ts</code> no llega a cargarse: un loader de Node lo sustituye por un stub antes de resolverlo, el harness verifica al arrancar que lo cargado sea el stub y se niega a seguir si no, y además los teléfonos se reescriben a un rango inventado.</p>
  <p>En modo <code>fiel</code> —el de este informe— el bot nuevo ve en cada turno exactamente el mismo hilo que vio el viejo, incluidas las respuestas viejas. Es la única forma de que las dos respuestas sean comparables: si se encadenaran las respuestas nuevas, la conversación se bifurcaría y a los tres turnos ya no habría nada que comparar.</p>
</section>

<section>
  <h2><span class="num">08</span>Limitaciones · lo que este informe NO prueba</h2>
  <ul class="limitaciones">
    <li><b>Es un contrafactual, no un experimento.</b> Ningún cliente reaccionó a las respuestas nuevas. Que el juez las prefiera no demuestra que habrían vendido más; para eso hace falta tráfico real en A/B.</li>
    <li><b>Las fotos y los audios viejos no se pueden volver a bajar.</b> El <code>media_id</code> de Meta caduca en días y el histórico tiene semanas: ${numero(datos.totalesReplay?.mediosNoRecuperables ?? 0)} turnos entraron con el texto de «no se pudo leer». <strong>La visión y la transcripción, que son dos de los cambios grandes, quedan casi sin medir aquí</strong>; se miden en producción, no en el replay.</li>
    <li><b>El juez es un modelo, no un cliente.</b> Opina sobre un turno con seis mensajes de contexto. Ve las dos respuestas siempre en el mismo orden (vieja primero), y esa posición puede empujarlo hacia la segunda. Sus notas van al lado de los detectores, nunca encima.</li>
    <li><b>La línea base del 5-ago no es del todo comparable.</b> Se contó a mano desde el panel, con otro código y sobre ${numero(censo?.metricas?.conversaciones)} conversaciones. Sirve como orden de magnitud, no al decimal.</li>
    <li><b>Los detectores son expresiones regulares.</b> Cuentan lo que el bot <em>dice</em>, no si vendió. Una respuesta puede pasar los siete detectores y aun así ser inútil — para eso está el juez.</li>
    <li><b>El catálogo y los precios se movieron.</b> Una cotización nueva puede diferir de la vieja porque el stock o el precio cambiaron entre aquel día y hoy, sin que el bot haya hecho nada distinto.${cap.catalogo === false ? " <strong>En esta corrida el catálogo NO estaba configurado</strong>: las herramientas de búsqueda y cotización fallaron y todo lo que dependa de un precio hay que leerlo con eso en mente." : ""}</li>
    <li><b>No mide lo operativo.</b> Latencia real, agrupación de mensajes seguidos, reintentos de Meta y caídas del canal quedan fuera: eso lo cubre la prueba de carga, no esta.</li>
  </ul>
</section>

<footer>
  Generado por <code>scripts/eval/informe.mjs</code> desde <code>${esc(ENTRADA.split("/").slice(-2).join("/"))}</code>.
  Documento autocontenido: sin recursos externos, se abre sin conexión.
  ${datos.dry ? "Corrida de prueba (--dry)." : ""}
</footer>
</div>`;
}

async function main() {
  titulo("INFORME HTML", f.dry ? "dry" : "real");
  if (!existsSync(ENTRADA)) {
    console.error(`No existe ${ENTRADA}. Corre antes:\n  node scripts/eval/calificar.mjs${f.dry ? " --dry" : ""}`);
    process.exit(1);
  }
  const datos = leerJson(ENTRADA);
  const censo = existsSync(CENSO) ? leerJson(CENSO) : null;
  if (!censo) console.log("⚠️  no se encontró el censo del 5-ago: el informe sale sin línea base.");

  const html = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AutoVenta · evaluación del bot contra el historial real</title>
<style>${ESTILOS}</style>
${construir(datos, censo)}
`;

  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(resolve(SALIDA, ".."), { recursive: true });
  writeFileSync(SALIDA, html);

  // Verificación en la propia herramienta: si algún día alguien mete un <img
  // src> o una fuente de Google, el generador lo canta aquí y no dos semanas
  // después, delante del cliente y sin internet.
  const externos = [
    ...html.matchAll(/\s(?:src|href)\s*=\s*["'](https?:)?\/\//gi),
    ...html.matchAll(/@import|url\(\s*["']?https?:/gi),
  ];
  console.log(`📄 ${(html.length / 1024).toFixed(0)} KB · ${externos.length === 0 ? "✅ sin recursos externos" : `❌ ${externos.length} referencias externas`}`);
  if (externos.length) process.exit(1);
  console.log(`📁 ${SALIDA}\n`);
}

main().catch((e) => { console.error("💥", e); process.exit(1); });
