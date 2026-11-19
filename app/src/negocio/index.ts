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
import { MUNDILLANTAS } from "./negocios/mundillantas.js";
import { perfilDelServicio, validarIdentidades } from "./identidad.js";
import type { PerfilDeNegocio } from "./perfil.js";

export * from "./perfil.js";

const PERFILES: Record<string, PerfilDeNegocio> = {
  [DEPOT.id]: DEPOT,
  [EJEMPLO.id]: EJEMPLO,
  [MUNDILLANTAS.id]: MUNDILLANTAS,
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

/**
 * Un perfil con identidades ambiguas no puede arrancar: si un local está en
 * dos marcas (o en ninguna), no se sabe con cuál cotizarle al cliente. Mejor
 * caído que con el logo equivocado — mismo criterio que el NEGOCIO mal escrito.
 */
for (const perfil of Object.values(PERFILES)) {
  validarIdentidades(perfil);
  // Con una marca por servicio, cada marca tiene que poder levantar el suyo:
  // una identidad por defecto mal escrita no espera al deploy para fallar.
  if (perfil.identidadPorDefecto) perfilDelServicio(perfil);
}

/**
 * El perfil vivo. Se resuelve una vez, al cargar el módulo. Un negocio con una
 * marca por servicio (Competimotor / Mundillantas) queda reducido a la marca de
 * `IDENTIDAD` —o a la de por defecto—: ver `perfilDelServicio`.
 */
export const negocio: PerfilDeNegocio = perfilDelServicio(elegirPerfil(), process.env.IDENTIDAD);
