/**
 * Favicon: el «AV» de AutoVenta (logo del 30-oct, rojo #C8102E) en el panel
 * de TODOS los negocios, con el contador de tickets abiertos encima.
 */
import iconoUrl from "../assets/autoventa-icono.svg";

let last = -1;
let icono: HTMLImageElement | null = null;

function cargarIcono(): Promise<HTMLImageElement> {
  if (icono) return Promise.resolve(icono);
  return new Promise((listo, falla) => {
    const img = new Image();
    img.onload = () => listo((icono = img));
    img.onerror = falla;
    img.src = iconoUrl;
  });
}

export function updateFavicon(abiertos: number): void {
  if (abiertos === last) return;
  last = abiertos;
  void cargarIcono().then((img) => {
    if (abiertos !== last) return;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, 64, 64);
    if (abiertos > 0) {
      ctx.beginPath();
      ctx.arc(48, 48, 15, 0, Math.PI * 2);
      ctx.fillStyle = "#1c1b19";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 20px 'Archivo Variable', Archivo, sans-serif";
      ctx.fillText(String(Math.min(abiertos, 99)), 48, 49);
    }
    const link = document.getElementById("favicon") as HTMLLinkElement | null;
    if (link) link.href = canvas.toDataURL("image/png");
  }).catch(() => undefined);
}
