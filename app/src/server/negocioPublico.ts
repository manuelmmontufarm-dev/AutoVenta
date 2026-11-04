/**
 * `GET /api/negocio` — quién es el negocio de ESTA instancia, para el panel.
 *
 * El panel tenía a Depot horneado en el build (`hub/src/data/types.ts`
 * `LOCALES`, el título, el teléfono del chat): con un segundo cliente, el panel
 * de Mundillantas diría Depot. Esto le da lo que necesita para pintarse con el
 * perfil vivo, con la misma credencial que el resto de `/api`.
 *
 * Los valores van TAL CUAL, incluidos los `[PENDIENTE]`: el panel es para el
 * dueño y para nosotros, no para el cliente final, y ver qué falta es
 * justamente su trabajo. `faltantes` los lista con una ruta legible.
 */
import { COMPACT_PLAYBOOK } from "../agent/compactPlaybook.js";
import { negocio, type PerfilDeNegocio } from "../negocio/index.js";
import { faltantesDelPerfil, identidades } from "../negocio/identidad.js";

/** El contrato exacto de MULTICLIENTE.md §3.2 — otro sprint (el panel) lo consume. */
export interface NegocioPublico {
  id: string;
  nombre: string;
  ciudad: string;
  telefono: string;
  identidades: Array<{ id: string; nombre: string; locales: string[] }>;
  locales: Array<{ slug: string; nombre: string; nombreCorto: string; claveHorario: string }>;
  marcas: string[];
  vendedor: { nombre: string };
  playbook: string;
  faltantes: string[];
}

/**
 * Puro: arma la respuesta desde un perfil y el playbook. `faltantes` es por
 * ahora solo lo del perfil; el Sprint Final le suma política y assets.
 */
export function armarNegocioPublico(perfil: PerfilDeNegocio, playbook: string): NegocioPublico {
  return {
    id: perfil.id,
    nombre: perfil.nombre,
    ciudad: perfil.ciudad,
    telefono: perfil.telefono,
    identidades: identidades(perfil).map(({ id, nombre, locales }) => ({ id, nombre, locales: [...locales] })),
    locales: perfil.locales.map(({ slug, nombre, nombreCorto, claveHorario }) => ({
      slug, nombre, nombreCorto, claveHorario,
    })),
    marcas: [...perfil.marcas],
    vendedor: { nombre: perfil.vendedor.nombre },
    playbook,
    faltantes: faltantesDelPerfil(perfil),
  };
}

/** La respuesta de la instancia viva: el perfil de `NEGOCIO` y su playbook. */
export function negocioPublico(): NegocioPublico {
  return armarNegocioPublico(negocio, COMPACT_PLAYBOOK);
}
