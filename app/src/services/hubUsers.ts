/**
 * Usuarios del hub, editables desde Ajustes (reunión con Andrés, 19-ago).
 *
 * Antes vivían en código (`auth.ts`): agregar a alguien era un deploy. Ahora la
 * lista vive en `settings` (key `hub_users`) y el nivel más alto la administra
 * desde el panel: elige el username (es lo que sale en el desplegable del
 * login), el nivel, y qué pantallas del dashboard ve cada uno.
 *
 * La verificación de tokens es SÍNCRONA (`verificarToken` corre en el gate de
 * cada petición), así que aquí se mantiene un espejo en memoria: arranca con la
 * semilla de siempre, se refresca de la base al crear el router y tras cada
 * cambio, y si la base no responde el login sigue funcionando con lo último que
 * se supo. Un proceso solo (Railway), así que el espejo no se desincroniza.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sql } from "../db/client.js";
import type { Permisos, Rol, Usuario } from "../server/auth.js";

export interface UsuarioHub extends Usuario {
  permisos: Permisos;
  /** Para avisos del bot (nada promocional) y para recuperar la clave. */
  email: string | null;
  /** true = entra con la clave compartida de siempre (los cuatro originales). */
  claveCompartida: boolean;
  /** `salt:hash` (scrypt) de la clave propia. null = todavía no la creó. */
  pinHash: string | null;
}

/**
 * En qué punto del ciclo de clave está la cuenta. Lo pinta Ajustes → Usuarios
 * y lo usa el login para saber si toca el formulario de activación.
 *
 *  · `compartida` — los cuatro de siempre, con la clave común (decisión 14-ago).
 *  · `pendiente`  — creado desde el panel; su PRIMER ingreso es crear clave+email.
 *  · `propia`     — ya creó su clave; solo esa clave abre.
 */
export type EstadoClave = "compartida" | "propia" | "pendiente";

export function estadoClave(u: Pick<UsuarioHub, "claveCompartida" | "pinHash">): EstadoClave {
  if (u.pinHash) return "propia";
  return u.claveCompartida ? "compartida" : "pendiente";
}

const PermisosSchema = z.object({
  verInbox: z.boolean().default(true),
  verKanban: z.boolean().default(true),
  verOportunidades: z.boolean().default(true),
  verMetricas: z.boolean().default(true),
  verFinanzas: z.boolean().default(true),
  usarCotizador: z.boolean().default(true),
  verAjustes: z.boolean().default(true),
  verErrores: z.boolean().default(true),
});

export const PERMISOS_COMPLETOS: Permisos = { verInbox: true, verKanban: true, verOportunidades: true, verMetricas: true, verFinanzas: true, usarCotizador: true, verAjustes: true, verErrores: true };

/**
 * El id es el username del desplegable: minúsculas y sin espacios para que
 * nadie cree «Manuel » y « manuel» como dos personas distintas.
 */
const UsuarioHubSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,29}$/, "Username: minúsculas, números, punto o guión (2-30)"),
  nombre: z.string().trim().min(1).max(60),
  rol: z.enum(["admin", "asesor"]),
  permisos: PermisosSchema.default(() => ({ ...PERMISOS_COMPLETOS })),
  email: z.string().trim().toLowerCase().email("Email inválido").max(120).nullable().default(null),
  claveCompartida: z.boolean().default(false),
  pinHash: z.string().max(300).nullable().default(null),
});

const ListaSchema = z.array(UsuarioHubSchema).min(1).max(30)
  .refine((lista) => new Set(lista.map((u) => u.id)).size === lista.length, "Hay usernames repetidos")
  .refine((lista) => lista.some((u) => u.rol === "admin"), "Tiene que quedar al menos un administrador");

/** Los cuatro de la reunión del 14-ago: la semilla y el respaldo si la DB calla. */
const BASE = { permisos: PERMISOS_COMPLETOS, email: null, claveCompartida: true, pinHash: null };
const SEMILLA: UsuarioHub[] = [
  { id: "manuel", nombre: "Manuel Montufar", rol: "admin", ...BASE, permisos: { ...PERMISOS_COMPLETOS } },
  { id: "andres", nombre: "Andres Tamayo", rol: "admin", ...BASE, permisos: { ...PERMISOS_COMPLETOS } },
  { id: "joaquin", nombre: "Joaquin Tamayo", rol: "admin", ...BASE, permisos: { ...PERMISOS_COMPLETOS } },
  { id: "asesor", nombre: "Asesor", rol: "asesor", ...BASE, permisos: { ...PERMISOS_COMPLETOS } },
];
const IDS_SEMILLA = new Set(SEMILLA.map((u) => u.id));

let espejo: UsuarioHub[] = SEMILLA.map((u) => ({ ...u, permisos: { ...u.permisos } }));
let espejoAt = 0;
const ESPEJO_TTL_MS = 30_000;

function clonar(lista: UsuarioHub[]): UsuarioHub[] {
  return lista.map((u) => ({ ...u, permisos: { ...u.permisos } }));
}

/** Trae la lista guardada. Si nunca se guardó, deja la semilla. */
export async function cargarUsuariosHub(): Promise<void> {
  try {
    const [row] = await sql<{ value: unknown }[]>`select value from settings where key = 'hub_users'`;
    if (row) {
      const parsed = ListaSchema.safeParse(row.value);
      // Registros guardados ANTES de que existiera la clave por usuario no
      // traen `claveCompartida`: a los cuatro originales se les repone en true
      // para no dejarlos fuera con una clave que nunca crearon.
      if (parsed.success) {
        espejo = parsed.data.map((u) =>
          IDS_SEMILLA.has(u.id) && !u.pinHash ? { ...u, claveCompartida: true } : u);
      }
    }
    espejoAt = Date.now();
  } catch (error) {
    // Sin base no se rompe el login: se queda lo último que se supo.
    console.error("⚠️ No se pudo leer hub_users:", error instanceof Error ? error.message : error);
  }
}

/**
 * Lectura síncrona para el gate. Si el espejo está viejo dispara un refresco de
 * fondo — el gate no puede esperar a la base en cada petición.
 */
export function usuariosHub(): UsuarioHub[] {
  if (Date.now() - espejoAt > ESPEJO_TTL_MS) {
    espejoAt = Date.now(); // evita disparar N refrescos en ráfaga
    void cargarUsuariosHub();
  }
  return clonar(espejo);
}

export function usuarioHubPorId(id: string): UsuarioHub | null {
  const u = espejo.find((x) => x.id === id);
  return u ? { ...u, permisos: { ...u.permisos } } : null;
}

async function guardar(lista: UsuarioHub[]): Promise<UsuarioHub[]> {
  const valida = ListaSchema.parse(lista);
  await sql`
    insert into settings (key, value) values ('hub_users', ${sql.json(valida)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  espejo = valida;
  espejoAt = Date.now();
  return clonar(valida);
}

export async function crearUsuarioHub(input: unknown): Promise<UsuarioHub> {
  const nuevo = UsuarioHubSchema.parse(input);
  await cargarUsuariosHub();
  if (espejo.some((u) => u.id === nuevo.id)) {
    throw new Error(`El username «${nuevo.id}» ya existe`);
  }
  await guardar([...espejo, nuevo]);
  return { ...nuevo, permisos: { ...nuevo.permisos } };
}

export async function actualizarUsuarioHub(id: string, patch: unknown): Promise<UsuarioHub> {
  await cargarUsuariosHub();
  const actual = espejo.find((u) => u.id === id);
  if (!actual) throw new Error("Usuario no encontrado");
  // Schema propio para el patch: `PermisosSchema` a secas rellenaría con `true`
  // todo permiso no mencionado y un cambio de nombre re-encendería pantallas
  // que estaban apagadas a propósito.
  // La clave (pinHash / claveCompartida) NO se edita por aquí a propósito:
  // solo la activación la crea y solo el restablecimiento la borra.
  const cambios = z.object({
    nombre: UsuarioHubSchema.shape.nombre,
    rol: UsuarioHubSchema.shape.rol,
    email: UsuarioHubSchema.shape.email,
    permisos: PermisosSchema.partial(),
  }).partial().parse(patch ?? {});
  const editado: UsuarioHub = {
    ...actual,
    ...cambios,
    permisos: { ...actual.permisos, ...(cambios.permisos ?? {}) },
  };
  await guardar(espejo.map((u) => (u.id === id ? editado : u)));
  return { ...editado, permisos: { ...editado.permisos } };
}

export async function borrarUsuarioHub(id: string): Promise<void> {
  await cargarUsuariosHub();
  if (!espejo.some((u) => u.id === id)) throw new Error("Usuario no encontrado");
  // ListaSchema exige que quede al menos un admin: borrar al último lanza aquí
  // con su mensaje, antes de tocar la base.
  await guardar(espejo.filter((u) => u.id !== id));
}

// ── Clave propia ─────────────────────────────────────────────────────────────

/**
 * scrypt con sal aleatoria, guardado como `salt:hash` en hex. No es un PIN de
 * cuatro dígitos compartido: es la clave personal que cada usuario nuevo crea
 * en su primer ingreso.
 */
export function crearHashDeClave(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function claveCoincide(pin: string, guardado: string): boolean {
  const [saltHex, hashHex] = guardado.split(":");
  // Hex estricto y del largo exacto que escribe crearHashDeClave. Sin esto,
  // `Buffer.from("zz", "hex")` da un buffer VACÍO, scrypt con largo 0 devuelve
  // otro vacío, y timingSafeEqual de dos vacíos es true: un hash corrupto en la
  // base abriría la cuenta con cualquier clave.
  if (!/^[0-9a-f]{32}$/.test(saltHex ?? "") || !/^[0-9a-f]{64}$/.test(hashHex ?? "")) return false;
  try {
    const esperado = Buffer.from(hashHex, "hex");
    const calculado = scryptSync(pin, Buffer.from(saltHex, "hex"), esperado.length);
    return esperado.length === calculado.length && timingSafeEqual(esperado, calculado);
  } catch {
    return false;
  }
}

const ActivacionSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un email válido").max(120),
  pin: z.string().min(4, "La clave necesita al menos 4 caracteres").max(60),
});

/**
 * El primer ingreso de un usuario creado desde el panel: obligatorio crear su
 * clave y dejar su email (para avisos del bot y recuperación — nada
 * promocional). Solo aplica a cuentas pendientes: una cuenta con clave propia
 * o con la compartida no se puede "re-activar" y robar por esta puerta.
 */
export async function activarUsuarioHub(id: string, input: unknown): Promise<UsuarioHub> {
  const datos = ActivacionSchema.parse(input);
  await cargarUsuariosHub();
  const actual = espejo.find((u) => u.id === id);
  if (!actual) throw new Error("Usuario no encontrado");
  if (estadoClave(actual) !== "pendiente") throw new Error("Esta cuenta ya tiene su clave creada");
  const editado: UsuarioHub = { ...actual, email: datos.email, pinHash: crearHashDeClave(datos.pin) };
  await guardar(espejo.map((u) => (u.id === id ? editado : u)));
  return { ...editado, permisos: { ...editado.permisos } };
}

/**
 * «Se me olvidó la clave»: un administrador la restablece y la cuenta vuelve a
 * pendiente — la persona crea una nueva en su próximo ingreso. El email se
 * conserva.
 */
export async function restablecerClaveHub(id: string): Promise<UsuarioHub> {
  await cargarUsuariosHub();
  const actual = espejo.find((u) => u.id === id);
  if (!actual) throw new Error("Usuario no encontrado");
  if (actual.claveCompartida) throw new Error("Esta cuenta usa la clave compartida: no hay nada que restablecer");
  const editado: UsuarioHub = { ...actual, pinHash: null };
  await guardar(espejo.map((u) => (u.id === id ? editado : u)));
  return { ...editado, permisos: { ...editado.permisos } };
}

/** Solo para pruebas: fija la lista en memoria sin tocar la base. */
export function inyectarUsuariosHub(lista: UsuarioHub[]): void {
  espejo = lista.map((u) => ({ ...u, permisos: { ...u.permisos } }));
  espejoAt = Date.now();
}

/** Solo para pruebas: vuelve a la semilla sin tocar la base. */
export function reiniciarUsuariosHub(): void {
  espejo = SEMILLA.map((u) => ({ ...u, permisos: { ...u.permisos } }));
  espejoAt = Date.now();
}
