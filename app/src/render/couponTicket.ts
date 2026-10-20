/**
 * El ticket del cupón del 2 % — la imagen con QR que recibe el cliente.
 *
 * Por qué una imagen y no el texto de antes (Manuel, 19-oct-2026): un código
 * suelto en el chat se lee como un trámite; un ticket con QR se siente como un
 * premio, y un premio se reclama. En WhatsApp la imagen se abre en el propio
 * chat —un PDF sería un ícono gris que hay que tocar— y en caja basta con
 * mostrar la pantalla.
 *
 * El QR lleva el código tal cual («DT-PUMA47»). Hoy nadie lo escanea; el día
 * que caja tenga lector, el código entra sin teclear y `normalizarCodigoCupon`
 * ya lo acepta así. El código va además ESCRITO grande, porque eso es lo que
 * de verdad se dicta.
 *
 * Usa el mismo sistema de diseño que la cotización (paleta y fuente de Ajustes)
 * para que el cliente reconozca que viene de la misma tienda.
 */
import QRCode from "qrcode";
import { etiquetaVigencia, formatearDolares, formatearPorcentaje, type MotivoCupon } from "../domain/coupons.js";
import { ARCHIVO_BLACK, depotWordmark, el, img, racingBar, resolveTheme, text, type SatoriNode, type Theme } from "./depotDesign.js";
import { renderPng } from "./quoteImage.js";

export interface CouponTicketData {
  codigo: string;
  porcentaje: number;
  motivo: MotivoCupon;
  /** El porcentaje en dólares sobre la cotización. Null = no se dibuja. */
  ahorro: number | null;
  /** «4 × FALKEN WILDPEAK A/T 4W 265/60R18». */
  llantas: string | null;
  local: string | null;
  /** «sábado 24 de octubre», ya armado. */
  visita: string | null;
  validoHasta: Date | null;
  paleta?: string | null;
  fuente?: string | null;
}

const ANCHO = 900;

/** El QR como PNG embebido. Margen 1: el blanco lo pone la caja que lo rodea. */
export async function qrDataUri(contenido: string): Promise<string> {
  return QRCode.toDataURL(contenido, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 520,
    color: { dark: "#141414", light: "#ffffff" },
  });
}

export function couponTicketNode(data: CouponTicketData, qr: string, theme: Theme): SatoriNode {
  const { p, price } = theme;
  const pct = formatearPorcentaje(data.porcentaje).replace(" ", "");

  const dato = (rotulo: string, valor: string | null): SatoriNode | null => valor
    ? el({ flexDirection: "column", gap: 2 },
        text({ fontSize: 14, fontWeight: 700, letterSpacing: 2, color: p.tenue }, rotulo),
        text({ fontSize: 22, fontWeight: 700, color: p.dark, lineHeight: 1.25 }, valor))
    : null;

  return el({ flexDirection: "column", width: ANCHO, backgroundColor: p.base, fontFamily: "Archivo" },
    // Encabezado: el logo de siempre y qué es esto.
    el({ justifyContent: "space-between", alignItems: "center", padding: "26px 44px", backgroundColor: p.dark },
      depotWordmark(theme),
      text({ fontSize: 16, fontWeight: 700, letterSpacing: 4, color: p.gold }, "CUPÓN DE DESCUENTO"),
    ),
    racingBar(theme),

    // El premio.
    el({ flexDirection: "column", alignItems: "center", padding: "36px 44px 20px", gap: 6 },
      text({
        fontSize: 18, fontWeight: 700, letterSpacing: 4, color: p.paper,
        backgroundColor: p.accent, borderRadius: 999, padding: "8px 22px",
      }, data.motivo === "seguimiento" ? "¡USTED FUE SELECCIONADO!" : "¡GANÓ POR CONFIRMAR SU VISITA!"),
      el({ alignItems: "flex-end", gap: 16, marginTop: 8 },
        text({ ...price, fontSize: 168, lineHeight: 1, letterSpacing: -4, color: p.accent }, `+${pct}`),
        text({ ...ARCHIVO_BLACK, fontSize: 40, lineHeight: 1.1, color: p.dark, paddingBottom: 22 }, "ADICIONAL"),
      ),
      data.ahorro && data.ahorro > 0
        ? text({ fontSize: 32, fontWeight: 700, color: p.dark },
            `Son ${formatearDolares(data.ahorro)} menos sobre su cotización`)
        : text({ fontSize: 28, fontWeight: 700, color: p.dark }, "Se suma sobre su cotización"),
    ),

    // El ticket: código + QR, con borde troquelado.
    el({
      margin: "12px 44px 36px", padding: "30px 32px", gap: 28, alignItems: "center",
      backgroundColor: p.panel, borderRadius: 22, border: `4px dashed ${p.border}`,
    },
      el({ flex: 1, minWidth: 0, flexDirection: "column", gap: 18 },
        el({ flexDirection: "column", gap: 4 },
          text({ fontSize: 15, fontWeight: 700, letterSpacing: 3, color: p.tenue }, "SU CÓDIGO"),
          text({ ...ARCHIVO_BLACK, fontSize: 60, lineHeight: 1, letterSpacing: 1, color: p.dark }, data.codigo),
        ),
        dato("LLANTAS", data.llantas),
        dato("LOCAL", data.local),
        dato("SU VISITA", data.visita),
        data.validoHasta ? dato("VÁLIDO HASTA", etiquetaVigencia(data.validoHasta)) : null,
      ),
      el({ flexDirection: "column", alignItems: "center", gap: 10 },
        el({ padding: 10, backgroundColor: "#ffffff", borderRadius: 14, border: `2px solid ${p.border}` },
          img(qr, { width: 250, height: 250 })),
        text({ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: p.tenue }, "MUÉSTRELO EN CAJA"),
      ),
    ),

    // La condición que hace que el circuito funcione: sin código no hay 2 %.
    el({ flexDirection: "column", alignItems: "center", gap: 4, padding: "20px 44px", backgroundColor: p.accent },
      text({ fontSize: 22, fontWeight: 700, color: p.paper, textAlign: "center" },
        "Dígalo o muestre esta imagen en caja ANTES de pagar."),
      text({ fontSize: 17, color: p.accentSoft, textAlign: "center" },
        `Sin el código no se puede aplicar el ${formatearPorcentaje(data.porcentaje)}. Un cupón por cliente.`),
    ),
  );
}

export async function renderCouponTicket(data: CouponTicketData): Promise<Buffer> {
  const node = couponTicketNode(data, await qrDataUri(data.codigo), resolveTheme(data.paleta, data.fuente));
  return renderPng(node, ANCHO);
}
