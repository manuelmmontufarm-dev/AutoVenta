/**
 * Ajustes → WhatsApp: conectar el número del negocio sin salir a leer docs.
 *
 * La pantalla se ordena como la tarea real: pegas los cuatro datos de Meta,
 * guardas, y el servidor le pregunta a Meta si sirven. Cada paso dice qué se
 * comprobó y qué hacer si falla — nunca un "error" pelado.
 *
 * El token y el app secret solo viajan hacia arriba: el servidor jamás los
 * devuelve, así que los campos se muestran vacíos con la marca "ya configurado".
 */
import { useEffect, useState, type ReactNode } from "react";
import { authHeaders } from "../data/realSource";
import { IconAlert, IconCheck } from "./icons";

type CheckEstado = "ok" | "falta" | "error";

interface ChannelCheck {
  id: string;
  label: string;
  estado: CheckEstado;
  detalle: string;
  dato?: string;
  ayuda?: string;
}

interface Diagnosis {
  listo: boolean;
  checks: ChannelCheck[];
  webhookUrl: string;
  verifyToken: string;
}

interface PublicChannel {
  phoneId: string;
  sellerPhone: string;
  verifyToken: string;
  tokenSet: boolean;
  appSecretSet: boolean;
  tokenSource: "settings" | "env" | "none";
  ready: boolean;
}

interface FormState {
  token: string;
  phoneId: string;
  verifyToken: string;
  appSecret: string;
  sellerPhone: string;
}

const VACIO: FormState = {
  token: "",
  phoneId: "",
  verifyToken: "",
  appSecret: "",
  sellerPhone: "",
};

export function WhatsAppSetup() {
  const [channel, setChannel] = useState<PublicChannel | null>(null);
  const [form, setForm] = useState<FormState>(VACIO);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [pruebaTo, setPruebaTo] = useState("");
  const [prueba, setPrueba] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const payload = await api<{ channel: PublicChannel }>("/api/channel");
        setChannel(payload.channel);
        setForm((prev) => ({
          ...prev,
          phoneId: payload.channel.phoneId,
          verifyToken: payload.channel.verifyToken,
          sellerPhone: payload.channel.sellerPhone,
        }));
        await revisar();
      } catch (err) {
        setError(mensaje(err));
      } finally {
        setCargando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function revisar() {
    setRevisando(true);
    setError("");
    try {
      setDiag(await api<Diagnosis>("/api/channel/diagnose"));
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setRevisando(false);
    }
  }

  /** Guarda solo lo que escribiste: los campos en blanco no borran lo guardado. */
  async function guardarYVerificar() {
    setGuardando(true);
    setAviso("");
    setError("");
    try {
      const payload = await api<{ activo: boolean; channel: PublicChannel }>("/api/channel", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setChannel(payload.channel);
      // El token y el app secret ya viven en el servidor: se limpian de la vista.
      setForm((prev) => ({ ...prev, token: "", appSecret: "" }));
      setAviso(
        payload.activo
          ? "Guardado. El webhook quedó activo sin redeploy."
          : "Guardado. El webhook sigue apagado: falta algún campo.",
      );
      await revisar();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setGuardando(false);
    }
  }

  async function enviarPrueba() {
    setEnviando(true);
    setPrueba(null);
    try {
      await api("/api/channel/test", {
        method: "POST",
        body: JSON.stringify({ to: pruebaTo }),
      });
      setPrueba({ ok: true, texto: `Mensaje enviado a ${pruebaTo}. Revisa ese WhatsApp.` });
    } catch (err) {
      setPrueba({ ok: false, texto: mensaje(err) });
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return <div className="glass rounded-3xl p-6 text-sm text-muted">Leyendo el canal…</div>;
  }

  const pendientes = diag?.checks.filter((check) => check.estado !== "ok").length ?? 0;

  return (
    <div className="grid max-w-5xl gap-4">
      {/* ── Estado global ── */}
      <section
        className="glass rounded-3xl p-6"
        style={{
          borderLeft: `4px solid ${diag?.listo ? "var(--color-ok)" : "var(--color-red)"}`,
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="microlabel">Canal de WhatsApp</p>
            <h2 className="serif mt-2 text-2xl">
              {diag?.listo ? "Conectado" : "Falta terminar de conectar"}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              {diag?.listo
                ? pendientes > 0
                  ? `Lo esencial funciona. Quedan ${pendientes} avisos menores abajo.`
                  : "Todo verificado contra Meta: token, número y webhook."
                : "Completa los campos de abajo. Cada vez que guardes, le preguntamos a Meta si ya sirven."}
            </p>
          </div>
          <button
            type="button"
            disabled={revisando}
            onClick={() => void revisar()}
            className="rounded-2xl border border-navy/25 bg-white px-4 py-2.5 text-xs font-black text-navy disabled:opacity-50"
          >
            {revisando ? "Revisando…" : "Revisar conexión"}
          </button>
        </div>

        {diag && (
          <ol className="mt-5 grid gap-2">
            {diag.checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </ol>
        )}
      </section>

      {/* ── Los cuatro datos de Meta ── */}
      <section className="glass rounded-3xl p-6">
        <p className="microlabel">Datos de Meta</p>
        <h3 className="serif mt-2 text-xl">Pega aquí lo que te da la app de WhatsApp</h3>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Meta → tu app → WhatsApp → Configuración de la API. Lo que dejes en
          blanco se queda como está: guardar no borra el token anterior.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Campo
            label="Token de acceso permanente"
            pista="System User → Generate token, con whatsapp_business_messaging."
            marca={
              channel?.tokenSet
                ? channel.tokenSource === "env"
                  ? "configurado por variable de entorno"
                  : "ya guardado"
                : undefined
            }
          >
            <input
              type="password"
              autoComplete="off"
              className="settings-input font-mono text-[12px]"
              placeholder={channel?.tokenSet ? "•••••• (escribe uno nuevo para reemplazarlo)" : "EAAG…"}
              value={form.token}
              onChange={(event) => setForm({ ...form, token: event.target.value })}
            />
          </Campo>

          <Campo
            label="Phone Number ID"
            pista="Son solo dígitos — no es el número con «+»."
          >
            <input
              inputMode="numeric"
              className="settings-input font-mono text-[12px]"
              placeholder="123456789012345"
              value={form.phoneId}
              onChange={(event) => setForm({ ...form, phoneId: event.target.value })}
            />
          </Campo>

          <Campo
            label="Verify token del webhook"
            pista="Lo eliges tú; el mismo texto va aquí y en Meta."
          >
            <div className="flex gap-2">
              <input
                className="settings-input font-mono text-[12px]"
                placeholder="autoventa-webhook-2026"
                value={form.verifyToken}
                onChange={(event) => setForm({ ...form, verifyToken: event.target.value })}
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, verifyToken: generarToken() })}
                className="shrink-0 rounded-2xl border border-navy/25 bg-white px-3 text-[11px] font-black text-navy"
                title="Generar uno aleatorio"
              >
                Generar
              </button>
            </div>
          </Campo>

          <Campo
            label="App secret"
            pista="Configuración de la app → Básica → Clave secreta."
            marca={channel?.appSecretSet ? "ya guardado" : undefined}
          >
            <input
              type="password"
              autoComplete="off"
              className="settings-input font-mono text-[12px]"
              placeholder={channel?.appSecretSet ? "•••••• (escribe uno nuevo para reemplazarlo)" : "32 caracteres"}
              value={form.appSecret}
              onChange={(event) => setForm({ ...form, appSecret: event.target.value })}
            />
          </Campo>

          <Campo
            label="WhatsApp del vendedor"
            pista="Recibe las alertas cuando el bot pide ayuda. Sin «+»."
          >
            <input
              inputMode="numeric"
              className="settings-input font-mono text-[12px]"
              placeholder="5939…"
              value={form.sellerPhone}
              onChange={(event) => setForm({ ...form, sellerPhone: event.target.value })}
            />
          </Campo>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={guardando}
            onClick={() => void guardarYVerificar()}
            className="rounded-2xl bg-red px-6 py-3 text-xs font-black text-white disabled:opacity-50"
          >
            {guardando ? "Guardando y verificando…" : "Guardar y verificar"}
          </button>
          {aviso && <span className="text-xs font-bold text-ok">{aviso}</span>}
          {error && <span className="text-xs font-bold text-red">{error}</span>}
        </div>
      </section>

      {/* ── Lo que hay que pegar en Meta ── */}
      {diag && (
        <section className="glass rounded-3xl p-6">
          <p className="microlabel">De vuelta en Meta</p>
          <h3 className="serif mt-2 text-xl">Configura el webhook con estos dos valores</h3>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Meta → WhatsApp → Configuración → Webhook → Editar. Después suscribe
            el campo <b>messages</b>, o no llegará ninguna conversación.
          </p>
          <div className="mt-4 grid gap-2">
            <Copiable label="URL de devolución de llamada" valor={diag.webhookUrl} />
            <Copiable
              label="Token de verificación"
              valor={diag.verifyToken || "— guarda primero un verify token —"}
              deshabilitado={!diag.verifyToken}
            />
          </div>
        </section>
      )}

      {/* ── Prueba real de salida ── */}
      <section className="glass rounded-3xl p-6">
        <p className="microlabel">Prueba de extremo a extremo</p>
        <h3 className="serif mt-2 text-xl">Mándate un mensaje</h3>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Es la única comprobación que confirma que el canal <b>sale</b> de
          verdad. Si el número no te ha escrito en las últimas 24 h, Meta
          rechazará el texto libre — eso también te lo decimos aquí.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            inputMode="numeric"
            className="settings-input max-w-64 font-mono text-[12px]"
            placeholder="5939…"
            value={pruebaTo}
            onChange={(event) => setPruebaTo(event.target.value)}
          />
          <button
            type="button"
            disabled={enviando || pruebaTo.replace(/\D/g, "").length < 8}
            onClick={() => void enviarPrueba()}
            className="rounded-2xl bg-navy px-5 py-3 text-xs font-black text-white disabled:opacity-50"
          >
            {enviando ? "Enviando…" : "Enviar prueba"}
          </button>
        </div>
        {prueba && (
          <p
            className="mt-3 rounded-2xl px-4 py-3 text-xs font-bold"
            style={{
              background: prueba.ok
                ? "color-mix(in srgb, var(--color-ok) 12%, white)"
                : "color-mix(in srgb, var(--color-red) 10%, white)",
              color: prueba.ok ? "var(--color-ok)" : "var(--color-red)",
            }}
          >
            {prueba.texto}
          </p>
        )}
      </section>
    </div>
  );
}

const ICONO: Record<CheckEstado, ReactNode> = {
  ok: <IconCheck size={11} />,
  falta: <span className="block h-1.5 w-1.5 rounded-full bg-white" />,
  error: <IconAlert size={11} />,
};

function CheckRow({ check }: { check: ChannelCheck }) {
  const color =
    check.estado === "ok"
      ? "var(--color-ok)"
      : check.estado === "error"
        ? "var(--color-red)"
        : "var(--color-muted)";
  return (
    <li className="flex gap-3 rounded-2xl bg-paper/[.04] px-4 py-3">
      <span
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-black text-white"
        style={{ background: color }}
        aria-hidden
      >
        {ICONO[check.estado]}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-black">{check.label}</p>
        <p className="mt-0.5 text-xs text-muted">{check.detalle}</p>
        {check.dato && (
          <p className="mt-1 font-mono text-[11px] break-all" style={{ color }}>
            {check.dato}
          </p>
        )}
        {check.ayuda && <p className="mt-1 text-[11px] leading-relaxed text-faint">{check.ayuda}</p>}
      </div>
    </li>
  );
}

function Copiable({
  label,
  valor,
  deshabilitado,
}: {
  label: string;
  valor: string;
  deshabilitado?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-paper/[.04] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="microlabel">{label}</p>
        <p className="mt-1 font-mono text-[11.5px] break-all">{valor}</p>
      </div>
      <button
        type="button"
        disabled={deshabilitado}
        onClick={() => {
          void navigator.clipboard.writeText(valor);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1600);
        }}
        className="shrink-0 rounded-xl border border-navy/25 bg-white px-3 py-2 text-[10px] font-black text-navy disabled:opacity-40"
      >
        {copiado ? "¡Copiado!" : "Copiar"}
      </button>
    </div>
  );
}

function Campo({
  label,
  pista,
  marca,
  children,
}: {
  label: string;
  pista: string;
  marca?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="microlabel mb-1.5 flex flex-wrap items-center gap-2">
        {label}
        {marca && (
          <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-black text-ok">
            {marca}
          </span>
        )}
      </span>
      {children}
      <span className="mt-1 block text-[10.5px] leading-relaxed text-faint">{pista}</span>
    </label>
  );
}

/** Verify token aleatorio: no tiene que ser secreto, sí impredecible. */
function generarToken(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `autoventa-${hex}`;
}

function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : "Algo salió mal";
}

async function api<T extends object = { ok: true }>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Error ${response.status}`);
  return payload;
}
