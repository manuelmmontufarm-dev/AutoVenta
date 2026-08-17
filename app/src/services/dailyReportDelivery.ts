/**
 * Entrega del reporte del día a los asesores, todos los días a las 20:00.
 *
 * Reglas que vale la pena tener escritas:
 *
 *  · **Una sola vez por día.** La marca se guarda en `settings` con el día de
 *    cierre como valor, y se escribe ANTES de mandar nada. Un reinicio de
 *    Railway a las 20:01 no puede convertirse en cinco reportes idénticos: es
 *    preferible perder un reporte que quemar la confianza del asesor en el
 *    canal — el que se pierde se puede volver a pedir desde el panel.
 *
 *  · **Sale aunque el bot esté apagado.** Igual que los avisos de visita: el
 *    reporte es para una persona, no un mensaje al cliente, y con el bot
 *    apagado es justo cuando más falta hace saber qué quedó pendiente.
 *
 *  · **Texto primero, PDF después.** El texto llega aunque el archivo falle
 *    (token vencido, Meta caída) y ya trae los números y el link al panel. Un
 *    reporte sin adjunto sigue sirviendo; un adjunto que no llegó y ningún
 *    mensaje, no.
 *
 *  · **Aceptar no es entregar.** Meta responde el POST con 200 y un wamid
 *    aunque la ventana de 24 h esté cerrada, y manda el rechazo después por el
 *    webhook de estados. Mirar solo el POST hacía que el reporte se anotara
 *    «enviado a 2/2 asesores» sin haberle llegado a nadie (16-ago), y de paso
 *    desactivaba el reintento de abajo, que solo corre si NADIE lo recibió. Por
 *    eso el envío espera el veredicto en `message_status_events` antes de
 *    contar a alguien como entregado.
 */
import { sql } from "../db/client.js";
import { sendAdvisorPdf, sendAdvisorText } from "../wa/client.js";
import { asesoresActivos } from "./advisorNotifications.js";
import { buildDailyReport, HORA_DE_CORTE, type ReporteDiario } from "./dailyReport.js";
import { nombreArchivoReporte, renderDailyReportPdf } from "../render/dailyReportPdf.js";

const CLAVE = "daily_report_last_sent";

/** ¿Ya pasó la hora de corte de hoy en Ecuador? */
export function esHoraDelReporte(ahora: Date): boolean {
  const hora = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Guayaquil", hour: "2-digit", hour12: false,
    }).format(ahora),
  );
  return hora >= HORA_DE_CORTE;
}

export async function ultimoDiaEnviado(): Promise<string | null> {
  const [fila] = await sql<{ value: unknown }[]>`select value from settings where key = ${CLAVE}`;
  return typeof fila?.value === "string" ? fila.value : null;
}

/**
 * Reclama el día para este proceso. Devuelve `false` si otro ya lo tenía, así
 * que dos instancias corriendo a la vez mandan un reporte, no dos: el `where`
 * sobre el valor anterior hace de candado dentro de la propia base.
 *
 * Exportada para poder probarla contra Postgres de verdad: la garantía está en
 * el `on conflict ... where`, no en el TypeScript de alrededor, y una copia del
 * SQL en el test podría quedar en verde mientras el de producción se rompe.
 */
export async function soltarDia(dia: string): Promise<void> {
  await sql`
    delete from settings where key = ${CLAVE} and value::text = ${JSON.stringify(dia)}
  `;
}

export async function reclamarDia(dia: string): Promise<boolean> {
  const filas = await sql`
    insert into settings (key, value) values (${CLAVE}, ${sql.json(dia)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
    where settings.value::text is distinct from ${JSON.stringify(dia)}
    returning key
  `;
  return filas.count > 0;
}

/**
 * El WhatsApp que acompaña al PDF: los números del día y por dónde entrar.
 *
 * Lleva la semana al lado del día en las dos cifras que se comparan solas —lo
 * cotizado y quién escribió— porque el mensaje se lee antes que el adjunto, y
 * muchas noches es lo único que se lee. La página de gráficos del PDF cuenta lo
 * mismo con más detalle; aquí sólo tiene que caber en una notificación.
 */
export function textoDelReporte(r: ReporteDiario): string {
  const m = r.resumen;
  const s = r.semana;
  const dinero = (valor: number) => `$${valor.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const lineas = [
    `📊 *Reporte del día — ${r.dia}*`,
    `_${r.periodo}_`,
    "",
    `👋 ${m.clientesQueEscribieron} clientes escribieron · ${m.clientesNuevos} nuevos`,
    `📄 ${m.cotizacionesEnviadas} cotizaciones · ${dinero(m.montoCotizado)}`,
    `📈 En la semana: ${s.cotizaciones} cotizaciones · ${dinero(s.montoCotizado)}`,
    `🗓 ${m.visitasAgendadas} dijeron cuándo vienen`,
  ];
  if (m.ventasGanadas > 0) lineas.push(`✅ ${m.ventasGanadas} ventas cerradas · ${dinero(m.montoGanado)}`);
  lineas.push(
    "",
    `💰 ${r.cotizados.total} cotizados a un empujón del cierre`,
    `🙋 ${r.pidenAsesor.total} piden asesor`,
  );
  if (r.errores.total > 0) lineas.push(`⚠️ ${r.errores.total} chats con errores del bot`);
  lineas.push("", "📎 El PDF de abajo abre con los gráficos de la semana y sigue con cada conversación y su link.", `🔗 ${r.linkOportunidades}`);
  return lineas.join("\n");
}

export interface ResultadoEnvio {
  enviado: boolean;
  motivo?: string;
  destinatarios?: number;
  dia?: string;
}

/**
 * Cuánto se espera el veredicto de Meta antes de dar el envío por bueno.
 *
 * Meta contesta el POST con 200 y un wamid **aunque la ventana de 24 h esté
 * cerrada**, y el rechazo llega después, por el webhook de estados. El 16-ago
 * eso hizo que el reporte se anotara «enviado a 2/2 asesores» cuando los dos
 * mensajes a Manuel (texto y PDF) habían fallado con 131047 tres segundos
 * antes: el log decía una cosa y el WhatsApp del asesor otra.
 *
 * Ese día los eventos `failed` entraron en el mismo segundo del envío. Se
 * espera bastante más que eso porque el costo de esperar de más es nulo —el
 * bucle del reporte gira cada 15 minutos— y el de esperar de menos es dar por
 * entregado lo que no llegó, que es justo el fallo que esto viene a cerrar.
 */
const VEREDICTO_MS = 20_000;
const VEREDICTO_PASO_MS = 2_000;

const dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * De los mensajes que Meta aceptó, cuáles terminó rechazando.
 *
 * Devuelve el conjunto de wamids con un evento `failed` en `message_status_events`,
 * que es donde el webhook deja el veredicto real. Se consulta por pasos y se
 * corta apenas todos tengan veredicto: en el caso bueno —todos entregados— no
 * agrega nada de espera, porque un `sent`/`delivered` cuenta como veredicto.
 *
 * Ante cualquier error de base devuelve el conjunto vacío: quedarse sin saber
 * es el estado de siempre, y no vale tumbar el envío del reporte por eso.
 *
 * Exportada por el mismo motivo que `reclamarDia`: lo que se afirma vive en el
 * SQL contra `message_status_events`, no en el TypeScript de alrededor, y una
 * copia de la consulta en el test podría quedar en verde mientras la de
 * producción se rompe.
 */
export async function rechazadosPorMeta(wamids: readonly string[]): Promise<Set<string>> {
  if (!wamids.length) return new Set();
  const fallidos = new Set<string>();
  const conVeredicto = new Set<string>();
  for (let esperado = 0; esperado <= VEREDICTO_MS; esperado += VEREDICTO_PASO_MS) {
    await dormir(VEREDICTO_PASO_MS);
    try {
      const filas = await sql<{ provider_id: string; status: string }[]>`
        select provider_id, status from message_status_events
        where provider_id in ${sql(wamids as string[])}
      `;
      for (const fila of filas) {
        conVeredicto.add(fila.provider_id);
        if (fila.status === "failed") fallidos.add(fila.provider_id);
      }
    } catch (error) {
      console.warn(
        "⚠️ No se pudo confirmar la entrega del reporte contra Meta:",
        error instanceof Error ? error.message : error,
      );
      return new Set();
    }
    if (conVeredicto.size >= wamids.length) break;
  }
  return fallidos;
}

/**
 * Manda el reporte a todos los asesores activos.
 *
 * `forzar` salta el candado del día: es lo que usa el botón «mandar ahora» del
 * panel para probar el reporte sin esperar a las ocho.
 */
export async function enviarReporteDiario(input: { ahora?: Date; forzar?: boolean } = {}): Promise<ResultadoEnvio> {
  const ahora = input.ahora ?? new Date();
  const reporte = await buildDailyReport(ahora);

  if (!input.forzar) {
    if (!esHoraDelReporte(ahora)) return { enviado: false, motivo: "Todavía no son las 20:00 en Ecuador" };
    if (await ultimoDiaEnviado() === reporte.diaClave) return { enviado: false, motivo: "El reporte de hoy ya salió" };
    if (!await reclamarDia(reporte.diaClave)) return { enviado: false, motivo: "Otro proceso ya tomó el reporte de hoy" };
  }

  // Solo administradores. El reporte es una foto del negocio para quien lo
  // dirige; al asesor de local le llegaban veinte líneas de números que no
  // acciona y un PDF de varias páginas todas las noches a las ocho (pedido
  // explícito de la reunión del 14-ago: «nada de daily reports»).
  const destinatarios = await asesoresActivos({ rol: "admin" });
  if (!destinatarios.length) return { enviado: false, motivo: "No hay administradores activos configurados" };

  const texto = textoDelReporte(reporte);
  // El PDF se arma una vez para todos: es el mismo archivo y renderizarlo por
  // asesor sólo gasta CPU. Si falla, el texto igual sale.
  let pdf: Buffer | null = null;
  try {
    pdf = await renderDailyReportPdf(reporte);
  } catch (error) {
    console.error("⚠️ No se pudo generar el PDF del reporte:", error instanceof Error ? error.message : error);
  }
  const filename = nombreArchivoReporte(reporte);

  // Se guarda el wamid del TEXTO de cada asesor —no el del PDF— porque el
  // texto es el que decide si el reporte llegó: trae los números y el link al
  // panel, y ya está escrito que un reporte sin adjunto sigue sirviendo. Si el
  // PDF se cae solo, el asesor tiene lo que necesita.
  const aceptados: { asesor: string; wamid: string }[] = [];
  let entregados = 0;
  for (const asesor of destinatarios) {
    try {
      const wamid = await sendAdvisorText(texto, asesor.telefono);
      entregados += 1;
      if (wamid) aceptados.push({ asesor: asesor.nombre, wamid });
    } catch (error) {
      console.error(`⚠️ Reporte del día no salió para ${asesor.nombre}:`, error instanceof Error ? error.message : error);
      continue;
    }
    if (!pdf) continue;
    try {
      await sendAdvisorPdf({ to: asesor.telefono, pdf, filename });
    } catch (error) {
      console.error(`⚠️ PDF del reporte no salió para ${asesor.nombre}:`, error instanceof Error ? error.message : error);
    }
  }

  // Aceptar no es entregar. Hasta aquí `entregados` solo cuenta los POST que la
  // Graph API no rechazó en el acto; el veredicto de verdad llega por el webhook
  // de estados y puede ser `failed` con la ventana cerrada. Sin este descuento,
  // un reporte que no le llegó a nadie se anotaba como entregado, el candado del
  // día se quedaba puesto y el reintento de abajo —que existe justo para eso—
  // no llegaba a correr nunca. Es lo que pasó el 16-ago.
  const rechazados = await rechazadosPorMeta(aceptados.map(({ wamid }) => wamid));
  if (rechazados.size) {
    for (const { asesor, wamid } of aceptados) {
      if (!rechazados.has(wamid)) continue;
      entregados -= 1;
      console.warn(
        `⚠️ Meta aceptó el reporte para ${asesor} y después lo rechazó: no le llegó. ` +
        "Causa habitual: su ventana de 24 h está cerrada — tiene que escribirle al número del negocio.",
      );
    }
  }

  // Nadie lo recibió: se suelta el día para que el siguiente giro del bucle lo
  // vuelva a intentar. Casi siempre la causa es la ventana de 24 h de Meta
  // (error 131047): el asesor no le ha escrito al número del negocio y el texto
  // libre se rechaza. Esa ventana se reabre en cuanto él manda un mensaje, así
  // que reintentar cada cuarto de hora hace que el reporte llegue esa misma
  // noche en vez de perderse. Quemar el día aquí es exactamente el fallo del
  // 8-ago, cuando Joaquín no recibió ni uno solo de sus avisos.
  //
  // El reintento se acota solo: `esHoraDelReporte` exige que sean las 20:00 o
  // más, así que pasada la medianoche se deja de intentar y el reporte de ese
  // día se da por perdido. Es lo correcto — a nadie le sirve el reporte de
  // ayer a las diez de la mañana, y el del día siguiente sale igual.
  if (!entregados && !input.forzar) {
    await soltarDia(reporte.diaClave);
    console.warn(
      `⚠️ Reporte del ${reporte.diaClave} no llegó a ningún asesor; se reintenta. ` +
      "Causa habitual: la ventana de 24 h cerrada — pídeles que escriban al número del negocio.",
    );
    return { enviado: false, motivo: "Ningún asesor pudo recibirlo; se reintenta en el próximo giro", destinatarios: 0, dia: reporte.diaClave };
  }

  console.log(`📊 Reporte del ${reporte.diaClave} enviado a ${entregados}/${destinatarios.length} asesores`);
  return { enviado: entregados > 0, destinatarios: entregados, dia: reporte.diaClave };
}
