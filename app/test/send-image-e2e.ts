/**
 * Prueba e2e real: renderiza la cotización héroe y la envía por WhatsApp
 * al número de pruebas (RECIPIENT de tools/wa-tester/.env).
 *
 *   npx tsx test/send-image-e2e.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

// Credenciales del wa-tester (número de pruebas del proyecto)
const envFile = readFileSync(
  path.resolve(import.meta.dirname, "../../tools/wa-tester/.env"),
  "utf8",
);
const env: Record<string, string> = {};
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const { WHATSAPP_TOKEN, PHONE_NUMBER_ID, RECIPIENT } = env;
if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID || !RECIPIENT) {
  console.error("❌ Falta WHATSAPP_TOKEN / PHONE_NUMBER_ID / RECIPIENT en tools/wa-tester/.env");
  process.exit(1);
}

// Dummies para importar los módulos del bot sin el resto del entorno
process.env.WHATSAPP_TOKEN = WHATSAPP_TOKEN;
process.env.WHATSAPP_APP_SECRET ??= "x";
process.env.WHATSAPP_VERIFY_TOKEN ??= "x";
process.env.WHATSAPP_PHONE_ID = PHONE_NUMBER_ID;
process.env.SELLER_PHONE = RECIPIENT;
process.env.OPENAI_API_KEY ??= "x";
process.env.DATABASE_URL ??= "postgres://x/x";

const { renderQuoteImage, toRenderLine } = await import("../src/render/quoteImage.js");
const { extractLoadSpeed } = await import("../src/domain/loadSpeed.js");

const line = await toRenderLine({
  brand: "Kenda",
  design: "KR608",
  sizeLabel: "265/70R16",
  loadSpeed: extractLoadSpeed("LT265/70R16 8PR 117/114 S"),
  quantity: 4,
  priceSinIva: 208.23,
  pvpSinIva: 277.63,
  stock: 12,
});
const png = await renderQuoteImage({
  number: "COT-E2E1",
  dateLabel: new Date().toLocaleDateString("es-EC", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Guayaquil",
  }),
  lines: [line],
  subtotal: 832.92,
  iva: 124.94,
  total: 957.86,
});
console.log(`PNG renderizado: ${(png.byteLength / 1024).toFixed(0)} KB`);

// Upload directo a la Graph API (mismo flujo que wa/client.ts)
const form = new FormData();
form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "cotizacion.png");
form.append("messaging_product", "whatsapp");
const upload = await fetch(
  `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`,
  { method: "POST", headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, body: form },
);
const uploadJson = (await upload.json()) as { id?: string; error?: { message: string } };
if (!uploadJson.id) {
  console.error("❌ Upload falló:", JSON.stringify(uploadJson.error ?? uploadJson));
  process.exit(1);
}
console.log(`Media subida: ${uploadJson.id}`);

const send = await fetch(
  `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: RECIPIENT,
      type: "image",
      image: { id: uploadJson.id, caption: "Cotización COT-E2E1 · prueba del motor visual 🏁" },
    }),
  },
);
const sendJson = (await send.json()) as {
  messages?: { id: string }[];
  error?: { message: string };
};
if (sendJson.messages?.[0]?.id) {
  console.log(`✅ Imagen enviada a ${RECIPIENT}. wamid: ${sendJson.messages[0].id}`);
} else {
  console.error("❌ Envío falló:", JSON.stringify(sendJson.error ?? sendJson));
  process.exit(1);
}
