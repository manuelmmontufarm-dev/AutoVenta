import { useMemo, type ReactNode } from "react";
import { BillingSection } from "../components/billing";
import { BarChart, FunnelChart, LineChart } from "../components/charts";
import { SelectorDeMes, etiquetaDeMes } from "../components/mes";
import { BlockTitle, Campo, PageHeader } from "../components/ui";
import { ETAPAS, ETAPA_META, TODOS } from "../data/types";
import { money, relTime } from "../lib/format";
import { navigate } from "../router";
import { mesEnCurso, useHub, useNow } from "../store";

/** Un bloque de Métricas: título, una nota, un gráfico y sus cifras debajo. */
export function Bloque({ titulo, nota, children, className = "" }: { titulo: string; nota?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-3.5 rounded-[10px] border border-line bg-surface px-5 pt-[18px] pb-4 ${className}`}>
      <BlockTitle aside={nota}>{titulo}</BlockTitle>
      {children}
    </section>
  );
}

/** Las cifras bajo un gráfico: etiqueta / valor, con línea arriba. */
export function Cifras({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[minmax(110px,auto)_minmax(0,1fr)] gap-x-4 gap-y-2.5 border-t border-line pt-3 text-[13px]">{children}</div>;
}

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
  const rf = metrics?.reachedFinal;
  const conversion = Math.round((rf?.ratio ?? 0) * 100);
  const enElPeriodo = periodo.todos ? "en todo el histórico" : `en ${periodo.mes}`;

  const embudo = useMemo(() => {
    const byStage = new Map((metrics?.funnel ?? []).map((item) => [item.stage, item.value]));
    return [
      ...ETAPAS.map((e) => ({ label: ETAPA_META[e].corto, valor: byStage.get(e) ?? 0 })),
      { label: "Ganado", valor: byStage.get("ganado") ?? 0 },
    ];
  }, [metrics]);

  // Un punto por día. El rótulo es la fecha corta: «12/9».
  const porDia = useMemo(
    () => (metrics?.daily ?? []).map((d) => {
      const fecha = new Date(`${d.day}T12:00:00`);
      return { x: `${fecha.getDate()}/${fecha.getMonth() + 1}`, y: d.value };
    }),
    [metrics],
  );
  const replyHours = metrics?.replyHours ?? [];
  const porHora = replyHours.map((h) => ({ x: `${String(h.hour).padStart(2, "0")}h`, y: h.replies }));
  const pico = replyHours.reduce<typeof replyHours[number] | null>((best, item) => (item.replies > (best?.replies ?? -1) ? item : best), null);

  const fu = metrics?.followUps;
  const dsc = metrics?.discounts;
  const inv = metrics?.inventory;
  const piezas = metrics?.visualPieces ?? [];
  const piezasFallidas = piezas.reduce((t, p) => t + p.failed, 0);

  const guion = (v: ReactNode) => (cargando ? <span className="text-text2">—</span> : v);

  return (
    <div className="flex h-full flex-col">
      <div className="hidden md:block">
        <PageHeader titulo="Métricas" sub="El negocio de un vistazo"><SelectorDeMes /></PageHeader>
      </div>
      <div className="px-4 pt-3 md:hidden"><SelectorDeMes className="max-w-full" /></div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 md:px-8 md:pb-8">
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-text2">
            {periodo.todos
              ? "Todo lo que hay en la base, sin recortar por mes."
              : `Los contadores arrancan de cero el día 1 y vuelven a empezar en ${periodo.proximo}. Los meses anteriores siguen acá al lado.`}
          </p>

          {/* KPIs */}
          <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-line bg-surface lg:grid-cols-5">
            <Kpi
              nombre={periodo.esElMesEnCurso ? "Abiertos ahora" : "Conversaciones"}
              valor={guion(periodo.esElMesEnCurso ? s?.abiertos ?? 0 : s?.conversaciones ?? 0)}
              nota={periodo.esElMesEnCurso ? "tickets sin cerrar" : `chats que se movieron ${enElPeriodo}`}
            />
            <Kpi nombre="Cotizaciones" valor={guion(s?.cotizaciones ?? 0)} nota={`enviadas ${enElPeriodo}`} />
            <Kpi
              nombre="Llegan a seguimiento"
              valor={guion(rf?.total ?? 0)}
              nota={periodo.esElMesEnCurso && rf ? `${rf.abiertosAhora} esperando la visita hoy` : `a la última columna ${enElPeriodo}`}
            />
            <Kpi nombre="Cotizado → seguimiento" valor={guion(pct(conversion))} nota={`${rf?.cotizadosQueLlegaron ?? 0} de ${rf?.cotizados ?? 0} cotizaciones`} />
            <Kpi
              nombre="Respuesta del bot"
              valor={guion(s?.primeraRespuestaSegundos ? `${Math.round(s.primeraRespuestaSegundos)} s` : "—")}
              nota="mediana hasta la primera respuesta"
              ultima
            />
          </div>

          {/* Por día · por hora */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Bloque titulo="Conversaciones por día" nota={periodo.todos ? "todo el histórico · eje X: fecha" : `del 1 de ${periodo.mes} a hoy · eje X: fecha`}>
              {cargando ? <Cargando /> : <LineChart data={porDia} unidad="conversaciones" etiqueta="Conversaciones por día" />}
            </Bloque>
            <Bloque titulo="¿A qué hora contestan más?" nota="respuestas de clientes por hora · hora de Guayaquil">
              {cargando ? <Cargando /> : <BarChart data={porHora} unidad="respuestas" etiqueta="Respuestas de clientes por hora del día" />}
              <Cifras>
                <Campo etiqueta="Hora pico">{pico ? <span className={mono}>{pico.label}–{String((pico.hour + 1) % 24).padStart(2, "0")}:00 · {pico.replies} respuestas</span> : <span className="text-text2">Sin datos</span>}</Campo>
              </Cifras>
            </Bloque>
          </div>

          {/* Dinero · hasta dónde llega el bot · inventario */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Bloque titulo="Dinero" nota={periodo.esElMesEnCurso ? "en juego y vendido" : `cotizado y vendido ${enElPeriodo}`}>
              {cargando ? <Cargando /> : (
                <BarChart
                  ancho={420} alto={200} unidad="USD" fmt={usdCorto} etiqueta="Dinero cotizado, en juego y vendido"
                  data={[
                    ...(periodo.esElMesEnCurso ? [{ x: "En juego", y: s?.enJuego ?? 0 }] : []),
                    { x: "Cotizado", y: s?.cotizado ?? 0 },
                    { x: "Vendido", y: s?.vendido ?? 0 },
                  ]}
                />
              )}
              <Cifras>
                {periodo.esElMesEnCurso && <Campo etiqueta="En juego"><span className={mono}>{guion(money(s?.enJuego ?? 0))}</span></Campo>}
                <Campo etiqueta="Cotizado"><span className={mono}>{guion(money(s?.cotizado ?? 0))}</span></Campo>
                <Campo etiqueta="Vendido"><span className={mono}>{guion(money(s?.vendido ?? 0))}</span></Campo>
                <Campo etiqueta="Ganados"><span className={mono}>{guion(s?.ganados ?? 0)}</span></Campo>
              </Cifras>
            </Bloque>

            <Bloque titulo="Hasta dónde llega el bot" nota="la venta se cierra en el local">
              {cargando || !rf ? <Cargando /> : (
                <BarChart
                  ancho={420} alto={200} unidad="tickets" etiqueta="Cotizados, llegados al final y confirmados como venta"
                  data={[{ x: "Cotizados", y: rf.cotizados }, { x: "Llegaron", y: rf.cotizadosQueLlegaron }, { x: "Venta", y: rf.ganados }]}
                />
              )}
              <Cifras>
                <Campo etiqueta="Llegaron al final"><span className={mono}>{guion(rf?.total ?? 0)}</span></Campo>
                <Campo etiqueta="De los cotizados"><span className={mono}>{guion(`${rf?.cotizadosQueLlegaron ?? 0} de ${rf?.cotizados ?? 0} · ${pct(conversion)}`)}</span></Campo>
                <Campo etiqueta="Confirmados"><span className={mono}>{guion(rf?.ganados ?? 0)}</span> <span className="text-text2">sólo los marcados a mano</span></Campo>
                <Campo etiqueta="Valor cotizado"><span className={mono}>{guion(money(rf?.valor ?? 0))}</span></Campo>
              </Cifras>
              <p className="text-[12px] leading-relaxed text-text2">La venta se cierra en el local y no vuelve al sistema. Lo que sí se mide es cuántos tickets llegan a «Seguimiento hasta venta»: el último punto que el bot controla.</p>
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

          {/* Embudo · plantillas · entregas */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Bloque titulo="Embudo" nota={periodo.todos ? "del histórico" : `de ${periodo.mes}`}>
              {cargando ? <Cargando /> : <FunnelChart pasos={embudo} />}
            </Bloque>

            <Bloque titulo="Plantillas de seguimiento" nota={enElPeriodo}>
              {cargando || !fu ? <Cargando /> : (
                <BarChart
                  ancho={420} alto={200} unidad="mensajes" etiqueta="Seguimientos programados, enviados, respondidos y ventas recuperadas"
                  data={[{ x: "Programados", y: fu.scheduled }, { x: "Enviados", y: fu.sent }, { x: "Respondidos", y: fu.responded }, { x: "Ventas", y: fu.converted }]}
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
          </div>

          {/* Descuentos · tokens y cuenta */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Bloque titulo="Impacto de descuentos" nota="% de cotizados que cierran">
              {cargando || !dsc ? <Cargando /> : (
                <BarChart
                  ancho={420} alto={200} unidad="de cierre" fmt={(v) => `${Math.round(v)} %`} etiqueta="Conversión con y sin descuento"
                  data={[{ x: "Con descuento", y: Math.round(dsc.conversionWith * 100) }, { x: "Sin descuento", y: Math.round(dsc.conversionWithout * 100) }]}
                />
              )}
              <Cifras>
                <Campo etiqueta="Ofrecidos"><span className={mono}>{guion(dsc?.offered ?? 0)}</span></Campo>
                <Campo etiqueta="Cerraron"><span className={mono}>{guion(dsc?.wonWith ?? 0)}</span></Campo>
                <Campo etiqueta="Total descontado"><span className={mono}>{guion(money(dsc?.totalDiscount ?? 0))}</span></Campo>
                <Campo etiqueta="Respuesta tras oferta"><span className={mono}>{guion(dsc?.avgHoursToReply == null ? "—" : `${dsc.avgHoursToReply.toFixed(1)} h`)}</span></Campo>
                <Campo etiqueta="Días hasta venta"><span className={mono}>{guion(`${(dsc?.avgDaysToWinWith ?? 0).toFixed(1)} con · ${(dsc?.avgDaysToWinWithout ?? 0).toFixed(1)} sin`)}</span></Campo>
              </Cifras>
              <p className="text-[12px] text-text2">Muestra asociación, no causalidad.</p>
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

function Cargando() {
  return <div className="skeleton h-[110px] w-full" aria-busy="true" />;
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
