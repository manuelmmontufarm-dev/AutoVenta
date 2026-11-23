import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { RedDeSeguridad, vigilarErrores } from "./components/redDeSeguridad";
// Fuentes auto-hospedadas: el Hub abre en un taller con internet de taller,
// y una fuente que depende de Google es una fuente que a veces no llega.
import "@fontsource-variable/archivo";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./design/tokens.css";

vigilarErrores();

/*
 * El service worker guarda el cascarón de la app para que abra aunque la señal
 * falle (ver public/sw.js), y avisa cuando se toca una notificación: la app
 * cambia de pantalla sola, sin recargarse. Solo en el panel compilado: en
 * `vite dev` no hay `assets/` con huella y estorbaría.
 */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    const dato = event.data as { tipo?: string; ruta?: string } | null;
    if (dato?.tipo !== "abrir-ruta" || typeof dato.ruta !== "string" || !dato.ruta.startsWith("#/")) return;
    if (window.location.hash === dato.ruta) window.dispatchEvent(new Event("autoventa:refrescar"));
    else window.location.hash = dato.ruta;
  });
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("sw.js").catch(() => undefined);
    });
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RedDeSeguridad>
      <App />
    </RedDeSeguridad>
  </StrictMode>,
);
