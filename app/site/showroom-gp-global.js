(function () {
  const KEY = "autoventa_sound_enabled";
  let audioCtx = null;

  function enabled() {
    return localStorage.getItem(KEY) !== "off";
  }

  function audio() {
    if (!enabled()) return null;
    try {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") void audioCtx.resume();
      return audioCtx;
    } catch {
      return null;
    }
  }

  function tone(freq, duration, volume, delay) {
    const ctx = audio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + (delay || 0);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  function clickSound() {
    tone(360, 0.055, 0.008, 0);
    tone(920, 0.05, 0.004, 0.025);
  }

  function notificationSound() {
    tone(820, 0.12, 0.02, 0);
    tone(1174, 0.16, 0.022, 0.08);
    tone(1568, 0.2, 0.02, 0.17);
  }

  function sync(button) {
    const on = enabled();
    button.setAttribute("aria-pressed", String(on));
    button.innerHTML = `<span aria-hidden="true">${on ? "🔊" : "🔇"}</span><span>${on ? "Sonido" : "Silenciado"}</span>`;
    button.title = on ? "Apagar sonidos" : "Activar sonidos";
  }

  function install() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gp-sound-toggle";
    button.setAttribute("aria-label", "Cambiar estado del sonido");
    sync(button);
    button.addEventListener("click", () => {
      localStorage.setItem(KEY, enabled() ? "off" : "on");
      sync(button);
      if (enabled()) clickSound();
    });
    document.body.appendChild(button);

    document.addEventListener("click", (event) => {
      if (!enabled() || event.target.closest(".gp-sound-toggle")) return;
      const target = event.target.closest("button,.opt,.switch,.go,.quicknav a,.estilo-pills a");
      if (target && !target.disabled) clickSound();
    });

    const observed = new WeakMap();
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const el = record.target.nodeType === Node.TEXT_NODE ? record.target.parentElement : record.target;
        const target = el && el.closest && el.closest(".toast,.status,.st");
        if (!target || !target.textContent.trim() || target.offsetParent === null) continue;
        const text = target.textContent.trim();
        if (observed.get(target) === text) continue;
        observed.set(target, text);
        notificationSound();
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "style"] });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
