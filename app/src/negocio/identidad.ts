/**
 * LAS IDENTIDADES DE UN NEGOCIO — helpers puros sobre el perfil.
 *
 * Un negocio puede tener más de una marca comercial (Mundillantas y
 * Competimotor son UN cliente con DOS marcas y tres locales). Estas funciones
 * responden siempre la misma pregunta: «¿con qué marca se le habla a ESTE
 * cliente?» — la del local que eligió, o la de la presentación mientras no
 * elige. Un perfil sin `identidades` tiene exactamente una, el negocio mismo,
 * así que Depot pasa por aquí sin cambiar un byte.
 *
 * Solo importa `negocio/perfil.ts`: el panel empaqueta esta cadena y nada de
 * acá puede tocar `node:fs`, la base ni `services/`.
 */
import { localPorNombre, type Identidad, type Local, type PerfilDeNegocio } from "./perfil.js";

/**
 * Las identidades del perfil. Sin el campo hay UNA, que es el negocio: así
 * todo consumidor puede iterar identidades sin preguntar si existen.
 */
export function identidades(perfil: PerfilDeNegocio): Identidad[] {
  if (perfil.identidades?.length) return perfil.identidades;
  return [{ id: perfil.id, nombre: perfil.nombre, locales: perfil.locales.map((l) => l.slug) }];
}

/**
 * Cada local pertenece a EXACTAMENTE una identidad, y ninguna identidad nombra
 * un local que no existe. Se comprueba al arrancar (negocio/index.ts): un
 * perfil ambiguo no puede atender clientes — no se sabría con qué marca.
 */
export function validarIdentidades(perfil: PerfilDeNegocio): void {
  const slugsReales = new Set(perfil.locales.map((l) => l.slug));
  const vistos = new Map<string, string>();
  for (const identidad of identidades(perfil)) {
    for (const slug of identidad.locales) {
      if (!slugsReales.has(slug)) {
        throw new Error(
          `La identidad "${identidad.id}" de ${perfil.id} nombra un local que no existe: "${slug}".`,
        );
      }
      const dueno = vistos.get(slug);
      if (dueno) {
        throw new Error(
          `El local "${slug}" de ${perfil.id} está en dos identidades: "${dueno}" y "${identidad.id}".`,
        );
      }
      vistos.set(slug, identidad.id);
    }
  }
  for (const slug of slugsReales) {
    if (!vistos.has(slug)) {
      throw new Error(`El local "${slug}" de ${perfil.id} no pertenece a ninguna identidad.`);
    }
  }
}

/** La identidad a la que pertenece un local (por slug o por cualquier nombre), o null. */
export function identidadDelLocal(perfil: PerfilDeNegocio, slugONombre: string | null | undefined): Identidad | null {
  const local = localPorNombre(perfil, slugONombre);
  if (!local) return null;
  return identidades(perfil).find((i) => i.locales.includes(local.slug)) ?? null;
}

/**
 * La identidad de la presentación: la que `presentacion.identidad` nombra, o
 * la primera. Es con la que se habla mientras el cliente no elige local.
 */
function identidadDePresentacion(perfil: PerfilDeNegocio): Identidad {
  const todas = identidades(perfil);
  const pedida = perfil.presentacion?.identidad;
  return todas.find((i) => i.id === pedida) ?? todas[0];
}

/**
 * La identidad con la que se le habla a UNA conversación: la del local elegido
 * (`conversations.nearest_store`), y mientras no hay local —o el guardado no
 * existe en el perfil— la de la presentación. Nunca inventa: un local
 * desconocido no puede elegir marca.
 */
export function identidadDeLaConversacion(
  perfil: PerfilDeNegocio,
  nearestStore: string | null | undefined,
): Identidad {
  return identidadDelLocal(perfil, nearestStore) ?? identidadDePresentacion(perfil);
}

/** Todos los nombres con los que el negocio se presenta, uno por identidad. */
export function nombresDelNegocio(perfil: PerfilDeNegocio): string[] {
  return identidades(perfil).map((i) => i.nombre);
}

/** Los locales de una identidad (por id); sin id o con un id desconocido, todos. */
export function localesDeIdentidad(perfil: PerfilDeNegocio, idDeIdentidad?: string | null): Local[] {
  if (!idDeIdentidad) return perfil.locales;
  const identidad = identidades(perfil).find((i) => i.id === idDeIdentidad);
  if (!identidad) return perfil.locales;
  return perfil.locales.filter((l) => identidad.locales.includes(l.slug));
}

/**
 * Los locales que se le pueden NOMBRAR a un cliente: los que no tienen el
 * nombre en `[PENDIENTE]`. Existe para la pregunta «¿a cuál local?» y los
 * botones de local (`domain/storeSelection.ts`, que no es de este sprint): con
 * el perfil de Mundillantas recién dado de alta, el segundo local todavía no
 * tiene nombre y no puede salir como opción. Con Depot devuelve los dos.
 */
export function localesConfirmados(perfil: PerfilDeNegocio): Local[] {
  return perfil.locales.filter(
    (l) => !l.nombre.trimStart().startsWith("[PENDIENTE]") && !l.nombreCorto.trimStart().startsWith("[PENDIENTE]"),
  );
}

/** Nombres de campo del perfil, legibles para el panel. */
const NOMBRES_DE_CAMPO: Record<string, string> = {
  telefono: "teléfono",
  direccion: "dirección",
  horarioEnPalabras: "horario",
  nombre: "nombre",
  nombreCorto: "nombre corto",
  condiciones: "condiciones de las piezas",
  condicionesDiaNoche: "condiciones (día y noche)",
  mediosDePago: "medios de pago de las piezas",
  mediosDePagoDiaNoche: "medios de pago (día y noche)",
  todasIncluyen: "qué incluye toda compra",
  impuestosIncluidos: "frase de impuestos",
  precioSinDescuento: "frase del precio sin descuento",
  notaDePrecios: "nota de precios",
  notaDePrecioUnitario: "nota de precio unitario",
};

/**
 * Todo lo que el perfil todavía tiene en `[PENDIENTE]`, con una ruta legible
 * («Local 2 · dirección»), más los pendientes numéricos declarados. Es la
 * lista que el panel muestra para saber qué falta preguntarle al cliente.
 */
export function faltantesDelPerfil(perfil: PerfilDeNegocio): string[] {
  const faltantes: string[] = [];
  const mirar = (valor: unknown, ruta: string[]): void => {
    if (typeof valor === "string") {
      if (valor.trimStart().startsWith("[PENDIENTE]")) faltantes.push(ruta.join(" · "));
      return;
    }
    if (Array.isArray(valor)) {
      valor.forEach((v, i) => mirar(v, [...ruta.slice(0, -1), `${ruta.at(-1)} ${i + 1}`]));
      return;
    }
    if (valor && typeof valor === "object" && !(valor instanceof RegExp)) {
      for (const [clave, v] of Object.entries(valor)) {
        mirar(v, [...ruta, NOMBRES_DE_CAMPO[clave] ?? clave]);
      }
    }
  };
  mirar(perfil.telefono, ["teléfono"]);
  mirar(perfil.vendedor, ["vendedor"]);
  mirar(perfil.piezas, ["piezas"]);
  for (const local of perfil.locales) {
    const etiqueta = local.nombreCorto.trimStart().startsWith("[PENDIENTE]")
      ? local.slug
      : local.nombreCorto;
    for (const campo of ["nombre", "nombreCorto", "direccion"] as const) {
      mirar(local[campo], [etiqueta, NOMBRES_DE_CAMPO[campo] ?? campo]);
    }
  }
  faltantes.push(...(perfil.pendientesNumericos ?? []));
  return faltantes;
}
