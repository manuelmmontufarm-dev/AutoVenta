import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const app = express();
app.use(express.json());

const ENV_PATH = join(dirname(fileURLToPath(import.meta.url)), ".env");
const GRAPH = "https://graph.facebook.com/v21.0";

// Lee el .env FRESCO en cada llamada, así no hay que reiniciar el servidor
// cuando pegas un token nuevo. Solo guardas el archivo y ya funciona.
function readEnv() {
  const env = {};
  try {
    for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].trim();
    }
  } catch { /* archivo no encontrado — se maneja abajo */ }
  return env;
}

app.get("/", (_req, res) => res.type("html").send(PAGE));

app.get("/config", (_req, res) => {
  const env = readEnv();
  res.json({
    to: (env.RECIPIENT || "").replace(/\D/g, ""),
    ready: Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_TOKEN !== "PEGA_TU_TOKEN_AQUI" && env.PHONE_NUMBER_ID),
  });
});

app.post("/send", async (req, res) => {
  const env = readEnv();
  const TOKEN = env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = env.PHONE_NUMBER_ID;
  const DEFAULT_TO = (env.RECIPIENT || "").replace(/\D/g, "");

  const to = String(req.body.to || DEFAULT_TO).replace(/\D/g, "");
  const message = String(req.body.message || "").trim();

  if (!TOKEN || TOKEN === "PEGA_TU_TOKEN_AQUI" || !PHONE_NUMBER_ID) {
    return res.status(500).json({ ok: false, error: "Falta el token o el Phone Number ID en el archivo .env" });
  }
  if (!to || !message) {
    return res.status(400).json({ ok: false, error: "Escribe el número y el mensaje." });
  }

  try {
    const r = await fetch(`${GRAPH}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      }),
    });
    const data = await r.json();

    if (!r.ok) {
      const err = data?.error || {};
      let hint = err.message || "Error de Meta";
      // Error típico: ventana de 24h cerrada (no le has escrito al bot primero)
      if (err.code === 131047 || /re-?engagement|24 hour/i.test(err.message || "")) {
        hint = "La ventana de 24 h está cerrada. Desde tu celular, mándale primero cualquier mensaje al número de prueba (+1 555 169 8138) y vuelve a intentar.";
      }
      if (err.code === 190 || /expired|invalid.*token/i.test(err.message || "")) {
        hint = "El token expiró o es inválido. Genera uno nuevo en Meta ('Generate token') y pégalo en el .env.";
      }
      return res.status(r.status).json({ ok: false, error: hint, code: err.code });
    }

    res.json({ ok: true, id: data?.messages?.[0]?.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  ✅ WA tester corriendo → http://localhost:${PORT}\n`);
});

const PAGE = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WA Tester · AutoVenta</title>
<style>
  :root{ --bg:#0b141a; --card:#111b21; --line:#2a3942; --ink:#e9edef; --muted:#8696a0;
    --accent:#00a884; --accent-ink:#04120d; --err:#f15c6d; }
  *{ box-sizing:border-box; }
  body{ margin:0; min-height:100vh; display:grid; place-items:center;
    background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding:24px; }
  .card{ width:100%; max-width:440px; background:var(--card); border:1px solid var(--line);
    border-radius:14px; padding:26px 24px; }
  .brand{ display:flex; align-items:center; gap:10px; margin-bottom:4px; }
  .dot{ width:10px; height:10px; border-radius:50%; background:var(--accent); }
  h1{ font-size:1.15rem; margin:0; }
  p.sub{ color:var(--muted); font-size:.85rem; margin:6px 0 22px; line-height:1.5; }
  label{ display:block; font-size:.74rem; text-transform:uppercase; letter-spacing:.08em;
    color:var(--muted); margin:0 0 6px; }
  input,textarea{ width:100%; background:var(--bg); border:1px solid var(--line);
    color:var(--ink); border-radius:8px; padding:11px 13px; font:inherit; font-size:.95rem; }
  textarea{ resize:vertical; min-height:96px; }
  .field{ margin-bottom:16px; }
  button{ width:100%; background:var(--accent); color:var(--accent-ink); border:none;
    border-radius:8px; padding:13px; font-size:1rem; font-weight:700; cursor:pointer; }
  button:disabled{ opacity:.5; cursor:not-allowed; }
  button:not(:disabled):hover{ filter:brightness(1.08); }
  .status{ margin-top:16px; font-size:.9rem; min-height:1.2em; line-height:1.5; }
  .ok{ color:var(--accent); }
  .err{ color:var(--err); }
  .tip{ margin-top:20px; padding:12px 14px; background:rgba(0,168,132,.08);
    border:1px solid rgba(0,168,132,.25); border-radius:8px; font-size:.8rem;
    color:var(--muted); line-height:1.55; }
  .tip b{ color:var(--ink); }
</style>
</head>
<body>
  <div class="card">
    <div class="brand"><span class="dot"></span><h1>WA Tester · AutoVenta</h1></div>
    <p class="sub">Escribe un mensaje y llega a tu WhatsApp por la Cloud API (número de prueba de Meta).</p>

    <div class="field">
      <label for="to">Enviar a (número con código de país)</label>
      <input id="to" inputmode="numeric" placeholder="593991234567">
    </div>
    <div class="field">
      <label for="msg">Mensaje</label>
      <textarea id="msg" placeholder="Hola desde AutoVenta 🚀"></textarea>
    </div>
    <button id="send">Enviar a WhatsApp</button>
    <div class="status" id="status"></div>

    <div class="tip">
      <b>Antes de enviar:</b> desde tu celular mándale <b>cualquier mensaje</b> al número de prueba
      <b>+1 555 169 8138</b>. Eso abre la ventana de 24 h y deja que el bot te responda texto libre.
    </div>
  </div>

<script>
  const $ = (id) => document.getElementById(id);
  fetch('/config').then(r => r.json()).then(c => { if (c.to) $('to').value = c.to; });

  async function send(){
    const btn = $('send'), status = $('status');
    const to = $('to').value.trim(), message = $('msg').value.trim();
    status.textContent = ''; status.className = 'status';
    if(!to || !message){ status.textContent = 'Escribe el número y el mensaje.'; status.className='status err'; return; }
    btn.disabled = true; btn.textContent = 'Enviando…';
    try{
      const r = await fetch('/send', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ to, message }) });
      const data = await r.json();
      if(data.ok){ status.textContent = '✅ Enviado. Revisa tu WhatsApp.'; status.className='status ok'; $('msg').value=''; }
      else{ status.textContent = '⚠️ ' + data.error; status.className='status err'; }
    }catch(e){ status.textContent = '⚠️ ' + e.message; status.className='status err'; }
    btn.disabled = false; btn.textContent = 'Enviar a WhatsApp';
  }
  $('send').addEventListener('click', send);
  $('msg').addEventListener('keydown', (e)=>{ if((e.metaKey||e.ctrlKey)&&e.key==='Enter') send(); });
</script>
</body>
</html>`;
