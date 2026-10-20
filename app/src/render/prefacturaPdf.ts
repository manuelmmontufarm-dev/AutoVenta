/**
 * La pre-factura en PDF, con la misma disposición que la factura de Siigo de
 * la contadora: emisor a la izquierda, datos del comprobante a la derecha,
 * cliente, ítem, información adicional, forma de pago y los subtotales por
 * tarifa. Lo que Siigo y el SRI asignan (número, autorización) queda dicho,
 * no inventado.
 */
import pdfmake from "pdfmake";
import type { Facturacion } from "../negocio/perfil.js";
import type { MesFacturado } from "../services/billing.js";
import type { Prefactura } from "../services/prefacturaMensual.js";
import { registrarFuentes } from "./dailyReportPdf.js";

const GRIS = "#f1f1f1";
const GRIS_OSCURO = "#e4e4e4";
const APOYO = "#555555";
const AVISO = "#fff4d6";

const usd = (n: number) => `$${n.toFixed(2)}`;
const ddmmyyyy = (iso: string) => iso.split("-").reverse().join("/");
const hoyQuito = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });

type Nodo = Record<string, unknown> | string;

/** «Etiqueta: valor» con la etiqueta en negrita, como en Siigo. */
const campo = (k: string, v: string): Nodo => ({ text: [{ text: `${k}: `, bold: true }, v || ""], margin: [0, 1, 0, 1] });

/** Un bloque de fondo gris a lo ancho de su columna. */
const caja = (stack: Nodo[], fondo = GRIS): Nodo => ({
  table: { widths: ["*"], body: [[{ stack, fillColor: fondo, margin: [8, 6, 8, 6] }]] },
  layout: "noBorders",
});

export function documentoPrefactura(input: {
  p: Prefactura;
  mes: MesFacturado;
  datos: Facturacion;
  ivaPorc: number;
  emitida?: string;
}): Record<string, unknown> {
  const { p, datos: d, ivaPorc } = input;
  const e = d.emisor;
  const c = d.cliente;
  const emitida = input.emitida ?? hoyQuito();
  const totales: [string, number][] = [
    ["Subtotal Sin Impuestos", p.subtotal],
    [`Subtotal ${ivaPorc}%`, p.subtotal],
    ["Subtotal 5%", 0],
    ["Subtotal 0%", 0],
    ["Subtotal No Objeto IVA", 0],
    ["Descuentos", 0],
    ["ICE", 0],
    [`IVA ${ivaPorc}%`, p.iva],
    ["IVA 5%", 0],
    ["Servicio %", 0],
    ["Valor Total", p.total],
  ];
  const cabecera = (t: string) => ({ text: t, bold: true, fillColor: GRIS_OSCURO, alignment: "center", fontSize: 8.5 });
  const t = d.transferencia;

  const content: Nodo[] = [];
  if (p.preliminar) {
    content.push(caja([{ text: "PRELIMINAR — el mes todavía no cierra; el consumo de IA puede subir. No facturar con estos valores.", bold: true }], AVISO), { text: " ", fontSize: 4 });
  }
  content.push(
    {
      columns: [
        caja([campo("Emisor", e.nombre), campo("RUC", e.ruc), campo("Matriz", e.matriz), campo("Correo", e.correo), campo("Teléfono", e.telefono), campo("Obligado a llevar contabilidad", e.obligadoContabilidad)]),
        caja([
          { columns: [{ text: "PRE-FACTURA", bold: true, fontSize: 13 }, { text: `Ref. ${p.ref}`, bold: true, fontSize: 11, alignment: "right" }], margin: [0, 0, 0, 6] },
          { text: "No. de factura:", bold: true }, "Lo asigna Siigo al emitir (001-002-…)",
          { text: "Número de Autorización / Clave de Acceso:", bold: true, margin: [0, 4, 0, 0] }, "La asigna el SRI al autorizar",
          { text: "Ambiente / Emisión:", bold: true, margin: [0, 4, 0, 0] }, "PRODUCCION / NORMAL",
        ]),
      ],
      columnGap: 8,
    },
    { text: " ", fontSize: 4 },
    caja([
      { columns: [{ width: "*", stack: [campo("Razón Social", c.razonSocial), campo("Dirección", c.direccion), campo("Fecha Emisión", ddmmyyyy(emitida))] }, { width: 190, stack: [campo("RUC/CI", c.ruc), campo("Teléfono", c.telefono), campo("Correo", c.correo)] }], columnGap: 12 },
    ]),
    {
      margin: [0, 10, 0, 0],
      table: {
        widths: [48, 42, 80, "*", 52, 50, 52],
        body: [
          ["Código Principal", "Cantidad", "Descripción", "Detalles Adicionales", "Precio Unitario", "Descuento", "Total"].map(cabecera),
          [
            d.item.codigo,
            { text: "1.00", alignment: "right" },
            d.item.descripcion,
            `Detalle: ${p.detalle}`,
            { text: p.subtotal.toFixed(2), alignment: "right" },
            { text: "$0.00", alignment: "right" },
            { text: usd(p.subtotal), alignment: "right" },
          ],
        ],
      },
      layout: "noBorders",
    },
    {
      margin: [0, 10, 0, 0],
      columns: [
        {
          width: "*",
          stack: [
            caja([{ text: "Información Adicional", bold: true }], GRIS_OSCURO),
            caja([{ table: { widths: [70, "*"], body: d.infoAdicional.map(([k, v]) => [k, v]) }, layout: "noBorders" }]),
            { text: " ", fontSize: 4 },
            caja([{ text: "Formas de pago", bold: true }], GRIS_OSCURO),
            caja([{ columns: [{ text: d.formaPago.descripcion, width: "*" }, { text: usd(p.total), width: 50, alignment: "right" }, { text: d.formaPago.plazo, width: 40, alignment: "right" }] }]),
          ],
        },
        {
          width: 210,
          table: {
            widths: ["*", 60],
            body: totales.map(([k, v], i) => {
              const ultimo = i === totales.length - 1;
              return [
                { text: `${k}:`, fillColor: GRIS, bold: ultimo },
                { text: usd(v), alignment: "right", fillColor: GRIS_OSCURO, bold: ultimo },
              ];
            }),
          },
          layout: { hLineWidth: () => 1.5, vLineWidth: () => 0, hLineColor: () => "#ffffff" },
        },
      ],
      columnGap: 12,
    },
    {
      margin: [0, 14, 0, 0],
      table: {
        widths: ["*"],
        body: [[{
          margin: [8, 6, 8, 6],
          stack: [
            { text: "Para la contadora — cargar en Siigo así:", bold: true, margin: [0, 0, 0, 2] },
            `Cliente ${c.razonSocial} (RUC ${c.ruc}) · 1 ítem «${d.item.descripcion}», código ${d.item.codigo}, detalle «${p.detalle}», ` +
              `precio ${p.subtotal.toFixed(2)}, IVA ${ivaPorc}% · forma de pago «${d.formaPago.descripcion}», ${d.formaPago.plazo} · total ${usd(p.total)}.`,
          ],
        }]],
      },
      layout: { hLineStyle: () => ({ dash: { length: 3 } }), vLineStyle: () => ({ dash: { length: 3 } }), hLineColor: () => "#888888", vLineColor: () => "#888888" },
    },
  );
  if (t?.cuenta) {
    content.push({
      margin: [0, 8, 0, 0],
      text: [
        { text: "Datos para la transferencia: ", bold: true },
        `${t.titular} · RUC ${t.ruc} · ${t.banco} · ${t.tipo} N.º ${t.cuenta} · Comprobante a ${t.correo}`,
      ],
    });
  }
  content.push({ text: p.anexo, color: APOYO, fontSize: 8.5, margin: [0, 8, 0, 0] });

  return {
    pageSize: "A4",
    pageMargins: [36, 36, 36, 36],
    info: { title: `Pre-factura ${p.ref} · ${c.razonSocial}` },
    defaultStyle: { font: "Archivo", fontSize: 9, lineHeight: 1.15, color: "#1c1c1c" },
    content,
  };
}

export async function renderPrefacturaPdf(input: Parameters<typeof documentoPrefactura>[0]): Promise<Buffer> {
  registrarFuentes("exo");
  return pdfmake.createPdf(documentoPrefactura(input) as never).getBuffer();
}
