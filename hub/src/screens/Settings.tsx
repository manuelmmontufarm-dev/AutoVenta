import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import botPlaybook from "../../../app/BOT_PLAYBOOK.md?raw";
import { ETAPA_META, ETAPAS, type Etapa } from "../data/types";
import { getStoredAdminKey, saveStoredAdminKey } from "../data/realSource";

type SettingsTab = "ai" | "manual" | "business" | "connection";

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
