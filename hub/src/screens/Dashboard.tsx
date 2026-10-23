import { useMemo, type ReactNode } from "react";
import { BillingSection } from "../components/billing";
import { BarChart, LineChart } from "../components/charts";
import {
  Bloque, Cargando, Cifras, CuandoBloque, CuantoTardanBloque, DelChatALaFacturaBloque, ParteDeLaTiendaBloque,
  VentasComprobadasBloque, estadoComprobables,
} from "../components/comprobables";
import { SelectorDeMes, etiquetaDeMes } from "../components/mes";
import { Campo, PageHeader } from "../components/ui";
import { TODOS } from "../data/types";
import { money, relTime } from "../lib/format";
import { navigate } from "../router";
import { mesEnCurso, useHub, useNow } from "../store";

const mono = "tnum font-mono";
const pct = (n: number) => `${Math.round(n)} %`;
const usdCorto = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10_000 ? 0 : 1).replace(".", ",")}k` : `$${Math.round(v)}`);

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

  return (
    <div className="flex h-full flex-col">
      <div className="hidden md:block">
        <PageHeader titulo="Métricas" sub="Sólo lo que se comprueba"><SelectorDeMes /></PageHeader>
      </div>
      <div className="px-4 pt-3 md:hidden"><SelectorDeMes className="max-w-full" /></div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 md:px-8 md:pb-8">
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-text2">
            {periodo.todos
              ? "Todo lo que hay en la base, sin recortar por mes."
              : `Los contadores arrancan de cero el día 1 y vuelven a empezar en ${periodo.proximo}. Los meses anteriores siguen acá al lado.`}
            {" "}Las ventas son facturas de Contífico cruzadas con el teléfono del chat.
          </p>

          {/* KPIs */}
          <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-line bg-surface lg:grid-cols-5">
            <Kpi nombre="Conversaciones" valor={guion(s?.conversaciones ?? 0)} nota={`chats que se movieron ${enElPeriodo}`} />
            <Kpi nombre="Cotizaciones" valor={guion(s?.cotizaciones ?? 0)} nota={`enviadas ${enElPeriodo}`} />
            <Kpi
              nombre="Con día de visita"
              valor={guion(comprobado((k) => k.embudo.conDiaDeVisita))}
              nota={listo ? `de ${listo.embudo.chats.toLocaleString("es-EC")} chats creados ${enElPeriodo}` : "chats que acordaron un día"}
            />
            <Kpi
              nombre="Ventas comprobadas"
              valor={guion(comprobado((k) => <>{k.ventas.n}<span className="ml-2 text-[15px] tracking-normal text-text2 md:text-[17px]">{money(k.ventas.conIva)}</span></>))}
              nota="facturas de Contífico, con IVA"
            />
            <Kpi
              nombre="Parte de la tienda"
              valor={guion(comprobado((k) => (k.participacion.periodo.llantasTienda > 0 ? `${k.participacion.periodo.pct.toLocaleString("es-EC", { maximumFractionDigits: 1 })} %` : "—")))}
              nota={listo ? `${listo.participacion.periodo.delBot} de ${listo.participacion.periodo.llantasTienda} facturas de llantas` : "de las facturas de llantas"}
              ultima
            />
          </div>

          <VentasComprobadasBloque c={c} vc={vc} estado={estado} enElPeriodo={enElPeriodo} now={now} />

          {/* Parte de la tienda · del chat a la factura */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ParteDeLaTiendaBloque c={c} estado={estado} enElPeriodo={enElPeriodo} />
            <DelChatALaFacturaBloque c={c} estado={estado} periodoTexto={enElPeriodo} />
          </div>

          {/* Cuánto tardan · conversaciones por día */}
          <div className="grid gap-4 lg:grid-cols-2">
            <CuantoTardanBloque c={c} estado={estado} />
            <Bloque titulo="Conversaciones por día" nota={periodo.todos ? "todo el histórico · eje X: fecha" : `del 1 de ${periodo.mes} a hoy · eje X: fecha`}>
              {cargando ? <Cargando /> : <LineChart data={porDia} unidad="conversaciones" etiqueta="Conversaciones por día" />}
            </Bloque>
          </div>

          <CuandoBloque c={c} estado={estado} />

          {/* Dinero · inventario · plantillas */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Bloque titulo="Dinero" nota={periodo.esElMesEnCurso ? "en juego y cotizado" : `cotizado ${enElPeriodo}`}>
              {cargando ? <Cargando /> : (
                <BarChart
                  ancho={420} alto={200} unidad="USD" fmt={usdCorto} etiqueta="Dinero en juego y cotizado"
                  data={[
                    ...(periodo.esElMesEnCurso ? [{ x: "En juego", y: s?.enJuego ?? 0 }] : []),
                    { x: "Cotizado", y: s?.cotizado ?? 0 },
                  ]}
                />
              )}
              <Cifras>
                {periodo.esElMesEnCurso && <Campo etiqueta="En juego"><span className={mono}>{guion(money(s?.enJuego ?? 0))}</span></Campo>}
                <Campo etiqueta="Cotizado"><span className={mono}>{guion(money(s?.cotizado ?? 0))}</span></Campo>
              </Cifras>
              <p className="text-[12px] text-text2">Lo vendido está arriba, en «Ventas comprobadas»: sale de las facturas, no de lo que se marca en el tablero.</p>
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
          </div>

          {/* Entregas · tokens y cuenta */}
          <div className="grid gap-4 lg:grid-cols-3">
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

            <BillingSection />
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

          {/* Actividad */}
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
      </div>
    </div>
  );
}

function Kpi({ nombre, valor, nota, ultima = false }: { nombre: string; valor: ReactNode; nota: string; ultima?: boolean }) {
  return (
    <div className={`flex flex-col gap-1.5 px-5 pt-[18px] pb-5 ${ultima ? "" : "border-b border-line lg:border-b-0 lg:border-r"} [&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r`}>
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
