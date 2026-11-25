/**
 * EL ÍCONO Y EL NOMBRE DE LA APP DEL TELÉFONO, POR CLIENTE (Manuel, 24-nov-2026).
 *
 * El panel (`/admin`) es el mismo build para todos los clientes, así que el
 * ícono y el nombre de la pantalla de inicio salían iguales: «AV» y
 * «AutoVenta» en el teléfono de Depot y en el de Competimotor. Acá cada
 * servicio dibuja el «AV» con SU nombre abajo (`negocio.nombre`: «Depot Tire»,
 * «Competimotor») y pone ese nombre bajo el ícono al instalar la app.
 *
 * Va antes del estático en `webhook.ts`: si no, saldrían los archivos fijos de
 * `site/admin/`, que siguen ahí como respaldo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import type express from "express";

const FUENTE = path.join(
  path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "fonts", "Barlow-700i.ttf",
);

/** El «AV» del logo del 30-oct (mismo trazo que `hub/public/favicon.svg`, caja 46×46). */
const AV =
  "M16.94 32.49 16.88 30.06Q16.91 30 16.85 29.96Q16.8 29.92 16.74 29.92H13.8Q13.63 29.92 13.63 30.06L13.02 32.49Q12.93 32.8 12.63 32.8H8.76Q8.43 32.8 8.54 32.44L14.78 13.51Q14.87 13.2 15.17 13.2H19.6Q19.93 13.2 19.93 13.51L21.5 32.44V32.52Q21.5 32.8 21.19 32.8H17.25Q16.94 32.8 16.94 32.49ZM14.78 26.33H16.6Q16.74 26.33 16.74 26.19L16.55 19.81Q16.55 19.7 16.49 19.7Q16.43 19.7 16.38 19.81L14.7 26.19Q14.7 26.33 14.78 26.33ZM26.29 32.49 24.75 13.56Q24.75 13.2 25.09 13.2H29.29Q29.59 13.2 29.59 13.51L29.79 24.68Q29.79 24.79 29.86 24.78Q29.93 24.76 29.93 24.68L32.76 13.51Q32.84 13.2 33.15 13.2H37.24Q37.57 13.2 37.46 13.56L31.27 32.49Q31.19 32.8 30.88 32.8H26.6Q26.46 32.8 26.37 32.72Q26.29 32.63 26.29 32.49Z";

const ROJO = "#C8102E";
const CREMA = "#F5F3EC";

function escaparXml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * El ícono en una caja de 512: el «AV» arriba y el nombre abajo, en mayúsculas.
 * El nombre se achica para entrar en el ancho (Android recorta los bordes del
 * ícono «maskable», así que queda dentro del 80 % central).
 */
export function svgDelIcono(nombre: string): string {
  const texto = escaparXml(nombre.toUpperCase());
  // Barlow 700 itálica: ~0,58 em por letra en mayúsculas. Ancho útil 380 px.
  const tamaño = Math.min(64, Math.floor(380 / (Math.max(texto.length, 1) * 0.58)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${ROJO}"/>
  <g transform="translate(256 205) scale(9) translate(-23 -23)"><path fill="${CREMA}" d="${AV}"/></g>
  <text x="256" y="${372 + tamaño * 0.35}" text-anchor="middle" font-family="Barlow" font-weight="700"
    font-style="italic" font-size="${tamaño}" letter-spacing="1" fill="${CREMA}">${texto}</text>
</svg>`;
}

const cache = new Map<number, Buffer>();

export function pngDelIcono(nombre: string, lado: number): Buffer {
  const guardado = cache.get(lado);
  if (guardado) return guardado;
  const png = new Resvg(svgDelIcono(nombre), {
    fitTo: { mode: "width", value: lado },
    font: { fontFiles: [FUENTE], loadSystemFonts: false, defaultFontFamily: "Barlow" },
  }).render().asPng();
  cache.set(lado, png);
  return png;
}

export function manifiestoDeLaApp(nombre: string): Record<string, unknown> {
  return {
    // `id` fijo + `handle_links`: en Android, un link al panel (los avisos de
    // WhatsApp mandan `…/admin/#/ticket/123`) abre la app instalada y no Chrome.
    // `navigate-existing` reusa la ventana abierta en vez de abrir otra.
    id: "./",
    handle_links: "preferred",
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    name: nombre,
    short_name: nombre,
    description: `Panel de ventas de ${nombre}: inbox, oportunidades y pipeline.`,
    start_url: "./",
    scope: "./",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f1e4",
    theme_color: "#f6f1e4",
    icons: [
      { src: "icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}

/** La página del panel con el nombre del cliente en el título y bajo el ícono (iPhone). */
export function paginaConNombre(html: string, nombre: string): string {
  const n = escaparXml(nombre);
  return html
    .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/, `$1${n}$2`)
    .replace(/<title>[^<]*<\/title>/, `<title>${n} · Hub</title>`);
}

/** Las rutas de `/admin` que cambian por cliente. */
export function montarIconoDeLaApp(app: express.Express, siteDir: string, nombre: string): void {
  const lados: Record<string, number> = { "icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180 };
  for (const [archivo, lado] of Object.entries(lados)) {
    app.get(`/admin/${archivo}`, (_req, res) => {
      res.type("png").setHeader("Cache-Control", "public, max-age=3600").send(pngDelIcono(nombre, lado));
    });
  }
  app.get("/admin/manifest.webmanifest", (_req, res) => {
    res.type("application/manifest+json").send(JSON.stringify(manifiestoDeLaApp(nombre), null, 2));
  });
  app.get(["/admin", "/admin/", "/admin/index.html"], (req, res, next) => {
    if (req.path === "/admin") return res.redirect(301, "/admin/");
    let html: string;
    try {
      html = readFileSync(path.join(siteDir, "admin", "index.html"), "utf8");
    } catch {
      return next();
    }
    res.type("html").setHeader("Cache-Control", "no-cache").send(paginaConNombre(html, nombre));
  });
}
