/**
 * API de administración del hub en línea (/api/*): conversaciones reales,
 * envío manual, pausa del bot, configuración de IA y tester de WhatsApp.
 *
 * Seguridad: si existe ADMIN_KEY en el entorno, toda la API exige el header
 * x-admin-key (las páginas del hub piden la clave una vez y la recuerdan).
 * Sin ADMIN_KEY la API queda abierta — solo aceptable durante el piloto.
 */
import express from "express";
import { sql } from "../db/client.js";
import { business, config } from "../config.js";
import { appendMessage, pauseBot } from "../services/conversations.js";
import { getAiConfig, saveAiConfig } from "../services/settings.js";

const GRAPH = "https://graph.facebook.com/v21.0";
const ADMIN_KEY = process.env.ADMIN_KEY ?? "";

interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  code?: number;
  status: number;
}

/**
 * Envío directo por la Graph API (en vez de whatsapp-api-js) para poder
 * traducir los errores típicos de Meta a mensajes accionables en el panel.
 */
async function sendTextDetailed(to: string, body: string): Promise<SendResult> {
  const r = await fetch(`${GRAPH}/${config.whatsapp.phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
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

export function createAdminRouter(): express.Router {
  const router = express.Router();
  router.use(express.json());

  router.use((req, res, next) => {
    if (!ADMIN_KEY || req.header("x-admin-key") === ADMIN_KEY) return next();
    res.status(401).json({ ok: false, error: "Clave de administración requerida" });
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

    await appendMessage(id, "assistant", text, sent.id);
    await pauseBot(id);
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
    } else {
      await sql`update conversations set bot_paused_until = null where id = ${id}`;
    }
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
