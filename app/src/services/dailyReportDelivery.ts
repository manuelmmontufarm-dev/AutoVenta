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

  const destinatarios = await asesoresActivos();
  if (!destinatarios.length) return { enviado: false, motivo: "No hay asesores activos configurados" };

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

  let entregados = 0;
  for (const asesor of destinatarios) {
    try {
      await sendAdvisorText(texto, asesor.telefono);
      entregados += 1;
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
