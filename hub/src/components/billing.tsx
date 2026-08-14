/**
 * Cuenta del servicio dentro del tab KPI: cuánto se ha gastado en tokens de
 * IA (hoy / semana / mes), la cuenta del mes con IVA + mantenimiento, y el
 * historial mensual con su estado de pago.
 *
 * Marcar un mes como pagado pide la clave de dueño (OWNER_KEY del servidor):
 * el panel del cliente puede VER la cuenta pero no tocarla.
 */
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { Billing, MesFacturado, UsoTokens } from "../data/types";
import { source } from "../store";

const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function nombreMes(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MESES_ES[m - 1]} ${y}`;
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

export function BillingSection() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    source.getBilling().then(
      (data) => vivo && setBilling(data),
      (e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar la cuenta"),
    );
    return () => { vivo = false; };
  }, []);

  if (error) {
    return (
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass mt-2.5 rounded-3xl p-5">
        <p className="microlabel">Tokens y cuenta del servicio</p>
        <p className="mt-2 text-[11px] text-faint">{error}</p>
      </motion.section>
    );
  }
  if (!billing) return null;

  const mesActual = billing.meses.find((m) => m.enCurso) ?? billing.meses[0];
  const ivaPct = Math.round(billing.ivaPorc * 100);

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
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass mt-2.5 rounded-3xl p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="microlabel">Tokens y cuenta del servicio</p>
          <p className="mt-1 text-[10.5px] text-faint">
            Consumo real de IA del bot valorado a tarifa de OpenAI · el mes corre desde el {fechaCorta(billing.inicioServicio)} · IVA {ivaPct}%
          </p>
        </div>
        {mesActual && (
          <div className="rounded-2xl border border-paper/[.08] bg-paper/[.04] px-4 py-2 text-right">
            <p className="microlabel">Próximo pago</p>
            <p className="serif tnum text-[18px] text-lime">{fechaCorta(mesActual.vence)}</p>
            <p className="text-[10px] text-faint">primer viernes del mes</p>
          </div>
        )}
      </div>

      {/* Consumo: hoy / semana / mes, cada uno con su valor + IVA al lado */}
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
        {[
          { label: "Hoy", uso: billing.hoy, detalle: "desde la medianoche" },
          { label: "Últimos 7 días", uso: billing.semana, detalle: "semana corrida" },
          { label: "Mes en curso", uso: billing.mes, detalle: `desde el ${fechaCorta(mesActual?.desde ?? billing.inicioServicio)}` },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-paper/[.07] bg-paper/[.035] p-4">
            <p className="microlabel">{item.label}</p>
            <div className="mt-2 flex items-baseline gap-2.5">
              <p className="serif tnum text-[25px]">{usd(item.uso.usd)}</p>
              <p className="tnum text-[12px] text-lime">{usd(item.uso.usdConIva)} con IVA</p>
            </div>
            <p className="mt-1 text-[10.5px] text-faint">{tokens(item.uso)} · {item.uso.runs.toLocaleString("es-EC")} llamadas · {item.detalle}</p>
          </div>
        ))}
      </div>

      {/* La cuenta del mes en curso: tokens + IVA + mantenimiento = total */}
      {mesActual && (
        <div className="mt-2.5 rounded-2xl border border-paper/[.09] bg-paper/[.045] p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="microlabel">Cuenta de {nombreMes(mesActual.period)}</p>
              <div className="tnum mt-2 space-y-1 text-[12px] text-paper/85">
                <p>Tokens: {usd(mesActual.uso.usd)} <span className="text-faint">+ IVA {usd(mesActual.ivaTokens)}</span></p>
                <p className="text-[10.5px] text-faint">Mantenimiento mensual: {usd(mesActual.mantenimiento)} + IVA {usd(mesActual.ivaMantenimiento)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="microlabel">Total a pagar el {fechaCorta(mesActual.vence)}</p>
              <p className="serif tnum text-[28px]" style={{ color: mesActual.pagado ? "var(--color-ok)" : "var(--color-warn)" }}>
                {usd(mesActual.total)}
              </p>
              <p className="text-[10px] text-faint">{mesActual.enCurso ? "va corriendo, cierra a fin de mes" : mesActual.pagado ? "pagado" : "pendiente"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Historial mensual: reporte chico por mes con estado de pago */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="text-faint">
            <tr>
              <th className="py-2">Mes</th>
              <th className="tnum">Tokens</th>
              <th className="tnum">IVA</th>
              <th className="tnum">Mantenimiento</th>
              <th className="tnum">Total</th>
              <th>Vence</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {billing.meses.map((mes) => (
              <tr key={mes.period} className="border-t border-paper/[.06]">
                <td className="py-2 capitalize">{nombreMes(mes.period)}{mes.enCurso ? " · en curso" : ""}</td>
                <td className="tnum">{usd(mes.uso.usd)}</td>
                <td className="tnum">{usd(mes.ivaTokens + mes.ivaMantenimiento)}</td>
                <td className="tnum text-faint">{usd(mes.mantenimiento)}</td>
                <td className="tnum font-bold">{usd(mes.total)}</td>
                <td className="tnum">{fechaCorta(mes.vence)}</td>
                <td>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[10px]"
                    style={{
                      background: mes.pagado ? "color-mix(in srgb, var(--color-ok) 15%, transparent)" : "color-mix(in srgb, var(--color-warn) 15%, transparent)",
                      color: mes.pagado ? "var(--color-ok)" : "var(--color-warn)",
                    }}
                  >
                    {mes.pagado ? `Pagado${mes.pagadoEl ? ` · ${fechaCorta(mes.pagadoEl.slice(0, 10))}` : ""}` : "Pendiente"}
                  </span>
                </td>
                <td className="text-right">
                  <button
                    onClick={() => marcarPago(mes)}
                    disabled={ocupado}
                    className="rounded-lg border border-paper/[.12] px-2.5 py-1 text-[10px] text-paper/70 transition-colors hover:bg-paper/[.06] disabled:opacity-40"
                    title="Requiere la clave de dueño"
                  >
                    {mes.pagado ? "Desmarcar" : "Marcar pagado"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10px] text-faint">
        El total del mes = tokens + IVA {ivaPct}% + mantenimiento del servicio ({usd(billing.mantenimiento)} + IVA).
        Se paga el primer viernes del mes siguiente. Marcar pagado requiere la clave de dueño.
      </p>
    </motion.section>
  );
}
