import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders } from "../data/realSource";

/**
 * Ajustes → Catálogo. Para negocios sin API de inventario ni de facturación
 * (Mundillantas: Fénix en un servidor local), el Excel/CSV se sube aquí y el
 * bot lo usa al momento, sin reinicio. El mapeo dice qué columna es qué; se
 * configura una vez y aplica al PRÓXIMO archivo que se suba.
 *
 * El montaje en `Ajustes.tsx` lo hace el Sprint Final (R-28).
 */

interface Descartada { row?: number; fila?: number; reason?: string; motivo?: string }
interface EstadoCatalogo {
  items: number;
  lastSync: string | null;
  source: "contifico" | "sheets" | "archivo" | null;
  error: string | null;
  descartadas: Descartada[];
  archivo: { nombre: string; subidoEn: string; aros: number } | null;
}
interface MapeoCatalogo {
  columnas: Record<string, string | Record<string, string> | undefined>;
  precioIncluyeIva: boolean;
  filasDeAros: { columna: string; patron: string } | null;
}
interface EstadoFacturas { facturas: number; ultimoDia: string | null; ultimaImportacion: string | null }
interface MapeoFacturas { columnas: Record<string, string | undefined> }

async function api<T extends object>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init.body instanceof Blob ? {} : { "Content-Type": "application/json" }), ...authHeaders(), ...(init.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Error ${response.status}`);
  return payload;
}

/** Manda el archivo CRUDO (sin base64): el servidor lo lee con express.raw, hasta 5 MB. */
export async function subirArchivo<T extends object>(ruta: string, archivo: File): Promise<T> {
  if (archivo.size > 5 * 1024 * 1024) throw new Error("El archivo pesa más de 5 MB");
  return api<T>(`${ruta}?nombre=${encodeURIComponent(archivo.name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: archivo,
  });
}

const inputCls = "w-full rounded-[6px] border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-signal";
const fecha = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("es-EC", { dateStyle: "medium", timeStyle: "short" }) : "—";

const CAMPOS_CATALOGO: Array<{ clave: string; nombre: string; opcional?: boolean }> = [
  { clave: "medida", nombre: "Medida" },
  { clave: "marca", nombre: "Marca" },
  { clave: "diseno", nombre: "Diseño / modelo" },
  { clave: "codigo", nombre: "Código" },
  { clave: "nombre", nombre: "Descripción" },
  { clave: "precio", nombre: "Precio de venta" },
  { clave: "precioLista", nombre: "Precio de lista (tachado)", opcional: true },
  { clave: "precioMinimo", nombre: "Precio mínimo", opcional: true },
  { clave: "stock", nombre: "Stock" },
  { clave: "foto", nombre: "Foto (URL)", opcional: true },
  { clave: "tipo", nombre: "Tipo", opcional: true },
];

const CAMPOS_FACTURAS: Array<{ clave: string; nombre: string; opcional?: boolean }> = [
  { clave: "documento", nombre: "Número de factura" },
  { clave: "fecha", nombre: "Fecha" },
  { clave: "hora", nombre: "Hora", opcional: true },
  { clave: "total", nombre: "Total" },
  { clave: "subtotal", nombre: "Subtotal (sin IVA)", opcional: true },
  { clave: "cliente", nombre: "Cliente", opcional: true },
  { clave: "telefono", nombre: "Teléfono del cliente" },
  { clave: "producto", nombre: "Producto" },
  { clave: "cantidad", nombre: "Cantidad", opcional: true },
  { clave: "precio", nombre: "Precio unitario", opcional: true },
  { clave: "local", nombre: "Local", opcional: true },
];

function Boton({ children, onClick, disabled, principal }: { children: string; onClick: () => void; disabled?: boolean; principal?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-50 ${principal ? "bg-signal text-white" : "bg-bg hover:bg-line"}`}
    >{children}</button>
  );
}

function ListaDescartadas({ filas }: { filas: Descartada[] }) {
  if (!filas.length) return null;
  return (
    <details className="mt-3 rounded-[6px] bg-bg p-2.5 text-[12px]">
      <summary className="cursor-pointer font-semibold">{filas.length} fila{filas.length === 1 ? "" : "s"} descartada{filas.length === 1 ? "" : "s"}</summary>
      <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-auto text-text2">
        {filas.slice(0, 200).map((d, i) => (
          <li key={i}>Fila {d.row ?? d.fila}: {d.reason ?? d.motivo}</li>
        ))}
      </ul>
    </details>
  );
}

/** Editor de mapeo genérico: una fila por campo, el nombre de la columna en minúsculas. */
function EditorDeMapeo({ campos, columnas, onCambio }: {
  campos: Array<{ clave: string; nombre: string; opcional?: boolean }>;
  columnas: Record<string, unknown>;
  onCambio: (clave: string, valor: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {campos.map((c) => (
        <label key={c.clave} className="flex flex-col gap-1">
          <span className="text-[11px] text-text2">{c.nombre}{c.opcional ? " (opcional)" : ""}</span>
          <input
            className={inputCls}
            value={typeof columnas[c.clave] === "string" ? (columnas[c.clave] as string) : ""}
            placeholder={c.opcional ? "—" : "nombre de la columna"}
            onChange={(e) => onCambio(c.clave, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

const limpiarColumnas = <T extends Record<string, unknown>>(columnas: T): T =>
  Object.fromEntries(
    Object.entries(columnas).filter(([, v]) => (typeof v === "string" ? v.trim() !== "" : v !== undefined)),
  ) as T;

export function SeccionCatalogoArchivo({ onError }: { onError: (v: string) => void }) {
  const [estado, setEstado] = useState<EstadoCatalogo | null>(null);
  const [mapeo, setMapeo] = useState<MapeoCatalogo | null>(null);
  const [sucio, setSucio] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [verMapeo, setVerMapeo] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const cargar = useCallback(() => {
    api<{ catalog: EstadoCatalogo }>("/api/catalog/status")
      .then((r) => setEstado(r.catalog))
      .catch((e) => onError(e instanceof Error ? e.message : "No se pudo leer el catálogo"));
    api<{ mapeo: MapeoCatalogo }>("/api/catalog/mapeo")
      .then((r) => { setMapeo(r.mapeo); setSucio(false); })
      .catch(() => setMapeo(null));
  }, [onError]);
  useEffect(cargar, [cargar]);

  const subir = async (archivo: File) => {
    setOcupado(true); setAviso("");
    try {
      const r = await subirArchivo<{ importado: { llantas: number; aros: number; descartadas: unknown[] }; catalog: EstadoCatalogo }>("/api/catalog/import", archivo);
      setEstado(r.catalog);
      setAviso(`Listo: ${r.importado.llantas} llantas${r.importado.aros ? ` y ${r.importado.aros} aros` : ""}. El bot ya lo está usando.`);
      onError("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo subir el catálogo");
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = "";
    }
  };

  const guardarMapeo = async () => {
    if (!mapeo) return;
    setOcupado(true);
    try {
      const r = await api<{ mapeo: MapeoCatalogo }>("/api/catalog/mapeo", {
        method: "PUT",
        body: JSON.stringify({ mapeo: { ...mapeo, columnas: limpiarColumnas(mapeo.columnas) } }),
      });
      setMapeo(r.mapeo); setSucio(false); setAviso("Mapeo guardado: aplica al próximo archivo que suba."); onError("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Mapeo inválido");
    } finally { setOcupado(false); }
  };

  const stockPorLocal = (mapeo?.columnas.stockPorLocal ?? {}) as Record<string, string>;

  return (
    <section className="rounded-[10px] border border-line bg-surface px-5 pt-[18px] pb-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-[13px] font-semibold">Catálogo por archivo</p>
          <p className="text-[12px] text-text2">
            Suba el inventario exportado (Excel o CSV, hasta 5 MB). El bot cotiza con él al momento; si no sube uno nuevo, sigue con el último.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {aviso && <span className="text-[12px] text-text2">{aviso}</span>}
          <Boton onClick={() => setVerMapeo((v) => !v)}>{verMapeo ? "Ocultar columnas" : "Columnas del archivo"}</Boton>
          <Boton principal disabled={ocupado} onClick={() => input.current?.click()}>{ocupado ? "Subiendo…" : "Subir archivo"}</Boton>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); }}
          />
        </div>
      </div>

      {!estado && <p className="text-[12px] text-text2">Leyendo el catálogo…</p>}
      {estado && (
        <div className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
          <div><p className="text-text2">Fuente</p><p className="font-semibold">{estado.source === "archivo" ? "Archivo subido" : estado.source === "contifico" ? "Contífico" : estado.source === "sheets" ? "Google Sheets" : "Sin catálogo"}</p></div>
          <div><p className="text-text2">Llantas</p><p className="font-semibold">{estado.items}{estado.archivo?.aros ? ` · ${estado.archivo.aros} aros` : ""}</p></div>
          <div><p className="text-text2">Archivo</p><p className="font-semibold break-all">{estado.archivo?.nombre ?? "—"}</p></div>
          <div><p className="text-text2">Subido</p><p className="font-semibold">{fecha(estado.archivo?.subidoEn ?? estado.lastSync)}</p></div>
        </div>
      )}
      {estado?.error && <p className="mt-3 rounded-[6px] bg-bg p-2.5 text-[12px] text-signal">{estado.error}</p>}
      {estado && estado.source === "contifico" && (
        <p className="mt-3 rounded-[6px] bg-bg p-2.5 text-[12px] text-text2">Este negocio lee el inventario de Contífico: un archivo subido no se usa mientras Contífico esté conectado.</p>
      )}
      <ListaDescartadas filas={estado?.descartadas ?? []} />

      {verMapeo && mapeo && (
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <p className="text-[12px] text-text2">Escriba el nombre de cada columna tal como aparece en la primera fila del archivo (sin importar mayúsculas).</p>
          <EditorDeMapeo
            campos={CAMPOS_CATALOGO}
            columnas={mapeo.columnas}
            onCambio={(clave, valor) => { setMapeo({ ...mapeo, columnas: { ...mapeo.columnas, [clave]: valor.toLowerCase() } }); setSucio(true); }}
          />
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={mapeo.precioIncluyeIva}
              onChange={(e) => { setMapeo({ ...mapeo, precioIncluyeIva: e.target.checked }); setSucio(true); }}
            />
            Los precios del archivo ya incluyen IVA (si no, el bot le suma el IVA una sola vez)
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-text2">Columna que marca los aros (opcional)</span>
              <input
                className={inputCls}
                value={mapeo.filasDeAros?.columna ?? ""}
                placeholder="—"
                onChange={(e) => {
                  const columna = e.target.value.toLowerCase();
                  setMapeo({ ...mapeo, filasDeAros: columna ? { columna, patron: mapeo.filasDeAros?.patron ?? "^aro" } : null });
                  setSucio(true);
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-text2">Valor que dice «aro» en esa columna (empieza con…)</span>
              <input
                className={inputCls}
                value={mapeo.filasDeAros?.patron ?? ""}
                disabled={!mapeo.filasDeAros}
                onChange={(e) => { if (mapeo.filasDeAros) { setMapeo({ ...mapeo, filasDeAros: { ...mapeo.filasDeAros, patron: e.target.value } }); setSucio(true); } }}
              />
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-text2">Stock por local (opcional): una columna por local, se suman</span>
            {Object.entries(stockPorLocal).map(([local, columna]) => (
              <div key={local} className="flex gap-2">
                <input className={inputCls} value={local} readOnly />
                <input
                  className={inputCls}
                  value={columna}
                  onChange={(e) => { setMapeo({ ...mapeo, columnas: { ...mapeo.columnas, stockPorLocal: { ...stockPorLocal, [local]: e.target.value.toLowerCase() } } }); setSucio(true); }}
                />
                <Boton onClick={() => {
                  const resto = { ...stockPorLocal }; delete resto[local];
                  setMapeo({ ...mapeo, columnas: { ...mapeo.columnas, stockPorLocal: Object.keys(resto).length ? resto : undefined } }); setSucio(true);
                }}>Quitar</Boton>
              </div>
            ))}
            <div>
              <Boton onClick={() => {
                const local = window.prompt("Nombre corto del local (ej. matriz)")?.trim().toLowerCase();
                if (!local) return;
                setMapeo({ ...mapeo, columnas: { ...mapeo.columnas, stockPorLocal: { ...stockPorLocal, [local]: `stock ${local}` } } }); setSucio(true);
              }}>+ Local</Boton>
            </div>
          </div>
          <div className="flex justify-end">
            <Boton principal disabled={ocupado || !sucio} onClick={() => void guardarMapeo()}>Guardar columnas</Boton>
          </div>
        </div>
      )}
    </section>
  );
}

export function SeccionFacturasArchivo({ onError }: { onError: (v: string) => void }) {
  const [estado, setEstado] = useState<EstadoFacturas | null>(null);
  const [mapeo, setMapeo] = useState<MapeoFacturas | null>(null);
  const [sucio, setSucio] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [descartadas, setDescartadas] = useState<Descartada[]>([]);
  const [verMapeo, setVerMapeo] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const cargar = useCallback(() => {
    api<{ estado: EstadoFacturas }>("/api/ventas/archivo")
      .then((r) => setEstado(r.estado))
      .catch((e) => onError(e instanceof Error ? e.message : "No se pudieron leer las facturas"));
    api<{ mapeo: MapeoFacturas }>("/api/ventas/mapeo")
      .then((r) => { setMapeo(r.mapeo); setSucio(false); })
      .catch(() => setMapeo(null));
  }, [onError]);
  useEffect(cargar, [cargar]);

  const subir = async (archivo: File) => {
    setOcupado(true); setAviso("");
    try {
      const r = await subirArchivo<{ importado: { facturas: number; descartadas: Descartada[] }; estado: EstadoFacturas }>("/api/ventas/import", archivo);
      setEstado(r.estado);
      setDescartadas(r.importado.descartadas);
      setAviso(`Listo: ${r.importado.facturas} facturas. Métricas ya las cruza con los chats.`);
      onError("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudieron subir las facturas");
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = "";
    }
  };

  const guardarMapeo = async () => {
    if (!mapeo) return;
    setOcupado(true);
    try {
      const r = await api<{ mapeo: MapeoFacturas }>("/api/ventas/mapeo", {
        method: "PUT",
        body: JSON.stringify({ mapeo: { columnas: limpiarColumnas(mapeo.columnas) } }),
      });
      setMapeo(r.mapeo); setSucio(false); setAviso("Mapeo guardado."); onError("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Mapeo inválido");
    } finally { setOcupado(false); }
  };

  return (
    <section className="rounded-[10px] border border-line bg-surface px-5 pt-[18px] pb-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-[13px] font-semibold">Facturas por archivo</p>
          <p className="text-[12px] text-text2">
            Suba las facturas exportadas (una fila por línea de factura). El bot las cruza con los chats por el teléfono del cliente: para que cuenten, la factura tiene que llevar el número de WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {aviso && <span className="text-[12px] text-text2">{aviso}</span>}
          <Boton onClick={() => setVerMapeo((v) => !v)}>{verMapeo ? "Ocultar columnas" : "Columnas del archivo"}</Boton>
          <Boton principal disabled={ocupado} onClick={() => input.current?.click()}>{ocupado ? "Subiendo…" : "Subir facturas"}</Boton>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); }}
          />
        </div>
      </div>
      {!estado && <p className="text-[12px] text-text2">Leyendo las facturas…</p>}
      {estado && (
        <div className="grid grid-cols-3 gap-3 text-[12px]">
          <div><p className="text-text2">Facturas</p><p className="font-semibold">{estado.facturas}</p></div>
          <div><p className="text-text2">Última factura</p><p className="font-semibold">{estado.ultimoDia ?? "—"}</p></div>
          <div><p className="text-text2">Subidas</p><p className="font-semibold">{fecha(estado.ultimaImportacion)}</p></div>
        </div>
      )}
      <ListaDescartadas filas={descartadas} />
      {verMapeo && mapeo && (
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <EditorDeMapeo
            campos={CAMPOS_FACTURAS}
            columnas={mapeo.columnas}
            onCambio={(clave, valor) => { setMapeo({ columnas: { ...mapeo.columnas, [clave]: valor.toLowerCase() } }); setSucio(true); }}
          />
          <div className="flex justify-end">
            <Boton principal disabled={ocupado || !sucio} onClick={() => void guardarMapeo()}>Guardar columnas</Boton>
          </div>
        </div>
      )}
    </section>
  );
}
