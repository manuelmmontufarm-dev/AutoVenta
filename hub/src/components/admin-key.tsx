import { useEffect, useState } from "react";
import { IconAlert, IconCheck, IconSalir, IconX } from "./icons";
import {
  getStoredAdminKey,
  iniciarSesion,
  listarUsuarios,
  probarClaveAdmin,
  saveStoredAdminKey,
  type ResultadoConexion,
  type UsuarioDisponible,
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
  ok: { icono: <IconCheck size={10} />, color: "#059669", fondo: "rgba(5, 150, 105, 0.14)" },
  error: { icono: <IconX size={10} />, color: "#e5484d", fondo: "rgba(229, 72, 77, 0.14)" },
  alerta: { icono: <IconAlert size={10} />, color: "#d97706", fondo: "rgba(217, 119, 6, 0.14)" },
  neutral: { icono: <span className="block h-1 w-1 rounded-full bg-white" />, color: "var(--color-muted)", fondo: "rgba(255, 255, 255, 0.06)" },
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

// ── Login de usuario ─────────────────────────────────────────────────────────

type Entrada =
  | { fase: "cargando" }
  | { fase: "listo"; usuarios: UsuarioDisponible[] }
  | { fase: "sin-usuarios"; motivo: string };

type Intento = { fase: "reposo" } | { fase: "entrando" } | { fase: "error"; mensaje: string };

/**
 * Quién eres + tu clave. La lista de usuarios la manda el servidor (ruta
 * pública), así que agregar o quitar gente no obliga a redesplegar el hub.
 *
 * Si el servidor no tiene todavía `/api/auth/users` —un backend viejo, o el
 * despliegue a medias— no se deja al usuario mirando un desplegable vacío: se
 * cae al formulario de la clave administrativa, que es lo que ese servidor
 * entiende.
 */
export function LoginForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const [entrada, setEntrada] = useState<Entrada>({ fase: "cargando" });
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [intento, setIntento] = useState<Intento>({ fase: "reposo" });

  useEffect(() => {
    let vivo = true;
    listarUsuarios()
      .then((usuarios) => {
        if (!vivo) return;
        if (!usuarios.length) {
          setEntrada({ fase: "sin-usuarios", motivo: "El servidor no tiene usuarios configurados." });
          return;
        }
        setEntrada({ fase: "listo", usuarios });
        setUserId(usuarios[0].id);
      })
      .catch((error: unknown) => {
        if (!vivo) return;
        setEntrada({
          fase: "sin-usuarios",
          motivo: error instanceof Error ? error.message : "No se pudo leer la lista de usuarios.",
        });
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (entrada.fase === "cargando") {
    return <Aviso tono="neutral" texto="Preguntando al servidor quién puede entrar…" />;
  }

  if (entrada.fase === "sin-usuarios") {
    return (
      <div>
        <Aviso
          tono="alerta"
          texto="Este servidor todavía no tiene login de usuarios"
          detalle={`${frase(entrada.motivo)} Entra con la clave administrativa mientras tanto.`}
        />
        <div className="mt-4">
          <AdminKeyForm autoFocus={autoFocus} />
        </div>
      </div>
    );
  }

  async function entrar() {
    setIntento({ fase: "entrando" });
    const resultado = await iniciarSesion(userId, pin);
    if (resultado.estado === "dentro") {
      // Recarga completa: el store, las fases y el modo de datos se arman al
      // arrancar y ninguno sabe re-leerse a media sesión.
      window.location.reload();
      return;
    }
    setIntento({ fase: "error", mensaje: resultado.mensaje });
  }

  const entrando = intento.fase === "entrando";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!entrando) void entrar();
      }}
    >
      <label className="microlabel mb-1.5 block" htmlFor="login-usuario">
        Usuario
      </label>
      <select
        id="login-usuario"
        value={userId}
        autoFocus={autoFocus}
        onChange={(event) => {
          setUserId(event.target.value);
          setIntento({ fase: "reposo" });
        }}
        className="settings-input w-full"
      >
        {entrada.usuarios.map((usuario) => (
          <option key={usuario.id} value={usuario.id}>
            {usuario.nombre}
          </option>
        ))}
      </select>

      <label className="microlabel mt-4 mb-1.5 block" htmlFor="login-clave">
        Clave
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="login-clave"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          placeholder="••••"
          onChange={(event) => {
            setPin(event.target.value);
            setIntento({ fase: "reposo" });
          }}
          className="settings-input flex-1"
        />
        <button
          type="submit"
          disabled={entrando}
          className="rounded-2xl bg-navy px-5 py-3 text-xs font-black whitespace-nowrap text-white transition-opacity active:opacity-80 disabled:opacity-60"
        >
          {entrando ? "Entrando…" : "Entrar"}
        </button>
      </div>

      <div className="mt-3" aria-live="polite">
        {intento.fase === "reposo" && (
          <p className="text-[11px] text-faint">
            La sesión se guarda solo en este navegador y dura 30 días.
          </p>
        )}
        {entrando && <Aviso tono="neutral" texto="Comprobando con el servidor…" />}
        {intento.fase === "error" && (
          <Aviso tono="error" texto="No se pudo entrar" detalle={frase(intento.mensaje)} />
        )}
      </div>
    </form>
  );
}

/**
 * Pantalla completa cuando el hub no puede leer datos. Ocupa todo para que sea
 * imposible confundir "sin entrar" con "negocio sin conversaciones".
 */
export function ConnectionGate({ estado }: { estado: Extract<EstadoConexion, "clave-invalida" | "sin-conexion"> }) {
  const sinSesion = estado === "clave-invalida";
  // Escotilla para el dueño y para los scripts: la ADMIN_KEY cruda sigue
  // abriendo el hub. Sin esto, un servidor con los usuarios a medias dejaría
  // fuera también a quien sí tiene la clave.
  const [conClave, setConClave] = useState(false);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "var(--color-scrim)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Acceso al hub"
    >
      <div
        className="w-full max-w-lg rounded-3xl p-6 shadow-pop sm:p-8"
        // Fondo opaco del tema (ink2 = superficie de tarjeta): anidar el
        // backdrop-filter de .glass dentro del scrim lo dejaba lavado.
        style={{ background: "var(--color-ink2)", border: "1px solid var(--color-line)" }}
      >
        <p className="microlabel">Acceso al producto real</p>
        <h2 className="serif mt-2 text-2xl">
          {sinSesion ? "Entra al hub" : "Sin conexión con el servidor"}
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          {sinSesion
            ? "Los tickets, las métricas y las fases se leen del servidor. Elige tu usuario y escribe tu clave para verlos."
            : "Tu sesión puede estar bien, pero el servidor no contestó. Cuando vuelva a responder, vuelve a entrar aquí."}
        </p>
        <div className="mt-5">{conClave ? <AdminKeyForm autoFocus /> : <LoginForm autoFocus />}</div>
        <button
          type="button"
          onClick={() => setConClave((valor) => !valor)}
          className="mt-4 text-[11px] font-semibold text-faint underline underline-offset-2"
        >
          {conClave ? "Entrar con usuario y clave" : "Entrar con la clave administrativa"}
        </button>
      </div>
    </div>
  );
}

/**
 * Quién está usando el hub. Solo el nombre — la salida vive abajo, con los tabs.
 *
 * El nombre no es adorno: en la tienda el panel se queda abierto en un
 * computador compartido, y saber con qué usuario estás es lo que evita que
 * alguien crea que "el sistema" hizo algo que hizo su compañero.
 */
export function UserChip({ nombre }: { nombre: string | null }) {
  // `nombre` puede venir vacío: es la sesión por clave administrativa, la que
  // usan el panel central, los scripts y quien ya tenía el hub abierto antes
  // del login.
  const etiqueta = nombre ?? "Clave admin";
  // En el teléfono solo el nombre de pila: el hub se usa como PWA en iPhone y
  // ahí la barra no da para "Joaquin Tamayo" entero.
  const nombreDePila = etiqueta.split(" ")[0];
  return (
    <span
      className="flex items-center rounded-full px-2.5 py-1.5 text-[11px] font-semibold sm:px-3"
      style={{
        background: "color-mix(in srgb, var(--color-paper) 8%, transparent)",
        border: "1px solid var(--color-line)",
      }}
    >
      <span className="max-w-[10rem] truncate">
        <span className="sm:hidden">{nombreDePila}</span>
        <span className="hidden sm:inline">{etiqueta}</span>
      </span>
    </span>
  );
}

/**
 * El botón de salir, abajo con los tabs.
 *
 * Vivía arriba a la derecha, pegado al nombre, y ahí competía con la versión,
 * el estado de conexión y el modo — cuatro cosas del sistema en la esquina que
 * uno mira para saber DÓNDE está, no para navegar. Abajo, junto a los tabs,
 * está donde la mano ya va en el teléfono y donde se busca una salida.
 *
 * Va con borde y sin relleno: es una acción de salida, no una acción del
 * negocio. Si compitiera en peso con «Apagar el bot» o con los tabs, se
 * pulsaría sin querer.
 */
export function SalirButton({
  nombre,
  onSalir,
  className = "",
  soloIcono = false,
}: {
  nombre: string | null;
  onSalir: () => void;
  className?: string;
  /** En el rail de escritorio (64 px) no cabe el texto: solo el icono. */
  soloIcono?: boolean;
}) {
  const titulo = nombre ? `Salir de la sesión de ${nombre}` : "Salir y olvidar la clave guardada";
  return (
    <button
      type="button"
      onClick={onSalir}
      title={titulo}
      aria-label={soloIcono ? titulo : undefined}
      className={`flex items-center justify-center gap-2 rounded-full text-[13px] font-semibold text-muted transition-colors hover:text-paper active:opacity-70 ${soloIcono ? "" : "px-4 py-2"} ${className}`}
      style={{ border: "1px solid var(--color-line)" }}
    >
      <IconSalir size={17} />
      {!soloIcono && "Salir"}
    </button>
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
