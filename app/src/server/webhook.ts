/**
 * Servidor HTTP: webhook de Meta + healthcheck + hub estático.
 * La verificación de firma (x-hub-signature-256) y el challenge GET los maneja
 * whatsapp-api-js internamente (handle_post / handle_get). La excepción son los
 * ecos de mensajes salientes, que la librería no despacha: los atiende
 * `handleEchoWebhook`, que valida la misma firma por su cuenta antes de escribir.
 */
import express from "express";
import { fileURLToPath } from "node:url";
import { WhatsAppAPIError } from "whatsapp-api-js/errors";
import { getWa } from "../wa/client.js";
import { idDeNovedad, resumenDeNovedad, separarLote } from "../domain/loteDelWebhook.js";
import { handleEchoWebhook } from "../wa/echoes.js";
import { sql } from "../db/client.js";
import { catalogStatus, searchBySize } from "../services/catalog.js";
import {
  renderCompareImage,
  renderOptionsImage,
  renderQuoteImage,
  toRenderLine,
} from "../render/quoteImage.js";
import { createAdminRouter, exigirCredencial } from "./admin.js";
import { getBotPower } from "../services/botPower.js";
import { shouldRunEmbeddedWorker } from "../workers/embeddedFollowUpWorker.js";

// Hub estático (site/ dentro de app/ para que entre en el build de Railway).
// Compilado vive en dist/server/, en dev en src/server/ — ../../site sirve en ambos.
const siteDir = fileURLToPath(new URL("../../site", import.meta.url));

/** Momento de arranque del proceso: delata si un deploy reinició de verdad. */
const ARRANCADO_EN = new Date().toISOString();

/**
 * Veces que una misma novedad (id de mensaje o status) falló al procesarse.
 * Una que falla siempre no puede quedarse rebotando con 500: Meta la reintenta
 * por días y, mientras tanto, entrega más lento todo lo demás del número.
 */
const fallasPorNovedad = new Map<string, number>();
const MAX_REINTENTOS_DE_META = 3;

/**
 * Despacha CADA novedad del lote (ver `domain/loteDelWebhook.ts`) y devuelve el
 * status HTTP para Meta.
 *
 * Antes se llamaba `wa.handle_post(req)`, que tiene dos agujeros: lee solo la
 * primera novedad del lote, y si nuestro handler lanza devuelve 500 SIN dejar
 * rastro — el catch de arriba nunca se enteraba. El 10-nov hubo 500 de 2 ms
 * reintentados por Meta y ni una línea en el log.
 */
async function despacharLote(wa: NonNullable<ReturnType<typeof getWa>>, raw: string, firma: string): Promise<number> {
  let data: unknown;
  try {
    data = JSON.parse(raw || "{}");
  } catch {
    console.error("❌ Webhook con cuerpo que no es JSON: descartado.");
    return 400;
  }
  let estado = 200;
  for (const parte of separarLote(data)) {
    try {
      await wa.post(parte as Parameters<typeof wa.post>[0], raw, firma);
    } catch (error) {
      if (error instanceof WhatsAppAPIError) {
        // «Unexpected payload» (200) es un cambio que la librería no despacha:
        // no es una falla. Firma inválida (401) sí corta el lote entero.
        if (error.httpStatus === 200) continue;
        console.error(`❌ Webhook rechazado (${error.httpStatus}): ${error.message} — ${resumenDeNovedad(parte)}`);
        return error.httpStatus;
      }
      const id = idDeNovedad(parte);
      const veces = id ? (fallasPorNovedad.get(id) ?? 0) + 1 : 1;
      if (id) {
        if (fallasPorNovedad.size > 5000) fallasPorNovedad.clear();
        fallasPorNovedad.set(id, veces);
      }
      console.error(
        `❌ El webhook falló procesando ${resumenDeNovedad(parte)} (intento ${veces}):`,
        error instanceof Error ? error.stack ?? error.message : error,
      );
      if (veces >= MAX_REINTENTOS_DE_META) {
        console.error(`🚨 ${resumenDeNovedad(parte)} falló ${veces} veces: se deja de pedir reintento a Meta.`);
      } else {
        estado = 500;
      }
    }
  }
  return estado;
}

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
    // Express 4 NO captura promesas rechazadas de un handler `async`: cualquier
    // throw de aquí dentro (una consulta a Postgres que falla en
    // handleEchoWebhook o dentro de handle_post) se convertía en
    // unhandledRejection y Node ≥15 mata el proceso. Y al morir se pierden el
    // buffer de debounce y la cola FIFO en memoria: los mensajes que estaban
    // esperando su ventana de 5 s no se contestan nunca, sin reintento ni
    // rastro. Un 500 hace que Meta reintregue el lote, que es justo lo correcto.
    try {
      // Los ecos van antes: whatsapp-api-js solo despacha `messages` y `calls`, y
      // tiraba a la basura lo que el asesor escribía desde WhatsApp (ticket 1286).
      const eco = await handleEchoWebhook(String(req.body ?? ""), req.header("x-hub-signature-256"));
      if (eco.handled) {
        res.sendStatus(eco.status);
        return;
      }
      res.sendStatus(await despacharLote(wa, String(req.body ?? ""), req.header("x-hub-signature-256") ?? ""));
    } catch (error) {
      console.error("❌ El webhook falló procesando el lote:", error instanceof Error ? error.stack ?? error.message : error);
      if (!res.headersSent) res.sendStatus(500);
    }
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
    // Commit que está corriendo: el badge del panel lo compara con el suyo y
    // avisa si solo se desplegó una mitad.
    const version = {
      commit: (process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? "").slice(0, 7) || null,
      arrancadoEn: ARRANCADO_EN,
    };
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
      version,
      bot: await getBotPower().catch(() => null),
      catalog: catalogStatus(),
      worker: { ...worker, modo: shouldRunEmbeddedWorker() ? "embebido" : "externo" },
    });
  });

  // Prueba en vivo del motor de imágenes con el catálogo real: renderiza la
  // comparativa de una medida (?medida=205/55R16) en este mismo servidor.
  // Sirve para verificar que satori/resvg/fuentes/fotos funcionan en Railway.
  app.get("/cotizaciones/live.png", exigirCredencial, async (req, res) => {
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
      // `?identidad=` deja probar la pieza de cada marca comercial (R-45);
      // sin el parámetro, la de la presentación — Depot igual que siempre.
      const identidad = typeof req.query.identidad === "string" ? req.query.identidad : undefined;
      const png = await renderCompareImage({
        identidad,
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

  // Diagnóstico de las tres piezas visuales contra el catálogo real.
  // Existe porque cuando una pieza no sale, el cliente recibe el texto largo y
  // hasta ahora nadie se enteraba. Reporta peso y tiempo de cada una: el tope
  // de Meta para imágenes es 5 MB y pasado eso el upload se rechaza.
  app.get("/diagnostico/piezas", exigirCredencial, async (req, res) => {
    const LIMITE_META_MB = 5;
    const ALERTA_MB = 4.5;
    try {
      const raw = String(req.query.medida ?? "205/55R16");
      const m = raw.match(/(\d{3})[/ ]?(\d{2})\s?Z?R?(\d{2})/i);
      if (!m) {
        res.status(400).json({ error: "medida inválida, ej. 205/55R16" });
        return;
      }
      const size = { width: Number(m[1]), aspect: Number(m[2]), rim: Number(m[3]) };
      const products = searchBySize(size).slice(0, 9);
      if (!products.length) {
        res.status(404).json({ error: `sin productos para ${raw}` });
        return;
      }
      const fecha = new Date().toLocaleDateString("es-EC", {
        day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Guayaquil",
      });
      const lines = await Promise.all(products.map((p) => toRenderLine(p)));

      const medir = async (pieza: string, render: () => Promise<Buffer>) => {
        const inicio = Date.now();
        try {
          const png = await render();
          const mb = png.byteLength / 1_048_576;
          return {
            pieza, ok: true,
            ancho: png.readUInt32BE(16), alto: png.readUInt32BE(20),
            mb: Number(mb.toFixed(2)), ms: Date.now() - inicio,
            aceptaMeta: mb < LIMITE_META_MB,
            alLimite: mb >= ALERTA_MB && mb < LIMITE_META_MB,
          };
        } catch (err) {
          return {
            pieza, ok: false, ms: Date.now() - inicio,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      };

      // `?identidad=` prueba las tres piezas con esa marca comercial (R-45).
      const identidad = typeof req.query.identidad === "string" ? req.query.identidad : undefined;
      const piezas = [
        await medir("cotizacion", () =>
          renderQuoteImage({
            number: "COT-DIAG", dateLabel: fecha, lines: [lines[0]],
            subtotal: 0, iva: 0, total: 0, identidad,
          })),
        await medir("comparativa", () =>
          renderCompareImage({ dateLabel: fecha, products: lines.slice(0, 3), identidad })),
        await medir("opciones", () =>
          renderOptionsImage({ dateLabel: fecha, sizeLabel: raw, products: lines, identidad })),
      ];

      const rotas = piezas.filter((p) => !p.ok || p.aceptaMeta === false);
      res.json({
        ok: rotas.length === 0,
        medida: raw,
        productos: products.length,
        sinFoto: products.filter((p) => !p.imageUrl).length,
        piezas,
      });
    } catch (err) {
      console.error("❌ /diagnostico/piezas:", err);
      res.status(500).json({ ok: false, error: String(err) });
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
