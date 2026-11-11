/**
 * LA POLÍTICA DE PRIVACIDAD, CON EL NOMBRE DEL NEGOCIO QUE ATIENDE ESTA INSTANCIA.
 *
 * Meta exige una URL de privacidad para publicar la app de WhatsApp de cada
 * cliente (docs/CONECTAR_WHATSAPP_CLIENTE.md, paso 3). Hasta el 11-nov-2026
 * `site/privacy.html` tenía «Depot Tire» y su teléfono escritos a mano, así que
 * `mundillantas.up.railway.app/privacy` le decía a Meta —y a cualquier cliente de
 * Santo Domingo— que el responsable de sus datos era Depot.
 *
 * El HTML sigue siendo un archivo estático, con marcadores `{{NEGOCIO}}`,
 * `{{TEL}}` y `{{TEL_HREF}}`; esta función los llena con el perfil vivo.
 */
import { readFileSync } from "node:fs";
import type { PerfilDeNegocio } from "../negocio/perfil.js";

/** El nombre con que el negocio se presenta: la frase combinada si tiene dos marcas. */
export function nombreDelResponsable(perfil: PerfilDeNegocio): string {
  return perfil.presentacion?.frase?.trim() || perfil.nombre;
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** «+593 99 124 4698» → «+593991244698», para el `tel:`. */
function telefonoParaEnlace(telefono: string): string {
  return telefono.replace(/[^\d+]/g, "");
}

export function renderPrivacidad(plantilla: string, perfil: PerfilDeNegocio): string {
  const nombre = escaparHtml(nombreDelResponsable(perfil));
  const tel = escaparHtml(perfil.telefono);
  const telHref = escaparHtml(telefonoParaEnlace(perfil.telefono));
  return plantilla
    .replaceAll("{{NEGOCIO}}", nombre)
    .replaceAll("{{TEL_HREF}}", telHref)
    .replaceAll("{{TEL}}", tel);
}

let cache: string | undefined;

/** Lee la plantilla una vez (vive en `site/`, que no cambia sin un deploy). */
export function paginaPrivacidad(rutaPlantilla: string, perfil: PerfilDeNegocio): string {
  cache ??= renderPrivacidad(readFileSync(rutaPlantilla, "utf8"), perfil);
  return cache;
}
