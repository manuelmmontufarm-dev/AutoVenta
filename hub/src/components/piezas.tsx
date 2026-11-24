/**
 * LA COTIZACIÓN QUE VE EL CLIENTE (Manuel, 24-nov-2026): «combina el tab de
 * Piezas a que salga junto con el de Promociones… que sean más simples de usar…
 * y que el PDF se actualice instantáneamente cuando aplastas un cambio».
 *
 * Antes esto era Ajustes → Piezas: seis tarjetas largas, tres con su propio
 * botón «Aplicar cambios» y una vista previa que esperaba 350 ms y se tapaba
 * de gris en cada toque. Ahora vive al lado de las promociones, en la misma
 * pantalla, con UNA vista previa:
 *
 *   · un toque (tema, plantilla, color, interruptor) la cambia al instante;
 *   · lo ya visto se guarda en memoria: volver a una opción no espera nada;
 *   · posar el cursor sobre una opción la va dibujando antes del clic;
 *   · solo escribir texto espera un respiro, para no dibujar por cada tecla.
 *
 * Lo que es APARIENCIA (tema, plantilla, colores, cómo se dice el descuento)
 * se prueba primero y sale a los clientes con «Aplicar»: un solo botón, pegado
 * a la vista previa. Lo que es una PROMESA (beneficios, promociones) se guarda
 * al tocar, como siempre.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { negocioActual } from "../data/negocio";
import { authHeaders } from "../data/realSource";
import { Panel } from "./ui";

async function api<T extends object = { ok: true }>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Error ${response.status}`);
  return payload;
}

// ── Lo que se guarda ────────────────────────────────────────────────────────

export interface Benefit {
  id: number;
  text: string;
  position: number;
  active: boolean;
  brand: string | null;
  minQuantity: number | null;
  store: string | null;
  expiresAt: string | null;
}

interface DisenoDeTema { titulo: string; bajada: string; fondo: string; texto: string; acento: string; adorno: string }
interface ConfigTema { id: string; personalizado: DisenoDeTema }
interface TemaDisponible { id: string; nombre: string; diseno: DisenoDeTema | null }
const TEMA_INICIAL: ConfigTema = {
  id: "automatico",
  personalizado: { titulo: "PROMOCIÓN ESPECIAL", bajada: "", fondo: "#111111", texto: "#ffffff", acento: "#ffc93c", adorno: "rayas" },
};

/** La apariencia de las piezas: lo único de esta pantalla que espera a «Aplicar». */
export interface Apariencia {
  plantilla: string;
  modo: string;
  paleta: string;
  fuente: string;
  /** «porcentaje» o «3x4»: cómo se dice la rebaja. */
  promocion: string;
  tema: ConfigTema;
}

interface RespuestaDeConfig {
  config: { paleta: string; fuente: string; plantilla?: string; modo?: string; promocion?: { modo: string }; tema?: ConfigTema };
  paletas: string[];
  muestras?: Record<string, string[]>;
  fuentes: string[];
  plantillas?: string[];
  modos?: string[];
  temas?: TemaDisponible[];
  modosPromocion?: string[];
  descuentoDeMuestra?: number | null;
}

interface Opciones {
  paletas: string[];
  muestras: Record<string, string[]>;
  fuentes: string[];
  plantillas: string[];
  modos: string[];
  temas: TemaDisponible[];
  modosPromocion: string[];
  descuentoDeMuestra: number | null;
}

const aparienciaDe = (c: RespuestaDeConfig["config"]): Apariencia => ({
  // Un servidor anterior a las plantillas, la promoción o los temas no manda esos campos.
  plantilla: c.plantilla ?? "clasica",
  modo: c.modo ?? "auto",
  paleta: c.paleta,
  fuente: c.fuente,
  promocion: c.promocion?.modo ?? "porcentaje",
  tema: c.tema ?? TEMA_INICIAL,
});

export const PIEZAS = [
  { id: "cotizacion", label: "Cotización" },
  { id: "opciones", label: "Opciones" },
  { id: "comparativa", label: "Comparativa" },
] as const;

/** La que sale ahora mismo con el modo automático. Misma regla que render/diaNoche.ts. */
function modoDeAhora(): "dia" | "noche" {
  const hora = Number(new Intl.DateTimeFormat("en-US", {
    hour: "numeric", hourCycle: "h23", timeZone: "America/Guayaquil",
  }).format(new Date()));
  return hora >= 6 && hora < 17 ? "dia" : "noche";
}

// ── La vista previa: una imagen por combinación, guardada en memoria ────────

const GUARDADAS = 60;
/**
 * El recuadro mide ~390 px; se pide al doble para que se vea nítida en una
 * pantalla retina. La pieza real sale a más de 2.000 px y tarda cuatro veces
 * más: acá no hace falta.
 */
const ANCHO_DE_LA_VISTA = "860";
const imagenes = new Map<string, Promise<string>>();

/**
 * La imagen de una combinación. La primera vez se le pide al servidor; después
 * sale de la memoria, así que volver a una opción ya vista es instantáneo. El
 * que llama no distingue: siempre recibe la dirección de la imagen.
 */
function imagen(consulta: string): Promise<string> {
  const guardada = imagenes.get(consulta);
  if (guardada) {
    // Lo recién usado va al final: lo que se descarta es lo más viejo.
    imagenes.delete(consulta);
    imagenes.set(consulta, guardada);
    return guardada;
  }
  const nueva = fetch(`/api/pieces/preview.png?${consulta}`, { headers: authHeaders() }).then(async (r) => {
    if (!r.ok) throw new Error(`Error ${r.status}`);
    return URL.createObjectURL(await r.blob());
  });
  // Un fallo no se guarda: el próximo toque vuelve a pedirla.
  nueva.catch(() => imagenes.delete(consulta));
  imagenes.set(consulta, nueva);
  if (imagenes.size > GUARDADAS) {
    const [vieja, url] = imagenes.entries().next().value as [string, Promise<string>];
    imagenes.delete(vieja);
    void url.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
  }
  return nueva;
}

/**
 * Cada vez que algo cambia del lado del servidor (una promoción, quién ve la de
 * temporada) o se vuelve a entrar a la pantalla, las imágenes guardadas dejan
 * de valer. El número va en la consulta y nunca se repite: vive acá, fuera del
 * componente, porque la memoria de imágenes también sobrevive a salir y volver
 * a entrar — con un contador por pantalla, al volver se repetía el «1» y salía
 * la imagen vieja.
 */
let generacion = 0;

// ── El estado de la pantalla ────────────────────────────────────────────────

export interface Piezas {
  cargando: boolean;
  error: string;
  setError: (e: string) => void;
  apariencia: Apariencia;
  opciones: Opciones;
  /** Cambia la apariencia en la vista previa; el cliente no lo ve hasta `aplicar`. */
  probar: (cambio: Partial<Apariencia>) => void;
  /** El cursor está sobre una opción: se va dibujando para que el clic no espere. */
  asomar: (cambio: Partial<Apariencia>) => void;
  sinAplicar: boolean;
  guardando: boolean;
  aplicar: () => Promise<void>;
  deshacer: () => void;
  benefits: Benefit[];
  setBenefits: (b: Benefit[]) => void;
  /** Algo cambió del lado del servidor (una promoción, un beneficio): la vista previa se vuelve a pedir. */
  refrescar: () => void;
  pieza: string;
  setPieza: (p: string) => void;
  verModo: "dia" | "noche";
  setVerModo: (m: "dia" | "noche") => void;
  /** La consulta de la imagen que corresponde a lo que hay en pantalla. */
  consulta: string;
  /** Se llama en cada tecla de un campo de texto: la vista previa le da un respiro. */
  tecla: () => void;
  /** ¿Se escribió algo hace un instante? Un toque (interruptor, opción) no cuenta. */
  escribiendo: () => boolean;
}

const SIN_OPCIONES: Opciones = {
  paletas: [], muestras: {}, fuentes: [], plantillas: ["clasica"], modos: [], temas: [], modosPromocion: [], descuentoDeMuestra: null,
};

export function usePiezas(): Piezas {
  const [apariencia, setApariencia] = useState<Apariencia>(() => aparienciaDe({ paleta: "grafito", fuente: "exo" }));
  const [guardada, setGuardada] = useState<Apariencia | null>(null);
  const [opciones, setOpciones] = useState<Opciones>(SIN_OPCIONES);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(() => ++generacion);
  const [pieza, setPieza] = useState<string>("cotizacion");
  const [verModo, setVerModo] = useState<"dia" | "noche">(() => modoDeAhora());

  useEffect(() => {
    let vivo = true;
    Promise.all([
      api<RespuestaDeConfig>("/api/pieces-config"),
      api<{ benefits: Benefit[] }>("/api/benefits"),
    ]).then(([cfg, ben]) => {
      if (!vivo) return;
      const a = aparienciaDe(cfg.config);
      setApariencia(a);
      setGuardada(a);
      setOpciones({
        paletas: cfg.paletas, muestras: cfg.muestras ?? {}, fuentes: cfg.fuentes,
        plantillas: cfg.plantillas ?? ["clasica"], modos: cfg.modos ?? [], temas: cfg.temas ?? [],
        modosPromocion: cfg.modosPromocion ?? [], descuentoDeMuestra: cfg.descuentoDeMuestra ?? null,
      });
      setBenefits(ben.benefits);
      setError("");
    }).catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo leer cómo sale la cotización"))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, []);

  // Los beneficios activos entran a la vista previa aunque no se hayan
  // guardado: el negocio ve la promesa en la pieza mientras la escribe.
  const beneficios = useMemo(
    () => benefits.filter((b) => b.active && b.text.trim()).map((b) => b.text.trim()),
    [benefits],
  );

  const consultaDe = useCallback((a: Apariencia): string => {
    const params = new URLSearchParams({ pieza, paleta: a.paleta, fuente: a.fuente, plantilla: a.plantilla, ancho: ANCHO_DE_LA_VISTA });
    const modo = a.plantilla === "diaNoche" ? (a.modo === "auto" ? verModo : a.modo) : "";
    if (modo) params.set("modo", modo);
    if (a.promocion !== "porcentaje") params.set("promocion", a.promocion);
    if (beneficios.length) params.set("beneficios", beneficios.join("|"));
    if (a.tema.id !== "automatico") params.set("tema", JSON.stringify(a.tema));
    // El servidor no la lee: solo separa en la memoria lo dibujado antes y
    // después de un cambio de promociones.
    params.set("v", String(version));
    return params.toString();
  }, [pieza, verModo, beneficios, version]);

  const probar = useCallback((cambio: Partial<Apariencia>) => setApariencia((a) => ({ ...a, ...cambio })), []);

  const ultimaTecla = useRef(0);
  const tecla = useCallback(() => { ultimaTecla.current = Date.now(); }, []);
  const escribiendo = useCallback(() => Date.now() - ultimaTecla.current < 250, []);

  // Un cursor que solo pasa por encima no dibuja nada: tiene que quedarse.
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asomar = useCallback((cambio: Partial<Apariencia>) => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => { void imagen(consultaDe({ ...apariencia, ...cambio })).catch(() => undefined); }, 140);
  }, [apariencia, consultaDe]);
  useEffect(() => () => { if (espera.current) clearTimeout(espera.current); }, []);

  const sinAplicar = guardada !== null && JSON.stringify(guardada) !== JSON.stringify(apariencia);

  const aplicar = async () => {
    setGuardando(true);
    try {
      const { promocion, ...resto } = apariencia;
      const r = await api<{ config: RespuestaDeConfig["config"] }>("/api/pieces-config", {
        method: "PUT",
        body: JSON.stringify({ ...resto, promocion: { modo: promocion } }),
      });
      // El servidor limpia el tema (textos recortados, colores válidos): se muestra lo que quedó.
      const a = aparienciaDe(r.config);
      setApariencia(a);
      setGuardada(a);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar");
    } finally {
      setGuardando(false);
    }
  };

  return {
    cargando, error, setError, apariencia, opciones, probar, asomar,
    sinAplicar, guardando, aplicar,
    deshacer: () => guardada && setApariencia(guardada),
    benefits, setBenefits,
    refrescar: useCallback(() => setVersion(++generacion), []),
    pieza, setPieza, verModo, setVerModo,
    consulta: consultaDe(apariencia),
    tecla, escribiendo,
  };
}

// ── Piezas chicas ───────────────────────────────────────────────────────────

const CAMPO = "h-10 w-full min-w-0 rounded-[6px] border border-line-strong bg-bg px-3 text-[14px] outline-none focus:border-signal";

/** Una opción de un grupo donde se elige una sola: la elegida se ve de lejos. */
const opcion = (elegida: boolean) =>
  `rounded-[8px] border text-left text-[13px] transition-colors ${
    elegida ? "border-signal bg-signal-tint font-semibold ring-1 ring-signal" : "border-line bg-bg hover:border-line-strong"
  }`;

export function Interruptor({ prendido, onCambio, ocupado, etiqueta }: { prendido: boolean; onCambio: (v: boolean) => void; ocupado?: boolean; etiqueta: string }) {
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

function Bloque({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return (
    <Panel className="p-5 md:px-6">
      <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{titulo}</h3>
      {sub && <p className="mt-0.5 text-[13px] text-text2">{sub}</p>}
      <div className="mt-4">{children}</div>
    </Panel>
  );
}

/** Lo que casi nunca se toca: una línea que se abre. */
export function Plegable({ titulo, estado, abierto: alInicio = false, children, testid }: {
  titulo: string; estado?: ReactNode; abierto?: boolean; children: ReactNode; testid?: string;
}) {
  const [abierto, setAbierto] = useState(alInicio);
  return (
    <Panel>
      <button
        type="button" aria-expanded={abierto} data-testid={testid}
        onClick={() => setAbierto(!abierto)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left md:px-6"
      >
        <span className="text-[14px] font-semibold">{titulo}</span>
        <span className="flex items-center gap-2 text-[13px] text-text2">
          {estado}
          <span aria-hidden className={`inline-block text-[11px] transition-transform ${abierto ? "rotate-90" : ""}`}>▶</span>
        </span>
      </button>
      {abierto && <div className="border-t border-line px-5 pt-4 pb-5 md:px-6">{children}</div>}
    </Panel>
  );
}

// ── Diseño: tema, cómo se dice el descuento, plantilla y colores ────────────

const esDepot = () => negocioActual().id === "depot";
/**
 * Las paletas `depot` y `depotRojo` son los colores del sitio de Depot. En su
 * panel se llaman como siempre; en el de otro cliente son solo un negro y un
 * rojo más — llamarlas «Depot Tire» ahí sería mostrarle la marca de otro.
 */
const paletaLabel = (p: string): string => ({
  grafito: "Grafito", carbon: "Carbón", rojo: "Rojo", verde: "Verde",
  espresso: "Espresso", navy: "Azul marino",
  depot: esDepot() ? `${negocioActual().nombre} negro` : "Negro intenso",
  depotRojo: esDepot() ? `${negocioActual().nombre} rojo` : "Rojo intenso",
} as Record<string, string>)[p] ?? p;
const FUENTE_LABEL: Record<string, string> = {
  exo: "Exo 2", barlow: "Barlow", kanit: "Kanit", chakra: "Chakra Petch",
  saira: "Saira", rajdhani: "Rajdhani", archivo: "Archivo Black",
};
const plantillaLabel = (p: string): string => ({
  clasica: "Clásica",
  diaNoche: esDepot() ? `${negocioActual().nombre.split(/\s+/)[0]} día y noche` : "Día y noche",
} as Record<string, string>)[p] ?? p;
const PLANTILLA_NOTA: Record<string, string> = {
  clasica: "Con la paleta y la letra de abajo",
  diaNoche: "Clara de día, oscura de noche",
};
const MODO_LABEL: Record<string, string> = { auto: "Automático", dia: "Siempre clara", noche: "Siempre oscura" };
const MODO_NOTA: Record<string, string> = {
  auto: "Clara de 6:00 a 16:59, oscura el resto (hora de Quito)",
};
const PROMOCION_LABEL: Record<string, string> = { porcentaje: "25 % de descuento", "3x4": "4 llantas por el precio de 3" };
const PROMOCION_NOTA: Record<string, string> = {
  porcentaje: "La insignia dice «−25 %».",
  "3x4": "La misma rebaja, dicha como «paga 3, lleva 4».",
};
const TEMA_NOTA: Record<string, string> = {
  automatico: "Sin cinta; la de la promoción de temporada sale sola",
  ninguno: "Nunca lleva cinta",
  personalizado: "Título, colores y adorno a su gusto",
};

/** El mismo aviso que el servidor (`advertenciaDe3x4`), para la llanta de la vista previa. */
function avisoDe3x4(descuento: number | null): string | null {
  if (descuento === null) return "La llanta de la vista previa no tiene precio de lista: no lleva insignia.";
  if (descuento >= 24 && descuento <= 26) return null;
  return `La llanta de la vista previa tiene −${descuento} %: sale como porcentaje, no como 3x4.`;
}

export function SeccionDiseno({ p }: { p: Piezas }) {
  const { apariencia: a, opciones: o, probar, asomar } = p;
  const propio = a.tema.personalizado;
  const editar = (campo: keyof DisenoDeTema, valor: string) =>
    probar({ tema: { id: "personalizado", personalizado: { ...propio, [campo]: valor } } });
  const elegido = o.temas.find((t) => t.id === a.tema.id);
  const aviso3x4 = a.promocion === "3x4" ? avisoDe3x4(o.descuentoDeMuestra) : null;

  return (
    <>
      {o.temas.length > 0 && (
        <Bloque titulo="Tema" sub="La cinta de temporada que va arriba de la cotización, las opciones y el PDF. No cambia ningún precio.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {o.temas.map((t) => {
              const d = t.id === "personalizado" ? propio : t.diseno;
              const tema = { ...a.tema, id: t.id };
              return (
                <button
                  key={t.id} type="button" data-testid={`tema-${t.id}`}
                  aria-pressed={t.id === a.tema.id}
                  onClick={() => probar({ tema })}
                  onMouseEnter={() => asomar({ tema })} onFocus={() => asomar({ tema })}
                  className={`${opcion(t.id === a.tema.id)} flex flex-col items-start gap-1.5 px-3 py-2.5`}
                >
                  {d ? (
                    <span className="flex h-7 w-full items-center gap-1.5 overflow-hidden rounded-[4px] px-2" style={{ backgroundColor: d.fondo }}>
                      <span className="h-3.5 w-1.5 shrink-0 -skew-x-12" style={{ backgroundColor: d.acento }} />
                      <span className="truncate text-[10px] font-black uppercase" style={{ color: d.texto }}>{d.titulo || " "}</span>
                    </span>
                  ) : (
                    <span className="flex h-7 w-full items-center rounded-[4px] border border-dashed border-line-strong px-2 text-[11px] font-normal text-text2">
                      {t.id === "automatico" ? "como siempre" : "sin cinta"}
                    </span>
                  )}
                  <span>{t.nombre}</span>
                  {TEMA_NOTA[t.id] && <span className="text-[12px] font-normal text-text2">{TEMA_NOTA[t.id]}</span>}
                </button>
              );
            })}
          </div>

          {elegido?.diseno && a.tema.id !== "personalizado" && (
            <button
              type="button" data-testid="tema-editar"
              className="btn-quiet mt-3 h-9 rounded-[6px] px-3 text-[13px]"
              onClick={() => probar({ tema: { id: "personalizado", personalizado: { ...elegido.diseno! } } })}
            >
              Cambiarle el texto o los colores a «{elegido.nombre}»
            </button>
          )}

          {a.tema.id === "personalizado" && (
            <div className="mt-4 grid gap-3 rounded-[8px] border border-line p-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-text2">Título</span>
                <input className={CAMPO} maxLength={30} value={propio.titulo} onChange={(e) => { p.tecla(); editar("titulo", e.target.value); }} data-testid="tema-titulo" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-text2">Texto de abajo</span>
                <input className={CAMPO} maxLength={60} value={propio.bajada} onChange={(e) => { p.tecla(); editar("bajada", e.target.value); }} placeholder="Opcional" />
              </label>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:col-span-2">
                {([["fondo", "Cinta"], ["texto", "Título"], ["acento", "Detalle"]] as const).map(([campo, rotulo]) => (
                  <label key={campo} className="flex items-center gap-2 text-[13px]">
                    <input type="color" className="h-9 w-11 cursor-pointer rounded-[6px] border border-line-strong bg-bg" value={propio[campo]} onChange={(e) => editar(campo, e.target.value)} />
                    {rotulo}
                  </label>
                ))}
                <label className="flex items-center gap-2 text-[13px]">
                  Adorno
                  <select className="h-9 rounded-[6px] border border-line-strong bg-bg px-2 text-[13px]" value={propio.adorno} onChange={(e) => editar("adorno", e.target.value)}>
                    <option value="rayas">Rayas</option>
                    <option value="puntos">Puntos (nieve, confeti)</option>
                    <option value="ninguno">Ninguno</option>
                  </select>
                </label>
              </div>
            </div>
          )}
        </Bloque>
      )}

      {o.modosPromocion.length >= 2 && (
        <Bloque titulo="Cómo se dice el descuento" sub="Cambia lo que dicen la cotización, el PDF y el bot. El precio es el mismo.">
          <div className="grid gap-2 sm:grid-cols-2">
            {o.modosPromocion.map((m) => (
              <button
                key={m} type="button" data-testid={`promocion-${m}`} aria-pressed={m === a.promocion}
                onClick={() => probar({ promocion: m })}
                onMouseEnter={() => asomar({ promocion: m })} onFocus={() => asomar({ promocion: m })}
                className={`${opcion(m === a.promocion)} flex flex-col gap-0.5 px-3.5 py-2.5`}
              >
                <span>{PROMOCION_LABEL[m] ?? m}</span>
                {PROMOCION_NOTA[m] && <span className="text-[12px] font-normal text-text2">{PROMOCION_NOTA[m]}</span>}
              </button>
            ))}
          </div>
          {a.promocion === "3x4" && (
            <p className="mt-3 text-[12px] text-text2">Solo las llantas con 24–26 % de descuento salen como 3x4; las demás siguen con su porcentaje.</p>
          )}
          {aviso3x4 && <p className="mt-2 text-[12px] font-semibold text-warn">{aviso3x4}</p>}
        </Bloque>
      )}

      <Plegable
        titulo="Plantilla, colores y letra" testid="plegable-plantilla"
        estado={a.plantilla === "diaNoche" ? `${plantillaLabel(a.plantilla)} · ${MODO_LABEL[a.modo] ?? a.modo}` : `${plantillaLabel(a.plantilla)} · ${paletaLabel(a.paleta)}`}
      >
        <p className="mb-2 text-[12px] font-semibold text-text2">Plantilla</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {o.plantillas.map((x) => (
            <button
              key={x} type="button" data-testid={`plantilla-${x}`} aria-pressed={x === a.plantilla}
              onClick={() => probar({ plantilla: x })}
              onMouseEnter={() => asomar({ plantilla: x })} onFocus={() => asomar({ plantilla: x })}
              className={`${opcion(x === a.plantilla)} flex flex-col gap-0.5 px-3.5 py-2`}
            >
              <span>{plantillaLabel(x)}</span>
              {PLANTILLA_NOTA[x] && <span className="text-[12px] font-normal text-text2">{PLANTILLA_NOTA[x]}</span>}
            </button>
          ))}
        </div>

        {a.plantilla === "diaNoche" ? (
          <>
            <p className="mb-2 text-[12px] font-semibold text-text2">Clara u oscura</p>
            <div className="flex flex-wrap gap-2">
              {o.modos.map((m) => (
                <button
                  key={m} type="button" data-testid={`modo-${m}`} aria-pressed={m === a.modo}
                  onClick={() => probar({ modo: m })}
                  onMouseEnter={() => asomar({ modo: m })} onFocus={() => asomar({ modo: m })}
                  className={`${opcion(m === a.modo)} flex flex-col gap-0.5 px-3.5 py-2`}
                >
                  <span>{MODO_LABEL[m] ?? m}</span>
                  {MODO_NOTA[m] && <span className="text-[12px] font-normal text-text2">{MODO_NOTA[m]}</span>}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-text2">
              Esta plantilla trae sus propios colores. La comparativa sale siempre con la clásica.
            </p>
          </>
        ) : (
          <>
            <p className="mb-2 text-[12px] font-semibold text-text2">Colores</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {o.paletas.map((x) => (
                <button
                  key={x} type="button" data-testid={`paleta-${x}`} aria-pressed={x === a.paleta}
                  onClick={() => probar({ paleta: x })}
                  onMouseEnter={() => asomar({ paleta: x })} onFocus={() => asomar({ paleta: x })}
                  className={`${opcion(x === a.paleta)} flex flex-col items-start gap-1.5 px-3.5 py-2`}
                >
                  <span>{paletaLabel(x)}</span>
                  <span className="flex overflow-hidden rounded-full border border-line">
                    {(o.muestras[x] ?? []).map((c, i) => <span key={i} className="h-2.5 w-4" style={{ background: c }} />)}
                  </span>
                </button>
              ))}
            </div>
            <p className="mb-2 text-[12px] font-semibold text-text2">Letra de los precios</p>
            <div className="flex flex-wrap gap-2">
              {o.fuentes.map((f) => (
                <button
                  key={f} type="button" data-testid={`fuente-${f}`} aria-pressed={f === a.fuente}
                  onClick={() => probar({ fuente: f })}
                  onMouseEnter={() => asomar({ fuente: f })} onFocus={() => asomar({ fuente: f })}
                  className={`${opcion(f === a.fuente)} px-3.5 py-2`}
                >
                  {FUENTE_LABEL[f] ?? f}
                </button>
              ))}
            </div>
          </>
        )}
      </Plegable>
    </>
  );
}

// ── Lo que incluye la compra ────────────────────────────────────────────────

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

/** «Solo KENDA · desde 4 llantas · hasta el 30 nov», o nada si vale para todos. */
function condicionesDe(b: Benefit): string {
  const partes: string[] = [];
  if (b.brand) partes.push(`Solo ${b.brand}`);
  if (b.minQuantity) partes.push(`desde ${b.minQuantity} llantas`);
  if (b.expiresAt) {
    const [, m, d] = b.expiresAt.slice(0, 10).split("-").map(Number);
    partes.push(`hasta el ${d} ${MESES[m - 1]}`);
  }
  return partes.join(" · ");
}

export function SeccionBeneficios({ p }: { p: Piezas }) {
  const { benefits, setBenefits, setError } = p;
  const [nuevo, setNuevo] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);
  const [porQuitar, setPorQuitar] = useState<number | null>(null);

  const editar = (id: number, cambio: Partial<Benefit>) =>
    setBenefits(benefits.map((b) => (b.id === id ? { ...b, ...cambio } : b)));

  const guardar = async (b: Benefit) => {
    try {
      await api(`/api/benefits/${b.id}`, { method: "PUT", body: JSON.stringify(b) });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  const agregar = async () => {
    if (!nuevo.trim()) return;
    try {
      const r = await api<{ benefit: Benefit }>("/api/benefits", {
        method: "POST",
        body: JSON.stringify({ text: nuevo.trim(), position: benefits.length }),
      });
      setBenefits([...benefits, r.benefit]);
      setNuevo("");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar");
    }
  };

  const quitar = async (id: number) => {
    try {
      await api(`/api/benefits/${id}`, { method: "DELETE" });
      setBenefits(benefits.filter((b) => b.id !== id));
      setPorQuitar(null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar");
    }
  };

  return (
    <Bloque
      titulo="Lo que incluye la compra"
      sub="Sale dibujado en la cotización y el bot lo promete en el chat. Se guarda al tocar."
    >
      <div className="flex flex-col gap-2">
        {benefits.map((b) => {
          const condiciones = condicionesDe(b);
          const conCondiciones = abierto === b.id;
          return (
            <div key={b.id} className="rounded-[8px] border border-line p-3" data-testid={`beneficio-${b.id}`}>
              <div className="flex items-center gap-3">
                <Interruptor
                  prendido={b.active}
                  etiqueta={`${b.active ? "Apagar" : "Prender"} «${b.text}»`}
                  onCambio={(v) => { editar(b.id, { active: v }); void guardar({ ...b, active: v }); }}
                />
                <input
                  value={b.text} aria-label="Texto del beneficio"
                  onChange={(e) => { p.tecla(); editar(b.id, { text: e.target.value }); }}
                  onBlur={() => void guardar(b)}
                  className={`${CAMPO} ${b.active ? "" : "text-text2 line-through"}`}
                />
                {porQuitar === b.id ? (
                  <span className="flex shrink-0 gap-1.5">
                    <button type="button" className="btn-signal h-9 rounded-[6px] px-3 text-[13px] font-semibold" onClick={() => void quitar(b.id)}>Quitar</button>
                    <button type="button" className="btn-quiet h-9 rounded-[6px] px-3 text-[13px]" onClick={() => setPorQuitar(null)}>No</button>
                  </span>
                ) : (
                  <button
                    type="button" aria-label={`Quitar «${b.text}»`} title="Quitar"
                    onClick={() => setPorQuitar(b.id)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[6px] text-[18px] leading-none text-text2 hover:bg-bg hover:text-signal"
                  >×</button>
                )}
              </div>
              <button
                type="button" aria-expanded={conCondiciones} data-testid={`condiciones-${b.id}`}
                onClick={() => setAbierto(conCondiciones ? null : b.id)}
                className="mt-2 ml-[60px] text-left text-[12px] text-text2 underline-offset-2 hover:text-text hover:underline"
              >
                {condiciones || "Para todos los clientes"} · {conCondiciones ? "cerrar" : "cambiar"}
              </button>
              {conCondiciones && (
                <div className="mt-2 ml-[60px] grid gap-2 sm:grid-cols-3">
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[12px] font-semibold text-text2">Solo la marca</span>
                    <input
                      value={b.brand ?? ""} placeholder="todas"
                      onChange={(e) => editar(b.id, { brand: e.target.value || null })}
                      onBlur={() => void guardar(b)} className={CAMPO}
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[12px] font-semibold text-text2">Desde cuántas llantas</span>
                    <input
                      type="number" min={1} value={b.minQuantity ?? ""} placeholder="sin mínimo"
                      onChange={(e) => editar(b.id, { minQuantity: e.target.value ? Number(e.target.value) : null })}
                      onBlur={() => void guardar(b)} className={CAMPO}
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[12px] font-semibold text-text2">Hasta qué día</span>
                    <input
                      type="date" value={b.expiresAt ? b.expiresAt.slice(0, 10) : ""}
                      onChange={(e) => editar(b.id, { expiresAt: e.target.value || null })}
                      onBlur={() => void guardar(b)} className={CAMPO}
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })}
        {!benefits.length && (
          <p className="rounded-[8px] border border-dashed border-line-strong p-4 text-center text-[13px] text-text2">
            Todavía no hay nada. El bot no promete ningún beneficio hasta que agregue uno.
          </p>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={nuevo} onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void agregar()}
          placeholder="Ej. Alineación gratuita el primer mes" aria-label="Beneficio nuevo"
          className={CAMPO} data-testid="beneficio-nuevo"
        />
        <button type="button" disabled={!nuevo.trim()} onClick={() => void agregar()} className="btn-quiet h-10 shrink-0 rounded-[6px] px-4 text-[13px] font-semibold disabled:opacity-50">
          Agregar
        </button>
      </div>
    </Bloque>
  );
}

// ── Quién ve la promoción de temporada ──────────────────────────────────────

interface TemporadaEstado {
  config: { modo: string; telefonos: string[] };
  modos: string[];
  promo: { nombre: string; lema: string; desde: string; hasta: string } | null;
}

const MODO_TEMPORADA: Record<string, { label: string; nota: string }> = {
  todos: { label: "Todos los clientes", nota: "La ve todo el que escribe, dentro de las fechas." },
  pruebas: { label: "Solo números de prueba", nota: "Para probarla por WhatsApp antes de soltarla." },
  apagada: { label: "Nadie", nota: "No la ve nadie, aunque esté prendida arriba." },
};

/**
 * La promo de temporada (Black Friday, nov-2026) tiene dos llaves: el
 * interruptor de su tarjeta, y esta, que dice QUIÉN la ve. Casi siempre está en
 * «todos»; se abre sola cuando no, porque entonces la tarjeta dice «Prendida»
 * y los clientes no la están viendo.
 */
export function SeccionTemporada({ onError, onCambio }: { onError: (v: string) => void; onCambio: () => void }) {
  const [estado, setEstado] = useState<TemporadaEstado | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [cambiando, setCambiando] = useState(false);

  useEffect(() => {
    api<TemporadaEstado & { ok: boolean }>("/api/temporada")
      .then((r) => setEstado(r))
      .catch(() => setEstado(null));
  }, []);

  const guardar = async (cambio: Partial<TemporadaEstado["config"]>): Promise<boolean> => {
    if (!estado) return false;
    setCambiando(true);
    try {
      const r = await api<{ config: TemporadaEstado["config"] }>("/api/temporada", { method: "PUT", body: JSON.stringify(cambio) });
      setEstado({ ...estado, config: r.config });
      onError("");
      onCambio();
      return true;
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo guardar");
      return false;
    } finally {
      setCambiando(false);
    }
  };

  // Un servidor sin promo de temporada (otro cliente) no muestra nada.
  if (!estado?.promo) return null;
  const { config, promo } = estado;
  const paraTodos = config.modo === "todos";
  const agregar = () => {
    const t = nuevo.trim();
    if (!t) return;
    void guardar({ telefonos: [...config.telefonos, t] }).then((ok) => ok && setNuevo(""));
  };
  // «Todos» primero: es lo normal.
  const modos = [...estado.modos].sort((x, y) => Object.keys(MODO_TEMPORADA).indexOf(x) - Object.keys(MODO_TEMPORADA).indexOf(y));

  return (
    <Plegable
      key={paraTodos ? "todos" : "ojo"}
      titulo={`Quién ve ${promo.nombre}`} testid="plegable-temporada" abierto={!paraTodos}
      estado={<span className={paraTodos ? "" : "font-semibold text-warn"}>{MODO_TEMPORADA[config.modo]?.label ?? config.modo}</span>}
    >
      {!paraTodos && (
        <p className="mb-3 text-[13px] font-semibold text-warn">
          Aunque esté prendida arriba, hoy los clientes no la ven.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        {modos.map((m) => (
          <button
            key={m} type="button" disabled={cambiando} data-testid={`temporada-${m}`} aria-pressed={m === config.modo}
            onClick={() => void guardar({ modo: m })}
            className={`${opcion(m === config.modo)} flex flex-col gap-0.5 px-3.5 py-2.5 disabled:opacity-60`}
          >
            <span>{MODO_TEMPORADA[m]?.label ?? m}</span>
            {MODO_TEMPORADA[m] && <span className="text-[12px] font-normal text-text2">{MODO_TEMPORADA[m].nota}</span>}
          </button>
        ))}
      </div>
      {config.modo === "pruebas" && (
        <div className="mt-4">
          <p className="mb-2 text-[12px] font-semibold text-text2">Números de prueba</p>
          {!config.telefonos.length && <p className="mb-2 text-[12px] font-semibold text-warn">Sin números: así nadie la ve.</p>}
          <div className="flex flex-wrap gap-2">
            {config.telefonos.map((t) => (
              <span key={t} className="flex items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 text-[13px]">
                {t}
                <button
                  type="button" disabled={cambiando} aria-label={`Quitar ${t}`}
                  onClick={() => void guardar({ telefonos: config.telefonos.filter((x) => x !== t) })}
                  className="text-text2 hover:text-text disabled:opacity-50"
                >×</button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && agregar()}
              placeholder="0991234567" inputMode="tel" aria-label="Número de prueba"
              className={`${CAMPO} max-w-[200px]`}
            />
            <button type="button" disabled={cambiando || !nuevo.trim()} onClick={agregar} className="btn-quiet h-10 rounded-[6px] px-4 text-[13px] font-semibold disabled:opacity-50">
              Agregar
            </button>
          </div>
        </div>
      )}
    </Plegable>
  );
}

// ── La vista previa ─────────────────────────────────────────────────────────

/**
 * Lo que recibiría el cliente ahora mismo. Un toque la cambia sin espera; la
 * imagen anterior se queda a la vista mientras llega la nueva (nada de tapar
 * todo de gris), y solo al escribir se le da un respiro de 300 ms.
 */
export function VistaPrevia({ p }: { p: Piezas }) {
  const { apariencia: a, consulta, pieza } = p;
  const [src, setSrc] = useState("");
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState("");

  useEffect(() => {
    if (p.cargando) return;
    let vivo = true;
    setCargando(true);
    const t = setTimeout(() => {
      imagen(consulta)
        .then((url) => { if (vivo) { setSrc(url); setFallo(""); } })
        .catch((e) => { if (vivo) setFallo(e instanceof Error ? e.message : "No se pudo dibujar"); })
        .finally(() => { if (vivo) setCargando(false); });
    }, p.escribiendo() ? 300 : 0);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta, p.cargando]);

  return (
    <aside className="h-fit xl:sticky xl:top-0" data-testid="vista-previa">
      <Panel className="p-4">
        {p.sinAplicar ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-warn/40 bg-bg p-3" role="status">
            <span className="text-[13px]"><b>Sin aplicar.</b> Los clientes siguen recibiendo la de antes.</span>
            <span className="flex gap-2">
              <button type="button" disabled={p.guardando} onClick={() => void p.aplicar()} data-testid="aplicar" className="btn-signal h-9 rounded-[6px] px-4 text-[13px] font-semibold">
                {p.guardando ? "Aplicando…" : "Aplicar"}
              </button>
              <button type="button" disabled={p.guardando} onClick={p.deshacer} data-testid="deshacer" className="btn-quiet h-9 rounded-[6px] px-3 text-[13px]">Deshacer</button>
            </span>
          </div>
        ) : (
          <p className="mb-3 text-[13px] text-text2">Así le llega al cliente ahora mismo, en imagen y en PDF.</p>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {PIEZAS.map((x) => (
            <button
              key={x.id} type="button" aria-pressed={x.id === pieza} data-testid={`pieza-${x.id}`}
              onClick={() => p.setPieza(x.id)}
              className={`h-8 rounded-full px-3 text-[13px] transition-colors ${x.id === pieza ? "bg-bg font-semibold text-signal" : "text-text2 hover:bg-bg"}`}
            >{x.label}</button>
          ))}
          {a.plantilla === "diaNoche" && a.modo === "auto" && pieza !== "comparativa" && (
            <span className="ml-auto flex items-center gap-1">
              {(["dia", "noche"] as const).map((m) => (
                <button
                  key={m} type="button" aria-pressed={m === p.verModo}
                  onClick={() => p.setVerModo(m)}
                  className={`h-8 rounded-full px-2.5 text-[12px] transition-colors ${m === p.verModo ? "bg-bg font-semibold" : "text-text2 hover:bg-bg"}`}
                >{m === "dia" ? "Día" : "Noche"}{m === modoDeAhora() ? " · ahora" : ""}</button>
              ))}
            </span>
          )}
        </div>
        {a.plantilla === "diaNoche" && pieza === "comparativa" && (
          <p className="mb-3 text-[12px] text-text2">La comparativa sale siempre con la plantilla clásica.</p>
        )}

        {/* La pieza es más alta que la pantalla: se recorre dentro de su recuadro,
            así la columna entera sigue pegada arriba mientras se baja la página. */}
        <div className="relative max-h-[calc(100dvh-250px)] min-h-[240px] overflow-y-auto rounded-[8px] border border-line bg-bg">
          {/* Una línea fina arriba mientras llega la nueva: la anterior no se tapa. */}
          {cargando && src && <span className="sticky top-0 z-10 -mb-0.5 block h-0.5 animate-pulse bg-signal" data-testid="vista-cargando" />}
          {fallo ? (
            <p className="p-6 text-center text-[13px] text-signal" role="alert">{fallo}</p>
          ) : src ? (
            <img src={src} alt="Vista previa de la pieza" className="block w-full" />
          ) : (
            <p className="p-10 text-center text-[13px] text-text2">Dibujando…</p>
          )}
        </div>
      </Panel>
    </aside>
  );
}
