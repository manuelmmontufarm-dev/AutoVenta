import { useMemo, useState } from "react";
import type { Ticket } from "../data/types";
import { horaLista } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";
import { IconSearch } from "../components/icons";
import { AtiendePill, CierreBadge, EmptyState, MedidaChip, PageHeader, SkeletonRows } from "../components/ui";

/**
 * Una sola lista. Sin pestañas de Abiertos / Cerrados ni «Alertas del bot»:
 * había demasiados para que la distinción importara (DESIGN.md §17).
 *
 * Orden: primero quien espera respuesta (y de esos, el que lleva más tiempo
 * esperando), después el resto por última actividad. El orden es una promesa
 * y tiene que verse: la fila que exige acción es la única pintada.
 */
function ordenar(a: Ticket, b: Ticket): number {
  const ea = a.sinLeer > 0 ? 1 : 0;
  const eb = b.sinLeer > 0 ? 1 : 0;
  if (ea !== eb) return eb - ea;
  const ta = new Date(a.ultimaActividad).getTime();
  const tb = new Date(b.ultimaActividad).getTime();
  // Entre los que esperan, el más viejo primero; entre los demás, el más nuevo.
  return ea ? ta - tb : tb - ta;
}

const COLUMNAS = "240px 120px minmax(0,1fr) 88px 112px";

function Fila({ ticket, now }: { ticket: Ticket; now: number }) {
  const espera = ticket.estado === "abierto" && ticket.sinLeer > 0;
  const cerrado = ticket.estado === "cerrado";
  const titulo = ticket.nombre ?? ticket.telefono;
  const hora = horaLista(ticket.ultimaActividad, now);

  const atiende = cerrado && ticket.cierre ? (
    <CierreBadge cierre={ticket.cierre} />
  ) : espera ? (
    <span className="text-[13px] font-semibold whitespace-nowrap text-signal">Espera respuesta</span>
  ) : (
    <AtiendePill atiende={ticket.atiende} />
  );

  return (
    <button
      type="button"
      onClick={() => navigate(`ticket/${ticket.id}`)}
      className={`block w-full border-b border-line text-left transition-colors hover:bg-black/[.03] ${espera ? "bg-signal-tint" : ""}`}
    >
      {/* Escritorio: una fila de tabla */}
      <div className="hidden h-14 items-center gap-5 px-5 md:grid" style={{ gridTemplateColumns: COLUMNAS }}>
        <span className={`truncate text-[14px] ${espera ? "font-semibold" : "font-medium"}`}>{titulo}</span>
        <span>{ticket.medida ? <MedidaChip medida={ticket.medida} /> : <span className="text-[13px] text-text2">Sin medida</span>}</span>
        <span className={`truncate text-[13px] ${espera ? "text-text" : "text-text2"}`}>{ticket.ultimoMensaje}</span>
        <span className={`tnum text-right font-mono text-[12px] whitespace-nowrap ${espera ? "font-bold text-signal" : "font-medium text-text2"}`}>{hora}</span>
        <span>{atiende}</span>
      </div>

      {/* Teléfono: la misma fila, apilada */}
      <div className="flex flex-col gap-1.5 px-4 py-3 md:hidden">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className={`truncate text-[15px] ${espera ? "font-semibold" : "font-medium"}`}>{titulo}</span>
          <span className={`tnum shrink-0 font-mono text-[12px] ${espera ? "font-bold text-signal" : "font-medium text-text2"}`}>{hora}</span>
        </div>
        <div className="flex items-baseline gap-3">
          {ticket.medida ? <MedidaChip medida={ticket.medida} /> : <span className="text-[13px] text-text2">Sin medida</span>}
          {atiende}
        </div>
        <span className={`truncate text-[13px] ${espera ? "text-text" : "text-text2"}`}>{ticket.ultimoMensaje}</span>
      </div>
    </button>
  );
}

export function Inbox() {
  const { tickets, cargando, power } = useHub();
  const now = useNow();
  const [q, setQ] = useState("");

  const abiertos = useMemo(() => tickets.filter((t) => t.estado === "abierto").sort(ordenar), [tickets]);
  const esperan = abiertos.filter((t) => t.sinLeer > 0).length;

  // Sin búsqueda: los abiertos. Con búsqueda: todo, cerrados incluidos — un
  // cliente que ya compró tiene que poder encontrarse por su nombre o medida.
  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    if (!texto) return abiertos;
    return [...tickets].sort(ordenar).filter((t) => {
      const blob = `${t.nombre ?? ""} ${t.telefono} ${t.medida ?? ""} ${t.vehiculo ?? ""}`.toLowerCase();
      return blob.includes(texto);
    });
  }, [tickets, abiertos, q]);

  const resumen = cargando
    ? ""
    : `${abiertos.length} ${abiertos.length === 1 ? "conversación abierta" : "conversaciones abiertas"} · ${esperan} ${esperan === 1 ? "espera" : "esperan"} respuesta`;

  const buscador = (
    <label className="flex h-10 items-center gap-2 rounded-[6px] border border-line bg-surface px-3 md:h-10 md:w-[360px]">
      <IconSearch size={16} className="shrink-0 text-text2" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre, medida o vehículo"
        aria-label="Buscar conversaciones"
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none md:text-[13px]"
      />
    </label>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="hidden md:block">
        <PageHeader titulo="Inbox" sub={resumen}>{buscador}</PageHeader>
      </div>
      <div className="px-4 pt-3 pb-3 md:hidden">{buscador}</div>

      <div className="mx-4 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-line bg-surface md:mx-8 md:mb-8">
        <div className="hidden h-10 items-center gap-5 border-b border-line px-5 text-[12px] font-medium text-text2 md:grid" style={{ gridTemplateColumns: COLUMNAS }}>
          <span>Cliente</span><span>Medida</span><span>Último mensaje</span><span className="text-right">Hora</span><span>Atiende</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {cargando ? (
            <SkeletonRows n={8} />
          ) : visibles.length === 0 ? (
            q.trim() ? (
              <EmptyState titulo={`Nada coincide con «${q.trim()}»`} detalle="Probá con el nombre, el teléfono, la medida o el vehículo." />
            ) : (
              <EmptyState
                titulo="Sin conversaciones abiertas"
                // Con el bot apagado, «el bot está atento» sería mentira justo
                // en la pantalla donde el dueño comprueba si algo entra.
                detalle={
                  power.activo
                    ? "Cuando un cliente escriba, su conversación aparece aquí sola."
                    : "El bot está apagado: los mensajes van a seguir llegando aquí, pero nadie contesta hasta que lo enciendas o respondas a mano."
                }
              />
            )
          ) : (
            visibles.map((t) => <Fila key={t.id} ticket={t} now={now} />)
          )}
        </div>
      </div>
    </div>
  );
}
