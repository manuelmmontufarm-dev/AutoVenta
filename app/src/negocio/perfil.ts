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
  /**
   * Zonas que este local NO atiende, cuando nombrarlas podría confundirse con
   * elegirlo. Solo desactiva el patrón suelto, nunca el estricto.
   *
   * Depot lo necesita en Quito Sur: «Norte de Quito» contiene «quito», así que
   * el suelto lo elegía y mandaba al cliente al local más lejano (conv 22531,
   * 23-sep). Si el cliente escribe «Quito Sur» completo, el estricto manda y
   * esto no lo estorba.
   */
  noLoEligeSi?: RegExp;
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

/**
 * Una marca comercial del negocio, con sus locales.
 *
 * Existe porque Mundillantas y Competimotor son UN negocio con DOS marcas: el
 * saludo las nombra juntas, pero la cotización del local de Competimotor lleva
 * el logo de Competimotor. Un negocio sin `identidades` tiene una sola, que es
 * él mismo — Depot no declara ninguna y sale igual que siempre.
 */
export interface Identidad {
  /** Identificador corto y estable; nombra el archivo del logo (`logo-<id>.png`). */
  id: string;
  /** El nombre comercial de ESTA marca, como se le dice al cliente. */
  nombre: string;
  /** Slugs de los locales que atienden bajo esta marca. Cada local va en exactamente una. */
  locales: string[];
  /** Archivo del logo en `assets/<id del negocio>/`, si difiere del estándar `logo-<id>.png`. */
  logo?: string;
}

/** Garantía de una marca, para las piezas de cotización. */
export interface Garantia {
  golpesMeses: number;
  fabricaAnios: number;
}

/**
 * Datos tributarios de la factura mensual del servicio (IA + mantenimiento).
 * Se copian tal cual de la última factura electrónica que emite la contadora,
 * para que la pre-factura se pueda pasar a su sistema sin traducir nada.
 */
export interface Facturacion {
  emisor: { nombre: string; ruc: string; matriz: string; correo: string; telefono: string; obligadoContabilidad: string };
  cliente: { razonSocial: string; ruc: string; direccion: string; telefono: string; correo: string };
  item: { codigo: string; descripcion: string };
  infoAdicional: [string, string][];
  formaPago: { descripcion: string; plazo: string };
  transferencia?: { titular: string; ruc: string; banco: string; tipo: string; cuenta: string; correo: string };
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
  /**
   * Las marcas comerciales del negocio. Sin el campo hay una sola identidad,
   * que es el negocio mismo (`nombre`): Depot no lo declara y nada le cambia.
   */
  identidades?: Identidad[];
  /**
   * Cómo se presenta el bot ANTES de que el cliente elija local: `combinada`
   * nombra todas las marcas («Mundillantas y Competimotor»), `fija` siempre la
   * de `identidad`. Sin el campo, el nombre del negocio, como hoy.
   */
  presentacion?: { modo: "combinada" | "fija"; identidad?: string; frase?: string };
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
    /**
     * Los cuatro de abajo eran literales de Depot dentro de las piezas y los
     * mensajes; son opcionales y, sin valor, cada archivo conserva su frase de
     * siempre — así ningún perfil viejo cambia por no declararlos.
     */
    /** Bajo el precio de la cotización: «IVA y Ecovalor incluidos». */
    impuestosIncluidos?: string;
    /** Bajo el precio cuando NO hay descuento: «Precio directo de distribuidor». */
    precioSinDescuento?: string;
    /** Nota al pie de las listas en texto: «Precios por unidad incluyen IVA y Ecovalor.» */
    notaDePrecios?: string;
    /** Nota de la cotización en texto: «Precio incluye IVA y Ecovalor.» */
    notaDePrecioUnitario?: string;
    /**
     * Cuotas sin intereses que la plantilla día y noche calcula sobre el total
     * («3 cuotas de $X · 6 cuotas de $Y»). Depot: [3, 6]. A diferencia de los
     * textos de arriba, SIN el campo no se dibuja ninguna: una cuota es una
     * promesa de pago, y un negocio que no la declaró no la ofrece. Es texto
     * de pieza; la verdad comercial es la política (`politica.cuotasSinIntereses`).
     */
    cuotasSinIntereses?: number[];
  };
  /** Sin esto no salen pre-facturas mensuales (negocio sin servicio facturado). */
  facturacion?: Facturacion;
  /**
   * El INCLUYE con el que arranca la tabla `benefits` de una base de este
   * negocio (migración 032, una sola vez: después manda Ajustes → Promociones).
   * `minQuantity` = solo aplica comprando esa cantidad o más. Depot no lo
   * declara: su INCLUYE lo sembró 008_benefits.
   */
  beneficiosDeArranque?: Array<{ text: string; minQuantity?: number }>;
  /**
   * Valores NUMÉRICOS del perfil que todavía son un supuesto y no pueden llevar
   * la marca `[PENDIENTE]` (coordenadas, garantías en 0). `faltantesDelPerfil`
   * los suma a la lista para que el panel los muestre junto a los textos.
   */
  pendientesNumericos?: string[];
}

/**
 * EL CANDADO DE LO PENDIENTE (R-10): un valor que empieza con `[PENDIENTE]`
 * es una nota para nosotros, nunca un texto para el cliente.
 *
 * Existe porque el perfil de un cliente nuevo arranca con huecos (garantías,
 * formas de pago, el nombre del vendedor) y la alternativa —inventar un valor
 * verosímil— es peor: el bot prometería cosas que nadie confirmó. Lo pendiente
 * se escribe como `[PENDIENTE] <qué falta>`, el panel lo lista, y todo texto
 * de cara al cliente pasa por `sinPendiente` antes de salir.
 */
export const esPendiente = (valor: string | null | undefined): boolean =>
  typeof valor === "string" && valor.trimStart().startsWith("[PENDIENTE]");

/** El valor si está confirmado; el respaldo neutro (u omisión) si está pendiente. */
export function sinPendiente(valor: string | null | undefined, respaldo = ""): string {
  if (valor == null) return respaldo;
  return esPendiente(valor) ? respaldo : valor;
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
export function nombreEnDosTonos(perfil: PerfilDeNegocio, nombre = perfil.nombre): Array<[string, boolean]> {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .map((palabra, i) => [palabra.toUpperCase(), i > 0]);
}

/** La leyenda del encabezado de las piezas: «QUITO · DESDE 1996». */
export function leyendaDelEncabezado(perfil: PerfilDeNegocio): string {
  // `sinPendiente`: un dato sin confirmar se omite de la leyenda, no se dibuja.
  const partes = [sinPendiente(perfil.ciudad), sinPendiente(perfil.piezas.antiguedad)].filter(Boolean);
  return partes.join(" · ").toUpperCase();
}

/**
 * Las iniciales del negocio, en mayúsculas: «Depot Tire» → `DT`.
 *
 * Con una sola palabra toma sus dos primeras letras, para que el prefijo de los
 * cupones nunca quede de una sola letra.
 */
export function inicialesDelNegocio(perfil: PerfilDeNegocio): string {
  // Salen de la PRESENTACIÓN y no del nombre: el papelito del cupón lleva la
  // marca con la que el bot se presentó. Para Depot es lo mismo («Depot Tire»
  // → DT); «Mundillantas y Competimotor» da MC, no una «Y» en el medio.
  const CONECTORES = new Set(["y", "e", "o", "u", "de", "del", "la", "el", "los", "las"]);
  const palabras = fraseDePresentacion(perfil)
    .split(/\s+/)
    .filter((palabra) => palabra && !CONECTORES.has(sinTildes(palabra).toLowerCase()));
  const iniciales = palabras.map((palabra) => sinTildes(palabra)[0]).join("");
  return (iniciales.length >= 2 ? iniciales : sinTildes(palabras[0] ?? "X").slice(0, 2)).toUpperCase();
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
  // Un local cuya forma de nombrarlo sigue pendiente no se pinta en el pie.
  const nombres = perfil.locales.map((l) => sinPendiente(l.nombreCorto)).filter(Boolean);
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
  const confirmada = sinPendiente(antiguedad);
  return confirmada ? `${locales} · ${confirmada}` : locales;
}

/**
 * La frase con la que el negocio se nombra al presentarse: el nombre a secas
 * (Depot), o las marcas comerciales según `presentacion` («Mundillantas y
 * Competimotor»). Es la fuente del saludo y del prefijo de los cupones.
 */
export function fraseDePresentacion(perfil: PerfilDeNegocio): string {
  const presentacion = perfil.presentacion;
  const identidades = perfil.identidades?.length
    ? perfil.identidades
    : [{ id: perfil.id, nombre: perfil.nombre }];
  if (!presentacion) return perfil.nombre;
  if (presentacion.frase) return presentacion.frase;
  if (presentacion.modo === "fija") {
    return identidades.find((i) => i.id === presentacion.identidad)?.nombre ?? perfil.nombre;
  }
  return identidades.map((i) => i.nombre).join(" y ");
}

/**
 * «Soy Martín, de Depot Tire». Con `presentacion` combinada, «Soy <vendedor>,
 * de <frase>»; con el vendedor todavía sin nombre, «Soy el asistente de
 * <frase>» — un nombre `[PENDIENTE]` no puede llegarle a un cliente.
 */
export function firmaDePresentacion(perfil: PerfilDeNegocio): string {
  const frase = fraseDePresentacion(perfil);
  if (esPendiente(perfil.vendedor.nombre)) return `Soy el asistente de ${frase}`;
  return `Soy ${perfil.vendedor.nombre}, de ${frase}`;
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
