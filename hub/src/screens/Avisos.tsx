import { useEffect, useMemo, useState } from "react";
import { IconCampana, IconChevronR } from "../components/icons";
import { EmptyState, PageHeader } from "../components/ui";
import { activarPush, configPush, desactivarPush, esIos, estadoPush, instalada, useAvisos, type Aviso, type ConfigPush, type EstadoPush } from "../data/avisos";
import { diaDelChat, horaCorta } from "../lib/format";
import { navigate } from "../router";
import { useHub } from "../store";

/**
 * «Avisos» — todo lo que el bot le avisó al equipo, por día y con su hora, y el
 * interruptor para recibirlos en este teléfono (Manuel, 22-nov).
 *
 * Arriba va la activación; abajo el historial. Cada fila dice por dónde salió:
 * «App» o «WhatsApp». Lo largo (el mensaje completo) queda plegado en la fila.
 */
export function Avisos() {
  const dataMode = useHub((s) => s.dataMode);
  const usuario = useHub((s) => s.usuario);
  const { avisos, soloMios, cargado, cargar, marcarVistos } = useAvisos();

  useEffect(() => {
    if (dataMode === "real") void cargar();
  }, [dataMode, cargar]);
  // Abrir la pantalla es haberlos visto: se apaga el punto de la campana.
  useEffect(() => {
    if (cargado) marcarVistos();
  }, [cargado, avisos.length, marcarVistos]);

  const porDia = useMemo(() => {
    const dias: { clave: string; avisos: Aviso[] }[] = [];
    for (const a of avisos) {
      const clave = new Date(a.cuando).toDateString();
      const ultimo = dias[dias.length - 1];
      if (ultimo && ultimo.clave === clave) ultimo.avisos.push(a);
      else dias.push({ clave, avisos: [a] });
    }
    return dias;
  }, [avisos]);

  if (dataMode !== "real") {
    return <p className="px-5 pt-6 text-[14px] text-text2">Los avisos funcionan con el panel real, no en el demo.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="hidden md:block"><PageHeader titulo="Avisos" sub="Lo que el bot le avisó al equipo, por día" /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6 md:px-8">
        <div className="mx-auto flex max-w-[560px] flex-col gap-4">
          <Activacion nombre={usuario?.nombre ?? null} conUsuario={Boolean(usuario)} />

          {!cargado ? (
            <div className="skeleton h-[220px] w-full" aria-busy="true" />
          ) : avisos.length === 0 ? (
            <EmptyState titulo="Todavía no hay avisos" detalle="Cuando el bot avise de una cotización, una venta o un cliente que pide ayuda, queda anotado aquí." />
          ) : (
            <>
              {!soloMios && <p className="text-[12px] text-text2">Se muestran los avisos de todo el equipo.</p>}
              {porDia.map((dia) => (
                <section key={dia.clave} data-testid="avisos-dia">
                  <h2 className="sticky top-0 z-[1] bg-bg py-1.5 text-[13px] font-semibold text-text2">{diaDelChat(dia.avisos[0].cuando)}</h2>
                  <ul className="overflow-hidden rounded-[10px] border border-line bg-surface">
                    {dia.avisos.map((a) => <Fila key={a.id} aviso={a} />)}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** El WhatsApp trae emojis y un enlace; en la app sobran: quedan las líneas con contenido. */
function lineas(mensaje: string): string[] {
  return mensaje
    .split("\n")
    .slice(1) // la primera es la cabecera, que ya es el título
    .map((l) => l.replace(/\*/g, "").trim())
    .filter((l) => l && !l.startsWith("🔗"));
}

/** «🔥 QUIERE COMPRAR» → «Quiere comprar»: en la lista las mayúsculas gritan. */
function enFrase(titulo: string): string {
  const limpio = titulo.replace(/^[^\p{L}\p{N}]+/u, "").toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

function Fila({ aviso }: { aviso: Aviso }) {
  const [abierta, setAbierta] = useState(false);
  const detalle = lineas(aviso.mensaje);
  const resumen = detalle[0] ?? "";
  return (
    <li className="border-b border-line last:border-0" data-testid="aviso">
      <button type="button" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className="tnum w-11 shrink-0 pt-0.5 font-mono text-[13px] text-text2">{horaCorta(aviso.cuando)}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">{enFrase(aviso.titulo)}</span>
          <span className="block truncate text-[13px] text-text2">{aviso.cliente ? `${aviso.cliente} · ` : ""}{resumen}</span>
        </span>
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${aviso.canal === "app" ? "bg-text text-white" : "border border-line text-text2"}`}>
          {aviso.canal === "app" ? "App" : aviso.estado === "failed" ? "WhatsApp falló" : "WhatsApp"}
        </span>
        <IconChevronR size={14} className={`mt-1 shrink-0 text-text3 transition-transform ${abierta ? "rotate-90" : ""}`} />
      </button>
      {abierta && (
        <div className="flex flex-col gap-2 px-4 pb-3 pl-[72px] text-[13px] text-text2">
          {detalle.map((l, i) => <p key={i}>{l}</p>)}
          {aviso.conversationId && (
            <button type="button" onClick={() => navigate(`ticket/${aviso.conversationId}`)} className="self-start font-semibold text-text underline underline-offset-[3px]">
              Abrir el chat
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** La tarjeta de arriba: activar (o apagar) las notificaciones en este teléfono. */
function Activacion({ nombre, conUsuario }: { nombre: string | null; conUsuario: boolean }) {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [config, setConfig] = useState<ConfigPush | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [telefono, setTelefono] = useState<string>("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void estadoPush().then(setEstado);
    void configPush().then((c) => {
      setConfig(c);
      // «¿Cuál eres tú?»: lo que ya dijo antes, o el asesor que se llama igual que el usuario.
      const mio = c.miTelefono
        ?? c.asesores.find((a) => nombre && a.nombre.trim().toLowerCase().split(/\s+/)[0] === nombre.trim().toLowerCase().split(/\s+/)[0])?.telefono
        ?? "";
      setTelefono(mio);
    }).catch(() => undefined);
  }, [nombre]);

  async function activar() {
    setOcupado(true);
    setError("");
    try {
      await activarPush(telefono || null);
      setEstado("activo");
      setEligiendo(false);
    } catch (e) {
      setError((e as Error).message);
      setEstado(await estadoPush());
    } finally {
      setOcupado(false);
    }
  }

  async function apagar() {
    setOcupado(true);
    try {
      await desactivarPush();
      setEstado("apagado");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  if (estado === null) return null;
  const caja = "rounded-[12px] border border-line bg-surface p-4";

  if (estado === "activo") {
    return (
      <div className={`${caja} flex items-center gap-3`} data-testid="push-activo">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-text text-white"><IconCampana size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Notificaciones activadas</p>
          <Detalle>
            Las cotizaciones enviadas y las ventas confirmadas te llegan por aquí y ya no por WhatsApp. Lo urgente
            (un cliente pide un asesor, está listo para pagar, una cita) te sigue llegando por WhatsApp y además aquí.
          </Detalle>
        </div>
        <button type="button" onClick={() => void apagar()} disabled={ocupado} className="btn-quiet h-9 shrink-0 rounded-[6px] px-3 text-[13px]">Apagar</button>
      </div>
    );
  }

  if (estado === "no-soportado") {
    return (
      <div className={caja} data-testid="push-no-soportado">
        <p className="text-[15px] font-semibold">Para recibir notificaciones, instala la app</p>
        <p className="mt-1 text-[13px] text-text2">
          {esIos() && !instalada()
            ? "En Safari toca Compartir y elige «Agregar a inicio». Después abre AutoVenta desde el ícono y vuelve a esta pantalla."
            : "Este navegador no permite notificaciones. Mientras tanto los avisos te siguen llegando por WhatsApp."}
        </p>
      </div>
    );
  }

  if (estado === "bloqueado") {
    return (
      <div className={caja} data-testid="push-bloqueado">
        <p className="text-[15px] font-semibold">Las notificaciones están bloqueadas</p>
        <p className="mt-1 text-[13px] text-text2">Actívalas para AutoVenta en los ajustes del teléfono y vuelve aquí. Mientras tanto los avisos te llegan por WhatsApp.</p>
      </div>
    );
  }

  return (
    <div className={caja} data-testid="push-apagado">
      <p className="text-[15px] font-semibold">Recibe los avisos en este teléfono</p>
      <Detalle>
        Al activarlas, las cotizaciones enviadas y las ventas confirmadas te llegan por la app y dejan de llegarte
        por WhatsApp. Lo urgente sigue por WhatsApp y además llega aquí.
      </Detalle>
      {!conUsuario ? (
        <p className="mt-3 text-[13px] text-signal">Entra con tu usuario (no con la clave administrativa) para activarlas.</p>
      ) : eligiendo ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-[13px] font-semibold" htmlFor="push-asesor">¿Cuál es tu WhatsApp de asesor?</label>
          <select id="push-asesor" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="h-12 rounded-[8px] border border-line bg-bg px-3">
            <option value="">No recibo avisos por WhatsApp</option>
            {(config?.asesores ?? []).map((a) => <option key={a.telefono} value={a.telefono}>{a.nombre} · {a.telefono.slice(-4).padStart(a.telefono.length, "•").slice(-8)}</option>)}
          </select>
          <button type="button" onClick={() => void activar()} disabled={ocupado} className="btn-signal h-12 rounded-[8px] text-[15px]">
            {ocupado ? "Activando…" : "Activar"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setEligiendo(true)} className="btn-signal mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[8px] text-[15px]" data-testid="push-activar">
          <IconCampana size={17} /> Activar notificaciones
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-[13px] text-signal">{error}</p>}
    </div>
  );
}

/** La explicación, plegada: en el teléfono manda el título. */
function Detalle({ children }: { children: React.ReactNode }) {
  return (
    <details className="mt-0.5 text-[13px] text-text2">
      <summary className="cursor-pointer select-none">Qué cambia</summary>
      <p className="mt-1.5">{children}</p>
    </details>
  );
}
