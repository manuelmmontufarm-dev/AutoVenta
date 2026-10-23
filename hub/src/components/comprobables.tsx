import type { ReactNode } from "react";
import type { Franja, MetricasComprobables, VentasConfirmadas } from "../data/types";
import { money, relTime } from "../lib/format";
import { navigate } from "../router";
import { BarrasDeParte, FunnelChart, LineChart } from "./charts";
import { BlockTitle, Campo } from "./ui";

/*
 * Los cinco bloques de números comprobables de Métricas. Cada cifra sale de
 * una factura de Contífico o de un hecho guardado en la base; ninguna depende
 * de que alguien marque «ganado» a mano en el tablero (Manuel, 23-oct: «que
 * muestren solo lo que se comprueba de forma real»). Y como las ventas son
 * pocas, cada bloque dice sobre cuántas se calcula: un 62 % de 26 ventas no
 * pesa lo mismo que un 62 % de 2.000.
 */

/** Un bloque de Métricas: título, una nota, un gráfico y sus cifras debajo. */
export function Bloque({ titulo, nota, children, className = "" }: { titulo: string; nota?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-3.5 rounded-[10px] border border-line bg-surface px-5 pt-[18px] pb-4 ${className}`}>
      <BlockTitle aside={nota}>{titulo}</BlockTitle>
      {children}
    </section>
  );
}

/** Las cifras bajo un gráfico: etiqueta / valor, con línea arriba. */
export function Cifras({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[minmax(110px,auto)_minmax(0,1fr)] gap-x-4 gap-y-2.5 border-t border-line pt-3 text-[13px]">{children}</div>;
}

export function Cargando() {
  return <div className="skeleton h-[110px] w-full" aria-busy="true" />;
}

const mono = "tnum font-mono";
const num = (n: number) => n.toLocaleString("es-EC");
/** 14.9 → «14,9»; 50 → «50». */
const dec = (n: number) => n.toLocaleString("es-EC", { maximumFractionDigits: 1 });
const pctDe = (parte: number, total: number) => (total > 0 ? `${dec(Math.round((parte / total) * 1000) / 10)} %` : "—");
/** "2026-10-12" → "12/10". */
const diaCorto = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const ventasN = (n: number) => `${num(n)} ${n === 1 ? "venta" : "ventas"}`;

export const FRANJA: Record<Franja, { nombre: string; horas: string; corto: string }> = {
  madrugada: { nombre: "Madrugada", horas: "0–6 h", corto: "Madrug." },
  manana: { nombre: "Mañana", horas: "6–11 h", corto: "Mañana" },
  mediodia: { nombre: "Mediodía", horas: "11–14 h", corto: "Mediodía" },
  tarde: { nombre: "Tarde", horas: "14–18 h", corto: "Tarde" },
  noche: { nombre: "Noche", horas: "18–24 h", corto: "Noche" },
};
const DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
/** La semana del negocio arranca el lunes; el contrato numera desde el domingo. */
const LUN_A_DOM = [1, 2, 3, 4, 5, 6, 0];

/**
 * Qué puede decir la pantalla. Mientras no hay números, cada bloque lo dice
 * con palabras y no muestra ceros: un cero inventado se lee igual que un cero
 * de verdad.
 */
export type EstadoComprobables = "cargando" | "listo" | "leyendo" | "sin_contifico" | "sin_servidor";

export function estadoComprobables(c: MetricasComprobables | undefined, vc: VentasConfirmadas | undefined, cargando: boolean): EstadoComprobables {
  if (cargando) return "cargando";
  if (c?.disponible) return "listo";
  // El servidor todavía no entrega el bloque (versión anterior al contrato)
  // pero sí tiene Contífico: no es «sin Contífico», es que falta el cálculo.
  if (!c && vc?.disponible && vc.ultimaSync) return "sin_servidor";
  if (vc?.disponible) return "leyendo";
  return "sin_contifico";
}

function SinDatos({ estado }: { estado: EstadoComprobables }) {
  if (estado === "cargando" || estado === "leyendo") {
    return (
      <div className="flex flex-col gap-2">
        <Cargando />
        {estado === "leyendo" && <p className="text-[13px] text-text2">Leyendo facturas de Contífico…</p>}
      </div>
    );
  }
  if (estado === "sin_servidor") return <p className="text-[13px] text-text2">El servidor todavía no calcula este bloque.</p>;
  return <p className="text-[13px] text-text2">Sin Contífico: no hay facturas contra las cuales comprobar.</p>;
}

/** Un aviso de muestra chica o de cohorte sin madurar: se ve, pero no grita. */
function Aviso({ children }: { children: ReactNode }) {
  return <p className="rounded-[6px] border border-line bg-bg px-3 py-2 text-[12px] leading-relaxed text-warn">{children}</p>;
}

/** La cifra que importa arriba del bloque: grande, en mono, con su contexto al lado. */
function Cifra({ valor, children }: { valor: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="tnum font-mono text-[26px] leading-[1.1] font-medium tracking-[-0.02em]">{valor}</span>
      {children && <span className="text-[13px] text-text2">{children}</span>}
    </div>
  );
}

/* ── Bloque 1 · Ventas comprobadas ─────────────────────────────────────── */

const MOTIVO: Record<NonNullable<VentasConfirmadas["descartes"]>[number]["motivo"], string> = {
  antes_del_chat: "la factura es de antes de escribir: ya era cliente",
  sin_llantas: "facturó otra cosa, no llantas (repuestos, garantía)",
  solo_saludo: "el chat no pasó del saludo: el bot no le vendió",
};

const GRUPOS = [
  { clave: "bot", nombre: "Bot solo", nota: "el asesor escribió 0 o 1 mensajes", tinta: "rgba(28,27,25,.72)" },
  { clave: "bot_y_asesor", nombre: "Bot + asesor", nota: "los dos escribieron", tinta: "rgba(28,27,25,.40)" },
  { clave: "asesor", nombre: "Asesor", nota: "el asesor escribió más que el bot", tinta: "rgba(28,27,25,.16)" },
] as const;

/**
 * Lo que de verdad se facturó. El servidor cruza el teléfono del chat con el
 * de las facturas de Contífico cada 10 minutos: es la única venta que no
 * depende de que alguien la marque a mano en el tablero. Arriba el total con
 * y sin IVA y su rango; después quién la atendió; el detalle, plegado.
 */
export function VentasComprobadasBloque({ c, vc, estado, enElPeriodo, now }: {
  c: MetricasComprobables | undefined;
  vc: VentasConfirmadas | undefined;
  estado: EstadoComprobables;
  enElPeriodo: string;
  now: number;
}) {
  const detalle = vc?.detalle ?? [];
  const descartes = (vc?.descartes ?? []).filter((d) => d.motivo !== "antes_del_chat");
  const ultimaSync = c?.ultimaSync ?? vc?.ultimaSync ?? null;
  const nota = estado === "cargando"
    ? undefined
    : estado === "sin_contifico"
      ? "sin Contífico"
      : ultimaSync
        ? `cruce por teléfono · ${relTime(ultimaSync, now)}${vc?.ultimaFactura ? ` · última factura ${diaCorto(vc.ultimaFactura)}` : ""}`
        : "leyendo facturas de Contífico…";

  let cuerpo: ReactNode;
  if (estado === "cargando") cuerpo = <Cargando />;
  else if (!vc?.disponible && estado !== "listo") cuerpo = <SinDatos estado={estado} />;
  else if (estado !== "listo" && !vc?.ultimaSync) cuerpo = vc?.error
    ? <p className="text-[13px] text-signal">No se pudo leer Contífico: {vc.error}</p>
    : <SinDatos estado="leyendo" />;
  else {
    const v = c?.ventas;
    cuerpo = (
      <>
        {v ? (
          <>
            <Cifra valor={`${num(v.n)} · ${money(v.conIva)}`}>
              {v.n === 1 ? "venta" : "ventas"} con IVA {enElPeriodo} · <span className={mono}>{money(v.sinIva)}</span> sin IVA
            </Cifra>
            <p className="text-[13px] text-text2">
              Con {ventasN(v.n)}, el ritmo real es compatible con entre <span className={`${mono} text-text`}>{dec(v.rango.bajo)}</span> y{" "}
              <span className={`${mono} text-text`}>{dec(v.rango.alto)}</span> ventas en un período igual (95 %): una venta más o menos no es tendencia.
            </p>
            <Grupos grupos={v.grupos} n={v.n} />
          </>
        ) : (
          // Servidor sin el contrato nuevo: la tarjeta de siempre, que también sale de Contífico.
          <Cifras>
            <Campo etiqueta="Vendido"><span className={`${mono} text-[15px] font-medium`}>{money(vc?.monto ?? 0)}</span> <span className="text-text2">en {ventasN(vc?.ventas ?? 0)} {enElPeriodo}</span></Campo>
            <Campo etiqueta="Las cerró el bot"><span className={mono}>{vc?.delBot?.ventas ?? 0} · {money(vc?.delBot?.monto ?? 0)}</span></Campo>
            <Campo etiqueta="Las cerró un asesor"><span className={mono}>{vc?.delAsesor?.ventas ?? 0} · {money(vc?.delAsesor?.monto ?? 0)}</span> <span className="text-text2">el asesor escribió más que el bot</span></Campo>
          </Cifras>
        )}
        {vc?.error && <p className="text-[12px] text-signal">La última lectura falló ({vc.error}); se muestran las facturas de la anterior.</p>}
        {detalle.length > 0 ? (
          // Plegada: la tarjeta es un resumen; el detalle se abre a pedido
          // (Manuel, 28-sep: «que no sea grande, solo si aplastas»).
          <details className="group">
            <summary className="cursor-pointer text-[13px] font-medium select-none">
              <span className="group-open:hidden">Ver {detalle.length === 1 ? "la venta" : `las ${detalle.length} ventas`}</span>
              <span className="hidden group-open:inline">Ocultar {detalle.length === 1 ? "la venta" : "las ventas"}</span>
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="text-[12px] font-medium text-text2">
                  <tr><th className="py-2">Cliente</th><th>Factura</th><th>Llantas</th><th>Local</th><th>Atendió</th><th className="text-right">Monto</th></tr>
                </thead>
                <tbody>
                  {detalle.map((v) => (
                    <tr key={v.ticketId} className="cursor-pointer border-t border-line hover:bg-bg" onClick={() => navigate(`ticket/${v.ticketId}`)}>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{v.nombre || v.telefono}</div>
                        {v.cliente && v.cliente.toLowerCase() !== (v.nombre ?? "").toLowerCase() && <div className="text-[12px] text-text2">facturó {v.cliente}</div>}
                      </td>
                      <td className={`${mono} pr-3 text-[12px] whitespace-nowrap`}>
                        {v.facturas.map((f) => <div key={f.documento}>{f.documento.slice(-6).replace(/^0+/, "")} · {diaCorto(f.dia)}</div>)}
                      </td>
                      <td className="max-w-[260px] truncate pr-3 text-text2" title={v.llantas}>{v.llantas}</td>
                      <td className="pr-3 whitespace-nowrap">{[...new Set(v.facturas.map((f) => f.local))].join(" · ")}</td>
                      <td className="pr-3">{v.atendio === "bot" ? "Bot" : "Asesor"}{!v.cotizado && <span className="text-text2"> · sin cotización</span>}</td>
                      <td className={`${mono} text-right`}>{money(v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : (
          <p className="text-[13px] text-text2">Ningún chat terminó en factura {enElPeriodo} todavía.</p>
        )}
        {descartes.length > 0 && (
          <details className="text-[12px] text-text2">
            <summary className="cursor-pointer">{descartes.length} {descartes.length === 1 ? "teléfono coincide" : "teléfonos coinciden"} pero no se cuenta{descartes.length === 1 ? "" : "n"}</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {descartes.map((d) => (
                <li key={d.ticketId}>
                  <button className="text-left hover:underline" onClick={() => navigate(`ticket/${d.ticketId}`)}>{d.nombre || d.telefono}</button>
                  {" "}· {money(d.total)} · {diaCorto(d.dia)} — {MOTIVO[d.motivo]}
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="text-[12px] leading-relaxed text-text2">Cuenta una venta cuando el teléfono del chat aparece en una factura con llantas emitida después del primer mensaje. Si el cliente factura con otro número o a nombre de otra persona, no aparece. Sin IVA es el subtotal de la factura.</p>
        {vc?.lectura && (
          <p className="tnum font-mono text-[11px] text-text2">
            Leídas {vc.lectura.facturas} facturas{vc.lectura.primerDia && vc.lectura.ultimoDia ? ` del ${diaCorto(vc.lectura.primerDia)} al ${diaCorto(vc.lectura.ultimoDia)}` : ""} · {vc.lectura.conTelefono} con teléfono · {vc.lectura.paginas} {vc.lectura.paginas === 1 ? "página" : "páginas"} · llave {vc.lectura.llave === "facturas" ? "de facturas" : "del catálogo"}
          </p>
        )}
      </>
    );
  }

  return <Bloque titulo="Ventas comprobadas en Contífico" nota={nota}>{cuerpo}</Bloque>;
}

/** Quién atendió las ventas: una barra partida en tres y la cifra de cada parte. */
function Grupos({ grupos, n }: { grupos: MetricasComprobables["ventas"]["grupos"]; n: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-3 overflow-hidden rounded-[3px] bg-black/[.06]" role="img" aria-label={GRUPOS.map((g) => `${g.nombre}: ${grupos[g.clave].n}`).join(", ")}>
        {n > 0 && GRUPOS.map((g) => <div key={g.clave} style={{ width: `${(grupos[g.clave].n / n) * 100}%`, background: g.tinta }} />)}
      </div>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
        {GRUPOS.map((g) => (
          <div key={g.clave} className="flex min-w-0 items-baseline gap-2 text-[13px]">
            <span className="inline-block size-2.5 shrink-0 translate-y-[1px] rounded-[2px]" style={{ background: g.tinta, outline: "1px solid var(--color-line)" }} aria-hidden />
            <span className="min-w-0">
              <span className="font-medium">{g.nombre}</span>{" "}
              <span className={mono}>{grupos[g.clave].n} · {money(grupos[g.clave].conIva)}</span>
              <span className="block text-[12px] text-text2">{g.nota}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Bloque 2 · Parte de las llantas de la tienda ──────────────────────── */

export function ParteDeLaTiendaBloque({ c, estado, enElPeriodo }: { c: MetricasComprobables | undefined; estado: EstadoComprobables; enElPeriodo: string }) {
  if (estado !== "listo" || !c) {
    return <Bloque titulo="Parte de las llantas de la tienda" nota="facturas con llantas"><SinDatos estado={estado} /></Bloque>;
  }
  const { periodo, semanas } = c.participacion;
  const suma = (filtro: (s: (typeof semanas)[number]) => boolean) => semanas.filter(filtro).reduce(
    (t, s) => ({ semanas: t.semanas + 1, tienda: t.tienda + s.llantasTienda, bot: t.bot + s.delBot }),
    { semanas: 0, tienda: 0, bot: 0 },
  );
  const con = suma((s) => s.anuncios === "si");
  const sin = suma((s) => s.anuncios === "no");
  const ultima = semanas[semanas.length - 1];
  const marca = { si: "con anuncios", no: "sin anuncios", sin_dato: "anuncios sin dato" } as const;

  return (
    <Bloque titulo="Parte de las llantas de la tienda" nota="facturas con llantas de toda la tienda">
      <Cifra valor={periodo.llantasTienda > 0 ? `${dec(periodo.pct)} %` : "—"}>
        {num(periodo.delBot)} de {num(periodo.llantasTienda)} facturas con llantas {enElPeriodo} salieron de un chat del bot
      </Cifra>
      <BarrasDeParte
        unidad="facturas" nombreMarca="anuncios" etiqueta="Facturas de llantas de la tienda por semana, la parte del bot y si hubo anuncios"
        data={semanas.map((s) => ({
          x: diaCorto(s.lunes), total: s.llantasTienda, parte: s.delBot, marca: s.anuncios,
          detalle: `${s.delBot} de ${s.llantasTienda} · sem. ${diaCorto(s.lunes)} · ${marca[s.anuncios]}`,
        }))}
      />
      <Leyenda items={[
        { muestra: <span className="inline-block size-2.5 rounded-[2px] bg-[rgba(28,27,25,.72)]" />, texto: "del bot" },
        { muestra: <span className="inline-block size-2.5 rounded-[2px] bg-[rgba(28,27,25,.14)]" />, texto: "resto de la tienda" },
        { muestra: <span className="inline-block h-1.5 w-3 rounded-[1px] bg-warn" />, texto: "semana con anuncios" },
        { muestra: <span className="inline-block h-1.5 w-3 rounded-[1px] border border-line-strong" />, texto: "sin anuncios" },
        { muestra: null, texto: "sin marca: sin dato" },
      ]} />
      <Cifras>
        <Campo etiqueta="Con anuncios"><span className={mono}>{con.bot} de {con.tienda} · {pctDe(con.bot, con.tienda)}</span> <span className="text-text2">en {con.semanas} {con.semanas === 1 ? "semana" : "semanas"}</span></Campo>
        <Campo etiqueta="Sin anuncios"><span className={mono}>{sin.bot} de {sin.tienda} · {pctDe(sin.bot, sin.tienda)}</span> <span className="text-text2">en {sin.semanas} {sin.semanas === 1 ? "semana" : "semanas"}</span></Campo>
        {ultima && <Campo etiqueta="Esta semana"><span className={mono}>{ultima.delBot} de {ultima.llantasTienda}</span> <span className="text-text2">desde el lunes {diaCorto(ultima.lunes)} · {num(ultima.chats)} chats</span></Campo>}
      </Cifras>
      <p className="text-[12px] text-text2">Últimas 12 semanas, no cambia con el mes. «Con anuncios»: al menos 10 chats y el 30 % llegaron desde un anuncio. Comparar semanas muestra asociación, no causa.</p>
    </Bloque>
  );
}

function Leyenda({ items }: { items: Array<{ muestra: ReactNode; texto: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text2">
      {items.map((it) => <li key={it.texto} className="flex items-center gap-1.5">{it.muestra}{it.texto}</li>)}
    </ul>
  );
}

/* ── Bloque 3 · Del chat a la factura ──────────────────────────────────── */

export function DelChatALaFacturaBloque({ c, estado, periodoTexto }: { c: MetricasComprobables | undefined; estado: EstadoComprobables; periodoTexto: string }) {
  if (estado !== "listo" || !c) {
    return <Bloque titulo="Del chat a la factura" nota="cohorte del período"><SinDatos estado={estado} /></Bloque>;
  }
  const e = c.embudo;
  const { conDia, sinDia } = e.porDia;
  return (
    <Bloque titulo="Del chat a la factura" nota={`chats creados ${periodoTexto} · facturas de cualquier fecha`}>
      <FunnelChart pasos={[
        { label: "Chats", valor: e.chats },
        { label: "Con medida", valor: e.conMedida },
        { label: "Cotizados", valor: e.cotizados },
        { label: "Día de visita", valor: e.conDiaDeVisita },
        { label: "Compraron", valor: e.compraron },
      ]} />
      {!e.madura && (
        <Aviso>
          Todavía madurando: hay chats de menos de 14 días{c.rezago.medianaDias != null ? ` y la mitad de las compras llega después de ${c.rezago.medianaDias} ${c.rezago.medianaDias === 1 ? "día" : "días"}` : ""}. «Compraron» va a crecer.
        </Aviso>
      )}
      <Cifras>
        <Campo etiqueta="Acordaron día"><span className={mono}>{conDia.compraron} de {num(conDia.chats)} compraron · {pctDe(conDia.compraron, conDia.chats)}</span></Campo>
        <Campo etiqueta="No acordaron"><span className={mono}>{sinDia.compraron} de {num(sinDia.chats)} · {pctDe(sinDia.compraron, sinDia.chats)}</span></Campo>
      </Cifras>
      <p className="text-[12px] text-text2">Cada paso es un hecho guardado: la medida en la ficha, una cotización enviada, un día de visita, una factura en Contífico.</p>
    </Bloque>
  );
}

/* ── Bloque 4 · Cuánto tardan en comprar ───────────────────────────────── */

export function CuantoTardanBloque({ c, estado }: { c: MetricasComprobables | undefined; estado: EstadoComprobables }) {
  if (estado !== "listo" || !c) {
    return <Bloque titulo="Cuánto tardan en comprar" nota="del primer mensaje a la factura"><SinDatos estado={estado} /></Bloque>;
  }
  const r = c.rezago;
  const en = (dias: number) => r.acumulado.find((a) => a.dias === dias)?.pct;
  const unDia = en(1);
  const semana = en(7);
  return (
    <Bloque titulo="Cuánto tardan en comprar" nota="todo el histórico · no cambia con el mes">
      {r.n === 0 || r.medianaDias == null ? (
        <p className="text-[13px] text-text2">Sin ventas comprobadas todavía.</p>
      ) : (
        <>
          <Cifra valor={`${dec(r.medianaDias)} ${r.medianaDias === 1 ? "día" : "días"}`}>
            la mitad de las {num(r.n)} ventas se facturó hasta acá desde el primer mensaje
          </Cifra>
          <LineChart
            alto={200} unidad="% de las ventas" fmt={(v) => `${Math.round(v)} %`} etiqueta="Porcentaje de ventas facturadas hasta cada día desde el primer mensaje"
            data={r.acumulado.map((a) => ({ x: `≤${a.dias} d`, y: a.pct }))}
          />
          <Cifras>
            {unDia != null && <Campo etiqueta="En un día o menos"><span className={mono}>{dec(unDia)} %</span></Campo>}
            {semana != null && <Campo etiqueta="En una semana o menos"><span className={mono}>{dec(semana)} %</span></Campo>}
            <Campo etiqueta="Por llegar en 14 días">
              <span className={mono}>~{dec(r.porLlegar.esperado)}</span> <span className="text-text2">ventas (entre {num(r.porLlegar.bajo)} y {num(r.porLlegar.alto)}), de {num(r.porLlegar.chatsVivos)} chats vivos</span>
            </Campo>
          </Cifras>
          <p className="text-[12px] text-text2">Sobre {ventasN(r.n)}. «Por llegar» estima con lo que compran los chats de más de 30 días y lo que suelen tardar: es un rango, no una promesa.</p>
        </>
      )}
    </Bloque>
  );
}

/* ── Bloque 5 · Cuándo escriben y cuándo se factura ────────────────────── */

export function CuandoBloque({ c, estado }: { c: MetricasComprobables | undefined; estado: EstadoComprobables }) {
  if (estado !== "listo" || !c) {
    return <Bloque titulo="Cuándo escriben y cuándo se factura" nota="hora de Guayaquil"><SinDatos estado={estado} /></Bloque>;
  }
  const k = c.cuando;
  const porDia = <T extends { dia: number }>(xs: T[]) => LUN_A_DOM.map((d) => xs.find((x) => x.dia === d)).filter((x): x is T => !!x);
  const botTotal = k.facturanPorFranja.reduce((t, f) => t + f.bot, 0);
  const tiendaTotal = k.facturanPorFranja.reduce((t, f) => t + f.tienda, 0);
  const picoBot = k.facturanPorFranja.reduce<(typeof k.facturanPorFranja)[number] | null>((m, f) => (f.bot > (m?.bot ?? 0) ? f : m), null);

  return (
    <Bloque titulo="Cuándo escriben y cuándo se factura" nota={`todo el histórico · ${ventasN(k.ventasTotales)} · hora de Guayaquil`}>
      {!k.suficiente && (
        <Aviso>Pocas ventas todavía: patrón tentativo. Son {ventasN(k.ventasTotales)}; con 40 el reparto por día y franja empieza a ser firme.</Aviso>
      )}
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-[13px] font-medium">Cuándo escriben <span className="font-normal text-text2">· por la hora del primer mensaje</span></h3>
          <FilasEscriben filas={k.escribenPorFranja.map((f) => ({ clave: f.franja, nombre: FRANJA[f.franja].nombre, sub: FRANJA[f.franja].horas, chats: f.chats, ventas: f.ventas }))} />
          <FilasEscriben filas={porDia(k.escribenPorDia).map((d) => ({ clave: String(d.dia), nombre: DIA[d.dia], chats: d.chats, ventas: d.ventas }))} />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-[13px] font-medium">Cuándo se factura <span className="font-normal text-text2">· del bot dentro de toda la tienda</span></h3>
          <BarrasDeParte
            ancho={560} alto={200} unidad="facturas" etiqueta="Facturas de llantas por franja horaria: de la tienda y del bot"
            data={k.facturanPorFranja.map((f) => ({ x: FRANJA[f.franja].corto, total: f.tienda, parte: f.bot, detalle: `${f.bot} de ${f.tienda} · ${FRANJA[f.franja].horas}` }))}
          />
          <BarrasDeParte
            ancho={560} alto={200} unidad="facturas" etiqueta="Facturas de llantas por día de la semana: de la tienda y del bot"
            data={porDia(k.facturanPorDia).map((d) => ({ x: DIA_CORTO[d.dia], total: d.tienda, parte: d.bot, detalle: `${d.bot} de ${d.tienda} · ${DIA[d.dia].toLowerCase()}` }))}
          />
          <Cifras>
            {picoBot && <Campo etiqueta="Pico del bot"><span className={mono}>{FRANJA[picoBot.franja].horas}</span> <span className="text-text2">{picoBot.bot} de {botTotal} facturas del bot</span></Campo>}
            <Campo etiqueta="Toda la tienda"><span className={mono}>{num(tiendaTotal)}</span> <span className="text-text2">facturas con llantas</span></Campo>
          </Cifras>
        </div>
      </div>
    </Bloque>
  );
}

/**
 * Chats y ventas por franja o por día: la barra da la escala de chats; al lado,
 * cuántos compraron y cada cuántos. Una franja con cientos de chats y cero
 * ventas (la noche, el sábado) es justo lo que hay que ver.
 */
function FilasEscriben({ filas }: { filas: Array<{ clave: string; nombre: string; sub?: string; chats: number; ventas: number }> }) {
  const max = Math.max(1, ...filas.map((f) => f.chats));
  return (
    <div className="flex flex-col gap-1.5 text-[13px]" role="table">
      <div role="row" className="grid grid-cols-[84px_minmax(0,1fr)_44px_32px_44px] items-baseline gap-2 text-[11px] text-text2">
        <span role="columnheader" /><span role="columnheader" />
        <span role="columnheader" className="text-right">chats</span>
        <span role="columnheader" className="text-right">ventas</span>
        <span role="columnheader" className="text-right">c/100</span>
      </div>
      {filas.map((f) => (
        <div key={f.clave} role="row" className="grid grid-cols-[84px_minmax(0,1fr)_44px_32px_44px] items-center gap-2">
          <span role="cell" className="leading-tight">
            {f.nombre}
            {f.sub && <span className="block text-[11px] text-text2">{f.sub}</span>}
          </span>
          <span role="cell" className="h-3.5 overflow-hidden rounded-[3px] bg-black/[.06]">
            <span className="block h-full rounded-[3px]" style={{ width: `${Math.max(f.chats > 0 ? 2 : 0, (f.chats / max) * 100)}%`, background: "rgba(28,27,25,.40)" }} />
          </span>
          <span role="cell" className={`${mono} text-right`}>{num(f.chats)}</span>
          <span role="cell" className={`${mono} text-right ${f.ventas === 0 ? "text-text2" : "font-medium"}`}>{f.ventas}</span>
          <span role="cell" className={`${mono} text-right text-[12px] text-text2`}>{f.chats > 0 ? dec(Math.round((f.ventas / f.chats) * 1000) / 10) : "—"}</span>
        </div>
      ))}
    </div>
  );
}
