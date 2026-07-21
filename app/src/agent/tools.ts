/**
 * Herramientas del agente (function calling con schemas Zod validados).
 * Las definiciones se convierten al formato de tools de OpenAI; Zod valida
 * los argumentos antes de ejecutar la lógica de negocio.
 *
 * Cada tool devuelve JSON en string; el agente redacta la respuesta al cliente.
 * El LLM extrae los datos, pero la lógica de negocio (búsqueda, precios, PDF)
 * es determinista — cero precios alucinados.
 */
import { z } from "zod";
import { business } from "../config.js";
import {
  findByCode,
  searchAlternatives,
  searchBySize,
  type CatalogItem,
} from "../services/catalog.js";
import { buildQuote, pngToQuotePdf, renderQuotePdf } from "../services/quotePdf.js";
import {
  renderCompareImage,
  renderQuoteImage,
  toRenderLine,
} from "../render/quoteImage.js";
import { logQuote, setStage, type Conversation } from "../services/conversations.js";
import { lookupFitment } from "../domain/fitment.js";
import { nearestStore } from "../domain/locations.js";
import { formatTireSize } from "../domain/tireSize.js";
import { notifySeller, sendImage, sendPdf } from "../wa/client.js";

function dateLabel(): string {
  return new Date().toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Guayaquil",
  });
}

export interface AgentContext {
  conversation: Conversation;
  customerPhone: string;
  customerName?: string;
}

export interface AgentTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  execute(args: unknown): Promise<string>;
}

function defineTool<T extends z.ZodTypeAny>(input: {
  name: string;
  description: string;
  schema: T;
  run: (args: z.output<T>) => Promise<string>;
}): AgentTool {
  return {
    type: "function",
    function: {
      name: input.name,
      description: input.description,
      parameters: z.toJSONSchema(input.schema) as Record<string, unknown>,
    },
    execute: async (args) => input.run(input.schema.parse(args)),
  };
}

export function buildTools(ctx: AgentContext) {
  const buscarLlanta = defineTool({
    name: "buscar_llanta",
    description:
      "Busca llantas en el catálogo por medida exacta. Devuelve opciones con marca, precio (sin IVA) y stock. Si no hay stock exacto, incluye alternativas del mismo aro que podrían servir al vehículo. Úsala SIEMPRE antes de mencionar precios o disponibilidad.",
    schema: z.object({
      width: z.number().int().describe("Ancho en mm, ej. 185"),
      aspect: z
        .number()
        .int()
        .nullable()
        .describe("Perfil, ej. 65. Null si el cliente dio una medida sin perfil como 185R14"),
      rim: z.number().int().describe("Aro en pulgadas, ej. 14"),
    }),
    run: async ({ width, aspect, rim }) => {
      const size = { width, aspect, rim };
      const exact = searchBySize(size);
      const alternatives = exact.some((i) => i.stock > 0) ? [] : searchAlternatives(size);
      return JSON.stringify({
        medida: formatTireSize(size),
        resultados: exact.map(toolItem),
        alternativas_mismo_aro: alternatives.slice(0, 5).map(toolItem),
      });
    },
  });

  const fitmentVehiculo = defineTool({
    name: "fitment_vehiculo",
    description:
      "Dado un vehículo (marca y modelo), devuelve las medidas de llanta de fábrica más comunes en Ecuador. Si validated es false, debes pedir al cliente que confirme la medida en el costado de su llanta.",
    schema: z.object({
      marca: z.string().describe("Marca del vehículo, ej. Chevrolet"),
      modelo: z.string().describe("Modelo, ej. Sail, D-Max, Hilux"),
    }),
    run: async ({ marca, modelo }) => {
      const entry = lookupFitment(marca, modelo);
      if (!entry) {
        return JSON.stringify({
          encontrado: false,
          mensaje:
            "Vehículo no está en la tabla. Pide al cliente la medida del costado de la llanta.",
        });
      }
      return JSON.stringify({
        encontrado: true,
        medidas: entry.sizes,
        validated: entry.validated,
      });
    },
  });

  const generarCotizacion = defineTool({
    name: "generar_cotizacion",
    description:
      "Genera la cotización visual (imagen) y se la envía al cliente por WhatsApp automáticamente. Úsala cuando el cliente haya confirmado qué llanta(s) y cuántas unidades quiere. Verifica stock real: si un producto no tiene stock suficiente devuelve error con alternativas — no cotices sin stock. Devuelve los totales con IVA para que los menciones en el chat (menciona SIEMPRE el número de cotización).",
    schema: z.object({
      items: z
        .array(
          z.object({
            code: z.string().describe("Código del producto tal como lo devolvió buscar_llanta"),
            cantidad: z.number().int().min(1).max(8),
          }),
        )
        .min(1),
      nombre_cliente: z.string().describe("Nombre del cliente si lo conoces, o 'Cliente'"),
      incluir_pdf: z
        .boolean()
        .optional()
        .describe("true SOLO si el cliente pidió explícitamente el PDF/documento"),
    }),
    run: async ({ items, nombre_cliente, incluir_pdf = false }) => {
      const lines = [];
      const products: { product: CatalogItem; cantidad: number }[] = [];
      for (const item of items) {
        const product = findByCode(item.code);
        if (!product) {
          return JSON.stringify({
            error: `Código ${item.code} no existe en el catálogo. Vuelve a buscar la llanta.`,
          });
        }
        if (product.stock <= 0) {
          return JSON.stringify({
            error: `${product.brand} ${product.design} ${product.sizeLabel} está SIN STOCK ahora mismo. No la cotices: ofrece estas alternativas del mismo aro.`,
            alternativas: searchAlternatives(product.size).slice(0, 5).map(toolItem),
          });
        }
        products.push({ product, cantidad: item.cantidad });
        lines.push({
          code: product.code,
          description: `Llanta ${product.brand} ${product.design} ${product.sizeLabel}`,
          quantity: item.cantidad,
          unitPrice: product.price,
        });
      }
      const quote = buildQuote(lines, nombre_cliente, ctx.customerPhone);

      // Imagen de cotización (pieza principal). Si falla, NO se cae la
      // cotización: se manda el PDF clásico y el agente igual da los totales.
      let imagenEnviada = false;
      let pngBuffer: Buffer | null = null;
      try {
        const renderLines = await Promise.all(
          products.map(({ product, cantidad }) =>
            toRenderLine({
              brand: product.brand,
              design: product.design,
              sizeLabel: product.sizeLabel,
              loadSpeed: product.loadSpeed,
              quantity: cantidad,
              priceSinIva: product.price,
              pvpSinIva: product.pvp,
              stock: product.stock,
              photoUrl: product.photoUrl,
            }),
          ),
        );
        pngBuffer = await renderQuoteImage({
          number: quote.number,
          dateLabel: dateLabel(),
          lines: renderLines,
          subtotal: quote.subtotal,
          iva: quote.tax,
          total: quote.total,
        });
        await sendImage(
          ctx.customerPhone,
          pngBuffer,
          `Cotización ${quote.number} · válida 3 días 🏁`,
        );
        imagenEnviada = true;
      } catch (err) {
        console.error(`❌ Imagen de cotización ${quote.number} falló:`, err);
      }

      // PDF: solo si lo pidió el cliente, o como respaldo si la imagen falló.
      let pdfEnviado = false;
      if (incluir_pdf || !imagenEnviada) {
        try {
          const pdf = pngBuffer ? await pngToQuotePdf(pngBuffer) : await renderQuotePdf(quote);
          await sendPdf(
            ctx.customerPhone,
            pdf,
            `Cotizacion-${business.name.replace(/\s/g, "")}-${quote.number}.pdf`,
            `Su cotización ${quote.number} 📄`,
          );
          pdfEnviado = true;
        } catch (err) {
          console.error(`❌ PDF de cotización ${quote.number} falló:`, err);
        }
      }

      await logQuote(ctx.conversation.id, quote.lines, quote.subtotal, quote.tax, quote.total);
      await setStage(ctx.conversation.id, "cotizado");

      if (!imagenEnviada && !pdfEnviado) {
        await notifySeller(
          `⚠️ Cotización ${quote.number} generada pero NO se pudo enviar imagen ni PDF a wa.me/${ctx.customerPhone}. Revisar logs.`,
        );
      }
      return JSON.stringify({
        numero: quote.number,
        imagen_enviada: imagenEnviada,
        pdf_enviado: pdfEnviado,
        subtotal: quote.subtotal,
        iva: quote.tax,
        total_con_iva: quote.total,
        nota:
          imagenEnviada || pdfEnviado
            ? "Cotización enviada. Da los totales en el chat y recuerda al cliente su número de cotización."
            : "FALLÓ el envío del adjunto: da la cotización COMPLETA en texto (producto, cantidad, totales y número de cotización) y discúlpate por el archivo.",
      });
    },
  });

  const compararLlantas = defineTool({
    name: "comparar_llantas",
    description:
      "Envía al cliente una imagen comparativa de 2 o 3 llantas lado a lado (foto, marca, precio, garantías). Úsala cuando el cliente esté decidiendo entre opciones o pida comparar. Devuelve los datos para que además resumas la comparación en texto.",
    schema: z.object({
      codes: z
        .array(z.string().describe("Código del producto tal como lo devolvió buscar_llanta"))
        .min(2)
        .max(3),
    }),
    run: async ({ codes }) => {
      const found: CatalogItem[] = [];
      for (const code of codes) {
        const product = findByCode(code);
        if (!product) {
          return JSON.stringify({
            error: `Código ${code} no existe en el catálogo. Vuelve a buscar la llanta.`,
          });
        }
        found.push(product);
      }
      try {
        const renderLines = await Promise.all(
          found.map((product) =>
            toRenderLine({
              brand: product.brand,
              design: product.design,
              sizeLabel: product.sizeLabel,
              loadSpeed: product.loadSpeed,
              quantity: 1,
              priceSinIva: product.price,
              pvpSinIva: product.pvp,
              stock: product.stock,
              photoUrl: product.photoUrl,
            }),
          ),
        );
        await sendImage(
          ctx.customerPhone,
          await renderCompareImage({ dateLabel: dateLabel(), products: renderLines }),
          "Comparativa para que elijas con calma 🏁",
        );
        return JSON.stringify({
          imagen_enviada: true,
          productos: found.map(toolItem),
        });
      } catch (err) {
        console.error("❌ Comparativa falló:", err);
        return JSON.stringify({
          imagen_enviada: false,
          productos: found.map(toolItem),
          nota: "La imagen falló: haz la comparación en texto claro (precio con IVA, garantía y disponibilidad de cada una).",
        });
      }
    },
  });

  const localMasCercano = defineTool({
    name: "local_mas_cercano",
    description:
      "Dada la ubicación del cliente (latitud/longitud que llega cuando comparte ubicación), devuelve el local más cercano con dirección y distancia.",
    schema: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
    run: async ({ lat, lng }) => {
      const { store, distanceKm } = nearestStore(business.stores, lat, lng);
      return JSON.stringify({
        local: store.name,
        direccion: store.address,
        distancia_km: distanceKm,
        maps: store.mapsUrl ?? null,
        horario: business.schedule,
      });
    },
  });

  const notificarVendedor = defineTool({
    name: "notificar_vendedor",
    description:
      "Alerta al vendedor humano por WhatsApp. Úsala cuando el cliente confirme compra/reserva, pida hablar con una persona, o tenga un caso que no puedas resolver. Incluye un resumen accionable: qué llanta, cuántas, a qué precio, y el teléfono del cliente.",
    schema: z.object({
      resumen: z
        .string()
        .describe("Resumen para el vendedor: producto, cantidad, total, estado del cliente"),
    }),
    run: async ({ resumen }) => {
      await notifySeller(
        `${resumen}\n\nCliente: ${ctx.customerName ?? "?"} (wa.me/${ctx.customerPhone})`,
      );
      await setStage(ctx.conversation.id, "alerta");
      return JSON.stringify({ notificado: true });
    },
  });

  return [
    buscarLlanta,
    fitmentVehiculo,
    generarCotizacion,
    compararLlantas,
    localMasCercano,
    notificarVendedor,
  ];
}

function toolItem(item: CatalogItem) {
  return {
    code: item.code,
    marca: item.brand,
    diseno: item.design,
    medida: item.sizeLabel,
    indice_carga: item.loadSpeed?.label ?? null,
    precio_sin_iva: item.price,
    precio_con_iva: Math.round(item.price * (1 + business.taxRate) * 100) / 100,
    stock: item.stock,
  };
}
