/**
 * PLANTILLA DE POLÍTICA COMERCIAL — copiá este archivo, no lo edites.
 *
 * Acompaña a `negocios/ejemplo.ts`: una llantera genérica sin cuotas, sin
 * descuento por efectivo y sin beneficio de redes, que es el punto de partida
 * honesto para un cliente del que todavía no se confirmó nada. Lo que hay que
 * conseguir del cliente está comentado campo por campo en
 * `negocio/politica.ts`.
 */
import type { PoliticaComercial } from "../politica.js";

export const POLITICA_EJEMPLO: PoliticaComercial = {
  formasDePago: ["efectivo", "tarjeta", "transferencia"],
  cuotasSinIntereses: null,
  descuentoEnEfectivo: null,
  beneficioDeRedes: null,
  vendeADistancia: true,
  serviciosQueOfrece: [],
  gentilicio: "guayaquileño",
  variedadDeEspanol: "Español natural de Ecuador",
  juegoCompleto: 4,
  escalonPorPrecio: false,
  productosQueDerivaAlAsesor: [],
  asesorEnReglas: "el asesor",
};
