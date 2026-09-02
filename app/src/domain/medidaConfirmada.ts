/**
 * ¿La medida de trabajo la dio el CLIENTE, o la dedujo el bot?
 *
 * `tire_size` se escribe por tres puertas: lo que el cliente escribió (o lo
 * que se leyó de su foto, que entra como texto), un link que resumió una
 * medida, y `buscar_llanta` cuando el modelo busca una medida. Esa tercera
 * puerta es la que no distingue «el cliente dijo 225/70R16» de «el bot dedujo
 * 225/70R16 de un Suzuki SZ 2016» — y sobre esa deducción se firmó una
 * cotización (producción, 1-sep-2026, conv 13862).
 *
 * La regla es determinística y no necesita columna nueva: la medida está
 * confirmada si aparece, tal cual, en algún mensaje del cliente. Sirve para lo
 * escrito, para la foto («[El cliente mandó una foto. Se lee: 225/70R16…]») y
 * para el cliente que vuelve y cuya medida quedó en una visita anterior.
 */
import { medidasEnTexto } from "./medidaPedida.js";

const pelar = (texto: string) => texto.toLowerCase().replace(/[\s\-/x×r]/g, "");

export function medidaConfirmadaPorCliente(
  tireSize: string | null | undefined,
  textosDelCliente: readonly (string | null | undefined)[],
): boolean {
  if (!tireSize) return false;
  const objetivo = new Set(medidasEnTexto(tireSize));
  const crudo = pelar(tireSize);
  for (const texto of textosDelCliente) {
    if (!texto) continue;
    if (objetivo.size && medidasEnTexto(texto).some((m) => objetivo.has(m))) return true;
    // Formatos que el extractor no lee (205R16C, medidas con errores de
    // tipeo): se compara pelado, sin espacios ni separadores.
    if (crudo.length >= 6 && pelar(texto).includes(crudo)) return true;
  }
  return false;
}
