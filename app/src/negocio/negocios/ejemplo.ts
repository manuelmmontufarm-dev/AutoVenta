/**
 * PLANTILLA PARA UN CLIENTE NUEVO — copiá este archivo, no lo edites.
 *
 * Es una llantera inventada de Guayaquil con UN solo local, a propósito: el
 * caso que el código no soportaba antes del 24-sep-2026 era justamente que los
 * locales no fueran exactamente dos.
 *
 * Lo que hay que conseguir del cliente, en este orden:
 *
 *  1. Nombre comercial, teléfono de atención y horarios.
 *  2. Cada local: nombre como se le dice al cliente, dirección, coordenadas
 *     (del pin de Google Maps) y el link corto del mapa.
 *  3. Las zonas de SU ciudad por las que la gente dice dónde vive. Si no las
 *     tenés todavía, dejá `sectores: []`: el bot pide el pin en vez de
 *     adivinar, que es lo correcto. NUNCA inventes coordenadas.
 *  4. IVA de su país, moneda y garantías por marca.
 *  5. Qué dice el pie de sus piezas y qué incluye toda compra.
 *
 * Lo que NO hay que tocar: cómo se lee una medida, cuándo un «sí» autoriza una
 * cotización, qué puede preguntar un seguimiento. Eso es de todas las llanteras
 * y vive en el dominio; cada arreglo que se hizo para Depot ya sirve acá.
 */
import type { PerfilDeNegocio } from "../perfil.js";

export const EJEMPLO: PerfilDeNegocio = {
  id: "ejemplo",
  nombre: "Llantera Ejemplo",
  ciudad: "Guayaquil",
  telefono: "+593 99 000 0000",
  horarioEnPalabras: "Lunes a viernes, 9:00–18:00",
  horasPorDia: {
    0: null,
    1: { open: "09:00", close: "18:00" },
    2: { open: "09:00", close: "18:00" },
    3: { open: "09:00", close: "18:00" },
    4: { open: "09:00", close: "18:00" },
    5: { open: "09:00", close: "18:00" },
    6: null,
  },
  marcas: ["Michelin", "Aeolus"],
  // UN SOLO LOCAL. Con uno, el bot no pregunta «¿a cuál le queda mejor?»: lo
  // nombra y manda su mapa.
  locales: [
    {
      slug: "principal",
      nombre: "Llantera Ejemplo",
      nombreCorto: "Guayaquil",
      direccion: "Av. Principal y Calle Segunda, Guayaquil",
      lat: -2.170998,
      lng: -79.922359,
      mapsUrl: "",
      claveHorario: "principal",
      // Con un solo local el patrón casi no se usa —no hay entre qué elegir—,
      // pero tiene que existir y distinguir si mañana abren el segundo.
      comoLoNombran: /\bguayaquil\b|\bprincipal\b/,
    },
  ],
  // Vacío a propósito: sin las zonas de Guayaquil cargadas, el bot pide el pin
  // en vez de mandar a alguien al local equivocado.
  sectores: [],
  palabrasDeLugarPropias: ["llantera", "ejemplo"],
  iva: 0.15,
  moneda: "USD",
  garantias: {
    default: { golpesMeses: 6, fabricaAnios: 5 },
  },
  vendedor: { nombre: "Andrés" },
  piezas: {
    antiguedad: "",
    antiguedadClasica: "",
    condiciones: "Precios incluyen IVA · por unidad",
    condicionesDiaNoche: "Precios con IVA incluido",
    mediosDePago: "Efectivo, tarjeta, transferencia",
    mediosDePagoDiaNoche: "Efectivo, tarjeta y transferencia",
    todasIncluyen: "Instalación completa · revisión del vehículo",
  },
};
