import type { ReactNode } from "react";
import type { Franja, MetricasComprobables, VentasConfirmadas } from "../data/types";
import { money, relTime } from "../lib/format";
import { navigate } from "../router";
import { BarrasDeParte, BarrasPareadas, FunnelChart, LineChart } from "./charts";
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

/** El mismo aviso, chico, al lado del título del bloque. */
function ChipAviso({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(168,115,31,.08)] px-2.5 py-0.5 text-[12px] font-medium text-warn">
      <span className="size-[7px] shrink-0 rounded-full bg-warn" aria-hidden />
      {children}
    </span>
  );
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
  { clave: "bot", nombre: "Bot solo", nota: "el asesor escribió 0 o 1 mensajes", tinta: "rgba(180,69,58,1)" },
  { clave: "bot_y_asesor", nombre: "Bot + asesor", nota: "los dos trabajaron el chat", tinta: "rgba(180,69,58,.55)" },
  { clave: "asesor", nombre: "Asesor", nota: "el asesor escribió más que el bot", tinta: "rgba(180,69,58,.25)" },
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
      <div className="grid grid-cols-[minmax(110px,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
        {GRUPOS.map((g) => (
          <Campo key={g.clave} etiqueta={g.nombre}>
            <span className="inline-block size-2.5 translate-y-[1px] rounded-[2px]" style={{ background: g.tinta }} aria-hidden />{" "}
            <span className={mono}>{grupos[g.clave].n} · {money(grupos[g.clave].conIva)}</span>{" "}
            <span className="text-text2">{g.nota}</span>
          </Campo>
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
      <Leyenda items={[
        { muestra: <span className="inline-block size-2.5 rounded-[2px] bg-[#d9d6cf]" />, texto: "facturas con llantas de la tienda" },
        { muestra: <span className="inline-block size-2.5 rounded-[2px] bg-signal" />, texto: "las que vinieron del bot" },
        { muestra: <span className="inline-block h-[3px] w-3 bg-ok" />, texto: "semana con anuncios" },
      ]} />
      <BarrasDeParte
        unidad="facturas" etiqueta="Facturas de llantas de la tienda por semana, la parte del bot y si hubo anuncios"
        data={semanas.map((s) => ({
          x: diaCorto(s.lunes), total: s.llantasTienda, parte: s.delBot, marca: s.anuncios, encima: s.delBot > 0 ? String(s.delBot) : undefined,
          detalle: `${s.delBot} de ${s.llantasTienda} · sem. ${diaCorto(s.lunes)} · ${marca[s.anuncios]}`,
        }))}
      />
      <Cifras>
        <Campo etiqueta="Con anuncios"><span className={mono}>{con.bot} de {con.tienda} · {pctDe(con.bot, con.tienda)}</span> <span className="text-text2">en {con.semanas} {con.semanas === 1 ? "semana" : "semanas"}</span></Campo>
        <Campo etiqueta="Sin anuncios"><span className={mono}>{sin.bot} de {sin.tienda} · {pctDe(sin.bot, sin.tienda)}</span> <span className="text-text2">en {sin.semanas} {sin.semanas === 1 ? "semana" : "semanas"}</span></Campo>
        {ultima && <Campo etiqueta="Esta semana"><span className={mono}>{ultima.delBot} de {ultima.llantasTienda}</span> <span className="text-text2">desde el lunes {diaCorto(ultima.lunes)} · {num(ultima.chats)} chats</span></Campo>}
      </Cifras>
      <p className="text-[12px] text-text2">Últimas 12 semanas, no cambia con el mes. «Con anuncios»: al menos 10 chats y el 30 % llegaron desde un anuncio de Meta; «sin ads» la marca la semana sin anuncios y las semanas sin marca son de antes de que el bot guardara el anuncio. Comparar semanas muestra asociación, no causa.</p>
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

/* ── Bloque 5 · Cuándo escriben (General) y cuándo se factura (Ventas) ── */

/** Con menos de 40 ventas el reparto por franja y día todavía puede darse vuelta. */
function avisoMuestra(k: MetricasComprobables["cuando"]) {
  return k.suficiente ? undefined : <ChipAviso>{ventasN(k.ventasTotales)} · pocas todavía: patrón tentativo</ChipAviso>;
}

const porDiaLunADom = <T extends { dia: number }>(xs: T[]) => LUN_A_DOM.map((d) => xs.find((x) => x.dia === d)).filter((x): x is T => !!x);

/**
 * Chats y ventas por la hora y el día del primer mensaje: la barra es cuántos
 * escriben; el número encima, cuántos de esos compraron. Una franja con
 * cientos de chats y cero ventas (la noche, el sábado) es justo lo que hay que ver.
 */
export function CuandoEscribenBloque({ c, estado }: { c: MetricasComprobables | undefined; estado: EstadoComprobables }) {
  if (estado !== "listo" || !c) {
    return <Bloque titulo="Cuándo escriben" nota="hora de Guayaquil"><SinDatos estado={estado} /></Bloque>;
  }
  const k = c.cuando;
  const sinVentas = k.escribenPorFranja.filter((f) => f.ventas === 0 && f.chats > 0);
  const sabado = k.escribenPorDia.find((d) => d.dia === 6);
  return (
    <Bloque titulo="Cuándo escriben" nota={avisoMuestra(k) ?? `todo el histórico · ${ventasN(k.ventasTotales)}`}>
      {/* Uno debajo del otro: el bloque vive en media columna y lado a lado no se leen. */}
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-[13px] font-medium">Por franja <span className="font-normal text-text2">· hora de Guayaquil</span></h3>
          <BarrasDeParte
            alto={200} unidad="chats" etiqueta="Chats por franja de inicio, con las ventas comprobadas encima"
            data={k.escribenPorFranja.map((f) => ({
              x: FRANJA[f.franja].corto, total: f.chats, encima: f.ventas > 0 ? `${f.ventas} v` : "0",
              detalle: `${num(f.chats)} chats · ${f.ventas} ventas · ${FRANJA[f.franja].horas}`,
            }))}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-[13px] font-medium">Por día de la semana</h3>
          <BarrasDeParte
            alto={200} unidad="chats" etiqueta="Chats por día de la semana, con las ventas comprobadas encima"
            data={porDiaLunADom(k.escribenPorDia).map((d) => ({
              x: DIA_CORTO[d.dia], total: d.chats, encima: d.ventas > 0 ? `${d.ventas} v` : "0",
              detalle: `${num(d.chats)} chats · ${d.ventas} ventas · ${DIA[d.dia].toLowerCase()}`,
            }))}
          />
        </div>
      </div>
      <p className="text-[12px] leading-relaxed text-text2">
        Barra = chats que empezaron ahí · número = ventas comprobadas de esos chats («v»).
        {sinVentas.length > 0 && ` ${sinVentas.map((f) => `${FRANJA[f.franja].nombre} (${FRANJA[f.franja].horas}): ${num(f.chats)} chats y ninguno compró`).join("; ")}.`}
        {sabado && sabado.chats > 0 && sabado.ventas === 0 && ` Sábado: ${num(sabado.chats)} chats y ninguno compró.`}
      </p>
    </Bloque>
  );
}

/**
 * A qué hora y qué día se emiten las facturas del bot, contra las de toda la
 * tienda, cada una en % de su propio total: 26 contra 174 no se comparan en
 * cantidades.
 */
export function CuandoSeFacturaBloque({ c, estado }: { c: MetricasComprobables | undefined; estado: EstadoComprobables }) {
  if (estado !== "listo" || !c) {
    return <Bloque titulo="Cuándo se factura" nota="hora de Guayaquil"><SinDatos estado={estado} /></Bloque>;
  }
  const k = c.cuando;
  const botTotal = k.facturanPorFranja.reduce((t, f) => t + f.bot, 0);
  const tiendaTotal = k.facturanPorFranja.reduce((t, f) => t + f.tienda, 0);
  const p = (n: number, t: number) => (t > 0 ? Math.round((n / t) * 1000) / 10 : 0);
  const picoBot = k.facturanPorFranja.reduce<(typeof k.facturanPorFranja)[number] | null>((m, f) => (f.bot > (m?.bot ?? 0) ? f : m), null);
  const fmtPct = (v: number) => `${Math.round(v)} %`;
  return (
    <Bloque titulo="Cuándo se factura" nota={avisoMuestra(k) ?? `todo el histórico · ${ventasN(k.ventasTotales)}`}>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-[13px] font-medium">Por franja <span className="font-normal text-text2">· % de facturas con llantas</span></h3>
          <BarrasPareadas
            unidad="% de facturas" fmt={fmtPct} etiqueta="Facturas por franja horaria: porcentaje del bot contra porcentaje de la tienda"
            data={k.facturanPorFranja.map((f) => ({
              x: FRANJA[f.franja].corto, a: p(f.bot, botTotal), b: p(f.tienda, tiendaTotal),
              detalle: `bot ${f.bot} de ${botTotal} · tienda ${f.tienda} de ${tiendaTotal}`,
            }))}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-[13px] font-medium">Por día de la semana <span className="font-normal text-text2">· % de facturas con llantas</span></h3>
          <BarrasPareadas
            unidad="% de facturas" fmt={fmtPct} etiqueta="Facturas por día de la semana: porcentaje del bot contra porcentaje de la tienda"
            data={porDiaLunADom(k.facturanPorDia).map((d) => ({
              x: DIA_CORTO[d.dia], a: p(d.bot, botTotal), b: p(d.tienda, tiendaTotal),
              detalle: `bot ${d.bot} de ${botTotal} · tienda ${d.tienda} de ${tiendaTotal}`,
            }))}
          />
        </div>
      </div>
      <Leyenda items={[
        { muestra: <span className="inline-block size-2.5 rounded-[2px] bg-signal" />, texto: `Bot (${num(botTotal)} facturas)` },
        { muestra: <span className="inline-block size-2.5 rounded-[2px] bg-[#d9d6cf]" />, texto: `Tienda (${num(tiendaTotal)} facturas con llantas, incluidas las del bot)` },
      ]} />
      <Cifras>
        {picoBot && <Campo etiqueta="Pico del bot"><span className={mono}>{FRANJA[picoBot.franja].nombre} {FRANJA[picoBot.franja].horas}</span> <span className="text-text2">{picoBot.bot} de {botTotal} facturas del bot · {pctDe(picoBot.bot, botTotal)}</span></Campo>}
        {picoBot && <Campo etiqueta="La tienda, ahí"><span className={mono}>{pctDe(k.facturanPorFranja.find((f) => f.franja === picoBot.franja)?.tienda ?? 0, tiendaTotal)}</span> <span className="text-text2">de sus facturas con llantas</span></Campo>}
      </Cifras>
    </Bloque>
  );
}
