/**
 * LA POLÍTICA COMERCIAL DE MUNDILLANTAS / COMPETIMOTOR (Santo Domingo).
 *
 * Solo lo confirmado en el pitch del 4-nov-2026
 * (`docs/reuniones/2026-11-04-mundillantas-competimotor.md`), en las
 * respuestas de Jenny por WhatsApp del 6-nov y en `docs/MULTICLIENTE.md` §3.3. Lo que falta queda vacío o en null, NUNCA con
 * los valores de Depot: un bot sin formas de pago confirmadas no promete
 * ninguna, que es lo correcto durante la prueba de 2 semanas. La lista de lo
 * que falta la produce `faltantesDeLaPolitica` y vive en
 * `docs/clientes/mundillantas-arranque.md` (preguntas 6, 7 y 8).
 */
import type { PoliticaComercial } from "../politica.js";

export const POLITICA_MUNDILLANTAS: PoliticaComercial = {
  // Jenny, 6-nov: «efectivo, transferencia, tarjetas de crédito todas hasta 6
  // meses sin intereses. Y 1 año con intereses». No nombró descuento por
  // efectivo: null hasta que lo confirme (el bot no lo ofrece).
  formasDePago: ["efectivo", "transferencia", "tarjeta de crédito"],
  cuotasSinIntereses: "hasta 6 meses sin intereses con todas las tarjetas de crédito (hasta 12 meses con intereses)",
  descuentoEnEfectivo: null,
  // No ofrecieron beneficio por redes; si lo piden, va acá palabra por palabra.
  beneficioDeRedes: null,
  // Pregunta 8 (¿envían a otras ciudades?): sin confirmar, no se promete envío.
  vendeADistancia: false,
  // Lo que dicen los letreros de sus locales (fotos de Jenny, 6-nov). El bot
  // los nombra pero no los cotiza: van al asesor (`productosQueDerivaAlAsesor`).
  serviciosQueOfrece: ["alineación y balanceo", "frenos", "mecánica", "lubricantes", "baterías"],
  // [SUPUESTO] gentilicio de Santo Domingo de los Tsáchilas; nadie lo confirmó,
  // pero un gentilicio equivocado no promete nada — solo da tono al prompt.
  gentilicio: "santodomingueño",
  variedadDeEspanol: "Español natural de Ecuador",
  // Jenny, 8-nov: «se vende cualquier número de llantas» (1, 2 o 3). El bot
  // ya cotiza la cantidad que pide el cliente; el 4 es solo lo que asume
  // cuando no la dice, y es además el mínimo de la alineación incluida.
  juegoCompleto: 4,
  // ~10 marcas que la escalera no conoce: el escalón premium/equilibrio/
  // económica sale del precio dentro del conjunto (decidido en §3.3 punto 2).
  escalonPorPrecio: true,
  // Lo que venden pero el bot NO cotiza: avisa al asesor del local (§3.3 punto 4).
  productosQueDerivaAlAsesor: ["lubricantes", "baterías", "aceites", "taller"],
  asesorEnReglas: "el asesor",
};
