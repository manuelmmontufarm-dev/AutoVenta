/**
 * Ajustes del negocio — lo que Depot Tire cambia sin desarrollador.
 *
 * Separado a propósito de «Configuración técnica» (el logo DT): aquí no aparece
 * ningún token ni nada que pueda dejar al bot mudo. Cada sección que afecta lo
 * que ve el cliente tiene vista previa antes de aplicar, como pide el §20 del
 * PDF de especificaciones.
 */
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStoredAdminKey } from "../data/realSource";
import { BotPowerSwitch } from "./Settings";

// ---------------------------------------------------------------------------

async function api<T extends object = { ok: true }>(url: string, init: RequestInit = {}): Promise<T> {
  const key = getStoredAdminKey();
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "x-admin-key": key } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Error ${response.status}`);
  return payload;
}

interface Benefit {
  id: number;
  text: string;
  position: number;
  active: boolean;
  brand: string | null;
  minQuantity: number | null;
  store: string | null;
  expiresAt: string | null;
}

interface BrandProfile {
  brand: string;
  tag: string;
  posicionamiento: string;
  notasIa: string;
  fuente: string | null;
  active: boolean;
  position: number;
}
interface StorePeriod { open: string; close: string; closed: boolean }
/** Feriado o cierre puntual de UN local en UNA fecha. Manda sobre el horario normal. */
interface StoreException { fecha: string; motivo: string; open: string; close: string; closed: boolean }
interface Store { weekday: StorePeriod; weekend: StorePeriod; excepciones: StoreException[] }
interface StoreHours { cumbaya: Store; quitoSur: Store }
interface PreciosEstado { fuente: string; actualizadoEn: string | null; productos: number; error: string | null }

const PALETA_LABEL: Record<string, string> = {
  grafito: "Grafito", carbon: "Carbón", rojo: "Rojo", verde: "Verde",
  espresso: "Espresso", navy: "Azul marino",
  depot: "Depot Tire negro", depotRojo: "Depot Tire rojo",
};
/** Las paletas sacadas del sitio del cliente, no propuestas de estilo. */
const PALETA_NOTA: Record<string, string> = {
  depot: "Colores de tiredepotec.com · el negro del logo manda",
  depotRojo: "Colores de tiredepotec.com · el rojo del logo manda · sin beige",
};
const FUENTE_LABEL: Record<string, string> = {
  exo: "Exo 2", barlow: "Barlow", kanit: "Kanit", chakra: "Chakra Petch",
  saira: "Saira", rajdhani: "Rajdhani", archivo: "Archivo Black",
};
const PIEZAS = [
  { id: "cotizacion", label: "Cotización" },
  { id: "comparativa", label: "Comparativa" },
  { id: "opciones", label: "Opciones" },
] as const;

// ---------------------------------------------------------------------------

export function Ajustes() {
  const [paleta, setPaleta] = useState("grafito");
  const [fuente, setFuente] = useState("exo");
  const [paletas, setPaletas] = useState<string[]>([]);
  // dark / accent / gold / base de cada paleta, tal como las usa el motor.
  const [muestras, setMuestras] = useState<Record<string, string[]>>({});
  const [fuentes, setFuentes] = useState<string[]>([]);
  const [guardado, setGuardado] = useState<{ paleta: string; fuente: string } | null>(null);

  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [hours, setHours] = useState<StoreHours | null>(null);
  const [precios, setPrecios] = useState<PreciosEstado | null>(null);
  const [pieza, setPieza] = useState<string>("cotizacion");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const [cfg, ben, br, hrs] = await Promise.all([
        api<{ config: { paleta: string; fuente: string }; paletas: string[]; muestras: Record<string, string[]>; fuentes: string[] }>("/api/pieces-config"),
        api<{ benefits: Benefit[] }>("/api/benefits"),
        api<{ profiles: BrandProfile[] }>("/api/brand-profiles"),
        api<{ hours: StoreHours }>("/api/store-hours"),
      ]);
      // No bloquea la pantalla: si el Interbot no está configurado, el resto de
      // Ajustes tiene que cargar igual.
      api<{ precios: PreciosEstado }>("/api/precios")
        .then((r) => setPrecios(r.precios))
        .catch(() => setPrecios(null));
      setPaleta(cfg.config.paleta);
      setFuente(cfg.config.fuente);
      setGuardado(cfg.config);
      setPaletas(cfg.paletas);
      setMuestras(cfg.muestras ?? {});
      setFuentes(cfg.fuentes);
      setBenefits(ben.benefits);
      setProfiles(br.profiles);
      setHours(hrs.hours);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la configuración");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const sinAplicar = guardado !== null && (guardado.paleta !== paleta || guardado.fuente !== fuente);

  const aplicar = async () => {
    setGuardando(true);
    try {
      const r = await api<{ config: { paleta: string; fuente: string } }>("/api/pieces-config", {
        method: "PUT",
        body: JSON.stringify({ paleta, fuente }),
      });
      setGuardado(r.config);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar");
    } finally {
      setGuardando(false);
    }
  };

  // Los beneficios activos entran a la vista previa aunque no se hayan
  // guardado: el negocio ve la promoción en la pieza mientras la escribe.
  const beneficiosPreview = useMemo(
    () => benefits.filter((b) => b.active && b.text.trim()).map((b) => b.text.trim()),
    [benefits],
  );

  if (cargando) {
    return <div className="p-6 text-sm text-faint">Cargando ajustes…</div>;
  }

  // `h-full overflow-y-auto` como el resto de las pantallas: sin esto la
  // pantalla se pasa del alto de <main> y no hay forma de bajar.
  return (
    <div className="h-full overflow-y-auto px-4 pb-10">
      {error && (
        <div className="glass mb-2.5 rounded-2xl border border-[var(--color-red)]/40 p-4 text-[13px] text-[var(--color-red)]">
          {error}
        </div>
      )}

      {/* El interruptor va primero: apagar el bot tiene que ser lo más fácil
          de encontrar en toda la pantalla. */}
      <div className="mb-2.5">
        <BotPowerSwitch />
      </div>

      <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="flex flex-col gap-2.5">
          <SeccionGuardian onError={setError} />
          <SeccionTema
            paleta={paleta} fuente={fuente} paletas={paletas} fuentes={fuentes} muestras={muestras}
            onPaleta={setPaleta} onFuente={setFuente}
            sinAplicar={sinAplicar} guardando={guardando} onAplicar={aplicar}
          />
          {hours && <SeccionHorarios hours={hours} setHours={setHours} onError={setError} />}
          {precios && <SeccionPrecios precios={precios} setPrecios={setPrecios} onError={setError} />}
          <SeccionPromociones benefits={benefits} setBenefits={setBenefits} onError={setError} />
          <SeccionMarcas profiles={profiles} setProfiles={setProfiles} onError={setError} />
          <SeccionAsesores onError={setError} />
        </div>

        <VistaPrevia
          pieza={pieza} setPieza={setPieza}
          paleta={paleta} fuente={fuente} beneficios={beneficiosPreview}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Tarjeta({ titulo, sub, children, extra }: {
  titulo: string; sub?: string; children: React.ReactNode; extra?: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="glass rounded-3xl p-5"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="microlabel">{titulo}</p>
          {sub && <p className="mt-1 text-[10.5px] text-faint">{sub}</p>}
        </div>
        {extra}
      </div>
      {children}
    </motion.section>
  );
}

const inputCls =
  "w-full rounded-xl border border-paper/[.12] bg-paper/[.04] px-3 py-2 text-[13px] outline-none focus:border-paper/30";


/**
 * Barrido de precios del Interbot. Corre solo los miércoles a las 15:00, porque
 * los precios cambian rara vez; cuando el proveedor avisa de un cambio, este
 * botón lo trae al instante sin esperar a la semana siguiente.
 */
interface GuardianEstado {
  config: { activo: boolean };
  modelo: string;
  semana: { revisiones: number; correcciones: number; hallazgos: number };
}
interface GuardianHallazgo {
  conversationId: number; fecha: string; veredicto: string;
  categoria: string; severidad: string; detalle: string;
}

/**
 * El Ángel Guardián: una IA que revisa cada respuesta del bot ANTES de
 * enviarla (precios contra la cotización real, preguntas repetidas,
 * contradicciones) y la corrige si hace falta. Cuesta tokens por turno, así
 * que el interruptor es del asesor: prendido = cero errores; apagado = ahorro.
 */
function SeccionGuardian({ onError }: { onError: (v: string) => void }) {
  const [estado, setEstado] = useState<GuardianEstado | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [hallazgos, setHallazgos] = useState<GuardianHallazgo[] | null>(null);
  const [abriendo, setAbriendo] = useState(false);

  useEffect(() => {
    api<GuardianEstado & { ok: boolean }>("/api/guardian")
      .then((r) => setEstado(r))
      .catch(() => setEstado(null));
  }, []);

  const alternar = async () => {
    if (!estado) return;
    setCambiando(true);
    try {
      const r = await api<{ config: { activo: boolean } }>("/api/guardian", {
        method: "PUT",
        body: JSON.stringify({ activo: !estado.config.activo }),
      });
      setEstado({ ...estado, config: r.config });
      onError("");
    } catch (e) { onError(e instanceof Error ? e.message : "No se pudo cambiar el guardián"); }
    finally { setCambiando(false); }
  };

  const verInforme = async () => {
    if (hallazgos) { setHallazgos(null); return; }
    setAbriendo(true);
    try {
      const r = await api<{ informe: { hallazgos: GuardianHallazgo[] } }>("/api/guardian/informe?dias=7");
      setHallazgos(r.informe.hallazgos);
    } catch (e) { onError(e instanceof Error ? e.message : "No se pudo cargar el informe"); }
    finally { setAbriendo(false); }
  };

  const activo = estado?.config.activo ?? false;
  return <Tarjeta
    titulo="👼 Ángel Guardián"
    sub="Una IA revisa cada respuesta antes de enviarla: precios contra la cotización real, preguntas repetidas, contradicciones. Corrige el error antes de que el cliente lo vea y lo deja documentado. Prendido gasta tokens en cada respuesta; apáguelo cuando quiera ahorrar."
    extra={estado
      ? <button
          onClick={() => void alternar()}
          disabled={cambiando}
          className={`rounded-full px-4 py-2 text-[12px] font-semibold disabled:opacity-50 ${
            activo ? "bg-lime text-navy" : "bg-paper/[.10] text-faint hover:bg-paper/[.16]"
          }`}
        >{cambiando ? "Cambiando…" : activo ? "● Prendido" : "○ Apagado"}</button>
      : null}
  >
    {!estado && <p className="text-[11px] text-faint">Cargando el estado del guardián…</p>}
    {estado && <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
        <span><span className="text-faint">Modelo revisor:</span> <b>{estado.modelo}</b></span>
        <span><span className="text-faint">Últimos 7 días:</span> <b>{estado.semana.revisiones}</b> revisiones · <b>{estado.semana.correcciones}</b> corregidas · <b>{estado.semana.hallazgos}</b> hallazgos</span>
        <button onClick={() => void verInforme()} disabled={abriendo} className="rounded-full bg-paper/[.08] px-2.5 py-1 text-[10px] font-semibold hover:bg-paper/[.14] disabled:opacity-50">
          {abriendo ? "Cargando…" : hallazgos ? "Ocultar informe" : "Ver informe de la semana"}
        </button>
      </div>
      {hallazgos && !hallazgos.length && <p className="mt-2 text-[11px] text-faint">Sin hallazgos esta semana{activo ? "" : " (el guardián estuvo apagado)"}.</p>}
      {hallazgos && hallazgos.length > 0 && <div className="mt-2 max-h-64 overflow-y-auto rounded-xl bg-paper/[.05] p-2.5">
        {hallazgos.map((h, i) => <div key={i} className="mb-2 border-b border-paper/[.08] pb-2 text-[11px] last:mb-0 last:border-0 last:pb-0">
          <span className={`mr-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
            h.severidad === "alta" ? "bg-[var(--color-danger,#e2564d)]/20 text-[var(--color-danger,#e2564d)]"
            : h.severidad === "media" ? "bg-[var(--color-warn,#e8b33a)]/20 text-[var(--color-warn,#e8b33a)]"
            : "bg-paper/[.10] text-faint"}`}>{h.severidad}</span>
          <b>{h.categoria}</b> · <a className="underline" href={`#/ticket/${h.conversationId}`}>chat #{h.conversationId}</a>
          {h.veredicto === "corregir" && <span className="ml-1 text-lime">corregido antes de enviar</span>}
          <p className="mt-0.5 text-faint">{h.detalle}</p>
          <p className="text-[9px] text-faint">{new Date(h.fecha).toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        </div>)}
      </div>}
    </>}
  </Tarjeta>;
}

function SeccionPrecios({ precios, setPrecios, onError }: { precios: PreciosEstado; setPrecios: (v: PreciosEstado) => void; onError: (v: string) => void }) {
  const [sync, setSync] = useState(false);
  const [listo, setListo] = useState(false);
  const actualizar = async () => {
    setSync(true); setListo(false);
    try {
      const r = await api<{ precios: PreciosEstado }>("/api/precios/sync", { method: "POST" });
      setPrecios(r.precios); onError(""); setListo(true);
      setTimeout(() => setListo(false), 4000);
    } catch (e) { onError(e instanceof Error ? e.message : "No se pudieron actualizar los precios"); }
    finally { setSync(false); }
  };
  const cuando = precios.actualizadoEn
    ? new Date(precios.actualizadoEn).toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "nunca";
  const viejo = precios.actualizadoEn
    ? Date.now() - new Date(precios.actualizadoEn).getTime() > 8 * 86400000
    : true;
  return <Tarjeta
    titulo="Precios del Interbot"
    sub="Se actualizan solos los miércoles a las 15:00. Si les avisan de un cambio de precios antes, actualícenlo aquí."
    extra={<button onClick={() => void actualizar()} disabled={sync} className="rounded-full bg-lime px-4 py-2 text-[12px] font-semibold text-navy disabled:opacity-50">{sync ? "Actualizando…" : listo ? "✓ Actualizado" : "Actualizar ahora"}</button>}
  >
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
      <span><span className="text-faint">Última actualización:</span> <b className={viejo ? "text-[var(--color-warn,#e8b33a)]" : ""}>{cuando}</b></span>
      <span><span className="text-faint">Productos:</span> <b>{precios.productos}</b></span>
    </div>
    {sync && <p className="mt-2 text-[11px] text-faint">Consultando las medidas del Interbot; toma unos segundos.</p>}
    {precios.error && <p className="mt-2 text-[11px] text-[var(--color-danger,#e2564d)]">Último error: {precios.error}</p>}
  </Tarjeta>;
}

/** Feriados y cierres puntuales, por local. Cada uno puede tener los suyos. */
function Excepciones({ store, label, data, onChange }: { store: "cumbaya" | "quitoSur"; label: string; data: Store; onChange: (v: Store) => void }) {
  // El backend viejo no manda `excepciones`: durante un deploy escalonado el
  // panel tiene que seguir abriendo.
  const lista = data.excepciones ?? [];
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
  const set = (i: number, patch: Partial<StoreException>) =>
    onChange({ ...data, excepciones: lista.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  return <div className="mt-3 border-t border-paper/[.08] pt-3">
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-semibold text-faint">Casos especiales</p>
      <button
        onClick={() => onChange({ ...data, excepciones: [...lista, { fecha: hoy, motivo: "", open: data.weekday.open, close: data.weekday.close, closed: false }] })}
        className="rounded-full bg-paper/[.08] px-2.5 py-1 text-[10px] font-semibold hover:bg-paper/[.14]"
      >+ Agregar</button>
    </div>
    {!lista.length && <p className="mt-1.5 text-[10px] text-faint">Sin feriados ni cierres cargados para {label}.</p>}
    {lista.map((e, i) => <div key={`${store}-${i}`} className="mt-2 rounded-xl bg-paper/[.05] p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px]">Fecha<input type="date" className={inputCls} value={e.fecha} onChange={(ev) => set(i, { fecha: ev.target.value })} /></label>
        <label className="text-[10px]">Motivo<input type="text" maxLength={60} placeholder="Feriado, inventario…" className={inputCls} value={e.motivo} onChange={(ev) => set(i, { motivo: ev.target.value })} /></label>
        <label className="text-[10px]">Abre<input type="time" disabled={e.closed} className={inputCls} value={e.open} onChange={(ev) => set(i, { open: ev.target.value })} /></label>
        <label className="text-[10px]">Cierra<input type="time" disabled={e.closed} className={inputCls} value={e.close} onChange={(ev) => set(i, { close: ev.target.value })} /></label>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-2 text-[11px] font-semibold"><input type="checkbox" checked={e.closed} onChange={(ev) => set(i, { closed: ev.target.checked })} /> Cerrado todo el día</label>
        <button onClick={() => onChange({ ...data, excepciones: lista.filter((_, j) => j !== i) })} className="text-[10px] font-semibold text-faint hover:text-[var(--color-danger,#e2564d)]">Quitar</button>
      </div>
    </div>)}
  </div>;
}

function SeccionHorarios({ hours, setHours, onError }: { hours: StoreHours; setHours: (v: StoreHours) => void; onError: (v: string) => void }) {
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const result = await api<{ hours: StoreHours }>("/api/store-hours", { method: "PUT", body: JSON.stringify(hours) });
      setHours(result.hours); onError("");
    } catch (e) { onError(e instanceof Error ? e.message : "No se pudieron guardar los horarios"); }
    finally { setSaving(false); }
  };
  return <Tarjeta titulo="Horarios de locales" sub="El bot usa estos horarios al recomendar un local. Marca Cerrado cuando no atienda, y carga los feriados o cierres puntuales en Casos especiales — el bot los avisa cuando el cliente pregunta por esos días." extra={<button onClick={() => void save()} disabled={saving} className="rounded-full bg-lime px-4 py-2 text-[12px] font-semibold text-navy disabled:opacity-50">{saving ? "Guardando…" : "Guardar horarios"}</button>}>
    <div className="grid gap-4 md:grid-cols-2">{([ ["Cumbayá", "cumbaya"], ["Quito Sur", "quitoSur"] ] as const).map(([label, store]) => <div key={store} className="rounded-2xl bg-paper/[.04] p-4"><p className="text-sm font-bold">{label}</p>{([ ["Lunes a viernes", "weekday"], ["Sábado y domingo", "weekend"] ] as const).map(([dayLabel, period]) => { const value = hours[store][period]; return <div key={period} className="mt-3 grid grid-cols-2 gap-2"><p className="col-span-2 text-[11px] font-semibold text-faint">{dayLabel}</p><label className="text-[10px]">Abre<input type="time" disabled={value.closed} className={inputCls} value={value.open} onChange={(e) => setHours({ ...hours, [store]: { ...hours[store], [period]: { ...value, open: e.target.value } } })} /></label><label className="text-[10px]">Cierra<input type="time" disabled={value.closed} className={inputCls} value={value.close} onChange={(e) => setHours({ ...hours, [store]: { ...hours[store], [period]: { ...value, close: e.target.value } } })} /></label><label className="col-span-2 flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={value.closed} onChange={(e) => setHours({ ...hours, [store]: { ...hours[store], [period]: { ...value, closed: e.target.checked } } })} /> Cerrado</label></div>; })}<Excepciones store={store} label={label} data={hours[store]} onChange={(v) => setHours({ ...hours, [store]: v })} /></div>)}</div>
  </Tarjeta>;
}

function SeccionTema({ paleta, fuente, paletas, fuentes, muestras, onPaleta, onFuente, sinAplicar, guardando, onAplicar }: {
  paleta: string; fuente: string; paletas: string[]; fuentes: string[]; muestras: Record<string, string[]>;
  onPaleta: (v: string) => void; onFuente: (v: string) => void;
  sinAplicar: boolean; guardando: boolean; onAplicar: () => void;
}) {
  return (
    <Tarjeta
      titulo="Colores y tipografía de las piezas"
      sub="Se aplica a cotizaciones, comparativas y opciones. La vista previa cambia al instante; el cliente lo ve recién al aplicar."
      extra={
        <button
          onClick={onAplicar}
          disabled={!sinAplicar || guardando}
          className={`rounded-full px-4 py-2 text-[12px] font-semibold transition ${
            sinAplicar
              ? "bg-[var(--color-ok)] text-[#06210f] hover:opacity-90"
              : "cursor-default bg-paper/[.07] text-faint"
          }`}
        >
          {guardando ? "Aplicando…" : sinAplicar ? "Aplicar cambios" : "Aplicado"}
        </button>
      }
    >
      <p className="microlabel mb-2">Paleta</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {paletas.map((p) => (
          <button
            key={p} onClick={() => onPaleta(p)}
            title={PALETA_NOTA[p]}
            className={`flex flex-col items-start gap-1.5 rounded-xl border px-3.5 py-2 text-[12px] transition ${
              p === paleta
                ? "border-paper/40 bg-paper/[.10] font-semibold"
                : "border-paper/[.10] bg-paper/[.03] hover:bg-paper/[.06]"
            }`}
          >
            <span>{PALETA_LABEL[p] ?? p}</span>
            {/* Los cuatro colores que mandan en la pieza: oscuro, acento, dorado
                y fondo. Con siete paletas el nombre solo ya no alcanzaba para
                saber cuál es cuál sin abrir la vista previa. */}
            <span className="flex overflow-hidden rounded-full border border-paper/20">
              {(muestras[p] ?? []).map((c, i) => (
                <span key={i} className="h-2.5 w-4" style={{ background: c }} />
              ))}
            </span>
            {PALETA_NOTA[p] && (
              <span className="text-[9.5px] font-normal text-faint">{PALETA_NOTA[p]}</span>
            )}
          </button>
        ))}
      </div>
      <p className="microlabel mb-2">Tipografía de los precios</p>
      <div className="flex flex-wrap gap-2">
        {fuentes.map((f) => (
          <button
            key={f} onClick={() => onFuente(f)}
            className={`rounded-xl border px-3.5 py-2 text-[12px] transition ${
              f === fuente
                ? "border-paper/40 bg-paper/[.10] font-semibold"
                : "border-paper/[.10] bg-paper/[.03] hover:bg-paper/[.06]"
            }`}
          >
            {FUENTE_LABEL[f] ?? f}
          </button>
        ))}
      </div>
    </Tarjeta>
  );
}

function SeccionPromociones({ benefits, setBenefits, onError }: {
  benefits: Benefit[]; setBenefits: (b: Benefit[]) => void; onError: (e: string) => void;
}) {
  const [nuevo, setNuevo] = useState("");

  const agregar = async () => {
    if (!nuevo.trim()) return;
    try {
      const r = await api<{ benefit: Benefit }>("/api/benefits", {
        method: "POST",
        body: JSON.stringify({ text: nuevo.trim(), position: benefits.length }),
      });
      setBenefits([...benefits, r.benefit]);
      setNuevo("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo agregar");
    }
  };

  const guardar = async (b: Benefit) => {
    try {
      await api(`/api/benefits/${b.id}`, { method: "PUT", body: JSON.stringify(b) });
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  const borrar = async (id: number) => {
    try {
      await api(`/api/benefits/${id}`, { method: "DELETE" });
      setBenefits(benefits.filter((b) => b.id !== id));
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo borrar");
    }
  };

  const editar = (id: number, patch: Partial<Benefit>) =>
    setBenefits(benefits.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  return (
    <Tarjeta
      titulo="Promociones y beneficios"
      sub="El bloque INCLUYE que sale en el chat y dibujado en la cotización. Las condiciones limitan a quién se le promete."
    >
      <div className="flex flex-col gap-2">
        {benefits.map((b) => (
          <div key={b.id} className="rounded-2xl border border-paper/[.08] bg-paper/[.03] p-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox" checked={b.active}
                onChange={(e) => { editar(b.id, { active: e.target.checked }); void guardar({ ...b, active: e.target.checked }); }}
                className="size-4 shrink-0 accent-[var(--color-ok)]"
                title={b.active ? "Activo" : "Inactivo"}
              />
              <input
                value={b.text}
                onChange={(e) => editar(b.id, { text: e.target.value })}
                onBlur={() => void guardar(b)}
                className={`${inputCls} ${b.active ? "" : "opacity-50 line-through"}`}
              />
              <button
                onClick={() => void borrar(b.id)}
                className="shrink-0 rounded-lg px-2 py-1 text-[16px] leading-none text-faint hover:text-[var(--color-red)]"
                title="Quitar"
              >×</button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">Solo marca</span>
                <input
                  value={b.brand ?? ""} placeholder="todas"
                  onChange={(e) => editar(b.id, { brand: e.target.value || null })}
                  onBlur={() => void guardar(b)} className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">Desde N llantas</span>
                <input
                  type="number" min={1} value={b.minQuantity ?? ""} placeholder="sin mínimo"
                  onChange={(e) => editar(b.id, { minQuantity: e.target.value ? Number(e.target.value) : null })}
                  onBlur={() => void guardar(b)} className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">Vence</span>
                <input
                  type="date" value={b.expiresAt ? b.expiresAt.slice(0, 10) : ""}
                  onChange={(e) => editar(b.id, { expiresAt: e.target.value || null })}
                  onBlur={() => void guardar(b)} className={inputCls}
                />
              </label>
            </div>
          </div>
        ))}
        {!benefits.length && (
          <p className="rounded-2xl border border-dashed border-paper/[.12] p-4 text-center text-[12px] text-faint">
            Sin promociones cargadas. El bot no promete nada hasta que agregues una.
          </p>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={nuevo} onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void agregar()}
          placeholder="Ej. Alineación gratuita el primer mes"
          className={inputCls}
        />
        <button
          onClick={() => void agregar()}
          className="shrink-0 rounded-xl bg-paper/[.10] px-4 text-[12px] font-semibold hover:bg-paper/[.16]"
        >Agregar</button>
      </div>
    </Tarjeta>
  );
}

interface Asesor {
  id: number;
  nombre: string;
  telefono: string;
  prioridad: number;
  active: boolean;
}

/**
 * Quién recibe los avisos del bot. Cada aviso sale a TODOS los activos, en
 * orden de prioridad (0 = principal).
 */
function SeccionAsesores({ onError }: { onError: (e: string) => void }) {
  const [asesores, setAsesores] = useState<Asesor[]>([]);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");

  const cargar = useCallback(async () => {
    try {
      setAsesores((await api<{ asesores: Asesor[] }>("/api/advisors")).asesores);
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudieron cargar los asesores");
    }
  }, [onError]);
  useEffect(() => { void cargar(); }, [cargar]);

  const agregar = async () => {
    const soloDigitos = telefono.replace(/\D/g, "");
    if (!nombre.trim() || soloDigitos.length < 8) {
      onError("Hace falta el nombre y el teléfono con código de país");
      return;
    }
    try {
      await api("/api/advisors", {
        method: "POST",
        body: JSON.stringify({ nombre: nombre.trim(), telefono: soloDigitos, prioridad: asesores.length }),
      });
      setNombre(""); setTelefono(""); await cargar();
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo agregar");
    }
  };

  const cambiar = async (a: Asesor, patch: Partial<Asesor>) => {
    setAsesores(asesores.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
    try {
      await api(`/api/advisors/${a.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  const quitar = async (id: number) => {
    try {
      await api(`/api/advisors/${id}`, { method: "DELETE" });
      setAsesores(asesores.filter((a) => a.id !== id));
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo quitar");
    }
  };

  return (
    <Tarjeta
      titulo="Quién recibe los avisos"
      sub="Cuando un cliente pide hablar con alguien, se genera una cotización o algo falla, el bot avisa por WhatsApp a todos los de esta lista."
    >
      <div className="flex flex-col gap-2">
        {asesores.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-2xl border border-paper/[.08] bg-paper/[.03] p-3">
            <input
              type="checkbox" checked={a.active}
              onChange={(e) => void cambiar(a, { active: e.target.checked })}
              className="size-4 shrink-0 accent-[var(--color-ok)]" title={a.active ? "Recibe avisos" : "Sin avisos"}
            />
            <input
              value={a.nombre}
              onChange={(e) => setAsesores(asesores.map((x) => (x.id === a.id ? { ...x, nombre: e.target.value } : x)))}
              onBlur={() => void cambiar(a, { nombre: a.nombre })}
              className={`${inputCls} ${a.active ? "" : "opacity-50"}`}
            />
            <span className="tnum shrink-0 text-[11.5px] text-faint">+{a.telefono}</span>
            <button
              onClick={() => void quitar(a.id)}
              className="shrink-0 rounded-lg px-2 py-1 text-[16px] leading-none text-faint hover:text-[var(--color-red)]"
              title="Quitar"
            >×</button>
          </div>
        ))}
        {!asesores.length && (
          <p className="rounded-2xl border border-dashed border-[var(--color-red)]/40 p-4 text-center text-[12px] text-[var(--color-red)]">
            No hay nadie recibiendo avisos. Si un cliente pide un asesor, nadie se entera.
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre" className={`${inputCls} flex-1`} />
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)}
          placeholder="593987654321 (con código de país)" className={`${inputCls} flex-1`} />
        <button onClick={() => void agregar()}
          className="shrink-0 rounded-xl bg-paper/[.10] px-4 text-[12px] font-semibold hover:bg-paper/[.16]">
          Agregar
        </button>
      </div>
    </Tarjeta>
  );
}

function SeccionMarcas({ profiles, setProfiles, onError }: {
  profiles: BrandProfile[]; setProfiles: (p: BrandProfile[]) => void; onError: (e: string) => void;
}) {
  const editar = (brand: string, patch: Partial<BrandProfile>) =>
    setProfiles(profiles.map((p) => (p.brand === brand ? { ...p, ...patch } : p)));

  const guardar = async (p: BrandProfile) => {
    try {
      await api(`/api/brand-profiles/${encodeURIComponent(p.brand)}`, {
        method: "PUT", body: JSON.stringify(p),
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo guardar la marca");
    }
  };

  return (
    <Tarjeta
      titulo="Qué decir de cada marca"
      sub="La etiqueta y la frase salen dibujadas en la comparativa y en las opciones. Las notas son lo único que el bot puede afirmar de esa marca en el chat."
    >
      <div className="flex flex-col gap-2.5">
        {profiles.map((p) => (
          <div key={p.brand} className="rounded-2xl border border-paper/[.08] bg-paper/[.03] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="serif text-[15px]">{p.brand}</span>
              <label className="flex items-center gap-1.5 text-[10.5px] text-faint">
                <input
                  type="checkbox" checked={p.active}
                  onChange={(e) => { editar(p.brand, { active: e.target.checked }); void guardar({ ...p, active: e.target.checked }); }}
                  className="size-3.5 accent-[var(--color-ok)]"
                />
                activa
              </label>
            </div>
            <div className="grid gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">Etiqueta en la pieza</span>
                <input
                  value={p.tag} placeholder="Ej. MEJOR EQUILIBRIO"
                  onChange={(e) => editar(p.brand, { tag: e.target.value })}
                  onBlur={() => void guardar(p)} className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">Frase de posicionamiento</span>
                <textarea
                  value={p.posicionamiento} rows={2}
                  onChange={(e) => editar(p.brand, { posicionamiento: e.target.value })}
                  onBlur={() => void guardar(p)} className={`${inputCls} resize-y`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">
                  Notas para el bot — solo esto puede afirmar de la marca
                </span>
                <textarea
                  value={p.notasIa} rows={2}
                  onChange={(e) => editar(p.brand, { notasIa: e.target.value })}
                  onBlur={() => void guardar(p)} className={`${inputCls} resize-y`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">Fuente verificable (opcional)</span>
                <input
                  value={p.fuente ?? ""} placeholder="https://…"
                  onChange={(e) => editar(p.brand, { fuente: e.target.value || null })}
                  onBlur={() => void guardar(p)} className={inputCls}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </Tarjeta>
  );
}

/**
 * Vista previa. Re-renderiza con retardo para no disparar una imagen por cada
 * tecla mientras se escribe una promoción.
 */
function VistaPrevia({ pieza, setPieza, paleta, fuente, beneficios }: {
  pieza: string; setPieza: (p: string) => void;
  paleta: string; fuente: string; beneficios: string[];
}) {
  const [src, setSrc] = useState("");
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState("");
  const objectUrl = useRef<string>("");

  const clave = `${pieza}|${paleta}|${fuente}|${beneficios.join("|")}`;

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ pieza, paleta, fuente });
        if (beneficios.length) params.set("beneficios", beneficios.join("|"));
        const key = getStoredAdminKey();
        const r = await fetch(`/api/pieces/preview.png?${params}`, {
          headers: key ? { "x-admin-key": key } : {},
        });
        if (!r.ok) throw new Error(`Error ${r.status}`);
        const blob = await r.blob();
        if (cancelado) return;
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(blob);
        setSrc(objectUrl.current);
        setFallo("");
      } catch (e) {
        if (!cancelado) setFallo(e instanceof Error ? e.message : "No se pudo renderizar");
      } finally {
        if (!cancelado) setCargando(false);
      }
    }, 350);
    return () => { cancelado = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  return (
    <motion.aside
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="glass h-fit rounded-3xl p-5 xl:sticky xl:top-4"
    >
      <div className="mb-3">
        <p className="microlabel">Vista previa</p>
        <p className="mt-1 text-[10.5px] text-faint">
          Lo que recibiría el cliente ahora mismo, con estos ajustes.
        </p>
      </div>
      <div className="mb-3 flex gap-1.5">
        {PIEZAS.map((p) => (
          <button
            key={p.id} onClick={() => setPieza(p.id)}
            className={`rounded-full px-3 py-1.5 text-[11.5px] transition ${
              p.id === pieza ? "bg-paper/[.12] font-semibold" : "text-faint hover:bg-paper/[.06]"
            }`}
          >{p.label}</button>
        ))}
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-paper/[.08] bg-paper/[.03]">
        {fallo ? (
          <p className="p-6 text-center text-[12px] text-[var(--color-red)]">{fallo}</p>
        ) : (
          <>
            {src && <img src={src} alt="Vista previa de la pieza" className="block w-full" />}
            {cargando && (
              <div className="absolute inset-0 flex items-center justify-center bg-paper/[.04] backdrop-blur-[1px]">
                <span className="text-[11.5px] text-faint">Renderizando…</span>
              </div>
            )}
          </>
        )}
      </div>
    </motion.aside>
  );
}
