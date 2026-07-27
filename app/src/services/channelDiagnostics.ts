/**
 * Diagnóstico del canal de WhatsApp: responde "¿está bien conectado?" con
 * evidencia real, no con un booleano.
 *
 * Cada chequeo es independiente y devuelve qué se comprobó, contra qué, y qué
 * hacer si falla. El hub los pinta como pasos (Ajustes → WhatsApp), así que el
 * texto de `detalle` y `ayuda` es lo que lee el dueño — se escribe para él, no
 * para un log.
 *
 * Nada de esto expone el token ni el app secret: solo el resultado.
 */
import { sql } from "../db/client.js";
import { getChannelConfig } from "./channel.js";
import { getWa } from "../wa/client.js";

const GRAPH = "https://graph.facebook.com/v21.0";
const TIMEOUT_MS = 10_000;

export type CheckId = "token" | "phone" | "webhook" | "firma" | "entrante" | "vendedor";
export type CheckEstado = "ok" | "falta" | "error";

export interface ChannelCheck {
  id: CheckId;
  /** Título del paso tal como se ve en el hub. */
  label: string;
  estado: CheckEstado;
  /** Qué pasó, en una frase. */
  detalle: string;
  /** El dato confirmado por Meta (número real, nombre verificado…). */
  dato?: string;
  /** Qué hacer para arreglarlo. Solo cuando estado ≠ ok. */
  ayuda?: string;
}

export interface ChannelDiagnosis {
  /** true solo si los chequeos imprescindibles pasaron. */
  listo: boolean;
  checks: ChannelCheck[];
  /** URL que hay que pegar en Meta → Configuración → Webhook. */
  webhookUrl: string;
  /** Verify token que hay que pegar junto a la URL. */
  verifyToken: string;
}

interface GraphResult<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string; code?: number; type?: string };
  /** La petición ni siquiera salió (DNS, timeout, red). */
  red?: string;
}

async function graphGet<T>(path: string, token: string): Promise<GraphResult<T>> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${GRAPH}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: control.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as T & {
      error?: { message?: string; code?: number; type?: string };
    };
    if (!response.ok) return { ok: false, error: payload.error ?? {} };
    return { ok: true, data: payload };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, red: /abort/i.test(msg) ? "Meta no respondió a tiempo" : msg };
  } finally {
    clearTimeout(timer);
  }
}

/** Errores de Meta traducidos a algo que se pueda accionar sin leer docs. */
function explicarToken(error: GraphResult<unknown>["error"]): string {
  if (error?.code === 190) {
    return "El token caducó o fue revocado. Genera uno nuevo en Meta (System User → Generate token) y pégalo otra vez.";
  }
  if (error?.code === 102 || error?.type === "OAuthException") {
    return "Meta rechazó el token. Revisa que lo copiaste completo, sin espacios ni saltos de línea.";
  }
  return error?.message ?? "Meta rechazó la petición.";
}

async function ultimoEntrante(): Promise<Date | null> {
  try {
    const [row] = await sql<{ at: Date | null }[]>`
      select max(created_at) as at from messages where direction = 'inbound'
    `;
    return row?.at ?? null;
  } catch {
    return null;
  }
}

function hace(fecha: Date): string {
  const minutos = Math.floor((Date.now() - fecha.getTime()) / 60_000);
  if (minutos < 1) return "hace menos de un minuto";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} días`;
}

/**
 * Corre todos los chequeos. `baseUrl` es el origen público de ESTE servidor
 * (lo arma el router desde la petición) para poder mostrar la URL del webhook.
 */
export async function diagnoseChannel(baseUrl: string): Promise<ChannelDiagnosis> {
  const channel = await getChannelConfig();
  const checks: ChannelCheck[] = [];

  // ── 1. Token ───────────────────────────────────────────────────────────────
  let tokenValido = false;
  if (!channel.token) {
    checks.push({
      id: "token",
      label: "Token de acceso",
      estado: "falta",
      detalle: "Todavía no hay token.",
      ayuda: "En Meta → Usuarios del sistema, genera un token permanente con los permisos whatsapp_business_messaging y whatsapp_business_management, y pégalo arriba.",
    });
  } else {
    const me = await graphGet<{ id: string; name?: string }>("me?fields=id,name", channel.token);
    if (me.ok) {
      tokenValido = true;
      checks.push({
        id: "token",
        label: "Token de acceso",
        estado: "ok",
        detalle: "Meta acepta el token.",
        dato: me.data?.name ? `${me.data.name} · id ${me.data?.id}` : `id ${me.data?.id}`,
      });
    } else {
      checks.push({
        id: "token",
        label: "Token de acceso",
        estado: "error",
        detalle: me.red ?? "Meta rechazó el token.",
        ayuda: me.red ? "Reintenta en unos segundos." : explicarToken(me.error),
      });
    }
  }

  // ── 2. Número (Phone Number ID) ────────────────────────────────────────────
  if (!channel.phoneId) {
    checks.push({
      id: "phone",
      label: "Número de WhatsApp",
      estado: "falta",
      detalle: "Falta el Phone Number ID.",
      ayuda: "Meta → WhatsApp → Configuración de la API: copia el «Identificador del número de teléfono» (son solo dígitos, no el número con +).",
    });
  } else if (!tokenValido) {
    checks.push({
      id: "phone",
      label: "Número de WhatsApp",
      estado: "falta",
      detalle: "No se puede comprobar sin un token válido.",
      ayuda: "Arregla el token primero: el número se verifica con él.",
    });
  } else {
    const phone = await graphGet<{
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
    }>(
      `${channel.phoneId}?fields=display_phone_number,verified_name,quality_rating`,
      channel.token,
    );
    if (phone.ok) {
      const partes = [
        phone.data?.display_phone_number,
        phone.data?.verified_name,
        phone.data?.quality_rating ? `calidad ${phone.data.quality_rating}` : null,
      ].filter(Boolean);
      checks.push({
        id: "phone",
        label: "Número de WhatsApp",
        estado: "ok",
        detalle: "El token tiene acceso a este número.",
        dato: partes.join(" · "),
      });
    } else {
      checks.push({
        id: "phone",
        label: "Número de WhatsApp",
        estado: "error",
        detalle: phone.red ?? "Meta no reconoce ese Phone Number ID.",
        ayuda:
          phone.error?.code === 100
            ? "Ese identificador no existe o el token pertenece a otra cuenta. Copia de nuevo el «Identificador del número de teléfono» desde Meta."
            : explicarToken(phone.error),
      });
    }
  }

  // ── 3. Webhook (verify token + app secret montados) ────────────────────────
  const webhookUrl = `${baseUrl}/webhook`;
  const faltantes = [
    !channel.verifyToken ? "el verify token" : null,
    !channel.appSecret ? "el app secret" : null,
    !channel.token ? "el token" : null,
  ].filter(Boolean);
  if (faltantes.length) {
    checks.push({
      id: "webhook",
      label: "Webhook",
      estado: "falta",
      detalle: `El webhook está apagado: falta ${faltantes.join(" y ")}.`,
      ayuda: "Con los tres campos guardados, el webhook se enciende solo — no hace falta redeploy.",
    });
  } else if (getWa()) {
    checks.push({
      id: "webhook",
      label: "Webhook",
      estado: "ok",
      detalle: "El webhook está activo y listo para el handshake de Meta.",
      dato: webhookUrl,
    });
  } else {
    checks.push({
      id: "webhook",
      label: "Webhook",
      estado: "error",
      detalle: "Los campos están, pero el webhook no se pudo montar.",
      ayuda: "Vuelve a guardar el canal. Si sigue igual, revisa los logs del servidor.",
    });
  }

  // ── 4. App secret ──────────────────────────────────────────────────────────
  checks.push(
    channel.appSecret
      ? {
          id: "firma",
          label: "Firma de los eventos",
          estado: "ok",
          detalle: "Hay app secret: cada evento de Meta se valida antes de procesarse.",
        }
      : {
          id: "firma",
          label: "Firma de los eventos",
          estado: "falta",
          detalle: "Sin app secret no se puede comprobar que los eventos vengan de Meta.",
          ayuda: "Meta → Configuración de la app → Básica → «Clave secreta de la app».",
        },
  );

  // ── 5. ¿Meta está entregando de verdad? ────────────────────────────────────
  const entrante = await ultimoEntrante();
  checks.push(
    entrante
      ? {
          id: "entrante",
          label: "Mensajes entrando",
          estado: "ok",
          detalle: `Último mensaje recibido ${hace(entrante)}.`,
          dato: entrante.toISOString(),
        }
      : {
          id: "entrante",
          label: "Mensajes entrando",
          estado: "falta",
          detalle: "Todavía no ha llegado ningún mensaje por el webhook.",
          ayuda: "Escríbele al número del negocio desde tu celular y vuelve a revisar. Es la única prueba de que Meta está entregando aquí.",
        },
  );

  // ── 6. Vendedor que recibe alertas ─────────────────────────────────────────
  checks.push(
    channel.sellerPhone
      ? {
          id: "vendedor",
          label: "Alertas al vendedor",
          estado: "ok",
          detalle: "Las alertas de handoff tienen a dónde llegar.",
          dato: channel.sellerPhone,
        }
      : {
          id: "vendedor",
          label: "Alertas al vendedor",
          estado: "falta",
          detalle: "Nadie recibe los avisos cuando el bot pide ayuda humana.",
          ayuda: "Pon el número del asesor en formato internacional sin «+» (ej. 5939…).",
        },
  );

  // Imprescindibles para operar: token, número y webhook.
  const criticos: CheckId[] = ["token", "phone", "webhook"];
  const listo = checks
    .filter((check) => criticos.includes(check.id))
    .every((check) => check.estado === "ok");

  return { listo, checks, webhookUrl, verifyToken: channel.verifyToken };
}
