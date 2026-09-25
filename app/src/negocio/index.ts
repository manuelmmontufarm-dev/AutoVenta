/**
 * QUÉ NEGOCIO ATIENDE ESTA INSTANCIA.
 *
 * Cada cliente es su propio servicio con su propia base, así que el perfil se
 * elige una vez al arrancar con la variable `NEGOCIO` y no cambia en caliente.
 * Sin esa variable es Depot: es lo que hay en producción y lo que tiene que
 * seguir saliendo si nadie configura nada.
 *
 * Para dar de alta un cliente nuevo: copiá `negocios/ejemplo.ts`, cambiale los
 * valores, agregalo a `PERFILES` y desplegá su servicio con `NEGOCIO=<id>`.
 */
import { DEPOT } from "./negocios/depot.js";
import { EJEMPLO } from "./negocios/ejemplo.js";
import type { PerfilDeNegocio } from "./perfil.js";

export * from "./perfil.js";

const PERFILES: Record<string, PerfilDeNegocio> = {
  [DEPOT.id]: DEPOT,
  [EJEMPLO.id]: EJEMPLO,
};

function elegirPerfil(): PerfilDeNegocio {
  const pedido = (process.env.NEGOCIO ?? "").trim();
  if (!pedido) return DEPOT;
  const perfil = PERFILES[pedido];
  // UN NOMBRE MAL ESCRITO NO PUEDE ATENDER CLIENTES COMO OTRO NEGOCIO. Caer en
  // Depot por defecto acá sería mandarle a los clientes de otro los locales y
  // los teléfonos de Depot, y nadie se enteraría hasta que alguien se aparezca
  // en Cumbayá. Que no arranque es el resultado barato.
  if (!perfil) {
    throw new Error(
      `NEGOCIO="${pedido}" no existe. Perfiles disponibles: ${Object.keys(PERFILES).join(", ")}.`,
    );
  }
  return perfil;
}

/** El perfil vivo. Se resuelve una vez, al cargar el módulo. */
export const negocio: PerfilDeNegocio = elegirPerfil();
