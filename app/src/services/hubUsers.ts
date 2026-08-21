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
import { z } from "zod";
import { sql } from "../db/client.js";
import type { Permisos, Rol, Usuario } from "../server/auth.js";

export interface UsuarioHub extends Usuario {
  permisos: Permisos;
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
});

const ListaSchema = z.array(UsuarioHubSchema).min(1).max(30)
  .refine((lista) => new Set(lista.map((u) => u.id)).size === lista.length, "Hay usernames repetidos")
  .refine((lista) => lista.some((u) => u.rol === "admin"), "Tiene que quedar al menos un administrador");

/** Los cuatro de la reunión del 14-ago: la semilla y el respaldo si la DB calla. */
const SEMILLA: UsuarioHub[] = [
  { id: "manuel", nombre: "Manuel Montufar", rol: "admin", permisos: { ...PERMISOS_COMPLETOS } },
  { id: "andres", nombre: "Andres Tamayo", rol: "admin", permisos: { ...PERMISOS_COMPLETOS } },
  { id: "joaquin", nombre: "Joaquin Tamayo", rol: "admin", permisos: { ...PERMISOS_COMPLETOS } },
  { id: "asesor", nombre: "Asesor", rol: "asesor", permisos: { ...PERMISOS_COMPLETOS } },
];

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
      if (parsed.success) espejo = parsed.data;
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
  const cambios = z.object({
    nombre: UsuarioHubSchema.shape.nombre,
    rol: UsuarioHubSchema.shape.rol,
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

/** Solo para pruebas: vuelve a la semilla sin tocar la base. */
export function reiniciarUsuariosHub(): void {
  espejo = SEMILLA.map((u) => ({ ...u, permisos: { ...u.permisos } }));
  espejoAt = Date.now();
}
