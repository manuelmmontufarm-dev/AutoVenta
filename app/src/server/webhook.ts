/**
 * Servidor HTTP: webhook de Meta + healthcheck.
 * La verificación de firma (x-hub-signature-256) y el challenge GET los maneja
 * whatsapp-api-js internamente (handle_post / handle_get).
 */
import express from "express";
import { wa } from "../wa/client.js";
import { catalogStatus } from "../services/catalog.js";

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

  return app;
}
