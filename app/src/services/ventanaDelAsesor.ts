/**
 * LA VENTANA DE 24 H DEL ASESOR, VISTA DESDE LA APP (22-nov-2026).
 *
 * Meta solo deja mandarle avisos por WhatsApp a un asesor que le escribió al
 * número del bot en las últimas 24 h (ver `advisorWindow.ts`). Hasta hoy eso se
 * avisaba por WhatsApp a los demás asesores. Manuel pidió que la app se lo diga
 * al propio asesor al abrirla, con un botón que abre el WhatsApp del negocio
 * con el mensaje ya escrito (`/asesor …`). El bot reconoce ese mensaje, reabre
 * la ventana y le contesta que ya recibe todo.
 */
import { config } from "../config.js";
import { sql } from "../db/client.js";
import { getChannelConfig } from "./channel.js";
import { tel9 } from "./fuentes/contifico.js";
import { telefonoDelUsuario } from "./avisosEnLaApp.js";

/** Con cuánta anticipación la app avisa que se va a cerrar. Igual que `advisorWindow`. */
const AVISAR_ANTES_MS = 3 * 60 * 60 * 1000;

/** El comando que el asesor manda desde su WhatsApp. */
export const COMANDO_ASESOR = "/asesor";

/** ¿Este texto es el comando del asesor? «/asesor», «/Asesor hola, soy Jenny…». */
export function esComandoAsesor(texto: string): boolean {
  return /^\s*\/asesor\b/i.test(texto);
}

/** Lo que la app deja escrito en WhatsApp. El nombre ayuda a reconocerlo en el chat del bot. */
export function mensajeParaReabrir(nombre: string): string {
  const primero = nombre.trim().split(/\s+/)[0] || "";
  return `${COMANDO_ASESOR} Hola, soy ${primero || "el asesor"} y quiero recibir los avisos del bot`.replace(/\s+/g, " ");
}

/** Lo que el bot le contesta al asesor cuando manda el comando. */
export function respuestaAlAsesor(nombre: string, avisosPendientes: number): string {
  const primero = nombre.trim().split(/\s+/)[0] || "";
  return [
    `Hola${primero ? ` ${primero}` : ""} ✅ Tu WhatsApp quedó conectado.`,
    "Durante las próximas 24 h te llegan aquí todos los avisos de clientes del bot.",
    avisosPendientes > 0
      ? `Arriba te mandé ${avisosPendientes === 1 ? "el aviso que tenías pendiente" : `los ${avisosPendientes} avisos que tenías pendientes`}.`
      : "",
    "Cuando se esté por cerrar, la app te avisa para renovarlo.",
  ].filter(Boolean).join("\n");
}

export type EstadoVentana = "abierta" | "por_vencer" | "cerrada" | "nunca";

/** Decisión pura, con el reloj fijo en las pruebas. */
export function estadoDeVentana(ventanaHasta: Date | null, ahora = new Date()): EstadoVentana {
  if (!ventanaHasta) return "nunca";
  const restante = ventanaHasta.getTime() - ahora.getTime();
  if (restante <= 0) return "cerrada";
  if (restante <= AVISAR_ANTES_MS) return "por_vencer";
  return "abierta";
}

// ── El número del bot ────────────────────────────────────────────────────────

let numeroGuardado: { numero: string | null; at: number } | null = null;

/**
 * El número de WhatsApp del bot, en dígitos, para armar el enlace `wa.me`. Se le
 * pregunta a Meta (el `telefono` del perfil del negocio es el del local, no el
 * del bot). Una hora en memoria; null si Meta no contesta: la app explica a mano.
 */
export async function numeroDelBot(): Promise<string | null> {
  if (numeroGuardado && Date.now() - numeroGuardado.at < 60 * 60 * 1000) return numeroGuardado.numero;
  let numero: string | null = null;
  try {
    const ch = await getChannelConfig();
    if (ch.token && ch.phoneId) {
      const r = await fetch(`${config.whatsapp.graphBaseUrl}/${ch.phoneId}?fields=display_phone_number`, {
        headers: { Authorization: `Bearer ${ch.token}` },
        signal: AbortSignal.timeout(8_000),
      });
      const data = (await r.json().catch(() => ({}))) as { display_phone_number?: string };
      const digitos = String(data.display_phone_number ?? "").replace(/\D/g, "");
      numero = digitos.length >= 9 ? digitos : null;
    }
  } catch (error) {
    console.warn("⚠️ No se pudo leer el número del bot:", error instanceof Error ? error.message : error);
  }
  numeroGuardado = { numero, at: Date.now() };
  return numero;
}

export function olvidarNumeroDelBot(): void {
  numeroGuardado = null;
}

// ── Quién es este usuario en la lista de asesores ────────────────────────────

interface FilaAsesor {
  nombre: string;
  telefono: string;
  ventana_hasta: Date | null;
}

/**
 * El asesor (fila de `advisors`) que corresponde a un usuario del panel: el
 * número que eligió al activar las notificaciones o, si no, el único asesor
 * activo cuyo primer nombre coincide con el suyo. Ambiguo o sin coincidencia:
 * null (mejor no avisar que avisarle a otro).
 */
export async function asesorDelUsuario(usuario: { id: string; nombre: string }): Promise<FilaAsesor | null> {
  const filas = await sql<FilaAsesor[]>`
    select nombre, telefono, ventana_hasta from advisors where active and telefono <> ''
  `;
  const elegido = await telefonoDelUsuario(usuario.id).catch(() => null);
  if (elegido) {
    const llave = tel9(elegido);
    const porNumero = filas.find((f) => tel9(f.telefono) === llave);
    if (porNumero) return porNumero;
  }
  const primero = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/)[0] ?? "";
  const mio = primero(usuario.nombre);
  if (!mio) return null;
  const coinciden = filas.filter((f) => primero(f.nombre) === mio);
  return coinciden.length === 1 ? coinciden[0] : null;
}

export interface MiVentana {
  /** null = este usuario no está en la lista de asesores que reciben avisos. */
  asesor: { nombre: string; telefono: string } | null;
  estado: EstadoVentana | null;
  ventanaHasta: string | null;
  /** Dígitos del WhatsApp del bot, para `https://wa.me/<numero>`. */
  numeroDelBot: string | null;
  /** Lo que queda escrito en WhatsApp al tocar el botón. */
  mensaje: string;
}

export async function miVentana(usuario: { id: string; nombre: string } | null, ahora = new Date()): Promise<MiVentana> {
  const asesor = usuario ? await asesorDelUsuario(usuario) : null;
  return {
    asesor: asesor ? { nombre: asesor.nombre, telefono: asesor.telefono } : null,
    estado: asesor ? estadoDeVentana(asesor.ventana_hasta, ahora) : null,
    ventanaHasta: asesor?.ventana_hasta?.toISOString() ?? null,
    numeroDelBot: asesor ? await numeroDelBot() : null,
    mensaje: mensajeParaReabrir(asesor?.nombre ?? usuario?.nombre ?? ""),
  };
}

/** El nombre del asesor dueño de este número, o null si no es de ningún asesor. */
export async function nombreDelAsesor(telefono: string): Promise<string | null> {
  const llave = tel9(telefono);
  if (!llave) return null;
  const filas = await sql<{ nombre: string; telefono: string }[]>`select nombre, telefono from advisors where telefono <> ''`;
  return filas.find((f) => tel9(f.telefono) === llave)?.nombre ?? null;
}
