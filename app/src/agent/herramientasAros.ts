/**
 * Herramientas de AROS como producto (R-24).
 *
 * Solo existen cuando el catálogo trae aros (`arosDelCatalogo()` no vacío):
 * `buildTools` las agrega al final de su lista bajo esa condición, así que en
 * Depot el modelo nunca las ve y el ruteo por aro queda idéntico al de hoy.
 *
 * `definir` llega por parámetro (es el `defineTool` de tools.ts, tipado por
 * forma) para no exportar el constructor ni duplicar su manejo de errores.
 */
import { z } from "zod";
import type { AgentContext, AgentTool } from "./tools.js";
import { arosDelCatalogo, buscarAros } from "../domain/aroProducto.js";

type Definir = <T extends z.ZodTypeAny>(input: {
  name: string;
  description: string;
  schema: T;
  run: (args: z.output<T>) => Promise<string>;
}) => AgentTool;

export function herramientasDeAros(ctx: AgentContext, definir: Definir): AgentTool[] {
  void ctx; // el contexto queda en la firma para cuando los aros tengan ficha propia
  const buscarArosTool = definir({
    name: "buscar_aros",
    description:
      "Busca AROS (rines) como producto en el inventario: diámetro, pernos, precio con IVA y stock. Úsala cuando el cliente pregunte por aros o rines para COMPRAR ('¿tienen aros de 15?', 'rines de 4 pernos', 'aros de lujo'), no cuando el aro sea el dato de la medida de una llanta. Devuelve hasta 5 con stock.",
    schema: z.object({
      diametro: z
        .number()
        .int()
        .min(12)
        .max(24)
        .nullable()
        .default(null)
        .describe("Diámetro en pulgadas si lo dijo, ej. 15. Null si no."),
      pernos: z
        .number()
        .int()
        .min(3)
        .max(8)
        .nullable()
        .default(null)
        .describe("Número de pernos si lo dijo, ej. 4. Null si no."),
      texto: z
        .string()
        .nullable()
        .default(null)
        .describe("Palabras del cliente para afinar (marca, acabado), ej. 'de lujo'."),
    }),
    run: async ({ diametro, pernos, texto }) => {
      const todos = arosDelCatalogo();
      const aros = buscarAros(todos, { diametro, pernos, texto });
      if (!aros.length) {
        const diametros = [...new Set(todos.filter((a) => a.stock > 0).map((a) => a.diametro))].sort((a, b) => a - b);
        return JSON.stringify({
          encontrado: false,
          diametros_con_stock: diametros,
          regla:
            "No hay aros con stock con esos datos. Dile cuáles diámetros SÍ hay; no inventes aros ni prometas que llegarán.",
        });
      }
      // Lo que el guardián verifica va primero y sin el nombre: su huella corta
      // en 500 caracteres y con el nombre adentro 5 aros ocupaban ~600 (el
      // quinto quedaba sin verificar y lo tachaba). El nombre va justo después.
      return JSON.stringify({
        aros: aros.map((a) => ({
          codigo: a.codigo,
          diametro: a.diametro,
          ...(a.pernos ? { pernos: a.pernos } : {}),
          precio_con_iva: a.precio,
          stock: a.stock,
        })),
        nombres: Object.fromEntries(aros.map((a) => [a.codigo, a.nombre.slice(0, 40)])),
        fotos: aros.map((a) => a.imageUrl).filter((u): u is string => Boolean(u)).slice(0, 3),
        regla:
          "Solo estos aros existen. PROHIBIDO afirmar que calzan en el vehículo del cliente: sin el dato de pernos lo confirma el asesor en el local.",
      });
    },
  });
  return [buscarArosTool];
}
