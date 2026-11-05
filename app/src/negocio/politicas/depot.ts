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
  // Black Friday de Depot, todo noviembre 2026 (Joaquín, 5-nov 13:36):
  // «60% de descuento en tu segunda llanta Falken o Kenda · 50% en ABC de
  // frenos y en alineación y balanceo · 40% en cambio de aceite · Revisión de
  // 7 puntos GRATIS». Manuel, 5-nov: las llantas pares de la cotización llevan
  // el 60 % sobre el precio de hoy; la tabla de servicios YA viene al 50 %
  // («Precio al 50% incluido iva»); la de aceites es PVP y se resta el 40 %.
  promocionDeTemporada: {
    nombre: "Black Friday",
    lema: "El Black Friday se vive TODO NOVIEMBRE",
    desde: "2026-11-01",
    hasta: "2026-11-30",
    segundaLlanta: { porcentaje: 60, marcas: ["FALKEN", "KENDA"] },
    servicios: {
      porcentaje: 50,
      lista: [
        { servicio: "Alineación", vehiculo: "auto", precioPromoConIva: 20 },
        { servicio: "Alineación", vehiculo: "camioneta", precioPromoConIva: 30 },
        { servicio: "Balanceo", vehiculo: "auto", precioPromoConIva: 6 },
        { servicio: "Balanceo", vehiculo: "camioneta", precioPromoConIva: 5 },
        { servicio: "ABC de frenos", vehiculo: "auto", precioPromoConIva: 25 },
        { servicio: "ABC de frenos", vehiculo: "camioneta", precioPromoConIva: 35 },
        { servicio: "Enllantaje", vehiculo: "camioneta", precioPromoConIva: 10 },
        { servicio: "Enllantaje", vehiculo: "auto", precioPromoConIva: 3 },
      ],
    },
    productos: {
      porcentaje: 40,
      categoria: "cambio de aceite",
      lista: [
        { nombre: "EUROLUB DIESEL SAE 15W40 API CI4 24X1LT", pvpConIva: 8.35 },
        { nombre: "MTF FX 75W-85W", pvpConIva: 26.65 },
        { nombre: "HEAVY DUTY SHPD 15W40 4X5 GLN", pvpConIva: 73.53 },
        { nombre: "EURO LUB ALTO KM DIESEL SAE 25W60 API CF BALDE 5GL", pvpConIva: 156.09 },
        { nombre: "EURO LUB DIESEL SAE 15W40 API CI4 BALDE 5GL", pvpConIva: 164.76 },
        { nombre: "HEAVY DUTY SHPD 15W40 20 LT", pvpConIva: 272.54 },
        { nombre: "GEAR GL-4 HYPERFLOW LDZ 75W80 20 LTS CANECA", pvpConIva: 544.57 },
        { nombre: "GEAR GL-5 SUPERFLOW SAE 75W90 20 LTS CANECAS", pvpConIva: 406.39 },
        { nombre: "EURO LUB SYBLND SAE 5W30 CONVERTIDOR EN LITROS", pvpConIva: 10.21 },
        { nombre: "SYNTURO CROWN 5W20 4X5 GL", pvpConIva: 105.37 },
        { nombre: "SYNTURO XENON 5W40 4X5 LTS", pvpConIva: 93.98 },
        { nombre: "GEAR GL-4 HYPERFLOW LDZ 75W80 LTS CONVERTIDO", pvpConIva: 38.59 },
        { nombre: "GEAR GL-4 HYPERFLOW LDZ 75W80 12X1 LTS", pvpConIva: 38.59 },
        { nombre: "HEAVY DUTY SUPER HPD 5W30 LITROS", pvpConIva: 15.69 },
        { nombre: "SYNTURO CROWN 5W20 LITROS", pvpConIva: 28.38 },
        { nombre: "SUNOCO GEAR GL-5 SUPERFLOW SAE 75W90 LT", pvpConIva: 25.19 },
        { nombre: "SUNOCO GEAR SUPERFLOW SAE 75W90 LT CONVERTIDO", pvpConIva: 25.19 },
        { nombre: "15W40 LITRO SUNOCO", pvpConIva: 14.71 },
        { nombre: "GEAR GL-5 SAE 85W140 LITROS", pvpConIva: 11.10 },
        { nombre: "SYNTURO XENON 5W30 4X5 GL", pvpConIva: 90.70 },
        { nombre: "EURO LUB SYBLND SAE 5W30 SP C/J CAJA 6X1 GL", pvpConIva: 43.61 },
        { nombre: "SYNTURO XENON 5W30 12X1LT", pvpConIva: 18.11 },
      ],
    },
    gratis: ["Revisión de 7 puntos GRATIS"],
  },
};
