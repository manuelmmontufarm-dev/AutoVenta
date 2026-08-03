/**
 * Servidor HTTP: webhook de Meta + healthcheck + hub estático.
 * La verificación de firma (x-hub-signature-256) y el challenge GET los maneja
 * whatsapp-api-js internamente (handle_post / handle_get).
 */
import express from "express";
import { fileURLToPath } from "node:url";
import { getWa } from "../wa/client.js";
import { sql } from "../db/client.js";
import { catalogStatus, searchBySize } from "../services/catalog.js";
import { renderCompareImage, toRenderLine } from "../render/quoteImage.js";
import { createAdminRouter } from "./admin.js";
import { getBotPower } from "../services/botPower.js";
import { shouldRunEmbeddedWorker } from "../workers/embeddedFollowUpWorker.js";

// Hub estático (site/ dentro de app/ para que entre en el build de Railway).
// Compilado vive en dist/server/, en dev en src/server/ — ../../site sirve en ambos.
const siteDir = fileURLToPath(new URL("../../site", import.meta.url));

export function createServer(): express.Express {
  const app = express();

  // handle_post necesita el body como string crudo (valida la firma sobre los bytes)
  app.post("/webhook", express.text({ type: "*/*" }), async (req, res) => {
    const wa = getWa();
    // Canal aún sin configurar: 200 para que Meta no reintente en bucle.
    if (!wa) {
      res.sendStatus(200);
      return;
    }
    res.sendStatus(await wa.handle_post(req));
  });

  app.get("/webhook", (req, res) => {
    const wa = getWa();
    if (!wa) {
      res.sendStatus(503);
      return;
    }
    try {
      res.send(wa.handle_get(req));
    } catch (code) {
      res.sendStatus(code as number);
    }
  });

  // /health también reporta el worker de seguimientos, que corre en otro
  // proceso y sin healthcheck propio: si se muere, deja de mandar seguimientos
  // sin que nada más se entere. `worker.ok` es falso si no late hace 2 minutos
  // (el ciclo normal es de 5 s), y es lo que debe vigilar la alerta externa.
  app.get("/health", async (_req, res) => {
    let worker: { ok: boolean; lastBeatAt: string | null; secondsAgo: number | null } = {
      ok: false, lastBeatAt: null, secondsAgo: null,
    };
    try {
      const [row] = await sql<{ value: { at?: string } }[]>`
        select value from settings where key = 'follow_up_worker_heartbeat'
      `;
      if (row?.value?.at) {
        const segundos = (Date.now() - new Date(row.value.at).getTime()) / 1000;
        worker = { ok: segundos < 120, lastBeatAt: row.value.at, secondsAgo: Math.round(segundos) };
      }
    } catch {
      worker = { ok: false, lastBeatAt: null, secondsAgo: null };
    }
    // `modo` evita el diagnóstico a ciegas: dice si el latido debería venir de
    // este mismo proceso o de un servicio aparte que hay que ir a mirar.
    // `bot` va aquí para que el monitor externo distinga «apagado a propósito»
    // de «caído»: sin esto, un apagado se ve idéntico a una avería.
    res.json({
      ok: true,
      bot: await getBotPower().catch(() => null),
      catalog: catalogStatus(),
      worker: { ...worker, modo: shouldRunEmbeddedWorker() ? "embebido" : "externo" },
    });
  });

  // Prueba en vivo del motor de imágenes con el catálogo real: renderiza la
  // comparativa de una medida (?medida=205/55R16) en este mismo servidor.
  // Sirve para verificar que satori/resvg/fuentes/fotos funcionan en Railway.
  app.get("/cotizaciones/live.png", async (req, res) => {
    try {
      const raw = String(req.query.medida ?? "205/55R16");
      const m = raw.match(/(\d{3})[/ ]?(\d{2})\s?Z?R?(\d{2})/i);
      if (!m) {
        res.status(400).json({ error: "medida inválida, ej. 205/55R16" });
        return;
      }
      const size = { width: Number(m[1]), aspect: Number(m[2]), rim: Number(m[3]) };
      const products = searchBySize(size)
        .filter((p) => p.availability !== "out")
        .slice(0, 3);
      if (!products.length) {
        res.status(404).json({ error: `sin productos para ${raw}` });
        return;
      }
      const png = await renderCompareImage({
        dateLabel: new Date().toLocaleDateString("es-EC", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: "America/Guayaquil",
        }),
        products: await Promise.all(products.map((p) => toRenderLine(p))),
      });
      res.type("png").send(png);
    } catch (err) {
      console.error("❌ /cotizaciones/live.png:", err);
      res.status(500).json({ error: String(err) });
    }
  });

  // API del panel en línea (mensajes, configuración de IA, tester).
  app.use("/api", createAdminRouter());

  // Hub estático: paletas de estilos, docs y demo. `extensions` replica las
  // cleanUrls de Vercel (/estilos/01-medianoche-depot funciona sin .html).
  app.use(express.static(siteDir, { extensions: ["html"] }));

  // Fallback si el hub no está en el build (no debería pasar en Railway).
  app.get("/", (_req, res) => {
    res.type("html").send(
      "<h1>AutoVenta</h1><p>Bot de ventas de llantas por WhatsApp — servicio activo.</p>",
    );
  });

  return app;
}
