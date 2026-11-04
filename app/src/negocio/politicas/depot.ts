/**
 * LA POLÍTICA COMERCIAL DE DEPOT TIRE — el contrato vivo.
 *
 * Cada texto de acá salió TAL CUAL de donde estaba clavado antes
 * (`domain/datosDelNegocio.ts:51-61`, `domain/beneficioDeRedes.ts:36-41`,
 * `agent/prompts.ts`, `agent/compactPlaybook.ts`, `agent/tools.ts:3517-3520`).
 * Si uno cambia, cambia lo que el bot le dice a los clientes de Depot en
 * producción: las pruebas de `test/politica.test.ts` y
 * `test/prepararSalidaPagos.test.ts` lo fijan byte a byte.
 */
import type { PoliticaComercial } from "../politica.js";

export const POLITICA_DEPOT: PoliticaComercial = {
  formasDePago: ["efectivo", "tarjeta", "transferencia"],
  // Manuel, 12-sep-2026 21:37: «que cuando pregunte si es más caro con tarjeta
  // diga que NO, pero que si paga en cash hay descuento, pero eso se confirma
  // en el local». El monto del descuento no se dice: lo confirma el asesor.
  cuotasSinIntereses: "3 y 6 meses sin intereses",
  descuentoEnEfectivo: "Si paga en efectivo sí hay un descuento, que se lo confirman en el local.",
  // Pedido de Joaquín, 10-sep-2026, con su redacción palabra por palabra. Las
  // dos cosas que pidió con énfasis: que se entienda ADICIONAL, y que el
  // cliente sepa que tiene que mencionarlo en el local.
  beneficioDeRedes:
    "🎁 Y tiene un beneficio adicional por venir de nuestras redes sociales: además de los servicios "
    + "incluidos en la instalación de sus llantas, le obsequiamos una alineación + rotación "
    + "completamente GRATIS a los 10.000 km.\n\n"
    + "Cuando venga a realizar su compra, recuerde mencionar este beneficio a su asesor para que "
    + "pueda registrarlo. 🚗✅",
  // Familia 2-E (conv 21766, 20-sep): quien paga a distancia recibe «Un asesor
  // le confirma pago y envío por acá» en vez de la pregunta del local.
  vendeADistancia: true,
  serviciosQueOfrece: ["mantenimiento preventivo automotriz"],
  gentilicio: "quiteño",
  variedadDeEspanol: "Español natural de Ecuador",
  // Joaquín, 26-ago-2026: «que no pregunte cuántas quiere sino que solo cotice
  // 4 de una»; si el cliente dice otra cantidad, se vuelve a cotizar con esa.
  juegoCompleto: 4,
  // Depot vende Falken/Kenda/Winrun: la escalera de marcas (escalera-precio.json)
  // las conoce y manda; el escalón por precio es para catálogos multimarca.
  escalonPorPrecio: false,
  productosQueDerivaAlAsesor: [],
  asesorEnReglas: "Manuel",
  // El sesgo de Whisper, tal cual estaba en `domain/transcripcionEco.ts:23`.
  vocabularioDeMarcas: ["Kenda", "Falken", "Sunoco", "Eurolub", "Wildpeak"],
};
