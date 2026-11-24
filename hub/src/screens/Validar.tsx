import { useRef, useState } from "react";
import { authHeaders } from "../data/realSource";
import { IconAlert, IconCheck } from "../components/icons";
import { navigate } from "../router";
import { useHub } from "../store";

/**
 * «Validar» — el vendedor escribe el número de un comprador y sabe en el acto
 * si ese cliente vino por WhatsApp; después deja la factura y el monto.
 *
 * Es la página `/venta` metida en la app (Manuel, 22-nov): mismo flujo y mismas
 * reglas (`services/registroDeVentas.ts`), pero el vendedor es el usuario que
 * entró —no se escribe el nombre— y la pestaña solo existe para quien tiene el
 * permiso «Validar números» en Ajustes → Usuarios.
 */

interface Venta {
  id: number;
  vendedor: string;
  telefono: string;
  vinoDeWhatsapp: boolean;
  cliente: string | null;
  ultimoMensajeAt: string | null;
  cotizaciones: number;
  conversationId: number | null;
  efectoEnTicket: "marcado_ganado" | "ya_ganado" | "sin_chat" | null;
  factura: string | null;
  monto: number | null;
}

type Respuesta<T> = ({ ok: true } & T) | { ok: false; error?: string; campo?: string };

async function pedir<T>(ruta: string, cuerpo: Record<string, unknown>): Promise<Respuesta<T>> {
  try {
    const r = await fetch(`/api/hub/validar/${ruta}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    return (await r.json()) as Respuesta<T>;
  } catch {
    return { ok: false, error: "Sin conexión. Revisa el internet e intenta de nuevo." };
  }
}

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "";

// 16 px en los campos: por debajo iOS hace zoom al enfocar.
const CAMPO = "h-[52px] w-full rounded-[8px] border border-line bg-surface px-3.5 text-[18px] outline-none transition-colors focus:border-signal";
const ETIQUETA = "mb-1.5 block text-[14px] font-semibold";

export function Validar() {
  const dataMode = useHub((s) => s.dataMode);
  const [telefono, setTelefono] = useState("");
  const [venta, setVenta] = useState<Venta | null>(null);
  const [yaRegistradaPor, setYaRegistradaPor] = useState<string | null>(null);
  const [factura, setFactura] = useState("");
  const [monto, setMonto] = useState("");
  const [listo, setListo] = useState(false);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const campoTelefono = useRef<HTMLInputElement>(null);

  async function validar(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setError("");
    setOcupado(true);
    const r = await pedir<{ venta: Venta; yaRegistradaPor: string | null }>("numero", { telefono });
    setOcupado(false);
    if (!r.ok) return setError(r.error ?? "No se pudo guardar. Intenta de nuevo.");
    setVenta(r.venta);
    setYaRegistradaPor(r.yaRegistradaPor);
    setFactura("");
    setMonto("");
    setListo(false);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!venta || ocupado) return;
    if (!factura.trim()) return setError("Escribe el número de factura o la referencia.");
    if (!monto.trim()) return setError("Escribe el monto que pagó el cliente.");
    setError("");
    setOcupado(true);
    const r = await pedir<{ venta: Venta }>("factura", { id: venta.id, telefono: venta.telefono, factura, monto });
    setOcupado(false);
    if (!r.ok) return setError(r.error ?? "No se pudo guardar. Intenta de nuevo.");
    setVenta(r.venta);
    setListo(true);
  }

  function volver(limpiar: boolean) {
    setVenta(null);
    setError("");
    setListo(false);
    if (limpiar) setTelefono("");
    setTimeout(() => campoTelefono.current?.focus(), 50);
  }

  /** El número estaba mal: ese registro se anula y el chat vuelve a donde estaba. */
  function corregir() {
    const anterior = venta;
    volver(false);
    if (anterior) void pedir("anular", { id: anterior.id, telefono: anterior.telefono });
  }

  if (dataMode !== "real") {
    return <p className="px-5 pt-6 text-[14px] text-text2">La validación de números funciona con el panel real, no en el demo.</p>;
  }

  return (
    <div className="h-full overflow-y-auto px-4 pt-3 pb-6 md:px-8">
      <div className="mx-auto flex max-w-[440px] flex-col gap-4">
        {!venta ? (
          <form onSubmit={validar} className="rounded-[12px] border border-line bg-surface p-4" data-testid="validar-paso1">
            <label className={ETIQUETA} htmlFor="validar-telefono">Número del cliente</label>
            <input
              id="validar-telefono"
              ref={campoTelefono}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              inputMode="tel"
              autoComplete="off"
              placeholder="0991234567"
              maxLength={17}
              className={`${CAMPO} tnum font-mono`}
            />
            {error && <p role="alert" className="mt-2 text-[14px] text-signal">{error}</p>}
            <button type="submit" disabled={ocupado || telefono.replace(/\D/g, "").length < 9} className="btn-signal mt-4 h-[52px] w-full rounded-[8px] text-[17px]">
              {ocupado ? "Validando…" : "Validar número"}
            </button>
          </form>
        ) : (
          <>
            <section
              data-testid="validar-resultado"
              className="rounded-[12px] border p-4"
              style={venta.vinoDeWhatsapp
                ? { background: "color-mix(in srgb, var(--color-ok) 10%, var(--color-surface))", borderColor: "color-mix(in srgb, var(--color-ok) 35%, transparent)" }
                : { background: "var(--color-signal-tint)", borderColor: "color-mix(in srgb, var(--color-signal) 30%, transparent)" }}
            >
              <p className="flex items-center gap-2 text-[20px] font-semibold tracking-[-0.01em]">
                {venta.vinoDeWhatsapp ? <IconCheck size={22} style={{ color: "var(--color-ok)" }} /> : <IconAlert size={22} className="text-signal" />}
                {venta.vinoDeWhatsapp ? "Sí vino de WhatsApp" : "No está en los chats"}
              </p>
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14px]">
                <dt className="text-text2">Número</dt><dd className="tnum font-mono">{venta.telefono}</dd>
                {venta.cliente && <><dt className="text-text2">Nombre</dt><dd className="truncate">{venta.cliente}</dd></>}
                {venta.ultimoMensajeAt && <><dt className="text-text2">Último mensaje</dt><dd>{fecha(venta.ultimoMensajeAt)}</dd></>}
                {venta.vinoDeWhatsapp && <><dt className="text-text2">Cotizó el bot</dt><dd>{venta.cotizaciones > 0 ? "Sí" : "No"}</dd></>}
              </dl>
              {yaRegistradaPor && (
                <p className="mt-3 text-[13px] font-semibold text-signal">Ojo: este número ya lo registró hoy {yaRegistradaPor}.</p>
              )}
              {/* El detalle, plegado: en el teléfono manda el veredicto. */}
              <details className="mt-3 text-[13px] text-text2">
                <summary className="cursor-pointer select-none">Qué se guardó</summary>
                <p className="mt-1.5">
                  {venta.vinoDeWhatsapp
                    ? "Este número le escribió al negocio por WhatsApp."
                    : "Revisa que el número esté bien escrito. Si está bien, este cliente no nos escribió por WhatsApp."}
                  {" "}Quedó guardado a nombre de {venta.vendedor}.
                  {venta.efectoEnTicket === "marcado_ganado" && " El chat quedó como venta ganada en el panel."}
                  {venta.efectoEnTicket === "ya_ganado" && " El chat ya estaba como venta ganada: esta factura se suma como otra compra."}
                </p>
              </details>
              {venta.conversationId && (
                <button type="button" onClick={() => navigate(`ticket/${venta.conversationId}`)} className="mt-3 text-[14px] font-semibold underline underline-offset-[3px]">
                  Ver el chat
                </button>
              )}
            </section>

            {listo ? (
              <p className="rounded-[12px] border border-line bg-surface p-4 text-[15px] font-semibold" data-testid="validar-listo">
                Listo: factura {venta.factura} guardada{venta.monto != null ? ` por $${venta.monto.toFixed(2)}` : ""}.
              </p>
            ) : (
              <form onSubmit={guardar} className="rounded-[12px] border border-line bg-surface p-4" data-testid="validar-paso2">
                <label className={ETIQUETA} htmlFor="validar-factura">Factura o referencia</label>
                <input id="validar-factura" value={factura} onChange={(e) => setFactura(e.target.value)} maxLength={40} autoComplete="off" className={CAMPO} />
                <label className={`${ETIQUETA} mt-4`} htmlFor="validar-monto">Monto pagado <span className="font-normal text-text2">(dólares)</span></label>
                <input id="validar-monto" value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="230.50" maxLength={14} autoComplete="off" className={`${CAMPO} tnum font-mono`} />
                {error && <p role="alert" className="mt-2 text-[14px] text-signal">{error}</p>}
                <button type="submit" disabled={ocupado} className="btn-signal mt-4 h-[52px] w-full rounded-[8px] text-[17px]">
                  {ocupado ? "Guardando…" : "Guardar factura"}
                </button>
              </form>
            )}

            <div className="flex gap-2">
              {!listo && <button type="button" onClick={corregir} className="btn-quiet h-12 flex-1 rounded-[8px] text-[14px]">Corregir el número</button>}
              <button type="button" onClick={() => volver(true)} className="btn-quiet h-12 flex-1 rounded-[8px] text-[14px]">Validar otro</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
