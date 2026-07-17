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
  ctx.roundRect(0, 0, 64, 64, 14);
  ctx.fillStyle = abiertos > 0 ? "#c96b62" : "#2e2e2b";
  ctx.fill();

  ctx.fillStyle = "#f5f4ee";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (abiertos > 0) {
    ctx.font = "800 34px Inter, sans-serif";
    ctx.fillText(String(Math.min(abiertos, 99)), 32, 35);
  } else {
    ctx.font = "800 26px Inter, sans-serif";
    ctx.fillText("DT", 32, 34);
  }

  const link = document.getElementById("favicon") as HTMLLinkElement | null;
  if (link) link.href = canvas.toDataURL("image/png");
}
