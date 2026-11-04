/**
 * LA POLÍTICA COMERCIAL DE MUNDILLANTAS / COMPETIMOTOR (Santo Domingo).
 *
 * Solo lo confirmado en el pitch del 4-nov-2026
 * (`docs/reuniones/2026-11-04-mundillantas-competimotor.md`) y en
 * `docs/MULTICLIENTE.md` §3.3. Lo que falta queda vacío o en null, NUNCA con
 * los valores de Depot: un bot sin formas de pago confirmadas no promete
 * ninguna, que es lo correcto durante la prueba de 2 semanas. La lista de lo
 * que falta la produce `faltantesDeLaPolitica` y vive en
 * `docs/clientes/mundillantas-arranque.md` (preguntas 6, 7 y 8).
 */
import type { PoliticaComercial } from "../politica.js";

export const POLITICA_MUNDILLANTAS: PoliticaComercial = {
  // Pregunta 6 de la lista de arranque (Jenny): formas de pago, cuotas y
  // descuento por efectivo sin confirmar. Vacío = el bot no promete ninguna.
  formasDePago: [],
  cuotasSinIntereses: null,
  descuentoEnEfectivo: null,
  // No ofrecieron beneficio por redes; si lo piden, va acá palabra por palabra.
  beneficioDeRedes: null,
  // Pregunta 8 (¿envían a otras ciudades?): sin confirmar, no se promete envío.
  vendeADistancia: false,
  serviciosQueOfrece: [],
  // [SUPUESTO] gentilicio de Santo Domingo de los Tsáchilas; nadie lo confirmó,
  // pero un gentilicio equivocado no promete nada — solo da tono al prompt.
  gentilicio: "santodomingueño",
  variedadDeEspanol: "Español natural de Ecuador",
  // El juego de 4 es el estándar del mercado; Mundillantas no pidió otro.
  juegoCompleto: 4,
  // ~10 marcas que la escalera no conoce: el escalón premium/equilibrio/
  // económica sale del precio dentro del conjunto (decidido en §3.3 punto 2).
  escalonPorPrecio: true,
  // Lo que venden pero el bot NO cotiza: avisa al asesor del local (§3.3 punto 4).
  productosQueDerivaAlAsesor: ["lubricantes", "baterías", "aceites", "taller"],
  asesorEnReglas: "el asesor",
};
