/** Favicon dinámico con el contador de tickets abiertos (detalle nivel Apple). */
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
  ctx.roundRect(0, 0, 64, 64, 10);
  ctx.fillStyle = abiertos > 0 ? "#b4453a" : "#1c1b19";
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (abiertos > 0) {
    ctx.font = "700 34px 'Archivo Variable', Archivo, sans-serif";
    ctx.fillText(String(Math.min(abiertos, 99)), 32, 35);
  } else {
    ctx.font = "700 26px 'Archivo Variable', Archivo, sans-serif";
    ctx.fillText("DT", 32, 34);
  }

  const link = document.getElementById("favicon") as HTMLLinkElement | null;
  if (link) link.href = canvas.toDataURL("image/png");
}
