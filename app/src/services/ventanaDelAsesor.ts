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
import { ligarSuscripcionesSinNumero, telefonoDelUsuario } from "./avisosEnLaApp.js";

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

/** «Carlos André» → ["carlos", "andre"]: sin tildes, en minúsculas, palabra por palabra. */
const palabras = (s: string): string[] =>
  s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(Boolean);

/**
 * Qué asesor de la lista es este nombre de usuario. Se prueba de lo más seguro a
 * lo menos, y en cada paso solo vale si queda UNO:
 *   1. el nombre completo igual («Carlos Romero» = «Carlos Romero»);
 *   2. todas las palabras del usuario están en el nombre del asesor
 *      («Jenny Paz» → «Jenny Paz Alvarez»);
 *   3. el primer nombre («Moroni» → «Moroni Pazmiño»).
 *
 * Antes solo existía el paso 3. En Competimotor hay tres asesores «Carlos» y
 * Carlos Romero activó la app sin quedar ligado a su número: el teléfono quedó
 * registrado pero nunca le llegó un aviso (Manuel, 25-nov-2026).
 */
export function elegirAsesorPorNombre<T extends { nombre: string }>(nombre: string, filas: readonly T[]): T | null {
  const mio = palabras(nombre);
  if (!mio.length) return null;
  const unico = (lista: T[]) => (lista.length === 1 ? lista[0] : null);
  const exacto = unico(filas.filter((f) => palabras(f.nombre).join(" ") === mio.join(" ")));
  if (exacto) return exacto;
  if (mio.length > 1) {
    const contiene = unico(filas.filter((f) => { const suyas = palabras(f.nombre); return mio.every((p) => suyas.includes(p)); }));
    if (contiene) return contiene;
  }
  return unico(filas.filter((f) => palabras(f.nombre)[0] === mio[0]));
}

/**
 * El asesor (fila de `advisors`) que corresponde a un usuario del panel: el
 * número que eligió al activar las notificaciones o, si no, el que se reconoce
 * por su nombre (ver `elegirAsesorPorNombre`). Ambiguo o sin coincidencia:
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
  return elegirAsesorPorNombre(usuario.nombre, filas);
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
  // Se llama cada vez que se abre la app: un teléfono que se activó sin quedar
  // ligado a su asesor se arregla solo en la próxima apertura.
  if (usuario && asesor) await ligarSuscripcionesSinNumero(usuario.id, asesor.telefono).catch(() => 0);
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
