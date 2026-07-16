/**
 * Herramientas del agente (function calling con schemas Zod validados).
 * Reusa: tool runner oficial del SDK de Anthropic (betaZodTool).
 *
 * Cada tool devuelve JSON en string; el agente redacta la respuesta al cliente.
 * El LLM extrae los datos, pero la lógica de negocio (búsqueda, precios, PDF)
 * es determinista — cero precios alucinados.
 */
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { business } from "../config.js";
import { findByCode, searchAlternatives, searchBySize } from "../services/catalog.js";
import { buildQuote, renderQuotePdf } from "../services/quotePdf.js";
import { logQuote, setStage, type Conversation } from "../services/conversations.js";
import { lookupFitment } from "../domain/fitment.js";
import { nearestStore } from "../domain/locations.js";
import { formatTireSize } from "../domain/tireSize.js";
import { notifySeller, sendPdf } from "../wa/client.js";

export interface AgentContext {
  conversation: Conversation;
  customerPhone: string;
  customerName?: string;
}

export function buildTools(ctx: AgentContext) {
  const buscarLlanta = betaZodTool({
    name: "buscar_llanta",
    description:
      "Busca llantas en el catálogo por medida exacta. Devuelve opciones con marca, precio (sin IVA) y stock. Si no hay stock exacto, incluye alternativas del mismo aro que podrían servir al vehículo. Úsala SIEMPRE antes de mencionar precios o disponibilidad.",
    inputSchema: z.object({
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

  const fitmentVehiculo = betaZodTool({
    name: "fitment_vehiculo",
    description:
      "Dado un vehículo (marca y modelo), devuelve las medidas de llanta de fábrica más comunes en Ecuador. Si validated es false, debes pedir al cliente que confirme la medida en el costado de su llanta.",
    inputSchema: z.object({
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

  const generarCotizacion = betaZodTool({
    name: "generar_cotizacion",
    description:
      "Genera la cotización en PDF y se la envía al cliente por WhatsApp automáticamente. Úsala cuando el cliente haya confirmado qué llanta(s) y cuántas unidades quiere. Devuelve los totales con IVA para que los menciones en el chat.",
    inputSchema: z.object({
      items: z
        .array(
          z.object({
            code: z.string().describe("Código del producto tal como lo devolvió buscar_llanta"),
            cantidad: z.number().int().min(1).max(8),
          }),
        )
        .min(1),
      nombre_cliente: z.string().describe("Nombre del cliente si lo conoces, o 'Cliente'"),
    }),
    run: async ({ items, nombre_cliente }) => {
      const lines = [];
      for (const item of items) {
        const product = findByCode(item.code);
        if (!product) {
          return JSON.stringify({
            error: `Código ${item.code} no existe en el catálogo. Vuelve a buscar la llanta.`,
          });
        }
        lines.push({
          code: product.code,
          description: `Llanta ${product.brand} ${product.design} ${product.sizeLabel}`,
          quantity: item.cantidad,
          unitPrice: product.price,
        });
      }
      const quote = buildQuote(lines, nombre_cliente, ctx.customerPhone);
      const pdf = await renderQuotePdf(quote);
      await sendPdf(
        ctx.customerPhone,
        pdf,
        `Cotizacion-${business.name.replace(/\s/g, "")}-${quote.number}.pdf`,
        `Su cotización ${quote.number} 📄`,
      );
      await logQuote(ctx.conversation.id, quote.lines, quote.subtotal, quote.tax, quote.total);
      await setStage(ctx.conversation.id, "cotizado");
      return JSON.stringify({
        enviada: true,
        numero: quote.number,
        subtotal: quote.subtotal,
        iva: quote.tax,
        total_con_iva: quote.total,
      });
    },
  });

  const localMasCercano = betaZodTool({
    name: "local_mas_cercano",
    description:
      "Dada la ubicación del cliente (latitud/longitud que llega cuando comparte ubicación), devuelve el local más cercano con dirección y distancia.",
    inputSchema: z.object({
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

  const notificarVendedor = betaZodTool({
    name: "notificar_vendedor",
    description:
      "Alerta al vendedor humano por WhatsApp. Úsala cuando el cliente confirme compra/reserva, pida hablar con una persona, o tenga un caso que no puedas resolver. Incluye un resumen accionable: qué llanta, cuántas, a qué precio, y el teléfono del cliente.",
    inputSchema: z.object({
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

  return [buscarLlanta, fitmentVehiculo, generarCotizacion, localMasCercano, notificarVendedor];
}

function toolItem(item: {
  code: string;
  brand: string;
  design: string;
  sizeLabel: string;
  price: number;
  stock: number;
}) {
  return {
    code: item.code,
    marca: item.brand,
    diseno: item.design,
    medida: item.sizeLabel,
    precio_sin_iva: item.price,
    stock: item.stock,
  };
}
