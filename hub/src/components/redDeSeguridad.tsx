import { Component, type ErrorInfo, type ReactNode } from "react";
import { authHeaders } from "../data/realSource";

/*
 * RED DE SEGURIDAD (23-nov-2026).
 *
 * Si una pantalla se rompe al dibujarse, React desmonta TODO y queda la página
 * en blanco, sin nada que tocar: había que cerrar la app. Pasó con una etapa
 * que el panel no conocía, y es una de las formas de «la app se queda en
 * blanco» que reportó Manuel. Esto atrapa el error, lo anota y deja un botón.
 */

function anotar(error: unknown, donde: string): void {
  try {
    const cuerpo = JSON.stringify({
      mensaje: error instanceof Error ? error.message : String(error),
      pila: error instanceof Error ? (error.stack ?? "").slice(0, 1500) : "",
      donde,
      ruta: window.location.hash,
      agente: navigator.userAgent,
    });
    // `keepalive`: que salga aunque el usuario recargue enseguida.
    void fetch("/api/hub/error-del-panel", { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: cuerpo, keepalive: true })
      .catch(() => undefined);
  } catch {
    /* anotar nunca rompe nada */
  }
}

/** Errores fuera del dibujo (una promesa suelta, un evento): solo se anotan. */
export function vigilarErrores(): void {
  let enviados = 0;
  const uno = (error: unknown, donde: string) => {
    if (enviados++ < 5) anotar(error, donde);
  };
  window.addEventListener("error", (e) => uno(e.error ?? e.message, "window.error"));
  window.addEventListener("unhandledrejection", (e) => uno(e.reason, "promesa"));
}

export class RedDeSeguridad extends Component<{ children: ReactNode }, { roto: boolean }> {
  state = { roto: false };

  static getDerivedStateFromError(): { roto: boolean } {
    return { roto: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    anotar(error, `dibujo${(info.componentStack ?? "").slice(0, 400)}`);
  }

  render(): ReactNode {
    if (!this.state.roto) return this.props.children;
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-bg p-6 text-center" data-testid="pantalla-de-error">
        <div className="flex max-w-[320px] flex-col items-center gap-4">
          <p className="m-0 text-[18px] font-semibold">Algo falló en esta pantalla</p>
          <p className="m-0 text-[14px] text-text2">No se perdió nada. Vuelve a abrirla.</p>
          <button
            type="button"
            className="btn-signal h-[52px] w-full rounded-[8px] text-[16px] font-semibold"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
          <button
            type="button"
            className="h-11 text-[14px] text-text2 underline underline-offset-[3px]"
            onClick={() => { window.location.hash = "#/inbox"; window.location.reload(); }}
          >
            Ir al inicio
          </button>
        </div>
      </div>
    );
  }
}
