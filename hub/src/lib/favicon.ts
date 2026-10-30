/**
 * Favicon dinámico: el bloque rojo «AV» de AutoVenta y, si hay tickets
 * abiertos, el número en una pastilla tinta arriba a la derecha (como los
 * correos). El anillo crema la separa del rojo y de una barra de pestañas
 * oscura; el número va grande porque a 16 px la pastilla mide 11 px de alto.
 */
import { AV_64 } from "./marca-trazos";

const ROJO = "#C8102E";
const CREMA = "#F5F3EC";
const TINTA = "#111917";

let last = -1;

export function updateFavicon(abiertos: number): void {
  if (abiertos === last) return;
  last = abiertos;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.beginPath();
  ctx.roundRect(0, 0, 64, 64, 8.32);
  ctx.fillStyle = ROJO;
  ctx.fill();
  ctx.fillStyle = CREMA;
  ctx.fill(new Path2D(AV_64));

  if (abiertos > 0) {
    const texto = String(Math.min(abiertos, 99));
    // Una cifra: círculo de 44; dos: pastilla de todo el ancho (a 16 px dos
    // cifras más angostas se funden en una mancha).
    const alto = 44;
    const ancho = texto.length > 1 ? 64 : alto;
    const x = 64 - ancho;
    ctx.beginPath();
    ctx.roundRect(x - 3, -3, ancho + 6, alto + 6, (alto + 6) / 2);
    ctx.fillStyle = CREMA;
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x, 0, ancho, alto, alto / 2);
    ctx.fillStyle = TINTA;
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${texto.length > 1 ? 40 : 38}px 'Archivo Variable', Archivo, sans-serif`;
    ctx.fillText(texto, x + ancho / 2, alto / 2 + 2);
  }

  const link = document.getElementById("favicon") as HTMLLinkElement | null;
  if (link) {
    link.type = "image/png";
    link.href = canvas.toDataURL("image/png");
  }
}
