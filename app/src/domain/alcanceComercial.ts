import { extractConventionalSizes, extractFlotationSizes, extractTireSizes } from "./tireSize.js";

const normalizar = (texto: string) =>
  (texto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const FUERA_DE_CATALOGO =
  /\b(?:cambio\s+de\s+aceite|cambiar\s+el\s+aceite|aceite\s+de\s+motor|filtro\s+de\s+aceite|lavado|pintura|matriculacion|revision\s+tecnica|mecanica\s+general|llanta\s+industrial|llantas?\s+solid[oa]s?|montacargas|uso\s+industrial|maquinaria\s+pesada)\b/;

const HABLA_DE_LLANTAS =
  /\b(?:llant\w*|neumatic\w*|caucho\w*|rin(?:es)?|aro(?:s)?|falken|kenda|winrun|medida\s+de\s+la\s+llanta)\b/;

export function esConsultaFueraDeCatalogo(texto: string): boolean {
  return FUERA_DE_CATALOGO.test(normalizar(texto));
}

export function tieneIntencionExplicitaDeLlantas(texto: string): boolean {
  return HABLA_DE_LLANTAS.test(normalizar(texto))
    || extractTireSizes(texto).length > 0
    || extractFlotationSizes(texto).length > 0
    || extractConventionalSizes(texto).length > 0;
}

/** La última intención explícita manda; un "ok" conserva la consulta activa. */
export function consultaFueraDeCatalogoActiva(textosCronologicos: readonly string[]): boolean {
  let activa = false;
  for (const texto of textosCronologicos) {
    if (tieneIntencionExplicitaDeLlantas(texto)) activa = false;
    if (esConsultaFueraDeCatalogo(texto)) activa = true;
  }
  return activa;
}

export const ORDEN_FUERA_DE_CATALOGO =
  "CONSULTA FUERA DEL CATÁLOGO DE LLANTAS (fuente determinística): el cliente está preguntando por otro servicio. " +
  "No busques, muestres ni cotices llantas aunque haya dicho el modelo del vehículo. Responde únicamente lo que " +
  "esté respaldado y usa notificar_vendedor si hace falta confirmación humana.";

export function preguntaSiPuedeLlevarSuAceite(texto: string): boolean {
  const n = normalizar(texto);
  return /\b(?:puedo|podria|se puede)\s+llevar\s+(?:mi|el|su|propio)\s+aceite\b/.test(n)
    || /\baceptan\s+(?:mi|el|su|propio)\s+aceite\b/.test(n);
}

export function afirmaQueAceptanAceiteDelCliente(texto: string): boolean {
  const n = normalizar(texto);
  return /\bsi,?\s+(?:usted\s+)?puede\s+llevar\s+(?:su|el|propio)\s+aceite\b/.test(n)
    || /\b(?:le\s+)?hacen\s+el\s+cambio\s+con\s+(?:su|el|ese)\s+(?:aceite|producto)\b/.test(n)
    || /\baceptamos\s+(?:su|el|propio)\s+aceite\b/.test(n);
}

export const RESPUESTA_SEGURA_SOBRE_ACEITE =
  "No puedo confirmarle por este canal si el local acepta aceite llevado por el cliente. " +
  "Esa condición debe validarla directamente un asesor según el aceite y el filtro que necesite su vehículo.";
