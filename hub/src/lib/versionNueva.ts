import { useEffect, useState } from "react";

/**
 * ¿HAY UNA VERSIÓN NUEVA DEL PANEL? (22-nov-2026)
 *
 * La app instalada en el teléfono no se recarga sola: iOS la deja en memoria y,
 * aunque el servidor ya sirva la versión nueva, el asesor sigue viendo la vieja
 * hasta cerrarla del todo. Pasó con la pestaña Cotizador, que se quitó del
 * teléfono y en Competimotor seguía apareciendo (Manuel, 22-nov).
 *
 * Cómo se sabe: cada compilación genera un `assets/index-<hash>.js` distinto.
 * Se pide el `index.html` del servidor (sin caché) y se compara su script con
 * el que está corriendo. El commit no sirve para esto: el panel se compila
 * antes del commit que lo guarda, así que nunca coincide con el del servidor.
 */

const PATRON = /assets\/index-[A-Za-z0-9_-]+\.js/;

/** El bundle que está corriendo ahora. null en desarrollo (Vite no usa `assets/index-…`). */
export function bundleActual(): string | null {
  for (const s of Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))) {
    const m = PATRON.exec(s.src);
    if (m) return m[0];
  }
  return null;
}

/** El bundle que sirve el servidor hoy. null si no se pudo saber. */
export async function bundleDelServidor(): Promise<string | null> {
  try {
    const r = await fetch(new URL("./index.html", window.location.href).toString(), { cache: "no-store" });
    if (!r.ok) return null;
    return PATRON.exec(await r.text())?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function hayVersionNueva(): Promise<boolean> {
  const actual = bundleActual();
  if (!actual) return false;
  const servidor = await bundleDelServidor();
  return Boolean(servidor && servidor !== actual);
}

/** Recarga la app en la misma pantalla (la ruta vive en el hash). */
export function actualizarApp(): void {
  window.location.reload();
}

/**
 * Revisa al abrir, cada 5 min y cada vez que la app vuelve al frente. Si vuelve
 * al frente y hay versión nueva, recarga sin preguntar: el asesor recién entra,
 * no tiene nada a medias. Mientras la está usando, solo avisa (devuelve true)
 * para no borrarle un mensaje que está escribiendo.
 */
export function useVersionNueva(): boolean {
  const [nueva, setNueva] = useState(false);
  useEffect(() => {
    if (!bundleActual()) return;
    let vivo = true;
    const revisar = async (alVolver: boolean) => {
      const hay = await hayVersionNueva();
      if (!vivo || !hay) return;
      if (alVolver) actualizarApp();
      else setNueva(true);
    };
    void revisar(false);
    const t = window.setInterval(() => void revisar(false), 5 * 60_000);
    const alCambiar = () => { if (document.visibilityState === "visible") void revisar(true); };
    document.addEventListener("visibilitychange", alCambiar);
    window.addEventListener("pageshow", alCambiar);
    return () => {
      vivo = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", alCambiar);
      window.removeEventListener("pageshow", alCambiar);
    };
  }, []);
  return nueva;
}
