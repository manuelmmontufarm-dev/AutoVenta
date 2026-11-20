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

/** El envío a otras ciudades, en una frase: es la única que hay que cambiar para un envío gratis. */
const ENVIO_A_OTRAS_CIUDADES =
  "Envíos a otras ciudades: sí, por Laar Courier o Transportes Bemaut, y el envío lo paga el cliente. Cuánto cuesta lo confirma un asesor.";

export const POLITICA_MUNDILLANTAS: PoliticaComercial = {
  // Jenny, 6-nov: «efectivo, transferencia, tarjetas de crédito todas hasta 6
  // meses sin intereses. Y 1 año con intereses». No nombró descuento por
  // efectivo: null hasta que lo confirme (el bot no lo ofrece).
  formasDePago: ["efectivo", "transferencia", "tarjeta de crédito"],
  cuotasSinIntereses: "hasta 6 meses sin intereses con todas las tarjetas de crédito (hasta 12 meses con intereses)",
  // Precio A normal, B tarjeta, C efectivo: no hay descuento sobre la cotización.
  cotizacionConDescuento: false,
  // Manuel, 20-nov: «no gracias» a secas es «esa no»: se le ofrece otra (CM28).
  noGraciasPideOtraOpcion: true,
  descuentoEnEfectivo: null,
  // No ofrecieron beneficio por redes; si lo piden, va acá palabra por palabra.
  beneficioDeRedes: null,
  // Jenny, 18-nov: envían a otras ciudades por Laar Courier o Transportes
  // Bemaut, y (18-nov, noche) el envío lo paga el cliente. Cuánto cuesta: el asesor.
  vendeADistancia: true,
  // Respuestas de Jenny del 18-nov (`docs/clientes/Preguntas-…-respondido-18nov.xlsx`),
  // sin agregarles plazos, precios ni condiciones que ella no escribió.
  hechosConfirmados: [
    // ENVÍO GRATIS: Jenny dijo el 18-nov (noche) que por Black Friday «podemos
    // hacer envío gratis», pero NO lo confirmó. Para prenderlo cuando lo
    // confirme, cambiar SOLO esta frase (p. ej. «…: el envío es gratis hasta el
    // 30-nov») y desplegar; nada más lo dice.
    ENVIO_A_OTRAS_CIUDADES,
    "Reciben aros y llantas usadas como parte de pago. Cuánto se le reconoce lo evalúa un asesor.",
    // Jenny, 18-nov (noche): «hora y media, porque se hace un chequeo general del carro».
    "Instalación: se atiende por orden de llegada y también con cita, y demora hora y media porque se hace un chequeo general del carro.",
    "El seguro contra impacto se hace válido solo con la factura de la compra y solo en Kenda, Falken, Winrun y Maxxis.",
    // Jenny, 18-nov (noche): incluye «rotación de llantas, revisión mecánica y nitrógeno gratis».
    "El mantenimiento cada 10.000 km va incluido comprando 2 o 4 llantas: rotación de llantas, revisión mecánica y nitrógeno, sin costo.",
  ],
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
  // Reunión 18-nov-2026 (min. 00:00–01:46): primero Falken, Winrun y Kenda (sus
  // marcas de mayor margen y con garantía) + 1 de mayor inventario entre las
  // demás; «qué más tiene» trae el resto hasta ~10. La 4.ª cambia sola con el
  // Excel diario de Fénix. Ver `domain/recomendacionPorMarca.ts`.
  recomendacionPorMarca: {
    marcasPrimero: ["FALKEN", "WINRUN", "KENDA"],
    extrasPorInventario: 1,
    topeConMasOpciones: 10,
    porLamina: 6,
  },
  // Lo que venden pero el bot NO cotiza: avisa al asesor del local (§3.3 punto 4).
  productosQueDerivaAlAsesor: ["lubricantes", "baterías", "aceites", "taller"],
  asesorEnReglas: "el asesor",
};
