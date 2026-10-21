/**
 * LA MEDIDA QUE EL CLIENTE ESCRIBIÓ NO SE CUESTIONA NI SE REEMPLAZA.
 *
 * Familia 2-H (auditoría del 28-sep-2026). Cuatro formas del mismo error —un
 * dato que el cliente dio con sus propias palabras pierde contra algo que el
 * bot DEDUJO—:
 *
 *   conv 12625  «rin 195/55/R16», «Es el número 195/55/16R» → cuatro veces
 *     «usted llegó por llanta de camioneta y esa medida es de auto… envíeme una
 *     foto». Lo dedujo del ANUNCIO por el que llegó.
 *   simulador 28-sep  «Chevrolet Traverse, uso 215/65R16» → «necesito la
 *     medida exacta… o una foto del costado». La ficha todavía no la tenía.
 *   conv 23160  «75  rin 15» + «Vitara clásico» → opciones en 225/65R17 y
 *     225/70R16: la ficha del vehículo le ganó al aro que escribió.
 *   conv 22629  foto 225/70R16 y después «225/70 R15» → se cotizó la R15 sin
 *     preguntarle cuál de las dos era.
 *
 * Un solo dueño para las cuatro preguntas que esos casos contestaban cada uno
 * a su manera. Puro: sin base ni catálogo.
 */
import { aroVigenteDeLaVisita } from "./aros.js";
import { claseDeVehiculoEnTexto } from "./claseDeVehiculo.js";
import { medidaConfirmadaPorCliente } from "./medidaConfirmada.js";
import { aroDeLaMedida, medidaEstaPedida, medidasEnTexto, medidasPermitidas } from "./medidaPedida.js";
import { extractTireSizes, perfilYAroSinAncho } from "./tireSize.js";

const limpios = (textos: readonly (string | null | undefined)[]): string[] =>
  textos.filter((t): t is string => Boolean(t));

/** Las medidas completas (métricas o en pulgadas) que el cliente escribió o mandó en foto. */
export function medidasEscritasPorElCliente(textos: readonly (string | null | undefined)[]): string[] {
  return medidasPermitidas(limpios(textos));
}

/**
 * «EL CLIENTE ESCRIBIÓ SU MEDIDA» ES UN HECHO DEL MENSAJE (familia 3, 19-oct).
 *
 * Se anota en `metadata.medida_escrita` de cada entrante al empezar el turno
 * del agente (`anotarMedidasEscritas`, services/medidasDelPedido.ts: turno
 * normal y retomada), con el mismo lector que llena la ficha; vale igual para
 * texto, foto leída o audio transcrito.
 * Lista vacía = se leyó y no traía medida. Así «¿la dio él o la dedujo el
 * bot?» se contesta preguntándole al hecho, no volviendo a adivinar.
 */
export const CLAVE_MEDIDA_ESCRITA = "medida_escrita";

/** Lo que se guarda en el hecho al recibir el mensaje. */
export function medidasParaElHecho(texto: string | null | undefined): string[] {
  return texto ? medidasEnTexto(texto) : [];
}

/**
 * Las medidas que el cliente escribió en ESTE mensaje: el hecho si está; si no
 * está (mensajes guardados antes del 20-oct, o copiados de producción), se lee
 * el texto con el mismo lector que lo habría anotado.
 */
export function medidasDelMensaje(
  mensaje: { content: string | null | undefined; metadata?: unknown },
): string[] {
  const hecho = (mensaje.metadata as Record<string, unknown> | null | undefined)?.[CLAVE_MEDIDA_ESCRITA];
  if (Array.isArray(hecho)) return hecho.map(String);
  return medidasParaElHecho(mensaje.content);
}

/**
 * ¿LA MEDIDA EN JUEGO LA DEDUJO EL BOT? (Manuel, 1-sep, conv 13862.)
 *
 * Con `true` el turno puede mostrar opciones pero no cotizar, y la pieza
 * cierra pidiendo la medida del costado. Es falso —la medida es suya— cuando:
 *  · dio el aro (conv 3, 7-sep: las opciones de su aro son suyas);
 *  · escribió una medida completa en esta visita (familia 2-H y familia 3:
 *    «255 / 45 R.20» → «necesito la medida exacta» en el chat 27418);
 *  · la ficha es una medida que escribió alguna vez (el cliente que vuelve).
 */
export function medidaSinConfirmar(input: {
  tireSize: string | null | undefined;
  escritasEnElCiclo: readonly string[];
  escritasEnTodas: readonly string[];
  aroDelCliente: number | null | undefined;
}): boolean {
  if (input.aroDelCliente) return false;
  if (input.escritasEnElCiclo.length) return false;
  if (!input.tireSize) return true;
  const ficha = new Set(medidasEnTexto(input.tireSize));
  return !input.escritasEnTodas.some((m) => ficha.has(m));
}

/**
 * ¿La medida en juego la dio el CLIENTE? Sí cuando la ficha coincide con algo
 * que él escribió (regla del 1-sep, conv 13862) y TAMBIÉN cuando escribió una
 * medida completa aunque la ficha todavía no la tenga o tenga otra deducida:
 * lo que él escribió no se le vuelve a pedir. Qué medida se FIRMA lo sigue
 * decidiendo `medidasDelPedido`.
 */
export function clienteDioSuMedida(
  tireSize: string | null | undefined,
  textosDelCliente: readonly (string | null | undefined)[],
): boolean {
  return medidaConfirmadaPorCliente(tireSize, textosDelCliente)
    || medidasEscritasPorElCliente(textosDelCliente).length > 0;
}

/**
 * ¿Viaja al guardián el hecho «EL CLIENTE BUSCA LLANTA DE CAMIONETA»?
 *
 * Sirve para quien llegó por aro o por vehículo (convs 20211, 20209: «Rin 17
 * para camioneta 4x4» → llantas de sedán). Con una medida completa escrita,
 * esa medida ES la respuesta: el anuncio no la desmiente (conv 12625).
 */
export function hechoDeCamionetaVigente(
  textosDeClase: readonly (string | null | undefined)[],
  textosDelCliente: readonly (string | null | undefined)[],
): boolean {
  if (medidasEscritasPorElCliente(textosDelCliente).length) return false;
  return claseDeVehiculoEnTexto([...textosDeClase, ...textosDelCliente]) === "camioneta";
}

/**
 * El aro con el que se investiga el vehículo: el que escribió el cliente en la
 * visita manda sobre el que mandó (o no mandó) el modelo. «El aro le gana al
 * vehículo» vivía en una descripción de herramienta; aquí es un dato.
 */
export function aroParaFitment(
  aroDelModelo: number | null | undefined,
  textosDeLaVisita: readonly (string | null | undefined)[],
): number | null {
  return aroVigenteDeLaVisita(limpios(textosDeLaVisita)) ?? aroDelModelo ?? null;
}

/**
 * La media medida vigente («75 rin 15»): solo cuenta si es lo último que el
 * cliente dijo de su medida — una completa escrita después la reemplaza.
 */
export function mediaMedidaVigente(
  textosDeLaVisita: readonly (string | null | undefined)[],
): { perfil: number; aro: number } | null {
  const textos = limpios(textosDeLaVisita);
  for (let i = textos.length - 1; i >= 0; i--) {
    if (medidasEnTexto(textos[i]).length) return null;
    const media = perfilYAroSinAncho(textos[i]);
    if (media) return media;
  }
  return null;
}

/**
 * CANDADO «el aro del cliente manda», sin el agujero de la conv 23160.
 *
 * Una opción pasa si es del aro vigente (y, con media medida, de su perfil), o
 * si es una medida completa que él nombró. Antes la segunda condición era
 * `medidaEstaPedida(x, medidasDichas)`, que con la lista VACÍA —justo el caso
 * «rin 15» sin medida completa— devuelve `true` y dejaba pasar todo.
 */
export function respetanElAroDelCliente<T extends { sizeLabel?: string | null; size?: { rim?: number | null } | null }>(
  productos: readonly T[],
  textosDeLaVisita: readonly (string | null | undefined)[],
): T[] {
  const textos = limpios(textosDeLaVisita);
  const aro = aroVigenteDeLaVisita(textos);
  if (!aro) return [...productos];
  const dichas = medidasPermitidas(textos);
  const media = mediaMedidaVigente(textos);
  return productos.filter((p) => {
    if (dichas.length && medidaEstaPedida(p.sizeLabel, dichas)) return true;
    const aroDeLaOpcion = p.size?.rim ?? aroDeLaMedida(p.sizeLabel);
    if (aroDeLaOpcion !== aro) return false;
    if (!media || media.aro !== aro) return true;
    return extractTireSizes(p.sizeLabel ?? "")[0]?.aspect === media.perfil;
  });
}

const FOTO = /mand[oó] una foto/i;
const CORRIGE = /\b(?:perd[oó]n|me equivoqu|corrijo|correcci[oó]n|mejor|en realidad|disculpe|error|corregid)/i;

/**
 * ¿Hay DOS medidas completas del cliente sin resolver? (conv 22629)
 *
 * La foto dice una cosa y lo que escribió DESPUÉS de la foto, otra, sin
 * palabra de corrección. Lo escrito ANTES de la foto no cuenta: la foto lo
 * corrige, que es el flujo normal. Se pregunta UNA vez: en cuanto un mensaje
 * nuestro nombró las dos, la última palabra del cliente manda.
 */
export function medidaEnDisputa(
  mensajes: readonly { deCliente: boolean; texto: string | null | undefined }[],
): { foto: string; escrita: string } | null {
  let iFoto = -1;
  let foto: string | null = null;
  mensajes.forEach((m, i) => {
    if (!m.deCliente || !m.texto || !FOTO.test(m.texto)) return;
    const leida = medidasEnTexto(m.texto)[0];
    if (leida) { iFoto = i; foto = leida; }
  });
  if (!foto || iFoto < 0) return null;
  let iEscrita = -1;
  let escrita: string | null = null;
  for (let i = iFoto + 1; i < mensajes.length; i++) {
    const m = mensajes[i];
    if (!m.deCliente || !m.texto || FOTO.test(m.texto)) continue;
    const dicha = medidasEnTexto(m.texto).at(-1);
    if (dicha) { iEscrita = i; escrita = dicha; }
  }
  if (!escrita || escrita === foto) return null;
  if (CORRIGE.test(mensajes[iEscrita].texto ?? "")) return null;
  const yaPreguntado = mensajes.slice(iEscrita + 1).some((m) => {
    if (m.deCliente || !m.texto) return false;
    const nombradas = medidasEnTexto(m.texto);
    return nombradas.includes(foto!) && nombradas.includes(escrita!);
  });
  return yaPreguntado ? null : { foto, escrita };
}
