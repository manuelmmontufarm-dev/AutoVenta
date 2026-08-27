/**
 * Los días de la semana COMO LOS ESCRIBE LA GENTE.
 *
 * El 24-ago un cliente cerró su visita con «X eso el juebes». El bot entendió
 * perfecto y contestó «Listo, jueves de 4 a 5 pm»… pero el extractor de
 * compromisos buscaba la cadena literal «jueves», no la encontró, y la visita
 * nunca se registró: sin `visit_date` no hubo aviso al asesor, no salió el
 * cupón, y el portón `visita_agendada` dejó pasar dos seguimientos que le
 * volvieron a preguntar el día que acababa de dar.
 *
 * Una letra cambiada no puede costar una venta. Estos clientes escriben desde
 * el celular, con prisa y sin corrector: «juebes», «savado», «mierkoles»,
 * «domigo», «vier». La lista de typos no se puede enumerar — se reconoce el
 * SONIDO y se tolera la distancia de edición.
 *
 * Dos pasos:
 *
 *  1. **Clave fonética.** Se lleva la palabra a cómo suena en el español que se
 *     teclea aquí: b=v, s=z=c(e/i), j=g(e/i), h muda, ll=y, qu=k, y las letras
 *     dobles colapsan. Así «savado» y «sábado» son la MISMA clave y no hace
 *     falta ninguna distancia.
 *  2. **Distancia de Damerau-Levenshtein** sobre esa clave, con un umbral corto
 *     (1 edición; 2 solo en «miércoles», que es larga). Damerau y no
 *     Levenshtein porque la falta más común al teclear es la transposición
 *     («jeuves»), y para Levenshtein eso cuesta 2.
 *
 * El riesgo de un matcher difuso es el falso positivo: leer «¿cuándo vienes?»
 * como «viernes» y agendarle una visita a nadie. Contra eso van tres candados:
 * la lista `NUNCA_ES_DIA` de palabras castellanas que caen cerca de un día, el
 * umbral corto, y la exigencia de que si la distancia es 2 la palabra empiece
 * igual.
 */

/** Índice de `Date.getUTCDay()`: domingo = 0. */
export const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

/**
 * Palabras que suenan a día y no lo son. Sin esta lista «¿cuándo vienes?» se
 * agenda como viernes y «lo mandamos por partes» como martes.
 */
const NUNCA_ES_DIA = new Set([
  "viene", "vienes", "vienen", "viena", "bien", "bienes", "bienvenido",
  "parte", "partes", "aparte", "aparta", "carta", "cartas", "cortes",
  "lunas", "luces", "lentes", "llantes",
  "dominio", "domino", "domicilio",
  "jueces", "nueve", "nueves", "llueve", "lleve", "llaves", "llave",
  "sabe", "sabes", "saben", "sabor",
  "mares", "marca", "marcas", "martillo", "marzo",
]);

export function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Cómo suena la palabra en el español que se teclea en Ecuador.
 *
 * El orden importa: `qu`→k antes de tocar la c, y la g solo se vuelve j delante
 * de e/i (guerra ≠ jerra). Al final las dobles colapsan, que es la otra falta
 * frecuente del teclado del celular («lunnes», «sabbado»).
 */
export function claveFonetica(palabra: string): string {
  let s = normalizarTexto(palabra).replace(/[^a-zñ]/g, "");
  s = s.replace(/ñ/g, "n");
  s = s.replace(/h/g, "");        // muda: «hueves», «mihercoles»
  s = s.replace(/qu/g, "k");
  s = s.replace(/gu([ei])/g, "g$1");
  s = s.replace(/g([ei])/g, "j$1");
  s = s.replace(/c([ei])/g, "s$1");
  s = s.replace(/[cq]/g, "k");
  s = s.replace(/z/g, "s");
  s = s.replace(/v/g, "b");
  s = s.replace(/ll/g, "y");
  s = s.replace(/(.)\1+/g, "$1");
  return s;
}

/** Damerau-Levenshtein (alineación óptima): la transposición cuesta 1, no 2. */
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Cuántas ediciones se le perdonan a una palabra de este largo. */
function umbral(clave: string): number {
  return clave.length >= 8 ? 2 : 1;
}

const CLAVES_DIA = Object.keys(DIAS_SEMANA).map((nombre) => ({
  nombre,
  indice: DIAS_SEMANA[nombre],
  clave: claveFonetica(nombre),
}));

/**
 * ¿Esta palabra suelta es un día de la semana, aunque esté mal escrita?
 *
 * Acepta también la abreviatura («sab», «vier», «mier»): se exige que sea
 * prefijo de la clave del día y que tenga al menos 3 letras, porque con dos
 * («ma», «do») cualquier cosa cae dentro.
 */
export function diaDeLaPalabra(palabra: string): { nombre: string; indice: number } | null {
  const limpia = normalizarTexto(palabra).replace(/[^a-zñ]/g, "");
  if (limpia.length < 3) return null;
  if (NUNCA_ES_DIA.has(limpia)) return null;
  const clave = claveFonetica(palabra);
  if (!clave) return null;

  let mejor: { nombre: string; indice: number; d: number } | null = null;
  for (const dia of CLAVES_DIA) {
    if (dia.clave === clave) return { nombre: dia.nombre, indice: dia.indice };
    if (clave.length >= 3 && dia.clave.startsWith(clave)) {
      return { nombre: dia.nombre, indice: dia.indice };
    }
    const d = distancia(clave, dia.clave);
    // Con dos ediciones de por medio ya no se distingue una falta de otra
    // palabra: se exige que al menos arranque igual.
    if (d > umbral(dia.clave)) continue;
    if (d === 2 && clave[0] !== dia.clave[0]) continue;
    if (!mejor || d < mejor.d) mejor = { nombre: dia.nombre, indice: dia.indice, d };
  }
  return mejor ? { nombre: mejor.nombre, indice: mejor.indice } : null;
}

/**
 * «SANTO DOMINGO» ES UNA PROVINCIA, NO UN DÍA.
 *
 * Producción, 27-ago-2026, conv 11901. El cliente escribió «Soy de provincia de
 * santo domingo» y el sistema le anotó `visit_date = 2026-08-30` —el domingo—,
 * puso su frase como compromiso de visita y le abrió al asesor la tarea
 * «Prometió: "Soy de provincia de santo domingo"». Nunca prometió nada: dijo de
 * dónde es. Un cliente de Santo Domingo de los Tsáchilas es exactamente el que
 * NO puede pasar por el local, así que el dato se guardó al revés de lo que
 * significaba.
 *
 * El candado es por PALABRA ANTERIOR, no por mensaje entero: «soy de santo
 * domingo pero voy el sábado» tiene que seguir agendando el sábado. Por eso no
 * alcanzaba con meter «domingo» en `NUNCA_ES_DIA` —ahí se perdería el domingo
 * de verdad— ni con silenciar los mensajes que digan «soy de».
 */
const ANTES_ES_LUGAR = new Set(["santo", "sto", "santa", "sta", "san"]);

/** El primer día de la semana que aparezca en la frase, escrito como sea. */
export function diaEnTexto(texto: string): { nombre: string; indice: number } | null {
  const palabras = normalizarTexto(texto).split(/[^a-zñ0-9]+/);
  for (let i = 0; i < palabras.length; i += 1) {
    const dia = diaDeLaPalabra(palabras[i]);
    if (!dia) continue;
    if (i > 0 && ANTES_ES_LUGAR.has(palabras[i - 1])) continue;
    return dia;
  }
  return null;
}

export type DiaRelativo = "hoy" | "manana" | "pasado_manana";

const HOY = new Set(["hoy", "oy", "hoi", "oi", "hoyy", "ahora", "ahorita"]);
/** «la mañana» es una hora del día, no el día siguiente. */
const ANTES_DE_HORA = new Set(["la", "las", "esta", "estas", "mediodia"]);

/**
 * «hoy», «mañana» y «pasado mañana», con sus faltas.
 *
 * `pasado mañana` va PRIMERO a propósito: contiene «mañana» dentro, y leerlo
 * como el día siguiente adelantaba la visita 24 horas.
 */
export function relativoEnTexto(texto: string): DiaRelativo | null {
  const palabras = normalizarTexto(texto).split(/[^a-zñ0-9]+/).filter(Boolean);
  const esManana = (p: string) => {
    const c = claveFonetica(p);
    return c.length >= 4 && distancia(c, "manana") <= 1;
  };
  for (let i = 0; i < palabras.length; i += 1) {
    if (!esManana(palabras[i])) continue;
    const previa = palabras[i - 1] ?? "";
    const antepenultima = palabras[i - 2] ?? "";
    if (previa === "pasado" || (previa === "manana" && antepenultima === "pasado")) return "pasado_manana";
    if (ANTES_DE_HORA.has(previa)) continue; // «en la mañana», «esta mañana»
    if (previa === "pasado") return "pasado_manana";
    return "manana";
  }
  if (palabras.some((p) => HOY.has(p))) return "hoy";
  return null;
}

/** Franjas habladas, cuando el cliente no da número: «en la tarde». */
const PERIODOS: Array<{ prueba: RegExp; etiqueta: string; hora: number }> = [
  { prueba: /\b(?:al\s+)?mediod[ií]a\b/, etiqueta: "al mediodía", hora: 12 },
  { prueba: /\b(?:en|por|a)\s+la\s+ma[nñ]ana\b|\bma[nñ]anita\b|\btempran[oi]\b/, etiqueta: "en la mañana", hora: 9 },
  { prueba: /\b(?:en|por|a)\s+la\s+tarde\b|\btardecita\b/, etiqueta: "en la tarde", hora: 16 },
  { prueba: /\b(?:en|por|a)\s+la\s+noche\b/, etiqueta: "en la noche", hora: 18 },
];

/**
 * Cómo se lee un número suelto de hora en un país donde el local abre 08:30 y
 * cierra 17:30: «paso a las 4» es a las 16:00, no a las 4 de la mañana.
 */
function aVeinticuatro(hora: number, marca: string | null): number | null {
  if (hora < 1 || hora > 24) return null;
  if (marca === "am") return hora === 12 ? 0 : hora;
  if (marca === "pm") return hora === 12 ? 12 : (hora % 12) + 12;
  if (hora >= 13) return hora;
  if (hora === 12) return 12;
  return hora >= 8 ? hora : hora + 12;
}

function marcaDe(texto: string): string | null {
  const n = normalizarTexto(texto);
  if (/\b(?:pm|p\.m\.?|de la tarde|de la noche)\b/.test(n)) return "pm";
  if (/\b(?:am|a\.m\.?|de la manana|de la madrugada)\b/.test(n)) return "am";
  return null;
}

const SUFIJO = (h: number) => (h < 12 ? "am" : "pm");
const enDoce = (h: number) => (h % 12 === 0 ? 12 : h % 12);

/**
 * La hora que el cliente dijo, para poder devolvérsela: «le esperamos el jueves
 * DE 4 A 5 PM». Sin esto el recordatorio decía una hora inventada (las 10:00,
 * que es el relleno con el que se guardaba `visit_date`) o no decía ninguna.
 *
 * Devuelve la etiqueta lista para escribir y la hora en 24 h para fijar la
 * fecha; `null` cuando el cliente no dio hora, que es lo más común.
 */
export function franjaHoraria(texto: string): { etiqueta: string; hora: number } | null {
  const n = normalizarTexto(texto);
  const marca = marcaDe(n);

  const rango = n.match(/\bde\s*(?:las?\s*)?(\d{1,2})(?:[:h](\d{2}))?\s*(?:a|hasta|hast|asta)\s*(?:las?\s*)?(\d{1,2})(?:[:h](\d{2}))?/);
  if (rango) {
    const desde = aVeinticuatro(Number(rango[1]), marca);
    const hasta = aVeinticuatro(Number(rango[3]), marca);
    if (desde !== null && hasta !== null) {
      const mismoSufijo = SUFIJO(desde) === SUFIJO(hasta);
      const etiqueta = mismoSufijo
        ? `de ${enDoce(desde)} a ${enDoce(hasta)} ${SUFIJO(hasta)}`
        : `de ${enDoce(desde)} ${SUFIJO(desde)} a ${enDoce(hasta)} ${SUFIJO(hasta)}`;
      return { etiqueta, hora: desde };
    }
  }

  const puntual = n.match(/\ba\s*(?:las?\s*)?(\d{1,2})(?:[:h](\d{2}))?\s*(?:am|pm|a\.m\.?|p\.m\.?)?/)
    ?? n.match(/\b(\d{1,2})\s*(?:am|pm|a\.m\.?|p\.m\.?)\b/);
  if (puntual) {
    const hora = aVeinticuatro(Number(puntual[1]), marca);
    const minutos = puntual[2] ? `:${puntual[2]}` : "";
    if (hora !== null) return { etiqueta: `a las ${enDoce(hora)}${minutos} ${SUFIJO(hora)}`, hora };
  }

  for (const periodo of PERIODOS) {
    if (periodo.prueba.test(n)) return { etiqueta: periodo.etiqueta, hora: periodo.hora };
  }
  return null;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
/** «setiembre» es correcto en español y se escribe tanto como «septiembre». */
const CLAVES_MES = MESES.map((nombre, i) => ({ mes: i, clave: claveFonetica(nombre) }))
  .concat([{ mes: 8, clave: claveFonetica("setiembre") }]);

function mesDeLaPalabra(palabra: string): number | null {
  const clave = claveFonetica(palabra);
  if (clave.length < 3) return null;
  for (const m of CLAVES_MES) {
    if (m.clave === clave || m.clave.startsWith(clave)) return m.mes;
    if (distancia(clave, m.clave) <= umbral(m.clave) && clave[0] === m.clave[0]) return m.mes;
  }
  return null;
}

/**
 * La fecha de calendario: «3 de septiembre», «3 sep», «3/9».
 *
 * Falta descubierta en el simulador (26-ago): el cliente reagendó con «mejor el
 * 3 de septiembre», el bot contestó que sí, y el registro se quedó en el jueves
 * anterior — el extractor solo sabía de días de la semana. Un mes mal escrito
 * («setiembre», «septiembe») cuenta igual que uno bien escrito.
 *
 * Si la fecha ya pasó, se entiende para el año que viene: en diciembre, «el 3
 * de enero» es enero del año siguiente, no el que ya pasó.
 */
/**
 * Un día del mes SUELTO: «el 30», «para el 3», o el número a secas.
 *
 * Producción, 27-ago-2026 (conv 3, ciclo 17). El bot preguntó el día, el cliente
 * contestó «el 30», y no se guardó NADA: `visit_date` y `customer_commitment`
 * quedaron en null. Peor que perder el dato, el bot le dijo igual «Listo, 30 en
 * Depot Tire Quito Sur y ya le avisé al asesor» y le mandó la alerta al vendedor
 * — una visita confirmada de palabra que no existía para el sistema. Y como el
 * candado del cierre sí veía el hueco, le volvió a preguntar el día al cliente
 * en el mensaje siguiente. Manuel lo vio en su teléfono: «no sé por qué me
 * volvió a preguntar».
 *
 * `fechaDeCalendario` no lo cubría a propósito: exige el mes («30 de agosto») o
 * el separador («30/8») para no leer una medida de llanta como una fecha.
 *
 * LA REGLA QUE LO HACE SEGURO es el artículo. Solo cuenta si el número viene
 * detrás de «el», «del», «día» o «para el», o si ES el mensaje entero. Así «a
 * las 4» sigue siendo una hora, «4 llantas» una cantidad y «205/55» una medida.
 * Y aun así el llamador solo debe usarla cuando acabamos de preguntar el día.
 */
export function diaDelMesSuelto(texto: string, ahora: Date): { mes: number; dia: number; anio: number } | null {
  const n = normalizarTexto(texto);
  // Una medida o una fracción nunca es un día: se descarta el mensaje entero.
  if (/\d\s*[\/-]\s*\d/.test(n)) return null;
  const conArticulo = n.match(/\b(?:para\s+)?(?:el|del|dia)\s+(\d{1,2})\b/);
  const soloElNumero = n.trim().match(/^(\d{1,2})$/);
  const crudo = conArticulo?.[1] ?? soloElNumero?.[1];
  if (!crudo) return null;
  const dia = Number(crudo);
  if (dia < 1 || dia > 31) return null;

  // El próximo día con ese número: si ya pasó este mes, es el mes que viene.
  const local = new Date(ahora.getTime() - 5 * 3_600_000);
  const hoy = local.getUTCDate();
  let mes = local.getUTCMonth();
  let anio = local.getUTCFullYear();
  if (dia < hoy) {
    mes += 1;
    if (mes > 11) { mes = 0; anio += 1; }
  }
  // El mes que viene puede no tener ese día (un «31» en septiembre).
  if (new Date(Date.UTC(anio, mes, dia)).getUTCMonth() !== mes) return null;
  return { mes, dia, anio };
}

export function fechaDeCalendario(texto: string, ahora: Date): { mes: number; dia: number; anio: number } | null {
  const n = normalizarTexto(texto);
  let dia: number | null = null;
  let mes: number | null = null;

  const conNombre = n.match(/\b(\d{1,2})\s*(?:de\s+|-|\/)?\s*([a-zñ]{3,12})\b/);
  if (conNombre) {
    const posible = mesDeLaPalabra(conNombre[2]);
    if (posible != null) { dia = Number(conNombre[1]); mes = posible; }
  }
  if (mes == null) {
    // Numérica, siempre día/mes: en Ecuador nadie escribe 9/3 por el 3 de
    // septiembre. Se exige el separador para no leer una medida («205/55»).
    const numerica = n.match(/\b(\d{1,2})\s*[\/-]\s*(\d{1,2})\b(?!\s*[\/-]?\s*r?\d)/);
    if (numerica) {
      const d = Number(numerica[1]);
      const m = Number(numerica[2]);
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) { dia = d; mes = m - 1; }
    }
  }
  if (dia == null || mes == null || dia < 1 || dia > 31) return null;

  const local = new Date(ahora.getTime() - 5 * 3_600_000);
  let anio = local.getUTCFullYear();
  const candidato = Date.UTC(anio, mes, dia);
  if (candidato < Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())) anio += 1;
  return { mes, dia, anio };
}
