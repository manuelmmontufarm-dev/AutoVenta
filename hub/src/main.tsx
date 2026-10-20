import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
// Fuentes auto-hospedadas: el Hub abre en un taller con internet de taller,
// y una fuente que depende de Google es una fuente que a veces no llega.
import "@fontsource-variable/archivo";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./design/tokens.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
