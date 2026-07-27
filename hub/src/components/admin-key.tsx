import { useState } from "react";
import {
  getStoredAdminKey,
  probarClaveAdmin,
  saveStoredAdminKey,
  type ResultadoConexion,
} from "../data/realSource";
import type { EstadoConexion } from "../store";

/** Qué desbloquea cada fase, en palabras del dueño (no en nombres de flags). */
const PANTALLAS_POR_FASE: Record<1 | 2 | 3 | 4, string> = {
  1: "Inbox y Pipeline",
  2: "Inbox y Pipeline · el bot ya deduce la medida desde el vehículo",
  3: "Inbox, Pipeline, Cotizador y Métricas",
  4: "Inbox, Oportunidades, Pipeline, Cotizador y Métricas",
};

type Prueba = { fase: "reposo" } | { fase: "probando" } | { fase: "listo"; resultado: ResultadoConexion };

/** El mensaje del servidor puede venir sin puntuación ("Failed to fetch"). */
function frase(texto: string): string {
  return /[.!?]$/.test(texto.trim()) ? texto.trim() : `${texto.trim()}.`;
}

/**
 * Campo de clave + botón que la valida CONTRA EL SERVIDOR antes de guardarla, y
 * dice en una línea si quedó conectada (con la fase activa), si la clave está
 * mal, o si el servidor no responde. Antes fallaba en silencio.
 */
export function AdminKeyForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const [key, setKey] = useState(getStoredAdminKey);
  const [prueba, setPrueba] = useState<Prueba>({ fase: "reposo" });
  const habiaClave = getStoredAdminKey().length > 0;

  async function conectar() {
    setPrueba({ fase: "probando" });
    const resultado = await probarClaveAdmin(key);
    setPrueba({ fase: "listo", resultado });
    if (resultado.estado === "conectada") {
      saveStoredAdminKey(key);
      // Pausa corta para que el "Conectado ✓" se lea antes de recargar.
      window.setTimeout(() => window.location.reload(), 1100);
    }
  }

  const probando = prueba.fase === "probando";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!probando) void conectar();
      }}
    >
      <label className="microlabel mb-1.5 block" htmlFor="admin-key-input">
        Clave administrativa
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="admin-key-input"
          type="password"
          autoFocus={autoFocus}
          autoComplete="current-password"
          value={key}
          placeholder="Pega la misma clave que usas en el panel"
          onChange={(event) => {
            setKey(event.target.value);
            setPrueba({ fase: "reposo" });
          }}
          className="settings-input flex-1"
        />
        <button
          type="submit"
          disabled={probando}
          className="rounded-2xl bg-navy px-5 py-3 text-xs font-black whitespace-nowrap text-white transition-opacity active:opacity-80 disabled:opacity-60"
        >
          {probando ? "Probando…" : "Conectar"}
        </button>
      </div>

      <div className="mt-3" aria-live="polite">
        {prueba.fase === "reposo" && (
          <p className="text-[11px] text-faint">
            {habiaClave
              ? "Hay una clave guardada en este navegador. Pulsa Conectar para comprobarla."
              : "Se guarda solo en este navegador (localStorage), nunca en el servidor ni en el repo."}
          </p>
        )}
        {probando && <Aviso tono="neutral" texto="Preguntando al servidor si la clave sirve…" />}
        {prueba.fase === "listo" && <ResultadoAviso resultado={prueba.resultado} />}
      </div>
    </form>
  );
}

function ResultadoAviso({ resultado }: { resultado: ResultadoConexion }) {
  if (resultado.estado === "conectada") {
    return (
      <Aviso
        tono="ok"
        texto={`Conectado a ${resultado.negocio} · Fase ${resultado.fase} activa`}
        detalle={`Vas a ver: ${PANTALLAS_POR_FASE[resultado.fase]}. Recargando…`}
      />
    );
  }
  if (resultado.estado === "clave-invalida") {
    return (
      <Aviso
        tono="error"
        texto="Clave incorrecta — el hub sigue bloqueado"
        detalle={`${frase(resultado.mensaje)} Cópiala del panel de administración: es la misma ADMIN_KEY de este entorno.`}
      />
    );
  }
  return (
    <Aviso
      tono="alerta"
      texto="No se pudo contactar el servidor"
      detalle={`${frase(resultado.mensaje)} La clave puede estar bien; revisa que el servicio esté arriba.`}
    />
  );
}

const TONOS = {
  ok: { icono: "✓", color: "#059669", fondo: "rgba(5, 150, 105, 0.14)" },
  error: { icono: "✕", color: "#e5484d", fondo: "rgba(229, 72, 77, 0.14)" },
  alerta: { icono: "!", color: "#d97706", fondo: "rgba(217, 119, 6, 0.14)" },
  neutral: { icono: "…", color: "var(--color-muted)", fondo: "rgba(255, 255, 255, 0.06)" },
} as const;

function Aviso({
  tono,
  texto,
  detalle,
}: {
  tono: keyof typeof TONOS;
  texto: string;
  detalle?: string;
}) {
  const { icono, color, fondo } = TONOS[tono];
  return (
    // Sin animación de entrada: este aviso es la respuesta que el usuario
    // esperaba; si el rAF se atasca no puede quedarse a medio opacar.
    <div
      className="flex items-start gap-2.5 rounded-2xl px-3.5 py-3"
      style={{ background: fondo, border: `1px solid ${color}33` }}
    >
      <span
        aria-hidden
        className="mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full text-[10px] font-black text-white"
        style={{ background: color }}
      >
        {icono}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold" style={{ color }}>
          {texto}
        </span>
        {detalle && <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{detalle}</span>}
      </span>
    </div>
  );
}

/**
 * Pantalla completa cuando el hub no puede leer datos. Ocupa todo para que sea
 * imposible confundir "clave mal puesta" con "negocio sin conversaciones".
 */
export function ConnectionGate({ estado }: { estado: Extract<EstadoConexion, "clave-invalida" | "sin-conexion"> }) {
  const claveMala = estado === "clave-invalida";
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "var(--color-scrim)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Conexión con el servidor"
    >
      <div
        className="w-full max-w-lg rounded-3xl p-6 shadow-pop sm:p-8"
        // Fondo opaco del tema (ink2 = superficie de tarjeta): anidar el
        // backdrop-filter de .glass dentro del scrim lo dejaba lavado.
        style={{ background: "var(--color-ink2)", border: "1px solid var(--color-line)" }}
      >
        <p className="microlabel">Acceso al producto real</p>
        <h2 className="serif mt-2 text-2xl">
          {claveMala ? "El hub está bloqueado" : "Sin conexión con el servidor"}
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          {claveMala
            ? "Las pantallas, los tickets y las fases se leen del servidor, y para eso hace falta la clave administrativa. Sin ella el hub se ve vacío aunque el panel tenga todas las fases encendidas."
            : "La clave puede estar bien, pero el servidor no contestó. Cuando vuelva a responder, vuelve a conectar aquí."}
        </p>
        <div className="mt-5">
          <AdminKeyForm autoFocus />
        </div>
      </div>
    </div>
  );
}

/** Chip del topbar: el estado real de la conexión, siempre a la vista. */
export function ConnectionChip({
  estado,
  fase,
  onClick,
}: {
  estado: EstadoConexion;
  fase: 1 | 2 | 3 | 4;
  onClick: () => void;
}) {
  const meta = {
    verificando: { texto: "Conectando…", color: "var(--color-muted)", punto: false },
    conectada: { texto: `Conectado · Fase ${fase}`, color: "#059669", punto: true },
    "clave-invalida": { texto: "Falta la clave", color: "#e5484d", punto: false },
    "sin-conexion": { texto: "Sin conexión", color: "#d97706", punto: false },
  }[estado];

  return (
    <button
      type="button"
      onClick={onClick}
      title={
        estado === "conectada"
          ? "El hub está leyendo datos reales del servidor"
          : "Abrir la configuración de conexión"
      }
      className="hidden items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold sm:flex"
      style={{ background: `${meta.color}1f`, color: meta.color, border: `1px solid ${meta.color}3d` }}
    >
      {meta.punto ? (
        <span className="pulse-dot" />
      ) : (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      )}
      {meta.texto}
    </button>
  );
}
