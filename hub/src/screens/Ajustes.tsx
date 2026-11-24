/**
 * Ajustes del negocio — lo que el cliente cambia sin desarrollador.
 *
 * Separado a propósito de «Configuración técnica» (el logo DT): aquí no aparece
 * ningún token. Lo que cambia la cotización que ve el cliente (tema, plantilla,
 * beneficios) vive en la pantalla Promociones, con su vista previa antes de
 * aplicar, como pide el §20 del PDF de especificaciones.
 */
import { useCallback, useEffect, useState } from "react";
import { useNegocio, type LocalDelNegocio } from "../data/negocio";
import { authHeaders } from "../data/realSource";
import { useHub } from "../store";
import { Segmented } from "../components/ui";
import { BotPowerSwitch } from "./Settings";
import { FollowUpSettingsPanel } from "../components/seguimientos";
import { SeccionAnuncios } from "../components/anuncios";
import { SeccionCatalogoArchivo, SeccionFacturasArchivo } from "../components/catalogo-archivo";

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
const DIAS_SEMANA = [
  ["lun", "Lunes"], ["mar", "Martes"], ["mie", "Miércoles"], ["jue", "Jueves"], ["vie", "Viernes"], ["sab", "Sábado"], ["dom", "Domingo"],
] as const;
type Dia = (typeof DIAS_SEMANA)[number][0];
/** Un horario por día: Depot cierra el domingo y abre el sábado. */
interface Store { dias: Record<Dia, StorePeriod>; excepciones: StoreException[] }
type StoreHours = Record<string, Store>;
interface PreciosEstado { fuente: string; actualizadoEn: string | null; productos: number; error: string | null }

// ---------------------------------------------------------------------------

/**
 * Ajustes creció hasta volverse una sola página interminable; estas pestañas
 * lo parten en lo que el negocio busca: el local, los seguimientos, los avisos
 * de WhatsApp y quién entra al panel.
 *
 * 24-nov-2026 (Manuel): «Piezas» se mudó a la pantalla Promociones, al lado de
 * las promociones y con su vista previa; el cupón de confirmación salió del
 * panel (nunca se prendió); y «Bot» —guardián, origen de los precios, archivos,
 * qué decir de cada marca— queda solo para soporte: «no veo nada que les
 * interese de ahí». El interruptor de encender y apagar el bot NO se esconde:
 * es el botón de emergencia del negocio y pasó a ser lo primero de «Negocio».
 */
type TabAjustes = "negocio" | "seguimientos" | "avisos" | "usuarios" | "bot";
const TABS_AJUSTES: { id: TabAjustes; label: string; soloAdmin?: boolean; soloSoporte?: boolean }[] = [
  { id: "negocio", label: "Negocio" },
  // Horarios y tiempos de seguimiento vivían en Configuración técnica; son
  // decisiones del negocio, así que ahora están acá (DESIGN.md §17).
  { id: "seguimientos", label: "Seguimientos" },
  { id: "avisos", label: "Avisos" },
  // Crear usuarios y repartir accesos es del nivel más alto (Joaquín, Andrés,
  // Manuel). Entrar con la clave cruda también vale: esa llave ya abre todo.
  { id: "usuarios", label: "Usuarios", soloAdmin: true },
  { id: "bot", label: "Bot", soloSoporte: true },
];

/**
 * Quién es soporte de AutoVenta en el panel de cualquier cliente: el usuario
 * `manuel` (sembrado igual en todos, `services/hubUsers.ts`) y quien entra con
 * la clave cruda, que solo tiene soporte. Solo decide qué pestañas se muestran;
 * los permisos de verdad los sigue poniendo el servidor.
 */
const USUARIOS_DE_SOPORTE = ["manuel"];

export function Ajustes() {
  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [hours, setHours] = useState<StoreHours | null>(null);
  const [precios, setPrecios] = useState<PreciosEstado | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const [br, hrs] = await Promise.all([
        api<{ profiles: BrandProfile[] }>("/api/brand-profiles"),
        api<{ hours: StoreHours }>("/api/store-hours"),
      ]);
      // No bloquea la pantalla: si el Interbot no está configurado, el resto de
      // Ajustes tiene que cargar igual.
      api<{ precios: PreciosEstado }>("/api/precios")
        .then((r) => setPrecios(r.precios))
        .catch(() => setPrecios(null));
      setProfiles(br.profiles);
      // Un servidor anterior al horario por día manda {weekday, weekend}: se
      // expande acá para que un rollback del backend no rompa toda la pantalla.
      setHours(Object.fromEntries(Object.entries(hrs.hours ?? {}).map(([k, local]) => {
        const l = local as Store & { weekday?: StorePeriod; weekend?: StorePeriod };
        if (l.dias) return [k, l];
        const semana = l.weekday ?? { open: "08:30", close: "17:30", closed: false };
        const finde = l.weekend ?? semana;
        return [k, { dias: { lun: semana, mar: semana, mie: semana, jue: semana, vie: semana, sab: finde, dom: finde }, excepciones: l.excepciones ?? [] }];
      })) as StoreHours);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la configuración");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  // El negocio de este servidor (R-29/R-30/R-32): sus locales para los
  // horarios y lo que todavía falta cargar para encender el bot.
  const negocio = useNegocio();

  // Entrar con la clave cruda deja `usuario` en null: esa llave ya abre todo.
  const usuario = useHub((s) => s.usuario);
  const esNivelMaximo = !usuario || usuario.rol === "admin";
  const esSoporte = !usuario || USUARIOS_DE_SOPORTE.includes(usuario.id);
  const [tab, setTab] = useState<TabAjustes>("negocio");
  const tabs = TABS_AJUSTES.filter((t) => (!t.soloAdmin || esNivelMaximo) && (!t.soloSoporte || esSoporte));

  if (cargando) {
    return <div className="p-6 text-[14px] text-text2">Cargando ajustes…</div>;
  }

  // `h-full overflow-y-auto` como el resto de las pantallas: sin esto la
  // pantalla se pasa del alto de <main> y no hay forma de bajar.
  return (
    <div className="h-full overflow-y-auto px-4 pb-10 md:px-8">
      <div className="mb-4 overflow-x-auto" data-tour="ajustes-tabs">
        <Segmented id="ajustes" valor={tab} onChange={setTab} opciones={tabs.map((t) => ({ valor: t.id, label: t.label }))} />
      </div>

      {error && (
        <div className="border border-line bg-surface mb-2.5 rounded-[8px] border border-[var(--color-signal)]/40 p-4 text-[13px] text-[var(--color-signal)]">
          {error}
        </div>
      )}

      {/* Lo que falta del cliente, arriba de todo y en cualquier pestaña: un
          bot que se enciende con datos [PENDIENTE] le inventa al cliente. Sin
          pendientes (Depot) la tarjeta no existe. */}
      {negocio.faltantes.length > 0 && <TarjetaDeArranque id={negocio.id} faltantes={negocio.faltantes} />}

      {tab === "negocio" && (
        <div className="flex flex-col gap-4">
          {/* El interruptor va primero: apagar el bot tiene que ser lo más
              fácil de encontrar en toda la pantalla. */}
          <BotPowerSwitch />
          {hours && <SeccionHorarios hours={hours} setHours={setHours} locales={negocio.locales} onError={setError} />}
          <SeccionVentaRegistrada onError={setError} />
          <SeccionAnuncios onError={setError} />
        </div>
      )}

      {tab === "seguimientos" && <FollowUpSettingsPanel />}

      {tab === "avisos" && (
        <div className="flex flex-col gap-4">
          <SeccionAsesores editable={esNivelMaximo} onError={setError} />
          <SeccionAvisoManana editable={esNivelMaximo} onError={setError} />
          <SeccionMatrizAvisos editable={esNivelMaximo} onError={setError} />
        </div>
      )}

      {tab === "usuarios" && esNivelMaximo && (
        <div className="flex flex-col gap-4">
          <SeccionUsuarios onError={setError} />
        </div>
      )}

      {tab === "bot" && esSoporte && (
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-text2">Solo soporte ve esta pestaña: el negocio no la tiene en su panel.</p>
          <SeccionGuardian onError={setError} />
          {precios && <SeccionPrecios precios={precios} setPrecios={setPrecios} onError={setError} />}
          {/* Catálogo y facturas por archivo (R-28): el cliente sin API —
              Mundillantas con Fénix— sube su Excel de cada día en «Inventario». */}
          <SeccionCatalogoArchivo onError={setError} />
          <SeccionFacturasArchivo onError={setError} />
          <SeccionMarcas profiles={profiles} setProfiles={setProfiles} onError={setError} />
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
    <section className="rounded-[10px] border border-line bg-surface px-5 pt-[18px] pb-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-[13px] font-semibold">{titulo}</p>
          {sub && <p className="text-[12px] text-text2">{sub}</p>}
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

/**
 * La lista de arranque del cliente (R-32): cada dato del perfil que todavía es
 * `[PENDIENTE]`. Sale de `/api/negocio` (`faltantes`); la lista completa, con
 * quién responde cada pregunta, vive en el doc de arranque del cliente.
 */
function TarjetaDeArranque({ id, faltantes }: { id: string; faltantes: string[] }) {
  return (
    <div className="mb-4">
      <Tarjeta
        titulo={`Falta para encender el bot · ${faltantes.length} ${faltantes.length === 1 ? "dato" : "datos"}`}
        sub="Datos del negocio que el cliente todavía no confirmó. Cuando se cargan en su perfil, desaparecen de aquí."
      >
        <ul className="flex flex-col gap-1.5">
          {faltantes.map((f) => (
            <li key={f} className="flex items-start gap-2 text-[12.5px]">
              <span className="mt-[5px] size-1.5 shrink-0 rounded-full bg-[var(--color-warn,#e8b33a)]" aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-text2">
          Lista completa en <code className="rounded bg-bg px-1">docs/clientes/{id}-arranque.md</code>
        </p>
      </Tarjeta>
    </div>
  );
}

const inputCls =
  "w-full rounded-[6px] border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-signal";

/**
 * Clase propia para los desplegables angostos: NO se puede reusar `inputCls`
 * con un `w-auto` encima, porque las dos utilidades de ancho pesan igual y gana
 * la que Tailwind deje última en la hoja — el select salía del ancho de la
 * tarjeta y empujaba el resto de la fila fuera de la pantalla.
 */
const selectCls =
  "shrink-0 rounded-[6px] border border-line bg-surface px-2 py-2 text-[13px] outline-none focus:border-signal";


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
 * contradicciones) y la corrige si hace falta. Siempre prendido: Manuel quitó
 * el interruptor del panel (24-oct) — apagarlo para ahorrar dejaba pasar los
 * errores que el cliente sí ve.
 */
function SeccionGuardian({ onError }: { onError: (v: string) => void }) {
  const [estado, setEstado] = useState<GuardianEstado | null>(null);
  const [hallazgos, setHallazgos] = useState<GuardianHallazgo[] | null>(null);
  const [abriendo, setAbriendo] = useState(false);

  useEffect(() => {
    api<GuardianEstado & { ok: boolean }>("/api/guardian")
      .then((r) => setEstado(r))
      .catch(() => setEstado(null));
  }, []);

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
    sub="Una IA revisa cada respuesta antes de enviarla: precios contra la cotización real, preguntas repetidas, contradicciones. Corrige el error antes de que el cliente lo vea y lo deja documentado."
  >
    {!estado && <p className="text-[12px] text-text2">Cargando el estado del guardián…</p>}
    {estado && <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
        <span><span className="text-text2">Modelo revisor:</span> <b>{estado.modelo}</b></span>
        <span><span className="text-text2">Últimos 7 días:</span> <b>{estado.semana.revisiones}</b> revisiones · <b>{estado.semana.correcciones}</b> corregidas · <b>{estado.semana.hallazgos}</b> hallazgos</span>
        <button onClick={() => void verInforme()} disabled={abriendo} className="rounded-full bg-bg px-2.5 py-1 text-[12px] font-semibold hover:bg-bg disabled:opacity-50">
          {abriendo ? "Cargando…" : hallazgos ? "Ocultar informe" : "Ver informe de la semana"}
        </button>
      </div>
      {hallazgos && !hallazgos.length && <p className="mt-2 text-[12px] text-text2">Sin hallazgos esta semana{activo ? "" : " (el guardián estuvo apagado)"}.</p>}
      {hallazgos && hallazgos.length > 0 && <div className="mt-2 max-h-64 overflow-y-auto rounded-[6px] bg-bg p-2.5">
        {hallazgos.map((h, i) => <div key={i} className="mb-2 border-b border-line pb-2 text-[12px] last:mb-0 last:border-0 last:pb-0">
          <span className={`mr-2 rounded-full px-2 py-0.5 text-[12px] font-semibold ${
            h.severidad === "alta" ? "bg-[var(--color-danger,#e2564d)]/20 text-[var(--color-danger,#e2564d)]"
            : h.severidad === "media" ? "bg-[var(--color-warn,#e8b33a)]/20 text-[var(--color-warn,#e8b33a)]"
            : "bg-bg text-text2"}`}>{h.severidad}</span>
          <b>{h.categoria}</b> · <a className="underline" href={`#/ticket/${h.conversationId}`}>chat #{h.conversationId}</a>
          {h.veredicto === "corregir" && <span className="ml-1 text-ok">corregido antes de enviar</span>}
          <p className="mt-0.5 text-text2">{h.detalle}</p>
          <p className="text-[12px] text-text2">{new Date(h.fecha).toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        </div>)}
      </div>}
    </>}
  </Tarjeta>;
}

function SeccionVentaRegistrada({ onError }: { onError: (v: string) => void }) {
  const { registroVenta, cambiarExigirVentaRegistrada } = useHub();
  const [cambiando, setCambiando] = useState(false);
  const exige = registroVenta?.confirmarGanado ?? true;
  const cambiar = async () => {
    setCambiando(true);
    try {
      await cambiarExigirVentaRegistrada(!exige);
      onError("");
    } catch (e) { onError(e instanceof Error ? e.message : "No se pudo guardar el ajuste"); }
    finally { setCambiando(false); }
  };
  return <Tarjeta
    titulo="Ganado = venta confirmada"
    sub="Encendido (lo normal), cerrar un ticket como ganado pide «El cliente llegó y compró» más el número de factura y el monto, siempre: sin ellos se espera para cerrar. Si el cliente compra dos veces, el ticket ganado admite otra factura. Así ganado y venta registrada son lo mismo. El bot nunca cierra como ganado: si el cliente dice «ya compré», queda por confirmar. Apagarlo vuelve al cierre libre de antes: solo para una emergencia."
    extra={registroVenta
      ? <button
          onClick={() => void cambiar()}
          disabled={cambiando}
          className={`rounded-full px-4 py-2 text-[12px] font-semibold disabled:opacity-50 ${
            exige ? "bg-ok text-text" : "bg-bg text-text2 hover:bg-bg"
          }`}
        >{cambiando ? "Cambiando…" : exige ? "● Prendido" : "○ Apagado"}</button>
      : null}
  >
    {!registroVenta && <p className="text-[12px] text-text2">Cargando el ajuste…</p>}
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
    extra={<button onClick={() => void actualizar()} disabled={sync} className="rounded-full bg-ok px-4 py-2 text-[12px] font-semibold text-text disabled:opacity-50">{sync ? "Actualizando…" : listo ? "Actualizado" : "Actualizar ahora"}</button>}
  >
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
      <span><span className="text-text2">Última actualización:</span> <b className={viejo ? "text-[var(--color-warn,#e8b33a)]" : ""}>{cuando}</b></span>
      <span><span className="text-text2">Productos:</span> <b>{precios.productos}</b></span>
    </div>
    {sync && <p className="mt-2 text-[12px] text-text2">Consultando las medidas del Interbot; toma unos segundos.</p>}
    {precios.error && <p className="mt-2 text-[12px] text-[var(--color-danger,#e2564d)]">Último error: {precios.error}</p>}
  </Tarjeta>;
}

/** Feriados y cierres puntuales, por local. Cada uno puede tener los suyos. */
function Excepciones({ store, label, data, onChange }: { store: string; label: string; data: Store; onChange: (v: Store) => void }) {
  // El backend viejo no manda `excepciones`: durante un deploy escalonado el
  // panel tiene que seguir abriendo.
  const lista = data.excepciones ?? [];
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
  const set = (i: number, patch: Partial<StoreException>) =>
    onChange({ ...data, excepciones: lista.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  return <div className="mt-3 border-t border-line pt-3">
    <div className="flex items-center justify-between">
      <p className="text-[12px] font-semibold text-text2">Casos especiales</p>
      <button
        onClick={() => onChange({ ...data, excepciones: [...lista, { fecha: hoy, motivo: "", open: data.dias.lun.open, close: data.dias.lun.close, closed: false }] })}
        className="rounded-full bg-bg px-2.5 py-1 text-[12px] font-semibold hover:bg-bg"
      >+ Agregar</button>
    </div>
    {!lista.length && <p className="mt-1.5 text-[12px] text-text2">Sin feriados ni cierres cargados para {label}.</p>}
    {lista.map((e, i) => <div key={`${store}-${i}`} className="mt-2 rounded-[6px] bg-bg p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[12px]">Fecha<input type="date" className={inputCls} value={e.fecha} onChange={(ev) => set(i, { fecha: ev.target.value })} /></label>
        <label className="text-[12px]">Motivo<input type="text" maxLength={60} placeholder="Feriado, inventario…" className={inputCls} value={e.motivo} onChange={(ev) => set(i, { motivo: ev.target.value })} /></label>
        <label className="text-[12px]">Abre<input type="time" disabled={e.closed} className={inputCls} value={e.open} onChange={(ev) => set(i, { open: ev.target.value })} /></label>
        <label className="text-[12px]">Cierra<input type="time" disabled={e.closed} className={inputCls} value={e.close} onChange={(ev) => set(i, { close: ev.target.value })} /></label>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-2 text-[12px] font-semibold"><input type="checkbox" checked={e.closed} onChange={(ev) => set(i, { closed: ev.target.checked })} /> Cerrado todo el día</label>
        <button onClick={() => onChange({ ...data, excepciones: lista.filter((_, j) => j !== i) })} className="text-[12px] font-semibold text-text2 hover:text-[var(--color-danger,#e2564d)]">Quitar</button>
      </div>
    </div>)}
  </div>;
}

/**
 * Qué locales se listan en Horarios (R-30). Antes eran Cumbayá y Quito Sur
 * escritos a mano: un negocio con uno o tres locales no podía cargar los
 * suyos. Ahora salen del negocio (`claveHorario` + `nombreCorto`), y una clave
 * guardada que el negocio no nombra se muestra igual con su clave como nombre —
 * mejor verla rara que perderla en silencio.
 */
function localesDeHorarios(hours: StoreHours, locales: LocalDelNegocio[]): Array<[string, string]> {
  const delNegocio = locales
    .filter((l) => hours[l.claveHorario])
    .map((l) => [l.nombreCorto, l.claveHorario] as [string, string]);
  const nombradas = new Set(delNegocio.map(([, clave]) => clave));
  const sueltas = Object.keys(hours)
    .filter((clave) => !nombradas.has(clave))
    .map((clave) => [clave, clave] as [string, string]);
  return [...delNegocio, ...sueltas];
}

function SeccionHorarios({ hours, setHours, locales, onError }: { hours: StoreHours; setHours: (v: StoreHours) => void; locales: LocalDelNegocio[]; onError: (v: string) => void }) {
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const result = await api<{ hours: StoreHours }>("/api/store-hours", { method: "PUT", body: JSON.stringify(hours) });
      setHours(result.hours); onError("");
    } catch (e) { onError(e instanceof Error ? e.message : "No se pudieron guardar los horarios"); }
    finally { setSaving(false); }
  };
  return <Tarjeta titulo="Horarios de locales" sub="El bot usa estos horarios al recomendar un local. Marca Cerrado cuando no atienda, y carga los feriados o cierres puntuales en Casos especiales — el bot los avisa cuando el cliente pregunta por esos días." extra={<button onClick={() => void save()} disabled={saving} className="rounded-full bg-ok px-4 py-2 text-[12px] font-semibold text-text disabled:opacity-50">{saving ? "Guardando…" : "Guardar horarios"}</button>}>
    <div className="grid gap-4 md:grid-cols-2">{localesDeHorarios(hours, locales).map(([label, store]) => {
      const local = hours[store];
      const setDia = (dia: Dia, patch: Partial<StorePeriod>) => setHours({ ...hours, [store]: { ...local, dias: { ...local.dias, [dia]: { ...local.dias[dia], ...patch } } } });
      // Copia el tramo del lunes a martes–viernes; sábado y domingo no se tocan.
      const copiarLunes = () => setHours({ ...hours, [store]: { ...local, dias: { ...local.dias, mar: local.dias.lun, mie: local.dias.lun, jue: local.dias.lun, vie: local.dias.lun } } });
      return <div key={store} className="rounded-[8px] bg-bg p-4">
        <div className="flex items-center justify-between"><p className="text-[14px] font-semibold">{label}</p><button onClick={copiarLunes} className="rounded-full bg-surface px-2.5 py-1 text-[12px] font-semibold">Copiar lunes a martes–viernes</button></div>
        {DIAS_SEMANA.map(([dia, dayLabel]) => { const value = local.dias[dia]; return <div key={dia} className="mt-3 grid grid-cols-[84px_1fr_1fr_auto] items-end gap-2"><p className="pb-2 text-[12px] font-semibold text-text2">{dayLabel}</p><label className="text-[12px]">Abre<input type="time" disabled={value.closed} className={inputCls} value={value.open} onChange={(e) => setDia(dia, { open: e.target.value })} /></label><label className="text-[12px]">Cierra<input type="time" disabled={value.closed} className={inputCls} value={value.close} onChange={(e) => setDia(dia, { close: e.target.value })} /></label><label className="flex items-center gap-1.5 pb-2 text-[12px] font-semibold"><input type="checkbox" checked={value.closed} onChange={(e) => setDia(dia, { closed: e.target.checked })} /> Cerrado</label></div>; })}
        <Excepciones store={store} label={label} data={local} onChange={(v) => setHours({ ...hours, [store]: v })} />
      </div>;
    })}</div>
  </Tarjeta>;
}

type RolAsesor = string;

interface NivelAviso { id: string; nombre: string; eventos: string[]; generales: string[] }
interface CatalogoAvisos {
  catalogo: { id: string; nombre: string; eventos: { id: string; nombre: string }[] }[];
  generales: { id: string; nombre: string }[];
  /** Cada aviso suelto, en orden, con su línea de qué es (19-nov). */
  avisos?: AvisoDelCatalogo[];
}
interface AvisoDelCatalogo { id: string; tipo: "evento" | "general"; clave: string; nombre: string; descripcion: string; grupo: string }

/**
 * Los niveles los usan dos tarjetas (el selector de cada asesor y la tabla de
 * qué recibe cada nivel): un mismo estado para que renombrar o crear un nivel
 * se vea al instante en las dos, sin recargar.
 */
let nivelesCompartidos: NivelAviso[] | null = null;
let catalogoCompartido: CatalogoAvisos | null = null;
const oyentesNiveles = new Set<() => void>();
function publicarNiveles(n: NivelAviso[], c?: CatalogoAvisos) {
  nivelesCompartidos = n;
  if (c) catalogoCompartido = c;
  oyentesNiveles.forEach((f) => f());
}
function useNivelesAviso(onError: (e: string) => void) {
  const [, refrescar] = useState(0);
  useEffect(() => {
    const oyente = () => refrescar((x) => x + 1);
    oyentesNiveles.add(oyente);
    if (!nivelesCompartidos) {
      api<{ niveles: NivelAviso[] } & CatalogoAvisos>("/api/aviso-niveles")
        .then((r) => publicarNiveles(r.niveles, { catalogo: r.catalogo, generales: r.generales, avisos: r.avisos }))
        .catch((e) => onError(e instanceof Error ? e.message : "No se pudieron cargar los niveles de aviso"));
    }
    return () => { oyentesNiveles.delete(oyente); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { niveles: nivelesCompartidos, catalogo: catalogoCompartido };
}

interface Asesor {
  id: number;
  nombre: string;
  telefono: string;
  prioridad: number;
  active: boolean;
  rol: RolAsesor;
}

/** `settings.asesores_por_local`: `{ [slugDeLocal]: advisorIds }`. */
type AsignacionesPorLocal = Record<string, number[]>;
interface LocalAsignable { slug: string; nombreCorto: string }

/**
 * Quién recibe los avisos del bot. Cada aviso sale a TODOS los activos a
 * quienes les corresponda por su nivel, en orden de prioridad (0 = principal).
 *
 * Con las casillas de local (R-34), los avisos de un chat que ya eligió local
 * van solo a los marcados en ese local. Un local sin nadie marcado avisa a
 * todos, como siempre: así Depot, que no marca nada, no cambia.
 */
function SeccionAsesores({ editable, onError }: { editable: boolean; onError: (e: string) => void }) {
  const [asesores, setAsesores] = useState<Asesor[]>([]);
  const [asignaciones, setAsignaciones] = useState<AsignacionesPorLocal>({});
  const [locales, setLocales] = useState<LocalAsignable[]>([]);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  // Quien se da de alta desde aquí de ahora en adelante suele ser gente del
  // local: arranca en el Nivel 2 si existe, si no en el primero.
  const { niveles } = useNivelesAviso(onError);
  const nivelInicial = niveles?.find((n) => n.id === "asesor")?.id ?? niveles?.[0]?.id ?? "asesor";
  const [rol, setRol] = useState<RolAsesor>("");
  const rolElegido = rol || nivelInicial;
  const opcionesNivel = (actual?: string) => {
    const lista = niveles ?? [];
    // Un asesor en un nivel que ya no está se muestra igual, para no mentir.
    const conActual = actual && !lista.some((n) => n.id === actual) ? [...lista, { id: actual, nombre: `${actual} (borrado)` }] : lista;
    return conActual.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>);
  };

  const cargar = useCallback(async () => {
    try {
      setAsesores((await api<{ asesores: Asesor[] }>("/api/advisors")).asesores);
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudieron cargar los asesores");
    }
    // Aparte y sin bloquear: un servidor anterior a R-34 no tiene la ruta, y la
    // lista de asesores tiene que verse igual (sin la columna de locales).
    api<{ asignaciones: AsignacionesPorLocal; locales: LocalAsignable[] }>("/api/asesores-por-local")
      .then((r) => { setAsignaciones(r.asignaciones); setLocales(r.locales); })
      .catch(() => { setAsignaciones({}); setLocales([]); });
  }, [onError]);
  useEffect(() => { void cargar(); }, [cargar]);

  /** Marca o desmarca un asesor en un local; si el servidor lo rechaza, vuelve atrás. */
  const asignar = async (slug: string, id: number, marcar: boolean) => {
    const antes = asignaciones;
    const actuales = asignaciones[slug] ?? [];
    const ids = marcar ? [...new Set([...actuales, id])] : actuales.filter((x) => x !== id);
    const siguiente = { ...asignaciones, [slug]: ids };
    if (!ids.length) delete siguiente[slug];
    setAsignaciones(siguiente);
    try {
      const r = await api<{ asignaciones: AsignacionesPorLocal }>("/api/asesores-por-local", {
        method: "PUT", body: JSON.stringify({ asignaciones: siguiente }),
      });
      setAsignaciones(r.asignaciones);
      onError("");
    } catch (e) {
      setAsignaciones(antes);
      onError(e instanceof Error ? e.message : "No se pudo guardar el local del asesor");
    }
  };

  const agregar = async () => {
    const soloDigitos = telefono.replace(/\D/g, "");
    if (!nombre.trim() || soloDigitos.length < 8) {
      onError("Hace falta el nombre y el teléfono con código de país");
      return;
    }
    try {
      await api("/api/advisors", {
        method: "POST",
        body: JSON.stringify({ nombre: nombre.trim(), telefono: soloDigitos, prioridad: asesores.length, rol: rolElegido }),
      });
      setNombre(""); setTelefono(""); setRol(""); await cargar();
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
      sub="El bot avisa por WhatsApp a los de esta lista. El nivel de cada número decide qué avisos le llegan; los niveles se crean y se ajustan en la tarjeta de abajo."
    >
      {locales.length > 0 && (
        <p className="mb-2 rounded-[6px] bg-bg p-2.5 text-[12px] text-text2">
          <b>Locales:</b> cuando el cliente ya eligió local, el aviso va solo a quienes estén marcados en ese local.
          Un local sin nadie marcado avisa a todos. Antes de que el cliente elija local, avisa a todos.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {asesores.map((a) => (
          <div key={a.id} className="flex flex-col gap-2 rounded-[8px] border border-line bg-bg p-3">
          <div className="flex items-center gap-2">
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
            <span className="tnum shrink-0 text-[12px] text-text2">+{a.telefono}</span>
            <select
              value={a.rol}
              onChange={(e) => void cambiar(a, { rol: e.target.value })}
              aria-label={`Nivel de ${a.nombre}`}
              className={`${selectCls} py-1.5 text-[12px] ${a.active ? "" : "opacity-50"}`}
            >
              {opcionesNivel(a.rol)}
            </select>
            <button
              onClick={() => void quitar(a.id)}
              className="shrink-0 rounded-[6px] px-2 py-1 text-[16px] leading-none text-text2 hover:text-[var(--color-signal)]"
              title="Quitar"
            >×</button>
          </div>
          {locales.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-6 text-[12px]">
              <span className="text-text2">Atiende en:</span>
              {locales.map((l) => (
                <label key={l.slug} className="flex items-center gap-1.5" title={editable ? undefined : "Solo un administrador puede cambiarlo"}>
                  <input
                    type="checkbox"
                    aria-label={`${a.nombre} atiende en ${l.nombreCorto}`}
                    // `advisors.id` es bigint: `/api/advisors` lo manda como
                    // texto ("1") y la asignación guarda números.
                    checked={(asignaciones[l.slug] ?? []).includes(Number(a.id))}
                    disabled={!editable}
                    onChange={(e) => void asignar(l.slug, Number(a.id), e.target.checked)}
                    className="size-3.5 accent-[var(--color-ok)] disabled:opacity-40"
                  />
                  {l.nombreCorto}
                </label>
              ))}
            </div>
          )}
          </div>
        ))}
        {!asesores.length && (
          <p className="rounded-[8px] border border-dashed border-[var(--color-signal)]/40 p-4 text-center text-[12px] text-[var(--color-signal)]">
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
          value={rolElegido} onChange={(e) => setRol(e.target.value)}
          aria-label="Nivel del nuevo asesor"
          className={selectCls}
        >
          {opcionesNivel()}
        </select>
        <button onClick={() => void agregar()}
          className="shrink-0 rounded-[6px] bg-bg px-4 text-[12px] font-semibold hover:bg-bg">
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
      <div className="flex flex-col gap-4">
        {profiles.map((p) => (
          <div key={p.brand} className="rounded-[8px] border border-line bg-bg p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="serif text-[15px]">{p.brand}</span>
              <label className="flex items-center gap-1.5 text-[12px] text-text2">
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
                <span className="text-[12px] text-text2">Etiqueta en la pieza</span>
                <input
                  value={p.tag} placeholder="Ej. MEJOR EQUILIBRIO"
                  onChange={(e) => editar(p.brand, { tag: e.target.value })}
                  onBlur={() => void guardar(p)} className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] text-text2">Frase de posicionamiento</span>
                <textarea
                  value={p.posicionamiento} rows={2}
                  onChange={(e) => editar(p.brand, { posicionamiento: e.target.value })}
                  onBlur={() => void guardar(p)} className={`${inputCls} resize-y`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] text-text2">
                  Notas para el bot — solo esto puede afirmar de la marca
                </span>
                <textarea
                  value={p.notasIa} rows={2}
                  onChange={(e) => editar(p.brand, { notasIa: e.target.value })}
                  onBlur={() => void guardar(p)} className={`${inputCls} resize-y`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] text-text2">Fuente verificable (opcional)</span>
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

// ---------------------------------------------------------------------------

interface AvisoMananaConfig { activo: boolean; hora: string; plantilla: string; idioma: string }
interface AvisoMananaResultado { dia: string; enviadoEn: string; total: number; enviados: number; fallos: { nombre: string; error: string }[]; manual: boolean }
interface AvisoMananaEstado {
  config: AvisoMananaConfig;
  resultado: AvisoMananaResultado | null;
  enMeta: { status: string; category: string } | null;
  errorMeta: string | null;
}

const ESTADO_PLANTILLA: Record<string, string> = {
  APPROVED: "Aprobada en Meta", PENDING: "En revisión en Meta", IN_APPEAL: "En apelación",
  REJECTED: "Rechazada por Meta", PAUSED: "Pausada por Meta", DISABLED: "Desactivada por Meta",
};

/**
 * El mensaje de la mañana a los asesores (19-nov-2026). WhatsApp solo deja
 * avisarle a quien le escribió al bot en las últimas 24 h; esta plantilla, con
 * un solo botón «Listo», abre esa ventana cada día con un toque. Se guarda al
 * tocar, como el guardián.
 */
function SeccionAvisoManana({ editable, onError }: { editable: boolean; onError: (e: string) => void }) {
  const [estado, setEstado] = useState<AvisoMananaEstado | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = () => api<AvisoMananaEstado & { ok: boolean }>("/api/aviso-manana")
    .then(setEstado).catch((e) => onError(e instanceof Error ? e.message : "No se pudo cargar el aviso de la mañana"));
  useEffect(() => { void cargar(); }, []);

  const guardar = async (cambio: Partial<AvisoMananaConfig>) => {
    if (!estado) return;
    const config = { ...estado.config, ...cambio };
    setEstado({ ...estado, config });
    try { await api("/api/aviso-manana", { method: "PUT", body: JSON.stringify(config) }); }
    catch (e) { onError(e instanceof Error ? e.message : "No se pudo guardar"); void cargar(); }
  };

  const enviarAhora = async () => {
    setEnviando(true);
    try { await api("/api/aviso-manana/enviar", { method: "POST" }); await cargar(); }
    catch (e) { onError(e instanceof Error ? e.message : "No se pudo enviar"); }
    finally { setEnviando(false); }
  };

  const r = estado?.resultado;
  const aprobada = estado?.enMeta?.status === "APPROVED";
  return <Tarjeta
    titulo="Mensaje de la mañana a los asesores"
    sub="Cada mañana a cada asesor le llega un mensaje con un botón «Listo». Al tocarlo, WhatsApp le deja recibir todos los avisos del bot durante 24 h. Cuesta ~1 centavo por asesor al día."
  >
    {!estado && <p className="text-[12px] text-text2">Cargando…</p>}
    {estado && <div className="flex flex-col gap-3 text-[12px]">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" className="size-4 accent-[var(--color-ok)]" checked={estado.config.activo} disabled={!editable}
            onChange={(e) => void guardar({ activo: e.target.checked })} />
          {estado.config.activo ? "Encendido" : "Apagado"}
        </label>
        <label className="flex items-center gap-2">
          <span className="text-text2">Hora</span>
          <input type="time" className="settings-input w-auto" value={estado.config.hora} disabled={!editable}
            onChange={(e) => e.target.value && void guardar({ hora: e.target.value })} />
        </label>
        <span>
          <span className="text-text2">Plantilla:</span> <b>{estado.config.plantilla}</b>{" · "}
          <span className={aprobada ? "text-ok" : "text-[var(--color-warn,#e8b33a)]"}>
            {estado.errorMeta ? "no se pudo consultar Meta" : estado.enMeta ? (ESTADO_PLANTILLA[estado.enMeta.status] ?? estado.enMeta.status) : "no existe en Meta"}
          </span>
        </span>
      </div>
      {!aprobada && !estado.errorMeta && <p className="text-[var(--color-warn,#e8b33a)]">Mientras Meta no la apruebe, el mensaje no le llega a nadie.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-text2">
          {r
            ? `Último envío: ${new Date(r.enviadoEn).toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · ${r.enviados} de ${r.total} asesores${r.manual ? " (a mano)" : ""}`
            : "Todavía no se ha enviado ninguno."}
        </span>
        {editable && <button onClick={() => void enviarAhora()} disabled={enviando}
          className="rounded-full bg-bg px-2.5 py-1 font-semibold disabled:opacity-50">{enviando ? "Enviando…" : "Enviar ahora"}</button>}
      </div>
      {r && r.fallos.length > 0 && <div className="rounded-[6px] bg-bg p-2.5">
        {r.fallos.map((f) => <p key={f.nombre}><b>{f.nombre}:</b> <span className="text-text2">{f.error}</span></p>)}
      </div>}
    </div>}
  </Tarjeta>;
}

/**
 * Qué recibe cada nivel, aviso por aviso. Los niveles se crean, se renombran y
 * se borran aquí (Manuel, 24-oct: «Todo» y «Solo local» confundían; mejor
 * Nivel 1, Nivel 2 y poder crear más). Cada casilla guarda al soltarla; si el
 * servidor la rechaza, la tabla vuelve a como estaba para no mentir.
 */
function SeccionMatrizAvisos({ editable, onError }: { editable: boolean; onError: (e: string) => void }) {
  const { niveles, catalogo } = useNivelesAviso(onError);
  const [nombres, setNombres] = useState<Record<string, string>>({});

  const guardar = async (siguiente: NivelAviso[]) => {
    const antes = niveles;
    publicarNiveles(siguiente);
    try {
      const r = await api<{ niveles: NivelAviso[] }>("/api/aviso-niveles", {
        method: "PUT", body: JSON.stringify({ niveles: siguiente }),
      });
      publicarNiveles(r.niveles);
      onError("");
    } catch (e) {
      if (antes) publicarNiveles(antes);
      onError(e instanceof Error ? e.message : "No se pudieron guardar los niveles");
    }
  };

  if (!niveles || !catalogo) {
    return <Tarjeta titulo="Qué recibe cada nivel"><p className="text-[12px] text-text2">Cargando los niveles…</p></Tarjeta>;
  }

  const cambiarEventos = (nivelId: string, ids: string[], marcar: boolean) => void guardar(niveles.map((n) => n.id !== nivelId ? n : {
    ...n, eventos: marcar ? [...new Set([...n.eventos, ...ids])] : n.eventos.filter((e) => !ids.includes(e)),
  }));
  const cambiarGeneral = (nivelId: string, id: string, marcar: boolean) => void guardar(niveles.map((n) => n.id !== nivelId ? n : {
    ...n, generales: marcar ? [...new Set([...n.generales, id])] : n.generales.filter((g) => g !== id),
  }));
  const agregarNivel = () => {
    let k = niveles.length + 1;
    while (niveles.some((n) => n.id === `nivel-${k}`)) k++;
    void guardar([...niveles, { id: `nivel-${k}`, nombre: `Nivel ${k}`, eventos: [], generales: [] }]);
  };
  const renombrar = (n: NivelAviso) => {
    const nuevo = (nombres[n.id] ?? n.nombre).trim();
    setNombres((x) => { const y = { ...x }; delete y[n.id]; return y; });
    if (nuevo && nuevo !== n.nombre) void guardar(niveles.map((x) => (x.id === n.id ? { ...x, nombre: nuevo } : x)));
  };
  const borrar = (n: NivelAviso) => void guardar(niveles.filter((x) => x.id !== n.id));

  const columnas = `minmax(220px,1fr) repeat(${niveles.length}, 96px)`;
  const Casilla = ({ checked, indeterminado = false, onChange, etiqueta }: { checked: boolean; indeterminado?: boolean; onChange: (v: boolean) => void; etiqueta: string }) => (
    <label className="flex justify-center" title={editable ? undefined : "Solo un administrador puede cambiarlo"}>
      <input
        type="checkbox" aria-label={etiqueta}
        checked={checked}
        ref={(el) => { if (el) el.indeterminate = indeterminado; }}
        disabled={!editable}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-ok)] disabled:opacity-40"
      />
    </label>
  );

  return (
    <Tarjeta
      titulo="Qué recibe cada nivel"
      sub="Cada mensaje que manda el bot tiene su casilla. Marca, nivel por nivel, cuáles le llegan. Cada casilla se guarda sola."
    >
      <div className="overflow-x-auto">
        <div className="flex min-w-max flex-col gap-2">
          <div className="grid items-end gap-2 px-3 text-[12px] font-semibold text-text2" style={{ gridTemplateColumns: columnas }}>
            <span>Tipo de aviso</span>
            {niveles.map((n) => (
              <div key={n.id} className="flex items-center gap-1">
                <input
                  value={nombres[n.id] ?? n.nombre}
                  disabled={!editable}
                  aria-label={`Nombre de ${n.nombre}`}
                  onChange={(e) => setNombres((x) => ({ ...x, [n.id]: e.target.value }))}
                  onBlur={() => renombrar(n)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-full min-w-0 rounded-[4px] bg-transparent px-1 py-0.5 text-center font-semibold text-text hover:bg-bg focus:bg-bg focus:outline-none disabled:hover:bg-transparent"
                />
                {editable && niveles.length > 1 && (
                  <button onClick={() => borrar(n)} aria-label={`Borrar ${n.nombre}`} title={`Borrar ${n.nombre}`}
                    className="shrink-0 rounded px-1 text-[14px] leading-none text-text2 hover:text-[var(--color-signal)]">×</button>
                )}
              </div>
            ))}
          </div>

          {/* CADA AVISO ES SU FILA (Manuel, 19-nov): nombre, una línea de qué es
              y una casilla por nivel. Los grupos solo ordenan: no se pliegan. */}
          {(() => {
            const avisos: AvisoDelCatalogo[] = catalogo.avisos ?? [
              ...catalogo.catalogo.flatMap((c) => c.eventos.map((e) => ({ id: `evento:${e.id}`, tipo: "evento" as const, clave: e.id, nombre: e.nombre, descripcion: "", grupo: c.nombre }))),
              ...catalogo.generales.map((g) => ({ id: `general:${g.id}`, tipo: "general" as const, clave: g.id, nombre: g.nombre, descripcion: "", grupo: "Avisos generales" })),
            ];
            const grupos = [...new Set(avisos.map((a) => a.grupo))];
            const marcado = (n: NivelAviso, a: AvisoDelCatalogo) => a.tipo === "evento" ? n.eventos.includes(a.clave) : n.generales.includes(a.clave);
            const cambiar = (n: NivelAviso, a: AvisoDelCatalogo, v: boolean) => a.tipo === "evento" ? cambiarEventos(n.id, [a.clave], v) : cambiarGeneral(n.id, a.clave, v);
            return grupos.map((grupo) => (
              <div key={grupo} className="rounded-[8px] border border-line bg-bg">
                <p className="px-3 pt-3 pb-1 text-[12.5px] font-semibold">{grupo}</p>
                {avisos.filter((a) => a.grupo === grupo).map((a) => (
                  <div key={a.id} className="grid items-center gap-2 border-t border-line px-3 py-2" style={{ gridTemplateColumns: columnas }}>
                    <div className="min-w-0">
                      <p className="text-[12.5px] text-text">{a.nombre}</p>
                      {a.descripcion && <p className="mt-0.5 text-[11.5px] leading-snug text-text2">{a.descripcion}</p>}
                    </div>
                    {niveles.map((n) => (
                      <Casilla key={n.id} etiqueta={`${a.nombre} para ${n.nombre}`} checked={marcado(n, a)}
                        onChange={(v) => cambiar(n, a, v)} />
                    ))}
                  </div>
                ))}
              </div>
            ));
          })()}
        </div>
      </div>
      {editable && (
        <button onClick={agregarNivel} className="mt-3 rounded-[6px] border border-line-strong px-3 py-1.5 text-[12px] font-semibold hover:bg-bg">
          + Agregar nivel
        </button>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------

interface PermisosHub {
  verInbox: boolean; verKanban: boolean; verOportunidades: boolean; verMetricas: boolean;
  verFinanzas: boolean; usarCotizador: boolean; verAjustes: boolean; verErrores: boolean; validarNumeros?: boolean;
}

interface UsuarioHub {
  id: string;
  nombre: string;
  rol: "admin" | "asesor";
  permisos: PermisosHub;
  /** Para avisos del bot y recuperar la clave. Lo deja el usuario al activar. */
  email: string | null;
  estadoClave: "compartida" | "propia" | "pendiente";
  /** Cuenta pendiente con enlace de invitación vigente (19-nov). */
  invitacionVigente?: boolean;
}

/**
 * El enlace que se le manda a la persona: abre el login con su usuario elegido
 * y el código que deja crear su clave. Se arma aquí, con la dirección con la
 * que el administrador está viendo el panel, así sirve igual en cada cliente.
 */
function enlaceDeInvitacion(id: string, codigo: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?usuario=${encodeURIComponent(id)}&invitacion=${encodeURIComponent(codigo)}`;
}

const ESTADO_CLAVE_UI: Record<UsuarioHub["estadoClave"], { label: string; explica: string }> = {
  compartida: { label: "clave compartida", explica: "Entra con la clave común de siempre (los cuatro originales)." },
  propia: { label: "clave propia", explica: "Ya creó su clave personal; solo esa clave abre." },
  pendiente: { label: "pendiente", explica: "Todavía no entra: en el login elige su nombre, crea su clave y deja su email." },
};

/** Cada interruptor en el idioma de las pestañas que abre o esconde. */
const PERMISOS_UI: { id: keyof PermisosHub; label: string }[] = [
  { id: "verInbox", label: "Inbox" },
  { id: "verKanban", label: "Pipeline" },
  { id: "usarCotizador", label: "Cotizador" },
  { id: "verMetricas", label: "Métricas" },
  { id: "verFinanzas", label: "Cifras de venta ($)" },
  { id: "verAjustes", label: "Ajustes" },
  { id: "validarNumeros", label: "Validar números" },
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
  // El enlace de invitación recién creado, por usuario. Existe solo en este
  // momento: el servidor no lo guarda en claro y no lo puede volver a dar.
  const [enlaces, setEnlaces] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState<string | null>(null);
  const yo = useHub((s) => s.usuario);
  const conEnlace = (id: string, codigo?: string) => {
    if (codigo) setEnlaces((x) => ({ ...x, [id]: enlaceDeInvitacion(id, codigo) }));
  };
  const copiar = async (id: string) => {
    try {
      await navigator.clipboard.writeText(enlaces[id]);
      setCopiado(id);
    } catch {
      onError("No se pudo copiar: selecciona el enlace y cópialo a mano.");
    }
  };

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
      const id = username.trim().toLowerCase();
      const r = await api<{ invitacion?: string }>("/api/hub-users", {
        method: "POST",
        body: JSON.stringify({ id, nombre: nombre.trim(), rol }),
      });
      conEnlace(id, r.invitacion);
      setUsername(""); setNombre(""); setRol("asesor");
      onError("");
      await cargar();
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo crear el usuario");
    }
  };

  const cambiar = async (u: UsuarioHub, patch: Partial<Omit<UsuarioHub, "id" | "permisos" | "estadoClave">> & { permisos?: Partial<PermisosHub> }) => {
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

  /** La cuenta vuelve a pendiente: la persona crea su clave de nuevo al entrar. */
  const restablecer = async (id: string) => {
    try {
      const r = await api<{ usuario: UsuarioHub; invitacion?: string }>(`/api/hub-users/${encodeURIComponent(id)}/reset-clave`, { method: "POST" });
      setUsuarios(usuarios.map((u) => (u.id === id ? r.usuario : u)));
      conEnlace(id, r.invitacion);
      onError("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo restablecer la clave");
    }
  };

  /** Otro enlace para una cuenta pendiente (el anterior deja de servir). */
  const nuevoEnlace = async (id: string) => {
    try {
      const r = await api<{ usuario: UsuarioHub; invitacion?: string }>(`/api/hub-users/${encodeURIComponent(id)}/invitacion`, { method: "POST" });
      setUsuarios(usuarios.map((u) => (u.id === id ? r.usuario : u)));
      conEnlace(id, r.invitacion);
      onError("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo crear el enlace");
    }
  };

  return (
    <Tarjeta
      titulo="Usuarios del panel"
      sub="Quién sale en el desplegable del login y qué pestañas ve. Una cuenta nueva entra eligiendo su nombre en el login y creando su clave: basta con mandarle la dirección del panel. El enlace de invitación es opcional (le deja el nombre ya elegido). Si alguien olvida su clave, «Restablecer clave» le deja crear una nueva. Los cambios de acceso se aplican en su próximo inicio de sesión."
    >
      <div className="flex flex-col gap-4">
        {usuarios.map((u) => (
          <div key={u.id} className="rounded-[8px] border border-line bg-bg p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tnum shrink-0 rounded-[6px] bg-bg px-2 py-1 text-[12px] font-semibold">{u.id}</span>
              <span
                title={ESTADO_CLAVE_UI[u.estadoClave].explica}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                  u.estadoClave === "pendiente"
                    ? "bg-[var(--color-warn,#e8b33a)]/20 text-[var(--color-warn,#e8b33a)]"
                    : "bg-bg text-text2"
                }`}
              >{ESTADO_CLAVE_UI[u.estadoClave].label}</span>
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
                className={`${selectCls} py-1.5 text-[12px]`}
                disabled={u.id === yo?.id}
              >
                {ROLES_HUB.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
              </select>
              <button
                onClick={() => void borrar(u.id)}
                disabled={u.id === yo?.id}
                className="shrink-0 rounded-[6px] px-2 py-1 text-[16px] leading-none text-text2 hover:text-[var(--color-signal)] disabled:opacity-30"
                title={u.id === yo?.id ? "No puedes borrarte a ti mismo" : "Borrar usuario"}
              >×</button>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              {PERMISOS_UI.map((permiso) => (
                <label key={permiso.id} className="flex items-center gap-1.5 text-[12px]">
                  <input
                    type="checkbox"
                    checked={Boolean(u.permisos[permiso.id])}
                    onChange={(e) => void cambiar(u, { permisos: { [permiso.id]: e.target.checked } })}
                    className="size-3.5 accent-[var(--color-ok)]"
                  />
                  {permiso.label}
                </label>
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={u.email ?? ""}
                placeholder={u.estadoClave === "pendiente" ? "el email lo deja al activar su cuenta" : "email (avisos del bot y recuperación)"}
                onChange={(e) => setUsuarios(usuarios.map((x) => (x.id === u.id ? { ...x, email: e.target.value || null } : x)))}
                onBlur={() => void cambiar(u, { email: u.email })}
                className={`${inputCls} min-w-0 flex-1`}
              />
              {u.estadoClave === "propia" && (
                <button
                  onClick={() => void restablecer(u.id)}
                  className="shrink-0 rounded-full bg-bg px-3 py-1.5 text-[12px] font-semibold hover:bg-bg"
                  title="Borra su clave y da un enlace nuevo para que cree otra. El email se conserva."
                >Restablecer clave</button>
              )}
              {u.estadoClave === "pendiente" && !enlaces[u.id] && (
                <button
                  onClick={() => void nuevoEnlace(u.id)}
                  className="shrink-0 rounded-full bg-bg px-3 py-1.5 text-[12px] font-semibold hover:bg-bg"
                  title="Crea otro enlace de invitación; el anterior deja de servir."
                >Nuevo enlace de invitación</button>
              )}
            </div>
            {enlaces[u.id] && (
              <div className="mt-2.5 rounded-[6px] border border-line p-2.5">
                <p className="text-[12px] font-semibold">Enlace de invitación de {u.nombre}</p>
                <p className="mt-0.5 text-[11.5px] text-text2">Mándaselo solo a esa persona. Sirve una vez; no se puede volver a ver cuando salgas de esta pantalla.</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <input readOnly value={enlaces[u.id]} onFocus={(e) => e.currentTarget.select()} aria-label={`Enlace de invitación de ${u.nombre}`} className={`${inputCls} min-w-0 flex-1 text-[11.5px]`} />
                  <button onClick={() => void copiar(u.id)} className="shrink-0 rounded-[6px] bg-bg px-3 text-[12px] font-semibold hover:bg-bg">
                    {copiado === u.id ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
            )}
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
          className="shrink-0 rounded-[6px] bg-bg px-4 text-[12px] font-semibold hover:bg-bg disabled:opacity-40"
        >Crear</button>
      </div>
    </Tarjeta>
  );
}
