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
   * El texto del beneficio por venir de redes sociales, palabra por palabra,
   * o null si el negocio no lo ofrece: entonces no se menciona en ninguna salida.
   */
  beneficioDeRedes: string | null;
  /** ¿Vende sin que el cliente pase por el local (paga a distancia y se envía)? */
  vendeADistancia: boolean;
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
