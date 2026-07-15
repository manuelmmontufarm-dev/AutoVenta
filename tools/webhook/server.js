import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";

const ENV_PATH = join(dirname(fileURLToPath(import.meta.url)), ".env");

// Lee el .env FRESCO en cada request, igual que el wa-tester — así no hay
// que reiniciar el servidor cuando cambias el VERIFY_TOKEN o el APP_SECRET.
function readEnv() {
  const env = {};
  try {
    for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].trim();
    }
  } catch { /* archivo no encontrado — se avisa en el handshake */ }
  return env;
}

const app = express();

// Guardamos el body crudo (buffer) para poder validar la firma HMAC más abajo.
// express.json() ya parsea a objeto, así que capturamos el buffer en "verify".
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// --- Paso 1: handshake de verificación (Meta llama esto UNA vez al guardar el Callback URL) ---
app.get("/webhook", (req, res) => {
  const env = readEnv();
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.VERIFY_TOKEN) {
    console.log("✅ Webhook verificado por Meta");
    return res.status(200).send(challenge);
  }

  console.warn("⚠️ Verificación de webhook fallida — revisa que VERIFY_TOKEN coincida en .env y en Meta");
  res.sendStatus(403);
});

// --- Paso 2: recepción de mensajes/estados ---
app.post("/webhook", (req, res) => {
  const env = readEnv();

  if (!verifySignature(req, env.APP_SECRET)) {
    console.warn("⚠️ Firma inválida — el request no viene de Meta (o APP_SECRET está mal en .env)");
    return res.sendStatus(403);
  }

  // Responder 200 de inmediato — Meta reintenta si no confirmas rápido.
  res.status(200).send("EVENT_RECEIVED");

  if (req.body.object !== "whatsapp_business_account") return;

  for (const entry of req.body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      for (const status of value.statuses ?? []) {
        console.log(`📬 Estado: mensaje ${status.id} → ${status.status}`);
      }

      for (const message of value.messages ?? []) {
        logIncomingMessage(value, message);
      }
    }
  }
});

function logIncomingMessage(value, message) {
  const contact = value.contacts?.[0];
  const name = contact?.profile?.name ?? "desconocido";
  const from = message.from;

  console.log(`\n📩 Mensaje de ${name} (${from}) — tipo: ${message.type} — id: ${message.id}`);

  switch (message.type) {
    case "text":
      console.log(`   texto: "${message.text.body}"`);
      break;
    case "image":
      console.log(`   imagen — media_id: ${message.image.id} (URL válida solo 5 min, descargar ya)`);
      break;
    case "location":
      console.log(`   ubicación: lat=${message.location.latitude}, lng=${message.location.longitude}`);
      break;
    case "document":
      console.log(`   documento: ${message.document.filename ?? "(sin nombre)"} — media_id: ${message.document.id}`);
      break;
    default:
      console.log("   (tipo sin manejar aún)", JSON.stringify(message));
  }
}

// Verifica que el request venga realmente de Meta (X-Hub-Signature-256 = HMAC-SHA256 del body con el App Secret).
function verifySignature(req, appSecret) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature || !appSecret) return false;

  const expectedHash = crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex");
  const receivedHash = signature.split("=")[1] ?? "";

  // timingSafeEqual exige buffers del mismo tamaño; si difieren, ya es inválido.
  const a = Buffer.from(receivedHash);
  const b = Buffer.from(expectedHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.get("/", (_req, res) => {
  res.json({ message: "AutoVenta webhook corriendo", endpoints: ["GET/POST /webhook"] });
});

const env = readEnv();
const PORT = env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  ✅ Webhook corriendo → http://localhost:${PORT}/webhook\n`);
  if (!env.VERIFY_TOKEN || env.VERIFY_TOKEN.includes("PEGA_")) {
    console.warn("  ⚠️  Falta configurar VERIFY_TOKEN en tools/webhook/.env");
  }
  if (!env.APP_SECRET || env.APP_SECRET.includes("PEGA_")) {
    console.warn("  ⚠️  Falta configurar APP_SECRET en tools/webhook/.env");
  }
});
