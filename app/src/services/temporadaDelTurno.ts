/**
 * ¿ESTE TURNO VE LA PROMO DE TEMPORADA? (Manuel, 5-nov-2026)
 *
 * «Primero quiero que solo funcione con mi número para hacer pruebas.» La
 * promo (cotización, pieza, PDF, vendedor, guardián) pasa toda por
 * `promocionVigente`; acá se le instala la compuerta que mira dos cosas:
 *   - `temporada_config` de Ajustes: apagada / pruebas / todos;
 *   - el teléfono del turno, que el servidor fija al atender cada mensaje.
 *
 * Fuera de un turno (reporte diario, tareas sueltas) no hay teléfono: en
 * «pruebas» eso es cerrado. La vista previa de Ajustes la ve mientras no esté
 * apagada, para poder mirar la pieza sin escribir por WhatsApp.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { fijarCompuertaDeTemporada } from "../domain/promocionDeTemporada.js";
import { getTemporadaConfig, temporadaConfigEnMemoria, type TemporadaConfig } from "./settings.js";

interface QuienMira {
  telefono: string | null;
  vistaPrevia?: boolean;
}

const turno = new AsyncLocalStorage<QuienMira>();

/** Los últimos 9 dígitos: «0993728763», «+593 99 372 8763» y «593993728763» son el mismo. */
function mismoTelefono(a: string, b: string): boolean {
  const ca = a.replace(/\D/g, "").slice(-9);
  const cb = b.replace(/\D/g, "").slice(-9);
  return ca.length === 9 && ca === cb;
}

/** La regla, pura: la prueba la llama sin servidor. */
export function promoAbiertaPara(quien: QuienMira | undefined, cfg: TemporadaConfig): boolean {
  if (cfg.modo === "apagada") return false;
  if (cfg.modo === "todos") return true;
  if (quien?.vistaPrevia) return true;
  const telefono = quien?.telefono;
  return Boolean(telefono) && cfg.telefonos.some((t) => mismoTelefono(t, telefono!));
}

/** Corre `fn` como un turno con este cliente; antes refresca la configuración. */
export async function conElTelefonoDelTurno<T>(telefono: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  await getTemporadaConfig();
  return turno.run({ telefono: telefono ?? null }, fn);
}

/** Corre `fn` como vista previa de Ajustes. */
export async function comoVistaPrevia<T>(fn: () => Promise<T>): Promise<T> {
  await getTemporadaConfig();
  return turno.run({ telefono: null, vistaPrevia: true }, fn);
}

/** Se llama una vez al arrancar el servidor. */
export function instalarCompuertaDeTemporada(): void {
  fijarCompuertaDeTemporada(() => promoAbiertaPara(turno.getStore(), temporadaConfigEnMemoria()));
  void getTemporadaConfig();
}
