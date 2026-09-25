import { MotionConfig } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { ConnectionChip, ConnectionGate, SalirButton, UserChip } from "./components/admin-key";
import { hasAdminKey } from "./data/catalog";
import { Confetti, Toasts } from "./components/overlays";
import { IconAjustes, IconChart, IconInbox, IconKanban, IconPlay, IconSilencio, IconSonido, IconStop, IconTire } from "./components/icons";
import { PageHeader } from "./components/ui";
import { VersionBadge } from "./components/version-badge";
import { setSonidoActivo, sonidoActivo, sonidoBoton } from "./lib/sound";
import { Tour } from "./components/tour";
import { navigate, useRoute, type Route } from "./router";
import { Ajustes } from "./screens/Ajustes";
import { Dashboard } from "./screens/Dashboard";
import { Cotizador } from "./screens/Cotizador";
import { Inbox } from "./screens/Inbox";
import { Pipeline } from "./screens/Pipeline";
import { TicketDetail } from "./screens/TicketDetail";
import { Settings } from "./screens/Settings";
import { useHub } from "./store";

import type { PhaseFlags } from "./data/types";
import type { Permisos } from "./data/realSource";

// Cuatro entradas. Ajustes no es una pestaña: es el engranaje al pie del
// rail (y arriba a la derecha en el teléfono). `requiere`: fase que
// desbloquea cada pantalla (null = núcleo, siempre).
const NAV = [
  { id: "inbox", label: "Inbox", icon: IconInbox, requiere: null },
  { id: "pipeline", label: "Pipeline", icon: IconKanban, requiere: null },
  { id: "cotizador", label: "Cotizador", icon: IconTire, requiere: "fase3" },
  { id: "dashboard", label: "Métricas", icon: IconChart, requiere: "fase3" },
] as const;

/**
 * Qué permiso del usuario abre cada pantalla. Los interruptores se editan en
 * Ajustes → Usuarios; quien no tiene el permiso no ve la pestaña ni entra por
 * URL. `ticket` cuelga del Inbox.
 */
const PERMISO_DE_VISTA: Record<string, keyof Permisos> = {
  inbox: "verInbox",
  ticket: "verInbox",
  pipeline: "verKanban",
  cotizador: "usarCotizador",
  dashboard: "verMetricas",
  ajustes: "verAjustes",
};

/** ¿La pantalla está permitida con las fases activas y los permisos del usuario? */
function pantallaPermitida(vista: string, phases: PhaseFlags, permisos: Permisos): boolean {
  const llave = PERMISO_DE_VISTA[vista];
  if (llave && !permisos[llave]) return false;
  if (vista === "cotizador" || vista === "dashboard") return phases.fase3;
  return true;
}

const TITULOS: Record<string, { titulo: string; sub: string }> = {
  inbox: { titulo: "Inbox", sub: "Lo que escribieron hoy y quién lo atiende" },
  pipeline: { titulo: "Pipeline", sub: "Tickets abiertos, de izquierda a derecha según avanzan" },
  dashboard: { titulo: "Métricas", sub: "El negocio de un vistazo" },
  ajustes: { titulo: "Ajustes", sub: "Negocio, seguimientos, avisos y usuarios" },
  cotizador: { titulo: "Cotizador", sub: "Inventario y precios reales de Contífico" },
  settings: { titulo: "Configuración técnica", sub: "WhatsApp, encendido y manual del bot" },
  ticket: { titulo: "Conversación", sub: "" },
};

/** Pantallas que ya dibujan su propia cabecera (tienen acciones dentro). */
const CABECERA_PROPIA = new Set<string>(["inbox", "ticket", "pipeline", "dashboard"]);

function navActivo(route: Route): string {
  return route.vista === "ticket" ? "inbox" : route.vista;
}

export default function App() {
  const route = useRoute();
  const { init, cargando, tickets, demo, dataMode, toggleDemo, phases, conexion, power, usuario, permisos, salir } = useHub();
  const [audioOn, setAudioOn] = useState(sonidoActivo);

  const navVisible = NAV.filter((item) =>
    (!item.requiere || phases[item.requiere]) && pantallaPermitida(item.id, phases, permisos));
  const faseActiva = phases.fase4 ? 4 : phases.fase3 ? 3 : phases.fase2 ? 2 : 1;
  // El gate solo aplica al producto real; el demo usa fixtures y no tiene clave.
  const bloqueado =
    dataMode === "real" && (conexion === "clave-invalida" || conexion === "sin-conexion");

  // Si la fase que habilitaba esta pantalla se apaga, se vuelve al Inbox.
  useEffect(() => {
    if (!pantallaPermitida(route.vista, phases, permisos)) {
      // El refugio es la primera pantalla que este usuario SÍ puede ver.
      const refugio = NAV.find((n) =>
        (!n.requiere || phases[n.requiere]) && pantallaPermitida(n.id, phases, permisos));
      navigate((refugio?.id ?? "inbox") as Parameters<typeof navigate>[0]);
    }
  }, [route.vista, phases, permisos]);

  useEffect(() => {
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const clickMecanico = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest("button");
      if (button && !button.disabled) sonidoBoton();
    };
    document.addEventListener("click", clickMecanico);
    return () => document.removeEventListener("click", clickMecanico);
  }, []);

  const abiertos = tickets.filter((t) => t.estado === "abierto").length;
  const meta = TITULOS[route.vista];
  const enTicket = route.vista === "ticket";
  const enAjustes = route.vista === "ajustes" || route.vista === "settings";

  const toggleSonido = () => {
    const next = !audioOn;
    setSonidoActivo(next);
    setAudioOn(next);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full">
        {/* ── Rail (escritorio) ── */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-line px-4 pt-[22px] pb-5 md:flex">
          <div className="flex flex-col gap-0.5 px-3 pb-[26px]">
            <span className="text-[15px] font-semibold tracking-[-0.01em]">Depot Tire</span>
            <span className="text-[12px] text-text2">Hub de ventas</span>
          </div>
          <nav className="flex flex-col gap-0.5" aria-label="Principal">
            {navVisible.map((item) => (
              <NavItem
                key={item.id}
                activo={navActivo(route) === item.id}
                onClick={() => navigate(item.id)}
                icon={<item.icon size={18} />}
                label={item.label}
                tour={`nav-${item.id}`}
                aside={item.id === "inbox" && abiertos > 0 ? abiertos : undefined}
              />
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-0.5">
            <EstadoBot activo={power.activo} />
            <button
              type="button"
              onClick={toggleSonido}
              aria-pressed={audioOn}
              className="flex h-9 items-center gap-3 rounded-[6px] px-3 text-[13px] text-text2 transition-colors hover:bg-black/[.03] hover:text-text"
            >
              {audioOn ? <IconSonido size={18} /> : <IconSilencio size={18} />}
              <span className="flex-1 text-left">{audioOn ? "Sonido activado" : "Sonido apagado"}</span>
            </button>
            {pantallaPermitida("ajustes", phases, permisos) && (
              <NavItem
                activo={enAjustes}
                onClick={() => navigate("ajustes")}
                icon={<IconAjustes size={18} />}
                label="Ajustes"
                tour="nav-ajustes"
                className="mt-1.5"
              />
            )}

            {/* Sesión y entorno: lo mínimo, en voz baja */}
            <div className="mt-3 flex flex-col gap-2 border-t border-line px-1 pt-3">
              {dataMode === "real" ? (
                <ConnectionChip estado={conexion} fase={faseActiva} onClick={() => navigate("settings")} />
              ) : (
                <button
                  type="button"
                  onClick={toggleDemo}
                  className="btn-quiet flex h-8 items-center justify-center gap-2 rounded-[6px] text-[12px]"
                >
                  {demo ? <IconStop size={12} /> : <IconPlay size={12} />}
                  {demo ? "Detener demo" : "Correr demo"}
                </button>
              )}
              <div className="flex items-center justify-between gap-2">
                {dataMode === "real" && hasAdminKey() ? <UserChip nombre={usuario?.nombre ?? null} /> : <span />}
                <VersionBadge />
              </div>
              {dataMode === "real" && hasAdminKey() && (
                <SalirButton nombre={usuario?.nombre ?? null} onSalir={salir} className="h-8 justify-center text-[12px]" />
              )}
            </div>
          </div>
        </aside>

        {/* ── Contenido ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Cabecera del teléfono: título, estado del bot, sonido y Ajustes */}
          {!enTicket && (
            <header className="flex items-center justify-between px-5 pt-[calc(14px+env(safe-area-inset-top))] pb-1 md:hidden">
              <div className="flex flex-col gap-0.5">
                <h1 className="text-[20px] font-semibold tracking-[-0.01em]">{meta.titulo}</h1>
                <EstadoBot activo={power.activo} compacto />
              </div>
              <div className="flex items-center">
                <button type="button" onClick={toggleSonido} aria-pressed={audioOn} aria-label={audioOn ? "Apagar sonidos" : "Activar sonidos"} className="grid h-11 w-11 place-items-center text-text2">
                  {audioOn ? <IconSonido size={20} /> : <IconSilencio size={20} />}
                </button>
                {pantallaPermitida("ajustes", phases, permisos) && (
                  <button type="button" onClick={() => navigate("ajustes")} aria-label="Ajustes" className={`grid h-11 w-11 place-items-center ${enAjustes ? "text-signal" : "text-text"}`}>
                    <IconAjustes size={20} />
                  </button>
                )}
              </div>
            </header>
          )}

          {/* Cabecera de escritorio para las pantallas que aún no dibujan la suya */}
          {!CABECERA_PROPIA.has(route.vista) && (
            <div className="hidden md:block">
              <PageHeader titulo={meta.titulo} sub={meta.sub} />
            </div>
          )}

          <main className={`min-h-0 flex-1 ${enTicket ? "" : "pb-[92px] md:pb-0"}`}>
            {/* Cambiar la `key` desmonta la pantalla anterior de inmediato. Sin
                animación de entrada: el producto abre en una tarea, no en una
                coreografía. */}
            <div key={enTicket ? `ticket-${route.id}` : route.vista} className="h-full">
              {route.vista === "inbox" && <Inbox />}
              {route.vista === "pipeline" && <Pipeline />}
              {route.vista === "dashboard" && phases.fase3 && <Dashboard />}
              {route.vista === "ajustes" && <Ajustes />}
              {route.vista === "cotizador" && phases.fase3 && <Cotizador />}
              {route.vista === "settings" && <Settings />}
              {route.vista === "ticket" && !cargando && <TicketDetail id={route.id} />}
            </div>
          </main>
        </div>

        {/* ── Barra inferior (teléfono). Dentro de una conversación no hay
            tabs, como en cualquier app de mensajes. ── */}
        {!enTicket && (
          <nav
            className="fixed inset-x-0 bottom-0 z-20 grid border-t border-line bg-bg px-2 pt-2 md:hidden"
            style={{ gridTemplateColumns: `repeat(${navVisible.length}, minmax(0, 1fr))`, paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
            aria-label="Principal"
          >
            {navVisible.map((item) => {
              const activo = navActivo(route) === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={`flex h-12 flex-col items-center justify-center gap-1 text-[11px] ${activo ? "font-semibold text-signal" : "font-medium text-text"}`}
                  data-tour={`nav-${item.id}`}
                  aria-current={activo ? "page" : undefined}
                >
                  <item.icon size={22} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        )}

        <Toasts />
        <Confetti />
        <Tour />
        {bloqueado && <ConnectionGate estado={conexion as "clave-invalida" | "sin-conexion"} />}
      </div>
    </MotionConfig>
  );
}

function NavItem({
  activo,
  onClick,
  icon,
  label,
  aside,
  tour,
  className = "",
}: {
  activo: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  aside?: number;
  tour?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activo ? "page" : undefined}
      data-tour={tour}
      className={`flex h-10 items-center gap-3 rounded-[6px] px-3 text-[14px] transition-colors ${
        activo ? "bg-signal-tint font-semibold text-signal" : "font-medium text-text hover:bg-black/[.03]"
      } ${className}`}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {aside !== undefined && <span className="tnum font-mono text-[12px] font-medium">{aside}</span>}
    </button>
  );
}

/**
 * El estado del bot es una decisión que se olvida, y olvidarla son clientes
 * escribiendo a un número que no responde. Encendido: punto verde. Apagado:
 * punto de la señal y un toque lleva a Ajustes, que es donde se enciende.
 */
function EstadoBot({ activo, compacto = false }: { activo: boolean; compacto?: boolean }) {
  const contenido = (
    <>
      <span className={`pulse-dot ${activo ? "" : "rojo"}`} style={compacto ? { width: 7, height: 7 } : { margin: "0 5px" }} />
      <span className="flex-1 text-left">{activo ? "Bot contestando" : "Bot apagado"}</span>
    </>
  );
  if (compacto) {
    return activo ? (
      <span className="flex items-center gap-1.5 text-[12px] text-text2">{contenido}</span>
    ) : (
      <button type="button" onClick={() => navigate("ajustes")} className="flex items-center gap-1.5 text-[12px] font-semibold text-signal">{contenido}</button>
    );
  }
  return activo ? (
    <div className="flex h-9 items-center gap-3 px-3 text-[13px]">{contenido}</div>
  ) : (
    <button
      type="button"
      onClick={() => navigate("ajustes")}
      title="El bot no está contestando. Toca para encenderlo."
      className="flex h-9 items-center gap-3 rounded-[6px] px-3 text-[13px] font-semibold text-signal hover:bg-signal-tint"
    >
      {contenido}
    </button>
  );
}
