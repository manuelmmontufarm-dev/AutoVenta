/**
 * El tour del hub: la primera vez que alguien entra con su usuario, el panel
 * se presenta solo — paso a paso, navegando de verdad por las pantallas, con
 * un foco sobre lo que se está explicando.
 *
 * Reglas de la casa:
 *  · Los pasos se FILTRAN por permisos y fases: a quien no ve Métricas no se
 *    le muestra Métricas — un tour que enseña puertas cerradas confunde más
 *    de lo que ayuda.
 *  · El tour NAVEGA: cada paso lleva a la pantalla real y la deja visible
 *    detrás del velo, con el foco recortado sobre el elemento del que habla.
 *  · Se puede repetir cuando se quiera con el botón «Tour» de la cabecera; la
 *    marca de visto va por usuario en este navegador.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Permisos } from "../data/realSource";
import type { PhaseFlags } from "../data/types";
import { navigate, useRoute } from "../router";
import { useHub } from "../store";

const TOUR_EVENTO = "autoventa:tour-abrir";
const marcaDe = (userId: string) => `autoventa_tour_v1_${userId}`;

interface PasoTour {
  id: string;
  /** Pantalla a la que navegar antes de mostrar el paso. */
  vista?: "inbox" | "pipeline" | "opportunities" | "cotizador" | "dashboard" | "ajustes";
  /** Valor de `data-tour` del elemento a enfocar. Sin objetivo = tarjeta centrada. */
  objetivo?: string;
  titulo: string;
  cuerpo: string;
}

/**
 * Los pasos, en el orden del recorrido. El texto explica el POR QUÉ de cada
 * pantalla (por qué hay dos kanbans, para qué sirve la baraja), no solo el qué.
 */
function armarPasos(input: {
  nombre: string;
  permisos: Permisos;
  phases: PhaseFlags;
  esAdmin: boolean;
}): PasoTour[] {
  const { nombre, permisos, phases, esAdmin } = input;
  const pasos: (PasoTour | false)[] = [
    {
      id: "bienvenida",
      titulo: `¡Hola, ${nombre}! 👋`,
      cuerpo:
        "Este es el hub de Depot Tire. El bot atiende solo a los clientes por WhatsApp; "
        + "aquí es donde tú lo miras trabajar, tomas el volante cuando hace falta y cierras las ventas. "
        + "Te llevo por las paradas importantes — son dos minutos.",
    },
    permisos.verInbox && {
      id: "inbox",
      vista: "inbox",
      objetivo: "nav-inbox",
      titulo: "Inbox — cada cliente es un ticket",
      cuerpo:
        "Todo el que escribe al WhatsApp aparece aquí como una tarjeta. Puedes buscar por nombre, "
        + "medida o vehículo, filtrar por etapa, y tocar cualquiera para leer la conversación completa "
        + "y escribirle tú mismo. El tab «Alertas del bot» avisa solo cuando algo de verdad se rompió en un chat.",
    },
    permisos.verKanban && {
      id: "pipeline",
      vista: "pipeline",
      objetivo: "nav-pipeline",
      titulo: "Pipeline — el primer kanban",
      cuerpo:
        "Este tablero es el MAPA: el guion de venta en vivo. Cada columna es una etapa por la que el bot "
        + "lleva al cliente solito (nuevo → medida → opciones → cotización → seguimiento). Puedes arrastrar "
        + "una tarjeta si algo cambió, y la vista «Embudo» te dice en qué etapa se están cayendo las ventas.",
    },
    phases.fase4 && permisos.verOportunidades && {
      id: "oportunidades",
      vista: "opportunities",
      objetivo: "nav-opportunities",
      titulo: "Oportunidades — el segundo kanban",
      cuerpo:
        "¿Por qué dos tableros? El Pipeline es el mapa de TODO el viaje — lo maneja el bot. Oportunidades "
        + "es TU lista de trabajo: solo los chats donde el bot suelta el volante. «Cotizados» es la caja del "
        + "negocio, «Piden asesor» es quien espera a un humano y «Errores» lo que se trabó. Arriba está "
        + "«Para después»: lo que fijaste para no perder de vista.",
    },
    phases.fase4 && permisos.verOportunidades && {
      id: "baraja",
      vista: "opportunities",
      objetivo: "revisar-uno",
      titulo: "La baraja — tinder de llantas 🃏",
      cuerpo:
        "«Revisar uno por uno» abre la baraja: una tarjeta por cliente, con su chat y su cotización. "
        + "Desliza ← para marcarla perdida, → para ganada o dejarla «para después»; «Responder» abre el chat "
        + "a pantalla completa. Funciona con el dedo, con los botones o con las flechas del teclado — y toda "
        + "decisión pide un segundo toque, así que un swipe accidental no cierra nada.",
    },
    phases.fase3 && permisos.usarCotizador && {
      id: "cotizador",
      vista: "cotizador",
      objetivo: "nav-cotizador",
      titulo: "Cotizador — inventario real",
      cuerpo:
        "Busca una medida y ves el inventario y los precios reales de Contífico al instante. Desde aquí armas "
        + "la cotización, la comparativa o las opciones, y descargas la imagen o el PDF listos para mandar por WhatsApp.",
    },
    phases.fase3 && permisos.verMetricas && {
      id: "metricas",
      vista: "dashboard",
      objetivo: "nav-dashboard",
      titulo: "Métricas — el negocio de un vistazo",
      cuerpo:
        "Cuánto hay en juego, cuánto se vendió, cuántos cotizados llegaron al local y el embudo del mes. "
        + "Si un número se ve raro, casi siempre la explicación está un clic más adentro.",
    },
    permisos.verAjustes && {
      id: "ajustes",
      vista: "ajustes",
      objetivo: "ajustes-tabs",
      titulo: "Ajustes — el bot se maneja desde aquí",
      cuerpo:
        "Todo ordenado en pestañas: «Bot» (prenderlo, apagarlo y el Ángel Guardián), «Negocio» (horarios y "
        + "cupón), «Piezas» (colores y promociones, con vista previa de lo que recibe el cliente) y «Avisos» "
        + "(qué tipo de mensaje le llega a cada nivel por WhatsApp)."
        + (esAdmin
          ? " Como administrador también ves «Usuarios»: crear cuentas y repartir con interruptores qué ve cada quien."
          : ""),
    },
    {
      id: "fin",
      titulo: "Eso es todo 🏁",
      cuerpo:
        "Ya conoces el circuito. Si quieres repetir el tour algún día, está el botón «Tour» arriba a la "
        + "derecha. A vender llantas.",
    },
  ];
  return pasos.filter((p): p is PasoTour => Boolean(p));
}

/** El elemento visible que corresponde al objetivo (el rail y la tab bar móvil comparten data-tour). */
function medirObjetivo(objetivo: string): DOMRect | null {
  const candidatos = document.querySelectorAll<HTMLElement>(`[data-tour="${objetivo}"]`);
  for (const el of candidatos) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

/** Botón de la cabecera para repetir el tour cuando se quiera. */
export function TourButton() {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      type="button"
      className="gp-sound-control"
      title="Ver el tour del hub"
      aria-label="Ver el tour del hub"
      onClick={() => window.dispatchEvent(new CustomEvent(TOUR_EVENTO))}
    >
      <span aria-hidden>✦</span>
      <span className="hidden lg:inline">Tour</span>
    </motion.button>
  );
}

export function Tour() {
  const { usuario, permisos, phases, cargando, dataMode } = useHub();
  const route = useRoute();
  const [activo, setActivo] = useState(false);
  const [indice, setIndice] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const vistaInicial = useRef<string>("inbox");

  const pasos = useMemo(
    () => armarPasos({
      nombre: usuario?.nombre.split(" ")[0] ?? "bienvenido",
      permisos,
      phases,
      esAdmin: !usuario || usuario.rol === "admin",
    }),
    [usuario, permisos, phases],
  );
  const paso = pasos[indice];

  const abrir = useCallback(() => {
    vistaInicial.current = route.vista === "ticket" ? "inbox" : route.vista;
    setIndice(0);
    setActivo(true);
  }, [route.vista]);

  const cerrar = useCallback(() => {
    setActivo(false);
    if (usuario) window.localStorage.setItem(marcaDe(usuario.id), new Date().toISOString());
    // Devolver a la persona donde estaba: el tour navega y no es quién para
    // dejarla botada en la última parada.
    navigate(vistaInicial.current as Parameters<typeof navigate>[0]);
  }, [usuario]);

  // Arranque automático: primera vez de este usuario en este navegador. Solo
  // producto real y con la carga terminada — un tour sobre skeletons no enseña nada.
  useEffect(() => {
    if (cargando || !usuario || dataMode !== "real" || activo) return;
    if (window.localStorage.getItem(marcaDe(usuario.id))) return;
    const t = setTimeout(abrir, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, usuario, dataMode]);

  // Reabrir a pedido (botón «Tour» de la cabecera).
  useEffect(() => {
    const onAbrir = () => abrir();
    window.addEventListener(TOUR_EVENTO, onAbrir);
    return () => window.removeEventListener(TOUR_EVENTO, onAbrir);
  }, [abrir]);

  // Cada paso: navegar a su pantalla y, cuando el DOM aterrice, medir el foco.
  useEffect(() => {
    if (!activo || !paso) return;
    if (paso.vista && route.vista !== paso.vista) navigate(paso.vista);
    setRect(null);
    if (!paso.objetivo) return;
    const objetivo = paso.objetivo;
    // Dos medidas: una cuando la pantalla monta y otra cuando su animación de
    // entrada termina — sin la segunda el foco queda donde el elemento ESTABA.
    const t1 = setTimeout(() => setRect(medirObjetivo(objetivo)), 350);
    const t2 = setTimeout(() => setRect(medirObjetivo(objetivo)), 900);
    const onResize = () => setRect(medirObjetivo(objetivo));
    window.addEventListener("resize", onResize);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, indice, paso?.objetivo]);

  const alFrente = indice >= pasos.length - 1;
  const siguiente = useCallback(
    () => (alFrente ? cerrar() : setIndice((i) => Math.min(i + 1, pasos.length - 1))),
    [alFrente, cerrar, pasos.length],
  );
  const atras = useCallback(() => setIndice((i) => Math.max(0, i - 1)), []);

  // Teclado: flechas para moverse, Escape para salir.
  useEffect(() => {
    if (!activo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); siguiente(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); atras(); }
      if (e.key === "Escape") { e.preventDefault(); cerrar(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activo, siguiente, atras, cerrar]);

  if (!activo || !paso) return null;

  const MARGEN = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const anchoCarta = Math.min(380, vw - 24);

  // La tarjeta va debajo del foco si cabe; si no, encima; sin foco, centrada.
  let cartaStyle: React.CSSProperties;
  if (rect) {
    const izquierda = Math.max(12, Math.min(rect.left, vw - anchoCarta - 12));
    cartaStyle = vh - rect.bottom > 260
      ? { top: rect.bottom + MARGEN + 14, left: izquierda, width: anchoCarta }
      : { bottom: vh - rect.top + MARGEN + 14, left: izquierda, width: anchoCarta };
  } else {
    cartaStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: anchoCarta };
  }

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label="Tour del hub">
      {/* Velo + foco. El truco: un solo div sobre el objetivo cuyo box-shadow
          gigante pinta el velo — el recorte sale gratis y se anima solo. */}
      {rect ? (
        <motion.div
          className="pointer-events-none absolute rounded-2xl"
          initial={false}
          animate={{
            left: rect.left - MARGEN,
            top: rect.top - MARGEN,
            width: rect.width + MARGEN * 2,
            height: rect.height + MARGEN * 2,
          }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          style={{
            boxShadow: "0 0 0 9999px var(--color-scrim)",
            border: "2px solid color-mix(in srgb, var(--color-paper) 65%, transparent)",
          }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "var(--color-scrim)" }}
        />
      )}
      {/* Atrapa-clics: el fondo se mira pero no se toca mientras el tour habla. */}
      <div className="absolute inset-0" onClick={siguiente} />

      <AnimatePresence mode="wait">
        <motion.div
          key={paso.id}
          initial={{ opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="fixed rounded-3xl p-5 shadow-pop"
          style={{
            ...cartaStyle,
            background: "var(--color-ink2)",
            border: "1px solid var(--color-line)",
            zIndex: 210,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="microlabel">Tour del hub · {indice + 1} de {pasos.length}</p>
          <h2 className="serif mt-1.5 text-lg leading-tight">{paso.titulo}</h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{paso.cuerpo}</p>

          <div className="mt-4 flex items-center gap-1.5">
            {pasos.map((p, i) => (
              <button
                key={p.id}
                aria-label={`Ir al paso ${i + 1}`}
                onClick={() => setIndice(i)}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === indice ? 18 : 6,
                  background: i === indice
                    ? "var(--color-paper)"
                    : "color-mix(in srgb, var(--color-paper) 25%, transparent)",
                }}
              />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              onClick={cerrar}
              className="text-[11px] font-semibold text-faint hover:text-paper"
            >Saltar el tour</button>
            <div className="flex items-center gap-2">
              {indice > 0 && (
                <button
                  onClick={atras}
                  className="rounded-full bg-paper/[.08] px-4 py-2 text-[12px] font-semibold hover:bg-paper/[.14]"
                >Atrás</button>
              )}
              <button
                onClick={siguiente}
                className="btn-aurora rounded-full px-5 py-2 text-[12px] font-black"
              >{alFrente ? "¡Listo!" : "Siguiente"}</button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
