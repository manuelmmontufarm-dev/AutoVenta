/**
 * Servidor HTTP: webhook de Meta + healthcheck + hub estático.
 * La verificación de firma (x-hub-signature-256) y el challenge GET los maneja
 * whatsapp-api-js internamente (handle_post / handle_get).
 */
import express from "express";
import { fileURLToPath } from "node:url";
import { getWa } from "../wa/client.js";
import { catalogStatus, searchBySize } from "../services/catalog.js";
import { renderCompareImage, toRenderLine } from "../render/quoteImage.js";
import { createAdminRouter } from "./admin.js";

// Hub estático (site/ dentro de app/ para que entre en el build de Railway).
// Compilado vive en dist/server/, en dev en src/server/ — ../../site sirve en ambos.
const siteDir = fileURLToPath(new URL("../../site", import.meta.url));

export function createServer(): express.Express {
  const app = express();

  // handle_post necesita el body como string crudo (valida la firma sobre los bytes)
  app.post("/webhook", express.text({ type: "*/*" }), async (req, res) => {
    res.sendStatus(await getWa().handle_post(req));
  });

  app.get("/webhook", (req, res) => {
    try {
      res.send(getWa().handle_get(req));
    } catch (code) {
      res.sendStatus(code as number);
    }
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, catalog: catalogStatus() });
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
