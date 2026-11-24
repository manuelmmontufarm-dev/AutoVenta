import { useMemo, useState } from "react";
import { Segmented } from "../components/ui";
import { marked } from "marked";
import { AdminKeyForm } from "../components/admin-key";
import { WhatsAppSetup } from "../components/whatsapp-setup";
import { useNegocio } from "../data/negocio";
import { useHub } from "../store";

type SettingsTab = "whatsapp" | "manual" | "connection";

export function Settings() {
  const [tab, setTab] = useState<SettingsTab>("whatsapp");
  // El manual que muestra esta pestaña es el que recibe EL BOT DE ESTE
  // servidor (`/api/negocio`, R-31), no el horneado en el build del panel: con
  // dos clientes, el build es uno y el playbook de cada servicio es el suyo.
  const botPlaybook = useNegocio().playbook;
  const playbookHtml = useMemo(
    () => marked.parse(botPlaybook, { async: false }) as string,
    [botPlaybook],
  );

  return (
    <div className="h-full overflow-y-auto px-4 pb-10 md:px-8">
      <div className="flex flex-col gap-4">
        {/* El interruptor va primero: cuando hace falta apagar el bot, hace falta ya. */}
        <BotPowerSwitch />

        <Segmented
          id="settings"
          valor={tab}
          onChange={setTab}
          opciones={[
            { valor: "whatsapp", label: "Conexión de WhatsApp" },
            { valor: "manual", label: "Manual base del bot" },
            { valor: "connection", label: "Conexión del panel" },
          ]}
        />

        {tab === "whatsapp" && <WhatsAppSetup />}

        {tab === "manual" && (
          <section className="max-w-5xl rounded-[10px] border border-line bg-surface px-5 pt-[18px] pb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <p className="text-[13px] font-semibold">Manual base del bot</p>
                <p className="max-w-2xl text-[12px] leading-relaxed text-text2">
                  Lo que el bot sabe del negocio antes de cada respuesta. Las reglas de
                  precios, stock, seguridad y cotización viven acá y ninguna otra
                  configuración las puede cambiar.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void navigator.clipboard.writeText(botPlaybook)} className="btn-quiet h-9 rounded-[6px] px-3.5 text-[13px]">
                  Copiar Markdown
                </button>
                <button type="button" onClick={() => downloadPlaybook(botPlaybook)} className="btn-quiet h-9 rounded-[6px] px-3.5 text-[13px]">
                  Descargar .md
                </button>
              </div>
            </div>
            <article className="playbook-markdown mt-4" dangerouslySetInnerHTML={{ __html: playbookHtml }} />
          </section>
        )}

        {tab === "connection" && (
          <section className="max-w-2xl rounded-[10px] border border-line bg-surface px-5 pt-[18px] pb-5">
            <p className="text-[13px] font-semibold">Conexión del panel con el servidor</p>
            <p className="mt-1 text-[12px] leading-relaxed text-text2">
              Con esta clave el panel lee tickets, métricas y las fases encendidas.
              Tocá <b>Conectar</b> y te dice si quedó bien, si la clave está mal o si el
              servidor no responde.
            </p>
            <div className="mt-4">
              <AdminKeyForm />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-text2">
              La clave nunca se incluye en el código ni en una URL.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function downloadPlaybook(botPlaybook: string) {
  const url = URL.createObjectURL(
    new Blob([botPlaybook], { type: "text/markdown;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "BOT_PLAYBOOK.md";
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Lo que pone el backend cuando la instalación nace apagada
 * (app/src/services/botPower.ts). No es un motivo de verdad: es una frase que
 * solo tiene sentido con el bot apagado, y encendido sonaría a contradicción.
 */
const MOTIVO_NUNCA_ENCENDIDO = "Nunca se ha encendido en este servidor";

/**
 * Interruptor de emergencia. Va arriba de todo y fuera de las pestañas: cuando
 * hace falta apagar el bot, hace falta ya, y nadie debería tener que acordarse
 * de en qué pestaña estaba.
 *
 * El estado sale del store, no de un fetch propio: es el mismo dato que pinta
 * el aviso de la cabecera, y dos copias podrían contradecirse justo en lo único
 * que no admite ambigüedad — si el bot le está escribiendo a clientes o no.
 *
 * Las DOS acciones piden un motivo: cada cambio le manda un WhatsApp a los
 * asesores con lo que se escriba aquí, así que encender sin decir por qué deja
 * a quien recibe el aviso adivinando. El motivo sigue siendo opcional — apagar
 * es un botón de emergencia y nada puede interponerse.
 */
export function BotPowerSwitch() {
  const power = useHub((s) => s.power);
  const cambiarPower = useHub((s) => s.cambiarPower);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  // Una sola confirmación para las dos acciones: son el mismo gesto (avisar por
  // qué) y duplicar estado invita a que se queden los dos abiertos a la vez.
  const [confirmando, setConfirmando] = useState<"on" | "off" | null>(null);
  const [motivo, setMotivo] = useState("");
  // R-44: el servidor contesta 409 si se enciende con pendientes de arranque;
  // acá se muestran y el dueño decide «Encender igual», que repite el PUT con
  // la confirmación explícita. Depot no tiene pendientes y nunca ve esto.
  const [faltanParaEncender, setFaltanParaEncender] = useState(false);
  const faltantes = useNegocio().faltantes;

  async function cambiar(activo: boolean, confirmarFaltantes = false) {
    setGuardando(true);
    setError("");
    try {
      await cambiarPower(activo, motivo.trim(), confirmarFaltantes);
      setConfirmando(null);
      setMotivo("");
      setFaltanParaEncender(false);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No se pudo cambiar";
      if (activo && mensaje.includes("faltan datos de arranque")) {
        setFaltanParaEncender(true);
      }
      setError(mensaje);
    } finally {
      setGuardando(false);
    }
  }

  const apagado = !power.activo;
  const encendiendo = confirmando === "on";
  const colorAccion = encendiendo ? "var(--color-ok)" : "var(--color-signal)";

  return (
    <div
      className="border border-line bg-surface mb-4 rounded-[10px] p-5"
      style={apagado ? { borderColor: "var(--color-signal)", borderWidth: 2 } : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-60 flex-1">
          <p className="microlabel">Estado del bot</p>
          <p className="mt-1 text-[15px] font-semibold" style={{ color: apagado ? "var(--color-signal)" : undefined }}>
            {apagado ? "Apagado" : "Respondiendo"}
          </p>
          <p className="mt-1 text-[13px] text-text2">
            {apagado ? (
              <>
                No contesta ni manda seguimientos. Los mensajes de los clientes{" "}
                <strong>siguen llegando</strong> al Inbox y puedes responder a mano.
                {power.apagadoAt ? (
                  <>
                    {" "}Apagado desde {formatoFechaHora(power.apagadoAt)}
                    {power.motivo && <> · Motivo: {power.motivo}</>}
                  </>
                ) : (
                  // Sin fecha de apagado nunca estuvo encendido: el motivo lo
                  // explica solo y llamarlo "motivo" sonaría a avería.
                  power.motivo && <> {power.motivo}.</>
                )}
              </>
            ) : (
              <>
                Contesta a los clientes y envía los seguimientos programados.
                {/* El motivo ya no se borra al encender: describe el estado
                    ACTUAL, así que también hay algo que contar cuando el bot
                    trabaja ("ya está el catálogo"). Se descarta el texto del
                    servidor recién instalado: encendido diría lo contrario de
                    lo que se ve. */}
                {power.motivo && power.motivo !== MOTIVO_NUNCA_ENCENDIDO && <> · Motivo: {power.motivo}</>}
              </>
            )}
          </p>
        </div>

        {apagado ? (
          <button
            disabled={guardando}
            onClick={() => setConfirmando("on")}
            className="rounded-[8px] px-5 py-3 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-ok)" }}
          >
            Encender el bot
          </button>
        ) : (
          <button
            disabled={guardando}
            onClick={() => setConfirmando("off")}
            className="rounded-[8px] border-2 px-5 py-3 text-[13px] font-semibold disabled:opacity-50"
            style={{ borderColor: "var(--color-signal)", color: "var(--color-signal)" }}
          >
            Apagar el bot
          </button>
        )}
      </div>

      {confirmando && (
        <div className="mt-4 rounded-[8px] border-2 p-4" style={{ borderColor: colorAccion }}>
          {/* Apagar es una emergencia y avisa del daño; encender es volver a la
              normalidad y solo pregunta por qué. Mismo bloque, distinto tono. */}
          <p className="text-[13px] font-semibold">
            {encendiendo ? "¿Por qué se vuelve a encender?" : "¿Apagar el bot para todos los clientes?"}
          </p>
          <p className="mt-1 text-[13px] text-text2">
            {encendiendo ? (
              <>
                Vuelve a contestar solo y a mandar los seguimientos programados.
              </>
            ) : (
              <>
                Deja de responder <strong>en el acto</strong>. Quien escriba no recibirá respuesta hasta
                que alguien conteste a mano o lo vuelvas a encender.
              </>
            )}
          </p>
          <input
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder={
              encendiendo
                ? "Motivo (opcional): ya está el catálogo, terminé de probar…"
                : "Motivo (opcional): catálogo desactualizado, pruebas…"
            }
            maxLength={200}
            className="settings-input mt-3"
          />
          {/* Que el dueño sepa que esto no se queda en el panel: lo que escriba
              lo va a leer un asesor en su teléfono. */}
          <p className="mt-2 text-[12px] text-text2">
            Se le avisa a los asesores por WhatsApp con este motivo.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={guardando}
              onClick={() => void cambiar(encendiendo)}
              className="rounded-[8px] px-5 py-3 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: colorAccion }}
            >
              {encendiendo
                ? guardando
                  ? "Encendiendo…"
                  : "Encender el bot"
                : guardando
                  ? "Apagando…"
                  : "Sí, apagar"}
            </button>
            <button
              onClick={() => {
                setConfirmando(null);
                setMotivo("");
              }}
              className="rounded-[8px] px-5 py-3 text-[13px] font-semibold"
              style={{ color: "var(--color-text2)" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-[13px] font-semibold" style={{ color: "var(--color-signal)" }}>
          {error}
        </p>
      )}

      {faltanParaEncender && (
        <div className="border-line mt-3 rounded-[8px] border p-4">
          <p className="text-[13px] font-semibold">Al negocio le faltan datos de arranque:</p>
          <ul className="mt-2 list-disc pl-5 text-[13px] text-text2">
            {faltantes.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-text2">
            El bot puede trabajar sin ellos, pero donde falte un dato responderá con un respaldo
            neutro o lo derivará a un asesor.
          </p>
          <button
            className="btn-signal mt-3 h-9 rounded-[6px] px-4 text-[13px]"
            disabled={guardando}
            onClick={() => void cambiar(true, true)}
          >
            Encender igual
          </button>
        </div>
      )}
    </div>
  );
}

function formatoFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Guayaquil",
  });
}
