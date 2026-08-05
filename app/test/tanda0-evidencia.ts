/**
 * Evidencia de la Tanda 0: antes/después de los tres flujos que cambian, con
 * las piezas renderizadas de verdad por el mismo motor que corre en producción.
 *
 * No necesita base de datos ni deploy: usa el catálogo sintético del
 * diagnóstico y los beneficios sembrados por la migración 008.
 *
 *   npx tsx test/tanda0-evidencia.ts
 *
 * Escribe un HTML con la conversación de WhatsApp lado a lado.
 */
process.env.WHATSAPP_TOKEN ??= "x";
process.env.WHATSAPP_APP_SECRET ??= "x";
process.env.WHATSAPP_VERIFY_TOKEN ??= "x";
process.env.WHATSAPP_PHONE_ID ??= "x";
process.env.SELLER_PHONE ??= "x";
process.env.OPENAI_API_KEY ??= "x";
process.env.DATABASE_URL ??= "postgres://x/x";

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { renderOptionsImage, renderCompareImage, renderQuoteImage, toRenderLine } =
  await import("../src/render/quoteImage.js");
const { normalizeContificoProduct } = await import("../src/domain/catalog.js");
const { formatBenefitsBlock } = await import("../src/services/benefits.js");
const qm = await import("../src/services/quoteMessages.js");

const salida = process.argv[2] ?? "/tmp/tanda0-evidencia.html";

const wire = (codigo: string, nombre: string, marca: string, pvp1: number, stock: number) =>
  normalizeContificoProduct(
    { id: codigo, codigo, nombre, marca_nombre: marca, estado: "A", tipo: "P",
      pvp1, porcentaje_iva: 15, cantidad_stock: stock },
    "pvp1",
  )!;

const CATALOGO = [
  wire("KR203-2055516", "205/55R16 91V KOMET PLUS KR203", "KENDA", 55.5, 14),
  wire("ZE310R-2055516", "205/55R16 91V ZIEX ZE310R ECORUN", "FALKEN", 72.6, 8),
  wire("R380-2055516", "205/55R16 91V R380 WINRUN", "WINRUN", 43.0, 9),
  wire("KR23-2055516", "205/55R16 91V VEZDA TOURING KR23", "KENDA", 57.4, 9),
  wire("AZENIS-2055516", "205/55R16 91W AZENIS FK510", "FALKEN", 84.2, 3),
];
const [kenda, falken, winrun] = CATALOGO;

// Los mismos beneficios que siembra la migración 008.
const BENEFICIOS = [
  "Todos los servicios de instalación y beneficios",
  "Seguro gratuito contra golpes, cortes o cualquier daño que sufra la llanta",
  "Mantenimiento gratuito cada 10.000km para alargar la vida útil de las llantas",
  "Revisión gratuita de su vehículo para que ruede seguro",
].map((text, i) => ({
  id: i, text, position: i, active: true,
  brand: null, minQuantity: null, store: null, startsAt: null, expiresAt: null,
}));
const incluye = formatBenefitsBlock(BENEFICIOS);

const dateLabel = "04 / 08 / 2026";
const lineas = await Promise.all(CATALOGO.map((p) => toRenderLine(p)));
/**
 * Las piezas se renderizan a 2880 px para que se vean nítidas en WhatsApp; en
 * una página son 6,8 MB de base64 que atragantan al navegador. Se reducen solo
 * para la evidencia — la pieza que recibe el cliente no cambia. Si `sips` no
 * está (no-macOS), se embebe la original.
 */
const tmp = mkdtempSync(join(tmpdir(), "evidencia-"));
let contador = 0;
function dataUri(png: Buffer): string {
  const ruta = join(tmp, `p${contador++}.png`);
  writeFileSync(ruta, png);
  try {
    execFileSync("sips", ["-Z", "760", ruta], { stdio: "ignore" });
    return `data:image/png;base64,${readFileSync(ruta).toString("base64")}`;
  } catch {
    return `data:image/png;base64,${png.toString("base64")}`;
  }
}

interface Escenario {
  titulo: string;
  pregunta: string;
  imagen: string;
  antes: string[];
  ahora: string[];
}

// ── 1. Opciones — la captura que mandó Joaquín ──────────────────────────────
const pngOpciones = await renderOptionsImage({
  dateLabel, sizeLabel: "205/55R16", products: lineas.slice(0, 3),
});
const escenarios: Escenario[] = [
  {
    titulo: "Opciones por medida",
    pregunta: "Buenas, necesito llantas 205/55R16",
    imagen: dataUri(pngOpciones),
    antes: [qm.buildCustomerOptionsMessageDetallado(CATALOGO.slice(0, 3), "Cliente")],
    ahora: qm.splitBlocks(
      qm.composeBlocks(
        qm.buildOptionsCaption(
          CATALOGO.slice(0, 3), kenda,
          "es el mejor equilibrio entre duración y precio",
        ),
        incluye,
        "¿Cuál le llama más la atención?",
      ),
    ),
  },
];

// ── 2. Cotización ───────────────────────────────────────────────────────────
const cantidad = 4;
const totalConIva = kenda.minimumPriceWithTax * cantidad;
const pngCotizacion = await renderQuoteImage({
  number: "COT-000412", dateLabel, lines: [await toRenderLine(kenda, cantidad)],
  subtotal: totalConIva / 1.15, iva: totalConIva - totalConIva / 1.15, total: totalConIva,
});
escenarios.push({
  titulo: "Cotización de 4 llantas",
  pregunta: "Deme 4 de la Kenda",
  imagen: dataUri(pngCotizacion),
  antes: [
    qm.buildSingleQuoteMessageDetallado(
      { product: kenda, quantity: cantidad }, "Cliente", "COT-000412", "AV-000412",
    ),
  ],
  ahora: qm.splitBlocks(
    qm.composeBlocks(
      qm.buildSingleQuoteCaption({ product: kenda, quantity: cantidad }, "COT-000412"),
      incluye,
      "¿Le queda mejor Cumbayá o Quito Sur? Puede pasar sin compromiso a verlas y probarlas en su vehículo.",
    ),
  ),
});

// ── 3. Comparativa ──────────────────────────────────────────────────────────
const pngComparativa = await renderCompareImage({
  dateLabel, products: [lineas[0], lineas[1]],
});
escenarios.push({
  titulo: "Comparativa entre dos modelos",
  pregunta: "Entre la Kenda y la Falken, ¿cuál me conviene?",
  imagen: dataUri(pngComparativa),
  antes: [qm.buildComparisonMessageDetallado([kenda, falken])],
  ahora: qm.splitBlocks(
    qm.composeBlocks(
      qm.buildComparisonCaption([kenda, falken]),
      "¿Para qué la usa más: ciudad y carretera, o también caminos mixtos e irregulares?",
    ),
  ),
});

// ── HTML ────────────────────────────────────────────────────────────────────
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Negrita de WhatsApp (*texto*) → <b>. */
const wa = (s: string) => esc(s).replace(/\*([^*\n]+)\*/g, "<b>$1</b>");

const contar = (bloques: string[]) =>
  bloques.reduce((n, b) => n + b.split("\n").filter((l) => l.trim()).length, 0);

const burbujas = (bloques: string[], imagen?: string) =>
  [
    imagen ? `<div class="b bot img"><img src="${imagen}" alt="pieza renderizada"></div>` : "",
    ...bloques.map((b) => `<div class="b bot">${wa(b)}</div>`),
  ].join("");

const columnas = escenarios
  .map(
    (e) => `
<section class="esc">
  <h2>${esc(e.titulo)}</h2>
  <div class="par">
    <div class="col">
      <div class="cab antes">Antes <span>${e.antes.length} mensaje · ${contar(e.antes)} líneas</span></div>
      <div class="chat">
        <div class="b cli">${wa(e.pregunta)}</div>
        ${burbujas(e.antes, e.imagen)}
      </div>
    </div>
    <div class="col">
      <div class="cab ahora">Ahora <span>${e.ahora.length} mensajes · ${contar(e.ahora)} líneas</span></div>
      <div class="chat">
        <div class="b cli">${wa(e.pregunta)}</div>
        ${burbujas(e.ahora, e.imagen)}
      </div>
    </div>
  </div>
</section>`,
  )
  .join("");

const html = `<title>Tanda 0 · antes y después</title>
<style>
  :root {
    --bg: #f2efe7; --card: #fff; --ink: #17233b; --faint: #6f7789;
    --line: rgba(23,35,59,.12); --cli: #e8e3d7; --bot: #dcf8c6; --red: #ef233c; --ok: #06a77d;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #10141c; --card: #171d28; --ink: #e9edf4; --faint: #97a0b1;
            --line: rgba(233,237,244,.14); --cli: #232a37; --bot: #1f3d2b; }
  }
  :root[data-theme="dark"] {
    --bg: #10141c; --card: #171d28; --ink: #e9edf4; --faint: #97a0b1;
    --line: rgba(233,237,244,.14); --cli: #232a37; --bot: #1f3d2b;
  }
  :root[data-theme="light"] {
    --bg: #f2efe7; --card: #fff; --ink: #17233b; --faint: #6f7789;
    --line: rgba(23,35,59,.12); --cli: #e8e3d7; --bot: #dcf8c6;
  }
  body { margin: 0; padding: 28px 20px 60px; background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .wrap { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -.02em; }
  .sub { color: var(--faint); font-size: 13.5px; margin: 0 0 30px; max-width: 70ch; }
  .esc { margin-bottom: 38px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .12em;
    color: var(--faint); font-weight: 600; margin: 0 0 12px; }
  .par { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 720px) { .par { grid-template-columns: 1fr; } }
  .col { background: var(--card); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
  .cab { padding: 11px 15px; font-size: 12px; font-weight: 700; border-bottom: 1px solid var(--line);
    display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .cab span { font-weight: 400; font-size: 11px; color: var(--faint); }
  .cab.antes { color: var(--red); }
  .cab.ahora { color: var(--ok); }
  .chat { padding: 14px; display: flex; flex-direction: column; gap: 7px; }
  .b { max-width: 88%; padding: 8px 11px; border-radius: 13px; font-size: 13.5px;
    white-space: pre-wrap; word-break: break-word; }
  .b.cli { align-self: flex-end; background: var(--cli); border-bottom-right-radius: 4px; }
  .b.bot { align-self: flex-start; background: var(--bot); border-bottom-left-radius: 4px; }
  .b.img { padding: 4px; max-width: 74%; }
  .b.img img { display: block; width: 100%; max-width: 100%; border-radius: 10px; }
  .nota { margin-top: 34px; padding: 15px 17px; border: 1px solid var(--line);
    border-radius: 14px; background: var(--card); font-size: 13px; color: var(--faint); }
  .nota b { color: var(--ink); }
</style>
<div class="wrap">
  <h1>Tanda 0 — antes y después</h1>
  <p class="sub">Los tres flujos que cambian, con las piezas renderizadas por el mismo motor
  que corre en producción. La imagen es idéntica en las dos columnas: lo que cambia es el
  texto que la acompaña.</p>
  ${columnas}
  <div class="nota">
    <b>Cómo leerlo.</b> La columna «Antes» es lo que el bot manda hoy: la imagen y, debajo,
    todo repetido en texto — precio de lista, precio de hoy, disponibilidad, índice de carga
    y las dos garantías, por cada producto. La columna «Ahora» deja que la imagen hable y usa
    el texto solo para lo que la imagen no puede decir: cuál elegiría el bot y por qué, los
    beneficios que aplican a ese caso, y una pregunta que mueve la venta.
    <br><br>
    Si la imagen no llega a salir, el bot vuelve solo a la columna «Antes» — el cliente nunca
    se queda sin la información — y queda una alerta en el panel.
  </div>
</div>`;

writeFileSync(salida, html);
console.log(`✅ ${salida}`);
for (const e of escenarios) {
  console.log(
    `   ${e.titulo.padEnd(32)} ${e.antes.length} msg/${contar(e.antes)} líneas  →  ` +
      `${e.ahora.length} msg/${contar(e.ahora)} líneas`,
  );
}
