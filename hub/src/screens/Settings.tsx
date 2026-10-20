import { useEffect, useMemo, useState } from "react";
import { Segmented } from "../components/ui";
import { marked } from "marked";
import { COMPACT_PLAYBOOK } from "../../../app/src/agent/compactPlaybook";
import { ETAPA_META, ETAPAS, type Etapa } from "../data/types";
import { AdminKeyForm } from "../components/admin-key";
import { WhatsAppSetup } from "../components/whatsapp-setup";
import { authHeaders } from "../data/realSource";
import { useHub } from "../store";

type SettingsTab = "whatsapp" | "manual" | "connection";

/** La pestaña Manual muestra los mismos módulos que recibe el bot, no una copia. */
const botPlaybook = COMPACT_PLAYBOOK;
export function Settings() {
  const [tab, setTab] = useState<SettingsTab>("whatsapp");
  const playbookHtml = useMemo(
    () => marked.parse(botPlaybook, { async: false }) as string,
    [],
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
                <button type="button" onClick={downloadPlaybook} className="btn-quiet h-9 rounded-[6px] px-3.5 text-[13px]">
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

interface FollowUpPolicyAdmin {
  enabled: boolean; timezone: string;
  business_hours: Record<string, { open: string; close: string } | null>;
  quiet_hours: Record<string, unknown>; enabled_stages: Etapa[];
  first_delay_minutes: number; second_before_close_minutes: number; minimum_gap_minutes: number;
  max_in_window_attempts: number; max_post_window_attempts: number; post_window_gap_minutes: number;
  advisor_alert_days: number; recommend_close_days: number; require_consent: boolean;
  respect_opt_out: boolean; never_outside_hours: boolean; max_messages_per_day: number;
  pause_on_human_control: boolean;
  template_follow_up_days: number; template_send_time: string;
  stage_prompts: Partial<Record<Etapa, string>>;
  alert_settings: { sound?: boolean; recipient?: string; autoAssign?: boolean; priorityByEvent?: Record<string, string>; escalationRules?: unknown[] };
}

interface FollowUpTemplateAdmin {
  template_key: string; template_name: string | null; language: string; expected_category: string;
  variables: string[]; buttons: unknown[]; preview: string;
  approval_status: "not_configured" | "pending" | "approved" | "rejected";
  configured: boolean; automatic_send: boolean;
}

export function FollowUpSettingsPanel() {
  const [policy, setPolicy] = useState<FollowUpPolicyAdmin | null>(null);
  const [templates, setTemplates] = useState<FollowUpTemplateAdmin[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => { void api<{ policy: FollowUpPolicyAdmin; templates: FollowUpTemplateAdmin[] }>("/api/follow-up-settings").then((data) => { setPolicy(data.policy); setTemplates(data.templates); }).catch((error) => setMessage(error instanceof Error ? error.message : "No se pudo cargar")); }, []);
  if (!policy) return <div className="border border-line bg-surface rounded-[10px] p-6 text-[14px] text-text2">{message || "Cargando configuración…"}</div>;
  const setNumber = (key: keyof FollowUpPolicyAdmin, value: string) => setPolicy({ ...policy, [key]: Number(value) });
  async function savePolicy() {
    if (!policy) return;
    await api("/api/follow-up-settings/policy", { method: "PUT", body: JSON.stringify({
      enabled: policy.enabled, timezone: policy.timezone, businessHours: policy.business_hours,
      quietHours: policy.quiet_hours, enabledStages: policy.enabled_stages,
      firstDelayMinutes: policy.first_delay_minutes, secondBeforeCloseMinutes: policy.second_before_close_minutes,
      minimumGapMinutes: policy.minimum_gap_minutes, maxInWindowAttempts: policy.max_in_window_attempts,
      maxPostWindowAttempts: policy.max_post_window_attempts, postWindowGapMinutes: policy.post_window_gap_minutes,
      advisorAlertDays: policy.advisor_alert_days, recommendCloseDays: policy.recommend_close_days,
      requireConsent: policy.require_consent, respectOptOut: policy.respect_opt_out,
      neverOutsideHours: policy.never_outside_hours, maxMessagesPerDay: policy.max_messages_per_day,
      pauseOnHumanControl: policy.pause_on_human_control, alertSettings: policy.alert_settings,
      stagePrompts: policy.stage_prompts,
      templateFollowUpDays: policy.template_follow_up_days, templateSendTime: policy.template_send_time,
    }) }); setMessage("Política de seguimientos guardada.");
  }
  async function saveTemplate(template: FollowUpTemplateAdmin) {
    await api(`/api/follow-up-settings/templates/${template.template_key}`, { method: "PUT", body: JSON.stringify({
      templateName: template.template_name, language: template.language, expectedCategory: template.expected_category,
      variables: template.variables, buttons: template.buttons, preview: template.preview,
      approvalStatus: template.approval_status, configured: template.configured, automaticSend: template.automatic_send,
    }) }); setMessage(`Plantilla ${template.template_key} guardada.`);
  }
  return <div className="grid gap-4 xl:grid-cols-2">
    <section className="border border-line bg-surface rounded-[10px] p-5"><p className="text-[13px] font-semibold">Horarios de seguimiento</p><p className="mb-3 text-[12px] text-text2">Cuándo puede escribir el bot por su cuenta</p><div className="grid gap-3 sm:grid-cols-3"><Field label="Timezone"><input className="settings-input" value={policy.timezone} onChange={(e) => setPolicy({ ...policy, timezone: e.target.value })} /></Field><Field label="Inicio"><input type="time" className="settings-input" value={policy.business_hours["1"]?.open ?? "08:30"} onChange={(e) => setPolicy({ ...policy, quiet_hours: { ...policy.quiet_hours, end: e.target.value }, business_hours: Object.fromEntries(Object.entries(policy.business_hours).map(([day, hours]) => [day, hours ? { ...hours, open: e.target.value } : null])) })} /></Field><Field label="Fin"><input type="time" className="settings-input" value={policy.business_hours["1"]?.close ?? "17:30"} onChange={(e) => setPolicy({ ...policy, quiet_hours: { ...policy.quiet_hours, start: e.target.value }, business_hours: Object.fromEntries(Object.entries(policy.business_hours).map(([day, hours]) => [day, hours ? { ...hours, close: e.target.value } : null])) })} /></Field></div><div className="mt-3 flex flex-wrap gap-2">{["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map((label, day) => <label key={label} className="flex items-center gap-1 rounded-full border px-2 py-1 text-[12px] font-semibold"><input type="checkbox" checked={Boolean(policy.business_hours[String(day)])} onChange={(e) => setPolicy({ ...policy, business_hours: { ...policy.business_hours, [day]: e.target.checked ? { open: String(policy.quiet_hours.end ?? "08:30"), close: String(policy.quiet_hours.start ?? "17:30") } : null } })} />{label}</label>)}</div><p className="mt-3 text-[12px] text-text2">Fuera de este horario no se enviarán mensajes. Al guardar, los seguimientos pendientes se recalculan inmediatamente.</p></section>
    <section className="border border-line bg-surface rounded-[10px] p-5"><p className="text-[13px] font-semibold">Tiempos de seguimiento</p><p className="mb-3 text-[12px] text-text2">Cuánto espera el bot antes de volver a escribir</p><div className="grid grid-cols-2 gap-3"><Field label="Primer retraso (min)"><input type="number" className="settings-input" value={policy.first_delay_minutes} onChange={(e) => setNumber("first_delay_minutes", e.target.value)} /></Field><Field label="Antes del cierre (min)"><input type="number" className="settings-input" value={policy.second_before_close_minutes} onChange={(e) => setNumber("second_before_close_minutes", e.target.value)} /></Field><Field label="Separación mínima (min)"><input type="number" className="settings-input" value={policy.minimum_gap_minutes} onChange={(e) => setNumber("minimum_gap_minutes", e.target.value)} /></Field><Field label="Días con plantilla"><input type="number" min="1" max="8" className="settings-input" value={policy.template_follow_up_days} onChange={(e) => setNumber("template_follow_up_days", e.target.value)} /></Field><Field label="Hora diaria"><input type="time" className="settings-input" value={policy.template_send_time} onChange={(e) => setPolicy({ ...policy, template_send_time: e.target.value })} /></Field><Field label="Recomendar cierre (días)"><input type="number" className="settings-input" value={policy.recommend_close_days} onChange={(e) => setNumber("recommend_close_days", e.target.value)} /></Field></div><p className="mt-2 text-[12px] text-text2">Las plantillas post-24 h solo se programan cuando un asesor confirma el plan desde el ticket.</p><p className="microlabel mt-4 mb-2">Habilitado por etapa</p><div className="flex flex-wrap gap-2">{ETAPAS.map((stage) => <label key={stage} className="flex items-center gap-1 text-[12px] font-semibold"><input type="checkbox" checked={policy.enabled_stages.includes(stage)} onChange={(e) => setPolicy({ ...policy, enabled_stages: e.target.checked ? [...policy.enabled_stages, stage] : policy.enabled_stages.filter((item) => item !== stage) })} />{ETAPA_META[stage].nombre}</label>)}</div></section>
    <section className="border border-line bg-surface rounded-[10px] p-5 xl:col-span-2">
      <p className="microlabel">Cómo debe escribir el seguimiento</p>
      <p className="mt-1 text-[13px] text-text2">Un solo prompt editable por etapa. Ya está prellenado para mensajes breves, humanos, persuasivos y basados únicamente en el contexto real.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">{ETAPAS.map((stage) => <label key={stage} className="rounded-[8px] border border-line p-3"><span className="text-[12px] font-semibold" style={{ color: ETAPA_META[stage].color }}>{ETAPA_META[stage].nombre}</span><textarea rows={4} className="settings-input mt-2" value={policy.stage_prompts?.[stage] ?? ""} onChange={(e) => setPolicy({ ...policy, stage_prompts: { ...policy.stage_prompts, [stage]: e.target.value } })} /></label>)}</div>
      <details className="mt-4 rounded-[8px] border border-line p-3">
        <summary className="cursor-pointer text-[12px] font-semibold">Configuración avanzada de Meta (solo cuando aprueben las plantillas)</summary>
        <p className="mt-2 text-[12px] text-warn">Estas plantillas siguen desactivadas hasta registrar el nombre aprobado en Meta. Nunca se usa texto libre con la ventana cerrada.</p>
        <div className="mt-3 grid gap-2">{templates.map((template, index) => <div key={template.template_key} className="grid items-end gap-2 rounded-[6px] bg-bg p-3 md:grid-cols-[1.2fr_1fr_1fr_auto]"><Field label={template.template_key}><input className="settings-input" placeholder="Nombre aprobado en Meta" value={template.template_name ?? ""} onChange={(e) => setTemplates(templates.map((item, i) => i === index ? { ...item, template_name: e.target.value || null } : item))} /></Field><Field label="Estado"><select className="settings-input" value={template.approval_status} onChange={(e) => setTemplates(templates.map((item, i) => i === index ? { ...item, approval_status: e.target.value as FollowUpTemplateAdmin["approval_status"] } : item))}><option value="not_configured">No configurada</option><option value="pending">Pendiente</option><option value="approved">Aprobada</option><option value="rejected">Rechazada</option></select></Field><label className="mb-2 flex items-center gap-2 text-[12px] font-semibold"><input type="checkbox" checked={template.automatic_send} onChange={(e) => setTemplates(templates.map((item, i) => i === index ? { ...item, automatic_send: e.target.checked, configured: e.target.checked || item.configured } : item))} />Envío automático</label><button onClick={() => void saveTemplate(template)} className="mb-1 rounded-[6px] bg-text px-3 py-2 text-[12px] font-semibold text-white">Guardar</button></div>)}</div>
      </details>
    </section>
    <section className="border border-line bg-surface rounded-[10px] p-5"><p className="microlabel">Alertas</p><label className="mt-4 flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={policy.alert_settings.sound ?? true} onChange={(e) => setPolicy({ ...policy, alert_settings: { ...policy.alert_settings, sound: e.target.checked } })} />Sonido</label><Field label="Destinatario"><input className="settings-input" value={policy.alert_settings.recipient ?? "owner"} onChange={(e) => setPolicy({ ...policy, alert_settings: { ...policy.alert_settings, recipient: e.target.value } })} /></Field><label className="mt-3 flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={policy.alert_settings.autoAssign ?? false} onChange={(e) => setPolicy({ ...policy, alert_settings: { ...policy.alert_settings, autoAssign: e.target.checked } })} />Autoasignación</label><p className="mt-3 text-[12px] text-text2">Escalamiento inicial: asesor al día {policy.advisor_alert_days}; recomendar Perdido al día {policy.recommend_close_days}, sin cierre automático.</p></section>
    <section className="border border-line bg-surface rounded-[10px] p-5"><p className="microlabel">Seguridad</p>{([["require_consent","Requerir consentimiento"],["respect_opt_out","Respetar opt-out"],["never_outside_hours","Nunca fuera de horario"],["pause_on_human_control","Pausar al tomar control humano"]] as const).map(([key, label]) => <label key={key} className="mt-3 flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={policy[key]} onChange={(e) => setPolicy({ ...policy, [key]: e.target.checked })} />{label}</label>)}<Field label="Máximo diario"><input type="number" className="settings-input" value={policy.max_messages_per_day} onChange={(e) => setNumber("max_messages_per_day", e.target.value)} /></Field></section>
    <div className="xl:col-span-2"><button onClick={() => void savePolicy()} className="btn-signal h-10 rounded-[6px] px-5 text-[13px]">Guardar seguimientos</button>{message && <span className="ml-3 text-[13px] font-semibold">{message}</span>}</div>
  </div>;
}

function downloadPlaybook() {
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

  async function cambiar(activo: boolean) {
    setGuardando(true);
    setError("");
    try {
      await cambiarPower(activo, motivo.trim());
      setConfirmando(null);
      setMotivo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar");
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-4 block">
      <span className="microlabel mb-1.5 block">{label}</span>
      {children}
    </label>
  );
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
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error ?? `Error ${response.status}`);
  return payload;
}
