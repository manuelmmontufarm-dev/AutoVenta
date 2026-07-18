import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./design/tokens.css";
// Temas alternativos (estilos 03/04/05): inertes salvo que <html data-theme> los active
import "./design/themes/showroom.css";
import "./design/themes/racing.css";
import "./design/themes/neobrutalista.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
