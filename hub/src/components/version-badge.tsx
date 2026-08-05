/**
 * Badge de versión + panel de novedades.
 *
 * Resuelve una pregunta que antes no tenía respuesta desde el panel: «¿ya entró
 * el cambio o sigo viendo el build viejo?». El badge muestra la versión y el
 * commit compilado; si el servidor responde otro commit, avisa — significa que
 * una mitad se desplegó y la otra no.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { CAMBIOS, COMMIT, VERSION } from "../data/version";

const VISTA_KEY = "autoventa_version_vista";

export function VersionBadge() {
  const [abierto, setAbierto] = useState(false);
  const [commitServidor, setCommitServidor] = useState<string | null>(null);
  // Punto en el badge hasta que se abra la novedad de esta versión.
  const [sinVer, setSinVer] = useState(
    () => localStorage.getItem(VISTA_KEY) !== VERSION,
  );

  useEffect(() => {
    let vivo = true;
    fetch("/health")
      .then((r) => r.json())
      .then((d) => { if (vivo) setCommitServidor(d?.version?.commit ?? null); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  // Se compara solo si el servidor reporta commit: en local no lo hace y no
  // tiene sentido asustar con un desajuste que no existe.
  const desajustado =
    Boolean(commitServidor) && COMMIT !== "local" && commitServidor !== COMMIT;

  const abrir = () => {
    setAbierto(true);
    localStorage.setItem(VISTA_KEY, VERSION);
    setSinVer(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title={`Panel ${VERSION} · compilado en ${COMMIT}${desajustado ? ` · el servidor corre ${commitServidor}` : ""}`}
        className="relative rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-wide transition-colors"
        style={{
          background: desajustado
            ? "color-mix(in srgb, var(--color-sand) 18%, transparent)"
            : "color-mix(in srgb, var(--color-paper) 7%, transparent)",
          color: desajustado ? "var(--color-sand)" : "var(--color-muted)",
        }}
      >
        {VERSION}
        {(sinVer || desajustado) && (
          <span
            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
            style={{ background: desajustado ? "var(--color-sand)" : "var(--color-ok)" }}
          />
        )}
      </button>

      <AnimatePresence>
        {abierto && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setAbierto(false)}
              className="fixed inset-0 z-40"
              style={{ background: "var(--color-scrim)" }}
            />
            <motion.aside
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="glass fixed top-16 right-4 z-50 max-h-[75vh] w-[min(420px,calc(100vw-2rem))] overflow-y-auto rounded-3xl p-5"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="microlabel">Novedades</p>
                  <p className="mt-1 text-[10.5px] text-faint">
                    Panel {VERSION} · compilado en {COMMIT}
                    {commitServidor ? ` · servidor en ${commitServidor}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => setAbierto(false)}
                  className="shrink-0 rounded-lg px-2 py-0.5 text-[17px] leading-none text-faint hover:text-paper"
                  aria-label="Cerrar"
                >×</button>
              </div>

              {desajustado && (
                <p
                  className="mb-4 rounded-2xl px-3.5 py-2.5 text-[11.5px]"
                  style={{
                    background: "color-mix(in srgb, var(--color-sand) 12%, transparent)",
                    color: "var(--color-sand)",
                  }}
                >
                  El panel y el servidor están en commits distintos. Suele durar
                  un minuto mientras termina el despliegue; si sigue así, recarga
                  la página.
                </p>
              )}

              <div className="flex flex-col gap-4">
                {CAMBIOS.map((c, i) => (
                  <div key={c.version}>
                    <div className="flex items-baseline gap-2">
                      <span className="serif text-[15px]">{c.version}</span>
                      {i === 0 && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold"
                          style={{
                            background: "color-mix(in srgb, var(--color-ok) 16%, transparent)",
                            color: "var(--color-ok)",
                          }}
                        >AHORA</span>
                      )}
                      <span className="ml-auto text-[10px] text-faint">{c.fecha}</span>
                    </div>
                    <p className="mt-0.5 mb-1.5 text-[12px] font-semibold">{c.titulo}</p>
                    <ul className="flex flex-col gap-1">
                      {c.puntos.map((p) => (
                        <li key={p} className="flex gap-1.5 text-[11.5px] leading-snug text-muted">
                          <span className="text-faint">·</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
