import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "../data/realSource";

/**
 * Ajustes → Negocio → Anuncios. El título que manda Meta casi siempre es
 * «Depot Tire» y el link del anuncio no se puede leer (facebook/instagram piden
 * iniciar sesión), así que aquí el negocio escribe qué muestra cada anuncio que
 * corre. El vendedor y el Guardián leen esa descripción cuando el cliente dice
 * «quiero la llanta del anuncio».
 */
interface AnuncioActivo {
  id: string;
  link: string | null;
  descripcion: string;
  activo: boolean;
  hasta: string | null;
}
interface AnuncioVisto {
  sourceId: string | null;
  titulo: string | null;
  texto: string | null;
  url: string | null;
  chats: number;
  ultimo: string;
}

async function api<T extends object>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Error ${response.status}`);
  return payload;
}

const inputCls = "w-full rounded-[6px] border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-signal";
const nuevoId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const recortar = (t: string | null, n: number) => (t && t.length > n ? `${t.slice(0, n)}…` : t ?? "");

export function SeccionAnuncios({ onError }: { onError: (v: string) => void }) {
  const [lista, setLista] = useState<AnuncioActivo[] | null>(null);
  const [vistos, setVistos] = useState<AnuncioVisto[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(() => {
    api<{ anuncios: AnuncioActivo[] }>("/api/anuncios-activos")
      .then((r) => { setLista(r.anuncios); setSucio(false); })
      .catch((e) => onError(e instanceof Error ? e.message : "No se pudieron cargar los anuncios"));
    api<{ vistos: AnuncioVisto[] }>("/api/anuncios-vistos?dias=14")
      .then((r) => setVistos(r.vistos))
      .catch(() => setVistos([]));
  }, [onError]);
  useEffect(cargar, [cargar]);

  const cambiar = (id: string, cambio: Partial<AnuncioActivo>) => {
    setLista((l) => (l ?? []).map((a) => (a.id === id ? { ...a, ...cambio } : a)));
    setSucio(true); setAviso("");
  };
  const agregar = (base: Partial<AnuncioActivo> = {}) => {
    setLista((l) => [...(l ?? []), { id: nuevoId(), link: null, descripcion: "", activo: true, hasta: null, ...base }]);
    setSucio(true); setAviso("");
  };

  const guardar = async () => {
    if (!lista) return;
    setGuardando(true);
    try {
      const r = await api<{ anuncios: AnuncioActivo[] }>("/api/anuncios-activos", {
        method: "PUT",
        body: JSON.stringify({ anuncios: lista }),
      });
      setLista(r.anuncios); setSucio(false); setAviso("Guardado"); onError("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudieron guardar los anuncios");
    } finally { setGuardando(false); }
  };

  const yaCargado = (v: AnuncioVisto) =>
    (lista ?? []).some((a) => a.link && ((v.sourceId && a.link.includes(v.sourceId)) || (v.url && a.link === v.url)));

  return (
    <section className="rounded-[10px] border border-line bg-surface px-5 pt-[18px] pb-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-[13px] font-semibold">Anuncios</p>
          <p className="text-[12px] text-text2">
            Cuente qué muestra cada anuncio que está corriendo. Cuando un cliente escribe «quiero la llanta del anuncio», el bot busca esa llanta sin preguntarle cuál.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {aviso && <span className="text-[12px] text-text2">{aviso}</span>}
          <button
            onClick={() => agregar()}
            disabled={(lista?.length ?? 0) >= 20}
            className="rounded-full bg-bg px-3.5 py-1.5 text-[12px] font-semibold hover:bg-line disabled:opacity-50"
          >+ Agregar anuncio</button>
          <button
            onClick={() => void guardar()}
            disabled={guardando || !sucio}
            className="rounded-full bg-signal px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
          >{guardando ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>

      <p className="mb-3 rounded-[6px] bg-bg p-2.5 text-[12px] text-text2">
        <b>El link no se lee solo:</b> Meta pide iniciar sesión para abrir el anuncio, así que el bot no puede entrar a verlo. Lo que manda es la <b>descripción</b> que usted escribe aquí; el link (opcional) solo sirve para reconocer de cuál anuncio vino el chat.
      </p>

      {!lista && <p className="text-[12px] text-text2">Cargando anuncios…</p>}
      {lista && lista.length === 0 && (
        <p className="text-[12px] text-text2">No hay anuncios cargados. Sin ellos, si el cliente dice «la del anuncio» el bot solo cuenta con lo que Meta manda (casi siempre solo «Depot Tire»).</p>
      )}
      <div className="flex flex-col gap-3">
        {(lista ?? []).map((a, i) => (
          <div key={a.id} className="rounded-[8px] border border-line p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold">Anuncio {i + 1}</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[12px]">
                  <input type="checkbox" checked={a.activo} onChange={(e) => cambiar(a.id, { activo: e.target.checked })} />
                  Activo
                </label>
                <button
                  onClick={() => { setLista((l) => (l ?? []).filter((x) => x.id !== a.id)); setSucio(true); setAviso(""); }}
                  className="text-[12px] text-text2 underline"
                >Borrar</button>
              </div>
            </div>
            <textarea
              value={a.descripcion}
              onChange={(e) => cambiar(a.id, { descripcion: e.target.value })}
              rows={2}
              maxLength={400}
              placeholder="Qué muestra: llanta, marca, tipo, medida, promoción. Ej.: Kenda Klever KR601, camioneta, rin 15–17, promoción 3x4"
              className={inputCls}
            />
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_170px]">
              <input
                value={a.link ?? ""}
                onChange={(e) => cambiar(a.id, { link: e.target.value || null })}
                placeholder="Link del anuncio (opcional)"
                className={inputCls}
              />
              <label className="flex items-center gap-2 text-[12px] text-text2">
                Hasta
                <input
                  type="date"
                  value={a.hasta ?? ""}
                  onChange={(e) => cambiar(a.id, { hasta: e.target.value || null })}
                  className={inputCls}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <p className="text-[13px] font-semibold">Anuncios que están llegando (14 días)</p>
        <p className="mb-2 text-[12px] text-text2">Lo que Meta reporta de los chats que empezaron desde un anuncio.</p>
        {!vistos && <p className="text-[12px] text-text2">Cargando…</p>}
        {vistos && vistos.length === 0 && <p className="text-[12px] text-text2">Ningún chat llegó desde un anuncio en estos días.</p>}
        <div className="flex flex-col gap-2">
          {(vistos ?? []).map((v, i) => (
            <div key={`${v.sourceId ?? "s"}-${i}`} className="flex flex-wrap items-start justify-between gap-2 rounded-[8px] bg-bg p-2.5 text-[12px]">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{v.titulo ?? "(sin título)"} · {v.chats} {v.chats === 1 ? "chat" : "chats"}</p>
                {v.texto && <p className="text-text2">{recortar(v.texto, 160)}</p>}
                <p className="text-text2">
                  {v.sourceId ? `id ${v.sourceId} · ` : ""}último{" "}
                  {new Date(v.ultimo).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "short" })}
                </p>
              </div>
              <button
                onClick={() => agregar({ descripcion: (v.texto ?? v.titulo ?? "").slice(0, 400), link: v.url })}
                disabled={yaCargado(v) || (lista?.length ?? 0) >= 20}
                className="rounded-full bg-surface px-3 py-1 text-[12px] font-semibold hover:bg-line disabled:opacity-50"
              >{yaCargado(v) ? "Ya cargado" : "Usar como activo"}</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
