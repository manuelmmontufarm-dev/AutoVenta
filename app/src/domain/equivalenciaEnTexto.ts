/**
 * NINGUNA MEDIDA SALE LLAMADA «EQUIVALENTE» SI NO LO ES.
 *
 * Familia 1-B (auditoría 22-24 sep-2026). La palabra «equivalente» —o «le
 * entra», «de su aro», «la más cercana»— llegó al cliente pegada a medidas que
 * no montaban o que iban para el lado contrario del que pidió, y salió por
 * cinco puertas distintas:
 *
 *  · la lámina de opciones rotulaba «equivalentes de su aro» a TODO lo que no
 *    era su medida, sin preguntar si equivalía: R380 en 165/65R13 a quien pidió
 *    aro 14 (conv 22533), KR100 en 165R14 a quien tenía 205/60R13 (22492);
 *  · la regla de `generar_cotizacion` le DICTABA al modelo «le entra la X» con
 *    la medida que fuera: «en su 235/60R17 no me queda; le entra la 215/60R17»
 *    (23080, −3,4 %, y la 235/60R17 sí estaba: la cotizó un minuto después);
 *  · la búsqueda de alternativas ordenaba por cercanía sin mirar hacia dónde
 *    pidió moverse el cliente: «me gustaría un poco más ancha» → 215/65R16, la
 *    misma sección (22975);
 *  · el modelo escribiendo a mano: «una opción más alta cercana sería
 *    235/65R16» (+3,4 %, 23021); «238 70 16» contestado con una 215/65R16 sin
 *    aclarar la medida (15644);
 *  · y el guardián, cuyo freno restauraba el borrador con el dato falso (23080).
 *
 * El juez ya existía (`domain/equivalencia.ts`) y ninguna de las cinco le
 * preguntaba. Este candado corre DESPUÉS del Ángel Guardián —el último que
 * reescribe— y le pregunta por cada medida que el texto presenta como
 * equivalente: si no lo es, la frase entera se cambia por una línea honesta.
 *
 * Puro: entra el texto y lo que el cliente escribió; la base la lee quien llama.
 */
import { aroVigenteDeLaVisita } from "./aros.js";
import {
  diametroExteriorMm, direccionPedida, equivaleAAlguna, respetaDireccion, type Direccion,
} from "./equivalencia.js";
import { medidasDelAro } from "./medidaConfirmada.js";
import { aroDeLaMedida, medidaEstaPedida, medidasEnTexto, medidasPermitidas } from "./medidaPedida.js";
import { medidaIncompleta } from "./tireSize.js";

/** La línea honesta cuando la frase decía que en su medida no hay: la del negocio. */
export const LINEA_SIN_STOCK_EXACTO = "En su medida exacta no tengo stock; le pido al asesor que confirme si llega.";

/** Cuando lo que el cliente escribió no es una medida que exista (238 70 16). */
export const LINEA_MEDIDA_DUDOSA =
  "La medida que me escribió no me sale como una que exista; ¿me confirma la medida que dice el costado de su llanta, o me manda una foto? 📸";

export type MotivoEquivalenciaFalsa = "otro_aro" | "fuera_de_equivalencia" | "direccion" | "medida_dudosa";

export interface EquivalenciaReemplazada {
  frase: string;
  medida: string;
  motivo: MotivoEquivalenciaFalsa;
}

export interface ContextoEquivalencias {
  /** Lo que el cliente escribió en esta visita, del más viejo al más nuevo. */
  textosDeLaVisita: readonly string[];
  /** Lo que escribió en ESTE turno: de aquí sale la dirección («más ancha»). */
  textoDelTurno?: string | null;
  /** La medida de trabajo (`tire_size`): solo cuenta si él no escribió ninguna. */
  medidaDeTrabajo?: string | null;
}

/** Lo que el cliente tiene sobre la mesa: contra esto se juzga cada «equivalente». */
interface Referencia {
  base: string[];
  aro: number | null;
  /** Escribió algo con forma de medida que no existe, y ninguna medida válida. */
  dudosa: boolean;
}

function referenciaDelCliente(ctx: ContextoEquivalencias): Referencia {
  const textos = [...ctx.textosDeLaVisita];
  if (ctx.textoDelTurno && textos[textos.length - 1] !== ctx.textoDelTurno) textos.push(ctx.textoDelTurno);
  // El aro vigente filtra, igual que la lámina: con «rin 14» sobre la mesa una
  // 165/65R13 que figuraba en su foto ya no es «su medida» (conv 22533).
  const aro = aroVigenteDeLaVisita(textos);
  const escritas = medidasDelAro(medidasPermitidas(textos), aro);
  if (escritas.length) return { base: escritas, aro, dudosa: false };
  if (textos.some((t) => medidaIncompleta(t))) return { base: [], aro, dudosa: true };
  const trabajo = medidasDelAro(medidasPermitidas([], ctx.medidaDeTrabajo), aro);
  return { base: trabajo, aro, dudosa: false };
}

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * La frase presenta la medida como algo que le sirve EN LUGAR de la suya.
 * «¿Le cotizo la X?» ofrece; «ya le envié la cotización por 4 × X» informa de
 * algo que ya pasó por el candado de la cotización, y no se contradice acá.
 */
const PRESENTA_EQUIVALENTE =
  /equivalen|le entra|le sirve|le calza|le queda|de su aro|para su aro|\b(?:para|en|de) aro \d{2}\b|alternativa|cercan|en lugar de|en vez de|\bcotizo\b|\bcotice\b/;
/** La frase ofrece o recomienda una medida (para juzgar la dirección pedida). */
const OFRECE = /recomend|opcion|ofrezco|ofrecer|tengo|seria\b|sugiero/;
/** La frase ya dice que NO equivale: es la verdad, se queda. */
const NIEGA_EQUIVALENCIA = /no (?:es|son) (?:una |la |las )?equivalente|no le (?:entra|calza|sirve|queda)|no se la ofrezco/;
/** La frase afirma que en su medida no hay. */
const NIEGA_STOCK = /no me queda|no tengo|no hay|no me sale|no dispon|sin stock|no aparece/;

const DIRECCION_EN_TEXTO: Record<Direccion, string> = {
  mas_ancha: "más ancha",
  mas_angosta: "más angosta",
  mas_alta: "más alta",
  mas_baja: "más baja",
};

/** La medida del cliente más parecida a la candidata, para nombrarla en la línea. */
function referenciaMasCercana(base: readonly string[], medida: string): string {
  const d = diametroExteriorMm(medida);
  const aro = aroDeLaMedida(medida);
  const conAro = base.filter((b) => aroDeLaMedida(b) === aro);
  const candidatas = conAro.length ? conAro : base;
  if (d === null) return candidatas[0] ?? base[0];
  return [...candidatas].sort((a, b) =>
    Math.abs((diametroExteriorMm(a) ?? Infinity) - d) - Math.abs((diametroExteriorMm(b) ?? Infinity) - d),
  )[0] ?? base[0];
}

function lineaHonesta(
  motivo: MotivoEquivalenciaFalsa,
  medida: string,
  ref: Referencia,
  baseDireccion: readonly string[],
  fraseNiegaStock: boolean,
  textoNiegaStock: boolean,
  direccion: Direccion | null,
): string {
  // La línea no vuelve a nombrar la medida descartada: nombrarla es volver a
  // ponerla sobre la mesa, y el cliente contesta «ok» a lo último que leyó.
  if (motivo === "medida_dudosa") return LINEA_MEDIDA_DUDOSA;
  if (fraseNiegaStock) return LINEA_SIN_STOCK_EXACTO;
  if (motivo === "direccion" && direccion) {
    const hacia = DIRECCION_EN_TEXTO[direccion];
    const suya = referenciaMasCercana(baseDireccion, medida);
    return `Esa opción no es ${hacia} que su *${suya}*; si quiere, le pido al asesor que confirme cuál ${hacia} le calza.`;
  }
  if (!ref.base.length) {
    return `Esa otra medida es de otro aro que el suyo${ref.aro ? ` (aro ${ref.aro})` : ""}, así que no es equivalente; si quiere, le pido al asesor que confirme cuál le calza.`;
  }
  if (textoNiegaStock) {
    return `No tengo una que le calce de verdad a su *${ref.base.join(" / ")}*; si quiere, le pido al asesor que confirme si llega su medida.`;
  }
  const suya = referenciaMasCercana(ref.base, medida);
  const causa = motivo === "otro_aro" ? "es de otro aro" : "le cambia el diámetro";
  return `Esa otra medida no es equivalente de su *${suya}* (${causa}), así que no se la ofrezco como si le calzara; si quiere, le pido al asesor que confirme cuál le calza.`;
}

/**
 * El candado. Devuelve el texto con cada frase que presenta como equivalente
 * una medida que no lo es cambiada por una línea honesta, y la lista de lo que
 * cambió (para la alerta al asesor).
 *
 * Lo que NO toca: las medidas que el cliente escribió (son la suya), las
 * frases que ya dicen que algo NO equivale, y las opciones de su mismo aro
 * cuando él solo dio el aro («medidas distintas del mismo aro» es la verdad).
 */
export function sinEquivalenciasFalsas(
  texto: string,
  ctx: ContextoEquivalencias,
): { texto: string; reemplazadas: EquivalenciaReemplazada[] } {
  const ref = referenciaDelCliente(ctx);
  const direccion = direccionPedida(ctx.textoDelTurno);
  // La dirección se mide contra la medida que nombró EN ESE MISMO mensaje
  // («215/60 R16 me gustaría un poco más ancha»); si no nombró, contra la suya.
  const baseDireccion = (() => {
    const delTurno = medidasEnTexto(ctx.textoDelTurno ?? "");
    return delTurno.length ? delTurno : ref.base;
  })();
  const textoNiegaStock = NIEGA_STOCK.test(normalizar(texto));
  const reemplazadas: EquivalenciaReemplazada[] = [];
  const lineasHonestas = new Set<string>();
  // ¿Queda en pie alguna equivalente de verdad? Decide si «se confirma el
  // calce al montar» sigue teniendo de qué hablar.
  let quedaEquivalente = false;

  const juzgar = (frase: string): string | null => {
    const n = normalizar(frase);
    const ajenas = [...new Set(medidasEnTexto(frase))].filter((m) => !(ref.base.length && medidaEstaPedida(m, ref.base)));
    if (!ajenas.length || NIEGA_EQUIVALENCIA.test(n)) return frase;
    const presenta = PRESENTA_EQUIVALENTE.test(n);
    const ofrece = presenta || OFRECE.test(n);
    const malas: { medida: string; motivo: MotivoEquivalenciaFalsa }[] = [];
    for (const medida of ajenas) {
      if (ref.dudosa) {
        if (ofrece) malas.push({ medida, motivo: "medida_dudosa" });
        continue;
      }
      if (!ref.base.length) {
        // Solo dio el aro: una de OTRO aro nunca es «equivalente» de nada.
        if (presenta && ref.aro !== null && aroDeLaMedida(medida) !== ref.aro) malas.push({ medida, motivo: "otro_aro" });
        continue;
      }
      if (presenta && !equivaleAAlguna(ref.base, medida)) {
        const mismoAro = ref.base.some((b) => aroDeLaMedida(b) === aroDeLaMedida(medida));
        malas.push({ medida, motivo: mismoAro ? "fuera_de_equivalencia" : "otro_aro" });
        continue;
      }
      if (direccion && ofrece && !baseDireccion.some((b) => respetaDireccion(b, medida, direccion))) {
        malas.push({ medida, motivo: "direccion" });
      }
    }
    if (!malas.length) {
      if (presenta && /equivalen/.test(n)) quedaEquivalente = true;
      return frase;
    }
    for (const mala of malas) reemplazadas.push({ frase, ...mala });
    const linea = lineaHonesta(
      malas[0].motivo, malas[0].medida, ref, baseDireccion, NIEGA_STOCK.test(n), textoNiegaStock, direccion,
    );
    if (lineasHonestas.has(linea)) return null;
    lineasHonestas.add(linea);
    return linea;
  };

  const lineas = texto.split("\n").map((linea) => {
    const frases = linea.split(/(?<=[.!?…])\s+/);
    const juzgadas = frases.map(juzgar).filter((f): f is string => f !== null);
    return juzgadas.length ? juzgadas.join(" ") : null;
  });
  if (!reemplazadas.length) return { texto, reemplazadas };

  // «Se confirma el calce al montar» acompañaba a la equivalente que se fue:
  // sin ninguna equivalente de verdad en el texto, queda prometiendo en el aire.
  const limpias = lineas
    .filter((l): l is string => l !== null)
    .map((l) => (quedaEquivalente ? l : l.replace(/\s*Se confirma el calce al montar\.?/gi, "")));

  // Separadores huérfanos: al principio, al final o dos seguidos.
  const sinHuerfanos: string[] = [];
  for (const l of limpias) {
    const esSeparador = l.trim() === "---";
    const ultimoConTexto = [...sinHuerfanos].reverse().find((x) => x.trim() !== "");
    if (esSeparador && (!ultimoConTexto || ultimoConTexto.trim() === "---")) continue;
    sinHuerfanos.push(l);
  }
  while (sinHuerfanos.length && ["", "---"].includes(sinHuerfanos[sinHuerfanos.length - 1].trim())) sinHuerfanos.pop();
  return {
    texto: sinHuerfanos.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    reemplazadas,
  };
}

/**
 * EL AVISO DE LA LÁMINA DE OPCIONES, CON EL JUEZ ADENTRO.
 *
 * Vivía en `preparar_opciones` y rotulaba «equivalentes de su aro» a todo lo
 * que no era su medida. Ahora separa: las que equivalen se siguen diciendo
 * igual que siempre; las que no, se nombran como lo que son —otra medida, no
 * equivalente— y NO quedan anotadas como cotizables (`equivalentes`).
 */
export function avisoDeMedidaEnOpciones<T extends { design: string; sizeLabel: string | null }>(args: {
  permitidas: readonly string[];
  fueraDeMedida: readonly T[];
  totalMostradas: number;
}): { avisoCliente: string | null; equivalentes: string[]; productosEquivalentes: T[]; productosNoEquivalentes: T[] } {
  const { permitidas, fueraDeMedida, totalMostradas } = args;
  const productosEquivalentes = fueraDeMedida.filter((p) => equivaleAAlguna(permitidas, p.sizeLabel));
  const productosNoEquivalentes = fueraDeMedida.filter((p) => !productosEquivalentes.includes(p));
  const equivalentes = [...new Set(productosEquivalentes.map((p) => medidasEnTexto(p.sizeLabel ?? "")[0] ?? p.sizeLabel ?? "").filter(Boolean))];
  if (!fueraDeMedida.length || !permitidas.length) {
    return { avisoCliente: null, equivalentes, productosEquivalentes, productosNoEquivalentes };
  }
  const suMedida = permitidas.join(" / ");
  const lista = (ps: readonly T[], union: string) => ps.map((p) => `${p.design} ${union} ${p.sizeLabel}`).join(", ");
  const noEquivalen = productosNoEquivalentes.length
    ? `${lista(productosNoEquivalentes, "en")} ${productosNoEquivalentes.length > 1 ? "son de otra medida y no son equivalentes" : "es de otra medida y no es equivalente"} de la suya (cambia el aro o la altura): no se la ofrezco como si le calzara; el asesor le confirma si le sirve.`
    : null;
  const todas = fueraDeMedida.length === totalMostradas;
  const partes = todas
    ? [
        `⚠️ Ojo: en *${suMedida}* no me queda disponibilidad exacta.`,
        productosEquivalentes.length
          ? `Estas son *equivalentes* de su aro: ${lista(productosEquivalentes, "en")}. Se confirma el calce al montar.`
          : null,
        noEquivalen,
      ]
    : [
        productosEquivalentes.length
          ? `⚠️ Ojo: no todas son de su medida *${suMedida}* — ${lista(productosEquivalentes, "es")} (equivalentes de su aro).`
          : `⚠️ Ojo: no todas son de su medida *${suMedida}*.`,
        noEquivalen,
      ];
  return {
    avisoCliente: partes.filter(Boolean).join(" "),
    equivalentes,
    productosEquivalentes,
    productosNoEquivalentes,
  };
}

/**
 * Lo que `generar_cotizacion` le dice al modelo cuando la llanta es de otra
 * medida. Antes le dictaba «le entra la X» con la X que fuera (conv 23080:
 * «le entra la 215/60R17» por una 235/60R17). Solo se dicta si equivale.
 */
export function siguientePasoPorMedidaDistinta(permitidas: readonly string[], sizeLabel: string | null | undefined): string {
  const suya = permitidas[0] ?? "su medida";
  if (sizeLabel && equivaleAAlguna(permitidas, sizeLabel)) {
    return `Cotiza una llanta de ${permitidas.join(" o ")}. Si en esa medida no hay stock, NO la cambies por tu cuenta: `
      + `dile al cliente con todas las letras que en su medida no tienes y ofrécele la equivalente nombrando su medida completa `
      + `(«en su ${suya} no me queda; le entra la ${sizeLabel}, ¿se la cotizo?»). Solo cuando él acepte, `
      + `búscala con buscar_llanta y ahí sí cotízala.`;
  }
  return `Cotiza una llanta de ${permitidas.join(" o ")}: búscala PRIMERO con buscar_llanta en esa medida exacta. `
    + `La ${sizeLabel ?? "otra medida"} NO es equivalente de su ${suya} (otro aro, se sale del 3 % de diámetro o no monta en el mismo rin): `
    + `PROHIBIDO decirle que «le entra», que es «equivalente» o «de su aro», y PROHIBIDO ofrecérsela. `
    + `Si en su medida exacta no hay stock, díselo así: «${LINEA_SIN_STOCK_EXACTO}»`;
}
