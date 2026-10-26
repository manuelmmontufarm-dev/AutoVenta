/**
 * Ajustes → Piezas → «Cómo se nombra la promoción» (26-oct-2026).
 *
 * Por el feriado Depot cambió «25 % de descuento» por «3x4» (paga 3, lleva 4).
 * Es la misma plata dicha de otra forma: el precio sigue saliendo del catálogo.
 * Lo que se elige acá cambia el rótulo de la pieza, del PDF y de lo que dice el
 * bot, y se guarda con el mismo «Aplicar cambios» de la plantilla.
 *
 * El candado vive en el servidor (`app/src/domain/promocion.ts`): una llanta
 * que no tenga 24–26 % de descuento sale como porcentaje aunque el modo sea
 * 3x4. Este panel solo lo avisa con la llanta de la vista previa.
 */
import { useEffect, useState } from "react";
import { authHeaders } from "../data/realSource";
import { Panel, BlockTitle } from "./ui";

const MODO_LABEL: Record<string, string> = {
  porcentaje: "25 % de descuento",
  "3x4": "3x4 · paga 3 lleva 4",
};

const MODO_NOTA: Record<string, string> = {
  porcentaje: "La insignia dice «−25% DESCUENTO HOY», como siempre.",
  "3x4": "La misma rebaja, dicha como «paga 3 llantas y lleva 4».",
};

interface InfoPromocion {
  modos: string[];
  /** El descuento de la llanta de la vista previa. Null = sin precio de lista. */
  descuento: number | null;
}

/** El mismo aviso que el servidor (`advertenciaDe3x4`), para la llanta de la vista previa. */
function advertencia(descuento: number | null): string | null {
  if (descuento === null) return "La llanta de la vista previa está sin precio de lista: no lleva insignia de promoción.";
  if (descuento >= 24 && descuento <= 26) return null;
  return `La llanta de la vista previa tiene −${descuento} %: saldría como porcentaje, no como 3x4.`;
}

export function SeccionPromocionModo({ promocion, onPromocion, onError }: {
  promocion: string;
  onPromocion: (modo: string) => void;
  onError: (msg: string) => void;
}) {
  const [info, setInfo] = useState<InfoPromocion | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/pieces-config", { headers: authHeaders() })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { modosPromocion?: string[]; descuentoDeMuestra?: number | null; error?: string };
        if (!r.ok) throw new Error(body.error ?? `Error ${r.status}`);
        if (cancelado) return;
        // Un servidor anterior a la promoción no manda estos campos: no se ofrece nada.
        setInfo({ modos: body.modosPromocion ?? [], descuento: body.descuentoDeMuestra ?? null });
      })
      .catch((e) => !cancelado && onError(e instanceof Error ? e.message : "No se pudo leer la promoción"));
    return () => { cancelado = true; };
  }, [onError]);

  if (!info || info.modos.length < 2) return null;
  const aviso = promocion === "3x4" ? advertencia(info.descuento) : null;

  return (
    <Panel className="px-5 pt-[18px] pb-5">
      <BlockTitle aside="se guarda con «Aplicar cambios»">Cómo se nombra la promoción</BlockTitle>
      <p className="mt-0.5 mb-4 text-[12px] text-text2">
        Cambia lo que dicen la cotización, el PDF y el bot. El precio no cambia: sigue saliendo del catálogo.
      </p>
      <div className="flex flex-wrap gap-2">
        {info.modos.map((m) => (
          <button
            key={m} onClick={() => onPromocion(m)}
            className={`flex flex-col items-start gap-1 rounded-[6px] border px-3.5 py-2 text-left text-[12px] transition ${
              m === promocion ? "border-signal bg-bg font-semibold" : "border-line bg-bg hover:bg-bg"
            }`}
          >
            <span>{MODO_LABEL[m] ?? m}</span>
            {MODO_NOTA[m] && <span className="text-[12px] font-normal text-text2">{MODO_NOTA[m]}</span>}
          </button>
        ))}
      </div>
      {promocion === "3x4" && (
        <p className="mt-3 text-[12px] text-text2">
          Solo las llantas con 24–26 % de descuento salen como 3x4; las demás siguen mostrando su porcentaje.
        </p>
      )}
      {aviso && <p className="mt-2 text-[12px] font-semibold text-warn">{aviso}</p>}
    </Panel>
  );
}
