import { useMemo, type ReactNode } from "react";
import { BillingSection } from "../components/billing";
import { BarChart, LineChart } from "../components/charts";
import {
  Bloque, Cargando, Cifras, CuandoEscribenBloque, CuandoSeFacturaBloque, CuantoTardanBloque, DelChatALaFacturaBloque,
  ParteDeLaTiendaBloque, VentasComprobadasBloque, estadoComprobables,
} from "../components/comprobables";
import { SelectorDeMes, etiquetaDeMes } from "../components/mes";
import { Campo, PageHeader } from "../components/ui";
import { TODOS } from "../data/types";
import { money, relTime } from "../lib/format";
import { navigate } from "../router";
import { mesEnCurso, useHub, useNow } from "../store";

const mono = "tnum font-mono";
const pct = (n: number) => `${Math.round(n)} %`;
/** Dólares enteros para los KPIs: en una celda de celular «$11.774,00» no entra. */
const usd = (v: number) => `$${Math.round(v).toLocaleString("es-EC")}`;

export function Dashboard() {
  const { feed, metrics } = useHub();
  const mesElegido = useHub((s) => s.mes);
  const now = useNow();

  // Mientras no llegan los números del mes elegido, la pantalla no inventa
  // ninguno: un guion dice «todavía no sé»; un número equivocado dice una
  // mentira con la misma tipografía que la verdad.
  const cargando = metrics === null;

  const periodo = useMemo(() => {
    const clave = metrics?.periodo?.clave ?? mesElegido;
    const todos = metrics?.periodo?.todos ?? clave === TODOS;
    return {
      todos,
      esElMesEnCurso: clave === mesEnCurso(),
      mes: etiquetaDeMes(clave),
      proximo: todos ? "" : etiquetaDeMes(claveDelMesSiguiente(clave)),
    };
  }, [metrics, mesElegido]);

  const s = metrics?.summary;
  const enElPeriodo = periodo.todos ? "en todo el histórico" : `en ${periodo.mes}`;

  // Sólo números comprobables (Manuel, 23-oct): las ventas salen de facturas
  // de Contífico, no del «ganado» marcado a mano en el tablero. Por eso ya no
  // están acá el embudo por etapas, «Hasta dónde llega el bot», el impacto de
  // descuentos ni lo «vendido» del Kanban.
  const c = metrics?.comprobables;
  const vc = metrics?.ventasConfirmadas;
  const estado = estadoComprobables(c, vc, cargando);
  const listo = estado === "listo" && c ? c : null;

  // Un punto por día. El rótulo es la fecha corta: «12/9».
  const porDia = useMemo(
    () => (metrics?.daily ?? []).map((d) => {
      const fecha = new Date(`${d.day}T12:00:00`);
      return { x: `${fecha.getDate()}/${fecha.getMonth() + 1}`, y: d.value };
    }),
    [metrics],
  );

  const fu = metrics?.followUps;
  const inv = metrics?.inventory;
  const piezas = metrics?.visualPieces ?? [];
  const piezasFallidas = piezas.reduce((t, p) => t + p.failed, 0);

  const guion = (v: ReactNode) => (cargando ? <span className="text-text2">—</span> : v);
  /** Lo que sale de Contífico: guion también mientras no hay facturas leídas. */
  const comprobado = (v: (c: NonNullable<typeof listo>) => ReactNode) => (listo ? v(listo) : <span className="text-text2">—</span>);

  // Dos secciones en la misma pantalla (Manuel, 23-oct): arriba lo que se
  // mueve todos los días (cuánta gente escribe y cómo se la atiende); abajo
  // solo lo que Contífico comprueba con una factura.
  const fmtPct = (v: number) => `${v.toLocaleString("es-EC", { maximumFractionDigits: 1 })} %`;
  const saltos = <SaltoDeSeccion />;

  return (
    <div className="flex h-full flex-col">
      <div className="hidden md:block">
        <PageHeader titulo="Métricas" sub="El negocio de un vistazo">{saltos}<SelectorDeMes /></PageHeader>
      </div>
      <div className="flex flex-col gap-2 px-4 pt-3 md:hidden"><SelectorDeMes className="max-w-full" />{saltos}</div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 md:px-8 md:pb-8">
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-text2">
            {periodo.todos
              ? "Todo lo que hay en la base, sin recortar por mes."
              : `Los contadores arrancan de cero el día 1 y vuelven a empezar en ${periodo.proximo}. Los meses anteriores siguen acá al lado.`}
          </p>

          {/* ── General ── */}
          <Seccion id="general" titulo="General" sub="cuánta gente escribe y cómo la atiende el bot" />
          <FilaKpis>
            <Kpi nombre="Conversaciones" valor={guion(s?.conversaciones ?? 0)} nota={`chats que se movieron ${enElPeriodo}`} />
            <Kpi nombre="Cotizaciones" valor={guion(s?.cotizaciones ?? 0)} nota={`enviadas ${enElPeriodo}`} />
            <Kpi
              nombre="Con día de visita"
              valor={guion(comprobado((k) => k.embudo.conDiaDeVisita))}
              nota={listo ? `de ${listo.embudo.chats.toLocaleString("es-EC")} chats creados ${enElPeriodo}` : "chats que acordaron un día"}
            />
            <Kpi
              nombre="Respuesta del bot"
              valor={guion(s?.primeraRespuestaSegundos ? `${Math.round(s.primeraRespuestaSegundos)} s` : "—")}
              nota="mediana hasta la primera respuesta"
            />
          </FilaKpis>

          <div className="grid gap-4 lg:grid-cols-2">
            <Bloque titulo="Conversaciones por día" nota={periodo.todos ? "todo el histórico · eje X: fecha" : `del 1 de ${periodo.mes} a hoy · eje X: fecha`}>
              {cargando ? <Cargando /> : <LineChart data={porDia} unidad="conversaciones" etiqueta="Conversaciones por día" />}
            </Bloque>
            <CuandoEscribenBloque c={c} estado={estado} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Bloque titulo="Plantillas de seguimiento" nota={enElPeriodo}>
              {cargando || !fu ? <Cargando /> : (
                <BarChart
                  ancho={420} alto={200} unidad="mensajes" etiqueta="Seguimientos programados, enviados y respondidos"
                  data={[{ x: "Programados", y: fu.scheduled }, { x: "Enviados", y: fu.sent }, { x: "Respondidos", y: fu.responded }]}
                />
              )}
              <Cifras>
                <Campo etiqueta="Responden"><span className={mono}>{guion(`${fu?.responded ?? 0} de ${fu?.sent ?? 0} · ${pct(fu?.sent ? (fu.responded / fu.sent) * 100 : 0)}`)}</span></Campo>
                <Campo etiqueta="Entregadas · leídas"><span className={mono}>{guion(`${fu?.template_delivered ?? 0} · ${fu?.template_read ?? 0}`)}</span></Campo>
                <Campo etiqueta="Cancelados por respuesta"><span className={mono}>{guion(fu?.cancelled_by_reply ?? 0)}</span></Campo>
                <Campo etiqueta="Ventanas perdidas"><span className={mono}>{guion(fu?.missed_windows ?? 0)}</span></Campo>
                <Campo etiqueta="Pidieron no seguir"><span className={mono}>{guion(fu?.opt_outs ?? 0)}</span></Campo>
                <Campo etiqueta="Clientes molestos"><span className={mono}>{guion(fu?.negative ?? 0)}</span></Campo>
                <Campo etiqueta="Hasta la respuesta"><span className={mono}>{guion(fu?.avg_response_seconds == null ? "—" : `${Math.round(fu.avg_response_seconds / 60)} min`)}</span></Campo>
              </Cifras>
            </Bloque>
            <Bloque titulo="Estados de entrega" nota="lo que WhatsApp confirmó">
              {cargando ? <Cargando /> : (
                <BarChart
                  ancho={420} alto={200} unidad="mensajes" etiqueta="Mensajes por estado de entrega"
                  data={(metrics?.deliveries ?? []).map((d) => ({ x: deliveryLabel(d.status), y: d.value }))}
                />
              )}
              {piezas.length > 0 && (
                <Cifras>
                  {piezas.map((p) => (
                    <Campo key={p.piece} etiqueta={p.label}>
                      <span className={mono}>{p.sent} enviadas</span>
                      {p.failed > 0 && <span className="text-signal"> · {p.failed} fallidas</span>}
                      {p.renderErrors > 0 && <span className="text-text2"> · {p.renderErrors} con error de render</span>}
                    </Campo>
                  ))}
                  {piezasFallidas > 0 && <p className="col-span-2 text-[12px] text-text2">Una pieza fallida deja al cliente con el mensaje en texto.</p>}
                </Cifras>
              )}
            </Bloque>

            <Bloque titulo="Inventario real" nota={inv?.lastSync ? `${inv.source ?? "catálogo"} · ${relTime(inv.lastSync, now)}` : "sin sincronizar"}>
              {cargando || !inv ? <Cargando /> : (
                <BarChart
                  ancho={420} alto={200} unidad="modelos" etiqueta="Modelos disponibles, por confirmar y agotados"
                  data={[{ x: "Disponibles", y: inv.available }, { x: "Por confirmar", y: inv.check }, { x: "Agotados", y: inv.out }]}
                />
              )}
              <Cifras>
                <Campo etiqueta="Modelos"><span className={mono}>{guion(inv?.total ?? 0)}</span></Campo>
                <Campo etiqueta="Marcas"><span className={mono}>{guion(inv?.brands ?? 0)}</span></Campo>
                <Campo etiqueta="Con imagen"><span className={mono}>{guion(`${inv?.withImage ?? 0} de ${inv?.total ?? 0} · ${pct(inv?.imageCoverage ?? 0)}`)}</span></Campo>
              </Cifras>
            </Bloque>

          </div>

          {fu && fu.byStageAndType.length > 0 && (
            <Bloque titulo="Seguimientos por etapa y tipo">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="text-[12px] font-medium text-text2">
                    <tr><th className="py-2">Etapa</th><th>Tipo</th><th className="text-right">Total</th><th className="text-right">Enviados</th></tr>
                  </thead>
                  <tbody>
                    {fu.byStageAndType.map((row) => (
                      <tr key={`${row.stage}-${row.type}`} className="border-t border-line">
                        <td className="py-2">{row.stage}</td><td className="text-text2">{row.type}</td>
                        <td className={`${mono} text-right`}>{row.total}</td><td className={`${mono} text-right`}>{row.sent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Bloque>
          )}

          {/* Cuenta (ocupa dos columnas por su cuenta) · actividad */}
          <div className="grid gap-4 lg:grid-cols-3">
            <BillingSection />
            <Bloque titulo="Actividad en vivo" nota="lo último que pasó">
              <ul className="flex flex-col">
                {feed.slice(0, 9).map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => item.ticketId && navigate(`ticket/${item.ticketId}`)}
                      className="flex w-full items-baseline gap-3 border-b border-line py-2.5 text-left text-[13px] last:border-0 hover:bg-bg"
                    >
                      <span className="min-w-0 flex-1 truncate">{item.texto}</span>
                      <span className="tnum shrink-0 font-mono text-[11px] text-text2">{relTime(item.hora, now)}</span>
                    </button>
                  </li>
                ))}
                {feed.length === 0 && <li className="py-3 text-[13px] text-text2">Todavía no pasó nada hoy.</li>}
              </ul>
            </Bloque>
          </div>

          {/* ── Ventas ── */}
          <Seccion id="ventas" titulo="Ventas" sub="solo lo que Contífico comprueba con una factura" />
          <FilaKpis>
            <Kpi
              nombre="Ventas comprobadas"
              valor={guion(comprobado((k) => <>{k.ventas.n}<span className="ml-2 text-[15px] tracking-normal whitespace-nowrap text-text2 md:text-[17px]">{usd(k.ventas.conIva)}</span></>))}
              nota="facturas de Contífico con el teléfono del chat, con IVA"
            />
            <Kpi nombre="Sin IVA" valor={guion(comprobado((k) => usd(k.ventas.sinIva)))} nota="subtotal de esas mismas facturas" />
            <Kpi
              nombre="Parte de las llantas de la tienda"
              valor={guion(comprobado((k) => (k.participacion.periodo.llantasTienda > 0 ? fmtPct(k.participacion.periodo.pct) : "—")))}
              nota={listo ? `${listo.participacion.periodo.delBot} de ${listo.participacion.periodo.llantasTienda} facturas con llantas` : "de las facturas con llantas"}
            />
            <Kpi
              nombre="Por llegar en 14 días"
              valor={guion(comprobado((k) => <>~{k.rezago.porLlegar.esperado.toLocaleString("es-EC", { maximumFractionDigits: 1 })}<span className="ml-2 text-[15px] tracking-normal whitespace-nowrap text-text2 md:text-[17px]">· {k.rezago.porLlegar.bajo} a {k.rezago.porLlegar.alto}</span></>))}
              nota={listo ? `de ${listo.rezago.porLlegar.chatsVivos.toLocaleString("es-EC")} chats vivos que aún no compraron` : "ventas esperadas de chats abiertos"}
            />
          </FilaKpis>

          <div className="grid gap-4 lg:grid-cols-2">
            <VentasComprobadasBloque c={c} vc={vc} estado={estado} enElPeriodo={enElPeriodo} now={now} />
            <ParteDeLaTiendaBloque c={c} estado={estado} enElPeriodo={enElPeriodo} />
            <DelChatALaFacturaBloque c={c} estado={estado} periodoTexto={enElPeriodo} />
            <CuantoTardanBloque c={c} estado={estado} />
            <div className="lg:col-span-2"><CuandoSeFacturaBloque c={c} estado={estado} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Título de una sección de Métricas: más fuerte que el de un bloque, con una raya de tinta debajo. */
function Seccion({ id, titulo, sub }: { id: string; titulo: string; sub: string }) {
  return (
    <div id={id} className="mt-3 flex scroll-mt-3 flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b-2 border-text pb-1.5">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{titulo}</h2>
      <span className="text-[13px] text-text2">{sub}</span>
    </div>
  );
}

/**
 * Los dos saltos de sección. No son enlaces de ancla de verdad: el panel usa
 * el hash para la ruta (#/dashboard) y un «#ventas» lo sacaría de Métricas;
 * se desplaza el contenedor con scroll hasta la sección.
 */
function SaltoDeSeccion() {
  const ir = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <nav className="flex gap-3.5 text-[13px]" aria-label="Secciones de Métricas">
      {[["general", "General"], ["ventas", "Ventas"]].map(([id, nombre]) => (
        <a key={id} href={`#/dashboard`} onClick={ir(id)} className="border-b border-line-strong text-text2 hover:text-signal">{nombre}</a>
      ))}
    </nav>
  );
}

function FilaKpis({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-line bg-surface lg:grid-cols-4">{children}</div>;
}

function Kpi({ nombre, valor, nota }: { nombre: string; valor: ReactNode; nota: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 border-line px-5 pt-[18px] pb-5 [&:nth-child(-n+2)]:border-b [&:nth-child(odd)]:border-r lg:border-r lg:[&:nth-child(-n+2)]:border-b-0 lg:last:border-r-0">
      <span className="text-[13px] font-semibold">{nombre}</span>
      <span className="tnum font-mono text-[28px] leading-[1.1] font-medium tracking-[-0.02em] md:text-[32px]">{valor}</span>
      <span className="text-[12px] text-text2">{nota}</span>
    </div>
  );
}

/** "2026-09" → "2026-10". Para decir cuándo vuelve a empezar el conteo. */
function claveDelMesSiguiente(clave: string): string {
  const [año, mes] = clave.split("-").map(Number);
  if (!año || !mes) return clave;
  return mes === 12 ? `${año + 1}-01` : `${año}-${String(mes + 1).padStart(2, "0")}`;
}

function deliveryLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "En cola",
    sent: "Enviados",
    delivered: "Entregados",
    read: "Leídos",
    failed: "Fallidos",
    unknown: "Sin confirmar",
  };
  return labels[status.toLowerCase()] ?? status;
}
