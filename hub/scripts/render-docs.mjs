// Renderiza los .md del proyecto a HTML estático para el Hub del sitio.
// Uso: node scripts/render-docs.mjs (desde hub/, con `marked` instalado ahí)
import { marked } from "marked";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(REPO, "app/site/docs");
mkdirSync(OUT_DIR, { recursive: true });

marked.setOptions({ gfm: true, breaks: false });

const DOCS = [
  {
    src: "DESIGN.md",
    out: "design.html",
    title: "Sistema de diseño Showroom GP",
    kicker: "Diseño oficial · DT—01",
  },
  {
    src: "PLAN_PARTE1_FRONTEND.md",
    out: "plan-parte1.html",
    title: "Plan — Parte 1: Frontend",
    kicker: "Plan de implementación",
  },
  {
    src: "PLAN_DESARROLLO.md",
    out: "plan-desarrollo.html",
    title: "Plan de Desarrollo Técnico",
    kicker: "Arquitectura completa",
  },
  {
    src: "PLAN_FINANCIERO.md",
    out: "plan-financiero.html",
    title: "Plan Financiero",
    kicker: "Costos y precio",
  },
  {
    src: "docs/INVESTIGACION_GITHUB.md",
    out: "investigacion-github.html",
    title: "Investigación de repos reusables",
    kicker: "Qué existe y qué copiar",
  },
  {
    src: "PROYECTO.md",
    out: "proyecto.html",
    title: "Bitácora del proyecto",
    kicker: "Contexto, cliente y decisiones",
  },
  {
    src: "WHATSAPP_BUSINESS.md",
    out: "whatsapp-business.html",
    title: "WhatsApp Business",
    kicker: "Configuración de Meta",
  },
  {
    src: "BITACORA.md",
    out: "bitacora.html",
    title: "Bitácora de desarrollo",
    kicker: "Avances y decisiones",
  },
];

const template = (title, kicker, bodyHtml) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Depot Tire Hub</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#0a1020; --panel:rgba(17,26,49,.62); --line:rgba(255,255,255,.09);
    --paper:#f5f1e9; --muted:#a3acc2; --red:#e3262e; --lime:#d9ff4f; --blue:#5b8def;
  }
  *{box-sizing:border-box}
  body{
    margin:0;font-family:Inter,system-ui,sans-serif;color:var(--paper);min-height:100vh;
    background:
      radial-gradient(110% 80% at 15% -10%, rgba(23,61,118,.5) 0%, transparent 60%),
      radial-gradient(120% 90% at 50% 0%, #0d1530 0%, #0a1020 55%, #070b16 100%);
    background-attachment:fixed;
  }
  .bar{position:sticky;top:0;z-index:10;background:rgba(10,16,32,.86);backdrop-filter:blur(14px);border-bottom:1px solid var(--line);padding:14px 24px;display:flex;align-items:center;gap:14px}
  .bar a{color:var(--muted);font-size:12.5px;text-decoration:none;font-weight:600}
  .bar a:hover{color:var(--paper)}
  .bar .kicker{color:var(--red);font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:auto}
  .wrap{max-width:760px;margin:0 auto;padding:40px 24px 100px}
  .doc h1{font-size:clamp(28px,4.4vw,40px);font-weight:800;letter-spacing:-.02em;line-height:1.15;margin:0 0 8px}
  .doc h2{font-size:22px;font-weight:700;letter-spacing:-.01em;margin:44px 0 14px;padding-bottom:10px;border-bottom:1px solid var(--line)}
  .doc h3{font-size:17px;font-weight:700;margin:30px 0 10px;color:var(--lime)}
  .doc p{line-height:1.75;color:#dfe3ee;font-size:15px;margin:0 0 14px}
  .doc ul,.doc ol{line-height:1.75;color:#dfe3ee;font-size:15px;padding-left:22px;margin:0 0 14px}
  .doc li{margin-bottom:6px}
  .doc a{color:var(--blue)}
  .doc strong{color:var(--paper)}
  .doc code{font-family:'JetBrains Mono',monospace;font-size:.85em;background:rgba(255,255,255,.08);padding:1px 6px;border-radius:5px;color:var(--lime)}
  .doc pre{background:rgba(0,0,0,.3);border:1px solid var(--line);border-radius:12px;padding:14px 16px;overflow-x:auto}
  .doc pre code{background:none;padding:0;color:#dfe3ee}
  .doc blockquote{margin:0 0 14px;padding:4px 16px;border-left:3px solid var(--red);color:var(--muted);font-size:14px}
  .doc hr{border:none;border-top:1px solid var(--line);margin:32px 0}
  .doc table{width:100%;border-collapse:collapse;margin:0 0 20px;font-size:13.5px;display:block;overflow-x:auto}
  .doc th{text-align:left;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:8px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
  .doc td{padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.05);color:#dfe3ee;vertical-align:top}
  .doc tr:hover td{background:rgba(255,255,255,.02)}
</style>
<link rel="stylesheet" href="/showroom-gp-global.css">
</head>
<body>
  <div class="bar">
    <a href="/">← Depot Tire Hub</a>
    <span class="kicker">${kicker}</span>
  </div>
  <div class="wrap"><div class="doc">
${bodyHtml}
  </div></div>
<script src="/showroom-gp-global.js"></script>
</body>
</html>
`;

for (const doc of DOCS) {
  const srcPath = path.join(REPO, doc.src);
  let md;
  try {
    md = readFileSync(srcPath, "utf8");
  } catch {
    console.warn(`omitido (no existe): ${doc.src}`);
    continue;
  }
  const body = marked.parse(md);
  writeFileSync(path.join(OUT_DIR, doc.out), template(doc.title, doc.kicker, body));
  console.log(`✓ ${doc.out}`);
}
