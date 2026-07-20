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

  function pageCode() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path.includes("/mensajes")) return ["PIT / 02", "MENSAJES"];
    if (path.includes("/configuracion")) return ["PIT / 03", "SETUP IA"];
    if (path.includes("/tester")) return ["PIT / 04", "WA TEST"];
    if (path.includes("/docs/")) return ["PADDOCK DOC", "DT—01"];
    if (path.includes("/estilos/")) return ["DESIGN LAB", "ARCHIVO"];
    return ["PIT SYSTEM", "DT—01"];
  }

  function installAmbientDetails() {
    const [area, code] = pageCode();
    const ambient = document.createElement("div");
    ambient.className = "gp-ambient";
    ambient.setAttribute("aria-hidden", "true");
    ambient.innerHTML = `
      <div class="gp-ambient-telemetry">
        <i></i><span>${area}</span><b>${code}</b>
      </div>
      <div class="gp-ambient-speed"><i></i><i></i><i></i></div>
      <div class="gp-ambient-car"></div>
      <div class="gp-ambient-mini-car"></div>
      <div class="gp-ambient-wheel gp-ambient-wheel-a"></div>
      <div class="gp-ambient-wheel gp-ambient-wheel-b"></div>
      <div class="gp-ambient-circuit"></div>
      <div class="gp-ambient-spec"><b>245/40</b><span>R18 · SPORT</span></div>
      <div class="gp-ambient-corner"><b>30+</b><span>AÑOS EN PISTA</span></div>
    `;
    document.body.prepend(ambient);
  }

  function markInteractiveElements() {
    document.querySelectorAll("button, a.card, a.row, .opt, .switch, .go").forEach((element) => {
      if (!element.hasAttribute("data-gp-control")) element.setAttribute("data-gp-control", "");
    });
  }

  function install() {
    document.documentElement.setAttribute("data-design-system", "showroom-gp");
    installAmbientDetails();
    markInteractiveElements();

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
      const target = event.target.closest("button,a[href],.opt,.switch,.go");
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

    const controlsObserver = new MutationObserver(markInteractiveElements);
    controlsObserver.observe(document.body, { subtree: true, childList: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
