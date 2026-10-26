import { AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconX } from "../components/icons";
import { EmptyState, MedidaChip, Modal, PageHeader, Segmented, SkeletonRows } from "../components/ui";
import { useParaCerrar } from "../data/paraCerrar";
import type { AccionParaCerrar, ClienteArchivado, ClienteEmpujando, ClienteParaCerrar, Temperatura } from "../data/types";
import { money, relTime } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";

/**
 * PARA CERRAR — a quién empujar hoy para llegar a la venta (Manuel, 24-oct).
 *
 * Para cerrar es un calendario: cada cliente en el día que dijo que viene, y
 * al lado el desglose del día tocado, los que no vinieron y los que no dijeron
 * día (con el tope de 10 por día para el equipo). Empujando (ya les
 * escribieron; se puede ignorar) y el Archivo (14 días sin texto) son listas. Las reglas viven en app/src/domain/paraCerrar.ts.
 */

type Vista = "cerrar" | "empujando" | "archivo";

const MOTIVOS = ["Precio", "Compró en otro lado", "No contestó", "Ya no necesita", "Otro"];

interface Deshacer { texto: string; accion?: () => Promise<void> }

export function ParaCerrar() {
  const { datos, error, cargar, decidir } = useParaCerrar();
  const { dataMode, cerrar } = useHub();
  const now = useNow();
  const [vista, setVista] = useState<Vista>("cerrar");
  const [vendiendo, setVendiendo] = useState<ClienteParaCerrar | null>(null);
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
        onChange={setVista}
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
            empujando={datos.empujando}
            tope={datos.tope}
            contactados={datos.contactadosHoy}
            pospuestos={datos.pospuestos}
            compraron={datos.compraron}
            now={now}
            onSacar={(c) => void hacer(`${c.nombre ?? "Cliente"} salió de Empujando`, accion(c.ticketId, { accion: "sacar" }), accion(c.ticketId, { accion: "devolver" }))}
            onVendido={setVendiendo}
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
        {/* Cerrar un ticket no tiene «Deshacer»: reabrirlo empieza una visita
            nueva sin la cotización ni el día. Por eso se confirma antes. */}
        {vendiendo && (
          <Modal onClose={() => setVendiendo(null)}>
            <Hoja titulo={`¿Vendido a ${vendiendo.nombre ?? "este cliente"}?`} detalle={`${money(vendiendo.total)} · ${vendiendo.llantas}. El ticket se cierra como ganado.`} onCerrar={() => setVendiendo(null)}>
              <div className="flex justify-end gap-2">
                <button className="btn-quiet h-9 rounded-[6px] px-3.5 text-[13px]" onClick={() => setVendiendo(null)}>Cancelar</button>
                <button className="btn-signal h-9 rounded-[6px] px-3.5 text-[13px]" onClick={() => {
                  const c = vendiendo; setVendiendo(null);
                  void hacer(`Vendido · ${c.nombre ?? c.telefono} · ${money(c.total)}`, cerrarYRecargar(c.ticketId, "ganado"));
                }}>Sí, vendido</button>
              </div>
            </Hoja>
          </Modal>
        )}
        {perdiendo && (
          <Modal onClose={() => setPerdiendo(null)}>
            <Hoja titulo={`¿Por qué se perdió ${perdiendo.nombre ?? "este cliente"}?`} detalle="El ticket se cierra como perdido con ese motivo." onCerrar={() => setPerdiendo(null)}>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS.map((m) => (
                  <button key={m} className="btn-quiet h-9 rounded-[6px] px-3.5 text-[13px]" onClick={() => {
                    const c = perdiendo; setPerdiendo(null);
                    void hacer(`Perdido · ${c.nombre ?? c.telefono} · ${m}`, cerrarYRecargar(c.ticketId, "perdido", `Para cerrar: ${m}`));
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

/* ── Para cerrar: el contador, el mes y el panel del lado ──
   Cada cliente que dijo un día está escrito en ese día del calendario, sin
   «+3 más». El panel de la derecha es el desglose de lo que se toque: un día,
   los que no vinieron en el mes que se mira, o los que no dijeron día. */

type Lado = { tipo: "dia"; dia: string } | { tipo: "novinieron" } | { tipo: "sindia" };
type Cita = { tipo: "cerrar"; c: ClienteParaCerrar; dia: string } | { tipo: "empujando"; c: ClienteEmpujando; dia: string };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** «2026-10-25» en la hora del navegador (Quito para Depot). */
function claveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function desdeClave(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
/** «Hoy», «Mañana», «Ayer» o «jue 29». */
function diaCorto(k: string, hoy: string): string {
  const n = Math.round((desdeClave(k).getTime() - desdeClave(hoy).getTime()) / 86_400_000);
  if (n === 0) return "Hoy";
  if (n === 1) return "Mañana";
  if (n === -1) return "Ayer";
  const d = desdeClave(k);
  return `${CORTO[d.getDay()]} ${d.getDate()}`;
}

function VistaCerrar({ lista, empujando, tope, contactados, pospuestos, compraron, now, onVendido, onPerdido, onPosponer, onSacar }: {
  lista: ClienteParaCerrar[]; empujando: ClienteEmpujando[]; tope: number; contactados: number; pospuestos: number; compraron: number; now: number;
  onVendido: (c: ClienteParaCerrar) => void; onPerdido: (c: ClienteParaCerrar) => void; onPosponer: (c: ClienteParaCerrar) => void; onSacar: (c: ClienteEmpujando) => void;
}) {
  const hoy = claveDia(new Date(now));
  const [mes, setMes] = useState(() => ({ y: new Date(now).getFullYear(), m: new Date(now).getMonth() }));
  const [lado, setLadoBase] = useState<Lado>({ tipo: "dia", dia: hoy });
  const panel = useRef<HTMLElement>(null);
  // Cuando el panel no está al lado (pantallas angostas), bajar hasta él.
  const setLado = (l: Lado) => {
    setLadoBase(l);
    if (!window.matchMedia("(min-width: 1280px)").matches) {
      requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const porDia = useMemo(() => {
    const mapa = new Map<string, Cita[]>();
    const poner = (cita: Cita) => { const l = mapa.get(cita.dia); if (l) l.push(cita); else mapa.set(cita.dia, [cita]); };
    for (const c of lista) if (c.visita) poner({ tipo: "cerrar", c, dia: claveDia(new Date(c.visita)) });
    for (const c of empujando) if (c.visita) poner({ tipo: "empujando", c, dia: claveDia(new Date(c.visita)) });
    // En el día: primero la hora; a igual hora, primero a quien le toca escribir.
    for (const l of mapa.values()) l.sort((a, b) => (a.c.visita ?? "").localeCompare(b.c.visita ?? "") || (a.tipo === "cerrar" ? -1 : 1));
    return mapa;
  }, [lista, empujando]);

  const prefijo = `${mes.y}-${String(mes.m + 1).padStart(2, "0")}`;
  const noVinieron = [...porDia.entries()]
    .filter(([d]) => d < hoy && d.startsWith(prefijo))
    .sort(([a], [b]) => b.localeCompare(a))
    .flatMap(([, l]) => l);
  const sinDia = lista.filter((c) => !c.visita);
  const quedan = Math.max(0, tope - contactados);
  const irAMes = (delta: number) => setMes((x) => { const d = new Date(x.y, x.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const acciones = { onVendido, onPerdido, onPosponer, onSacar };

  return (
    <div className="flex flex-col gap-5">
      <Contador tope={tope} contactados={contactados} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <Calendario
          y={mes.y} m={mes.m} hoy={hoy} porDia={porDia}
          seleccionado={lado.tipo === "dia" ? lado.dia : null}
          onDia={(dia) => setLado({ tipo: "dia", dia })}
          onMes={irAMes}
          onHoy={() => { const d = new Date(now); setMes({ y: d.getFullYear(), m: d.getMonth() }); setLadoBase({ tipo: "dia", dia: hoy }); }}
          atajos={
            <>
              <Atajo activo={lado.tipo === "novinieron"} tono="signal" n={noVinieron.length} onClick={() => setLado({ tipo: "novinieron" })}>No vinieron en {MESES[mes.m]}</Atajo>
              <Atajo activo={lado.tipo === "sindia"} tono="warn" n={sinDia.length} onClick={() => setLado({ tipo: "sindia" })}>Sin día</Atajo>
            </>
          }
        />

        <aside ref={panel} className="scroll-mt-3 rounded-[10px] border border-line bg-surface xl:sticky xl:top-4 xl:max-h-[calc(100vh-32px)] xl:overflow-y-auto">
          {lado.tipo === "dia" && <LadoDia dia={lado.dia} hoy={hoy} citas={porDia.get(lado.dia) ?? []} now={now} {...acciones} />}
          {lado.tipo === "novinieron" && <LadoNoVinieron mes={MESES[mes.m]} citas={noVinieron} hoy={hoy} now={now} {...acciones} />}
          {lado.tipo === "sindia" && <LadoSinDia lista={sinDia} quedan={quedan} hoy={hoy} now={now} {...acciones} />}
        </aside>
      </div>

      {(pospuestos > 0 || compraron > 0) && (
        <p className="px-0.5 text-[12px] text-text2">
          {[pospuestos > 0 && `${pospuestos} pospuestos`, compraron > 0 && `${compraron} ya compraron (factura en Contífico)`].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

function Contador({ tope, contactados }: { tope: number; contactados: number }) {
  const quedan = Math.max(0, tope - contactados);
  const listo = quedan === 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 rounded-[10px] border border-line bg-surface px-5 py-4">
      <div>
        <span className="text-[14px] font-semibold">Hoy: {contactados} de {tope} contactados</span>
        <span className="ml-2 text-[13px] text-text2">
          {listo ? "Listo por hoy." : `Faltan ${quedan}. Cuenta lo que cualquiera del equipo escribe hoy a estos clientes.`}
        </span>
      </div>
      <span className={`tnum row-span-2 font-mono text-[26px] font-medium ${listo ? "text-ok" : "text-signal"}`}>{contactados}/{tope}</span>
      <div className="h-1 overflow-hidden rounded-full bg-line">
        <div className={`h-full ${listo ? "bg-ok" : "bg-signal"}`} style={{ width: `${Math.min(100, (contactados / tope) * 100)}%` }} />
      </div>
    </div>
  );
}

function Atajo({ activo, tono, n, onClick, children }: { activo: boolean; tono: "signal" | "warn"; n: number; onClick: () => void; children: React.ReactNode }) {
  const color = tono === "signal" ? "text-signal" : "text-warn";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`flex h-8 items-center gap-2 rounded-[6px] border px-3 text-[13px] font-medium transition-colors ${activo ? "border-text bg-text text-white" : "border-line bg-surface hover:border-line-strong"}`}
    >
      {children}
      <span className={`tnum font-mono text-[12px] font-bold ${activo ? "text-white" : color}`}>{n}</span>
    </button>
  );
}

/* ── El mes ── */

function Calendario({ y, m, hoy, porDia, seleccionado, onDia, onMes, onHoy, atajos }: {
  y: number; m: number; hoy: string; porDia: Map<string, Cita[]>; seleccionado: string | null;
  onDia: (dia: string) => void; onMes: (delta: number) => void; onHoy: () => void; atajos: React.ReactNode;
}) {
  const primero = new Date(y, m, 1);
  const inicio = new Date(y, m, 1 - ((primero.getDay() + 6) % 7)); // el lunes de esa semana
  const semanas = Math.ceil(((primero.getDay() + 6) % 7 + new Date(y, m + 1, 0).getDate()) / 7);
  const dias = Array.from({ length: semanas * 7 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
  const enElMes = [...porDia.entries()].filter(([d]) => d.startsWith(`${y}-${String(m + 1).padStart(2, "0")}`)).reduce((a, [, l]) => a + l.length, 0);

  return (
    <section className="overflow-hidden rounded-[10px] border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="mr-auto text-[16px] font-semibold capitalize">
          {MESES[m]} {y}
          <span className="ml-2.5 text-[12px] font-normal normal-case text-text2">{enElMes} {enElMes === 1 ? "cita" : "citas"}</span>
        </h2>
        <button type="button" onClick={() => onMes(-1)} aria-label="Mes anterior" className="btn-quiet grid h-8 w-8 place-items-center rounded-[6px] text-[15px]">‹</button>
        <button type="button" onClick={onHoy} className="btn-quiet h-8 rounded-[6px] px-3 text-[13px]">Hoy</button>
        <button type="button" onClick={() => onMes(1)} aria-label="Mes siguiente" className="btn-quiet grid h-8 w-8 place-items-center rounded-[6px] text-[15px]">›</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        {atajos}
        <span className="ml-auto hidden items-center gap-3.5 text-[12px] text-text2 lg:flex">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ok" />viene</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warn" />escribir hoy</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-text3/60" />ya no viene</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-[1.5px] border-text3" />ya le escribieron</span>
          <span className="text-text2 line-through decoration-signal decoration-[1.5px]">no vino</span>
        </span>
      </div>
      <div className="grid grid-cols-7 border-b border-line">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <span key={d} className="px-2 py-1.5 text-[11px] font-medium text-text2">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((d, i) => {
          const k = claveDia(d);
          const citas = porDia.get(k) ?? [];
          const fuera = d.getMonth() !== m;
          const esHoy = k === hoy;
          const paso = k < hoy;
          const sel = k === seleccionado;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onDia(k)}
              aria-pressed={sel}
              aria-label={`${SEMANA[d.getDay()]} ${d.getDate()}: ${citas.length} ${citas.length === 1 ? "cliente" : "clientes"}`}
              className={`flex min-h-[56px] min-w-0 flex-col items-stretch gap-0.5 border-line px-1 pt-1.5 pb-2 text-left transition-colors md:min-h-[92px] ${i % 7 < 6 ? "border-r" : ""} ${i < dias.length - 7 ? "border-b" : ""} ${fuera ? "bg-black/[.018]" : ""} ${sel ? "bg-signal-tint shadow-[inset_0_0_0_2px_var(--color-signal)]" : "hover:bg-signal-tint"}`}
            >
              <span className="flex items-center justify-between px-1 pb-0.5">
                <span className={`tnum font-mono text-[12px] ${esHoy ? "rounded-full bg-signal px-1.5 font-bold text-white" : fuera ? "text-text3" : "text-text2"}`}>{d.getDate()}</span>
                {citas.length > 0 && <span className="tnum font-mono text-[10.5px] text-text2">{citas.length}</span>}
              </span>
              {/* Escritorio: todos los nombres. Teléfono: un punto por cliente. */}
              <span className="hidden flex-col gap-px md:flex">
                {citas.map((cita) => <Renglon key={`${cita.tipo}-${cita.c.ticketId}`} cita={cita} paso={paso} tenue={fuera} />)}
              </span>
              <span className="flex flex-wrap justify-center gap-0.5 md:hidden">
                {citas.map((cita) => <Punto key={`${cita.tipo}-${cita.c.ticketId}`} cita={cita} />)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* Temperatura (app/src/domain/paraCerrar.ts): verde viene, ámbar escribir hoy,
   gris ya no viene. Lleno = te toca escribir; hueco = ya le escribieron. */
const LLENO: Record<Temperatura, string> = { caliente: "bg-ok", ultima: "bg-warn", fria: "bg-text3/60" };
const HUECO: Record<Temperatura, string> = { caliente: "border-ok", ultima: "border-warn", fria: "border-text3/60" };

function Punto({ cita, grande = false }: { cita: Cita; grande?: boolean }) {
  const t = cita.c.temperatura;
  const tam = grande ? "h-2.5 w-2.5" : "h-1.5 w-1.5";
  return cita.tipo === "empujando"
    ? <span className={`${tam} shrink-0 rounded-full ${grande ? "border-[1.5px]" : "border"} ${HUECO[t]}`} />
    : <span className={`${tam} shrink-0 rounded-full ${LLENO[t]}`} />;
}

function Renglon({ cita, paso, tenue }: { cita: Cita; paso: boolean; tenue: boolean }) {
  return (
    <span className={`grid grid-cols-[8px_minmax(0,1fr)] items-center gap-x-1.5 rounded-[4px] px-1 py-[2px] ${tenue ? "opacity-60" : ""}`}>
      <Punto cita={cita} />
      <span className={`min-w-0 text-[12px] leading-[1.25] font-medium break-words ${cita.c.temperatura === "fria" ? "text-text3" : cita.tipo === "empujando" || paso ? "text-text2" : ""} ${paso ? "line-through decoration-signal decoration-[1.5px]" : ""}`}>
        {cita.c.nombre ?? "Sin nombre"}
      </span>
      {cita.c.visitaHora && <span className="col-start-2 truncate font-mono text-[10.5px] text-text2">{cita.c.visitaHora}</span>}
    </span>
  );
}

/* ── El panel del lado ── */

type Acciones = {
  onVendido: (c: ClienteParaCerrar) => void; onPerdido: (c: ClienteParaCerrar) => void;
  onPosponer: (c: ClienteParaCerrar) => void; onSacar: (c: ClienteEmpujando) => void;
};

function CabezaLado({ titulo, n, tono = "signal", detalle }: { titulo: string; n: number; tono?: "signal" | "warn" | "text"; detalle: string }) {
  const color = tono === "signal" ? "text-signal" : tono === "warn" ? "text-warn" : "text-text";
  return (
    <div className="px-5 pt-5 pb-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-semibold tracking-[-0.01em] first-letter:uppercase">{titulo}</h3>
        <span className={`tnum font-mono text-[26px] font-medium ${color}`}>{n}</span>
      </div>
      <p className="mt-1 text-[13px] text-text2">{detalle}</p>
    </div>
  );
}

function ListaCitas({ citas, hoy, now, ...acciones }: { citas: Cita[]; hoy: string; now: number } & Acciones) {
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-4">
      {citas.map((cita) => <TarjetaCita key={`${cita.tipo}-${cita.c.ticketId}`} cita={cita} hoy={hoy} now={now} {...acciones} />)}
    </div>
  );
}

function LadoDia({ dia, hoy, citas, now, ...acciones }: { dia: string; hoy: string; citas: Cita[]; now: number } & Acciones) {
  const d = desdeClave(dia);
  const rel = diaCorto(dia, hoy);
  const fecha = `${SEMANA[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  const titulo = rel === "Hoy" ? "Vienen hoy" : ["Mañana", "Ayer"].includes(rel) ? `${rel} · ${fecha}` : fecha;
  const detalle = dia === hoy ? "Confirmar que llegan y que la llanta está lista."
    : dia < hoy ? "Ese día ya pasó: los que siguen aquí no compraron. Reagendar."
    : "Dijeron que vienen este día.";
  return (
    <>
      <CabezaLado titulo={titulo} n={citas.length} tono={dia < hoy ? "text" : "signal"} detalle={detalle} />
      {citas.length === 0
        ? <p className="px-5 pb-6 text-[13px] text-text2">Nadie dijo que viene este día.</p>
        : <ListaCitas citas={citas} hoy={hoy} now={now} {...acciones} />}
    </>
  );
}

function LadoNoVinieron({ mes, citas, hoy, now, ...acciones }: { mes: string; citas: Cita[]; hoy: string; now: number } & Acciones) {
  const dias = [...new Set(citas.map((c) => c.dia))];
  return (
    <>
      <CabezaLado titulo={`No vinieron en ${mes}`} n={citas.length} tono="text" detalle="Dijeron un día que ya pasó y no hay factura. Son los más fáciles de recuperar: reagendar." />
      {citas.length === 0
        ? <p className="px-5 pb-6 text-[13px] text-text2">Nadie quedó mal este mes.</p>
        : dias.map((dia) => (
          <div key={dia}>
            <p className="px-5 pt-1 pb-2 text-[12px] font-semibold text-text2 first-letter:uppercase">{diaCorto(dia, hoy)}</p>
            <ListaCitas citas={citas.filter((c) => c.dia === dia)} hoy={hoy} now={now} {...acciones} />
          </div>
        ))}
    </>
  );
}

function LadoSinDia({ lista, quedan, hoy, now, ...acciones }: { lista: ClienteParaCerrar[]; quedan: number; hoy: string; now: number } & Acciones) {
  const [verMas, setVerMas] = useState(false);
  // Ya vienen ordenados por puntaje: los primeros son los del tope de hoy.
  // Los grises (ya no vienen) nunca ocupan un lugar del tope.
  const arriba = lista.filter((c) => c.temperatura !== "fria").slice(0, Math.max(quedan, 0));
  const abajo = lista.filter((c) => !arriba.includes(c));
  const citas = (l: ClienteParaCerrar[]): Cita[] => l.map((c) => ({ tipo: "cerrar", c, dia: "" }));
  return (
    <>
      <CabezaLado titulo="Sin día" n={lista.length} tono="warn" detalle={quedan > 0 ? `Aceptaron precio y local; falta que digan cuándo. Primero estos ${arriba.length}: más plata y conversación fresca.` : "Aceptaron precio y local; falta que digan cuándo."} />
      {lista.length === 0 && <p className="px-5 pb-6 text-[13px] text-text2">Todos dijeron un día.</p>}
      <ListaCitas citas={citas(arriba)} hoy={hoy} now={now} {...acciones} />
      {abajo.length > 0 && (verMas
        ? <>
            <p className="px-5 pb-2 text-[12px] font-semibold text-text2">Debajo del tope</p>
            <ListaCitas citas={citas(abajo)} hoy={hoy} now={now} {...acciones} />
            <div className="px-4 pb-4"><button className="w-full rounded-[8px] border border-dashed border-line-strong py-2.5 text-[13px] text-text2 hover:text-text" onClick={() => setVerMas(false)}>Esconder los {abajo.length} de abajo</button></div>
          </>
        : <div className="px-4 pb-4"><button className="w-full rounded-[8px] border border-dashed border-line-strong py-2.5 text-[13px] text-text2 hover:text-text" onClick={() => setVerMas(true)}>+{abajo.length} más debajo del tope</button></div>
      )}
    </>
  );
}

/* ── La tarjeta del panel ── */

function TarjetaCita({ cita, hoy, now, onVendido, onPerdido, onPosponer, onSacar }: { cita: Cita; hoy: string; now: number } & Acciones) {
  const c = cita.c;
  const dia = c.visita ? claveDia(new Date(c.visita)) : null;
  const paso = Boolean(dia && dia < hoy);
  const abrir = () => navigate(`ticket/${c.ticketId}`);
  const t = c.temperatura;

  return (
    <article className={`flex flex-col gap-2 rounded-[8px] border border-line px-4 py-3 ${cita.tipo === "empujando" || t === "fria" ? "bg-bg/60" : "bg-surface"} ${t === "fria" ? "opacity-80" : ""}`}>
      <div className="flex items-center gap-2.5">
        <Punto cita={cita} grande />
        <button type="button" onClick={abrir} className="min-w-0 text-left text-[15px] leading-tight font-semibold break-words hover:underline">{c.nombre ?? "Sin nombre"}</button>
        <span className="tnum ml-auto shrink-0 font-mono text-[13px] text-text2">{money(c.total)}</span>
      </div>
      <div className="flex min-w-0 items-center gap-2 border-t border-line pt-2">
        {c.medida && <MedidaChip medida={c.medida} size="sm" />}
        <span className="truncate text-[12px] text-text2">{c.llantas}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
        <span className={`font-mono font-bold ${dia === hoy ? "text-signal" : paso ? (t === "ultima" ? "text-warn" : "text-text3") : dia ? "" : "text-text2"}`}>
          {dia ? `${diaCorto(dia, hoy)}${c.visitaHora ? ` · ${c.visitaHora}` : ""}` : "Sin día"}
        </span>
        <span>{c.local}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <EtiquetaTemperatura t={t} conDia={Boolean(dia)} />
        {cita.tipo === "empujando" ? (
          <Etiqueta>Le escribieron {relTime(cita.c.ultimoAsesor, now)}</Etiqueta>
        ) : (
          <>
            {cita.c.volvio && <Etiqueta tono="ok">Volvió: respondió</Etiqueta>}
            {!dia && t !== "fria" && <Etiqueta tono="warn">Falta día</Etiqueta>}
            {!cita.c.ventanaAbierta && <Etiqueta>Ventana cerrada · plantilla</Etiqueta>}
            {cita.c.ultimoCliente && <Etiqueta>Escribió {relTime(cita.c.ultimoCliente, now)}</Etiqueta>}
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {cita.tipo === "empujando" ? (
          <>
            <button className="btn-quiet h-8 rounded-[6px] px-3 text-[13px]" onClick={abrir}>Abrir chat</button>
            <button className="flex h-8 items-center gap-1 rounded-[6px] px-2 text-[13px] text-text2 hover:bg-signal-tint hover:text-signal" onClick={() => onSacar(cita.c)}><IconX size={13} />Sacar</button>
          </>
        ) : (
          <>
            <button className="btn-signal h-8 rounded-[6px] px-3 text-[13px]" onClick={abrir}>Escribir</button>
            <button className="btn-quiet h-8 rounded-[6px] px-3 text-[13px]" onClick={() => onVendido(cita.c)}>Vendido</button>
            <button className="btn-quiet h-8 rounded-[6px] px-3 text-[13px]" onClick={() => onPerdido(cita.c)}>Perdido</button>
            <button className="h-8 rounded-[6px] px-2 text-[13px] text-text2 hover:bg-black/[.04] hover:text-text" onClick={() => onPosponer(cita.c)}>Posponer</button>
          </>
        )}
      </div>
    </article>
  );
}

/** Por qué está de ese color, con el dato que lo respalda (medido el 26-oct). */
function EtiquetaTemperatura({ t, conDia }: { t: Temperatura; conDia: boolean }) {
  if (t === "ultima") {
    return <Etiqueta tono="warn" titulo={conDia ? "De 84 que no llegaron su día, 1 llegó al día siguiente." : "Con 1 a 4 días callados, 2 de 204 compraron después."}>
      {conDia ? "Su día fue ayer · escribir hoy" : "Se está enfriando · escribir hoy"}
    </Etiqueta>;
  }
  if (t === "fria") {
    return <Etiqueta tono="fria" titulo={conDia ? "Pasados 2 días de su fecha, 0 de 81 llegaron." : "Con 5 o más días callados, 0 de 177 compraron."}>
      {conDia ? "Ya no viene · pasaron 2+ días de su fecha" : "Ya no viene · 5+ días callado"}
    </Etiqueta>;
  }
  return null;
}

function Etiqueta({ tono, titulo, children }: { tono?: "ok" | "warn" | "signal" | "fria"; titulo?: string; children: React.ReactNode }) {
  const estilo = tono === "fria" ? "bg-black/[.05] font-semibold text-text2"
    : tono === "ok" ? "bg-ok/10 font-semibold text-ok"
    : tono === "warn" ? "bg-warn/10 font-semibold text-warn"
    : tono === "signal" ? "bg-signal-tint font-semibold text-signal"
    : "bg-bg text-text2";
  return <span title={titulo} className={`whitespace-nowrap rounded-[5px] px-2 py-0.5 text-[12px] ${estilo}`}>{children}</span>;
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
              <Celda>
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full border-[1.5px] ${HUECO[c.temperatura]}`} title={c.temperatura === "fria" ? "Ya no viene" : c.temperatura === "ultima" ? "Escribir hoy" : "Viene"} />
                  <button className={`text-left hover:underline ${c.temperatura === "fria" ? "text-text3" : ""}`} onClick={() => navigate(`ticket/${c.ticketId}`)}>{c.nombre ?? "Sin nombre"}</button>
                </span>
              </Celda>
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
