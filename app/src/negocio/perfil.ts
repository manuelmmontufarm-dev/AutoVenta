/**
 * EL PERFIL DEL NEGOCIO — todo lo que cambia de un cliente a otro, en un lugar.
 *
 * Hasta el 24-sep-2026 el nombre del negocio, sus locales, las zonas de la
 * ciudad, los horarios y los pies de las piezas estaban escritos como literales
 * repartidos por `src/`: 58 apariciones de «Cumbayá» fuera de la config, un
 * `z.enum` con los dos nombres dentro del contrato de herramientas que ve el
 * modelo, y los horarios elegidos preguntando si el nombre del local *contenía*
 * la palabra «Cumbayá». Con eso, un segundo cliente no era configuración: era
 * tocar el código y arriesgar al primero.
 *
 * Acá vive la FORMA (este archivo) y en `negocios/` los VALORES de cada
 * cliente. La regla al agregar algo:
 *
 *   · Si un cliente distinto lo tendría distinto → va en el perfil.
 *   · Si es la misma conducta para cualquier llantera → se queda en el código.
 *
 * La segunda mitad es la importante: lo que aprendimos de los errores de Depot
 * —cómo se lee una medida, cuándo un «sí» autoriza, qué no puede preguntar un
 * seguimiento— NO se copia por cliente. Es de todos y vive en el dominio.
 *
 * Cuál perfil se usa lo decide `NEGOCIO` en el entorno; sin esa variable es
 * Depot, que es lo que hay en producción hoy.
 */

/**
 * Un tramo de atención. `closed` se omite cuando el local abre.
 *
 * Se declara acá con su forma y no importando el tipo de `services/settings.ts`
 * para no atar el perfil —que es puro— al módulo que habla con la base.
 */
export interface TramoDeHorario {
  open: string;
  close: string;
  closed?: boolean;
}

/** El horario semanal de un local: entre semana y fin de semana. */
export interface HorarioDeLocal {
  weekday: TramoDeHorario;
  weekend: TramoDeHorario;
}

/** Un local con atención al público. Son N, no dos. */
export interface Local {
  /**
   * Identificador corto y estable, sin tildes ni espacios. Se usa en los ids de
   * los botones de WhatsApp (`local:<slug>`), así que cambiarlo en un negocio
   * vivo invalida los botones ya enviados: elegilo una vez y no lo toques.
   */
  slug: string;
  /** Como se le nombra al cliente y como se guarda en `conversations.nearest_store`. */
  nombre: string;
  /** Para botones y frases cortas: «Cumbayá», no «Depot Tire Cumbayá». Tope de Meta: 20 caracteres. */
  nombreCorto: string;
  direccion: string;
  lat: number;
  lng: number;
  mapsUrl?: string;
  /**
   * Clave con la que este local guarda su horario en `settings.store_hours`.
   * Existe aparte de `slug` porque los horarios de Depot ya están guardados en
   * producción bajo `cumbaya` y `quitoSur`, y renombrarlos ahí sería una
   * migración de datos a cambio de nada.
   */
  claveHorario: string;
  /**
   * El horario de ESTE local, cuando difiere del general del negocio. Lo que el
   * dueño guarde en Ajustes manda sobre esto; acá está el arranque.
   *
   * Depot lo necesita: Cumbayá abre medio día el fin de semana y Quito Sur
   * cierra. `closed` y `excepciones` se pueden omitir.
   */
  horarioPorDefecto?: HorarioDeLocal;
  /**
   * CÓMO NOMBRA EL CLIENTE A ESTE LOCAL, contra el texto ya normalizado (sin
   * tildes, en minúsculas). Es lo que convierte «al de quito sur» en una
   * elección registrada.
   *
   * Se compara contra TODOS los locales: si calzan dos, no hay elección y se
   * pregunta. Por eso los patrones tienen que distinguir, no solo reconocer.
   */
  comoLoNombran: RegExp;
  /**
   * Patrón MÁS SUELTO que solo vale cuando el bot acaba de preguntar a cuál
   * local — ahí «al sur» ya es la respuesta.
   *
   * Va aparte porque fuera de esa pregunta el mismo texto significa otra cosa:
   * «estoy en Quito» es dónde vive el cliente, no el local que eligió. Convs
   * 18821 y 18221: las dos quedaron como «local elegido explícitamente» y en
   * una el bot confirmó una visita que nadie pidió.
   */
  comoLoNombranAlElegir?: RegExp;
}

/**
 * Una zona de la ciudad que el cliente nombra en el chat («al sur», «Cumbayá»,
 * «el valle»). Sirve para elegirle el local sin pedirle el pin.
 *
 * EL ORDEN IMPORTA: la búsqueda es por subcadena y se queda con el PRIMERO que
 * calza, así que lo específico va antes que lo genérico. «al sur de Quito»
 * contiene las dos palabras y tiene que resolver al sur, no al centro.
 */
export interface Sector {
  /** Sin tildes, en minúsculas y sin espacios: así se compara contra lo que escribe el cliente. */
  clave: string;
  lat: number;
  lng: number;
  /** Como se le nombra al cliente: «sur de Quito», «Valle de los Chillos». */
  etiqueta: string;
}

/** Garantía de una marca, para las piezas de cotización. */
export interface Garantia {
  golpesMeses: number;
  fabricaAnios: number;
}

export interface PerfilDeNegocio {
  /** Identificador del perfil, el mismo que se pone en `NEGOCIO`. */
  id: string;
  /** El nombre comercial, tal como se le dice al cliente. */
  nombre: string;
  /** La ciudad donde atiende. Va al prompt y al encabezado de las piezas. */
  ciudad: string;
  telefono: string;
  /** Frase de horario para el prompt, cuando no hay horarios cargados en Ajustes. */
  horarioEnPalabras: string;
  /** Horario por día (0=domingo…6=sábado), formato HH:mm, o null si cierra. */
  horasPorDia: Record<number, { open: string; close: string } | null>;
  /** Marcas que trabaja el negocio, para el prompt. El catálogo manda sobre esto. */
  marcas: string[];
  promo?: string;
  locales: Local[];
  /** Zonas de SU ciudad. Un cliente de otra ciudad trae las suyas; vacío = siempre se pide el pin. */
  sectores: Sector[];
  /**
   * Palabras de lugar propias del negocio que NO salen de `locales` ni de
   * `sectores` («depot», «tire»). El detector de repetición las descuenta antes
   * de comparar dos mensajes: en un chat que termina en una visita, esas
   * palabras SON la conversación y contarlas como repetición dispara una alerta
   * falsa (conv 6467).
   */
  palabrasDeLugarPropias: string[];
  /** IVA del país. Los precios del catálogo se asumen SIN IVA. */
  iva: number;
  moneda: string;
  /** Clave = marca tal como viene en el catálogo; `default` aplica a las demás. */
  garantias: Record<string, Garantia>;
  /** Cómo se presenta el bot: «Soy Martín, de Depot Tire». */
  vendedor: { nombre: string };
  /** Lo que va dibujado al pie de las piezas y del PDF. */
  piezas: {
    /**
     * Antigüedad al pie de la plantilla «día y noche»: «desde 1996». Vacío si
     * no aplica.
     *
     * Son dos campos y no uno porque las dos plantillas de Depot dicen cosas
     * distintas —la clásica «30 años», la de día y noche «desde 1996»— y
     * unificarlas acá cambiaría una imagen que el cliente ya aprobó. Un negocio
     * nuevo puede poner la misma frase en los dos.
     */
    antiguedad: string;
    /** Antigüedad al pie de la plantilla clásica: «30 años». Vacío si no aplica. */
    antiguedadClasica: string;
    /**
     * Al pie de la cotización clásica, sobre precios e impuestos.
     *
     * Las dos plantillas de Depot lo dicen distinto —la clásica «Precios
     * incluyen IVA y Ecovalor…», la de día y noche «Precios con IVA y
     * Ecovalor… con tarjeta de crédito»— y las dos están aprobadas por el
     * cliente. Un negocio nuevo puede poner la misma frase en las dos.
     */
    condiciones: string;
    /** Lo mismo, en la plantilla «día y noche». */
    condicionesDiaNoche: string;
    /** Formas de pago, al pie de la comparativa clásica. */
    mediosDePago: string;
    /** Lo mismo, en la plantilla «día y noche». */
    mediosDePagoDiaNoche: string;
    /** Lo que incluye toda compra, en la franja de la pieza. */
    todasIncluyen: string;
  };
}

/** Sin tildes: así se comparan los nombres contra lo que escribe el cliente. */
export const sinTildes = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Escapa lo que va a entrar en una expresión regular como texto literal. */
export const escaparRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Un nombre convertido en fragmento de expresión regular: sin tildes, escapado
 * y con los espacios flexibles («Quito Sur» reconoce también «quito  sur»).
 *
 * Existe porque varios candados tenían los nombres de los locales escritos a
 * mano dentro de sus patrones, y esa es la forma de que salgan del perfil sin
 * que cada archivo repita la misma preparación.
 */
export function comoPatron(texto: string): string {
  return escaparRegex(sinTildes(texto)).replace(/\s+/g, "\\s+");
}

/**
 * Como `comoPatron`, pero para patrones que corren sobre el texto TAL COMO LO
 * ESCRIBIÓ EL CLIENTE, con tildes o sin ellas.
 *
 * Cada vocal se vuelve una clase («cumbaya» → `c[uúü]mb[aá]y[aá]`), que es lo
 * que estaba escrito a mano en los candados: sin esto, un perfil sin tildes
 * dejaría de reconocer «Cumbayá» y el candado se abriría en silencio. Pensado
 * para usarse con la bandera `i`.
 */
export function comoPatronConTildes(texto: string): string {
  const CLASES: Record<string, string> = {
    a: "[aá]", e: "[eé]", i: "[ií]", o: "[oó]", u: "[uúü]", n: "[nñ]", c: "[cç]",
  };
  return sinTildes(texto)
    .toLowerCase()
    .split("")
    .map((letra) => (/\s/.test(letra) ? "\\s*" : CLASES[letra] ?? escaparRegex(letra)))
    .join("");
}

/**
 * El nombre en mayúsculas, palabra por palabra, con una marca de si va en el
 * color de acento: la primera palabra no, el resto sí.
 *
 * Es el respaldo del encabezado de las piezas cuando falta el archivo del logo.
 * Reproduce cómo se dibujaba «DEPOT» + «TIRE» a mano.
 */
export function nombreEnDosTonos(perfil: PerfilDeNegocio): Array<[string, boolean]> {
  return perfil.nombre
    .split(/\s+/)
    .filter(Boolean)
    .map((palabra, i) => [palabra.toUpperCase(), i > 0]);
}

/** La leyenda del encabezado de las piezas: «QUITO · DESDE 1996». */
export function leyendaDelEncabezado(perfil: PerfilDeNegocio): string {
  const partes = [perfil.ciudad, perfil.piezas.antiguedad].filter(Boolean);
  return partes.join(" · ").toUpperCase();
}

/** La primera palabra del nombre del negocio: «depot» de «Depot Tire». */
export function palabraDelNegocio(perfil: PerfilDeNegocio): string {
  return sinTildes(perfil.nombre.split(/\s+/)[0]).toLowerCase();
}

/**
 * Los locales escritos en una línea: «Cumbayá · Quito Sur». Con un solo local
 * es su nombre corto, y con cinco no se pinta una lista ilegible al pie de una
 * imagen — de ahí el tope.
 */
export function localesEnUnaLinea(perfil: PerfilDeNegocio, tope = 3): string {
  const nombres = perfil.locales.map((l) => l.nombreCorto);
  if (nombres.length <= tope) return nombres.join(" · ");
  return `${nombres.slice(0, tope).join(" · ")} y ${nombres.length - tope} más`;
}

/**
 * El pie de las piezas con la antigüedad pegada: «Cumbayá · Quito Sur · desde
 * 1996». Sin antigüedad cargada devuelve solo los locales, sin el separador
 * colgando.
 */
export function pieDeLocales(perfil: PerfilDeNegocio, antiguedad = perfil.piezas.antiguedad): string {
  const locales = localesEnUnaLinea(perfil);
  return antiguedad ? `${locales} · ${antiguedad}` : locales;
}

/** «Soy Martín, de Depot Tire». */
export function firmaDePresentacion(perfil: PerfilDeNegocio): string {
  return `Soy ${perfil.vendedor.nombre}, de ${perfil.nombre}`;
}

/**
 * Busca un local por cualquiera de sus nombres. Devuelve null si no calza
 * ninguno: quien llama decide si eso es preguntar o no elegir.
 */
export function localPorNombre(perfil: PerfilDeNegocio, nombre: string | null | undefined): Local | null {
  if (!nombre) return null;
  const buscado = nombre.trim().toLowerCase();
  return (
    perfil.locales.find((l) => l.nombre.toLowerCase() === buscado)
    ?? perfil.locales.find((l) => l.nombreCorto.toLowerCase() === buscado)
    ?? perfil.locales.find((l) => l.slug === buscado)
    ?? null
  );
}
