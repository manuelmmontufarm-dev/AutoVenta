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
  resolveCatalogReference,
  searchAlternatives,
  searchBySize,
  searchByText,
} from "../services/catalog.js";
import {
  buildQuote,
  pngToQuotePdf,
  renderComparisonPdf,
  renderQuotePdf,
} from "../services/quotePdf.js";
import {
  buildComparisonMessage,
  buildCustomerOptionsMessage,
  buildSingleQuoteMessage,
  warrantyForBrand,
} from "../services/quoteMessages.js";
import {
  appendMessage,
  logQuote,
  logQuoteArtifact,
  setStage,
  updateConversationFacts,
  type Conversation,
} from "../services/conversations.js";
import { researchVehicleFitment } from "../services/vehicleFitmentResearch.js";
import { nearestStore, resolveSector } from "../domain/locations.js";
import { formatTireSize } from "../domain/tireSize.js";
import { canGenerateFinalQuote } from "../domain/salesIntent.js";
import { getTirePatternProfile } from "../domain/tireKnowledge.js";
import { sendImage, sendPdf } from "../wa/client.js";
import {
  renderCompareImage,
  renderOptionsImage,
  renderQuoteImage,
  toRenderLine,
} from "../render/quoteImage.js";
import { sql } from "../db/client.js";
import { createBotAlert } from "../services/followUps.js";
import { attachDiscountOfferToQuote, getActiveDiscountOffer, materializePendingDiscount } from "../services/discountOffers.js";
import { notifyAdvisor } from "../services/advisorNotifications.js";

export interface AgentContext {
  conversation: Conversation;
  customerPhone: string;
  customerName?: string;
  currentUserText: string;
  comparedThisTurn?: boolean;
  resumedFromHuman?: boolean;
  discountNotice?: { source: "pending" | "offer"; id: number };
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

function dateLabel(): string {
  return new Date().toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Guayaquil",
  });
}

async function resolvePresentedProduct(conversationId: number, reference: string) {
  const [artifact] = await sql<{ products: Array<{ code?: string; brand?: string; design?: string }> }[]>`
    select products from quote_artifacts
    where conversation_id=${conversationId}
      and cycle=(select current_cycle from conversations where id=${conversationId})
      and kind in ('options','comparison')
    order by created_at desc, id desc limit 1
  `;
  const products = (Array.isArray(artifact?.products) ? artifact.products : [])
    .map((item) => findByCode(String(item.code ?? "")))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const clean = reference.trim().toLowerCase().replace(/[$,]/g, "");
  const numeric = Number(clean);
  const matches = products.filter((product) => {
    const labels = [product.code, product.id, product.design, `${product.brand} ${product.design}`]
      .map((value) => value.trim().toLowerCase());
    if (labels.includes(clean)) return true;
    return Number.isFinite(numeric) && (
      Math.round(product.minimumPriceWithTax) === Math.round(numeric) ||
      Math.abs(product.minimumPriceWithTax - numeric) < 0.01
    );
  });
  if (matches.length === 1) return matches[0];
  return resolveCatalogReference(reference);
}

/**
 * Envía una pieza visual (cotización o comparativa) por WhatsApp.
 * Nunca lanza: si el render o el envío fallan, devuelve ok=false y el flujo
 * cae al PDF — el cliente jamás se queda sin su cotización (fallo del demo 20-jul).
 */
async function sendVisual(
  conversationId: number,
  to: string,
  render: () => Promise<Buffer>,
  caption: string,
  filename: string,
  what: string,
): Promise<{ ok: boolean; providerId?: string; png?: Buffer }> {
  let png: Buffer | undefined;
  try {
    png = await render();
    const providerId = await sendImage(conversationId, to, png, caption, filename);
    return { ok: true, providerId, png };
  } catch (err) {
    console.error(`❌ Imagen de ${what} falló:`, err);
    return { ok: false, png };
  }
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
      await updateConversationFacts(ctx.conversation.id, { tireSize: formatTireSize(size) });
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
      "Dado un vehículo (marca, modelo y año), busca medidas verificadas. Año/modelo por sí solos no prueban compatibilidad: si falta una fuente o hay varias versiones, dilo claramente y pide versión/origen o foto de la etiqueta de puerta/costado de la llanta.",
    schema: z.object({
      marca: z.string().describe("Marca del vehículo, ej. Chevrolet"),
      modelo: z.string().describe("Modelo, ej. Sail, D-Max, Hilux"),
      anio: z.number().int().min(1950).max(2030).nullable().default(null),
    }),
    run: async ({ marca, modelo, anio }) => {
      const vehicle = `${marca} ${modelo}${anio ? ` ${anio}` : ""}`.trim();
      await updateConversationFacts(ctx.conversation.id, { vehicle, ...(anio ? { vehicleYear: anio } : {}) });
      const result = await researchVehicleFitment(marca, modelo, anio);
      if (result.status === "not_found") {
        return JSON.stringify({
          encontrado: false,
          compatibilidad_confirmada: false,
          mensaje:
            "No existe una medida verificada para ese año/modelo en la base. No afirmes que una llanta le entra. Pregunta la versión o país de fabricación y ofrece identificar la medida con una foto de la etiqueta de la puerta o del costado de una llanta actual.",
          siguiente_pregunta: result.nextQuestion,
        });
      }
      return JSON.stringify({
        encontrado: true,
        medidas: result.sizes,
        compatibilidad_confirmada: result.status === "verified",
        estado: result.status,
        nota: result.note,
        fuentes: result.sources,
        siguiente_pregunta: result.nextQuestion,
        regla:
          "Muestra la fuente. Si estado no es verified, preséntalo solo como referencia y haz una sola pregunta discriminante; nunca afirmes que entra sin confirmar versión/etiqueta.",
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

      // Pieza visual del catálogo (agrupada por marca). Si falla, el texto
      // sigue siendo la respuesta — el cliente nunca se queda sin opciones.
      const sizeLabel = products[0]?.sizeLabel ?? null;
      const visual = await sendVisual(
        ctx.conversation.id,
        ctx.customerPhone,
        async () =>
          renderOptionsImage({
            dateLabel: dateLabel(),
            sizeLabel,
            products: await Promise.all(products.map((product) => toRenderLine(product))),
          }),
        `Opciones disponibles${sizeLabel ? ` en ${sizeLabel}` : ""} 🏁`,
        `Opciones-${business.name.replace(/\s/g, "")}.png`,
        "opciones",
      );
      if (visual.ok) {
        await appendMessage(
          ctx.conversation.id,
          "assistant",
          `Opciones enviadas: ${products.map((p) => `${p.brand} ${p.design}`).join(" · ")}`,
          visual.providerId,
          {
            type: "image",
            authorKind: "bot",
            status: "sent",
            metadata: { codes },
          },
        );
      }
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
        imagen_enviada: visual.ok,
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
      // Pieza visual primero (lo que pidió el cliente); el PDF queda de respaldo.
      const imageName = `Comparativa-${business.name.replace(/\s/g, "")}.png`;
      const visual = await sendVisual(
        ctx.conversation.id,
        ctx.customerPhone,
        async () =>
          renderCompareImage({
            dateLabel: dateLabel(),
            products: await Promise.all(selected.map((product) => toRenderLine(product))),
          }),
        "Comparativa para que elijas con calma 🏁",
        imageName,
        "comparativa",
      );
      let filename = imageName;
      let providerId = visual.providerId;
      if (!visual.ok) {
        const pdf = await renderComparisonPdf(selected);
        filename = `Comparativa-${business.name.replace(/\s/g, "")}.pdf`;
        providerId = await sendPdf(
          ctx.conversation.id,
          ctx.customerPhone,
          pdf,
          filename,
          "Comparativa de llantas por unidad 📄",
        );
      }
      await appendMessage(
        ctx.conversation.id,
        "assistant",
        `Comparativa enviada: ${selected.map((product) => `${product.brand} ${product.design}`).join(" · ")}`,
        providerId,
        {
          type: visual.ok ? "image" : "pdf",
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
      const comparisonText = [
        buildComparisonMessage(selected),
        buildTechnicalGuidance(selected, ctx.currentUserText),
      ].filter(Boolean).join("\n\n");
      return JSON.stringify({
        enviada: true,
        modelos: selected.map((product) => `${product.brand} ${product.design}`),
        mensaje_para_enviar: comparisonText,
        perfiles_tecnicos: selected.map((product) => ({
          modelo: `${product.brand} ${product.design}`,
          perfil: getTirePatternProfile(product.brand, product.design),
        })),
        regla:
          "Responde con mensaje_para_enviar sin saludo y, si preguntó por uso, agrega solo conclusiones respaldadas por perfiles_tecnicos. El PDF ya fue enviado. NO generes cotización.",
      });
    },
  });

  const generarCotizacion = defineTool({
    name: "generar_cotizacion",
    description:
      "Genera la cotización y se la envía al cliente por WhatsApp automáticamente. Úsala en cuanto modelo y cantidad estén confirmados, incluso si la cantidad apareció en un mensaje anterior. No pidas una confirmación adicional: cotiza y después pregunta si está bien. Devuelve los totales con IVA para que los menciones en el chat.",
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
      incluir_pdf: z
        .boolean()
        .optional()
        .describe("true SOLO si el cliente pidió explícitamente el PDF/documento"),
    }),
    run: async ({ items, nombre_cliente, incluir_pdf = false }) => {
      const [facts] = await sql<{ selected_quantity: number | null }[]>`
        select selected_quantity from conversations where id=${ctx.conversation.id}
      `;
      const quantityWasConfirmed = facts?.selected_quantity === items[0]?.cantidad;
      if (!canGenerateFinalQuote(ctx.currentUserText, ctx.comparedThisTurn, quantityWasConfirmed)) {
        return JSON.stringify({
          error:
            "Cotización bloqueada: esta conversación aún está comparando o el último mensaje no confirmó una cantidad. Pide un modelo y una cantidad explícitos. No envíes PDF de cotización.",
        });
      }
      await ensureCatalogReady();
      const lines = [];
      for (const item of items) {
        const product = await resolvePresentedProduct(ctx.conversation.id, item.code);
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
      let activeDiscount = await getActiveDiscountOffer(ctx.conversation.id);
      if (!activeDiscount) {
        const baseQuote = buildQuote(lines, nombre_cliente, ctx.customerPhone);
        activeDiscount = await materializePendingDiscount(
          ctx.conversation.id,
          Math.round(baseQuote.total * 100),
        );
      }
      const quote = buildQuote(
        lines,
        nombre_cliente,
        ctx.customerPhone,
        activeDiscount ? {
          amount: activeDiscount.discountAmountCents / 100,
          reason: activeDiscount.reason,
          condition: activeDiscount.condition,
          expiresAt: activeDiscount.expiresAt,
        } : undefined,
      );
      const saleNumber = `AV-${quote.number.replace(/\D/g, "").slice(-6)}`;
      const product = await resolvePresentedProduct(ctx.conversation.id, items[0].code);
      if (!product) throw new Error("La opción confirmada dejó de ser inequívoca; vuelve a mostrar las opciones antes de cotizar");

      // Imagen de cotización (pieza principal); PDF si lo piden o si falla.
      const imageName = `Cotizacion-${business.name.replace(/\s/g, "")}-${quote.number}.png`;
      const visual = await sendVisual(
        ctx.conversation.id,
        ctx.customerPhone,
        async () =>
          renderQuoteImage({
            number: quote.number,
            dateLabel: dateLabel(),
            lines: [await toRenderLine(product, items[0].cantidad)],
            subtotal: quote.subtotal,
            iva: quote.tax,
            total: quote.total,
            discountAmount: quote.discountAmount,
            discountCondition: quote.discountCondition,
            offerExpiresAt: quote.offerExpiresAt,
          }),
        `Cotización ${quote.number}${quote.offerExpiresAt ? ` · oferta hasta ${quote.offerExpiresAt.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}` : ""} 🏁`,
        imageName,
        `cotización ${quote.number}`,
      );
      let filename = imageName;
      let providerId = visual.providerId;
      let pdfEnviado = false;
      if (!visual.ok || incluir_pdf) {
        try {
          // Mismo diseño que la imagen cuando el render funcionó; el PDF
          // clásico de pdfmake queda solo como último recurso.
          const pdf = visual.png
            ? await pngToQuotePdf(visual.png)
            : await renderQuotePdf(quote);
          const pdfName = `Cotizacion-${business.name.replace(/\s/g, "")}-${quote.number}.pdf`;
          const pdfId = await sendPdf(
            ctx.conversation.id,
            ctx.customerPhone,
            pdf,
            pdfName,
            `Su cotización ${quote.number} 📄`,
          );
          pdfEnviado = true;
          if (!visual.ok) {
            filename = pdfName;
            providerId = pdfId;
          }
        } catch (err) {
          console.error(`❌ PDF de cotización ${quote.number} falló:`, err);
        }
      }
      if (!visual.ok && !pdfEnviado) {
        await createBotAlert({
          conversationId: ctx.conversation.id,
          cycle: ctx.conversation.current_cycle,
          type: "send_error",
          priority: "critical",
          summary: `No se pudo enviar la cotización ${quote.number}`,
          exactReason: `Cotización ${quote.number} generada pero no se pudo enviar imagen ni PDF.`,
          suggestedAction: "Revisar el error y contactar al cliente desde el ticket.",
          dedupeKey: `${ctx.conversation.id}:${ctx.conversation.current_cycle}:quote_send_error:${quote.number}`,
        });
      }
      await appendMessage(
        ctx.conversation.id,
        "assistant",
        `Cotización ${quote.number} enviada por $${quote.total.toFixed(2)}`,
        providerId,
        {
          type: visual.ok ? "image" : "pdf",
          authorKind: "bot",
          status: visual.ok || pdfEnviado ? "sent" : "failed",
          metadata: { filename, quoteNumber: quote.number },
        },
      );
      const quoteId = await logQuote(
        ctx.conversation.id,
        quote.lines,
        quote.subtotal,
        quote.tax,
        quote.total,
        quote.number,
        saleNumber,
        activeDiscount ?? undefined,
      );
      if (activeDiscount) await attachDiscountOfferToQuote(activeDiscount.id, quoteId);
      await updateConversationFacts(ctx.conversation.id, {
        selectedProductCode: product.code,
        selectedQuantity: items[0].cantidad,
      });
      await logQuoteArtifact({
        conversationId: ctx.conversation.id,
        quoteId,
        kind: "quote",
        products: quote.lines,
        filename,
        providerId,
      });
      await setStage(ctx.conversation.id, "cotizacion_enviada", {
        actor: "customer",
        reason: "Cliente confirmó un modelo y cantidad",
      });
      const quoteAlertKey = `${ctx.conversation.id}:${ctx.conversation.current_cycle}:quote_created:${quote.number}`;
      await createBotAlert({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
        type: "quote_created",
        priority: "medium",
        summary: `Nueva cotización ${quote.number} por $${quote.total.toFixed(2)}`,
        exactReason: `${items[0].cantidad} × ${product.brand} ${product.design} ${product.sizeLabel}`,
        suggestedAction: "Revisar la cotización y acompañar al cliente si pide ayuda o confirma visita.",
        dedupeKey: quoteAlertKey,
      });
      await notifyAdvisor({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
        eventType: "quote_created",
        dedupeKey: quoteAlertKey,
        title: `Nueva cotización ${quote.number}`,
        reason: `${items[0].cantidad} × ${product.brand} ${product.design} ${product.sizeLabel}`,
        action: "Revisar el ticket y dar seguimiento si el cliente necesita ayuda para concretar.",
        details: [
          `💵 Total: $${quote.total.toFixed(2)}`,
          `🔖 Número de venta: ${saleNumber}`,
          activeDiscount ? `🏷️ Descuento extra: $${(activeDiscount.discountAmountCents / 100).toFixed(2)} · ${activeDiscount.condition}` : "",
        ],
      });
      return JSON.stringify({
        enviada: true,
        numero: quote.number,
        subtotal: quote.subtotal,
        iva: quote.tax,
        total_con_iva: quote.total,
        numero_venta: saleNumber,
        mensaje_para_enviar: buildSingleQuoteMessage(
          { product, quantity: items[0].cantidad },
          nombre_cliente,
          quote.number,
          saleNumber,
          activeDiscount ? {
            amount: activeDiscount.discountAmountCents / 100,
            finalTotal: quote.total,
            condition: activeDiscount.condition,
            expiresAt: activeDiscount.expiresAt,
          } : undefined,
        ),
        regla:
          "Responde exactamente con mensaje_para_enviar. La cotización ya fue enviada y Manuel ya fue notificado. Después espera la ubicación.",
      });
    },
  });

  const localMasCercano = defineTool({
    name: "local_mas_cercano",
    description:
      "Usa una ubicación compartida (lat/lng) o un sector conocido para elegir el local más cercano. Nunca inventes coordenadas ni distancias.",
    schema: z.object({
      lat: z.number().nullable().default(null),
      lng: z.number().nullable().default(null),
      sector: z.string().nullable().default(null),
    }),
    run: async ({ lat, lng, sector }) => {
      const resolved = lat != null && lng != null ? { lat, lng, label: "ubicación compartida" } : sector ? resolveSector(sector) : null;
      if (!resolved) {
        return JSON.stringify({
          error: "No puedo ubicar ese sector con seguridad. Pide que comparta el pin de ubicación de WhatsApp.",
        });
      }
      const { store, distanceKm } = nearestStore(business.stores, resolved.lat, resolved.lng);
      await updateConversationFacts(ctx.conversation.id, {
        locationLabel: resolved.label,
        nearestStore: store.name,
      });
      await setStage(ctx.conversation.id, "seguimiento_venta", {
        actor: "customer",
        reason: "Cliente compartió ubicación después de cotizar",
      });
      const sale = await latestSaleNumber(ctx.conversation.id);
      return JSON.stringify({
        local: store.name,
        direccion: store.address,
        distancia_km: distanceKm,
        maps: store.mapsUrl ?? null,
        horario: business.schedule,
        ubicacion_cliente: resolved.label,
        distancia_es_aproximada: sector != null,
        numero_venta: sale,
        mensaje_para_enviar: [
          `📍 El local recomendado es *${store.name}*.`,
          `🏬 ${store.address}`,
          store.mapsUrl ? `🗺️ ${store.mapsUrl}` : "",
          `🕐 ${business.schedule}`,
          sale ? `🔖 Al llegar, indica tu número de venta *${sale}* para ubicar tu cotización.` : "",
          "🙌 ¡Te esperamos! Si necesitas algo más, aquí estoy.",
        ].filter(Boolean).join("\n"),
        regla: "Responde exactamente con mensaje_para_enviar y no inventes otra distancia o dirección.",
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
      const [facts] = await sql<{ location_label: string | null; nearest_store: string | null }[]>`
        select location_label, nearest_store from conversations where id = ${ctx.conversation.id}
      `;
      if (!facts?.location_label || !facts.nearest_store) {
        return JSON.stringify({
          error:
            "Antes del handoff necesitas la ubicación del cliente y el local recomendado. Pide ubicación y usa local_mas_cercano.",
        });
      }
      await createBotAlert({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
        type: "customer_ready_to_buy",
        priority: "high",
        summary: resumen.slice(0, 300),
        exactReason: `Ubicación: ${facts.location_label}. Local: ${facts.nearest_store}.`,
        suggestedAction: `Abrir la conversación de ${ctx.customerName ?? ctx.customerPhone} y coordinar la venta.`,
        dedupeKey: `${ctx.conversation.id}:${ctx.conversation.current_cycle}:customer_ready_to_buy`,
      });
      await notifyAdvisor({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
        eventType: "customer_ready_to_buy",
        dedupeKey: `${ctx.conversation.id}:${ctx.conversation.current_cycle}:customer_ready_to_buy`,
        title: "Cliente listo para comprar",
        reason: resumen.slice(0, 500),
        action: `Coordinar la compra en ${facts.nearest_store}.`,
        details: [`📍 ${facts.location_label}`, `🏬 ${facts.nearest_store}`],
      });
      await setStage(ctx.conversation.id, "seguimiento_venta", {
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

async function latestSaleNumber(conversationId: number): Promise<string | null> {
  const [row] = await sql<{ sale_number: string | null }[]>`
    select sale_number from quotes
    where conversation_id = ${conversationId}
      and cycle = (select current_cycle from conversations where id = ${conversationId})
    order by created_at desc limit 1
  `;
  return row?.sale_number ?? null;
}

function buildTechnicalGuidance(
  products: Array<{ brand: string; design: string }>,
  question: string,
): string {
  const profiles = products
    .map((product) => ({ product, profile: getTirePatternProfile(product.brand, product.design) }))
    .filter((entry): entry is { product: { brand: string; design: string }; profile: NonNullable<ReturnType<typeof getTirePatternProfile>> } => Boolean(entry.profile));
  if (!profiles.length) {
    return "ℹ️ No tengo fichas técnicas verificadas de estos diseños para recomendar uno por desempeño.";
  }
  const normalized = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const mountain = /montan|ripio|barro|destapad|off.?road/.test(normalized);
  const wet = /lluv|mojad|aquaplan/.test(normalized);
  const lines = ["🧭 *¿Cuál conviene más?*"];
  for (const { product, profile } of profiles) {
    lines.push(
      `• *${product.brand} ${product.design}:* ${profile.category}; destaca en ${profile.strengths.join(", ")}.`,
    );
  }
  if (mountain) {
    const allTerrain = profiles.find(({ profile }) => /all-terrain|rugged|mud/.test(profile.category));
    lines.push(
      allTerrain
        ? `🏔️ Para ripio o camino sin asfaltar, *${allTerrain.product.brand} ${allTerrain.product.design}* es la opción diseñada para ese uso.`
        : "🏔️ Si hablas de carretera pavimentada con curvas o lluvia, prioriza agarre en mojado. Para ripio o barro, ninguna de estas opciones de carretera es A/T; conviene buscar otro diseño.",
    );
  } else if (wet) {
    const wetChoice = profiles.find(({ profile }) => profile.strengths.some((s) => /mojado|aquaplan/.test(s)));
    if (wetChoice) lines.push(`🌧️ Para lluvia, la ficha del fabricante favorece a *${wetChoice.product.brand} ${wetChoice.product.design}*.`);
  }
  return lines.join("\n");
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
