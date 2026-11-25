/**
 * CANARY DE MODELO BARATO POR CLIENTE (23-oct-2026).
 *
 * Octubre 1–23 costó $112 de IA y el 98 % fue gpt-5.5: $40 el vendedor y
 * $68 el Ángel Guardián. La pregunta es si un cliente atendido ENTERO por un
 * modelo cinco veces más barato compra igual. Para medirlo, los teléfonos
 * cuyo último dígito está en `AI_CANARY_DIGITS` (por defecto 1, 2 y 3: el
 * 29 % de los chats de octubre) van con `OPENAI_CANARY_MODEL`.
 *
 * Tres variables, sin ninguna no cambia absolutamente nada:
 *   OPENAI_CANARY_MODEL   el modelo barato (p. ej. gpt-5.5-mini)
 *   AI_CANARY_DIGITS      últimos dígitos del teléfono que entran (default "1,2,3")
 *   AI_CANARY_SCOPE       qué piezas bajan: "vendedor,guardian" (default),
 *                         "vendedor" o "guardian" — para poder probar cada una sola
 *   OPENAI_CANARY_MODEL_VENDEDOR / _GUARDIAN   modelo distinto por pieza (opcional)
 *
 * El grupo se decide por TELÉFONO y no por id de conversación: la misma
 * persona cae siempre del mismo lado aunque abra otra conversación, y el
 * cruce con las facturas de Contífico es por teléfono. Lo que no cambia:
 * el rescate (escalationModel), la visión, el clasificador y la rutina post-
 * cotización, que ya tienen su propio modelo. Toda corrida del grupo canary
 * queda con el sufijo «+canary» en `ai_runs.route` para comparar A contra B.
 */
import OpenAI from "openai";
import { config } from "../config.js";
import { clienteClaude, esModeloClaude } from "./claudeCliente.js";

export type PiezaCanary = "vendedor" | "guardian";

/** Se apaga en caliente si al arrancar el modelo no existe (ver abajo). */
let apagado = false;

/**
 * Comprueba contra /v1/models que `OPENAI_CANARY_MODEL` existe. Medido el
 * 23-oct en el simulador: con un nombre inexistente (`gpt-5.5-mini`) el
 * vendedor del grupo se iba al rescate en cada turno y el Guardián «fallaba
 * abierto»: el 29 % de los clientes se quedaba sin revisor y nadie lo notaba.
 * Si el modelo no existe, el canary se apaga y todos siguen con el de siempre.
 */
/** Lo mínimo que hace falta de un cliente para preguntar si un modelo existe. */
type ConModelos = { models: { retrieve(id: string): Promise<unknown> } };

export async function validarCanaryAlArrancar(cliente?: Pick<OpenAI, "models">, claude?: ConModelos): Promise<boolean> {
  await avisarSiUnModeloFijoEsClaudeYNoResponde(claude);
  if (!config.openai.canaryModel) return false;
  try {
    const modelos = new Set([config.openai.canaryModel, config.openai.canaryModelVendedor, config.openai.canaryModelGuardian].filter(Boolean) as string[]);
    // Cada modelo se le pregunta a SU proveedor: un `claude-` consultado en
    // OpenAI da 404 y apagaría un canary que está bien configurado.
    let openai: ConModelos | null = cliente ?? null;
    for (const m of modelos) {
      if (esModeloClaude(m)) await (claude ?? clienteClaude()).models.retrieve(m);
      else await (openai ??= new OpenAI({ apiKey: config.openai.apiKey })).models.retrieve(m);
    }
    apagado = false;
    console.log(`🧪 Canary de modelo barato: ${config.openai.canaryModel} para dígitos ${[...config.openai.canaryDigits].join(",")} (${[...config.openai.canaryScope].join("+")})`);
    return true;
  } catch (error) {
    apagado = true;
    console.error(`🧪 Canary APAGADO: OPENAI_CANARY_MODEL=${config.openai.canaryModel} no existe o no hay acceso (${error instanceof Error ? error.message : String(error)}). Todos siguen con el modelo de siempre.`);
    return false;
  }
}

/**
 * Un modelo `claude-` puesto FIJO (OPENAI_MODEL, OPENAI_GUARDIAN_MODEL…) no
 * tiene a quién volver si falla: se avisa bien fuerte al arrancar. El bot no
 * se cae — el vendedor cae al rescate y el Guardián deja pasar el borrador —,
 * pero eso es justo lo que no se nota hasta que alguien lee los chats.
 */
async function avisarSiUnModeloFijoEsClaudeYNoResponde(claude?: ConModelos): Promise<void> {
  const o = config.openai;
  const fijos = new Set([o.model, o.routineModel, o.guardianModel, o.classifierModel, o.visionModel, o.escalationModel, o.exactToolModel]
    .filter((m): m is string => esModeloClaude(m)));
  for (const m of fijos) {
    try {
      await (claude ?? clienteClaude()).models.retrieve(m);
    } catch (error) {
      console.error(`🚨 El modelo ${m} está configurado y Anthropic no lo sirve (${error instanceof Error ? error.message : String(error)}). Las llamadas a ese modelo van a fallar.`);
    }
  }
}

/** ¿Este teléfono cae en el grupo del modelo barato? */
export function enGrupoCanary(phone: string | null | undefined): boolean {
  if (!config.openai.canaryModel || apagado) return false;
  const digitos = (phone ?? "").replace(/\D/g, "");
  if (!digitos) return false;
  return config.openai.canaryDigits.has(digitos.at(-1)!);
}

/** El modelo que atiende `pieza` para este teléfono: el barato o el de siempre. */
export function modeloCanary(pieza: PiezaCanary, phone: string | null | undefined, normal: string): string {
  if (!enGrupoCanary(phone)) return normal;
  if (!config.openai.canaryScope.has(pieza)) return normal;
  const propio = pieza === "vendedor" ? config.openai.canaryModelVendedor : config.openai.canaryModelGuardian;
  return propio ?? config.openai.canaryModel!;
}

/** Sufijo de `ai_runs.route` para que el panel separe los dos grupos. */
export function rutaCanary(route: string, phone: string | null | undefined): string {
  return enGrupoCanary(phone) ? `${route}+canary` : route;
}
