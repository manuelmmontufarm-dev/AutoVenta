/**
 * DEPOT TIRE (Quito) — el primer cliente, y el perfil por defecto.
 *
 * Todos los valores de acá salieron tal cual de donde estaban clavados antes
 * (`config.ts`, `domain/locations.ts`, `domain/saludo.ts`, `render/*.ts`,
 * `agent/tools.ts`). Si alguno cambia, cambia el comportamiento en producción:
 * este archivo es el contrato con el cliente que ya está vivo.
 */
import type { PerfilDeNegocio } from "../perfil.js";

export const DEPOT: PerfilDeNegocio = {
  id: "depot",
  nombre: "Depot Tire",
  ciudad: "Quito",
  telefono: "+593 98 280 1766",
  horarioEnPalabras: "Lunes a sábado, 8:30–17:30",
  horasPorDia: {
    0: null,
    1: { open: "08:30", close: "17:30" },
    2: { open: "08:30", close: "17:30" },
    3: { open: "08:30", close: "17:30" },
    4: { open: "08:30", close: "17:30" },
    5: { open: "08:30", close: "17:30" },
    6: { open: "08:30", close: "17:30" },
  },
  marcas: ["Kenda", "Sunoco", "Eurolub", "Falken"],
  locales: [
    {
      slug: "cumbaya",
      nombre: "Depot Tire Cumbayá",
      nombreCorto: "Cumbayá",
      direccion: "C.C. La del Establo y Av. Oswaldo Guayasamín, Cumbayá",
      lat: -0.198,
      lng: -78.443,
      mapsUrl: "https://maps.app.goo.gl/QnMBPXKc1o8igbsp8",
      claveHorario: "cumbaya",
      // Fin de semana a medio día, distinto del general.
      horarioPorDefecto: {
        weekday: { open: "08:30", close: "17:30" },
        weekend: { open: "08:30", close: "14:30" },
      },
      comoLoNombran: /\bcumbaya\b/,
    },
    {
      slug: "quito_sur",
      nombre: "Depot Tire Quito Sur",
      nombreCorto: "Quito Sur",
      direccion: "Galo Molina y Av. Alonso de Angulo, Quito",
      lat: -0.2487128,
      lng: -78.5296804,
      mapsUrl: "https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7",
      claveHorario: "quitoSur",
      // Cierra el fin de semana.
      horarioPorDefecto: {
        weekday: { open: "08:30", close: "17:30" },
        weekend: { open: "08:30", close: "17:30", closed: true },
      },
      comoLoNombran:
        /\bquito\s+sur\b|\b(?:local|sucursal)\s+(?:(?:de|del)\s+)?(?:quito\s+)?sur\b|\bel\s+de\s+(?:quito\s+)?sur\b/,
      // «al de quito» ES Quito Sur cuando acabamos de ofrecerle los dos: el
      // cliente contesta con el nombre corto que los distingue —uno es «el de
      // Cumbayá» y el otro «el de Quito»—. Sin esto devolvía null (producción,
      // 27-ago, conv 3) y se caía todo lo que cuelga de reconocer el local: el
      // día se preguntaba sin el monto del descuento y `nearest_store` no se
      // guardaba, que el guardián marcó como `estado_desincronizado`.
      comoLoNombranAlElegir: /\b(?:sur|quito)\b/,
      // El norte y Calderón le quedan a Cumbayá, no acá.
      noLoEligeSi: /\bnorte\b|\bcalderon\b/,
    },
  ],
  // EL ORDEN IMPORTA: se busca por subcadena y gana el primero que calza, así
  // que lo específico va antes que lo genérico. «al sur de Quito» contiene las
  // dos palabras y tiene que resolver al sur, no al centro.
  sectores: [
    { clave: "itulcachi", lat: -0.157, lng: -78.337, etiqueta: "Itulcachi" },
    // Depot solo tiene Cumbayá y Quito Sur. Para el norte y el noreste, Cumbayá
    // es el local realmente cercano; antes «Norte de Quito» caía en el punto
    // genérico «Quito» y terminaba mandando al sur, el más lejano (conv 22531,
    // 23-sep: el bot registró «Local elegido explícitamente: Quito Sur» y le
    // pidió el día para ese local, dos veces).
    { clave: "calderon", lat: -0.1, lng: -78.42, etiqueta: "Calderón" },
    { clave: "norte", lat: -0.1, lng: -78.48, etiqueta: "norte de Quito" },
    { clave: "cumbaya", lat: -0.2, lng: -78.43, etiqueta: "Cumbayá" },
    { clave: "tumbaco", lat: -0.211, lng: -78.402, etiqueta: "Tumbaco" },
    { clave: "pifo", lat: -0.225, lng: -78.339, etiqueta: "Pifo" },
    // El Valle de los Chillos baja a Quito por la Rumiñahui y cae al sur: el
    // local que le queda es Quito Sur. Caso real del 25-ago (foto de Joaquín):
    // «Vlle de los chillos» no resolvía y el bot pedía el pin. La clave
    // «chillos» aguanta esa falta («vlledeloschillos» ⊃ «chillos»).
    { clave: "chillos", lat: -0.33, lng: -78.45, etiqueta: "Valle de los Chillos" },
    { clave: "sangolqui", lat: -0.33, lng: -78.445, etiqueta: "Sangolquí" },
    // «al sur», a secas, es como la mitad de Quito dice dónde vive — y era un
    // sector que no resolvía nada: `local_mas_cercano` devolvía «no puedo
    // ubicar ese sector, pide el pin» y el hilo se moría ahí (chat del 25-ago:
    // «al sur por favor el viernes» y el bot volvió a preguntar el lugar). El
    // punto es el centro del sur de Quito, a ~4 km del local de Quito Sur y a
    // ~15 del de Cumbayá: la recomendación no tiene vuelta.
    { clave: "sur", lat: -0.28, lng: -78.545, etiqueta: "sur de Quito" },
    // «quito» a secas SE QUITÓ el 24-sep: el punto del centro quedaba más cerca
    // de Quito Sur, así que cualquier zona que solo dijera «Quito» —incluido
    // «Norte de Quito»— mandaba al local equivocado. Sin ese comodín, una zona
    // que no se reconoce pide el pin, que es lo correcto.
  ],
  palabrasDeLugarPropias: ["depot", "tire"],
  iva: 0.15,
  moneda: "USD",
  garantias: {
    default: { golpesMeses: 6, fabricaAnios: 5 },
    Kenda: { golpesMeses: 12, fabricaAnios: 5 },
    Falken: { golpesMeses: 18, fabricaAnios: 5 },
  },
  // Decidido por Joaquín el 14-sep-2026: «una persona… un nombre alegre… un
  // Martín». El bot no niega ser un asistente virtual si se lo preguntan.
  vendedor: { nombre: "Martín" },
  piezas: {
    antiguedad: "desde 1996",
    antiguedadClasica: "30 años",
    condiciones: "Precios incluyen IVA y Ecovalor · por unidad · 3 y 6 meses sin intereses",
    condicionesDiaNoche: "Precios con IVA y Ecovalor · 3 y 6 meses sin intereses con tarjeta de crédito",
    mediosDePago: "Efectivo, tarjeta, transferencia · 3 y 6 meses sin intereses",
    mediosDePagoDiaNoche: "Efectivo, tarjeta y transferencia · 3 y 6 meses sin intereses con tarjeta de crédito",
    todasIncluyen:
      "Instalación completa · seguro contra golpes y cortes · mantenimiento cada 10.000 km · revisión del vehículo",
  },
};
