/**
 * API de administración del hub en línea (/api/*): conversaciones reales,
 * envío manual, pausa del bot, configuración de IA y tester de WhatsApp.
 *
 * Seguridad: si existe ADMIN_KEY en el entorno, toda la API exige el header
 * x-admin-key (las páginas del hub piden la clave una vez y la recuerdan).
 * Sin ADMIN_KEY la API queda abierta — solo aceptable durante el piloto.
 */
import express from "express";
import { z } from "zod";
import { sql } from "../db/client.js";
import { business, config } from "../config.js";
import { appendMessage, pauseBot } from "../services/conversations.js";
import {
  getAiConfig,
  listStagePrompts,
  publishStagePrompt,
  saveAiConfig,
  saveStagePromptDraft,
} from "../services/settings.js";
import {
  catalogStatus,
  catalogInventoryMetrics,
  catalogMediaReport,
  ensureCatalogReady,
  findById,
  searchByText,
} from "../services/catalog.js";
import {
  buildQuote,
  renderComparisonPdf,
  renderQuotePdf,
} from "../services/quotePdf.js";
import {
  buildComparisonMessage,
  buildCustomerOptionsMessage,
  buildDistributorOptionsMessage,
  buildCustomerQuoteMessage,
  buildSingleQuoteMessage,
  type CatalogQuoteSelection,
  warrantyForBrand,
} from "../services/quoteMessages.js";
import {
  addConversationNote,
  markConversationRead,
  setConversationAssignee,
  setStage,
  reopenConversation,
} from "../services/conversations.js";
import { getHubFeed, getHubMessages, getHubMetrics, listHubTickets } from "../services/hubData.js";
import { emitLiveEvent, subscribeLiveEvents } from "../services/liveEvents.js";
import { isStage } from "../domain/pipeline.js";
import { getPhaseFlags, savePhaseFlags } from "../services/phases.js";
import {
  getChannelConfig,
  getPublicChannelConfig,
  saveChannelConfig,
} from "../services/channel.js";

const GRAPH = "https://graph.facebook.com/v21.0";
const ADMIN_KEY = process.env.ADMIN_KEY ?? "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  code?: number;
  status: number;
}

const CatalogSelectionSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        quantity: z.number().int().min(1).max(8),
      }),
    )
    .min(1)
    .max(3),
  customerName: z.string().max(120).default("Cliente"),
  customerPhone: z.string().max(30).default(""),
});

const CompareSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1).max(80) })).min(2).max(3),
  style: z.literal("comparison").default("comparison"),
  customerName: z.string().max(120).default("Cliente"),
});

const OptionsSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1).max(80) })).min(1).max(60),
  style: z.enum(["customer", "distributor"]).default("customer"),
  customerName: z.string().max(120).default("Cliente"),
});

const QuoteSchema = z.object({
  item: z.object({
    id: z.string().min(1).max(80),
    quantity: z.number().int().min(1).max(8),
  }),
  customerName: z.string().max(120).default("Cliente"),
  customerPhone: z.string().max(30).default(""),
});

/**
 * Envío directo por la Graph API (en vez de whatsapp-api-js) para poder
 * traducir los errores típicos de Meta a mensajes accionables en el panel.
 */
async function sendTextDetailed(to: string, body: string): Promise<SendResult> {
  const channel = await getChannelConfig();
  if (!channel.token || !channel.phoneId) {
    return {
      ok: false,
      error: "Canal de WhatsApp sin configurar: pon el token y el Phone ID en Ajustes → Canal.",
      status: 502,
    };
  }
  const r = await fetch(`${GRAPH}/${channel.phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channel.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  const data = (await r.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string; code?: number };
  };

  if (r.ok) return { ok: true, id: data.messages?.[0]?.id, status: 200 };

  const err = data.error ?? {};
  let hint = err.message || "Error de Meta";
  // Ventana de 24h cerrada: el cliente tiene que escribir primero.
  if (err.code === 131047 || /re-?engagement|24 hour/i.test(err.message ?? "")) {
    hint =
      "La ventana de 24 h está cerrada: ese número tiene que escribirle primero al bot para poder responderle texto libre.";
  }
  if (err.code === 190 || /expired|invalid.*token/i.test(err.message ?? "")) {
    hint =
      "El token de WhatsApp expiró o es inválido. Genera uno nuevo en Meta y actualiza WHATSAPP_TOKEN en Railway.";
  }
  // 502 fijo: si se propagara el 401/403 de Meta, el front lo confundiría con
  // la clave de administración inválida (el gate de login saltaría sin razón).
  return { ok: false, error: hint, code: err.code, status: 502 };
}

const PANEL_ORIGIN = process.env.ADMIN_PANEL_ORIGIN ?? "*";

export function createAdminRouter(): express.Router {
  const router = express.Router();
  router.use(express.json());

  // CORS: el panel central de administración vive en otro origen y llama a
  // /api/phases y /api/channel de cada cliente. La seguridad real es la
  // x-admin-key; el preflight OPTIONS va ANTES del gate para no rebotar.
  router.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", PANEL_ORIGIN);
    res.header("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS");
    res.header("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  if (!ADMIN_KEY && IS_PRODUCTION) {
    console.error(
      "🔒 ADMIN_KEY no está configurada y NODE_ENV=production: el panel /api quedará BLOQUEADO. Define ADMIN_KEY en el entorno.",
    );
  }

  router.use((req, res, next) => {
    if (ADMIN_KEY) {
      if (req.header("x-admin-key") === ADMIN_KEY) return next();
      res.status(401).json({ ok: false, error: "Clave de administración requerida" });
      return;
    }
    // Sin ADMIN_KEY: en producción se cierra (nunca abierto en el entregable);
    // en desarrollo local se permite para no frenar las pruebas.
    if (IS_PRODUCTION) {
      res.status(503).json({
        ok: false,
        error: "El panel no tiene ADMIN_KEY configurada. Define ADMIN_KEY antes de exponerlo.",
      });
      return;
    }
    next();
  });

  // Estado general: las páginas lo usan para validar la clave y prellenar datos.
  router.get("/status", (_req, res) => {
    res.json({
      ok: true,
      negocio: business.name,
      protegido: Boolean(ADMIN_KEY),
      telefonoVendedor: config.whatsapp.sellerPhone,
    });
  });

  // ── Fases del producto (entrega por etapas) ────────────────────────────────
  router.get("/phases", async (_req, res) => {
    res.json({ ok: true, phases: await getPhaseFlags() });
  });

  router.put("/phases", async (req, res) => {
    try {
      const phases = await savePhaseFlags(req.body);
      res.json({ ok: true, phases });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Fases inválidas",
      });
    }
  });

  // ── Canal de WhatsApp (token/phoneId/etc. desde el panel) ──────────────────
  router.get("/channel", async (_req, res) => {
    res.json({ ok: true, channel: await getPublicChannelConfig() });
  });

  router.put("/channel", async (req, res) => {
    try {
      await saveChannelConfig(req.body);
      res.json({ ok: true, channel: await getPublicChannelConfig() });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Canal inválido",
      });
    }
  });

  // ── Producto real: Hub ─────────────────────────────────────────────────────
  router.get("/hub/tickets", async (_req, res) => {
    res.json({ ok: true, tickets: await listHubTickets() });
  });

  router.get("/hub/tickets/:id/messages", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }
    res.json({ ok: true, messages: await getHubMessages(id) });
  });

  router.get("/hub/feed", async (_req, res) => {
    res.json({ ok: true, feed: await getHubFeed() });
  });

  router.get("/hub/metrics", async (req, res) => {
    const days = Math.max(7, Math.min(Number(req.query.days) || 14, 90));
    res.json({
      ok: true,
      metrics: {
        ...(await getHubMetrics(days)),
        inventory: catalogInventoryMetrics(),
      },
    });
  });

  router.get("/catalog/media-report", async (_req, res) => {
    await ensureCatalogReady().catch(() => undefined);
    res.json({ ok: true, report: catalogMediaReport() });
  });

  router.get("/hub/events", (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const unsubscribe = subscribeLiveEvents((event) => {
      res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 20_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  router.patch("/hub/tickets/:id/stage", async (req, res) => {
    const id = Number(req.params.id);
    const stage = String(req.body?.stage ?? "");
    if (!Number.isInteger(id) || !isStage(stage)) {
      return res.status(400).json({ ok: false, error: "Etapa inválida" });
    }
    await setStage(id, stage, {
      actor: "owner",
      reason: String(req.body?.reason ?? "Movimiento manual desde Kanban").slice(0, 300),
    });
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  router.post("/hub/tickets/:id/close", async (req, res) => {
    const id = Number(req.params.id);
    const closure = String(req.body?.closure ?? "");
    if (!Number.isInteger(id) || !["ganado", "perdido", "sin_respuesta"].includes(closure)) {
      return res.status(400).json({ ok: false, error: "Cierre inválido" });
    }
    await setStage(id, closure === "ganado" ? "ganado" : "perdido", {
      actor: "owner",
      reason: closure === "sin_respuesta" ? "sin_respuesta" : String(req.body?.note ?? closure),
    });
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  router.post("/hub/tickets/:id/reopen", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }
    await reopenConversation(id, "owner", "Conversación reabierta manualmente");
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  router.patch("/hub/tickets/:id/assignee", async (req, res) => {
    const id = Number(req.params.id);
    const assignedTo = String(req.body?.assignedTo ?? "");
    if (!Number.isInteger(id) || !["bot", "human"].includes(assignedTo)) {
      return res.status(400).json({ ok: false, error: "Asignación inválida" });
    }
    await setConversationAssignee(id, assignedTo as "bot" | "human");
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  router.post("/hub/tickets/:id/notes", async (req, res) => {
    const id = Number(req.params.id);
    const content = String(req.body?.content ?? "").trim().slice(0, 2000);
    if (!Number.isInteger(id) || !content) {
      return res.status(400).json({ ok: false, error: "Nota inválida" });
    }
    await addConversationNote(id, content);
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  router.post("/hub/tickets/:id/read", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }
    await markConversationRead(id);
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  // ── Cotizador / catálogo ───────────────────────────────────────────────────
  router.get("/catalog/status", (_req, res) => {
    res.json({ ok: true, catalog: catalogStatus() });
  });

  router.get("/catalog/search", async (req, res) => {
    const query = String(req.query.q ?? "").trim().slice(0, 100);
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 40, 60));
    if (!query) {
      return res.status(400).json({ ok: false, error: "Escribe una medida, código o diseño" });
    }
    try {
      await ensureCatalogReady();
      const products = searchByText(query, limit).map(publicCatalogItem);
      res.json({ ok: true, query, products, catalog: catalogStatus() });
    } catch {
      res.status(503).json({
        ok: false,
        error: "El catálogo no está disponible en este momento. Intenta nuevamente.",
      });
    }
  });

  router.post("/catalog/message", async (req, res) => {
    try {
      await ensureCatalogReady();
      const input = CatalogSelectionSchema.parse(req.body);
      const selections = resolveCatalogSelections(input.items);
      res.json({
        ok: true,
        message: buildCustomerQuoteMessage(selections, input.customerName),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Selección inválida";
      res.status(400).json({ ok: false, error: message });
    }
  });

  router.post("/catalog/compare-message", async (req, res) => {
    try {
      await ensureCatalogReady();
      const input = CompareSchema.parse(req.body);
      const products = resolveCatalogProducts(input.items.map(({ id }) => id));
      res.json({ ok: true, message: buildComparisonMessage(products) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Comparación inválida";
      res.status(400).json({ ok: false, error: message });
    }
  });

  router.post("/catalog/options-message", async (req, res) => {
    try {
      await ensureCatalogReady();
      const input = OptionsSchema.parse(req.body);
      const products = resolveCatalogProducts(input.items.map(({ id }) => id));
      const message =
        input.style === "distributor"
          ? buildDistributorOptionsMessage(products)
          : buildCustomerOptionsMessage(products, input.customerName);
      res.json({ ok: true, message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Selección inválida";
      res.status(400).json({ ok: false, error: message });
    }
  });

  router.post("/catalog/compare-pdf", async (req, res) => {
    try {
      await ensureCatalogReady();
      const input = CompareSchema.parse(req.body);
      const products = resolveCatalogProducts(input.items.map(({ id }) => id));
      const pdf = await renderComparisonPdf(products);
      res
        .status(200)
        .type("application/pdf")
        .setHeader("Content-Disposition", 'attachment; filename="Comparativa-DepotTire.pdf"')
        .send(pdf);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo generar la comparativa";
      res.status(400).json({ ok: false, error: message });
    }
  });

  router.post("/catalog/quote-message", async (req, res) => {
    try {
      await ensureCatalogReady();
      const input = QuoteSchema.parse(req.body);
      const [selection] = resolveCatalogSelections([input.item]);
      res.json({
        ok: true,
        message: buildSingleQuoteMessage(selection, input.customerName),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cotización inválida";
      res.status(400).json({ ok: false, error: message });
    }
  });

  router.post("/catalog/quote-pdf", async (req, res) => {
    try {
      await ensureCatalogReady();
      const input = QuoteSchema.parse(req.body);
      const [selection] = resolveCatalogSelections([input.item]);
      const { product, quantity } = selection;
      const warranty = warrantyForBrand(product.brand);
      const quote = buildQuote(
        [
          {
          code: product.code,
          description: `${product.brand} ${product.design} ${product.sizeLabel ?? product.name}`,
          quantity,
            unitPrice: product.minimumPriceWithTax / (1 + product.taxRate),
            brand: product.brand,
            design: product.design,
            sizeLabel: product.sizeLabel,
            listPriceWithTax: product.customerPriceWithTax,
            salePriceWithTax: product.minimumPriceWithTax,
            availability: product.availability,
            imageUrl: product.imageUrl,
            loadSpeed: product.loadSpeed,
            warrantyFactory: warranty.factory,
            warrantyRoadHazard: warranty.roadHazard,
          },
        ],
        input.customerName,
        input.customerPhone,
      );
      const pdf = await renderQuotePdf(quote);
      res
        .status(200)
        .type("application/pdf")
        .setHeader(
          "Content-Disposition",
          `attachment; filename="Cotizacion-${business.name.replace(/\s/g, "")}-${quote.number}.pdf"`,
        )
        .send(pdf);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo generar la cotización";
      res.status(400).json({ ok: false, error: message });
    }
  });

  // ── Mensajes ────────────────────────────────────────────────────────────────
  router.get("/conversations", async (_req, res) => {
    const rows = await sql`
      select c.id, c.phone, c.name, c.stage, c.bot_paused_until,
             m.content as last_message, m.role as last_role, m.created_at as last_at
      from conversations c
      left join lateral (
        select content, role, created_at
        from messages
        where conversation_id = c.id
        order by created_at desc
        limit 1
      ) m on true
      order by coalesce(m.created_at, c.updated_at) desc
      limit 100
    `;
    res.json({ ok: true, conversations: rows });
  });

  router.get("/conversations/:id/messages", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "id inválido" });
    const rows = await sql`
      select id, role, content, created_at
      from messages
      where conversation_id = ${id} and role in ('user', 'assistant')
      order by created_at asc
      limit 500
    `;
    res.json({ ok: true, messages: rows });
  });

  // Envío manual del dueño: manda por Meta, guarda en el historial y silencia
  // al bot (mismo handoff que cuando responde desde su celular).
  router.post("/conversations/:id/send", async (req, res) => {
    const id = Number(req.params.id);
    const text = String(req.body?.text ?? "").trim();
    if (!Number.isInteger(id) || !text) {
      return res.status(400).json({ ok: false, error: "Falta el mensaje" });
    }
    const [conversation] = await sql<{ id: number; phone: string }[]>`
      select id, phone from conversations where id = ${id}
    `;
    if (!conversation) return res.status(404).json({ ok: false, error: "Conversación no encontrada" });

    const sent = await sendTextDetailed(conversation.phone, text);
    if (!sent.ok) return res.status(sent.status).json(sent);

    await appendMessage(id, "assistant", text, sent.id, {
      authorKind: "owner",
      status: "sent",
    });
    await pauseBot(id);
    await setConversationAssignee(id, "human");
    emitLiveEvent("message", id);
    emitLiveEvent("sync", id);
    res.json({ ok: true, id: sent.id, botPausadoHoras: config.pipeline.botPauseHours });
  });

  router.post("/conversations/:id/bot", async (req, res) => {
    const id = Number(req.params.id);
    const accion = String(req.body?.accion ?? "");
    if (!Number.isInteger(id) || !["pausar", "activar"].includes(accion)) {
      return res.status(400).json({ ok: false, error: "Acción inválida" });
    }
    if (accion === "pausar") {
      await pauseBot(id);
      await setConversationAssignee(id, "human");
    } else {
      await setConversationAssignee(id, "bot");
    }
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  // ── Configuración de IA ─────────────────────────────────────────────────────
  router.get("/ai-config", async (_req, res) => {
    res.json({ ok: true, config: await getAiConfig() });
  });

  router.put("/ai-config", async (req, res) => {
    try {
      res.json({ ok: true, config: await saveAiConfig(req.body) });
    } catch {
      res.status(400).json({ ok: false, error: "Configuración inválida" });
    }
  });

  router.get("/stage-prompts", async (_req, res) => {
    res.json({ ok: true, prompts: await listStagePrompts() });
  });

  router.post("/stage-prompts/:stage/drafts", async (req, res) => {
    const stage = String(req.params.stage ?? "");
    if (!isStage(stage)) {
      return res.status(400).json({ ok: false, error: "Etapa inválida" });
    }
    try {
      const prompt = await saveStagePromptDraft(stage, req.body);
      emitLiveEvent("settings");
      res.json({ ok: true, prompt });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Prompt inválido",
      });
    }
  });

  router.post("/stage-prompts/versions/:id/publish", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, error: "Versión inválida" });
    }
    try {
      const prompt = await publishStagePrompt(id);
      emitLiveEvent("settings");
      res.json({ ok: true, prompt });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "No se pudo publicar",
      });
    }
  });

  // ── Tester ──────────────────────────────────────────────────────────────────
  router.post("/tester/send", async (req, res) => {
    const to = String(req.body?.to ?? "").replace(/\D/g, "");
    const message = String(req.body?.message ?? "").trim();
    if (!to || !message) {
      return res.status(400).json({ ok: false, error: "Escribe el número y el mensaje." });
    }
    const sent = await sendTextDetailed(to, message);
    res.status(sent.ok ? 200 : sent.status).json(sent);
  });

  return router;
}

function resolveCatalogSelections(
  input: { id: string; quantity: number }[],
): CatalogQuoteSelection[] {
  return input.map(({ id, quantity }) => {
    const product = findById(id);
    if (!product) throw new Error(`El producto ${id} ya no está en el catálogo`);
    if (product.availability === "out") {
      throw new Error(`${product.brand} ${product.design} está agotada`);
    }
    return { product, quantity };
  });
}

function resolveCatalogProducts(ids: string[]) {
  if (new Set(ids).size !== ids.length) {
    throw new Error("Selecciona modelos distintos para comparar");
  }
  return ids.map((id) => {
    const product = findById(id);
    if (!product) throw new Error(`El producto ${id} ya no está en el catálogo`);
    return product;
  });
}

function publicCatalogItem(item: ReturnType<typeof searchByText>[number]) {
  const warranty = warrantyForBrand(item.brand);
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    brand: item.brand,
    design: item.design,
    sizeLabel: item.sizeLabel,
    listPrice: item.customerPriceWithTax,
    salePrice: item.minimumPriceWithTax,
    discountPercent: Math.round(
      (1 - item.minimumPriceWithTax / item.customerPriceWithTax) * 100,
    ),
    // Alias temporal para clientes anteriores.
    customerPrice: item.customerPriceWithTax,
    minimumPrice: item.minimumPriceWithTax,
    availability: item.availability,
    stock: item.stock,
    imageUrl: item.imageUrl,
    imageSource: item.imageSource,
    loadSpeed: item.loadSpeed,
    warranty,
    updatedAt: catalogStatus().lastSync,
  };
}
