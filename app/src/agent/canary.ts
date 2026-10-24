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
 *
 * El grupo se decide por TELÉFONO y no por id de conversación: la misma
 * persona cae siempre del mismo lado aunque abra otra conversación, y el
 * cruce con las facturas de Contífico es por teléfono. Lo que no cambia:
 * el rescate (escalationModel), la visión, el clasificador y la rutina post-
 * cotización, que ya tienen su propio modelo. Toda corrida del grupo canary
 * queda con el sufijo «+canary» en `ai_runs.route` para comparar A contra B.
 */
import { config } from "../config.js";

export type PiezaCanary = "vendedor" | "guardian";

/** ¿Este teléfono cae en el grupo del modelo barato? */
export function enGrupoCanary(phone: string | null | undefined): boolean {
  if (!config.openai.canaryModel) return false;
  const digitos = (phone ?? "").replace(/\D/g, "");
  if (!digitos) return false;
  return config.openai.canaryDigits.has(digitos.at(-1)!);
}

/** El modelo que atiende `pieza` para este teléfono: el barato o el de siempre. */
export function modeloCanary(pieza: PiezaCanary, phone: string | null | undefined, normal: string): string {
  if (!enGrupoCanary(phone)) return normal;
  if (!config.openai.canaryScope.has(pieza)) return normal;
  return config.openai.canaryModel!;
}

/** Sufijo de `ai_runs.route` para que el panel separe los dos grupos. */
export function rutaCanary(route: string, phone: string | null | undefined): string {
  return enGrupoCanary(phone) ? `${route}+canary` : route;
}
