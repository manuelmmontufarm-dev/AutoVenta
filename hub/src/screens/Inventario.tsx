import { useEffect, useRef, useState, type DragEvent } from "react";
import { IconAlert, IconCheck, IconDoc } from "../components/icons";
import { Panel } from "../components/ui";
import {
  SubidaNoCargada,
  fechaDelInventario,
  horasDelInventario,
  inventarioViejo,
  useInventario,
  type EstadoInventario,
  type ResultadoSubida,
} from "../data/inventario";
import { navigate } from "../router";
import { usePermisos } from "../store";

/**
 * INVENTARIO DE HOY (Competimotor, 18-nov-2026). EL lugar donde la gente del
 * negocio sube el Excel que descarga de Fénix cada día: un botón grande, se
 * puede arrastrar el archivo, y dice en palabras simples qué quedó cargado y
 * qué no. El mapeo de columnas NO vive acá: es cosa técnica y se queda en
 * Ajustes. Solo existe en negocios con catálogo por archivo.
 */

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleString("es-EC", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
const diaLargo = (iso: string) =>
  new Date(iso).toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" });

function haceCuanto(horas: number): string {
  if (horas < 1) return "hace un momento";
  if (horas < 24) return `hace ${Math.round(horas)} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

type Resultado =
  | { tipo: "ok"; importado: ResultadoSubida; archivo: string }
  | { tipo: "rechazado"; mensaje: string; archivo: string }
  | { tipo: "confirmar"; mensaje: string; archivo: File };

export function Inventario() {
  const { estado, catalogo, porArchivo, cargar, subir } = useInventario();
  const permisos = usePermisos();
  const [subiendo, setSubiendo] = useState(false);
  const [encima, setEncima] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enviar = async (archivo: File, confirmar = false) => {
    setSubiendo(true);
    setResultado(null);
    try {
      const importado = await subir(archivo, confirmar);
      setResultado({ tipo: "ok", importado, archivo: archivo.name });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No se pudo subir el archivo";
      if (e instanceof SubidaNoCargada && e.necesitaConfirmacion) setResultado({ tipo: "confirmar", mensaje, archivo });
      else setResultado({ tipo: "rechazado", mensaje, archivo: archivo.name });
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  };

  const soltar = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setEncima(false);
    const archivo = e.dataTransfer.files?.[0];
    if (archivo && !subiendo) void enviar(archivo);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[880px] flex-col gap-4 px-5 pt-3 pb-10 md:px-8 md:pt-0">
        {porArchivo === false && (
          <Panel className="p-5 text-[13px] text-text2">
            Este negocio lee el inventario directo de su sistema: no hace falta subir ningún archivo.
          </Panel>
        )}

        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-[18px] md:px-6">
            <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Inventario de hoy</h2>
            <span className="text-[12px] text-text2">Excel (.xls o .xlsx) o CSV, hasta 5 MB</span>
          </div>

          <AvisoDeFecha estado={estado} />

          {/* La zona de soltar: grande y obvia. Todo el recuadro es el botón. */}
          <div
            onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
            onDragLeave={() => setEncima(false)}
            onDrop={soltar}
            onClick={() => !subiendo && input.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !subiendo) input.current?.click(); }}
            className={`mx-5 mt-4 flex cursor-pointer flex-col items-center gap-3 rounded-[8px] border-2 border-dashed px-6 py-9 text-center transition-colors md:mx-6 ${
              encima ? "border-signal bg-signal-tint" : "border-line-strong hover:border-signal hover:bg-signal-tint"
            } ${subiendo ? "pointer-events-none opacity-60" : ""}`}
          >
            <IconDoc size={30} className="text-text2" />
            <p className="text-[15px] font-semibold">
              {subiendo ? "Leyendo el archivo…" : "Arrastre aquí el Excel que descargó de Fénix"}
            </p>
            <span className="btn-signal inline-flex h-12 items-center rounded-[6px] px-6 text-[15px] font-semibold">
              {subiendo ? "Subiendo…" : "Subir el inventario de hoy"}
            </span>
            <p className="max-w-[52ch] text-[12px] text-text2">
              El bot empieza a cotizar con él al momento. Si el archivo viene mal, no se carga y sigue el de antes.
            </p>
            <input
              ref={input}
              type="file"
              accept=".xls,.xlsx,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }}
            />
          </div>

          {resultado && (
            <div className="mx-5 mt-4 md:mx-6">
              <ResultadoDeSubida
                resultado={resultado}
                onConfirmar={(archivo) => void enviar(archivo, true)}
                onCancelar={() => setResultado(null)}
              />
            </div>
          )}

          <ResumenDelCargado estado={estado} />

          {catalogo?.error && (
            <p className="mx-5 mb-4 rounded-[6px] bg-signal-tint p-3 text-[13px] text-signal md:mx-6">
              El bot no pudo leer el catálogo: {catalogo.error}
            </p>
          )}
        </Panel>

        {permisos.verAjustes && (
          <p className="text-[12px] text-text2">
            ¿Fénix cambió el nombre de alguna columna? Eso se arregla una vez en{" "}
            <button type="button" className="underline hover:text-text" onClick={() => navigate("ajustes")}>
              Ajustes → Catálogo por archivo → Columnas del archivo
            </button>
            .
          </p>
        )}
      </div>
    </div>
  );
}

/** Arriba de la tarjeta: al día (verde) o viejo (señal), con la fecha en palabras. */
function AvisoDeFecha({ estado }: { estado: EstadoInventario | null }) {
  if (!estado) {
    return (
      <p className="mx-5 mt-3 flex items-start gap-2 rounded-[6px] bg-signal-tint p-3 text-[13px] font-semibold text-signal md:mx-6" role="alert">
        <IconAlert size={16} className="mt-px shrink-0" />
        Todavía no hay inventario cargado: el bot no tiene llantas para cotizar.
      </p>
    );
  }
  const horas = horasDelInventario(estado);
  const deFenix = Boolean(estado.fechaReporte);
  if (inventarioViejo(estado)) {
    return (
      <p className="mx-5 mt-3 flex items-start gap-2 rounded-[6px] bg-signal-tint p-3 text-[13px] text-signal md:mx-6" role="alert" data-testid="inventario-viejo">
        <IconAlert size={16} className="mt-px shrink-0" />
        <span>
          <b>El inventario tiene más de un día</b>: es del {diaLargo(fechaDelInventario(estado))} ({haceCuanto(horas)}).
          Suba el de hoy para que el bot no ofrezca llantas que ya se vendieron.
        </span>
      </p>
    );
  }
  return (
    <p className="mx-5 mt-3 flex items-center gap-2 text-[13px] text-ok md:mx-6">
      <IconCheck size={16} className="shrink-0" />
      Al día: {deFenix ? "reporte de Fénix" : "subido"} {haceCuanto(horas)}.
    </p>
  );
}

function ResultadoDeSubida({ resultado, onConfirmar, onCancelar }: {
  resultado: Resultado;
  onConfirmar: (archivo: File) => void;
  onCancelar: () => void;
}) {
  if (resultado.tipo === "ok") {
    const { importado } = resultado;
    return (
      <div className="flex items-start gap-2 rounded-[6px] border border-line bg-bg p-3 text-[13px]" role="status" data-testid="subida-ok">
        <IconCheck size={16} className="mt-px shrink-0 text-ok" />
        <span>
          {importado.mismoArchivo ? (
            <><b>Este archivo ya estaba cargado</b> (es el mismo de antes): no cambió nada.</>
          ) : (
            <>
              <b>Listo: {importado.llantas} llantas cargadas</b>
              {importado.aros ? ` y ${importado.aros} aros` : ""} de «{resultado.archivo}». El bot ya cotiza con este inventario.
              {importado.descartadas.length > 0 && ` ${importado.descartadas.length} filas no entraron (abajo dice por qué).`}
            </>
          )}
        </span>
      </div>
    );
  }
  if (resultado.tipo === "rechazado") {
    return (
      <div className="flex items-start gap-2 rounded-[6px] border border-signal/30 bg-signal-tint p-3 text-[13px] text-signal" role="alert" data-testid="subida-rechazada">
        <IconAlert size={16} className="mt-px shrink-0" />
        <span><b>No se cargó «{resultado.archivo}».</b> {resultado.mensaje}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-[6px] border border-warn/40 bg-bg p-3 text-[13px]" role="alert" data-testid="subida-confirmar">
      <span className="flex items-start gap-2">
        <IconAlert size={16} className="mt-px shrink-0 text-warn" />
        <span><b>Antes de cargar «{resultado.archivo.name}», revise:</b> {resultado.mensaje}</span>
      </span>
      <div className="flex flex-wrap gap-2 pl-6">
        <button type="button" className="btn-signal h-9 rounded-[6px] px-4 text-[13px] font-semibold" onClick={() => onConfirmar(resultado.archivo)}>
          Sí, cargarlo igual
        </button>
        <button type="button" className="btn-quiet h-9 rounded-[6px] px-4 text-[13px]" onClick={onCancelar}>
          No, dejar el anterior
        </button>
      </div>
    </div>
  );
}

/** Lo que está cargado ahora: archivo, cuándo, cuántas llantas y lo que no entró. */
function ResumenDelCargado({ estado }: { estado: EstadoInventario | null }) {
  if (!estado) return <div className="h-5" />;
  const filasFuera = estado.descartadas.length;
  return (
    <div className="mt-5 border-t border-line px-5 py-5 md:px-6">
      <p className="mb-3 text-[12px] font-semibold tracking-[0.02em] text-text2 uppercase">Lo que el bot está usando</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
        <Dato etiqueta="Llantas cargadas" grande>{estado.llantas.toLocaleString("es-EC")}</Dato>
        <Dato etiqueta="Filas que no entraron" grande>{filasFuera.toLocaleString("es-EC")}</Dato>
        <Dato etiqueta="Último archivo"><span className="break-all">{estado.nombreArchivo}</span></Dato>
        <Dato etiqueta="Subido">{fechaLarga(estado.subidoEn)}</Dato>
      </div>
      {estado.fechaReporte && (
        <p className="mt-3 text-[12px] text-text2">Reporte de Fénix del {fechaLarga(estado.fechaReporte)}{estado.hoja ? ` · hoja «${estado.hoja}»` : ""}.</p>
      )}

      {estado.descartadasEnPalabras.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[13px] font-semibold">Por qué no entraron</p>
          <ul className="flex flex-col divide-y divide-line rounded-[6px] border border-line">
            {estado.descartadasEnPalabras.map((g) => (
              <li key={g.motivo} className="flex items-start gap-3 px-3 py-2.5 text-[13px]">
                <span className="min-w-8 text-right font-mono font-semibold">{g.filas.length}</span>
                <span className="flex-1">
                  {g.motivo}
                  <span className="block text-[12px] text-text3">
                    {g.filas.length === 1 ? "Fila" : "Filas"} {g.filas.slice(0, 12).join(", ")}{g.filas.length > 12 ? "…" : ""} del Excel
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Dato({ etiqueta, children, grande }: { etiqueta: string; children: React.ReactNode; grande?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[12px] text-text2">{etiqueta}</span>
      <span className={grande ? "font-mono text-[26px] leading-tight font-semibold" : "text-[13px] font-semibold"}>{children}</span>
    </div>
  );
}
