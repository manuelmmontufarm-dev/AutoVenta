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
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPACT_PLAYBOOK } from "../agent/compactPlaybook.js";
import { negocio, type PerfilDeNegocio } from "../negocio/index.js";
import { faltantesDelPerfil, identidades } from "../negocio/identidad.js";
import { faltantesDeLaPolitica, politica } from "../negocio/politica.js";

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

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");

/**
 * Los archivos de marca que faltan en `assets/<id>/` (R-45): el logo de cada
 * identidad, con `logo-blanco.png` como respaldo válido (Depot vive de él).
 * La escalera, el conocimiento de marcas y los tipos no se listan: tienen
 * respaldo común y los clientes nuevos ya traen los suyos commiteados.
 */
export function faltantesDeAssets(
  perfil: PerfilDeNegocio,
  existe: (ruta: string) => boolean = existsSync,
): string[] {
  const carpeta = path.join(ASSETS, perfil.id);
  const hayRespaldo = existe(path.join(carpeta, "logo-blanco.png"));
  const faltan: string[] = [];
  for (const identidad of identidades(perfil)) {
    if (!hayRespaldo && !existe(path.join(carpeta, `logo-${identidad.id}.png`))) {
      faltan.push(`assets/${perfil.id}/logo-${identidad.id}.png (logo de ${identidad.nombre} para las piezas)`);
    }
  }
  return faltan;
}

/**
 * Puro salvo `faltantesExtra`: arma la respuesta desde un perfil y el playbook.
 * `faltantes` = perfil ∪ política ∪ assets (R-45).
 */
export function armarNegocioPublico(
  perfil: PerfilDeNegocio,
  playbook: string,
  faltantesExtra: string[] = [],
): NegocioPublico {
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
    faltantes: [...faltantesDelPerfil(perfil), ...faltantesExtra],
  };
}

/** La respuesta de la instancia viva: perfil, política y assets de `NEGOCIO`. */
export function negocioPublico(): NegocioPublico {
  return armarNegocioPublico(negocio, COMPACT_PLAYBOOK, [
    ...faltantesDeLaPolitica(politica),
    ...faltantesDeAssets(negocio),
  ]);
}
