/**
 * Servidor HTTP: webhook de Meta + healthcheck + hub estático.
 * La verificación de firma (x-hub-signature-256) y el challenge GET los maneja
 * whatsapp-api-js internamente (handle_post / handle_get).
 */
import express from "express";
import { fileURLToPath } from "node:url";
import { wa } from "../wa/client.js";
import { catalogStatus } from "../services/catalog.js";
import { createAdminRouter } from "./admin.js";

// Hub estático (site/ dentro de app/ para que entre en el build de Railway).
// Compilado vive en dist/server/, en dev en src/server/ — ../../site sirve en ambos.
const siteDir = fileURLToPath(new URL("../../site", import.meta.url));

export function createServer(): express.Express {
  const app = express();

  // handle_post necesita el body como string crudo (valida la firma sobre los bytes)
  app.post("/webhook", express.text({ type: "*/*" }), async (req, res) => {
    res.sendStatus(await wa.handle_post(req));
  });

  app.get("/webhook", (req, res) => {
    try {
      res.send(wa.handle_get(req));
    } catch (code) {
      res.sendStatus(code as number);
    }
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, catalog: catalogStatus() });
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
