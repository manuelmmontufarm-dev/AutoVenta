import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { IconAlert, IconCheck, IconDoc, IconEtiqueta, IconPlus } from "../components/icons";
import { Panel } from "../components/ui";
import {
  bajarExcel, cambiar, crear, detalle, leerExcel, listar, quitar,
  type Estado, type FueraDeLaVista, type LlantaDeLaVista, type Parametros, type PromocionGuardada,
  type TipoDePromocion, type TipoParaElPanel, type Vista,
} from "../data/promociones";

/**
 * PROMOCIONES (24-nov-2026). El negocio arma sus promociones solo, sin pedirle
 * nada a AutoVenta: elige el tipo, le pone nombre, texto y fechas, baja un Excel
 * con su stock y el precio de hoy, lo llena, lo sube, VE cómo queda cada llanta
 * y guarda. Después la prende y la apaga con un interruptor.
 *
 * Las cuentas no viven acá: el servidor calcula el precio, el porcentaje y dice
 * en palabras qué fila no entra y por qué.
 */

const plata = (n: number) => `$${n.toFixed(2)}`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const dia = (d: string) => {
  const [, m, dd] = d.split("-").map(Number);
  return `${dd} ${MESES[m - 1]}`;
};
function fechas(p: { desde: string | null; hasta: string | null }): string {
  if (p.desde && p.hasta) return `Del ${dia(p.desde)} al ${dia(p.hasta)}`;
  if (p.hasta) return `Hasta el ${dia(p.hasta)}`;
  if (p.desde) return `Desde el ${dia(p.desde)}, sin fecha de fin`;
  return "Sin fecha de fin";
}

const ESTADO: Record<Estado, { texto: string; clase: string }> = {
  activa: { texto: "Activa", clase: "bg-ok/10 text-ok" },
  apagada: { texto: "Apagada", clase: "bg-line text-text2" },
  programada: { texto: "Programada", clase: "bg-warn/10 text-warn" },
  vencida: { texto: "Vencida", clase: "bg-line text-text2" },
};

const CAMPO = "h-10 w-full rounded-[6px] border border-line-strong bg-bg px-3 text-[14px] outline-none focus:border-signal";

export function Promociones() {
  const [tipos, setTipos] = useState<TipoParaElPanel[]>([]);
  const [promos, setPromos] = useState<PromocionGuardada[] | null>(null);
  const [llantas, setLlantas] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const data = await listar();
      setTipos(data.tipos);
      setPromos(data.promociones);
      setLlantas(data.llantasEnInventario);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer las promociones");
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const reemplazar = (p: PromocionGuardada) => setPromos((lista) => (lista ?? []).map((x) => (x.id === p.id ? p : x)));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[920px] flex-col gap-4 px-5 pt-3 pb-12 md:px-8 md:pt-0">
        {error && <Aviso tono="mal">{error}</Aviso>}

        {!creando && (
          <Panel className="flex flex-wrap items-center justify-between gap-3 p-5 md:px-6">
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Sus promociones</h2>
              <p className="mt-0.5 text-[13px] text-text2">
                El bot las cotiza solo, con el precio tachado y el porcentaje. Usted las prende y las apaga.
              </p>
            </div>
            <button type="button" className="btn-signal inline-flex h-11 items-center gap-2 rounded-[6px] px-5 text-[14px] font-semibold" onClick={() => setCreando(true)} data-testid="nueva-promocion">
              <IconPlus size={16} /> Nueva promoción
            </button>
          </Panel>
        )}

        {creando && (
          <Asistente
            tipos={tipos}
            llantasEnInventario={llantas}
            onCancelar={() => setCreando(false)}
            onGuardada={() => { setCreando(false); void cargar(); }}
          />
        )}

        {promos === null && !error && <Panel className="p-6 text-[13px] text-text2">Leyendo las promociones…</Panel>}

        {promos?.length === 0 && !creando && (
          <Panel className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <IconEtiqueta size={28} className="text-text2" />
            <p className="text-[15px] font-semibold">Todavía no hay promociones</p>
            <p className="max-w-[46ch] text-[13px] text-text2">
              Toque «Nueva promoción», elija el tipo y siga los pasos. En unos minutos el bot la está cotizando.
            </p>
          </Panel>
        )}

        {promos?.map((p) => (
          <Tarjeta key={p.id} promo={p} onCambio={reemplazar} onQuitada={() => void cargar()} />
        ))}
      </div>
    </div>
  );
}

// ── Piezas chicas ───────────────────────────────────────────────────────────

function Aviso({ tono, children }: { tono: "bien" | "mal" | "ojo"; children: ReactNode }) {
  const clase = tono === "mal" ? "border-signal/30 bg-signal-tint text-signal" : tono === "ojo" ? "border-warn/40 bg-bg text-text" : "border-line bg-bg text-text";
  const Icono = tono === "bien" ? IconCheck : IconAlert;
  return (
    <div className={`flex items-start gap-2 rounded-[6px] border p-3 text-[13px] ${clase}`} role={tono === "mal" ? "alert" : "status"}>
      <Icono size={16} className={`mt-px shrink-0 ${tono === "bien" ? "text-ok" : tono === "ojo" ? "text-warn" : ""}`} />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function Etiqueta({ texto, ayuda, children }: { texto: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[12px] font-semibold text-text2">{texto}</span>
      {children}
      {ayuda && <span className="text-[12px] text-text3">{ayuda}</span>}
    </label>
  );
}

function Interruptor({ prendido, onCambio, ocupado, etiqueta }: { prendido: boolean; onCambio: (v: boolean) => void; ocupado?: boolean; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={prendido}
      aria-label={etiqueta}
      disabled={ocupado}
      onClick={() => onCambio(!prendido)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${prendido ? "bg-ok" : "bg-line-strong"} ${ocupado ? "opacity-60" : ""}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] ${prendido ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

/** Los parámetros que algunos tipos piden antes del Excel. */
function CamposDelTipo({ tipo, valor, onCambio }: { tipo: TipoParaElPanel; valor: Parametros; onCambio: (p: Parametros) => void }) {
  const numero = (v: string) => (v === "" ? undefined : Number(v));
  if (tipo.pide.includes("lleva_paga")) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Etiqueta texto="Lleva" ayuda="Cuántas llantas se lleva">
          <input className={CAMPO} type="number" min={2} max={12} inputMode="numeric" value={valor.lleva ?? ""} onChange={(e) => onCambio({ ...valor, lleva: numero(e.target.value) })} />
        </Etiqueta>
        <Etiqueta texto="Paga" ayuda="Cuántas paga">
          <input className={CAMPO} type="number" min={1} max={11} inputMode="numeric" value={valor.paga ?? ""} onChange={(e) => onCambio({ ...valor, paga: numero(e.target.value) })} />
        </Etiqueta>
      </div>
    );
  }
  if (tipo.pide.includes("posicion_porcentaje")) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Etiqueta texto="Qué llanta lleva el descuento" ayuda="2 = cada segunda llanta">
          <select className={CAMPO} value={valor.posicion ?? ""} onChange={(e) => onCambio({ ...valor, posicion: numero(e.target.value) })}>
            <option value="">Elija…</option>
            <option value={2}>La 2.ª</option>
            <option value={3}>La 3.ª</option>
            <option value={4}>La 4.ª</option>
          </select>
        </Etiqueta>
        <Etiqueta texto="% de descuento en esa llanta" ayuda="100 = gratis">
          <input className={CAMPO} type="number" min={1} max={100} inputMode="decimal" value={valor.porcentaje ?? ""} onChange={(e) => onCambio({ ...valor, porcentaje: numero(e.target.value) })} />
        </Etiqueta>
      </div>
    );
  }
  if (tipo.pide.includes("escalones")) {
    const escalones = valor.escalones ?? [];
    const poner = (i: number, cambio: Partial<{ desde: number; porcentaje: number }>) =>
      onCambio({ ...valor, escalones: escalones.map((e, k) => (k === i ? { ...e, ...cambio } : e)) });
    return (
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold text-text2">Escalones</span>
        {escalones.map((e, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-[13px]">
            Desde
            <input className={`${CAMPO} !w-20`} type="number" min={1} max={40} inputMode="numeric" value={Number.isFinite(e.desde) ? e.desde : ""} onChange={(ev) => poner(i, { desde: Number(ev.target.value) })} />
            llantas:
            <input className={`${CAMPO} !w-20`} type="number" min={1} max={99} inputMode="decimal" value={Number.isFinite(e.porcentaje) ? e.porcentaje : ""} onChange={(ev) => poner(i, { porcentaje: Number(ev.target.value) })} />
            % menos
            <button type="button" className="btn-quiet h-9 rounded-[6px] px-3 text-[12px]" onClick={() => onCambio({ ...valor, escalones: escalones.filter((_, k) => k !== i) })}>Quitar</button>
          </div>
        ))}
        <button type="button" className="btn-quiet h-9 self-start rounded-[6px] px-3 text-[13px]" onClick={() => onCambio({ ...valor, escalones: [...escalones, { desde: escalones.length ? 4 : 2, porcentaje: 5 }] })}>
          + Agregar escalón
        </button>
      </div>
    );
  }
  if (tipo.pide.includes("regalo")) {
    return (
      <Etiqueta texto="Qué se lleva de regalo" ayuda="Sale tal cual en la cotización">
        <input className={CAMPO} maxLength={140} placeholder="Alineación gratis" value={valor.regalo ?? ""} onChange={(e) => onCambio({ ...valor, regalo: e.target.value })} />
      </Etiqueta>
    );
  }
  return null;
}

/** ¿Faltan parámetros? Devuelve qué falta, en palabras, o null. */
function faltaDelTipo(tipo: TipoParaElPanel, p: Parametros): string | null {
  if (tipo.pide.includes("lleva_paga")) {
    if (!p.lleva || !p.paga) return "Diga cuántas lleva y cuántas paga.";
    if (p.paga >= p.lleva) return "«Paga» tiene que ser menor que «lleva».";
  }
  if (tipo.pide.includes("posicion_porcentaje") && (!p.posicion || !p.porcentaje)) return "Elija qué llanta lleva el descuento y de cuánto.";
  if (tipo.pide.includes("escalones") && !(p.escalones ?? []).length) return "Agregue al menos un escalón.";
  if (tipo.pide.includes("regalo") && !(p.regalo ?? "").trim()) return "Escriba qué se lleva de regalo.";
  return null;
}

/** Bajar el Excel, llenarlo, subirlo. Devuelve la vista previa a quien lo usa. */
function ExcelDeIdaYVuelta({ tipo, parametros, bajar, onVista, bloqueado }: {
  tipo: TipoDePromocion;
  parametros: Parametros;
  bajar: () => Promise<void>;
  onVista: (v: Vista | null) => void;
  bloqueado?: string | null;
}) {
  const [ocupado, setOcupado] = useState<"bajando" | "subiendo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const bajarlo = async () => {
    setOcupado("bajando");
    setError(null);
    try { await bajar(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo bajar el Excel"); } finally { setOcupado(null); }
  };
  const subir = async (f: File) => {
    setOcupado("subiendo");
    setError(null);
    onVista(null);
    try {
      onVista(await leerExcel(tipo, parametros, f));
      setArchivo(f.name);
    } catch (e) {
      setArchivo(null);
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo");
    } finally {
      setOcupado(null);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {bloqueado && <Aviso tono="ojo">{bloqueado}</Aviso>}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-[8px] border border-line p-4">
          <p className="text-[13px] font-semibold">1. Baje el Excel</p>
          <p className="text-[12px] text-text2">Trae todas sus llantas con el stock y el precio de hoy. Llene solo las columnas amarillas.</p>
          <button type="button" disabled={Boolean(bloqueado) || ocupado !== null} className="btn-quiet mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-[6px] px-4 text-[14px] font-semibold" onClick={() => void bajarlo()} data-testid="bajar-excel">
            <IconDoc size={16} /> {ocupado === "bajando" ? "Preparando…" : "Bajar el Excel"}
          </button>
        </div>
        <div className="flex flex-col gap-2 rounded-[8px] border border-line p-4">
          <p className="text-[13px] font-semibold">2. Súbalo lleno</p>
          <p className="text-[12px] text-text2">Antes de guardar va a ver cómo queda cada llanta. Lo que deje vacío queda fuera.</p>
          <button type="button" disabled={Boolean(bloqueado) || ocupado !== null} className="btn-signal mt-auto inline-flex h-11 items-center justify-center rounded-[6px] px-4 text-[14px] font-semibold" onClick={() => input.current?.click()} data-testid="subir-excel">
            {ocupado === "subiendo" ? "Leyendo…" : archivo ? "Subir otro archivo" : "Subir el Excel lleno"}
          </button>
          <input
            ref={input}
            type="file"
            accept=".xls,.xlsx,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); }}
          />
        </div>
      </div>
      {error && <Aviso tono="mal">{error}</Aviso>}
    </div>
  );
}

function TablaDeLlantas({ entran, noEntran, sinLlenar }: { entran: LlantaDeLaVista[]; noEntran: FueraDeLaVista[]; sinLlenar?: number }) {
  const [todas, setTodas] = useState(false);
  const visibles = todas ? entran : entran.slice(0, 12);
  const conAviso = entran.filter((l) => l.advertencias.length).length;
  const porCantidad = entran.some((l) => l.porCantidad);
  return (
    <div className="flex flex-col gap-3" data-testid="vista-previa">
      {entran.length > 0 ? (
        <Aviso tono="bien">
          <b>{entran.length} {entran.length === 1 ? "llanta entra" : "llantas entran"} en la promoción.</b>
          {noEntran.length > 0 && ` ${noEntran.length} no ${noEntran.length === 1 ? "entra" : "entran"} (abajo dice por qué).`}
          {sinLlenar ? ` ${sinLlenar} quedaron sin llenar y siguen a precio normal.` : ""}
        </Aviso>
      ) : (
        <Aviso tono="mal"><b>Ninguna llanta entra en la promoción.</b> Revise el Excel: abajo dice qué pasó con cada fila.</Aviso>
      )}
      {conAviso > 0 && (
        <Aviso tono="ojo"><b>Revise {conAviso === 1 ? "esta llanta" : `estas ${conAviso} llantas`} antes de guardar:</b> están marcadas abajo. Si están bien, puede guardar igual.</Aviso>
      )}

      {entran.length > 0 && (
        <div className="overflow-x-auto rounded-[6px] border border-line">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead className="bg-bg text-[12px] text-text2">
              <tr>
                <th className="px-3 py-2 font-semibold">Llanta</th>
                <th className="px-3 py-2 text-right font-semibold">Hoy</th>
                <th className="px-3 py-2 text-right font-semibold">{porCantidad ? "Con 4 llantas" : "Con la promo"}</th>
                <th className="px-3 py-2 text-right font-semibold">Descuento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibles.map((l) => (
                <tr key={l.codigo} className={l.advertencias.length ? "bg-warn/5" : ""}>
                  <td className="px-3 py-2">
                    <span className="font-semibold">{l.nombre}</span> <span className="text-text2">{l.medida}</span>
                    <span className="block text-[12px] text-text3">
                      {l.codigo} · stock {l.stock}
                      {l.regla ? ` · ${l.regla}` : ""}
                    </span>
                    {l.porCantidad && (
                      <span className="block text-[12px] text-text2">
                        {l.porCantidad.filter((c) => c.unidad !== null).map((c) => `${c.cantidad} ${c.cantidad === 1 ? "llanta" : "llantas"}: ${plata(c.total)}`).join(" · ") || "Sin rebaja hasta 4 llantas"}
                      </span>
                    )}
                    {l.advertencias.map((a) => (
                      <span key={a} className="mt-0.5 flex items-start gap-1 text-[12px] font-semibold text-warn"><IconAlert size={13} className="mt-px shrink-0" />{a}</span>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-text2 line-through">{plata(l.precioHoy)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{l.precioPromo !== null ? plata(l.precioPromo) : "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">{l.porcentaje !== null ? `−${l.porcentaje}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entran.length > 12 && (
            <button type="button" className="w-full border-t border-line px-3 py-2 text-[13px] text-text2 hover:text-text" onClick={() => setTodas(!todas)}>
              {todas ? "Ver menos" : `Ver las ${entran.length} llantas`}
            </button>
          )}
        </div>
      )}

      {noEntran.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] font-semibold">No entran</p>
          <ul className="flex flex-col divide-y divide-line rounded-[6px] border border-line">
            {noEntran.slice(0, 40).map((f, i) => (
              <li key={`${f.codigo}-${i}`} className="px-3 py-2 text-[13px]">
                <span className="font-semibold">{f.nombre ?? f.codigo}</span>
                <span className="text-text2"> — {f.motivo}</span>
                <span className="block text-[12px] text-text3">{f.fila ? `Fila ${f.fila} del Excel · ` : ""}código {f.codigo}</span>
              </li>
            ))}
            {noEntran.length > 40 && <li className="px-3 py-2 text-[12px] text-text2">…y {noEntran.length - 40} más.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Nueva promoción, paso a paso ────────────────────────────────────────────

function Asistente({ tipos, llantasEnInventario, onCancelar, onGuardada }: {
  tipos: TipoParaElPanel[];
  llantasEnInventario: number;
  onCancelar: () => void;
  onGuardada: () => void;
}) {
  const [tipo, setTipo] = useState<TipoParaElPanel | null>(null);
  const [nombre, setNombre] = useState("");
  const [texto, setTexto] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [parametros, setParametros] = useState<Parametros>({});
  const [vista, setVista] = useState<Vista | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const falta = !tipo ? null
    : !nombre.trim() ? "Póngale un nombre a la promoción para poder bajar el Excel."
    : desde && hasta && desde > hasta ? "La fecha de fin es anterior a la de inicio."
    : faltaDelTipo(tipo, parametros);

  const guardar = async (activa: boolean) => {
    if (!tipo || !vista?.subida) return;
    setGuardando(true);
    setError(null);
    try {
      await crear({ nombre, tipo: tipo.id, textoExtra: texto, desde: desde || null, hasta: hasta || null, parametros, activa, subida: vista.subida });
      onGuardada();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la promoción");
      setGuardando(false);
    }
  };

  return (
    <Panel className="flex flex-col gap-5 p-5 md:p-6" >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Nueva promoción</h2>
          <p className="mt-0.5 text-[13px] text-text2">Nada cambia para los clientes hasta que usted guarde.</p>
        </div>
        <button type="button" className="btn-quiet h-9 rounded-[6px] px-3 text-[13px]" onClick={onCancelar}>Cancelar</button>
      </div>

      <section className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold">1. ¿Qué tipo de promoción es?</p>
        <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Tipo de promoción">
          {tipos.map((t) => {
            const elegido = tipo?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={elegido}
                data-testid={`tipo-${t.id}`}
                onClick={() => { setTipo(t); setParametros({}); setVista(null); }}
                className={`flex flex-col gap-1 rounded-[8px] border p-3 text-left transition-colors ${elegido ? "border-signal bg-signal-tint" : "border-line hover:border-line-strong"}`}
              >
                <span className="text-[14px] font-semibold">{t.nombre}</span>
                <span className="text-[12px] text-text2">{t.queHace}</span>
                <span className="mt-auto pt-1 text-[12px] text-text3">Ej.: {t.ejemplo}</span>
              </button>
            );
          })}
        </div>
      </section>

      {tipo && (
        <section className="flex flex-col gap-3">
          <p className="text-[13px] font-semibold">2. Nombre, texto y fechas</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Etiqueta texto="Nombre" ayuda="Sale en la cotización: «Semana Kenda», «Navidad»…">
              <input className={CAMPO} maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Semana Kenda" data-testid="promo-nombre" />
            </Etiqueta>
            <Etiqueta texto="Texto extra (opcional)" ayuda="Una frase que acompaña al nombre">
              <input className={CAMPO} maxLength={140} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Incluye alineación y balanceo" />
            </Etiqueta>
            <Etiqueta texto="Empieza (opcional)" ayuda="Vacío = desde hoy">
              <input className={CAMPO} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </Etiqueta>
            <Etiqueta texto="Termina (opcional)" ayuda="Ese día es el último. Vacío = hasta que la apague">
              <input className={CAMPO} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} data-testid="promo-hasta" />
            </Etiqueta>
          </div>
          <CamposDelTipo tipo={tipo} valor={parametros} onCambio={(p) => { setParametros(p); setVista(null); }} />
          {tipo.porCantidad && (
            <p className="text-[12px] text-text2">
              En este tipo el precio depende de cuántas llantas lleva el cliente. La cotización lo calcula sola y lo muestra como precio por llanta con su porcentaje.
            </p>
          )}
        </section>
      )}

      {tipo && (
        <section className="flex flex-col gap-3">
          <p className="text-[13px] font-semibold">3. Las llantas</p>
          {llantasEnInventario === 0 ? (
            <Aviso tono="mal">Todavía no hay inventario cargado: sin llantas no se puede armar el Excel.</Aviso>
          ) : (
            <ExcelDeIdaYVuelta
              tipo={tipo.id}
              parametros={parametros}
              bloqueado={falta}
              bajar={() => bajarExcel({ tipo: tipo.id, nombre })}
              onVista={setVista}
            />
          )}
        </section>
      )}

      {tipo && vista && (
        <section className="flex flex-col gap-3">
          <p className="text-[13px] font-semibold">4. Así queda</p>
          <TablaDeLlantas entran={vista.entran} noEntran={vista.noEntran} sinLlenar={vista.sinLlenar} />
          {error && <Aviso tono="mal">{error}</Aviso>}
          {vista.subida && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={guardando || Boolean(falta)} className="btn-signal h-11 rounded-[6px] px-5 text-[14px] font-semibold" onClick={() => void guardar(true)} data-testid="guardar-prendida">
                {guardando ? "Guardando…" : "Guardar y prender"}
              </button>
              <button type="button" disabled={guardando || Boolean(falta)} className="btn-quiet h-11 rounded-[6px] px-5 text-[14px]" onClick={() => void guardar(false)}>
                Guardar apagada
              </button>
            </div>
          )}
        </section>
      )}
    </Panel>
  );
}

// ── Una promoción guardada ──────────────────────────────────────────────────

function Tarjeta({ promo, onCambio, onQuitada }: { promo: PromocionGuardada; onCambio: (p: PromocionGuardada) => void; onQuitada: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<"llantas" | "editar" | "excel" | "quitar" | null>(null);
  const [llantas, setLlantas] = useState<{ entran: LlantaDeLaVista[]; noEntran: FueraDeLaVista[] } | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [nombre, setNombre] = useState(promo.nombre);
  const [texto, setTexto] = useState(promo.textoExtra ?? "");
  const [desde, setDesde] = useState(promo.desde ?? "");
  const [hasta, setHasta] = useState(promo.hasta ?? "");

  const hacer = async (trabajo: () => Promise<PromocionGuardada | void>) => {
    setOcupado(true);
    setError(null);
    try {
      const p = await trabajo();
      if (p) onCambio(p);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const abrir = (cual: typeof abierto) => {
    const nuevo = abierto === cual ? null : cual;
    setAbierto(nuevo);
    setVista(null);
    if (nuevo === "llantas") {
      setLlantas(null);
      void detalle(promo.id).then((d) => setLlantas({ entran: d.entran, noEntran: d.noEntran })).catch((e) => setError(e instanceof Error ? e.message : "No se pudo leer"));
    }
  };

  const estado = ESTADO[promo.estado];
  const vencida = promo.estado === "vencida";
  const paraTodas = promo.parametros.todas === true;

  return (
    <Panel className="flex flex-col gap-3 p-5 md:px-6" >
      <div className="flex items-start justify-between gap-3" data-testid={`promo-${promo.id}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-semibold tracking-[-0.01em]">{promo.nombre}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${estado.clase}`}>{estado.texto}</span>
          </div>
          <p className="mt-1 text-[13px] text-text2">
            {promo.tipoNombre}{promo.resumen ? ` · ${promo.resumen}` : ""} · {fechas(promo)}
          </p>
          {promo.textoExtra && <p className="mt-0.5 text-[13px] text-text2">«{promo.textoExtra}»</p>}
          {paraTodas ? (
            <p className="mt-1 text-[13px]">
              Va en <b>todas</b> las llantas ({promo.entranHoy} hoy): es el precio de hoy de la cotización.
              Las demás promociones se cuentan sobre ese precio. Apagada, se cotiza al precio de lista.
            </p>
          ) : (
            <p className="mt-1 text-[13px]">
              <b>{promo.entranHoy}</b> {promo.entranHoy === 1 ? "llanta la tiene" : "llantas la tienen"} hoy
              {promo.noEntranHoy > 0 && <span className="text-warn"> · {promo.noEntranHoy} no {promo.noEntranHoy === 1 ? "entra" : "entran"} con el inventario de hoy</span>}
            </p>
          )}
          {vencida && <p className="mt-1 text-[12px] text-text2">Ya pasó su fecha de fin. Para volver a usarla, cámbiele la fecha.</p>}
          {promo.estado === "programada" && <p className="mt-1 text-[12px] text-text2">Empieza sola el {dia(promo.desde!)}.</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Interruptor
            prendido={promo.activa}
            ocupado={ocupado}
            etiqueta={`${promo.activa ? "Apagar" : "Prender"} ${promo.nombre}`}
            onCambio={(v) => void hacer(async () => (await cambiar(promo.id, { activa: v })).promocion)}
          />
          <span className="text-[12px] text-text2">{promo.activa ? "Prendida" : "Apagada"}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!paraTodas && <button type="button" className="btn-quiet h-9 rounded-[6px] px-3 text-[13px]" onClick={() => abrir("llantas")}>{abierto === "llantas" ? "Ocultar llantas" : "Ver llantas"}</button>}
        <button type="button" className="btn-quiet h-9 rounded-[6px] px-3 text-[13px]" onClick={() => abrir("editar")}>Nombre y fechas</button>
        {!paraTodas && <button type="button" className="btn-quiet h-9 rounded-[6px] px-3 text-[13px]" onClick={() => abrir("excel")}>Cambiar llantas o precios</button>}
        <button type="button" className="btn-quiet h-9 rounded-[6px] px-3 text-[13px]" onClick={() => abrir("quitar")}>Quitar</button>
      </div>

      {error && <Aviso tono="mal">{error}</Aviso>}

      {abierto === "llantas" && (llantas
        ? <TablaDeLlantas entran={llantas.entran} noEntran={llantas.noEntran} />
        : <p className="text-[13px] text-text2">Leyendo las llantas…</p>)}

      {abierto === "editar" && (
        <div className="flex flex-col gap-3 rounded-[8px] border border-line p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Etiqueta texto="Nombre"><input className={CAMPO} maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} /></Etiqueta>
            <Etiqueta texto="Texto extra"><input className={CAMPO} maxLength={140} value={texto} onChange={(e) => setTexto(e.target.value)} /></Etiqueta>
            <Etiqueta texto="Empieza"><input className={CAMPO} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Etiqueta>
            <Etiqueta texto="Termina" ayuda="Ese día es el último"><input className={CAMPO} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></Etiqueta>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={ocupado}
              className="btn-signal h-10 rounded-[6px] px-4 text-[13px] font-semibold"
              onClick={() => void hacer(async () => (await cambiar(promo.id, { nombre, textoExtra: texto, desde: desde || null, hasta: hasta || null })).promocion).then((ok) => ok && setAbierto(null))}
            >
              {ocupado ? "Guardando…" : "Guardar cambios"}
            </button>
            <button type="button" className="btn-quiet h-10 rounded-[6px] px-4 text-[13px]" onClick={() => setAbierto(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {abierto === "excel" && (
        <div className="flex flex-col gap-3 rounded-[8px] border border-line p-4">
          <p className="text-[13px] text-text2">El Excel baja con lo que ya tiene la promoción. Cámbielo, súbalo y revise antes de guardar.</p>
          <ExcelDeIdaYVuelta tipo={promo.tipo} parametros={promo.parametros} bajar={() => bajarExcel({ id: promo.id })} onVista={setVista} />
          {vista && <TablaDeLlantas entran={vista.entran} noEntran={vista.noEntran} sinLlenar={vista.sinLlenar} />}
          {vista?.subida && (
            <button
              type="button"
              disabled={ocupado}
              className="btn-signal h-10 self-start rounded-[6px] px-4 text-[13px] font-semibold"
              onClick={() => void hacer(async () => (await cambiar(promo.id, { subida: vista.subida! })).promocion).then((ok) => ok && setAbierto(null))}
            >
              {ocupado ? "Guardando…" : "Guardar estas llantas"}
            </button>
          )}
        </div>
      )}

      {abierto === "quitar" && (
        <div className="flex flex-col gap-3 rounded-[8px] border border-signal/30 bg-signal-tint p-4 text-[13px]">
          <span><b>¿Quitar «{promo.nombre}»?</b> Deja de aplicarse y desaparece de esta lista. Si solo quiere pausarla, apáguela con el interruptor.</span>
          <div className="flex gap-2">
            <button type="button" disabled={ocupado} className="btn-signal h-9 rounded-[6px] px-4 text-[13px] font-semibold" onClick={() => void hacer(async () => { await quitar(promo.id); }).then((ok) => ok && onQuitada())}>
              Sí, quitarla
            </button>
            <button type="button" className="btn-quiet h-9 rounded-[6px] px-4 text-[13px]" onClick={() => setAbierto(null)}>No</button>
          </div>
        </div>
      )}
    </Panel>
  );
}
