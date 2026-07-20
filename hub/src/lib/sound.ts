/** Pings sutiles con WebAudio (solo en modo demo, tras gesto del usuario). */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, t0: number, dur: number, vol: number): void {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ac.currentTime + t0);
  gain.gain.linearRampToValueAtTime(vol, ac.currentTime + t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + t0);
  osc.stop(ac.currentTime + t0 + dur + 0.05);
}

function esShowroomGp(): boolean {
  return document.documentElement.dataset.theme === "showroom-gp";
}

function sweep(
  desde: number,
  hasta: number,
  t0: number,
  dur: number,
  vol: number,
  tipo: OscillatorType = "sine",
): void {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(desde, ac.currentTime + t0);
  osc.frequency.exponentialRampToValueAtTime(hasta, ac.currentTime + t0 + dur);
  gain.gain.setValueAtTime(0.0001, ac.currentTime + t0);
  gain.gain.exponentialRampToValueAtTime(vol, ac.currentTime + t0 + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + t0);
  osc.stop(ac.currentTime + t0 + dur + 0.04);
}

/** Encendido corto: grave de motor + confirmación electrónica. */
export function sonidoArranque(): void {
  if (!esShowroomGp()) return;
  sweep(48, 96, 0, 0.42, 0.045, "sawtooth");
  sweep(70, 138, 0.12, 0.35, 0.026, "triangle");
  tone(880, 0.38, 0.12, 0.018);
  tone(1320, 0.46, 0.18, 0.016);
}

/** Click mecánico muy sutil al cambiar de pantalla. */
export function sonidoCambio(): void {
  if (!esShowroomGp()) return;
  sweep(210, 135, 0, 0.075, 0.012, "triangle");
}

/** Apagado limpio del modo demo. */
export function sonidoPitStop(): void {
  if (!esShowroomGp()) return;
  sweep(118, 52, 0, 0.28, 0.025, "sawtooth");
}

export function pingNotificacion(): void {
  tone(880, 0, 0.18, 0.035);
  tone(1318, 0.09, 0.22, 0.03);
}

export function pingVenta(): void {
  tone(659, 0, 0.16, 0.04);
  tone(880, 0.1, 0.16, 0.04);
  tone(1108, 0.2, 0.3, 0.045);
}
