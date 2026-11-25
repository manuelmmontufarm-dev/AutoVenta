/**
 * Ajustes → Seguimientos (rehecho el 24-nov-2026; Manuel: «puede estar más
 * simple, lindo y fácil de usar»).
 *
 * Antes eran seis tarjetas en dos columnas, con los tiempos en minutos
 * («Primer retraso (min): 180»), la zona horaria escrita a mano y un prompt por
 * etapa que nadie tocaba. Ahora es una sola columna que se lee como frases
 * —«Primer mensaje: 3 horas después de que el cliente deja de contestar»—, con
 * lo que casi nunca se toca plegado al final y un solo «Guardar» que aparece
 * cuando hay algo que guardar.
 *
 * Lo que NO cambió es lo que se guarda: la misma política, campo por campo. Los
 * textos por etapa («Cómo debe escribir el seguimiento») salieron de la
 * pantalla, pero los que ya estaban guardados se mandan de vuelta tal cual: el
 * bot los sigue usando al escribir cada seguimiento (`services/followUps.ts`).
 */
import { useEffect, useState, type ReactNode } from "react";
import { ETAPA_META, ETAPAS, type Etapa } from "../data/types";
import { authHeaders } from "../data/realSource";
import { Interruptor, Plegable } from "./piezas";
import { Panel } from "./ui";

async function api<T extends object = { ok: true }>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Error ${response.status}`);
  return payload;
}

interface Politica {
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

interface Plantilla {
  template_key: string; template_name: string | null; language: string; expected_category: string;
  variables: string[]; buttons: unknown[]; preview: string;
  approval_status: "not_configured" | "pending" | "approved" | "rejected";
  configured: boolean; automatic_send: boolean;
  meta_status?: string | null; meta_category?: string | null; meta_synced_at?: string | null;
}

/** Lo que contestó Meta, en palabras del panel. */
const ESTADO_META: Record<string, { label: string; clase: string }> = {
  APPROVED: { label: "Aprobada", clase: "bg-ok/10 text-ok" },
  PENDING: { label: "En revisión", clase: "bg-warn/10 text-warn" },
  IN_APPEAL: { label: "En apelación", clase: "bg-warn/10 text-warn" },
  REJECTED: { label: "Rechazada", clase: "bg-signal-tint text-signal" },
  PAUSED: { label: "Pausada", clase: "bg-signal-tint text-signal" },
  DISABLED: { label: "Desactivada", clase: "bg-signal-tint text-signal" },
};
const NEUTRA = "bg-line text-text2";

/** Qué hace cada plantilla cuando se prende «Se envía sola». */
const CUANDO_SALE: Record<string, string> = {
  recordatorio_visita_v1: "Sale la víspera de la visita, entre 17:00 y 20:00, salvo que el cliente haya escrito en las últimas 6 horas.",
  visita_no_llego_v1: "Sale el día después de la visita, entre 10:00 y 13:00, si no vino, no compró y no escribió. Necesita las facturas al día.",
};

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
/** Lunes primero, como se lee una semana de trabajo. */
const ORDEN_DE_DIAS = [1, 2, 3, 4, 5, 6, 0];

const CAMPO = "h-10 rounded-[6px] border border-line-strong bg-bg px-3 text-[14px] outline-none focus:border-signal";
const pastilla = (prendida: boolean) =>
  `h-9 rounded-full border px-3.5 text-[13px] transition-colors ${
    prendida ? "border-signal bg-signal-tint font-semibold text-signal" : "border-line bg-bg text-text2 hover:border-line-strong"
  }`;

function Bloque({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return (
    <Panel className="p-5 md:px-6">
      <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{titulo}</h3>
      {sub && <p className="mt-0.5 text-[13px] text-text2">{sub}</p>}
      <div className="mt-4">{children}</div>
    </Panel>
  );
}

/** Una regla que se lee como frase: nombre a la izquierda, la frase con su número a la derecha. */
function Regla({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div className="grid items-center gap-x-4 gap-y-1 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[170px_1fr]">
      <span className="text-[13px] font-semibold">{nombre}</span>
      <span className="flex flex-wrap items-center gap-2 text-[14px] text-text2">{children}</span>
    </div>
  );
}

/** Un número dentro de una frase. */
function Numero({ valor, onCambio, min, max, paso = 1, etiqueta }: {
  valor: number; onCambio: (n: number) => void; min: number; max: number; paso?: number; etiqueta: string;
}) {
  return (
    <input
      type="number" inputMode="decimal" aria-label={etiqueta} min={min} max={max} step={paso}
      value={Number.isFinite(valor) ? valor : ""}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n)) onCambio(Math.min(max, Math.max(min, n)));
      }}
      className={`${CAMPO} w-[76px] text-center font-semibold text-text`}
    />
  );
}

/** Los minutos que guarda el servidor, mostrados en horas (180 → 3; 90 → 1,5). */
const aHoras = (minutos: number) => Math.round((minutos / 60) * 10) / 10;
const aMinutos = (horas: number) => Math.max(1, Math.round(horas * 60));

function Opcion({ prendido, onCambio, titulo, sub }: { prendido: boolean; onCambio: (v: boolean) => void; titulo: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{titulo}</span>
        {sub && <span className="block text-[13px] text-text2">{sub}</span>}
      </span>
      <Interruptor prendido={prendido} onCambio={onCambio} etiqueta={titulo} />
    </div>
  );
}

export function FollowUpSettingsPanel() {
  const [policy, setPolicy] = useState<Politica | null>(null);
  const [guardada, setGuardada] = useState<Politica | null>(null);
  const [templates, setTemplates] = useState<Plantilla[]>([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [errorMeta, setErrorMeta] = useState("");
  const [nombreAbierto, setNombreAbierto] = useState<string | null>(null);

  async function sincronizar() {
    setSincronizando(true);
    setErrorMeta("");
    try {
      const data = await api<{ templates: Plantilla[] }>("/api/follow-up-settings/templates/sync", { method: "POST" });
      setTemplates(data.templates);
    } catch (e) {
      setErrorMeta(e instanceof Error ? e.message : "No se pudo leer Meta");
    } finally {
      setSincronizando(false);
    }
  }

  useEffect(() => {
    void api<{ policy: Politica; templates: Plantilla[] }>("/api/follow-up-settings")
      .then((data) => { setPolicy(data.policy); setGuardada(data.policy); setTemplates(data.templates); void sincronizar(); })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar"));
  }, []);

  // El «Guardado» se va solo: no es algo que haya que cerrar.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  if (!policy) {
    return <Panel className="p-6 text-[14px] text-text2">{error || "Cargando los seguimientos…"}</Panel>;
  }

  const cambiar = (cambio: Partial<Politica>) => { setPolicy({ ...policy, ...cambio }); setAviso(""); };
  const sinGuardar = JSON.stringify(policy) !== JSON.stringify(guardada);

  // El horario es uno solo para todos los días prendidos: el de cualquier día
  // abierto, o el de las horas de silencio si todavía no hay ninguno.
  const abierto = Object.values(policy.business_hours).find(Boolean);
  const abre = abierto?.open ?? String(policy.quiet_hours.end ?? "08:30");
  const cierra = abierto?.close ?? String(policy.quiet_hours.start ?? "17:30");
  const ponerHorario = (open: string, close: string) => cambiar({
    quiet_hours: { ...policy.quiet_hours, end: open, start: close },
    business_hours: Object.fromEntries(Object.entries(policy.business_hours).map(([dia, h]) => [dia, h ? { open, close } : null])),
  });
  const alternarDia = (dia: number) => cambiar({
    business_hours: { ...policy.business_hours, [dia]: policy.business_hours[String(dia)] ? null : { open: abre, close: cierra } },
  });

  async function guardar() {
    if (!policy) return;
    setGuardando(true);
    setError("");
    try {
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
        // Ya no se editan acá, pero el bot los sigue usando: van de vuelta tal cual.
        stagePrompts: policy.stage_prompts,
        templateFollowUpDays: policy.template_follow_up_days, templateSendTime: policy.template_send_time,
      }) });
      setGuardada(policy);
      setAviso("Guardado. Los seguimientos pendientes ya se reprogramaron.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  /** Una plantilla se guarda sola, al tocar: no espera al «Guardar» de abajo. */
  async function guardarPlantilla(t: Plantilla) {
    const antes = templates;
    setTemplates(templates.map((x) => (x.template_key === t.template_key ? t : x)));
    setErrorMeta("");
    try {
      await api(`/api/follow-up-settings/templates/${t.template_key}`, { method: "PUT", body: JSON.stringify({
        templateName: t.template_name, language: t.language, expectedCategory: t.expected_category,
        variables: t.variables, buttons: t.buttons, preview: t.preview,
        approvalStatus: t.approval_status, configured: t.configured, automaticSend: t.automatic_send,
      }) });
    } catch (e) {
      setTemplates(antes);
      setErrorMeta(e instanceof Error ? e.message : "No se pudo guardar la plantilla");
    }
  }

  return (
    <div className="mx-auto flex max-w-[780px] flex-col gap-4" data-testid="seguimientos">
      <Bloque titulo="Cuándo puede escribir el bot por su cuenta" sub="Fuera de estos días y horas no manda ningún seguimiento.">
        <div className="flex flex-wrap gap-2">
          {ORDEN_DE_DIAS.map((dia) => {
            const prendido = Boolean(policy.business_hours[String(dia)]);
            return (
              <button key={dia} type="button" aria-pressed={prendido} data-testid={`dia-${dia}`} onClick={() => alternarDia(dia)} className={pastilla(prendido)}>
                {DIAS[dia]}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[14px] text-text2">
          De
          <input type="time" aria-label="Desde qué hora" className={`${CAMPO} font-semibold text-text`} value={abre} onChange={(e) => ponerHorario(e.target.value, cierra)} />
          a
          <input type="time" aria-label="Hasta qué hora" className={`${CAMPO} font-semibold text-text`} value={cierra} onChange={(e) => ponerHorario(abre, e.target.value)} />
        </div>
      </Bloque>

      <Bloque titulo="Cuánto espera antes de volver a escribir" sub="El día que el cliente deja de contestar, mientras siguen abiertas las 24 horas de WhatsApp.">
        <Regla nombre="Primer mensaje">
          <Numero etiqueta="Horas hasta el primer mensaje" valor={aHoras(policy.first_delay_minutes)} min={0.5} max={168} paso={0.5} onCambio={(h) => cambiar({ first_delay_minutes: aMinutos(h) })} />
          horas después de que deja de contestar
        </Regla>
        <Regla nombre="Segundo mensaje">
          <Numero etiqueta="Horas antes del cierre de las 24 horas" valor={aHoras(policy.second_before_close_minutes)} min={0.5} max={24} paso={0.5} onCambio={(h) => cambiar({ second_before_close_minutes: aMinutos(h) })} />
          horas antes de que se cierren las 24 horas
        </Regla>
        <Regla nombre="Entre uno y otro">
          al menos
          <Numero etiqueta="Horas entre un mensaje y otro" valor={aHoras(policy.minimum_gap_minutes)} min={0.5} max={24} paso={0.5} onCambio={(h) => cambiar({ minimum_gap_minutes: aMinutos(h) })} />
          horas
        </Regla>
        <Regla nombre="Tope por día">
          máximo
          <Numero etiqueta="Mensajes por día" valor={policy.max_messages_per_day} min={1} max={10} onCambio={(n) => cambiar({ max_messages_per_day: Math.round(n) })} />
          mensajes a un mismo cliente
        </Regla>
      </Bloque>

      <Bloque titulo="Los días siguientes" sub="Pasadas las 24 horas WhatsApp solo deja escribir con una plantilla. Este plan arranca cuando un asesor lo confirma desde el ticket.">
        <Regla nombre="Un mensaje al día">
          durante
          <Numero etiqueta="Días con plantilla" valor={policy.template_follow_up_days} min={1} max={8} onCambio={(n) => cambiar({ template_follow_up_days: Math.round(n) })} />
          días, a las
          <input type="time" aria-label="Hora del mensaje diario" className={`${CAMPO} font-semibold text-text`} value={policy.template_send_time} onChange={(e) => cambiar({ template_send_time: e.target.value })} />
        </Regla>
        <Regla nombre="Sugerir el cierre">
          a los
          <Numero etiqueta="Días para sugerir el cierre" valor={policy.recommend_close_days} min={1} max={90} onCambio={(n) => cambiar({ recommend_close_days: Math.round(n) })} />
          días sin respuesta; el ticket nunca se cierra solo
        </Regla>
      </Bloque>

      <Bloque titulo="En qué etapas hace seguimiento" sub="Un ticket en una etapa apagada no recibe seguimientos.">
        <div className="flex flex-wrap gap-2">
          {ETAPAS.map((etapa) => {
            const prendida = policy.enabled_stages.includes(etapa);
            return (
              <button
                key={etapa} type="button" aria-pressed={prendida} data-testid={`etapa-${etapa}`} className={pastilla(prendida)}
                onClick={() => cambiar({ enabled_stages: prendida ? policy.enabled_stages.filter((x) => x !== etapa) : [...policy.enabled_stages, etapa] })}
              >
                {ETAPA_META[etapa].nombre}
              </button>
            );
          })}
        </div>
      </Bloque>

      <Panel className="p-5 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Plantillas de WhatsApp</h3>
            <p className="mt-0.5 text-[13px] text-text2">Los mensajes que salen con las 24 horas cerradas. El estado lo dice Meta. Se guardan al tocar.</p>
          </div>
          <button type="button" onClick={() => void sincronizar()} disabled={sincronizando} className="btn-quiet h-9 shrink-0 rounded-[6px] px-3 text-[13px] disabled:opacity-50">
            {sincronizando ? "Consultando Meta…" : "Actualizar desde Meta"}
          </button>
        </div>
        {errorMeta && <p className="mt-2 text-[13px] text-signal" role="alert">{errorMeta}</p>}
        <div className="mt-4 flex flex-col gap-2">
          {templates.map((t) => {
            const estado = t.meta_status ? ESTADO_META[t.meta_status] : null;
            const cambioDeCategoria = Boolean(t.meta_category && t.meta_category !== t.expected_category);
            const aprobada = t.meta_status === "APPROVED";
            return (
              <div key={t.template_key} className="rounded-[8px] border border-line p-4" data-testid={`plantilla-${t.template_key}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold">{t.template_name ?? t.template_key}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${estado?.clase ?? NEUTRA}`}>{estado?.label ?? "No está en Meta"}</span>
                      {t.meta_category && (
                        <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${cambioDeCategoria ? "bg-warn/10 text-warn" : NEUTRA}`}>
                          {t.meta_category === "MARKETING" ? "Marketing · ~7 ¢" : t.meta_category === "UTILITY" ? "Utilidad · ~1 ¢" : t.meta_category}
                        </span>
                      )}
                    </div>
                    {t.preview && <p className="mt-1.5 text-[13px] text-text2">{t.preview}</p>}
                    {CUANDO_SALE[t.template_key] && <p className="mt-1 text-[13px]">{CUANDO_SALE[t.template_key]}</p>}
                    {cambioDeCategoria && (
                      <p className="mt-1 text-[13px] text-warn">
                        Meta la pasó de {t.expected_category === "UTILITY" ? "Utilidad" : t.expected_category} a {t.meta_category === "MARKETING" ? "Marketing" : t.meta_category}: cada envío cuesta más. Se puede apelar en Business Support.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Interruptor
                      prendido={t.automatic_send} ocupado={!aprobada && !t.automatic_send}
                      etiqueta={`${t.automatic_send ? "Dejar de enviar sola" : "Enviar sola"} ${t.template_name ?? t.template_key}`}
                      onCambio={(v) => void guardarPlantilla({ ...t, automatic_send: v, configured: v || t.configured })}
                    />
                    <span className="text-[12px] text-text2">{t.automatic_send ? "Se envía sola" : aprobada ? "No se envía sola" : "Falta que Meta la apruebe"}</span>
                  </div>
                </div>
                {nombreAbierto === t.template_key ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      className={`${CAMPO} min-w-0 flex-1`} placeholder="Nombre aprobado en Meta" aria-label="Nombre en Meta"
                      value={t.template_name ?? ""}
                      onChange={(e) => setTemplates(templates.map((x) => (x.template_key === t.template_key ? { ...x, template_name: e.target.value || null } : x)))}
                    />
                    <button type="button" className="btn-signal h-10 rounded-[6px] px-4 text-[13px] font-semibold" onClick={() => void guardarPlantilla(t).then(() => setNombreAbierto(null))}>Guardar nombre</button>
                  </div>
                ) : (
                  <button type="button" className="mt-2 text-[12px] text-text2 underline-offset-2 hover:text-text hover:underline" onClick={() => setNombreAbierto(t.template_key)}>
                    Cambiar el nombre con el que está en Meta
                  </button>
                )}
              </div>
            );
          })}
          {!templates.length && <p className="text-[13px] text-text2">Este negocio todavía no tiene plantillas.</p>}
        </div>
        <p className="mt-3 text-[12px] text-text2">El texto de una plantilla se crea y se cambia en Meta. Solo se puede prender una que Meta ya aprobó.</p>
      </Panel>

      <Plegable titulo="Seguridad y alertas" estado="casi nunca se toca" testid="plegable-seguridad">
        <Opcion titulo="Nunca fuera de horario" sub="Aunque le toque, espera al próximo día y hora permitidos." prendido={policy.never_outside_hours} onCambio={(v) => cambiar({ never_outside_hours: v })} />
        <Opcion titulo="Parar cuando un asesor toma el chat" sub="Mientras atiende una persona, el bot no manda seguimientos." prendido={policy.pause_on_human_control} onCambio={(v) => cambiar({ pause_on_human_control: v })} />
        <Opcion titulo="Respetar al que pidió que no le escriban" prendido={policy.respect_opt_out} onCambio={(v) => cambiar({ respect_opt_out: v })} />
        <Opcion titulo="Pedir permiso antes de dar seguimiento" sub="Solo le escribe a quien aceptó recibir mensajes." prendido={policy.require_consent} onCambio={(v) => cambiar({ require_consent: v })} />
        <Opcion titulo="Sonido en las alertas" prendido={policy.alert_settings.sound ?? true} onCambio={(v) => cambiar({ alert_settings: { ...policy.alert_settings, sound: v } })} />
        <Opcion titulo="Asignar el ticket solo" sub="Al escalar, se lo asigna al asesor que recibe la alerta." prendido={policy.alert_settings.autoAssign ?? false} onCambio={(v) => cambiar({ alert_settings: { ...policy.alert_settings, autoAssign: v } })} />
        <p className="border-t border-line pt-3 text-[13px] text-text2">
          Le avisa al asesor al día {policy.advisor_alert_days} sin respuesta.
        </p>
      </Plegable>

      {(sinGuardar || aviso || error) && (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line-strong bg-surface p-3 shadow-[0_-2px_12px_rgba(28,27,25,.08)]" role="status" data-testid="barra-guardar">
          <span className={`text-[13px] ${error ? "font-semibold text-signal" : ""}`}>
            {error || (sinGuardar ? <><b>Hay cambios sin guardar.</b> El bot sigue con lo anterior.</> : aviso)}
          </span>
          {sinGuardar && (
            <span className="flex gap-2">
              <button type="button" disabled={guardando} onClick={() => void guardar()} data-testid="guardar-seguimientos" className="btn-signal h-10 rounded-[6px] px-5 text-[13px] font-semibold">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
              <button type="button" disabled={guardando} onClick={() => { setPolicy(guardada); setError(""); }} className="btn-quiet h-10 rounded-[6px] px-4 text-[13px]">Deshacer</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
