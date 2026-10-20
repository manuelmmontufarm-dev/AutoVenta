/**
 * Pre-facturas del mes del servicio —una de IA y otra de mantenimiento—, que
 * le llegan a Manuel por WhatsApp apenas cierra el mes en Quito.
 *
 *  · **Los montos no se calculan acá.** Salen de `mesesFacturados()`, la misma
 *    cuenta del tab KPI del hub: la pre-factura y el hub no pueden discrepar.
 *  · **El formato es el de la contadora.** Emisor, razón social, ítem y forma
 *    de pago vienen de `negocio.facturacion`, copiados de su factura de Siigo,
 *    para que la emita sin traducir nada. El número y la clave de acceso los
 *    pone Siigo; acá no se inventan.
 *  · **Una vez por mes, con el candado del reporte diario.** La marca
 *    (`prefactura_last_sent` = 'YYYY-MM') se reclama antes de mandar nada, así
 *    que un reinicio a las 00:01 no manda dos juegos.
 *  · **Aceptar no es entregar.** Si Meta rechaza el texto (casi siempre la
 *    ventana de 24 h: el número de Manuel no le escribió al bot) se suelta la
 *    marca y el bucle reintenta cada 15 min, todo el mes si hace falta: llega
 *    en cuanto él le escriba al número del negocio. Los PDF se suben recién
 *    cuando el texto pasó, para no subir dos archivos cada cuarto de hora.
 */
import { negocio } from "../negocio/index.js";
import { sendAdvisorPdf, sendAdvisorText } from "../wa/client.js";
import { BILLING_START, IVA, mesesFacturados, type MesFacturado } from "./billing.js";
import { candadoPeriodico, rechazadosPorMeta } from "./dailyReportDelivery.js";
import { renderPrefacturaPdf } from "../render/prefacturaPdf.js";

const candado = candadoPeriodico("prefactura_last_sent");
const TZ = "America/Guayaquil";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const r2 = (n: number) => Math.round(n * 100) / 100;
const ddmmyyyy = (iso: string) => iso.split("-").reverse().join("/");
export const usd = (n: number) => `$${n.toFixed(2)}`;

export function nombreDelMes(period: string): string {
  return `${MESES[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
}

/** El mes que acaba de cerrar en Quito: el anterior al de `ahora`. */
export function periodoACobrar(ahora: Date): string {
  const [y, m] = ahora.toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7).split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export interface Prefactura {
  clave: "ia" | "mantenimiento";
  ref: string;
  /** «Detalles Adicionales» del ítem, como lo escribe la contadora. */
  detalle: string;
  subtotal: number;
  iva: number;
  total: number;
  anexo: string;
  preliminar: boolean;
}

/**
 * Las dos pre-facturas de un mes. Separadas porque la IA es pasante y cambia
 * cada mes, y el mantenimiento es fijo: se facturan y se pagan por cuerda aparte.
 */
export function prefacturasDelMes(mes: MesFacturado): Prefactura[] {
  const MES = MESES[Number(mes.period.slice(5, 7)) - 1].toUpperCase();
  const miles = (n: number) => n.toLocaleString("es-EC");
  return [
    {
      clave: "ia",
      ref: `DT-IA-${mes.period}`,
      detalle: `CONSUMO INTELIGENCIA ARTIFICIAL ${MES}`,
      subtotal: mes.uso.usd,
      iva: mes.ivaTokens,
      total: r2(mes.uso.usd + mes.ivaTokens),
      anexo:
        `Consumo del ${ddmmyyyy(mes.desde)} al ${ddmmyyyy(mes.hasta)}: ${miles(mes.uso.runs)} corridas de IA · ` +
        `${miles(mes.uso.inputTokens)} tokens de entrada (${miles(mes.uso.cachedInputTokens)} en caché) · ` +
        `${miles(mes.uso.outputTokens)} de salida. Tarifa de OpenAI, sin recargo. Detalle diario en el tab KPI del hub.`,
      preliminar: mes.enCurso,
    },
    {
      clave: "mantenimiento",
      ref: `DT-MANT-${mes.period}`,
      detalle: `MENSUALIDAD ${MES}`,
      subtotal: mes.mantenimiento,
      iva: mes.ivaMantenimiento,
      total: r2(mes.mantenimiento + mes.ivaMantenimiento),
      anexo: "Servidor, base de datos, WhatsApp, soporte y ajustes del bot.",
      // Monto fijo: no depende de que el mes haya cerrado.
      preliminar: false,
    },
  ];
}

export function nombreArchivoPrefactura(p: Prefactura, period: string): string {
  return `prefactura-depot-${period}-${p.clave}${p.preliminar ? "-preliminar" : ""}.pdf`;
}

export async function mesFacturado(period: string): Promise<MesFacturado | undefined> {
  return (await mesesFacturados()).find((m) => m.period === period);
}

/** Las dos pre-facturas de un periodo, ya en PDF. */
export async function prefacturasEnPdf(mes: MesFacturado): Promise<{ p: Prefactura; pdf: Buffer; filename: string }[]> {
  const datos = negocio.facturacion;
  if (!datos) throw new Error(`El negocio ${negocio.id} no tiene datos de facturación`);
  const salida = [];
  for (const p of prefacturasDelMes(mes)) {
    const pdf = await renderPrefacturaPdf({ p, mes, datos, ivaPorc: Math.round(IVA * 100) });
    salida.push({ p, pdf, filename: nombreArchivoPrefactura(p, mes.period) });
  }
  return salida;
}

export function textoDePrefacturas(mes: MesFacturado, impagos: MesFacturado[]): string {
  const [ia, mant] = prefacturasDelMes(mes);
  const cliente = negocio.facturacion?.cliente.razonSocial ?? negocio.nombre;
  const lineas = [
    `🧾 *Pre-facturas de ${nombreDelMes(mes.period)} — ${negocio.nombre} (${cliente})*`,
    "",
    `🤖 IA: ${usd(ia.subtotal)} + IVA ${usd(ia.iva)} = *${usd(ia.total)}*`,
    `🛠 Mantenimiento: ${usd(mant.subtotal)} + IVA ${usd(mant.iva)} = *${usd(mant.total)}*`,
    `💰 Total del mes: *${usd(mes.total)}*`,
  ];
  if (ia.preliminar) lineas.push("", "⚠️ PRELIMINAR: el mes todavía no cierra; no facturar la IA con este valor.");
  for (const m of impagos) lineas.push(`⏳ ${nombreDelMes(m.period)} sigue sin marcarse pagado en el hub (${usd(m.total)}).`);
  lineas.push("", "📎 Abajo los dos PDF en el formato de Siigo, listos para la contadora.");
  return lineas.join("\n");
}

export interface ResultadoPrefacturas {
  enviado: boolean;
  motivo?: string;
  period?: string;
}

/**
 * Manda las pre-facturas del mes que cerró a `BILLING_OWNER_PHONE`.
 *
 * `forzar` salta el candado y permite elegir `period` (incluso el mes en
 * curso, que sale PRELIMINAR): es el botón de prueba del dueño.
 */
export async function enviarPrefacturas(
  input: { ahora?: Date; forzar?: boolean; period?: string } = {},
): Promise<ResultadoPrefacturas> {
  const destino = (process.env.BILLING_OWNER_PHONE ?? "").replace(/\D/g, "");
  if (!destino) return { enviado: false, motivo: "BILLING_OWNER_PHONE no está configurado" };
  if (!negocio.facturacion) return { enviado: false, motivo: "El negocio no tiene datos de facturación" };

  const period = input.period ?? periodoACobrar(input.ahora ?? new Date());
  if (!input.forzar) {
    if (period < BILLING_START.slice(0, 7)) return { enviado: false, motivo: "El servicio todavía no facturaba ese mes", period };
    if (await candado.ultimo() === period) return { enviado: false, motivo: "Las pre-facturas de ese mes ya salieron", period };
    if (!await candado.reclamar(period)) return { enviado: false, motivo: "Otro proceso ya tomó las pre-facturas", period };
  }

  const soltar = async (motivo: string): Promise<ResultadoPrefacturas> => {
    if (!input.forzar) await candado.soltar(period);
    return { enviado: false, motivo, period };
  };

  try {
    const meses = await mesesFacturados();
    const mes = meses.find((m) => m.period === period);
    if (!mes) return await soltar(`No hay cuenta para ${period}`);
    const impagos = meses.filter((m) => !m.pagado && !m.enCurso && m.period < period);

    const wamid = await sendAdvisorText(textoDePrefacturas(mes, impagos), destino);
    if (!wamid) return await soltar("Meta no devolvió id del mensaje");
    if ((await rechazadosPorMeta([wamid])).size) {
      console.warn(
        `⚠️ Pre-facturas de ${period}: Meta rechazó el mensaje. Causa habitual: la ventana de 24 h — ` +
        "el número del dueño tiene que escribirle al número del negocio. Se reintenta en 15 min.",
      );
      return await soltar("Meta lo rechazó (ventana de 24 h); se reintenta");
    }

    for (const { p, pdf, filename } of await prefacturasEnPdf(mes)) {
      await sendAdvisorPdf({ to: destino, pdf, filename, caption: `${p.ref} · ${usd(p.total)}` });
    }
    console.log(`🧾 Pre-facturas de ${period} enviadas al dueño (${usd(mes.total)})`);
    return { enviado: true, period };
  } catch (error) {
    console.error("⚠️ Pre-facturas no salieron:", error instanceof Error ? error.message : error);
    return await soltar(error instanceof Error ? error.message : "Error al enviar");
  }
}
