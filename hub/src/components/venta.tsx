import { useState } from "react";
import type { DatosCierreGanado } from "../data/types";
import { useHub } from "../store";

/**
 * «GANADO» = EL ASESOR CONFIRMA QUE EL CLIENTE COMPRÓ ACÁ (Manuel, 21-nov-2026).
 *
 * Los campos del cierre ganado: «El cliente llegó y compró», el número de
 * factura y el monto pagado. Siempre los tres: sin factura y monto se espera
 * para cerrar («Completar después» se quitó el 21-nov). Las mismas reglas que
 * `revisarCierreGanado` en el servidor.
 */

export const DATOS_VACIOS: DatosCierreGanado = { confirmado: false, factura: "", monto: "" };

/** Pura: el monto como lo escriba el asesor, en dólares. null si no es un monto. Espejo de `leerMonto`. */
export function leerMonto(valor: string): number | null {
  const texto = valor.replace(/[\s$]/g, "").replace(/usd/i, "");
  if (!texto || !/^[\d.,]+$/.test(texto)) return null;
  const decimal = texto.match(/[.,](\d{1,2})$/);
  const entero = (decimal ? texto.slice(0, -decimal[0].length) : texto).replace(/[.,]/g, "");
  const numero = Number(`${entero || "0"}.${decimal?.[1] ?? "0"}`);
  return numero > 0 && numero < 1_000_000 ? Math.round(numero * 100) / 100 : null;
}

/** Lo que le falta al formulario para poder cerrar, o null si está listo. */
export function faltaParaCerrar(d: DatosCierreGanado, yaCompleta: boolean): string | null {
  if (!d.confirmado) return "Confirma que el cliente llegó y compró.";
  if (d.monto.trim() && leerMonto(d.monto) == null) return "Revisa el monto: solo el número, por ejemplo 230.50.";
  if (yaCompleta && !d.factura.trim() && !d.monto.trim()) return null;
  if (!d.factura.trim() || leerMonto(d.monto) == null) return "Escribe el número de factura y el monto. Sin los dos no se cierra como ganado.";
  return null;
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] text-text2">
      {etiqueta}
      {children}
    </label>
  );
}

/** Factura + monto: los dos datos que hacen de un «ganado» una venta completa. */
export function CamposFacturaMonto({
  factura, monto, onFactura, onMonto, deshabilitado = false, autoFocus = false,
}: {
  factura: string; monto: string; onFactura: (v: string) => void; onMonto: (v: string) => void;
  deshabilitado?: boolean; autoFocus?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <Campo etiqueta="Número de factura">
        <input
          value={factura}
          onChange={(e) => onFactura(e.target.value)}
          disabled={deshabilitado}
          maxLength={40}
          autoFocus={autoFocus}
          placeholder="001-001-000123"
          className="gp-field text-[13px] text-text disabled:opacity-50"
        />
      </Campo>
      <Campo etiqueta="Monto pagado ($)">
        <input
          value={monto}
          onChange={(e) => onMonto(e.target.value)}
          disabled={deshabilitado}
          inputMode="decimal"
          maxLength={14}
          placeholder="230.50"
          className="gp-field tnum text-[13px] text-text disabled:opacity-50"
        />
      </Campo>
    </div>
  );
}

/**
 * El bloque que aparece en el cierre cuando se elige «Ganado». `yaCompleta`:
 * un vendedor ya registró la venta con factura y monto, solo falta confirmar.
 */
export function CamposCierreGanado({ datos, onChange, yaCompleta }: {
  datos: DatosCierreGanado; onChange: (d: DatosCierreGanado) => void; yaCompleta: boolean;
}) {
  const cambiar = (parcial: Partial<DatosCierreGanado>) => onChange({ ...datos, ...parcial });
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-[8px] border border-line bg-bg px-4 py-3">
      <label className="flex items-start gap-2.5 text-[13px] font-medium">
        <input
          type="checkbox"
          checked={datos.confirmado}
          onChange={(e) => cambiar({ confirmado: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-[var(--color-ok)]"
        />
        El cliente llegó y compró
      </label>
      {yaCompleta ? (
        <p className="text-[12px] text-text2">La venta ya está registrada con factura y monto.</p>
      ) : (
        <CamposFacturaMonto
          factura={datos.factura}
          monto={datos.monto}
          onFactura={(factura) => cambiar({ factura })}
          onMonto={(monto) => cambiar({ monto })}
        />
      )}
    </div>
  );
}

/**
 * Añadir una factura a un ganado: la primera de un ganado viejo sin factura, u
 * otra más si el cliente hizo dos compras (mismo ticket; sigue siendo una
 * venta y lo pagado se suma). No mueve la etapa.
 */
export function AgregarFactura({ ticketId, cycle, onListo, compacto = false, etiqueta = "Guardar factura" }: {
  ticketId: number; cycle?: number; onListo?: () => void; compacto?: boolean; etiqueta?: string;
}) {
  const { agregarFactura } = useHub();
  const [factura, setFactura] = useState("");
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listo = factura.trim() && leerMonto(monto) != null;

  const guardar = async () => {
    if (!listo) {
      setError(monto.trim() && leerMonto(monto) == null ? "Revisa el monto." : "Escribe la factura y el monto.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await agregarFactura(ticketId, factura.trim(), monto.trim(), cycle);
      setFactura("");
      setMonto("");
      onListo?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={`flex gap-2 ${compacto ? "flex-wrap items-end" : "flex-col"}`}>
      <div className={compacto ? "min-w-[260px] flex-1" : ""}>
        <CamposFacturaMonto factura={factura} monto={monto} onFactura={setFactura} onMonto={setMonto} />
      </div>
      <button
        onClick={() => void guardar()}
        disabled={guardando}
        className={`btn-signal rounded-[6px] text-[13px] ${compacto ? "h-[38px] px-4" : "h-9"}`}
      >
        {guardando ? "Guardando…" : etiqueta}
      </button>
      {error && <p className="w-full text-[12px] text-signal">{error}</p>}
    </div>
  );
}
