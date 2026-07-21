import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import botPlaybook from "../../../app/BOT_PLAYBOOK.md?raw";
import { ETAPA_META, ETAPAS, type Etapa } from "../data/types";
import { getStoredAdminKey, saveStoredAdminKey } from "../data/realSource";

type SettingsTab = "ai" | "followups" | "manual" | "business" | "connection";

interface AiConfig {
  personalidad: string;
  tono: "calido" | "neutral" | "formal";
  emojis: "ninguno" | "pocos" | "muchos";
  longitud: "corta" | "media" | "larga";
  stickerFinal: boolean;
  emojiCierre: string;
}

interface StagePrompt {
  id: number;
  stage: Etapa;
  version: number;
  status: "draft" | "published" | "archived";
  objective: string;
  prompt: string;
  allowedTools: string[];
  settings: {
    autoAction: "none" | "options" | "comparison" | "quote" | "handoff";
    requiresHumanApproval: boolean;
    fallback: string;
  };
  createdAt: string;
  publishedAt: string | null;
}

const ALL_STAGES: Etapa[] = [...ETAPAS, "ganado", "perdido"];
const TOOLS = [
  "buscar_llanta",
  "buscar_catalogo",
  "fitment_vehiculo",
  "preparar_opciones",
  "enviar_comparacion",
  "generar_cotizacion",
  "local_mas_cercano",
  "notificar_vendedor",
];

export function Settings() {
  const [tab, setTab] = useState<SettingsTab>("ai");
  const [ai, setAi] = useState<AiConfig | null>(null);
  const [prompts, setPrompts] = useState<StagePrompt[]>([]);
  const [stage, setStage] = useState<Etapa>("nuevo");
  const [draft, setDraft] = useState<StagePrompt | null>(null);
  const [key, setKey] = useState(getStoredAdminKey);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const stageVersions = useMemo(
    () => prompts.filter((prompt) => prompt.stage === stage),
    [prompts, stage],
  );
  const published = stageVersions.find((prompt) => prompt.status === "published") ?? null;
  const playbookHtml = useMemo(
    () => marked.parse(botPlaybook, { async: false }) as string,
    [],
  );

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    const source = published ?? stageVersions[0] ?? null;
    setDraft(source ? structuredClone(source) : null);
  }, [stage, prompts, published, stageVersions]);

  async function loadSettings() {
    try {
      const [aiPayload, promptPayload] = await Promise.all([
        api<{ config: AiConfig }>("/api/ai-config"),
        api<{ prompts: StagePrompt[] }>("/api/stage-prompts"),
      ]);
      setAi(aiPayload.config);
      setPrompts(promptPayload.prompts);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo cargar");
    }
  }

  async function saveGlobalAi() {
    if (!ai) return;
    setSaving(true);
    try {
      const payload = await api<{ config: AiConfig }>("/api/ai-config", {
        method: "PUT",
        body: JSON.stringify(ai),
      });
      setAi(payload.config);
      setStatus("Configuración global guardada.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    try {
      const payload = await api<{ prompt: StagePrompt }>(
        `/api/stage-prompts/${stage}/drafts`,
        {
          method: "POST",
          body: JSON.stringify({
            objective: draft.objective,
            prompt: draft.prompt,
            allowedTools: draft.allowedTools,
            settings: draft.settings,
          }),
        },
      );
      await loadSettings();
      setStatus(`Borrador v${payload.prompt.version} guardado.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function publish(id: number) {
    setSaving(true);
    try {
      await api(`/api/stage-prompts/versions/${id}/publish`, {
        method: "POST",
        body: "{}",
      });
      await loadSettings();
      setStatus("Versión publicada. Se usará desde el próximo mensaje.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo publicar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 pb-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap gap-2">
          {([
            ["ai", "IA por etapa"],
            ["followups", "Seguimientos"],
            ["manual", "Manual base"],
            ["business", "Negocio"],
            ["connection", "Conexión"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="rounded-full px-4 py-2 text-xs font-black"
              style={{
                color: tab === id ? "white" : "var(--color-muted)",
                background: tab === id ? "var(--color-red)" : "var(--color-paper)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "ai" && ai && (
          <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
            <aside className="glass rounded-3xl p-5">
              <p className="microlabel">Comportamiento global</p>
              <Field label="Personalidad adicional">
                <textarea
                  value={ai.personalidad}
                  onChange={(event) =>
                    setAi({ ...ai, personalidad: event.target.value })
                  }
                  rows={5}
                  className="settings-input resize-y"
                />
              </Field>
              <Field label="Tono">
                <select
                  value={ai.tono}
                  onChange={(event) =>
                    setAi({ ...ai, tono: event.target.value as AiConfig["tono"] })
                  }
                  className="settings-input"
                >
                  <option value="calido">Cálido</option>
                  <option value="neutral">Neutral</option>
                  <option value="formal">Formal</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Emojis">
                  <select
                    value={ai.emojis}
                    onChange={(event) =>
                      setAi({
                        ...ai,
                        emojis: event.target.value as AiConfig["emojis"],
                      })
                    }
                    className="settings-input"
                  >
                    <option value="ninguno">Ninguno</option>
                    <option value="pocos">Pocos</option>
                    <option value="muchos">Muchos</option>
                  </select>
                </Field>
                <Field label="Longitud">
                  <select
                    value={ai.longitud}
                    onChange={(event) =>
                      setAi({
                        ...ai,
                        longitud: event.target.value as AiConfig["longitud"],
                      })
                    }
                    className="settings-input"
                  >
                    <option value="corta">Corta</option>
                    <option value="media">Media</option>
                    <option value="larga">Larga</option>
                  </select>
                </Field>
              </div>
              <button
                disabled={saving}
                onClick={() => void saveGlobalAi()}
                className="mt-4 w-full rounded-2xl bg-navy px-4 py-3 text-xs font-black text-white disabled:opacity-50"
              >
                Guardar configuración global
              </button>
            </aside>

            <section className="glass rounded-3xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="microlabel">Prompt por sección comercial</p>
                  <p className="mt-1 text-xs text-muted">
                    Borrador → revisar → publicar. Las reglas de precio y stock no
                    se pueden cambiar aquí.
                  </p>
                </div>
                <select
                  value={stage}
                  onChange={(event) => setStage(event.target.value as Etapa)}
                  className="settings-input max-w-60"
                >
                  {ALL_STAGES.map((item) => (
                    <option key={item} value={item}>
                      {ETAPA_META[item].nombre}
                    </option>
                  ))}
                </select>
              </div>

              {draft && (
                <>
                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <Field label="Objetivo de la etapa">
                      <textarea
                        value={draft.objective}
                        onChange={(event) =>
                          setDraft({ ...draft, objective: event.target.value })
                        }
                        rows={3}
                        className="settings-input resize-y"
                      />
                    </Field>
                    <Field label="Acción sugerida">
                      <select
                        value={draft.settings.autoAction}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            settings: {
                              ...draft.settings,
                              autoAction: event.target.value as StagePrompt["settings"]["autoAction"],
                            },
                          })
                        }
                        className="settings-input"
                      >
                        <option value="none">Ninguna</option>
                        <option value="options">Preparar opciones</option>
                        <option value="comparison">Comparar</option>
                        <option value="quote">Cotizar</option>
                        <option value="handoff">Handoff</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Instrucciones editables">
                    <textarea
                      value={draft.prompt}
                      onChange={(event) =>
                        setDraft({ ...draft, prompt: event.target.value })
                      }
                      rows={9}
                      className="settings-input resize-y font-mono text-[12px]"
                    />
                  </Field>

                  <p className="microlabel mt-4 mb-2">Herramientas permitidas</p>
                  <div className="flex flex-wrap gap-2">
                    {TOOLS.map((tool) => {
                      const active = draft.allowedTools.includes(tool);
                      return (
                        <button
                          key={tool}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              allowedTools: active
                                ? draft.allowedTools.filter((item) => item !== tool)
                                : [...draft.allowedTools, tool],
                            })
                          }
                          className="rounded-full px-3 py-1.5 font-mono text-[10px] font-bold"
                          style={{
                            background: active
                              ? "color-mix(in srgb, var(--color-ok) 18%, white)"
                              : "var(--color-paper)",
                            color: active ? "var(--color-ok)" : "var(--color-muted)",
                            border: "1px solid var(--color-line)",
                          }}
                        >
                          {active ? "✓ " : ""}
                          {tool}
                        </button>
                      );
                    })}
                  </div>

                  <label className="mt-4 flex items-center gap-2 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={draft.settings.requiresHumanApproval}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          settings: {
                            ...draft.settings,
                            requiresHumanApproval: event.target.checked,
                          },
                        })
                      }
                    />
                    Requiere aprobación humana para acciones automáticas
                  </label>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      disabled={saving}
                      onClick={() => void saveDraft()}
                      className="rounded-2xl bg-navy px-5 py-3 text-xs font-black text-white disabled:opacity-50"
                    >
                      Guardar nuevo borrador
                    </button>
                    {stageVersions
                      .filter((version) => version.status === "draft")
                      .slice(0, 1)
                      .map((version) => (
                        <button
                          key={version.id}
                          disabled={saving}
                          onClick={() => void publish(version.id)}
                          className="rounded-2xl bg-red px-5 py-3 text-xs font-black text-white disabled:opacity-50"
                        >
                          Publicar v{version.version}
                        </button>
                      ))}
                  </div>

                  <div className="mt-5 border-t pt-4">
                    <p className="microlabel mb-2">Historial</p>
                    <div className="flex flex-wrap gap-2">
                      {stageVersions.map((version) => (
                        <span
                          key={version.id}
                          className="rounded-full border px-3 py-1 text-[10px] font-bold"
                        >
                          v{version.version} · {version.status}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {tab === "manual" && (
          <section className="glass max-w-5xl rounded-3xl p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="microlabel">Reglas permanentes del asistente</p>
                <h2 className="serif mt-2 text-2xl">Manual base del bot</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                  Este es el archivo que el agente recibe en cada turno. Los
                  prompts por etapa lo perfeccionan, pero no pueden cambiar
                  precios, stock, seguridad ni las reglas de cotización.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(botPlaybook)}
                  className="rounded-2xl border border-navy/25 bg-white px-4 py-2.5 text-xs font-black text-navy"
                >
                  Copiar Markdown
                </button>
                <button
                  type="button"
                  onClick={downloadPlaybook}
                  className="rounded-2xl bg-navy px-4 py-2.5 text-xs font-black text-white"
                >
                  Descargar .md
                </button>
              </div>
            </div>
            <article
              className="playbook-markdown mt-6"
              dangerouslySetInnerHTML={{ __html: playbookHtml }}
            />
          </section>
        )}

        {tab === "followups" && <FollowUpSettingsPanel />}

        {tab === "business" && (
          <div className="glass max-w-2xl rounded-3xl p-6">
            <p className="microlabel">Cuenta activa</p>
            <h2 className="serif mt-2 text-2xl">Depot Tire</h2>
            <p className="mt-2 text-sm text-muted">
              Un solo nivel de cuenta durante el piloto. Esta pantalla crecerá a
              usuarios y roles únicamente cuando el negocio lo necesite.
            </p>
            <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2">
              <Info label="Modo de WhatsApp" value="Número de prueba de Meta" />
              <Info label="Inventario" value="Contífico · sincronización real" />
              <Info label="IVA" value="15%" />
              <Info label="Horario" value="Lunes a sábado · 08:30–17:30" />
            </dl>
          </div>
        )}

        {tab === "connection" && (
          <div className="glass max-w-2xl rounded-3xl p-6">
            <p className="microlabel">Acceso al producto real</p>
            <p className="mt-2 text-sm text-muted">
              La clave nunca se incluye en el bundle ni en una URL. Durante el
              staging se conserva el gate existente; antes de producción se
              migrará a una sesión HttpOnly.
            </p>
            <Field label="Clave administrativa de staging">
              <input
                type="password"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                className="settings-input"
              />
            </Field>
            <button
              onClick={() => {
                saveStoredAdminKey(key);
                window.location.reload();
              }}
              className="mt-3 rounded-2xl bg-navy px-5 py-3 text-xs font-black text-white"
            >
              Guardar y probar conexión
            </button>
          </div>
        )}

        {status && (
          <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-xs font-bold text-navy shadow-soft">
            {status}
          </p>
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
  stage_prompts: Partial<Record<Etapa, string>>;
  alert_settings: { sound?: boolean; recipient?: string; autoAssign?: boolean; priorityByEvent?: Record<string, string>; escalationRules?: unknown[] };
}

interface FollowUpTemplateAdmin {
  template_key: string; template_name: string | null; language: string; expected_category: string;
  variables: string[]; buttons: unknown[]; preview: string;
  approval_status: "not_configured" | "pending" | "approved" | "rejected";
  configured: boolean; automatic_send: boolean;
}

function FollowUpSettingsPanel() {
  const [policy, setPolicy] = useState<FollowUpPolicyAdmin | null>(null);
  const [templates, setTemplates] = useState<FollowUpTemplateAdmin[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => { void api<{ policy: FollowUpPolicyAdmin; templates: FollowUpTemplateAdmin[] }>("/api/follow-up-settings").then((data) => { setPolicy(data.policy); setTemplates(data.templates); }).catch((error) => setMessage(error instanceof Error ? error.message : "No se pudo cargar")); }, []);
  if (!policy) return <div className="glass rounded-3xl p-6 text-sm text-muted">{message || "Cargando configuración…"}</div>;
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
    <section className="glass rounded-3xl p-5"><p className="microlabel">Horarios</p><div className="grid gap-3 sm:grid-cols-3"><Field label="Timezone"><input className="settings-input" value={policy.timezone} onChange={(e) => setPolicy({ ...policy, timezone: e.target.value })} /></Field><Field label="Inicio"><input type="time" className="settings-input" value={policy.business_hours["1"]?.open ?? "08:30"} onChange={(e) => setPolicy({ ...policy, business_hours: Object.fromEntries(Object.entries(policy.business_hours).map(([day, hours]) => [day, hours ? { ...hours, open: e.target.value } : null])) })} /></Field><Field label="Fin"><input type="time" className="settings-input" value={policy.business_hours["1"]?.close ?? "17:30"} onChange={(e) => setPolicy({ ...policy, business_hours: Object.fromEntries(Object.entries(policy.business_hours).map(([day, hours]) => [day, hours ? { ...hours, close: e.target.value } : null])) })} /></Field></div><div className="mt-3 flex flex-wrap gap-2">{["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map((label, day) => <label key={label} className="flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold"><input type="checkbox" checked={Boolean(policy.business_hours[String(day)])} onChange={(e) => setPolicy({ ...policy, business_hours: { ...policy.business_hours, [day]: e.target.checked ? { open: "08:30", close: "17:30" } : null } })} />{label}</label>)}</div><Field label="Quiet hours (JSON)"><input className="settings-input font-mono text-[11px]" value={JSON.stringify(policy.quiet_hours)} onChange={(e) => { try { setPolicy({ ...policy, quiet_hours: JSON.parse(e.target.value) }); } catch { /* conserva último JSON válido */ } }} /></Field></section>
    <section className="glass rounded-3xl p-5"><p className="microlabel">Seguimientos</p><div className="grid grid-cols-2 gap-3"><Field label="Primer retraso (min)"><input type="number" className="settings-input" value={policy.first_delay_minutes} onChange={(e) => setNumber("first_delay_minutes", e.target.value)} /></Field><Field label="Antes del cierre (min)"><input type="number" className="settings-input" value={policy.second_before_close_minutes} onChange={(e) => setNumber("second_before_close_minutes", e.target.value)} /></Field><Field label="Separación mínima (min)"><input type="number" className="settings-input" value={policy.minimum_gap_minutes} onChange={(e) => setNumber("minimum_gap_minutes", e.target.value)} /></Field><Field label="Intentos post-24 h"><input type="number" className="settings-input" value={policy.max_post_window_attempts} onChange={(e) => setNumber("max_post_window_attempts", e.target.value)} /></Field><Field label="Alertar asesor (días)"><input type="number" className="settings-input" value={policy.advisor_alert_days} onChange={(e) => setNumber("advisor_alert_days", e.target.value)} /></Field><Field label="Recomendar cierre (días)"><input type="number" className="settings-input" value={policy.recommend_close_days} onChange={(e) => setNumber("recommend_close_days", e.target.value)} /></Field></div><p className="microlabel mt-4 mb-2">Habilitado por etapa</p><div className="flex flex-wrap gap-2">{ETAPAS.map((stage) => <label key={stage} className="flex items-center gap-1 text-[10px] font-bold"><input type="checkbox" checked={policy.enabled_stages.includes(stage)} onChange={(e) => setPolicy({ ...policy, enabled_stages: e.target.checked ? [...policy.enabled_stages, stage] : policy.enabled_stages.filter((item) => item !== stage) })} />{ETAPA_META[stage].nombre}</label>)}</div></section>
    <section className="glass rounded-3xl p-5 xl:col-span-2">
      <p className="microlabel">Cómo debe escribir el seguimiento</p>
      <p className="mt-1 text-xs text-muted">Un solo prompt editable por etapa. Ya está prellenado para mensajes breves, humanos, persuasivos y basados únicamente en el contexto real.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">{ETAPAS.map((stage) => <label key={stage} className="rounded-2xl border border-paper/10 p-3"><span className="text-[11px] font-black" style={{ color: ETAPA_META[stage].color }}>{ETAPA_META[stage].nombre}</span><textarea rows={4} className="settings-input mt-2" value={policy.stage_prompts?.[stage] ?? ""} onChange={(e) => setPolicy({ ...policy, stage_prompts: { ...policy.stage_prompts, [stage]: e.target.value } })} /></label>)}</div>
      <details className="mt-4 rounded-2xl border border-paper/10 p-3">
        <summary className="cursor-pointer text-[10.5px] font-black">Configuración avanzada de Meta (solo cuando aprueben las plantillas)</summary>
        <p className="mt-2 text-[10.5px] text-amber-500">Estas plantillas siguen desactivadas hasta registrar el nombre aprobado en Meta. Nunca se usa texto libre con la ventana cerrada.</p>
        <div className="mt-3 grid gap-2">{templates.map((template, index) => <div key={template.template_key} className="grid items-end gap-2 rounded-xl bg-paper/[.035] p-3 md:grid-cols-[1.2fr_1fr_1fr_auto]"><Field label={template.template_key}><input className="settings-input" placeholder="Nombre aprobado en Meta" value={template.template_name ?? ""} onChange={(e) => setTemplates(templates.map((item, i) => i === index ? { ...item, template_name: e.target.value || null } : item))} /></Field><Field label="Estado"><select className="settings-input" value={template.approval_status} onChange={(e) => setTemplates(templates.map((item, i) => i === index ? { ...item, approval_status: e.target.value as FollowUpTemplateAdmin["approval_status"] } : item))}><option value="not_configured">No configurada</option><option value="pending">Pendiente</option><option value="approved">Aprobada</option><option value="rejected">Rechazada</option></select></Field><label className="mb-2 flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={template.automatic_send} onChange={(e) => setTemplates(templates.map((item, i) => i === index ? { ...item, automatic_send: e.target.checked, configured: e.target.checked || item.configured } : item))} />Envío automático</label><button onClick={() => void saveTemplate(template)} className="mb-1 rounded-xl bg-navy px-3 py-2 text-[10px] font-black text-white">Guardar</button></div>)}</div>
      </details>
    </section>
    <section className="glass rounded-3xl p-5"><p className="microlabel">Alertas</p><label className="mt-4 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={policy.alert_settings.sound ?? true} onChange={(e) => setPolicy({ ...policy, alert_settings: { ...policy.alert_settings, sound: e.target.checked } })} />Sonido</label><Field label="Destinatario"><input className="settings-input" value={policy.alert_settings.recipient ?? "owner"} onChange={(e) => setPolicy({ ...policy, alert_settings: { ...policy.alert_settings, recipient: e.target.value } })} /></Field><label className="mt-3 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={policy.alert_settings.autoAssign ?? false} onChange={(e) => setPolicy({ ...policy, alert_settings: { ...policy.alert_settings, autoAssign: e.target.checked } })} />Autoasignación</label><p className="mt-3 text-[11px] text-muted">Escalamiento inicial: asesor al día {policy.advisor_alert_days}; recomendar Perdido al día {policy.recommend_close_days}, sin cierre automático.</p></section>
    <section className="glass rounded-3xl p-5"><p className="microlabel">Seguridad</p>{([["require_consent","Requerir consentimiento"],["respect_opt_out","Respetar opt-out"],["never_outside_hours","Nunca fuera de horario"],["pause_on_human_control","Pausar al tomar control humano"]] as const).map(([key, label]) => <label key={key} className="mt-3 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={policy[key]} onChange={(e) => setPolicy({ ...policy, [key]: e.target.checked })} />{label}</label>)}<Field label="Máximo diario"><input type="number" className="settings-input" value={policy.max_messages_per_day} onChange={(e) => setNumber("max_messages_per_day", e.target.value)} /></Field></section>
    <div className="xl:col-span-2"><button onClick={() => void savePolicy()} className="rounded-2xl bg-red px-6 py-3 text-xs font-black text-white">Guardar política</button>{message && <span className="ml-3 text-xs font-bold">{message}</span>}</div>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white/70 p-4">
      <dt className="microlabel">{label}</dt>
      <dd className="mt-1 font-bold">{value}</dd>
    </div>
  );
}

async function api<T extends object = { ok: true }>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const key = getStoredAdminKey();
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "x-admin-key": key } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error ?? `Error ${response.status}`);
  return payload;
}
