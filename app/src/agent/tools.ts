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
  ensureCatalogReady,
  findByCode,
  searchAlternatives,
  searchBySize,
  searchByText,
} from "../services/catalog.js";
import {
  buildQuote,
  renderComparisonPdf,
  renderQuotePdf,
} from "../services/quotePdf.js";
import {
  buildCustomerOptionsMessage,
  warrantyForBrand,
} from "../services/quoteMessages.js";
import {
  appendMessage,
  logQuote,
  logQuoteArtifact,
  setStage,
  type Conversation,
} from "../services/conversations.js";
import { lookupFitment } from "../domain/fitment.js";
import { nearestStore } from "../domain/locations.js";
import { formatTireSize } from "../domain/tireSize.js";
import { notifySeller, sendPdf } from "../wa/client.js";

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
      "Busca llantas en el catálogo real por medida exacta. Devuelve opciones con marca, precio final para el cliente (IVA incluido) y disponibilidad. Si no hay stock exacto, incluye alternativas del mismo aro que podrían servir al vehículo. Úsala SIEMPRE antes de mencionar precios o disponibilidad.",
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
      await ensureCatalogReady();
      const size = { width, aspect, rim };
      const exact = searchBySize(size);
      const alternatives = exact.some((i) => i.stock > 0) ? [] : searchAlternatives(size);
      return JSON.stringify({
        medida: formatTireSize(size),
        resultados: exact.slice(0, 8).map(toolItem),
        alternativas_mismo_aro: alternatives.slice(0, 5).map(toolItem),
      });
    },
  });

  const buscarCatalogo = defineTool({
    name: "buscar_catalogo",
    description:
      "Busca el catálogo real por texto: medida completa, código, marca, diseño o combinaciones como '205/55R16 Falken' y 'KR203'. Devuelve máximo 8 opciones ordenadas por coincidencia y disponibilidad. Úsala cuando el cliente escriba una referencia o una consulta libre.",
    schema: z.object({
      consulta: z.string().min(2).max(100),
    }),
    run: async ({ consulta }) => {
      await ensureCatalogReady();
      return JSON.stringify({
        consulta,
        resultados: searchByText(consulta, 8).map(toolItem),
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

  const prepararOpciones = defineTool({
    name: "preparar_opciones",
    description:
      "Construye el mensaje bonito de opciones para cliente final usando productos reales que ya devolvió una búsqueda. Úsala después de confirmar la medida. Devuelve el texto final; debes responder con ese texto sin reescribir precios ni garantías.",
    schema: z.object({
      codes: z.array(z.string().min(1)).min(1).max(12),
      nombre_cliente: z.string().default("Cliente"),
    }),
    run: async ({ codes, nombre_cliente }) => {
      await ensureCatalogReady();
      const products = codes
        .map((code) => findByCode(code))
        .filter((product): product is NonNullable<typeof product> => Boolean(product));
      if (!products.length) {
        return JSON.stringify({ error: "No se encontraron los productos seleccionados" });
      }
      const message = buildCustomerOptionsMessage(products, nombre_cliente);
      await logQuoteArtifact({
        conversationId: ctx.conversation.id,
        kind: "options",
        products: products.map((product) => ({
          id: product.id,
          code: product.code,
          brand: product.brand,
          design: product.design,
          size: product.sizeLabel,
        })),
      });
      return JSON.stringify({
        mensaje_para_enviar: message,
        regla: "Responde usando exactamente mensaje_para_enviar; no sumes alternativas.",
      });
    },
  });

  const enviarComparacion = defineTool({
    name: "enviar_comparacion",
    description:
      "Genera y envía un PDF comparativo de 2–3 llantas distintas. Úsala cuando el cliente esté dudando explícitamente entre modelos concretos. La comparación es por unidad y nunca suma las opciones como una compra.",
    schema: z.object({
      codes: z.array(z.string().min(1)).min(2).max(3),
    }),
    run: async ({ codes }) => {
      await ensureCatalogReady();
      const products = codes.map((code) => findByCode(code));
      if (products.some((product) => !product)) {
        return JSON.stringify({ error: "Uno de los códigos ya no existe; vuelve a buscar" });
      }
      const selected = products.filter(
        (product): product is NonNullable<typeof product> => Boolean(product),
      );
      if (new Set(selected.map((product) => product.id)).size !== selected.length) {
        return JSON.stringify({ error: "La comparación exige modelos distintos" });
      }
      const pdf = await renderComparisonPdf(selected);
      const filename = `Comparativa-${business.name.replace(/\s/g, "")}.pdf`;
      const providerId = await sendPdf(
        ctx.customerPhone,
        pdf,
        filename,
        "Comparativa de llantas por unidad 📄",
      );
      await appendMessage(
        ctx.conversation.id,
        "assistant",
        `Comparativa enviada: ${selected.map((product) => `${product.brand} ${product.design}`).join(" · ")}`,
        providerId,
        {
          type: "pdf",
          authorKind: "bot",
          status: "sent",
          metadata: { filename, codes },
        },
      );
      await logQuoteArtifact({
        conversationId: ctx.conversation.id,
        kind: "comparison",
        products: selected.map((product) => ({
          id: product.id,
          code: product.code,
          brand: product.brand,
          design: product.design,
          size: product.sizeLabel,
        })),
        filename,
        providerId,
      });
      return JSON.stringify({
        enviada: true,
        modelos: selected.map((product) => `${product.brand} ${product.design}`),
        nota: "Comparación por unidad; no hay total conjunto.",
      });
    },
  });

  const generarCotizacion = defineTool({
    name: "generar_cotizacion",
    description:
      "Genera la cotización en PDF y se la envía al cliente por WhatsApp automáticamente. Úsala cuando el cliente haya confirmado qué llanta(s) y cuántas unidades quiere. Devuelve los totales con IVA para que los menciones en el chat.",
    schema: z.object({
      items: z
        .array(
          z.object({
            code: z.string().describe("Código del producto tal como lo devolvió buscar_llanta"),
            cantidad: z.number().int().min(1).max(8),
          }),
        )
        .length(1)
        .describe("Una sola llanta ya elegida; las alternativas se comparan antes"),
      nombre_cliente: z.string().describe("Nombre del cliente si lo conoces, o 'Cliente'"),
    }),
    run: async ({ items, nombre_cliente }) => {
      await ensureCatalogReady();
      const lines = [];
      for (const item of items) {
        const product = findByCode(item.code);
        if (!product) {
          return JSON.stringify({
            error: `Código ${item.code} no existe en el catálogo. Vuelve a buscar la llanta.`,
          });
        }
        if (product.availability === "out") {
          return JSON.stringify({
            error: `${product.brand} ${product.design} está agotada. Busca otra opción disponible antes de cotizar.`,
          });
        }
        lines.push({
          code: product.code,
          description: `Llanta ${product.brand} ${product.design} ${product.sizeLabel}`,
          quantity: item.cantidad,
          unitPrice:
            product.minimumPriceWithTax / (1 + product.taxRate),
          brand: product.brand,
          design: product.design,
          sizeLabel: product.sizeLabel,
          listPriceWithTax: product.customerPriceWithTax,
          salePriceWithTax: product.minimumPriceWithTax,
          availability: product.availability,
          imageUrl: product.imageUrl,
          loadSpeed: product.loadSpeed,
          warrantyFactory: warrantyForBrand(product.brand).factory,
          warrantyRoadHazard: warrantyForBrand(product.brand).roadHazard,
        });
      }
      const quote = buildQuote(lines, nombre_cliente, ctx.customerPhone);
      const pdf = await renderQuotePdf(quote);
      const filename = `Cotizacion-${business.name.replace(/\s/g, "")}-${quote.number}.pdf`;
      const providerId = await sendPdf(
        ctx.customerPhone,
        pdf,
        filename,
        `Su cotización ${quote.number} 📄`,
      );
      await appendMessage(
        ctx.conversation.id,
        "assistant",
        `Cotización ${quote.number} enviada por $${quote.total.toFixed(2)}`,
        providerId,
        {
          type: "pdf",
          authorKind: "bot",
          status: "sent",
          metadata: { filename, quoteNumber: quote.number },
        },
      );
      await logQuote(ctx.conversation.id, quote.lines, quote.subtotal, quote.tax, quote.total);
      await logQuoteArtifact({
        conversationId: ctx.conversation.id,
        kind: "quote",
        products: quote.lines,
        filename,
        providerId,
      });
      await setStage(ctx.conversation.id, "cotizacion_enviada", {
        actor: "customer",
        reason: "Cliente confirmó un modelo y cantidad",
      });
      return JSON.stringify({
        enviada: true,
        numero: quote.number,
        subtotal: quote.subtotal,
        iva: quote.tax,
        total_con_iva: quote.total,
      });
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
      await setStage(ctx.conversation.id, "handoff_visita", {
        actor: "customer",
        reason: "Cliente confirmó interés/visita o pidió un humano",
      });
      return JSON.stringify({ notificado: true });
    },
  });

  return [
    buscarLlanta,
    buscarCatalogo,
    fitmentVehiculo,
    prepararOpciones,
    enviarComparacion,
    generarCotizacion,
    localMasCercano,
    notificarVendedor,
  ];
}

function toolItem(item: {
  code: string;
  brand: string;
  design: string;
  sizeLabel: string | null;
  customerPriceWithTax?: number;
  minimumPriceWithTax?: number;
  stock: number;
  availability?: string;
}) {
  return {
    code: item.code,
    marca: item.brand,
    diseno: item.design,
    medida: item.sizeLabel ?? "Sin medida",
    precio_lista_con_iva: item.customerPriceWithTax,
    precio_hoy_con_iva: item.minimumPriceWithTax,
    stock: item.stock,
    disponibilidad: item.availability,
  };
}
