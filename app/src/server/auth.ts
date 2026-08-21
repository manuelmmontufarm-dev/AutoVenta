/**
 * Usuarios, sesiones y permisos del hub.
 *
 * Cuatro usuarios en código y una clave común (1234): es lo que pidió el
 * cliente en la reunión del 14-ago para esta fase. Lo importante de este
 * archivo no es la clave, es la ESTRUCTURA: cada petición autenticada llega al
 * router sabiendo QUIÉN la hace y QUÉ puede ver, para que diferenciar permisos
 * después sea cambiar un objeto y no reescribir el gate.
 *
 * El token es un HMAC firmado con la misma ADMIN_KEY: sin tabla nueva, sin
 * dependencias y sin estado en el servidor — se puede reiniciar el proceso sin
 * botar a nadie. La contrapartida es que no hay revocación individual: cambiar
 * ADMIN_KEY invalida todas las sesiones de golpe, que es justo lo que se quiere
 * si algo se filtra.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { PERMISOS_COMPLETOS, usuarioHubPorId, usuariosHub } from "../services/hubUsers.js";

export type Rol = "admin" | "asesor";

export interface Usuario {
  id: string;
  nombre: string;
  rol: Rol;
}

/**
 * La lista vive ahora en `settings` (key `hub_users`) y se administra desde
 * Ajustes → Usuarios; `hubUsers.ts` mantiene el espejo en memoria que este
 * archivo consulta de forma síncrona. La semilla sigue siendo los cuatro de la
 * reunión del 14-ago, así que sin base todo funciona igual que antes.
 */

/**
 * Clave única y temporal. Decisión explícita del cliente para esta fase: la
 * demo se hace con gente que no va a recordar cuatro claves distintas. No se
 * "endurece" por iniciativa propia — cuando lo pidan, esto pasa a un hash por
 * usuario en `settings` y `pinValido` recibe también el userId.
 */
const PIN = "1234";

const VIGENCIA_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

const ADMIN_KEY = process.env.ADMIN_KEY ?? "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Sin ADMIN_KEY no hay secreto con el que firmar. En local se usa uno fijo para
 * poder trabajar; en producción las sesiones quedan APAGADAS a propósito: un
 * secreto conocido y publicado en el repo sería una puerta abierta, y es
 * preferible que el panel siga cerrado (como ya lo estaba) a que se abra solo.
 */
const SECRETO = ADMIN_KEY || "autoventa-sesiones-dev";
export const SESIONES_HABILITADAS = Boolean(ADMIN_KEY) || !IS_PRODUCTION;

/**
 * Qué puede ver cada usuario. Desde la reunión con Andrés (19-ago) esto se
 * decide por USUARIO con los interruptores de Ajustes → Usuarios, no por rol:
 * `permisosDeUsuario` lee lo guardado y esta interfaz es solo la forma.
 */
export interface Permisos {
  verInbox: boolean;
  verKanban: boolean;
  verOportunidades: boolean;
  verMetricas: boolean;
  verFinanzas: boolean;
  usarCotizador: boolean;
  verAjustes: boolean;
  verErrores: boolean;
}

const TODO_PERMITIDO: Permisos = {
  verInbox: true,
  verKanban: true,
  verOportunidades: true,
  verMetricas: true,
  verFinanzas: true,
  usarCotizador: true,
  verAjustes: true,
  verErrores: true,
};

export function permisosDe(_rol: Rol): Permisos {
  return { ...TODO_PERMITIDO };
}

/**
 * Los permisos GUARDADOS de un usuario concreto. Si no está en la lista (lo
 * borraron con la sesión viva) devuelve todo permitido — da igual, porque
 * `verificarToken` ya lo rebotó antes de llegar aquí.
 */
export function permisosDeUsuario(id: string): Permisos {
  const usuario = usuarioHubPorId(id);
  return usuario ? { ...PERMISOS_COMPLETOS, ...usuario.permisos } : { ...TODO_PERMITIDO };
}

/** La lista para poblar el desplegable del login. Nunca incluye la clave. */
export function listarUsuarios(): Usuario[] {
  return usuariosHub().map(({ id, nombre, rol }) => ({ id, nombre, rol }));
}

export function usuarioPorId(id: string): Usuario | null {
  const usuario = usuarioHubPorId(id);
  return usuario ? { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol } : null;
}

/** Comparación en tiempo constante: la clave es corta y adivinable por medida. */
export function pinValido(pin: string): boolean {
  const a = Buffer.from(String(pin));
  const b = Buffer.from(PIN);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Freno de fuerza bruta
// ---------------------------------------------------------------------------

/**
 * Una clave de cuatro dígitos son 10.000 combinaciones: sin freno, `/auth/login`
 * se agota en segundos y el premio es el teléfono y el chat de todos los
 * clientes, mandar WhatsApp como Depot Tire y reescribir las credenciales del
 * canal. La clave la decidió el cliente y no se toca; lo que faltaba era esto.
 *
 * El contador va por USUARIO, no por IP, y es a propósito: el proceso corre
 * detrás del proxy de Railway sin `trust proxy`, así que `req.ip` es la misma
 * para todo el mundo y un límite por IP bloquearía a todos o a nadie. Con
 * cuatro usuarios, acotar por userId cierra el espacio de claves igual.
 *
 * En memoria: un reinicio lo limpia. Es aceptable — reiniciar el proceso no
 * está al alcance de quien prueba claves desde fuera.
 */
const TOLERANCIA = 5;
const ESPERA_BASE_MS = 2_000;
const ESPERA_MAXIMA_MS = 15 * 60_000;
const OLVIDO_MS = 60 * 60_000;

const intentos = new Map<string, { fallos: number; ultimo: number }>();

/** Milisegundos que faltan para poder volver a intentar. 0 = puede intentar. */
export function esperaDeLogin(userId: string, ahora = Date.now()): number {
  const registro = intentos.get(userId);
  if (!registro) return 0;
  if (ahora - registro.ultimo > OLVIDO_MS) {
    intentos.delete(userId);
    return 0;
  }
  if (registro.fallos < TOLERANCIA) return 0;
  const castigo = Math.min(ESPERA_BASE_MS * 2 ** (registro.fallos - TOLERANCIA), ESPERA_MAXIMA_MS);
  return Math.max(0, registro.ultimo + castigo - ahora);
}

export function registrarLoginFallido(userId: string, ahora = Date.now()): void {
  const registro = intentos.get(userId);
  const fallos = registro && ahora - registro.ultimo <= OLVIDO_MS ? registro.fallos + 1 : 1;
  intentos.set(userId, { fallos, ultimo: ahora });
}

export function registrarLoginBueno(userId: string): void {
  intentos.delete(userId);
}

/** Solo para pruebas: deja el freno como recién arrancado. */
export function reiniciarFrenoDeLogin(): void {
  intentos.clear();
}

function firmar(payload: string): string {
  return createHmac("sha256", SECRETO).update(payload).digest("base64url");
}

/** `userId.expiración.firma`. El userId no lleva puntos, así que parte limpio. */
export function crearToken(userId: string, ahora = Date.now()): string {
  const payload = `${userId}.${ahora + VIGENCIA_MS}`;
  return `${payload}.${firmar(payload)}`;
}

/**
 * Devuelve el usuario si el token está firmado por nosotros y no ha caducado.
 * Cualquier duda (formato raro, firma distinta, usuario borrado) es `null`: el
 * gate lo trata igual que si no hubiera mandado nada.
 */
export function verificarToken(token: string): Usuario | null {
  if (!SESIONES_HABILITADAS) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [userId, expiracion, firma] = partes;
  const esperada = Buffer.from(firmar(`${userId}.${expiracion}`));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
    return null;
  }
  const vence = Number(expiracion);
  if (!Number.isFinite(vence) || vence <= Date.now()) return null;
  return usuarioPorId(userId);
}

/** El token del header `Authorization: Bearer …`, si viene bien formado. */
export function tokenDelHeader(authorization: string | undefined): string | null {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Quién hizo la petición. Ausente cuando entró con `x-admin-key`. */
      usuario?: Usuario;
    }
  }
}
