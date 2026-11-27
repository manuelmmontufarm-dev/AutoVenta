/**
 * LA POLÍTICA COMERCIAL — cómo vende cada cliente, en un lugar.
 *
 * El perfil (`negocios/<id>.ts`) dice QUIÉN es el negocio; esto dice CÓMO
 * vende: formas de pago, cuotas, descuento por efectivo, beneficio de redes,
 * si vende a distancia, el juego comercial, cómo se arma la escalera y qué
 * productos se derivan al asesor. Hasta el 4-nov-2026 todo esto era de Depot y
 * estaba clavado en el código común (`datosDelNegocio.ts`, `beneficioDeRedes.ts`,
 * `prepararSalida.ts`, el prompt y el guardián): el segundo cliente habría
 * prometido «3 y 6 meses sin intereses» y alineación gratis sin haberlo
 * ofrecido nunca.
 *
 * REGLAS DE ESTE MÓDULO (las empaqueta el panel a través de
 * `agent/compactPlaybook.ts` → `negocio/index.ts`):
 *  · Solo literales e imports de `negocio/`: nada de `node:fs`, `domain/` ni
 *    `services/`.
 *  · Un texto que un cliente distinto tendría distinto vive acá; una conducta
 *    que es igual para cualquier llantera se queda en el dominio.
 */
import { negocio } from "./index.js";
import { POLITICA_DEPOT } from "./politicas/depot.js";
import { POLITICA_EJEMPLO } from "./politicas/ejemplo.js";
import { POLITICA_MUNDILLANTAS } from "./politicas/mundillantas.js";

export interface PoliticaComercial {
  /**
   * Las formas de pago que el negocio acepta, en minúsculas («efectivo»,
   * «tarjeta», «transferencia»). VACÍO = todavía no están confirmadas: el bot
   * no promete ninguna, el guardián no las recibe como hecho y los pasos de
   * pago de la salida devuelven el texto sin tocar.
   */
  formasDePago: string[];
  /** «3 y 6 meses sin intereses», o null si no hay diferido sin intereses. */
  cuotasSinIntereses: string | null;
  /**
   * La frase COMPLETA del descuento por pagar en efectivo («Si paga en
   * efectivo sí hay un descuento, que se lo confirman en el local.»), o null
   * si el negocio no lo da — con null se apaga el candado `sin_descuento_negado`.
   */
  descuentoEnEfectivo: string | null;
  /**
   * ¿Las cotizaciones de este negocio traen descuento? Si es false, la pregunta
   * del día de la visita no puede decir «le aplican el descuento de su
   * cotización»: en Competimotor no hay descuento y la frase salía en 16 de 18
   * cotizaciones de la prueba del 18-nov (y un seguimiento la copió).
   */
  cotizacionConDescuento: boolean;
  /**
   * ¿Un «no gracias» A SECAS después de una lámina o una cotización es «esa no»
   * y se le ofrece otra? (Manuel, 20-nov: «no gracias» no es venta perdida, es
   * «no quiero esa» o «quiero otra opción».) Con true sale la lámina con las de
   * la medida que no vio, o la pregunta de qué busca
   * (`services/otraOpcionTrasNoGracias.ts`). Con false se despide con el texto
   * de siempre. El desistimiento explícito («no gracias ya no», «ya no», «ya
   * compré») se despide en los dos casos.
   * Depot: false (su despedida es texto aprobado; cambiarlo es decisión de
   * Manuel). Competimotor: true.
   */
  noGraciasPideOtraOpcion: boolean;
  /**
   * OPCIONAL: al cliente NUNCA se le dice «no hay», «no tengo», «no me aparece
   * stock» ni «no puedo darle precio» (Competimotor, Carlos y Jenny,
   * 21-nov-2026: «en nuestro lema comercial no existe la palabra no hay»). Con
   * true: lo pedido sin stock NO se nombra: «Claro… le recomiendo estas
   * opciones» con las más cercanas (24-nov: si preguntó el precio, «ya le
   * estoy revisando el valor promocional…»), el Guardián y
   * un candado corrigen lo que se escape y SIEMPRE sale un aviso al asesor
   * para que le busque una solución (`domain/sinNoHay.ts`,
   * `services/sinStockAlAsesor.ts`). Sin el campo (Depot): nada cambia.
   */
  nuncaDecirNoHay?: boolean;
  /**
   * El texto del beneficio por venir de redes sociales, palabra por palabra,
   * o null si el negocio no lo ofrece: entonces no se menciona en ninguna salida.
   */
  beneficioDeRedes: string | null;
  /** ¿Vende sin que el cliente pase por el local (paga a distancia y se envía)? */
  vendeADistancia: boolean;
  /**
   * Datos del negocio que el cliente pregunta y que el negocio CONFIRMÓ, cada
   * uno en una frase y palabra por palabra (envíos, parte de pago, cómo se
   * atiende). Van al prompt y a los hechos del guardián: el bot los puede
   * afirmar y el revisor no los tacha. Sin el campo (Depot), nada cambia.
   */
  hechosConfirmados?: string[];
  /** Servicios que ofrece además de llantas, para el prompt («mantenimiento preventivo automotriz»). */
  serviciosQueOfrece: string[];
  /** «quiteño»: el gentilicio del tono cálido del prompt. */
  gentilicio: string;
  /** «Español natural de Ecuador»: la línea de idioma del playbook. */
  variedadDeEspanol: string;
  /** El juego comercial por defecto (Depot: 4). */
  juegoCompleto: number;
  /**
   * Con `true`, el escalón premium/equilibrio/económica de las tres opciones
   * sale del PRECIO dentro del conjunto mostrado, no de la escalera de marcas.
   * Para un cliente multimarca cuyas marcas la escalera no conoce.
   */
  escalonPorPrecio: boolean;
  /**
   * OPCIONAL: qué llantas van primero en la lámina, por MARCA y no por precio
   * (Competimotor, reunión 18-nov-2026). Sin el campo (Depot) la lámina sale de
   * la escalera de siempre. Las cuentas viven en `domain/recomendacionPorMarca.ts`.
   */
  recomendacionPorMarca?: ReglaDeRecomendacion;
  /** Productos que el bot NO cotiza y deriva al asesor («lubricantes», «baterías»…). */
  productosQueDerivaAlAsesor: string[];
  /** Cómo nombran las reglas internas al humano que recibe los avisos («Manuel»). */
  asesorEnReglas: string;
  /**
   * OPCIONAL, fuera de la lista de §3.2 (Sprint 4): las marcas que se le dan a
   * Whisper como sesgo para que las escriba bien. Depot incluye «Wildpeak»
   * (una línea de Falken que la gente nombra sola) y no sigue el orden de
   * `perfil.marcas`; sin este campo se usan las marcas del perfil.
   */
  vocabularioDeMarcas?: string[];
  /**
   * OPCIONAL: la promoción de temporada vigente (Black Friday de Depot,
   * noviembre 2026). Sin el campo —o fuera de sus fechas— no existe: ni el
   * precio, ni la pieza, ni el vendedor, ni el guardián la mencionan. Las
   * cuentas viven en `domain/promocionDeTemporada.ts`; acá solo los datos.
   */
  promocionDeTemporada?: PromocionDeTemporada;
  /**
   * OPCIONAL: el descuento que el negocio da SIEMPRE sobre el precio de lista
   * (Depot: −25 %, el «precio hoy» de cada llanta). Se siembra una vez como
   * promoción «para todas las llantas» en la pestaña Promociones, y desde ahí
   * el negocio lo prende, lo apaga o le pone fechas (24-nov-2026). Este valor
   * solo manda mientras no esté sembrado o si la base no contesta.
   */
  descuentoDeSiempre?: { nombre: string; porcentaje: number };
  /**
   * OPCIONAL: con qué lista se COTIZA cuando el catálogo trae precio por forma
   * de pago (Fénix: Precio B con tarjeta, C en efectivo o transferencia).
   * `"tarjeta"` (Competimotor, Carlos Romero, 20-nov-2026: «dar precio 2 y
   * cotizar en P2 y P3»): la cotización, la pieza, las cuotas y todo lo que lee
   * el precio del catálogo salen del Precio B; el Precio A no se usa nunca, y
   * una llanta sin B válido no se cotiza (se lista como descartada). En
   * efectivo, transferencia o si pide descuento se ofrece el C
   * (`services/preciosPorPago.ts`). Sin el campo (Depot): el precio del
   * catálogo de siempre.
   */
  precioDeCotizacion?: "tarjeta";
  /**
   * OPCIONAL: la pregunta de la lista numerada («¿Le cotizo la 1, la 2 o la
   * 3?», y su repregunta «¿Cuál le cotizo, la 1…?») sale como mensaje de
   * WhatsApp con botones «1 · KENDA KR29», «2 · …», «3 · …». Tocar uno entra
   * como si el cliente hubiera escrito «la 2» (`domain/botones.ts`).
   * Competimotor, 20-nov-2026 (capacitación: Carlos vio a clientes contestar
   * «uno» y Manuel pidió los botones). Sin el campo (Depot): la pregunta sale
   * como texto, igual que siempre; se puede prender acá cuando Depot quiera.
   * Solo en la respuesta del turno (dentro de la ventana de 24 h): nunca en
   * plantillas ni seguimientos.
   */
  botonesDeOpciones?: boolean;
  /**
   * OPCIONAL: precios de promoción POR CÓDIGO, con un vencimiento exacto
   * (Black Friday de Competimotor, 20-nov-2026). Rebajan el precio de hoy de
   * esas llantas; el de siempre queda como el tachado. Las cuentas viven en
   * `domain/preciosEspeciales.ts`. Sin el campo, o vencido, no existe.
   */
  preciosEspeciales?: PreciosEspeciales | null;
  // Sprint 4 — familia F-05 (seguimientos), auditoría Competimotor 26-nov-2026.
  /**
   * OPCIONAL: cómo hace seguimiento este negocio. Sin el campo (Depot) los
   * seguimientos salen como siempre. Ver `PoliticaDeSeguimientos`.
   */
  seguimientos?: PoliticaDeSeguimientos;
}

// Sprint 4 — familia F-05 (seguimientos).
/** Lo que cambia en los seguimientos de un negocio (Competimotor, 26-nov-2026). */
export interface PoliticaDeSeguimientos {
  /**
   * El cliente pidió tiempo («yo le escribo», «por ahora no puedo», «reúno los
   * billetes»): se anota como hecho (`follow_up_reason`), se cancelan los
   * seguimientos automáticos del ciclo y queda UNA revisión del asesor días
   * después, con la cotización vigente a mano (chats 1273, 1011, 538, 1247).
   */
  respetarPlazoDelCliente: boolean;
  /** Cuántos días después del plazo pedido revisa el asesor (si el cliente no dio fecha). */
  diasHastaRetomar: number;
  /**
   * Los dos seguimientos dicen cosas distintas y cierran con sí/no: el 1.º la
   * recomendada con su precio en efectivo, el 2.º lo incluido + la dirección +
   * «¿Le agendo una cita?». Este es el texto de lo incluido, palabra por palabra.
   */
  incluidoEnLaCompra: string;
  /** La retomada tras humano sale partida en mensajes: el «---» nunca le llega al cliente (1331, 1344). */
  retomadaSinSeparador: boolean;
  /**
   * Un día dentro de una pregunta («el sábado atienden?», «el viernes hay más
   * descuento») no registra visita (1790). Sin el campo (Depot) solo el nombre
   * de la promoción («viernes negro») deja de ser un día. Ver `domain/fechaDeVisita.ts`.
   */
  preguntaConDiaNoAgenda: boolean;
  /**
   * Sin cotización no sale el recordatorio de la víspera (1456: «ya tenemos
   * listas sus llantas» con la medida que pidió, no la cotizada). Sin el campo
   * (Depot) sale como siempre, con la medida de la ficha.
   */
  recordatorioSoloConCotizacion: boolean;
}

/** Una lista de precios de promoción por código, con su fin. */
export interface PreciosEspeciales {
  /** «Black Friday»: como se nombra en la pieza, el texto y los hechos. */
  nombre: string;
  /** El primer instante vigente (ISO con zona: «2026-11-20T00:00:00-05:00»). */
  desde: string;
  /** El ÚLTIMO instante vigente (ISO con zona: «2026-11-30T23:59:59-05:00»). Pasado, se apaga solo. */
  hasta: string;
  /** «hasta el lunes 30 de noviembre»: para la franja de la pieza. */
  vigenciaLarga: string;
  /** «hasta el lunes 30-nov»: para el texto y los hechos del vendedor. */
  vigenciaCorta: string;
  /** Cada llanta: su código de catálogo, su medida (candado) y el precio final por llanta con IVA. */
  llantas: ReadonlyArray<{ codigo: string; medida: string; precioConIva: number }>;
}

/** Las marcas de la casa primero, más las de mayor inventario; «qué más tiene» con tope. */
export interface ReglaDeRecomendacion {
  /** Las marcas que van primero (en mayúsculas, como `CatalogItem.brand`), una opción por marca. */
  marcasPrimero: string[];
  /** Cuántas opciones extra, de las DEMÁS marcas, por mayor inventario en la medida. */
  extrasPorInventario: number;
  /** Tope de opciones que el cliente ve en una medida sumando las láminas («qué más tiene»). */
  topeConMasOpciones: number;
  /** Cuántas tarjetas caben en una lámina (la plantilla «día y noche» dibuja 6). */
  porLamina: number;
}

/** Una promoción con fechas: llantas, servicios y productos con su rebaja. */
export interface PromocionDeTemporada {
  /** «Black Friday»: el nombre que ve el cliente. */
  nombre: string;
  /** «el Black Friday se vive TODO NOVIEMBRE»: la bajada de la franja. */
  lema: string;
  /** Primer y último día vigentes, inclusive, en hora de Ecuador (YYYY-MM-DD). */
  desde: string;
  hasta: string;
  /**
   * Las llantas pares (2.ª, 4.ª…) de la cotización con `porcentaje` % menos
   * sobre el precio de LISTA, solo de estas marcas (en mayúsculas, como
   * `CatalogItem.brand`). Reemplaza el descuento del catálogo: las impares van
   * a precio de lista.
   */
  segundaLlanta: { porcentaje: number; marcas: string[] } | null;
  /**
   * Las marcas que NO entran en la promo y siguen con su descuento de siempre
   * (Depot: Winrun con el 25 %). Solo para DECIRLO —saludo, vendedor,
   * guardián—: el precio sigue saliendo del catálogo.
   */
  otrasLlantas?: { porcentaje: number; marcas: string[] } | null;
  /** Servicios con su precio YA rebajado, con IVA (tabla de Joaquín, 5-nov). */
  servicios: {
    porcentaje: number;
    lista: Array<{ servicio: string; vehiculo: "auto" | "camioneta"; precioPromoConIva: number }>;
  } | null;
  /** Productos con su PVP con IVA; la rebaja se resta encima (`porcentaje`). */
  productos: {
    porcentaje: number;
    /** «cambio de aceite»: cómo lo nombra la promo. */
    categoria: string;
    lista: Array<{ nombre: string; pvpConIva: number }>;
  } | null;
  /** Lo que se regala sin condición («Revisión de 7 puntos GRATIS»). */
  gratis: string[];
}

const POLITICAS: Record<string, PoliticaComercial> = {
  depot: POLITICA_DEPOT,
  ejemplo: POLITICA_EJEMPLO,
  mundillantas: POLITICA_MUNDILLANTAS,
};

function elegirPolitica(): PoliticaComercial {
  const elegida = POLITICAS[negocio.id];
  // UN NEGOCIO SIN POLÍTICA NO ATIENDE CLIENTES CON LA DE OTRO. Caer en la de
  // Depot sería prometer sus cuotas y su beneficio a los clientes de otra
  // llantera; que no arranque es el resultado barato — el mismo criterio que
  // un NEGOCIO mal escrito en `negocio/index.ts`.
  if (!elegida) {
    throw new Error(
      `El negocio "${negocio.id}" no tiene política comercial. Políticas disponibles: ${Object.keys(POLITICAS).join(", ")}. `
      + "Creá negocio/politicas/<id>.ts y registrala en POLITICAS.",
    );
  }
  return elegida;
}

/** La política comercial viva. Se resuelve una vez, al cargar el módulo. */
export const politica: PoliticaComercial = elegirPolitica();

/**
 * Lo que la política todavía no sabe del cliente: cada texto que empieza con
 * `[PENDIENTE]` y las perillas críticas vacías. El panel lo muestra como lista
 * de arranque y el Sprint Final lo suma a `faltantes` de `/api/negocio`.
 */
export function faltantesDeLaPolitica(valores: PoliticaComercial): string[] {
  const faltantes: string[] = [];
  const pendiente = (v: string | null) => v !== null && v.startsWith("[PENDIENTE]");
  if (!valores.formasDePago.length) faltantes.push("Política · formas de pago (vacías: el bot no promete ninguna)");
  for (const forma of valores.formasDePago) if (pendiente(forma)) faltantes.push(`Política · forma de pago «${forma}»`);
  if (pendiente(valores.cuotasSinIntereses)) faltantes.push("Política · cuotas sin intereses");
  if (pendiente(valores.descuentoEnEfectivo)) faltantes.push("Política · descuento en efectivo");
  if (pendiente(valores.beneficioDeRedes)) faltantes.push("Política · beneficio de redes");
  for (const servicio of valores.serviciosQueOfrece) if (pendiente(servicio)) faltantes.push(`Política · servicio «${servicio}»`);
  if (pendiente(valores.gentilicio)) faltantes.push("Política · gentilicio");
  if (pendiente(valores.variedadDeEspanol)) faltantes.push("Política · variedad de español");
  if (pendiente(valores.asesorEnReglas)) faltantes.push("Política · nombre del asesor en las reglas");
  for (const producto of valores.productosQueDerivaAlAsesor) if (pendiente(producto)) faltantes.push(`Política · producto derivado «${producto}»`);
  return faltantes;
}
