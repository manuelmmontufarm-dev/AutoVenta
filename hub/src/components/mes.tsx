import { motion } from "framer-motion";
import { TODOS } from "../data/types";
import { mesEnCurso, useHub } from "../store";

/**
 * "septiembre de 2026" a partir de un "YYYY-MM".
 *
 * Se nombra desde el mediodía del día 1, no desde la medianoche: el corte real
 * es la medianoche de Guayaquil y un navegador en otro huso la lee como las
 * 23:00 del mes anterior, así que el título diría un mes que no es. Medio día
 * adentro no hay borde que cruzar.
 */
export function etiquetaDeMes(clave: string, opciones: { corta?: boolean } = {}): string {
  if (clave === TODOS) return "todo el histórico";
  const fecha = new Date(`${clave}-01T12:00:00.000Z`);
  if (Number.isNaN(fecha.getTime())) return clave;
  const mismoAño = clave.slice(0, 4) === mesEnCurso().slice(0, 4);
  return new Intl.DateTimeFormat("es-EC", {
    month: "long",
    // El año se dice solo cuando aporta: dentro del año en curso, "agosto"
    // alcanza; "agosto de 2025" al lado de "septiembre" sí hace falta.
    year: opciones.corta && mismoAño ? undefined : "numeric",
    timeZone: "America/Guayaquil",
  }).format(fecha);
}

/**
 * El selector de mes de los KPIs y del kanban.
 *
 * El panel arranca en el mes en curso —los contadores vuelven a cero el día 1—
 * y esto es la puerta al resto: cualquier mes anterior, o `Todos` para ver el
 * histórico completo. Nada se borró nunca; el mes es una ventana, y aquí se
 * mueve.
 *
 * Vive en el store, así que elegir agosto en los KPIs deja el kanban en agosto:
 * dos pantallas con meses distintos serían dos verdades sobre el mismo negocio.
 */
export function SelectorDeMes({ className = "" }: { className?: string }) {
  const mes = useHub((s) => s.mes);
  const disponibles = useHub((s) => s.mesesDisponibles);
  const verMes = useHub((s) => s.verMes);
  const actual = mesEnCurso();

  // El mes en curso va siempre, aunque el servidor todavía no haya contestado
  // qué meses existen: el selector no puede abrirse sin la opción elegida.
  const claves = [actual, ...disponibles.map((m) => m.clave).filter((c) => c !== actual)];
  const opciones = [...claves.map((clave) => ({ clave, esActual: clave === actual })), { clave: TODOS, esActual: false }];

  return (
    <div
      className={`glass inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl p-1 ${className}`}
      role="group"
      aria-label="Mes que se está mirando"
    >
      {opciones.map((op) => {
        const activo = op.clave === mes;
        return (
          <button
            key={op.clave}
            onClick={() => void verMes(op.clave)}
            aria-pressed={activo}
            title={
              op.clave === TODOS
                ? "Todo el histórico, sin recortar por mes"
                : `Ver ${etiquetaDeMes(op.clave)}`
            }
            className="relative shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap text-muted capitalize transition-colors data-[activo=true]:text-paper"
            data-activo={activo}
          >
            {activo && (
              <motion.span
                layoutId="seg-mes"
                className="absolute inset-0 rounded-lg"
                style={{
                  background: "color-mix(in srgb, var(--color-paper) 10%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-paper) 10%, transparent)",
                }}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative z-10">
              {op.clave === TODOS
                ? "Todos"
                : op.esActual
                  ? `${etiquetaDeMes(op.clave, { corta: true })} · este mes`
                  : etiquetaDeMes(op.clave, { corta: true })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
