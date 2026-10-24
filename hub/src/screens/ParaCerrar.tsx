import { AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { IconX } from "../components/icons";
import { EmptyState, MedidaChip, Modal, PageHeader, Segmented, SkeletonRows } from "../components/ui";
import { useParaCerrar } from "../data/paraCerrar";
import type { AccionParaCerrar, ClienteArchivado, ClienteEmpujando, ClienteParaCerrar } from "../data/types";
import { etiquetaVisita, money, relTime } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";

/**
 * PARA CERRAR — a quién empujar hoy para llegar a la venta (Manuel, 24-oct).
 *
 * Tres listas y nada más: Para cerrar (te toca escribir; tope de 10 por día
 * para el equipo), Empujando (ya les escribieron; se puede ignorar) y el
 * Archivo (14 días sin texto). Las reglas viven en app/src/domain/paraCerrar.ts.
 */

type Vista = "cerrar" | "empujando" | "archivo";

const HORA = 3_600_000;
const MOTIVOS = ["Precio", "Compró en otro lado", "No contestó", "Ya no necesita", "Otro"];

interface Deshacer { texto: string; accion?: () => Promise<void> }

export function ParaCerrar() {
  const { datos, error, cargar, decidir } = useParaCerrar();
  const { dataMode, cerrar, reabrir } = useHub();
  const now = useNow();
  const [vista, setVista] = useState<Vista>("cerrar");
  const [verMas, setVerMas] = useState(false);
  const [perdiendo, setPerdiendo] = useState<ClienteParaCerrar | null>(null);
  const [posponiendo, setPosponiendo] = useState<ClienteParaCerrar | null>(null);
  const [aviso, setAviso] = useState<Deshacer | null>(null);

  useEffect(() => { if (dataMode === "real") void cargar(); }, [dataMode, cargar]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 8000);
    return () => clearTimeout(t);
  }, [aviso]);

  const hacer = async (texto: string, ir: () => Promise<void>, volver?: () => Promise<void>) => {
    try {
      await ir();
      setAviso({ texto, accion: volver });
    } catch (e) {
      setAviso({ texto: `No se pudo: ${(e as Error).message}` });
    }
  };
  const accion = (id: number, a: AccionParaCerrar) => () => decidir(id, a);
  const cerrarYRecargar = (id: number, cierre: "ganado" | "perdido", nota?: string) => async () => { await cerrar(id, cierre, nota); await cargar(); };
  const reabrirYRecargar = (id: number) => async () => { await reabrir(id); await cargar(); };

  const subs: Record<Vista, string> = {
    cerrar: "Ya aceptaron precio y local, y el último mensaje es de ellos",
    empujando: "Ya les escribieron. Salen si compran, con la ✕ o a los 14 días",
    archivo: "14 días sin texto. No salen en ninguna lista, pero aquí siguen",
  };

  if (dataMode !== "real") {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader titulo="Para cerrar" sub={subs.cerrar} />
        <EmptyState titulo="Para cerrar trabaja con datos reales" detalle="Sale de las cotizaciones, los mensajes y las facturas de Contífico. En el demo no hay nada que mostrar." />
      </div>
    );
  }

  const controles = (
    <>
      <Segmented<Vista>
        id="Lista"
        valor={vista}
        onChange={(v) => { setVista(v); setVerMas(false); }}
        opciones={[
          { valor: "cerrar", label: "Para cerrar", badge: datos?.paraCerrar.length, tono: "neutral" },
          { valor: "empujando", label: "Empujando", badge: datos?.empujando.length, tono: "neutral" },
        ]}
      />
      <button
        type="button"
        onClick={() => setVista("archivo")}
        aria-pressed={vista === "archivo"}
        className={`h-[34px] rounded-[6px] px-2.5 text-[13px] ${vista === "archivo" ? "font-semibold text-text" : "text-text2 hover:bg-black/[.04] hover:text-text"}`}
      >
        Archivo <span className="tnum font-mono text-[12px]">{datos?.archivo.length ?? ""}</span>
      </button>
    </>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="hidden md:block">
        <PageHeader titulo="Para cerrar" sub={subs[vista]}>{controles}</PageHeader>
      </div>
      <div className="flex items-center gap-2 px-4 pt-3 pb-3 md:hidden">{controles}</div>

      <div className="px-5 pb-10 md:px-8">
        {!datos && !error && <SkeletonRows n={6} />}
        {!datos && error && <EmptyState titulo="No se pudo cargar" detalle={error} accion={<button className="btn-quiet h-9 rounded-[6px] px-3.5 text-[13px]" onClick={() => void cargar()}>Reintentar</button>} />}

        {datos && vista === "cerrar" && (
          <VistaCerrar
            lista={datos.paraCerrar}
            tope={datos.tope}
            contactados={datos.contactadosHoy}
            pospuestos={datos.pospuestos}
            compraron={datos.compraron}
            verMas={verMas}
            setVerMas={setVerMas}
            now={now}
            onVendido={(c) => void hacer(`Vendido · ${c.nombre ?? c.telefono} · ${money(c.total)}`, cerrarYRecargar(c.ticketId, "ganado"), reabrirYRecargar(c.ticketId))}
            onPerdido={setPerdiendo}
            onPosponer={setPosponiendo}
          />
        )}
        {datos && vista === "empujando" && (
          <VistaEmpujando
            lista={datos.empujando}
            compraron={datos.compraron}
            now={now}
            onSacar={(c) => void hacer(`${c.nombre ?? "Cliente"} salió de Empujando`, accion(c.ticketId, { accion: "sacar" }), accion(c.ticketId, { accion: "devolver" }))}
          />
        )}
        {datos && vista === "archivo" && (
          <VistaArchivo
            lista={datos.archivo}
            now={now}
            onRevivir={(c) => void hacer(`${c.nombre ?? "Cliente"} salió del archivo`, accion(c.ticketId, { accion: "revivir" }), accion(c.ticketId, { accion: "no_revivir" }))}
          />
        )}
      </div>

      <AnimatePresence>
        {perdiendo && (
          <Modal onClose={() => setPerdiendo(null)}>
            <Hoja titulo={`¿Por qué se perdió ${perdiendo.nombre ?? "este cliente"}?`} onCerrar={() => setPerdiendo(null)}>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS.map((m) => (
                  <button key={m} className="btn-quiet h-9 rounded-[6px] px-3.5 text-[13px]" onClick={() => {
                    const c = perdiendo; setPerdiendo(null);
                    void hacer(`Perdido · ${m}`, cerrarYRecargar(c.ticketId, "perdido", `Para cerrar: ${m}`), reabrirYRecargar(c.ticketId));
                  }}>{m}</button>
                ))}
              </div>
            </Hoja>
          </Modal>
        )}
        {posponiendo && (
          <Modal onClose={() => setPosponiendo(null)}>
            <Hoja titulo={`Posponer a ${posponiendo.nombre ?? "este cliente"}`} detalle="Sale de la lista hasta ese día. Si escribe antes, vuelve solo." onCerrar={() => setPosponiendo(null)}>
              <div className="flex flex-wrap gap-2">
                {opcionesPosponer(now).map((o) => (
                  <button key={o.label} className="btn-quiet h-9 rounded-[6px] px-3.5 text-[13px]" onClick={() => {
                    const c = posponiendo; setPosponiendo(null);
                    void hacer(`Vuelve ${o.label.toLowerCase()}`, accion(c.ticketId, { accion: "posponer", hasta: o.hasta.toISOString() }), accion(c.ticketId, { accion: "no_posponer" }));
                  }}>{o.label}</button>
                ))}
              </div>
            </Hoja>
          </Modal>
        )}
      </AnimatePresence>

      {aviso && (
        <div role="status" className="fixed bottom-[104px] left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-[8px] bg-text px-4 py-2.5 text-[13px] text-white shadow-pop md:bottom-6">
          <span>{aviso.texto}</span>
          {aviso.accion && (
            <button className="font-semibold text-[#e8a49b]" onClick={() => { const a = aviso.accion!; setAviso(null); void a(); }}>Deshacer</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Para cerrar: el contador del día y la lista con tope ── */

function VistaCerrar({ lista, tope, contactados, pospuestos, compraron, verMas, setVerMas, now, onVendido, onPerdido, onPosponer }: {
  lista: ClienteParaCerrar[]; tope: number; contactados: number; pospuestos: number; compraron: number;
  verMas: boolean; setVerMas: (v: boolean) => void; now: number;
  onVendido: (c: ClienteParaCerrar) => void; onPerdido: (c: ClienteParaCerrar) => void; onPosponer: (c: ClienteParaCerrar) => void;
}) {
  const quedan = Math.max(0, tope - contactados);
  const listo = quedan === 0;
  const arriba = lista.slice(0, quedan);
  const abajo = lista.slice(quedan);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 rounded-[10px] border border-line bg-surface px-5 py-4">
        <div>
          <span className="text-[14px] font-semibold">Hoy: {contactados} de {tope} contactados</span>
          <span className="ml-2 text-[13px] text-text2">
            {listo ? "Listo por hoy." : `Faltan ${quedan}. Cuando alguien del equipo le escribe a uno, entra el siguiente.`}
          </span>
        </div>
        <span className={`tnum row-span-2 font-mono text-[26px] font-medium ${listo ? "text-ok" : "text-signal"}`}>{contactados}/{tope}</span>
        <div className="h-1 overflow-hidden rounded-full bg-line">
          <div className={`h-full ${listo ? "bg-ok" : "bg-signal"}`} style={{ width: `${Math.min(100, (contactados / tope) * 100)}%` }} />
        </div>
      </div>

      {lista.length === 0 ? (
        <EmptyState titulo="Nadie espera respuesta" detalle="Cuando un cliente acepte precio y local y escriba, aparece aquí." />
      ) : (
        <section className="flex flex-col gap-2">
          {arriba.length > 0 && (
            <div className="mb-1 flex items-baseline justify-between px-0.5">
              <span className="text-[14px] font-semibold">Escríbeles<span className="ml-2.5 font-normal text-text2">primero la plata en juego, la cita cerca y la conversación fresca</span></span>
              <span className="tnum font-mono text-[12px] text-text2">{arriba.length} de {lista.length}</span>
            </div>
          )}
          {listo && <p className="rounded-[8px] bg-ok/10 px-4 py-3 text-[13px] font-medium text-ok">Llegaron a los {tope} de hoy. Los demás siguen aquí abajo por si quieren seguir.</p>}
          {arriba.map((c, i) => <Tarjeta key={c.ticketId} c={c} n={i + 1} now={now} onVendido={onVendido} onPerdido={onPerdido} onPosponer={onPosponer} />)}
          {abajo.length > 0 && (verMas
            ? <>
                <div className="mt-4 mb-1 px-0.5 text-[14px] font-semibold">Debajo del tope<span className="ml-2.5 font-normal text-text2">por si terminan y quieren seguir</span></div>
                {abajo.map((c, i) => <Tarjeta key={c.ticketId} c={c} n={arriba.length + i + 1} now={now} tenue onVendido={onVendido} onPerdido={onPerdido} onPosponer={onPosponer} />)}
                <button className="mt-2 rounded-[8px] border border-dashed border-line-strong py-3 text-[13px] text-text2 hover:bg-surface hover:text-text" onClick={() => setVerMas(false)}>Esconder los {abajo.length} de abajo</button>
              </>
            : <button className="mt-2 rounded-[8px] border border-dashed border-line-strong py-3 text-[13px] text-text2 hover:bg-surface hover:text-text" onClick={() => setVerMas(true)}>+{abajo.length} más debajo del tope</button>
          )}
        </section>
      )}

      {(pospuestos > 0 || compraron > 0) && (
        <p className="px-0.5 text-[12px] text-text2">
          {[pospuestos > 0 && `${pospuestos} pospuestos`, compraron > 0 && `${compraron} ya compraron (factura en Contífico)`].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

function Tarjeta({ c, n, now, tenue = false, onVendido, onPerdido, onPosponer }: {
  c: ClienteParaCerrar; n: number; now: number; tenue?: boolean;
  onVendido: (c: ClienteParaCerrar) => void; onPerdido: (c: ClienteParaCerrar) => void; onPosponer: (c: ClienteParaCerrar) => void;
}) {
  const horas = c.ultimoCliente ? (now - new Date(c.ultimoCliente).getTime()) / HORA : Infinity;
  const frio = horas > 72;
  const color = horas < 24 ? "bg-ok" : frio ? "bg-signal" : "bg-warn";
  const dia = etiquetaVisita(c.visita ?? undefined, c.compromiso ?? undefined, now);
  const hoy = dia === "Hoy";

  return (
    <article className={`grid grid-cols-[18px_10px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 rounded-[8px] border border-line bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgba(28,27,25,.04)] xl:grid-cols-[22px_10px_minmax(0,1.3fr)_minmax(0,1fr)_auto] md:px-5 ${tenue ? "opacity-75" : ""}`}>
      <span className="tnum text-right font-mono text-[12px] text-text3">{n}</span>
      <span className={`h-2.5 w-2.5 rounded-full ${color} ${frio ? "shadow-[0_0_0_4px_var(--color-signal-tint)]" : ""}`} title={c.ultimoCliente ? `Escribió ${relTime(c.ultimoCliente, now)}` : ""} />
      <button type="button" onClick={() => navigate(`ticket/${c.ticketId}`)} className="min-w-0 text-left">
        <span className="flex items-baseline gap-3">
          <span className="truncate text-[15px] font-semibold">{c.nombre ?? c.telefono}</span>
          <span className="tnum shrink-0 font-mono text-[13px] text-text2">{money(c.total)}</span>
        </span>
        <span className="mt-1.5 flex min-w-0 items-center gap-2 border-t border-line pt-1.5">
          {c.medida && <MedidaChip medida={c.medida} size="sm" />}
          <span className="truncate text-[12px] text-text2">{c.llantas}</span>
        </span>
      </button>
      <div className="col-start-3 flex min-w-0 flex-col gap-1.5 xl:col-start-auto">
        <span className="flex flex-wrap items-baseline gap-2 text-[13px]">
          <span className={`font-mono font-bold ${hoy ? "text-signal" : dia ? "" : "text-text2"}`}>{dia ? `${dia}${c.visitaHora ? ` · ${c.visitaHora}` : ""}` : "Sin día"}</span>
          <span className="truncate">{c.local}</span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {c.volvio && <Etiqueta tono="ok">Volvió: respondió</Etiqueta>}
          {!dia && <Etiqueta tono="warn">Falta día</Etiqueta>}
          {!c.ventanaAbierta && <Etiqueta>Ventana cerrada · solo plantilla</Etiqueta>}
          {c.ultimoCliente && <Etiqueta tono={frio ? "signal" : undefined}>Escribió {relTime(c.ultimoCliente, now)}</Etiqueta>}
        </span>
      </div>
      <div className="col-start-3 flex flex-wrap gap-1.5 xl:col-start-auto xl:justify-end">
        <button className="btn-signal h-8 rounded-[6px] px-3 text-[13px]" onClick={() => navigate(`ticket/${c.ticketId}`)}>Escribir</button>
        <button className="btn-quiet h-8 rounded-[6px] px-3 text-[13px]" onClick={() => onVendido(c)}>Vendido</button>
        <button className="btn-quiet h-8 rounded-[6px] px-3 text-[13px]" onClick={() => onPerdido(c)}>Perdido</button>
        <button className="h-8 rounded-[6px] px-2 text-[13px] text-text2 hover:bg-black/[.04] hover:text-text" onClick={() => onPosponer(c)}>Posponer</button>
      </div>
    </article>
  );
}

function Etiqueta({ tono, children }: { tono?: "ok" | "warn" | "signal"; children: React.ReactNode }) {
  const estilo = tono === "ok" ? "bg-ok/10 font-semibold text-ok"
    : tono === "warn" ? "bg-warn/10 font-semibold text-warn"
    : tono === "signal" ? "bg-signal-tint font-semibold text-signal"
    : "bg-bg text-text2";
  return <span className={`whitespace-nowrap rounded-[5px] px-2 py-0.5 text-[12px] ${estilo}`}>{children}</span>;
}

/* ── Empujando: lista llana, para ignorar ── */

function VistaEmpujando({ lista, compraron, now, onSacar }: {
  lista: ClienteEmpujando[]; compraron: number; now: number; onSacar: (c: ClienteEmpujando) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-[70ch] px-0.5 text-[13px] text-text2">
        Si el cliente contesta, vuelve solo a Para cerrar. Si su número aparece en una factura de Contífico, sale solo
        {compraron > 0 && <> (<span className="font-semibold text-ok">{compraron} ya compraron</span>)</>}.
      </p>
      {lista.length === 0 ? (
        <EmptyState titulo="No están empujando a nadie" />
      ) : (
        <Tabla cabeza={["Cliente", "Medida", "Monto", "Local", "Les escribieron", "Se archiva en", ""]} numericas={[2, 5]}>
          {lista.map((c) => (
            <tr key={c.ticketId} className="border-b border-line last:border-0 hover:bg-bg/60">
              <Celda><button className="text-left hover:underline" onClick={() => navigate(`ticket/${c.ticketId}`)}>{c.nombre ?? "Sin nombre"}</button></Celda>
              <Celda mono>{c.medida ?? c.llantas}</Celda>
              <Celda mono derecha>{money(c.total)}</Celda>
              <Celda tenue>{c.local}</Celda>
              <Celda tenue>{relTime(c.ultimoAsesor, now)}</Celda>
              <Celda mono derecha clase={c.seArchivaEn <= 2 ? "text-signal" : "text-text2"}>{c.seArchivaEn} {c.seArchivaEn === 1 ? "día" : "días"}</Celda>
              <Celda>
                <button className="grid h-7 w-7 place-items-center rounded-[6px] text-text3 hover:bg-signal-tint hover:text-signal" onClick={() => onSacar(c)} aria-label={`Sacar a ${c.nombre ?? "este cliente"}`} title="Sacar de la lista">
                  <IconX size={15} />
                </button>
              </Celda>
            </tr>
          ))}
        </Tabla>
      )}
    </div>
  );
}

/* ── Archivo: buscar y sacar de ahí ── */

function VistaArchivo({ lista, now, onRevivir }: { lista: ClienteArchivado[]; now: number; onRevivir: (c: ClienteArchivado) => void }) {
  const [q, setQ] = useState("");
  const filtrada = useMemo(() => {
    const t = q.trim().toLowerCase();
    const dig = t.replace(/\D/g, "");
    if (!t) return lista;
    return lista.filter((c) => (c.nombre ?? "").toLowerCase().includes(t) || (c.medida ?? "").toLowerCase().includes(t) || (dig.length >= 3 && c.telefono.includes(dig)));
  }, [q, lista]);

  return (
    <div className="flex flex-col gap-3">
      <input
        id="buscar-archivo"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre, medida o teléfono"
        aria-label="Buscar en el archivo"
        className="h-9 w-full max-w-[340px] rounded-[6px] border border-line bg-surface px-3 text-[13px]"
      />
      {filtrada.length === 0 ? (
        <EmptyState titulo={q ? "Nada con esa búsqueda" : "El archivo está vacío"} />
      ) : (
        <Tabla cabeza={["Cliente", "Teléfono", "Medida", "Monto", "Último texto", ""]} numericas={[3]}>
          {filtrada.map((c) => (
            <tr key={c.ticketId} className="border-b border-line last:border-0 hover:bg-bg/60">
              <Celda>
                <button className="text-left hover:underline" onClick={() => navigate(`ticket/${c.ticketId}`)}>{c.nombre ?? "Sin nombre"}</button>
                {c.sacado && <span className="ml-2 text-[11px] text-text3">sacado</span>}
              </Celda>
              <Celda mono tenue>{c.telefono}</Celda>
              <Celda mono>{c.medida ?? c.llantas}</Celda>
              <Celda mono derecha>{money(c.total)}</Celda>
              <Celda tenue>{c.ultimoTexto ? relTime(c.ultimoTexto, now) : "—"}</Celda>
              <Celda><button className="h-7 rounded-[6px] px-2 text-[13px] text-text2 hover:bg-black/[.04] hover:text-text" onClick={() => onRevivir(c)}>Sacar del archivo</button></Celda>
            </tr>
          ))}
        </Tabla>
      )}
    </div>
  );
}

/* ── Piezas ── */

function Tabla({ cabeza, numericas, children }: { cabeza: string[]; numericas: number[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[8px] border border-line bg-surface">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line">
            {cabeza.map((h, i) => (
              <th key={i} className={`whitespace-nowrap px-4 py-2.5 text-[12px] font-medium text-text2 ${numericas.includes(i) ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Celda({ children, mono = false, tenue = false, derecha = false, clase = "" }: { children: React.ReactNode; mono?: boolean; tenue?: boolean; derecha?: boolean; clase?: string }) {
  return <td className={`whitespace-nowrap px-4 py-2.5 ${mono ? "tnum font-mono" : ""} ${tenue ? "text-text2" : ""} ${derecha ? "text-right" : ""} ${clase}`}>{children}</td>;
}

function Hoja({ titulo, detalle, onCerrar, children }: { titulo: string; detalle?: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{titulo}</h3>
        <button onClick={onCerrar} className="text-text2 hover:text-text" aria-label="Cancelar"><IconX size={17} /></button>
      </div>
      {detalle && <p className="-mt-2 text-[13px] text-text2">{detalle}</p>}
      {children}
    </div>
  );
}

/** Fechas de «Posponer», a las 08:00 de ese día. */
function opcionesPosponer(now: number): Array<{ label: string; hasta: Date }> {
  const a = (dias: number) => { const d = new Date(now); d.setDate(d.getDate() + dias); d.setHours(8, 0, 0, 0); return d; };
  const hoy = new Date(now);
  const lunes = (8 - hoy.getDay()) % 7 || 7;
  const finDeMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 8);
  const quincena = hoy.getDate() < 15 ? new Date(hoy.getFullYear(), hoy.getMonth(), 15, 8) : finDeMes;
  const opciones = [
    { label: "Mañana", hasta: a(1) },
    { label: "En 3 días", hasta: a(3) },
    { label: "El lunes", hasta: a(lunes) },
    { label: hoy.getDate() < 15 ? "La quincena (15)" : `Fin de mes (${finDeMes.getDate()})`, hasta: quincena },
  ];
  return opciones.filter((o) => o.hasta.getTime() > now);
}
