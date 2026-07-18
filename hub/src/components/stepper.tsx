import { motion } from "framer-motion";
import { CIERRE_META, ETAPAS, ETAPA_META, type Ticket } from "../data/types";
import { fechaLarga } from "../lib/format";
import { IconCheck } from "./icons";

/** Stepper del pipeline: dónde está esta venta, de un vistazo. */
export function PipelineStepper({ ticket }: { ticket: Ticket }) {
  if (ticket.estado === "cerrado" && ticket.cierre) {
    const meta = CIERRE_META[ticket.cierre];
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-[12.5px] font-bold"
        style={{
          color: meta.color,
          background: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`,
        }}
      >
        {meta.emoji} Cerrado · {meta.nombre}
        {ticket.cerradoEn && <span className="font-medium opacity-70">— {fechaLarga(ticket.cerradoEn)}</span>}
      </div>
    );
  }

  const actual = ETAPAS.indexOf(ticket.etapa);

  return (
    <div className="flex items-center px-1">
      {ETAPAS.map((etapa, i) => {
        const meta = ETAPA_META[etapa];
        const hecho = i < actual;
        const activo = i === actual;
        const color = hecho || activo ? meta.color : "color-mix(in srgb, var(--color-paper) 14%, transparent)";
        return (
          <div key={etapa} className={`flex items-center ${i > 0 ? "flex-1" : ""}`}>
            {i > 0 && (
              <div className="relative mx-1 h-0.5 flex-1 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--color-paper) 8%, transparent)" }}>
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: hecho || activo ? meta.color : "transparent" }}
                  initial={{ width: 0 }}
                  animate={{ width: hecho || activo ? "100%" : "0%" }}
                  transition={{ type: "spring", stiffness: 160, damping: 28 }}
                />
              </div>
            )}
            <div className="flex flex-col items-center gap-1">
              <motion.div
                className="relative grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold"
                animate={activo ? { scale: [1, 1.12, 1] } : {}}
                transition={activo ? { repeat: Infinity, duration: 2, ease: "easeInOut" } : {}}
                style={{
                  color: hecho || activo ? "#262624" : "var(--color-faint)",
                  background: hecho || activo ? color : "color-mix(in srgb, var(--color-paper) 6%, transparent)",
                  boxShadow: activo ? `0 0 14px color-mix(in srgb, ${color} 60%, transparent)` : "none",
                }}
              >
                {hecho ? <IconCheck size={12} /> : i + 1}
              </motion.div>
              <span
                className="hidden text-[9.5px] font-bold tracking-wide whitespace-nowrap uppercase sm:block"
                style={{ color: hecho || activo ? meta.color : "var(--color-faint)" }}
              >
                {meta.corto}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
