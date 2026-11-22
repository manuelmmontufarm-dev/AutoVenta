import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { searchCatalog, sendImageToChat, sendPieceToChat, sendQuoteToChat, type CatalogProduct } from "../data/catalog";
import type { Ticket } from "../data/types";
import { money } from "../lib/format";
import { IconCamara, IconCheck, IconComparar, IconDoc, IconPlus, IconSearch, IconTire, IconX } from "./icons";

/*
 * Lo que el teléfono necesita para cotizar y adjuntar sin salir del chat
 * (Manuel, 22-nov): una hoja que sube desde abajo, un selector de cantidad con
 * botones grandes, y el «+» del compositor con «Foto» y «Cotización».
 */

/** Hoja inferior: en el teléfono sube desde abajo; en pantallas anchas es una tarjeta centrada. */
export function Hoja({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <motion.div
      className="fixed inset-0 z-100 flex items-end justify-center md:items-center md:p-4"
      style={{ background: "var(--color-scrim)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <motion.div
        className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[16px] border border-line bg-surface shadow-pop md:max-w-[440px] md:rounded-[12px]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line py-2 pr-2 pl-5">
          <span className="text-[16px] font-semibold">{titulo}</span>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center text-text2" aria-label="Cerrar"><IconX size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/** Cantidad con − y + grandes: escribir un número en el teléfono es más lento que dos toques. */
export function Cantidad({ valor, onChange, max = 8 }: { valor: number; onChange: (n: number) => void; max?: number }) {
  const boton = "grid h-12 w-12 place-items-center rounded-[8px] border border-line bg-surface text-[22px] leading-none font-medium disabled:opacity-35";
  return (
    <div className="flex items-center gap-3" role="group" aria-label="Cantidad">
      <button type="button" className={boton} onClick={() => onChange(Math.max(1, valor - 1))} disabled={valor <= 1} aria-label="Una menos">−</button>
      <span className="tnum w-8 text-center font-mono text-[24px] font-semibold" data-testid="cantidad">{valor}</span>
      <button type="button" className={boton} onClick={() => onChange(Math.min(max, valor + 1))} disabled={valor >= max} aria-label="Una más">+</button>
    </div>
  );
}

/** El producto elegido, en una fila: foto, nombre, medida y precio por unidad. */
export function FilaProducto({ product }: { product: CatalogProduct }) {
  return (
    <div className="flex items-center gap-3">
      {product.imageUrl && <img src={product.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-[6px] border border-line bg-bg object-contain" />}
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold">{product.brand} {product.design}</p>
        <p className="tnum font-mono text-[13px] text-text2">{product.sizeLabel ?? product.name} · {money(product.salePrice)} c/u</p>
      </div>
    </div>
  );
}

const STOCK: Record<CatalogProduct["availability"], string> = { available: "Hay", check: "Por confirmar", out: "Agotada" };

/**
 * «Cotización» desde el chat: busca por la medida del ticket, se elige la
 * llanta y la cantidad, y el PDF le llega al cliente por WhatsApp. Tres toques.
 */
function CotizarEnChat({ ticket, onClose, onListo }: { ticket: Ticket; onClose: () => void; onListo: (texto: string) => void }) {
  const [query, setQuery] = useState(ticket.medida ?? "");
  const [productos, setProductos] = useState<CatalogProduct[] | null>(null);
  const [elegido, setElegido] = useState<CatalogProduct | null>(null);
  const [cantidad, setCantidad] = useState(4);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  async function buscar(texto = query) {
    const limpio = texto.trim();
    if (!limpio) return;
    setError("");
    setProductos(null);
    try {
      const r = await searchCatalog(limpio);
      setProductos(r.products.filter((p) => p.availability !== "out"));
    } catch (e) {
      setProductos([]);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (ticket.medida) void buscar(ticket.medida);
    else setProductos([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enviar() {
    if (!elegido || ocupado) return;
    setOcupado(true);
    setError("");
    try {
      const r = await sendQuoteToChat(ticket.id, elegido, cantidad);
      onListo(`Cotización #${r.numero} enviada`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setOcupado(false);
    }
  }

  if (elegido) {
    return (
      <div className="flex flex-col gap-4 p-5" data-testid="cotizar-chat-confirmar">
        <FilaProducto product={elegido} />
        <div className="flex items-center justify-between gap-3">
          <Cantidad valor={cantidad} onChange={setCantidad} max={Math.max(1, Math.min(8, elegido.stock || 8))} />
          <div className="text-right">
            <p className="text-[12px] text-text2">Total con IVA</p>
            <p className="tnum font-mono text-[24px] font-bold">{money(elegido.salePrice * cantidad)}</p>
          </div>
        </div>
        {error && <p role="alert" className="text-[14px] text-signal">{error}</p>}
        <button type="button" onClick={() => void enviar()} disabled={ocupado} className="btn-signal h-[52px] w-full rounded-[8px] text-[16px]">
          {ocupado ? "Enviando…" : `Enviar PDF a ${ticket.nombre?.split(/\s+/)[0] ?? "el cliente"}`}
        </button>
        <button type="button" onClick={() => setElegido(null)} className="btn-quiet h-11 w-full rounded-[8px] text-[14px]">Elegir otra llanta</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4" data-testid="cotizar-chat-buscar">
      <form onSubmit={(e) => { e.preventDefault(); void buscar(); }} className="flex gap-2">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-line bg-bg px-3">
          <IconSearch size={16} className="shrink-0 text-text2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Medida: 205/55R16" aria-label="Medida" className="tnum min-w-0 flex-1 bg-transparent font-mono outline-none" />
        </label>
        <button type="submit" className="btn-quiet h-12 rounded-[8px] px-4 text-[14px]">Buscar</button>
      </form>
      {error && <p role="alert" className="text-[14px] text-signal">{error}</p>}
      {productos === null ? (
        <div className="skeleton h-[180px] w-full" aria-busy="true" />
      ) : productos.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-text2">{query.trim() ? "No hay llantas con stock para esa medida." : "Escriba la medida para ver las llantas."}</p>
      ) : (
        <ul className="flex flex-col">
          {productos.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { setElegido(p); setCantidad(Math.min(4, Math.max(1, p.stock || 4))); }} className="flex w-full items-center justify-between gap-3 border-b border-line py-3 text-left last:border-0">
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{p.brand} {p.design}</span>
                  <span className="tnum block font-mono text-[12px] text-text2">{p.sizeLabel ?? p.name} · {STOCK[p.availability]}{p.stock > 0 ? ` ${p.stock}` : ""}</span>
                </span>
                <span className="tnum shrink-0 font-mono text-[16px] font-bold">{money(p.salePrice)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * «Opciones» y «Comparación» desde el chat: se busca por la medida del ticket,
 * se marcan las llantas y la pieza (la misma imagen que manda el bot) le llega
 * al cliente. Opciones: todas las que hay en stock vienen marcadas y se quitan
 * las que no. Comparación: se marcan dos o tres.
 */
function PiezaEnChat({ ticket, modo, onClose, onListo }: { ticket: Ticket; modo: "options" | "comparison"; onClose: () => void; onListo: (texto: string) => void }) {
  const comparar = modo === "comparison";
  const MAXIMO = comparar ? 3 : 24;
  const [query, setQuery] = useState(ticket.medida ?? "");
  const [buscada, setBuscada] = useState(ticket.medida ?? "");
  const [productos, setProductos] = useState<CatalogProduct[] | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  async function buscar(texto = query) {
    const limpio = texto.trim();
    if (!limpio) return;
    setError("");
    setProductos(null);
    try {
      const r = await searchCatalog(limpio);
      const conStock = r.products.filter((p) => p.availability !== "out");
      setProductos(conStock);
      setBuscada(limpio);
      // Opciones: todo marcado (hasta el tope de la pieza). Comparación: nada, se eligen.
      setMarcados(comparar ? [] : conStock.slice(0, MAXIMO).map((p) => p.id));
    } catch (e) {
      setProductos([]);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (ticket.medida) void buscar(ticket.medida);
    else setProductos([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function alternar(id: string) {
    setError("");
    setMarcados((actuales) => {
      if (actuales.includes(id)) return actuales.filter((x) => x !== id);
      if (actuales.length >= MAXIMO) {
        setError(comparar ? "La comparación lleva máximo tres llantas." : `La imagen lleva máximo ${MAXIMO} opciones.`);
        return actuales;
      }
      return [...actuales, id];
    });
  }

  const listo = comparar ? marcados.length >= 2 : marcados.length >= 1;

  async function enviar() {
    if (!listo || ocupado || !productos) return;
    setOcupado(true);
    setError("");
    try {
      // En el orden de la lista, no en el que se fueron tocando.
      const elegidos = productos.filter((p) => marcados.includes(p.id));
      await sendPieceToChat(ticket.id, modo, elegidos, buscada);
      onListo(comparar ? "Comparación enviada" : `${elegidos.length} ${elegidos.length === 1 ? "opción enviada" : "opciones enviadas"}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setOcupado(false);
    }
  }

  const nombre = ticket.nombre?.split(/\s+/)[0] ?? "el cliente";

  return (
    <div className="flex flex-col gap-3 p-4" data-testid={`pieza-chat-${modo}`}>
      <form onSubmit={(e) => { e.preventDefault(); void buscar(); }} className="flex gap-2">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-line bg-bg px-3">
          <IconSearch size={16} className="shrink-0 text-text2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Medida: 205/55R16" aria-label="Medida" className="tnum min-w-0 flex-1 bg-transparent font-mono outline-none" />
        </label>
        <button type="submit" className="btn-quiet h-12 rounded-[8px] px-4 text-[14px]">Buscar</button>
      </form>
      {productos === null ? (
        <div className="skeleton h-[180px] w-full" aria-busy="true" />
      ) : productos.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-text2">{query.trim() ? "No hay llantas con stock para esa medida." : "Escriba la medida para ver las llantas."}</p>
      ) : (
        <>
          <p className="text-[13px] text-text2">{comparar ? "Marque dos o tres llantas." : "Quite las que no quiera mandar."}</p>
          <ul className="flex flex-col">
            {productos.map((p) => {
              const marcado = marcados.includes(p.id);
              return (
                <li key={p.id}>
                  <button type="button" role="checkbox" aria-checked={marcado} onClick={() => alternar(p.id)} className="flex w-full items-center gap-3 border-b border-line py-3 text-left last:border-0">
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-[6px] border ${marcado ? "border-signal bg-signal text-white" : "border-line-strong bg-surface text-transparent"}`}>
                      <IconCheck size={15} strokeWidth={2.6} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{p.brand} {p.design}</span>
                      <span className="tnum block font-mono text-[12px] text-text2">{p.sizeLabel ?? p.name} · {STOCK[p.availability]}{p.stock > 0 ? ` ${p.stock}` : ""}</span>
                    </span>
                    <span className="tnum shrink-0 font-mono text-[16px] font-bold">{money(p.salePrice)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {error && <p role="alert" className="text-[14px] text-signal">{error}</p>}
      {/* Pegado abajo: con muchas opciones el botón no puede quedar al final de la lista. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-line bg-surface p-4">
        <button type="button" onClick={() => void enviar()} disabled={!listo || ocupado} className="btn-signal h-[52px] w-full rounded-[8px] text-[16px]">
          {ocupado
            ? "Enviando…"
            : comparar
              ? (marcados.length < 2 ? `Marque ${2 - marcados.length} más` : `Enviar comparación de ${marcados.length} a ${nombre}`)
              : `Enviar ${marcados.length} ${marcados.length === 1 ? "opción" : "opciones"} a ${nombre}`}
        </button>
      </div>
    </div>
  );
}

/**
 * El «+» del compositor: foto (cámara o carrete, lo que ofrezca el teléfono),
 * opciones, comparación o cotización en PDF. Lo que se manda le llega al cliente por WhatsApp y, como
 * cuando se escribe, la conversación pasa a manos del asesor.
 */
export function BotonAdjuntar({ ticket, onAviso }: { ticket: Ticket; onAviso: (texto: string, error?: boolean) => void }) {
  const [menu, setMenu] = useState(false);
  const [cotizando, setCotizando] = useState(false);
  const [pieza, setPieza] = useState<"options" | "comparison" | null>(null);
  const [foto, setFoto] = useState<{ archivo: File; vista: string } | null>(null);
  const [pie, setPie] = useState("");
  const [enviando, setEnviando] = useState(false);
  // El error se dice DENTRO de la hoja: el aviso del compositor queda tapado por ella.
  const [errorFoto, setErrorFoto] = useState("");
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto.vista); }, [foto]);

  async function enviarFoto() {
    if (!foto || enviando) return;
    setEnviando(true);
    setErrorFoto("");
    try {
      await sendImageToChat(ticket.id, foto.archivo, pie.trim());
      setFoto(null);
      setPie("");
      onAviso("Foto enviada");
    } catch (e) {
      setErrorFoto((e as Error).message || "No se pudo enviar la foto.");
    } finally {
      setEnviando(false);
    }
  }

  const fila = "flex h-[60px] w-full items-center gap-3.5 px-5 text-left text-[16px] font-medium active:bg-bg";
  const icono = "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg text-text";

  return (
    <>
      <button type="button" onClick={() => setMenu(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-[6px] border border-line bg-bg text-text" aria-label="Adjuntar foto, opciones, comparación o cotización" data-testid="adjuntar">
        <IconPlus size={20} />
      </button>
      {/* `image/*` sin `capture`: iOS ofrece Fototeca, Tomar foto y Archivos en un solo menú. */}
      <input
        ref={archivo}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const elegido = e.target.files?.[0];
          e.target.value = "";
          setErrorFoto("");
          if (elegido) setFoto({ archivo: elegido, vista: URL.createObjectURL(elegido) });
        }}
      />
      <AnimatePresence>
        {menu && (
          <Hoja titulo="Adjuntar" onClose={() => setMenu(false)}>
            <button type="button" className={fila} onClick={() => { setMenu(false); archivo.current?.click(); }}>
              <span className={icono}><IconCamara size={20} /></span>Foto o imagen
            </button>
            <button type="button" className={`${fila} border-t border-line`} onClick={() => { setMenu(false); setPieza("options"); }}>
              <span className={icono}><IconTire size={20} /></span>Opciones
            </button>
            <button type="button" className={`${fila} border-t border-line`} onClick={() => { setMenu(false); setPieza("comparison"); }}>
              <span className={icono}><IconComparar size={20} /></span>Comparación
            </button>
            <button type="button" className={`${fila} border-t border-line`} onClick={() => { setMenu(false); setCotizando(true); }}>
              <span className={icono}><IconDoc size={20} /></span>Cotización en PDF
            </button>
          </Hoja>
        )}
        {pieza && (
          <Hoja titulo={pieza === "comparison" ? "Enviar comparación" : "Enviar opciones"} onClose={() => setPieza(null)}>
            <PiezaEnChat ticket={ticket} modo={pieza} onClose={() => setPieza(null)} onListo={(t) => onAviso(t)} />
          </Hoja>
        )}
        {cotizando && (
          <Hoja titulo="Enviar cotización" onClose={() => setCotizando(false)}>
            <CotizarEnChat ticket={ticket} onClose={() => setCotizando(false)} onListo={(t) => onAviso(t)} />
          </Hoja>
        )}
        {foto && (
          <Hoja titulo="Enviar foto" onClose={() => setFoto(null)}>
            <div className="flex flex-col gap-3 p-4">
              <img src={foto.vista} alt="La foto elegida" className="max-h-[46dvh] w-full rounded-[8px] border border-line bg-bg object-contain" />
              <input value={pie} onChange={(e) => setPie(e.target.value)} placeholder="Añadir un texto (opcional)" maxLength={900} className="h-12 rounded-[8px] border border-line bg-bg px-3.5 outline-none focus:border-signal" />
              {errorFoto && <p role="alert" className="text-[14px] text-signal">{errorFoto}</p>}
              <button type="button" onClick={() => void enviarFoto()} disabled={enviando} className="btn-signal h-[52px] w-full rounded-[8px] text-[16px]">
                {enviando ? "Enviando…" : "Enviar foto"}
              </button>
            </div>
          </Hoja>
        )}
      </AnimatePresence>
    </>
  );
}
