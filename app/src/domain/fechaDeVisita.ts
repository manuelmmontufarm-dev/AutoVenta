/**
 * EL LECTOR ÚNICO DE LA FECHA DE VISITA (auditoría 19-oct-2026, familia 6 —
 * «fechas de visita mal leídas», 6 chats).
 *
 * Había DOS lectores que escribían la ficha y levantaban la alerta
 * `visita_comprometida`: el pipeline (`index.ts`, sobre el texto del cliente)
 * y la herramienta `agendar_visita` (sobre lo que el MODELO entendió). En
 * 29358 el cliente dijo «…creo para el próximo sábado» un sábado: el pipeline
 * leyó el 24, el modelo mandó «sábado 31 de octubre», se crearon dos alertas
 * con fechas distintas y la ficha se quedó con el 31.
 *
 * Desde ahora las dos puertas (y la fase operativa) leen por aquí:
 *
 *  · `leerVisita` — el texto del cliente → compromiso con fecha, o nada.
 *  · `fechaParaAgendar` — lo que usa `agendar_visita`: la frase del cliente
 *    MANDA sobre el día que pasó el modelo; el día del modelo solo vale cuando
 *    el cliente no nombró ninguno («Sí, perfecto» al día que propuso el bot).
 *
 * Lo que NUNCA es una visita, aunque traiga un día:
 *
 *  · Lo que se leyó de una FOTO. «[El cliente mandó una foto. Se lee: … 6 1/2",
 *    $180…]» agendó el lunes 1 de febrero (27485): «1/2» se leyó como día/mes.
 *    El audio sí cuenta —es lo que el cliente DIJO—, y la leyenda escrita
 *    debajo de la foto también.
 *  · Mandar información: «Mañana le paso el dato completo» (30131) quedó como
 *    visita del martes 20 con aviso «CONFIRMÓ VISITA», porque «paso» es verbo
 *    de visita. «Le paso / le mando / le envío / le comparto» es dar un dato;
 *    «me paso por ahí» (con «me») sí es venir.
 *
 * Y el día de la visita se compara como DÍA en Quito, no como instante: con
 * la visita a las 10:00 (hora de relleno), a las 12:37 del mismo día el
 * seguimiento ya decía «no alcanzó a pasar» (6145).
 */
import { extractCustomerCommitment, fechaDelDia, tieneVerboDeVisita, type CustomerCommitment } from "./customerCommitment.js";
import { normalizarTexto } from "./diasEnEspanol.js";

export type NoEsVisita = "texto_de_una_foto" | "envia_informacion";

const FOTO = /\[El cliente mandó una foto[^\]]*\]/g;
const AUDIO = /\[El cliente mandó un audio\. Dice: ([^\]]*)\]/g;

/** Lo que el cliente dijo o escribió: sin lo leído de una foto, con lo dicho en un audio. */
export function loQueDijoElCliente(texto: string): string {
  return (texto ?? "").replace(FOTO, " ").replace(AUDIO, " $1 ").replace(/\s+/g, " ").trim();
}

const ENVIA_INFORMACION =
  /\b(?:le|les|te)\s+(?:paso|pasare|mando|mandare|envio|enviare|comparto|compartire|hago\s+llegar|escribo|escribire)\b/g;

/** ¿Por qué este texto no puede ser un compromiso de visita, aunque nombre un día? */
export function porQueNoEsVisita(texto: string | null | undefined): NoEsVisita | null {
  const crudo = texto ?? "";
  const dicho = loQueDijoElCliente(crudo);
  if (crudo.includes("[El cliente mandó una foto") && !dicho) return "texto_de_una_foto";
  const n = normalizarTexto(dicho);
  // «Mañana le mando la medida y el sábado voy» sí trae una visita: cuenta
  // el verbo que queda FUERA del «le paso».
  const sinElEnvio = n.replace(ENVIA_INFORMACION, " ");
  if (sinElEnvio !== n && !tieneVerboDeVisita(sinElEnvio)) return "envia_informacion";
  return null;
}

/** El texto del cliente → compromiso de visita (con fecha si la dio), o null. */
export function leerVisita(
  texto: string,
  ahora = new Date(),
  opciones: { respondiendoAlDia?: boolean } = {},
): CustomerCommitment | null {
  if (porQueNoEsVisita(texto)) return null;
  const dicho = loQueDijoElCliente(texto);
  if (!dicho) return null;
  return extractCustomerCommitment(dicho, ahora, opciones);
}

/**
 * La fecha que registra `agendar_visita`. `texto` es lo que se guarda como
 * `customer_commitment`: la frase del cliente, junto a la fecha leída.
 */
export function fechaParaAgendar(input: {
  dia: string;
  textoDelCliente: string;
  ahora?: Date;
  /** El bot acababa de preguntar el día o el local (ver `respondeAlDiaDeLaVisita`). */
  respondiendoAlDia?: boolean;
}): { fecha: Date | null; texto: string; franja?: string; noEsVisita?: NoEsVisita } {
  const ahora = input.ahora ?? new Date();
  const frase = input.textoDelCliente.trim().replace(/\s+/g, " ").slice(0, 180);
  const motivo = porQueNoEsVisita(input.textoDelCliente);
  if (motivo) return { fecha: null, texto: frase, noEsVisita: motivo };
  // La misma señal que el pipeline: sin la pregunta del día, «las 4» no es el día 4.
  const delCliente = leerVisita(input.textoDelCliente, ahora, { respondiendoAlDia: input.respondiendoAlDia ?? false });
  if (delCliente?.visitDate) {
    return { fecha: delCliente.visitDate, texto: delCliente.text, franja: delCliente.visitTimeLabel };
  }
  return { fecha: fechaDelDia(input.dia, ahora), texto: frase || input.dia.trim() };
}

/** «2026-10-17»: el día calendario en Quito (UTC-5 todo el año). */
export function diaEnQuito(fecha: Date): string {
  return new Date(fecha.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/** ¿Hoy, en Quito, es el día de la visita? */
export function esElDiaDeLaVisita(visita: Date, ahora: Date): boolean {
  return diaEnQuito(visita) === diaEnQuito(ahora);
}

/** ¿El día de la visita ya terminó? Recién al día siguiente se dice «no alcanzó a pasar». */
export function yaPasoElDiaDeLaVisita(visita: Date, ahora: Date): boolean {
  return diaEnQuito(visita) < diaEnQuito(ahora);
}
