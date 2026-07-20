import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "framer-motion";
import { useEffect } from "react";
import { Confetti, Toasts } from "./components/overlays";
import { IconChart, IconInbox, IconKanban, IconPlay, IconStop } from "./components/icons";
import { RacingDetails } from "./components/racing-details";
import { sonidoCambio } from "./lib/sound";
import { navigate, useRoute, type Route } from "./router";
import { Dashboard } from "./screens/Dashboard";
import { Inbox } from "./screens/Inbox";
import { Pipeline } from "./screens/Pipeline";
import { TicketDetail } from "./screens/TicketDetail";
import { useHub } from "./store";

const NAV = [
  { id: "inbox", label: "Inbox", icon: IconInbox },
  { id: "pipeline", label: "Pipeline", icon: IconKanban },
  { id: "dashboard", label: "Métricas", icon: IconChart },
] as const;

const TITULOS: Record<string, { titulo: string; sub: string }> = {
  inbox: { titulo: "Inbox", sub: "cada cliente es un ticket" },
  pipeline: { titulo: "Pipeline", sub: "tu guion de venta, en vivo" },
  dashboard: { titulo: "Métricas", sub: "el negocio de un vistazo" },
  ticket: { titulo: "Conversación", sub: "ticket en detalle" },
};

function navActivo(route: Route): string {
  return route.vista === "ticket" ? "inbox" : route.vista;
}

export default function App() {
  const route = useRoute();
  const { init, cargando, tickets, demo, toggleDemo } = useHub();

  useEffect(() => {
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abiertos = tickets.filter((t) => t.estado === "abierto").length;
  const meta = TITULOS[route.vista];

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative z-10 flex h-full">
        <RacingDetails />
        {/* ── Rail de navegación (desktop) ── */}
        <nav className="glass z-20 m-3 mr-0 hidden w-16 flex-col items-center gap-1.5 rounded-3xl py-4 md:flex">
          <button
            onClick={() => {
              sonidoCambio();
              navigate("inbox");
            }}
            className="mb-3 grid h-10 w-10 place-items-center rounded-2xl bg-red text-[13px] font-extrabold text-white shadow-soft"
            aria-label="Depot Tire Hub"
          >
            DT
          </button>
          <LayoutGroup id="rail">
            {NAV.map((item) => {
              const activo = navActivo(route) === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    sonidoCambio();
                    navigate(item.id);
                  }}
                  className="relative grid h-11 w-11 place-items-center rounded-2xl text-muted transition-colors hover:text-paper data-[activo=true]:text-paper"
                  data-activo={activo}
                  aria-label={item.label}
                  title={item.label}
                >
                  {activo && (
                    <motion.span
                      layoutId="rail-activo"
                      className="absolute inset-0 rounded-2xl"
                      style={{ background: "color-mix(in srgb, var(--color-paper) 9%, transparent)", border: "1px solid color-mix(in srgb, var(--color-paper) 10%, transparent)" }}
                      transition={{ type: "spring", stiffness: 480, damping: 36 }}
                    />
                  )}
                  <span className="relative z-10">
                    <item.icon size={19} />
                  </span>
                  {item.id === "inbox" && abiertos > 0 && (
                    <span className="tnum absolute top-1 right-1 z-10 grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[9px] font-bold text-white">
                      {abiertos}
                    </span>
                  )}
                </button>
              );
            })}
          </LayoutGroup>
          <div className="mt-auto flex flex-col items-center gap-3">
            <span className="pulse-dot" title="Bot en línea" />
          </div>
        </nav>

        {/* ── Contenido ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 md:px-6">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-red text-xs font-extrabold text-white shadow-soft md:hidden">
                DT
              </div>
              <div>
                <h1 className="serif text-xl leading-tight tracking-tight">{meta.titulo}</h1>
                <p className="text-[11px] text-muted">{meta.sub}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="glass hidden items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold text-muted sm:flex">
                <span className="pulse-dot" /> Bot en línea 24/7
              </span>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={toggleDemo}
                className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold shadow-soft transition-colors"
                style={{
                  background: demo ? "color-mix(in srgb, var(--color-violet) 14%, transparent)" : "var(--color-paper)",
                  color: demo ? "var(--color-violet)" : "var(--color-ink)",
                  border: demo ? "1px solid color-mix(in srgb, var(--color-violet) 45%, transparent)" : "1px solid transparent",
                }}
              >
                {demo ? <IconStop size={13} /> : <IconPlay size={13} />}
                {demo ? "Detener demo" : "Demo"}
              </motion.button>
            </div>
          </header>

          {/* Pantalla activa */}
          <main className="min-h-0 flex-1 pb-20 md:pb-0">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={route.vista === "ticket" ? `ticket-${route.id}` : route.vista}
                className="h-full"
                initial={{ opacity: 0, y: 14, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.995 }}
                transition={{ type: "spring", stiffness: 340, damping: 32 }}
              >
                {route.vista === "inbox" && <Inbox />}
                {route.vista === "pipeline" && <Pipeline />}
                {route.vista === "dashboard" && <Dashboard />}
                {route.vista === "ticket" && !cargando && <TicketDetail id={route.id} />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        {/* ── Tab bar (móvil) ── */}
        <nav className="glass-strong fixed inset-x-3 bottom-3 z-20 flex items-center justify-around rounded-3xl py-2 md:hidden">
          {NAV.map((item) => {
            const activo = navActivo(route) === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  sonidoCambio();
                  navigate(item.id);
                }}
                className="relative flex flex-col items-center gap-0.5 rounded-2xl px-5 py-1"
                style={{ color: activo ? "var(--color-paper)" : "var(--color-faint)" }}
              >
                <item.icon size={19} />
                <span className="text-[9.5px] font-bold">{item.label}</span>
                {item.id === "inbox" && abiertos > 0 && (
                  <span className="tnum absolute top-0 right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[9px] font-bold text-white">
                    {abiertos}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <Toasts />
        <Confetti />
      </div>
    </MotionConfig>
  );
}
