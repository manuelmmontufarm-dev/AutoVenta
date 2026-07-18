const usd = new Intl.NumberFormat("es-EC", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

export function money(n: number): string {
  return usd.format(n);
}

/** "$1.2k" para headers de columna. */
export function moneyCompact(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1).replace(".", ",")}k`;
  return `$${Math.round(n)}`;
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export function relTime(iso: string, ahora: number = Date.now()): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((ahora - t) / 1000));
  if (s < 45) return "ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return DIAS[new Date(iso).getDay()];
  return new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short" });
}

export function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
}

export function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "long" });
}

export function iniciales(nombre: string | null, telefono: string): string {
  if (!nombre) return telefono.slice(-2);
  const partes = nombre.trim().split(/\s+/);
  return (partes[0][0] + (partes[1]?.[0] ?? "")).toUpperCase();
}

/** Color de avatar determinístico por teléfono. */
// Se resuelven en CSS: cada tema define su propia gama legible
const AVATAR_COLORS = [
  "var(--av-1)", "var(--av-2)", "var(--av-3)", "var(--av-4)",
  "var(--av-5)", "var(--av-6)", "var(--av-7)",
];
export function avatarColor(telefono: string): string {
  let h = 0;
  for (const c of telefono) h = (h * 31 + c.charCodeAt(0)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
