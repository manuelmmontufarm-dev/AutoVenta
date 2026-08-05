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

const PALETA_LABEL: Record<string, string> = {
  grafito: "Grafito", carbon: "Carbón", rojo: "Rojo", verde: "Verde",
  espresso: "Espresso", navy: "Azul marino",
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
  const [fuentes, setFuentes] = useState<string[]>([]);
  const [guardado, setGuardado] = useState<{ paleta: string; fuente: string } | null>(null);

  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [pieza, setPieza] = useState<string>("cotizacion");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const [cfg, ben, br] = await Promise.all([
        api<{ config: { paleta: string; fuente: string }; paletas: string[]; fuentes: string[] }>("/api/pieces-config"),
        api<{ benefits: Benefit[] }>("/api/benefits"),
        api<{ profiles: BrandProfile[] }>("/api/brand-profiles"),
      ]);
      setPaleta(cfg.config.paleta);
      setFuente(cfg.config.fuente);
      setGuardado(cfg.config);
      setPaletas(cfg.paletas);
      setFuentes(cfg.fuentes);
      setBenefits(ben.benefits);
      setProfiles(br.profiles);
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
          <SeccionTema
            paleta={paleta} fuente={fuente} paletas={paletas} fuentes={fuentes}
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

function SeccionTema({ paleta, fuente, paletas, fuentes, onPaleta, onFuente, sinAplicar, guardando, onAplicar }: {
  paleta: string; fuente: string; paletas: string[]; fuentes: string[];
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
            className={`rounded-xl border px-3.5 py-2 text-[12px] transition ${
              p === paleta
                ? "border-paper/40 bg-paper/[.10] font-semibold"
                : "border-paper/[.10] bg-paper/[.03] hover:bg-paper/[.06]"
            }`}
          >
            {PALETA_LABEL[p] ?? p}
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
