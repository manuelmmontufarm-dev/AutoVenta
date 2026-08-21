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
import { authHeaders } from "../data/realSource";
import { useHub } from "../store";
import { BotPowerSwitch } from "./Settings";

// ---------------------------------------------------------------------------

/**
 * Toda llamada de esta pantalla, con la credencial que corresponda.
 *
 * `authHeaders()` decide: token de sesión si entraste con usuario, y la clave
 * cruda solo como respaldo. Antes esto leía la clave directamente y NUNCA
 * mandaba el token, así que quien entraba con su usuario —sin clave guardada en
 * el navegador— recibía 401 en toda la pantalla: el guardián y el cupón se
 * quedaban en «Cargando…» para siempre y la vista previa daba Error 401
 * (reportado el 15-ago entrando como Manuel).
 */
async function api<T extends object = { ok: true }>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
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

/**
 * Ajustes creció hasta volverse una sola página interminable; estas pestañas
 * lo parten en lo que el negocio busca: el bot, el local, las piezas que ve el
 * cliente, los avisos de WhatsApp y quién entra al panel.
 */
type TabAjustes = "bot" | "negocio" | "piezas" | "avisos" | "usuarios";
const TABS_AJUSTES: { id: TabAjustes; label: string; soloAdmin?: boolean }[] = [
  { id: "bot", label: "Bot" },
  { id: "negocio", label: "Negocio" },
  { id: "piezas", label: "Piezas" },
  { id: "avisos", label: "Avisos" },
  // Crear usuarios y repartir accesos es del nivel más alto (Joaquín, Andrés,
  // Manuel). Entrar con la clave cruda también vale: esa llave ya abre todo.
  { id: "usuarios", label: "Usuarios", soloAdmin: true },
];

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

  // Entrar con la clave cruda deja `usuario` en null: esa llave ya abre todo.
  const usuario = useHub((s) => s.usuario);
  const esNivelMaximo = !usuario || usuario.rol === "admin";
  const [tab, setTab] = useState<TabAjustes>("bot");
  const tabs = TABS_AJUSTES.filter((t) => !t.soloAdmin || esNivelMaximo);

  if (cargando) {
    return <div className="p-6 text-sm text-faint">Cargando ajustes…</div>;
  }

  // `h-full overflow-y-auto` como el resto de las pantallas: sin esto la
  // pantalla se pasa del alto de <main> y no hay forma de bajar.
  return (
    <div className="h-full overflow-y-auto px-4 pb-10">
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id} onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-[12px] transition ${
              t.id === tab ? "bg-paper/[.14] font-semibold" : "bg-paper/[.04] text-faint hover:bg-paper/[.08]"
            }`}
          >{t.label}</button>
        ))}
      </div>

      {error && (
        <div className="glass mb-2.5 rounded-2xl border border-[var(--color-red)]/40 p-4 text-[13px] text-[var(--color-red)]">
          {error}
        </div>
      )}

      {tab === "bot" && (
        <div className="flex flex-col gap-2.5">
          {/* El interruptor va primero: apagar el bot tiene que ser lo más
              fácil de encontrar en toda la pantalla. */}
          <BotPowerSwitch />
          <SeccionGuardian onError={setError} />
          {precios && <SeccionPrecios precios={precios} setPrecios={setPrecios} onError={setError} />}
        </div>
      )}

      {tab === "negocio" && (
        <div className="flex flex-col gap-2.5">
          {hours && <SeccionHorarios hours={hours} setHours={setHours} onError={setError} />}
          <SeccionCupones onError={setError} />
        </div>
      )}

      {tab === "piezas" && (
        <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="flex flex-col gap-2.5">
            <SeccionTema
              paleta={paleta} fuente={fuente} paletas={paletas} fuentes={fuentes} muestras={muestras}
              onPaleta={setPaleta} onFuente={setFuente}
              sinAplicar={sinAplicar} guardando={guardando} onAplicar={aplicar}
            />
            <SeccionPromociones benefits={benefits} setBenefits={setBenefits} onError={setError} />
            <SeccionMarcas profiles={profiles} setProfiles={setProfiles} onError={setError} />
          </div>
          <VistaPrevia
            pieza={pieza} setPieza={setPieza}
            paleta={paleta} fuente={fuente} beneficios={beneficiosPreview}
          />
        </div>
      )}

      {tab === "avisos" && (
        <div className="flex flex-col gap-2.5">
          <SeccionAsesores onError={setError} />
          <SeccionMatrizAvisos editable={esNivelMaximo} onError={setError} />
        </div>
      )}

      {tab === "usuarios" && esNivelMaximo && (
        <div className="flex flex-col gap-2.5">
          <SeccionUsuarios onError={setError} />
        </div>
      )}
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
 * Clase propia para los desplegables angostos: NO se puede reusar `inputCls`
 * con un `w-auto` encima, porque las dos utilidades de ancho pesan igual y gana
 * la que Tailwind deje última en la hoja — el select salía del ancho de la
 * tarjeta y empujaba el resto de la fila fuera de la pantalla.
 */
const selectCls =
  "shrink-0 rounded-xl border border-paper/[.12] bg-paper/[.04] px-2 py-2 text-[12px] outline-none focus:border-paper/30";


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
    titulo="Ángel Guardián"
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
          <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
            h.severidad === "alta" ? "bg-[var(--color-danger,#e2564d)]/20 text-[var(--color-danger,#e2564d)]"
            : h.severidad === "media" ? "bg-[var(--color-warn,#e8b33a)]/20 text-[var(--color-warn,#e8b33a)]"
            : "bg-paper/[.10] text-faint"}`}>{h.severidad}</span>
          <b>{h.categoria}</b> · <a className="underline" href={`#/ticket/${h.conversationId}`}>chat #{h.conversationId}</a>
          {h.veredicto === "corregir" && <span className="ml-1 text-lime">corregido antes de enviar</span>}
          <p className="mt-0.5 text-faint">{h.detalle}</p>
          <p className="text-[11px] text-faint">{new Date(h.fecha).toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        </div>)}
      </div>}
    </>}
  </Tarjeta>;
}

interface CuponVerificado {
  codigo: string;
  porcentaje: number;
  conversationId: number;
  cliente: string | null;
  telefono: string | null;
  medida: string | null;
  totalCotizado: number | null;
  local: string | null;
  visita: string | null;
}

interface CuponesEstado {
  config: { activo: boolean; porcentaje: number };
  resumen: {
    emitidos: number;
    canjeados: number;
    tasaCanje: number;
    ultimos: Array<{
      codigo: string; estado: string; porcentaje: number;
      conversationId: number; emitidoEn: string; canjeadoEn: string | null; canjeadoPor: string | null;
    }>;
  };
}

/**
 * El cupón de confirmación: el código que el cliente lleva a caja.
 *
 * Está APAGADO y así se queda hasta que Andrés dé la luz verde y los cajeros
 * estén capacitados — un código que nadie sabe honrar es peor que no prometer
 * nada. Por eso el interruptor está aquí y no en el código: el día de la
 * capacitación se prende desde el celular, sin esperar un deploy.
 *
 * El canje también vive aquí porque es lo que se hace en el mostrador: se
 * teclea lo que el cliente dicta y el panel dice si vale.
 */
function SeccionCupones({ onError }: { onError: (v: string) => void }) {
  const [estado, setEstado] = useState<CuponesEstado | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [canjeando, setCanjeando] = useState(false);
  const [veredicto, setVeredicto] = useState<{ ok: boolean; texto: string } | null>(null);
  // El cupón verificado y todavía SIN canjear: es lo que el cajero coteja con
  // la persona que tiene enfrente antes de aplicar nada.
  const [verificado, setVerificado] = useState<CuponVerificado | null>(null);

  const cargar = () => {
    api<CuponesEstado & { ok: boolean }>("/api/cupones")
      .then((r) => setEstado(r))
      .catch(() => setEstado(null));
  };
  useEffect(cargar, []);

  const guardar = async (cambio: Partial<{ activo: boolean; porcentaje: number }>) => {
    if (!estado) return;
    setCambiando(true);
    try {
      const r = await api<{ config: CuponesEstado["config"] }>("/api/cupones", {
        method: "PUT",
        body: JSON.stringify(cambio),
      });
      setEstado({ ...estado, config: r.config });
      onError("");
    } catch (e) { onError(e instanceof Error ? e.message : "No se pudo guardar el cupón"); }
    finally { setCambiando(false); }
  };

  /**
   * Paso 1: ¿el código es real y de quién? NO lo canjea.
   *
   * Verificar y canjear están separados porque en caja son dos momentos: se
   * comprueba el código cuando el cliente lo dicta, y se aplica cuando la venta
   * se cierra. Si comprobar quemara el cupón, un cliente que se arrepiente se
   * quedaría sin él y con el código marcado como usado.
   */
  const verificar = async () => {
    if (!codigo.trim()) return;
    setCanjeando(true); setVeredicto(null); setVerificado(null);
    try {
      const r = await api<{ resultado: { ok: boolean; cupon?: CuponVerificado; detalle?: string } }>(
        `/api/cupones/consulta?codigo=${encodeURIComponent(codigo.trim())}`,
      );
      if (r.resultado.ok && r.resultado.cupon) setVerificado(r.resultado.cupon);
      else setVeredicto({ ok: false, texto: `${r.resultado.detalle ?? "Código inválido"}` });
    } catch (e) {
      // Un código rechazado llega como 404 y eso NO es un error del panel: es la
      // respuesta. Se muestra donde el cajero está mirando, no en la franja de
      // errores de arriba.
      setVeredicto({ ok: false, texto: `${e instanceof Error ? e.message : "No se pudo verificar"}` });
    }
    finally { setCanjeando(false); }
  };

  /** Paso 2: aplicar el descuento. Aquí sí se quema el cupón. */
  const canjear = async () => {
    if (!verificado) return;
    setCanjeando(true);
    try {
      const r = await api<{ resultado: { ok: boolean; cupon?: CuponVerificado; detalle?: string } }>(
        "/api/cupones/canje",
        { method: "POST", body: JSON.stringify({ codigo: verificado.codigo }) },
      );
      setVeredicto(r.resultado.ok
        ? { ok: true, texto: `${verificado.codigo} canjeado — aplique el ${verificado.porcentaje} % adicional.` }
        : { ok: false, texto: `${r.resultado.detalle ?? "No se pudo canjear"}` });
      if (r.resultado.ok) { setCodigo(""); setVerificado(null); cargar(); }
    } catch (e) {
      setVeredicto({ ok: false, texto: `${e instanceof Error ? e.message : "No se pudo canjear"}` });
    }
    finally { setCanjeando(false); }
  };

  const activo = estado?.config.activo ?? false;
  return <Tarjeta
    titulo="Cupón de confirmación"
    sub="Cuando el cliente dice qué día viene, el bot le manda un código tipo DT-PUMA47. En caja se le aplica ese porcentaje adicional y el cajero copia el código en la descripción de la factura — así sabemos qué cotización terminó en venta. APAGADO hasta que los cajeros estén capacitados."
    extra={estado
      ? <button
          onClick={() => void guardar({ activo: !activo })}
          disabled={cambiando}
          className={`rounded-full px-4 py-2 text-[12px] font-semibold disabled:opacity-50 ${
            activo ? "bg-lime text-navy" : "bg-paper/[.10] text-faint hover:bg-paper/[.16]"
          }`}
        >{cambiando ? "Cambiando…" : activo ? "● Prendido" : "○ Apagado"}</button>
      : null}
  >
    {!estado && <p className="text-[11px] text-faint">Cargando el estado del cupón…</p>}
    {estado && <>
      {!activo && <p className="mb-2 rounded-xl bg-paper/[.05] p-2.5 text-[11px] text-faint">
        Mientras esté apagado el bot <b>no emite ni un código</b> y los clientes no ven nada. Préndalo el día que caja esté lista.
      </p>}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
        <label className="flex items-center gap-2">
          <span className="text-faint">Descuento adicional:</span>
          <input
            type="number" min={0.5} max={10} step={0.5}
            value={estado.config.porcentaje}
            onChange={(e) => setEstado({ ...estado, config: { ...estado.config, porcentaje: Number(e.target.value) } })}
            onBlur={(e) => void guardar({ porcentaje: Number(e.target.value) })}
            className="w-16 rounded-lg bg-paper/[.08] px-2 py-1 text-[12px] font-bold"
          />
          <span className="text-faint">%</span>
        </label>
        <span>
          <span className="text-faint">Últimos 30 días:</span> <b>{estado.resumen.emitidos}</b> emitidos ·{" "}
          <b>{estado.resumen.canjeados}</b> canjeados · <b>{estado.resumen.tasaCanje} %</b> volvió
        </span>
      </div>

      <div className="mt-3 rounded-xl bg-paper/[.05] p-2.5">
        <p className="mb-1.5 text-[11px] font-semibold">Verificar código en caja</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={codigo}
            onChange={(e) => { setCodigo(e.target.value); setVerificado(null); setVeredicto(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") void verificar(); }}
            placeholder="DT-PUMA47"
            className="w-40 rounded-lg bg-paper/[.08] px-2.5 py-1.5 text-[12px] font-bold uppercase"
          />
          <button
            onClick={() => void verificar()}
            disabled={canjeando || !codigo.trim()}
            className="rounded-full bg-paper/[.12] px-3.5 py-1.5 text-[11px] font-semibold hover:bg-paper/[.18] disabled:opacity-50"
          >{canjeando ? "Buscando…" : "Verificar"}</button>
        </div>

        {/* Verificado y sin canjear: aquí el cajero coteja contra la persona
            que tiene enfrente antes de aplicar el descuento. */}
        {verificado && <div className="mt-2 rounded-lg bg-lime/10 p-2.5 text-[11px]">
          <p className="text-[12px] font-bold text-lime">{verificado.codigo} es válido</p>
          <p className="mt-1">
            {verificado.cliente ?? "Cliente sin nombre"}
            {verificado.telefono ? ` · ${verificado.telefono}` : ""}
          </p>
          <p className="text-faint">
            {verificado.medida ? `Medida ${verificado.medida}` : ""}
            {verificado.totalCotizado != null ? ` · Cotizó $${verificado.totalCotizado.toFixed(2)}` : ""}
            {verificado.local ? ` · ${verificado.local}` : ""}
          </p>
          {verificado.visita && <p className="text-faint">
            Dijo que venía el {new Date(verificado.visita).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", weekday: "long", day: "numeric", month: "long" })}
          </p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void canjear()}
              disabled={canjeando}
              className="rounded-full bg-lime px-3.5 py-1.5 text-[11px] font-semibold text-navy disabled:opacity-50"
            >{canjeando ? "Aplicando…" : `Aplicar ${verificado.porcentaje} % y canjear`}</button>
            <a className="text-[10px] underline" href={`#/ticket/${verificado.conversationId}`}>ver el chat</a>
          </div>
        </div>}

        {veredicto && <p className={`mt-1.5 text-[11px] ${veredicto.ok ? "text-lime" : "text-faint"}`}>{veredicto.texto}</p>}
      </div>

      {estado.resumen.ultimos.length > 0 && <div className="mt-2 max-h-56 overflow-y-auto rounded-xl bg-paper/[.05] p-2.5">
        {estado.resumen.ultimos.map((c) => <div key={c.codigo} className="mb-1.5 flex flex-wrap items-center gap-x-2 border-b border-paper/[.08] pb-1.5 text-[11px] last:mb-0 last:border-0 last:pb-0">
          <b>{c.codigo}</b>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
            c.estado === "canjeado" ? "bg-lime/20 text-lime" : "bg-paper/[.10] text-faint"}`}>{c.estado}</span>
          <a className="underline" href={`#/ticket/${c.conversationId}`}>chat #{c.conversationId}</a>
          {c.canjeadoPor && <span className="text-faint">por {c.canjeadoPor}</span>}
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
    extra={<button onClick={() => void actualizar()} disabled={sync} className="rounded-full bg-lime px-4 py-2 text-[12px] font-semibold text-navy disabled:opacity-50">{sync ? "Actualizando…" : listo ? "Actualizado" : "Actualizar ahora"}</button>}
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
              <span className="text-[11px] font-normal text-faint">{PALETA_NOTA[p]}</span>
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

type RolAsesor = "admin" | "asesor";

interface Asesor {
  id: number;
  nombre: string;
  telefono: string;
  prioridad: number;
  active: boolean;
  rol: RolAsesor;
}

/**
 * Qué recibe cada nivel, en el idioma de quien lo elige desde el panel. El
 * texto largo va en el `title` del selector porque es lo que se consulta una
 * vez, al dar de alta a alguien, y después nunca más.
 */
const ROLES: { valor: RolAsesor; etiqueta: string; explica: string }[] = [
  {
    valor: "admin",
    etiqueta: "Todo",
    explica: "Todo: ventas, visitas, reporte diario de las 20:00, fallas del bot y errores técnicos.",
  },
  {
    valor: "asesor",
    etiqueta: "Solo local",
    explica:
      "Solo lo que se atiende desde el mostrador: nueva cotización, cuándo viene el cliente, "
      + "el día antes, el día de la visita y los chats por vencerse. Sin reportes ni fallas del bot.",
  },
];

/**
 * Quién recibe los avisos del bot. Cada aviso sale a TODOS los activos a
 * quienes les corresponda por su nivel, en orden de prioridad (0 = principal).
 */
function SeccionAsesores({ onError }: { onError: (e: string) => void }) {
  const [asesores, setAsesores] = useState<Asesor[]>([]);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  // Quien se da de alta desde aquí de ahora en adelante es gente del local:
  // Manuel y Joaquín ya están en la lista y siguen en «Todo».
  const [rol, setRol] = useState<RolAsesor>("asesor");

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
        body: JSON.stringify({ nombre: nombre.trim(), telefono: soloDigitos, prioridad: asesores.length, rol }),
      });
      setNombre(""); setTelefono(""); setRol("asesor"); await cargar();
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
      sub="El bot avisa por WhatsApp a los de esta lista. El nivel de cada número decide qué tipo de avisos le llegan; qué recibe cada nivel se ajusta en la tarjeta de abajo."
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
              className={`${inputCls} min-w-0 ${a.active ? "" : "opacity-50"}`}
            />
            <span className="tnum shrink-0 text-[11.5px] text-faint">+{a.telefono}</span>
            <select
              value={a.rol}
              onChange={(e) => void cambiar(a, { rol: e.target.value as RolAsesor })}
              title={ROLES.find((r) => r.valor === a.rol)?.explica}
              className={`${selectCls} py-1.5 text-[11.5px] ${a.active ? "" : "opacity-50"}`}
            >
              {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
            </select>
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
        <select
          value={rol} onChange={(e) => setRol(e.target.value as RolAsesor)}
          title={ROLES.find((r) => r.valor === rol)?.explica}
          className={selectCls}
        >
          {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
        </select>
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
        // Misma credencial que el resto de la pantalla: con sesión de usuario
        // esto daba «Error 401» dentro del recuadro de la vista previa.
        const r = await fetch(`/api/pieces/preview.png?${params}`, {
          headers: authHeaders(),
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

// ---------------------------------------------------------------------------

type NivelAviso = "admin" | "asesor";
type MatrizAvisos = Record<NivelAviso, string[]>;

/**
 * Las categorías en el idioma del negocio. El detalle enumera los avisos que
 * caen dentro, para que marcar una casilla no sea un acto de fe.
 */
const CATEGORIAS_UI: { id: string; label: string; detalle: string }[] = [
  { id: "ventas", label: "Ventas", detalle: "Nueva cotización · el cliente quiere comprar" },
  { id: "visitas", label: "Visitas", detalle: "Confirmó cuándo viene · viene mañana · viene hoy" },
  {
    id: "ventana", label: "Ventana de 24 h",
    detalle: "Aviso antes de que se cierre la ventana para escribirle a un cliente. Apagada para todos: eran demasiados mensajes (reunión 19-ago).",
  },
  { id: "cliente", label: "Cliente", detalle: "Pide un asesor · está molesto · pidió que no le escriban más" },
  { id: "bot", label: "El bot necesita ayuda", detalle: "Conversaciones trabadas y bloqueos del guardián" },
  { id: "tecnico", label: "Fallas técnicas", detalle: "Errores al enviar mensajes de WhatsApp" },
];

const NIVELES_UI: { id: NivelAviso; label: string }[] = [
  { id: "admin", label: "Todo" },
  { id: "asesor", label: "Solo local" },
];

/**
 * Qué tipo de aviso recibe cada nivel. Cada casilla guarda al soltarla; si el
 * servidor la rechaza, la casilla vuelve a como estaba para no mentir.
 */
function SeccionMatrizAvisos({ editable, onError }: { editable: boolean; onError: (e: string) => void }) {
  const [matriz, setMatriz] = useState<MatrizAvisos | null>(null);
  useEffect(() => {
    api<{ matriz: MatrizAvisos }>("/api/aviso-matrix")
      .then((r) => setMatriz(r.matriz))
      .catch((e) => onError(e instanceof Error ? e.message : "No se pudo cargar la matriz de avisos"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alternar = async (nivel: NivelAviso, categoria: string) => {
    if (!matriz) return;
    const fila = matriz[nivel].includes(categoria)
      ? matriz[nivel].filter((c) => c !== categoria)
      : [...matriz[nivel], categoria];
    const siguiente = { ...matriz, [nivel]: fila };
    setMatriz(siguiente);
    try {
      const r = await api<{ matriz: MatrizAvisos }>("/api/aviso-matrix", {
        method: "PUT", body: JSON.stringify({ matriz: siguiente }),
      });
      setMatriz(r.matriz);
      onError("");
    } catch (e) {
      setMatriz(matriz);
      onError(e instanceof Error ? e.message : "No se pudo guardar la matriz");
    }
  };

  return (
    <Tarjeta
      titulo="Qué recibe cada nivel"
      sub="Cada aviso del bot cae en una de estas categorías; aquí se decide qué categoría le llega a cada nivel. El reporte diario de las 20:00 va siempre y solo al nivel «Todo»."
    >
      {!matriz && <p className="text-[11px] text-faint">Cargando la matriz…</p>}
      {matriz && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-3 text-[10px] font-semibold uppercase text-faint">
            <span className="flex-1">Tipo de aviso</span>
            {NIVELES_UI.map((n) => <span key={n.id} className="w-20 text-center">{n.label}</span>)}
          </div>
          {CATEGORIAS_UI.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-2xl border border-paper/[.08] bg-paper/[.03] p-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold">{c.label}</p>
                <p className="mt-0.5 text-[10.5px] text-faint">{c.detalle}</p>
              </div>
              {NIVELES_UI.map((n) => (
                <label key={n.id} className="flex w-20 justify-center" title={editable ? undefined : "Solo un administrador puede cambiarlo"}>
                  <input
                    type="checkbox"
                    checked={matriz[n.id].includes(c.id)}
                    disabled={!editable}
                    onChange={() => void alternar(n.id, c.id)}
                    className="size-4 accent-[var(--color-ok)] disabled:opacity-40"
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------

interface PermisosHub {
  verInbox: boolean; verKanban: boolean; verOportunidades: boolean; verMetricas: boolean;
  verFinanzas: boolean; usarCotizador: boolean; verAjustes: boolean; verErrores: boolean;
}

interface UsuarioHub {
  id: string;
  nombre: string;
  rol: "admin" | "asesor";
  permisos: PermisosHub;
}

/** Cada interruptor en el idioma de las pestañas que abre o esconde. */
const PERMISOS_UI: { id: keyof PermisosHub; label: string }[] = [
  { id: "verInbox", label: "Inbox" },
  { id: "verKanban", label: "Pipeline" },
  { id: "verOportunidades", label: "Oportunidades" },
  { id: "usarCotizador", label: "Cotizador" },
  { id: "verMetricas", label: "Métricas" },
  { id: "verFinanzas", label: "Cifras de venta ($)" },
  { id: "verErrores", label: "Alertas del bot" },
  { id: "verAjustes", label: "Ajustes" },
];

const ROLES_HUB: { valor: "admin" | "asesor"; etiqueta: string; explica: string }[] = [
  { valor: "admin", etiqueta: "Administrador", explica: "Puede crear usuarios, repartir accesos y cambiar la matriz de avisos." },
  { valor: "asesor", etiqueta: "Asesor", explica: "Usa el panel; no administra usuarios ni avisos." },
];

/**
 * Quién entra al panel y qué ve. Distinto de «Quién recibe los avisos»: esto
 * son cuentas del dashboard; aquello, teléfonos de WhatsApp.
 *
 * El username es lo que sale en el desplegable del login, por eso se elige a
 * mano y no se inventa desde el nombre. La clave sigue siendo la misma para
 * todos (decisión del cliente, 14-ago).
 */
function SeccionUsuarios({ onError }: { onError: (e: string) => void }) {
  const [usuarios, setUsuarios] = useState<UsuarioHub[]>([]);
  const [username, setUsername] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<"admin" | "asesor">("asesor");
  const yo = useHub((s) => s.usuario);

  const cargar = useCallback(async () => {
    try {
      setUsuarios((await api<{ usuarios: UsuarioHub[] }>("/api/hub-users")).usuarios);
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudieron cargar los usuarios");
    }
  }, [onError]);
  useEffect(() => { void cargar(); }, [cargar]);

  const crear = async () => {
    try {
      await api("/api/hub-users", {
        method: "POST",
        body: JSON.stringify({ id: username.trim().toLowerCase(), nombre: nombre.trim(), rol }),
      });
      setUsername(""); setNombre(""); setRol("asesor");
      onError("");
      await cargar();
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo crear el usuario");
    }
  };

  const cambiar = async (u: UsuarioHub, patch: Partial<Omit<UsuarioHub, "id" | "permisos">> & { permisos?: Partial<PermisosHub> }) => {
    setUsuarios(usuarios.map((x) => (x.id === u.id
      ? { ...x, ...patch, permisos: { ...x.permisos, ...(patch.permisos ?? {}) } }
      : x)));
    try {
      await api(`/api/hub-users/${encodeURIComponent(u.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
      onError("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo guardar");
      await cargar();
    }
  };

  const borrar = async (id: string) => {
    try {
      await api(`/api/hub-users/${encodeURIComponent(id)}`, { method: "DELETE" });
      setUsuarios(usuarios.filter((u) => u.id !== id));
      onError("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo borrar");
    }
  };

  return (
    <Tarjeta
      titulo="Usuarios del panel"
      sub="Quién sale en el desplegable del login y qué pestañas ve. Todos entran con la misma clave de siempre; los cambios de acceso se aplican la próxima vez que esa persona inicie sesión."
    >
      <div className="flex flex-col gap-2.5">
        {usuarios.map((u) => (
          <div key={u.id} className="rounded-2xl border border-paper/[.08] bg-paper/[.03] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tnum shrink-0 rounded-lg bg-paper/[.08] px-2 py-1 text-[11px] font-bold">{u.id}</span>
              <input
                value={u.nombre}
                onChange={(e) => setUsuarios(usuarios.map((x) => (x.id === u.id ? { ...x, nombre: e.target.value } : x)))}
                onBlur={() => void cambiar(u, { nombre: u.nombre })}
                className={`${inputCls} min-w-0 flex-1`}
              />
              <select
                value={u.rol}
                onChange={(e) => void cambiar(u, { rol: e.target.value as "admin" | "asesor" })}
                title={ROLES_HUB.find((r) => r.valor === u.rol)?.explica}
                className={`${selectCls} py-1.5 text-[11.5px]`}
                disabled={u.id === yo?.id}
              >
                {ROLES_HUB.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
              </select>
              <button
                onClick={() => void borrar(u.id)}
                disabled={u.id === yo?.id}
                className="shrink-0 rounded-lg px-2 py-1 text-[16px] leading-none text-faint hover:text-[var(--color-red)] disabled:opacity-30"
                title={u.id === yo?.id ? "No puedes borrarte a ti mismo" : "Borrar usuario"}
              >×</button>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              {PERMISOS_UI.map((permiso) => (
                <label key={permiso.id} className="flex items-center gap-1.5 text-[11px]">
                  <input
                    type="checkbox"
                    checked={u.permisos[permiso.id]}
                    onChange={(e) => void cambiar(u, { permisos: { [permiso.id]: e.target.checked } })}
                    className="size-3.5 accent-[var(--color-ok)]"
                  />
                  {permiso.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
          placeholder="username (para el login)" className={`${inputCls} flex-1`}
        />
        <input value={nombre} onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre completo" className={`${inputCls} flex-1`} />
        <select value={rol} onChange={(e) => setRol(e.target.value as "admin" | "asesor")}
          title={ROLES_HUB.find((r) => r.valor === rol)?.explica} className={selectCls}>
          {ROLES_HUB.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
        </select>
        <button
          onClick={() => void crear()}
          disabled={username.trim().length < 2 || !nombre.trim()}
          className="shrink-0 rounded-xl bg-paper/[.10] px-4 text-[12px] font-semibold hover:bg-paper/[.16] disabled:opacity-40"
        >Crear</button>
      </div>
    </Tarjeta>
  );
}
