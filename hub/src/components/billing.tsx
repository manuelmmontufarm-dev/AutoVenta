/**
 * Cuenta del servicio dentro de Métricas: cuánto se ha gastado en tokens de
 * IA (hoy / semana / mes), la cuenta del mes con IVA + mantenimiento, y el
 * historial mensual con su estado de pago, graficado.
 *
 * Marcar un mes como pagado pide la clave de dueño (OWNER_KEY del servidor):
 * el panel del cliente puede VER la cuenta pero no tocarla.
 */
import { useEffect, useState } from "react";
import type { Billing, MesFacturado, UsoTokens } from "../data/types";
import { source } from "../store";
import { BarChart } from "./charts";
import { BlockTitle, Campo } from "./ui";

const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function nombreMes(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MESES_ES[m - 1]} ${y}`;
}

function mesCorto(period: string): string {
  const [, m] = period.split("-").map(Number);
  return MESES_CORTOS[m - 1];
}

function fechaCorta(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} de ${MESES_ES[m - 1]} ${y}`;
}

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tokens(uso: UsoTokens): string {
  const total = uso.inputTokens + uso.outputTokens;
  return total >= 1_000_000 ? `${(total / 1_000_000).toFixed(1)} M tokens` : `${Math.round(total / 1000)} k tokens`;
}

const mono = "tnum font-mono";

export function BillingSection() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);

  useEffect(() => {
    let vivo = true;
    source.getBilling().then(
      (data) => vivo && setBilling(data),
      (e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar la cuenta"),
    );
    return () => { vivo = false; };
  }, []);

  const contenedor = "flex flex-col gap-3.5 rounded-[10px] border border-line bg-surface px-5 pt-[18px] pb-4 lg:col-span-2";

  if (error) {
    return (
      <section className={contenedor}>
        <BlockTitle>Tokens y cuenta del servicio</BlockTitle>
        <p className="text-[13px] text-text2">{error}</p>
      </section>
    );
  }
  if (!billing) {
    return (
      <section className={contenedor}>
        <BlockTitle>Tokens y cuenta del servicio</BlockTitle>
        <div className="skeleton h-[110px] w-full" aria-busy="true" />
      </section>
    );
  }

  const mesActual = billing.meses.find((m) => m.enCurso) ?? billing.meses[0];
  const ivaPct = Math.round(billing.ivaPorc * 100);
  // Del más viejo al más nuevo, para que el eje X se lea como el tiempo.
  const serie = [...billing.meses].reverse().map((m) => ({ x: mesCorto(m.period), y: Number(m.total.toFixed(2)) }));

  const marcarPago = async (mes: MesFacturado) => {
    const clave = window.prompt(
      mes.pagado
        ? `Clave de dueño para desmarcar el pago de ${nombreMes(mes.period)}:`
        : `Clave de dueño para marcar ${nombreMes(mes.period)} como pagado:`,
    );
    if (!clave) return;
    setOcupado(true);
    try {
      setBilling(await source.setBillingPaid(mes.period, !mes.pagado, clave.trim()));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo actualizar el pago");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className={contenedor}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-3.5">
          <BlockTitle aside={`cuenta por mes · IVA ${ivaPct} %`}>Tokens y cuenta del servicio</BlockTitle>
          <BarChart data={serie} unidad="USD" fmt={(v) => `$${Number.isInteger(v) ? v : v.toFixed(0)}`} ancho={560} alto={200} etiqueta="Total facturado por mes" />
          <div className="grid grid-cols-3 gap-3 border-t border-line pt-3 text-[13px]">
            {[
              { label: "Hoy", uso: billing.hoy },
              { label: "Últimos 7 días", uso: billing.semana },
              { label: "Mes en curso", uso: billing.mes },
            ].map((item) => (
              <div key={item.label} className="flex flex-col gap-0.5">
                <span className="text-text2">{item.label}</span>
                <span className={`${mono} text-[15px] font-medium`}>{usd(item.uso.usd)}</span>
                <span className="text-[12px] text-text2">{tokens(item.uso)} · {item.uso.runs.toLocaleString("es-EC")} llamadas</span>
              </div>
            ))}
          </div>
        </div>

        {mesActual && (
          <div className="grid grid-cols-[130px_minmax(0,1fr)] content-start gap-x-4 gap-y-3 border-t border-line pt-4 text-[13px] lg:border-t-0 lg:border-l lg:pt-[30px] lg:pl-6">
            <span className="col-span-2 text-[13px] font-semibold">Cuenta de {nombreMes(mesActual.period)}</span>
            <Campo etiqueta="Tokens"><span className={mono}>{usd(mesActual.uso.usd)}</span> <span className="text-text2">+ IVA {usd(mesActual.ivaTokens)}</span></Campo>
            <Campo etiqueta="Mantenimiento"><span className={mono}>{usd(mesActual.mantenimiento)}</span> <span className="text-text2">+ IVA {usd(mesActual.ivaMantenimiento)}</span></Campo>
            <Campo etiqueta="Total con IVA"><span className={`${mono} font-bold`}>{usd(mesActual.total)}</span></Campo>
            <Campo etiqueta="Vence">{fechaCorta(mesActual.vence)}</Campo>
            <Campo etiqueta="Estado">{mesActual.enCurso ? "va corriendo, cierra a fin de mes" : mesActual.pagado ? <span className="text-ok">Pagado</span> : <span className="font-medium text-warn">Pendiente</span>}</Campo>
            <button onClick={() => setVerHistorial((v) => !v)} className="col-span-2 mt-1 text-left text-[13px] font-medium text-signal">
              {verHistorial ? "Ocultar historial" : `Ver historial · ${billing.meses.length} meses`}
            </button>
          </div>
        )}
      </div>

      {verHistorial && (
        <div className="overflow-x-auto border-t border-line pt-3">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[12px] font-medium text-text2">
              <tr>
                <th className="py-2">Mes</th>
                <th className="text-right">Tokens</th>
                <th className="text-right">IVA</th>
                <th className="text-right">Mantenimiento</th>
                <th className="text-right">Total</th>
                <th>Vence</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {billing.meses.map((mes) => (
                <tr key={mes.period} className="border-t border-line">
                  <td className="py-2 first-letter:uppercase">{nombreMes(mes.period)}{mes.enCurso ? " · en curso" : ""}</td>
                  <td className={`${mono} text-right`}>{usd(mes.uso.usd)}</td>
                  <td className={`${mono} text-right`}>{usd(mes.ivaTokens + mes.ivaMantenimiento)}</td>
                  <td className={`${mono} text-right text-text2`}>{usd(mes.mantenimiento)}</td>
                  <td className={`${mono} text-right font-bold`}>{usd(mes.total)}</td>
                  <td className="tnum">{fechaCorta(mes.vence)}</td>
                  <td className={mes.pagado ? "text-ok" : "font-medium text-warn"}>
                    {mes.pagado ? `Pagado${mes.pagadoEl ? ` · ${fechaCorta(mes.pagadoEl.slice(0, 10))}` : ""}` : "Pendiente"}
                  </td>
                  <td className="text-right">
                    <button onClick={() => marcarPago(mes)} disabled={ocupado} className="btn-quiet h-7 rounded-[6px] px-2.5 text-[12px]" title="Requiere la clave de dueño">
                      {mes.pagado ? "Desmarcar" : "Marcar pagado"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[12px] text-text2">
            El total del mes = tokens + IVA {ivaPct} % + mantenimiento ({usd(billing.mantenimiento)} + IVA). Se paga el primer viernes del mes siguiente; el mes corre desde el {fechaCorta(billing.inicioServicio)}. Marcar pagado requiere la clave de dueño.
          </p>
        </div>
      )}
    </section>
  );
}
