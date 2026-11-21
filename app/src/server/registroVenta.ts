/**
 * `/venta` — la página donde el vendedor registra una venta (20-nov-2026).
 *
 * Pública, sin login: se les pasa un enlace con clave (`/venta?k=…`) y listo.
 * Paso 1: su nombre y el número del comprador → se valida y se guarda siempre.
 * Paso 2: la factura o referencia, sobre ese mismo registro.
 * La lógica vive en `services/registroDeVentas.ts`; acá solo el HTTP y el HTML.
 */
import express from "express";
import { negocio } from "../negocio/index.js";
import { nombreDelResponsable } from "./privacidad.js";
import { tel9 } from "../services/fuentes/contifico.js";
import {
  anularRegistro, claveDeRegistrosValida, claveValida, efectoEnPalabras, guardarFactura, leerMonto, listarVentasRegistradas,
  registrarVenta, validarEntrada, ventasACsv, type VentaRegistrada,
} from "../services/registroDeVentas.js";

// ── Freno simple contra el que quiera probar números en masa ─────────────────

const VENTANA_MS = 10 * 60 * 1000;
const MAX_POR_VENTANA = 60;
const intentos = new Map<string, { desde: number; n: number }>();

/** Railway va detrás de un proxy: la IP real es la primera de x-forwarded-for. */
function origen(req: express.Request): string {
  return String(req.header("x-forwarded-for") ?? "").split(",")[0].trim() || req.ip || "desconocido";
}

export function pasaElFreno(clave: string, ahora = Date.now()): boolean {
  const actual = intentos.get(clave);
  if (!actual || ahora - actual.desde > VENTANA_MS) {
    if (intentos.size > 5000) intentos.clear();
    intentos.set(clave, { desde: ahora, n: 1 });
    return true;
  }
  actual.n += 1;
  return actual.n <= MAX_POR_VENTANA;
}

export function reiniciarFrenoDeRegistro(): void {
  intentos.clear();
}

// ── El HTML ──────────────────────────────────────────────────────────────────

const escapar = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function paginaDeRegistro(nombreNegocio: string): string {
  const negocioHtml = escapar(nombreNegocio);
  return /* html */ `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Registrar venta · ${negocioHtml}</title>
<style>
  :root { --fondo:#f4f5f7; --tarjeta:#fff; --texto:#14171c; --suave:#5d6673; --borde:#d5d9e0;
          --marca:#14171c; --si:#0e7a43; --si-fondo:#e6f6ec; --no:#a3540a; --no-fondo:#fff3e0; --error:#b3261e; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--fondo); color:var(--texto);
         font: 17px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 440px; margin: 0 auto; padding: 24px 16px 48px; }
  .negocio { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--suave); margin: 0 0 4px; }
  h1 { font-size: 26px; line-height: 1.15; margin: 0 0 20px; text-wrap: balance; }
  form, .resultado { background: var(--tarjeta); border: 1px solid var(--borde); border-radius: 14px; padding: 18px; }
  label { display:block; font-weight: 600; font-size: 15px; margin: 0 0 6px; }
  label small { font-weight: 400; color: var(--suave); }
  input { width:100%; font: inherit; font-size: 19px; padding: 13px 14px; border: 1.5px solid var(--borde);
          border-radius: 10px; background:#fff; color: var(--texto); margin-bottom: 16px; }
  input:focus { outline: 3px solid #b9c7ff; border-color: #3b5bdb; }
  input.mal { border-color: var(--error); }
  button { width:100%; font: inherit; font-weight: 700; font-size: 18px; padding: 15px; border: 0; border-radius: 10px;
           background: var(--marca); color:#fff; cursor: pointer; }
  button:disabled { opacity: .55; }
  button.secundario { background: transparent; color: var(--texto); border: 1.5px solid var(--borde); margin-top: 10px; }
  .error { color: var(--error); font-size: 15px; margin: -8px 0 14px; min-height: 0; }
  .resultado { display:none; margin-top: 16px; }
  .resultado.si { background: var(--si-fondo); border-color: #a8dcbb; }
  .resultado.no { background: var(--no-fondo); border-color: #f2cf9b; }
  .veredicto { font-size: 23px; font-weight: 800; line-height: 1.2; margin: 0 0 8px; }
  .si .veredicto { color: var(--si); } .no .veredicto { color: var(--no); }
  .resultado p { margin: 0 0 6px; }
  .resultado dl { margin: 10px 0 0; display:grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 15px; }
  .resultado dt { color: var(--suave); } .resultado dd { margin:0; font-weight: 600; overflow-wrap: anywhere; }
  .guardado { font-size: 14px; color: var(--suave); margin-top: 12px !important; }
  .paso { font-size: 14px; font-weight: 600; color: var(--suave); margin: -12px 0 12px; }
  #f2 { background: transparent; border: 0; border-top: 1px solid rgba(0,0,0,.12); border-radius: 0; padding: 16px 0 0; margin-top: 14px; }
  .listo { font-weight: 700; margin: 14px 0 0 !important; padding-top: 14px; border-top: 1px solid rgba(0,0,0,.12); }
</style>
</head>
<body>
<main>
  <p class="negocio">${negocioHtml}</p>
  <h1>Registrar una venta</h1>

  <p class="paso" id="paso">Paso 1 de 2 · Validar el número</p>

  <form id="f" novalidate>
    <label for="vendedor">Tu nombre</label>
    <input id="vendedor" name="vendedor" autocomplete="name" maxlength="60" required>

    <label for="telefono">Número del cliente <small>(su celular)</small></label>
    <input id="telefono" name="telefono" type="tel" inputmode="numeric" placeholder="0991234567" maxlength="17" required>

    <p class="error" id="error" role="alert"></p>
    <button id="enviar" type="submit">Validar número</button>
  </form>

  <section class="resultado" id="resultado" aria-live="polite">
    <p class="veredicto" id="veredicto"></p>
    <p id="detalle"></p>
    <dl id="datos"></dl>
    <p class="guardado" id="guardado"></p>

    <form id="f2" novalidate>
      <label for="factura">Número de factura o referencia</label>
      <input id="factura" name="factura" maxlength="40" autocomplete="off">
      <label for="monto">Monto pagado <small>(en dólares)</small></label>
      <input id="monto" name="monto" inputmode="decimal" placeholder="230.50" maxlength="14" autocomplete="off">
      <p class="error" id="error2" role="alert"></p>
      <button id="enviar2" type="submit">Guardar factura</button>
    </form>
    <p class="listo" id="listo" hidden></p>

    <button class="secundario" id="corregir" type="button">Corregir el número</button>
    <button class="secundario" id="otra" type="button">Registrar otra venta</button>
  </section>
</main>
<script>
(function () {
  var k = new URLSearchParams(location.search).get("k") || "";
  var $ = function (id) { return document.getElementById(id); };
  var f = $("f"), f2 = $("f2"), error = $("error"), error2 = $("error2"), res = $("resultado");
  var actual = null;
  try { $("vendedor").value = localStorage.getItem("vendedor") || ""; } catch (e) {}
  // Desde el panel: «Registrar venta» abre esta página con el número ya puesto.
  var telDelEnlace = (new URLSearchParams(location.search).get("tel") || "").replace(/[^0-9+ ]/g, "").slice(0, 17);
  if (telDelEnlace) $("telefono").value = telDelEnlace;
  ($("vendedor").value ? (telDelEnlace ? $("enviar") : $("telefono")) : $("vendedor")).focus();

  function fecha(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Guayaquil" });
  }
  function dato(dl, nombre, valor) {
    if (!valor) return;
    var dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = nombre; dd.textContent = valor; dl.appendChild(dt); dl.appendChild(dd);
  }
  function enviar(ruta, cuerpo, boton, texto, cajaError, alOk) {
    cajaError.textContent = "";
    boton.disabled = true; boton.textContent = "Guardando…";
    cuerpo.k = k;
    fetch(ruta, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.ok) { alOk(j); return; }
        cajaError.textContent = j.error || "No se pudo guardar. Intenta de nuevo.";
        if (j.campo) { $(j.campo).classList.add("mal"); $(j.campo).focus(); }
      })
      .catch(function () { cajaError.textContent = "Sin conexión. Revisa el internet e intenta de nuevo."; })
      .then(function () { boton.disabled = false; boton.textContent = texto; });
  }
  function mostrar(r) {
    var v = r.venta, dl = $("datos");
    actual = v;
    dl.textContent = "";
    res.className = "resultado " + (v.vinoDeWhatsapp ? "si" : "no");
    $("veredicto").textContent = v.vinoDeWhatsapp ? "Sí vino de WhatsApp" : "No está en los chats de WhatsApp";
    $("detalle").textContent = v.vinoDeWhatsapp
      ? "Este número le escribió al negocio por WhatsApp."
      : "Revisa que el número esté bien escrito. Si está bien, este cliente no nos escribió por WhatsApp.";
    dato(dl, "Número", v.telefono);
    dato(dl, "Nombre en el chat", v.cliente);
    dato(dl, "Último mensaje", fecha(v.ultimoMensajeAt));
    if (v.vinoDeWhatsapp) dato(dl, "Cotización del bot", v.cotizaciones > 0 ? "Sí" : "No");
    $("guardado").textContent = "Número guardado a nombre de " + v.vendedor + "."
      + (v.efectoEnTicket === "marcado_ganado" ? " El chat quedó como venta ganada en el panel." : "")
      + (v.efectoEnTicket === "ya_ganado" ? " El chat ya estaba como venta ganada en el panel." : "")
      + (r.yaRegistradaPor ? " Ojo: este número ya lo registró hoy " + r.yaRegistradaPor + "." : "");
    $("paso").textContent = "Paso 2 de 2 · Factura o referencia";
    $("factura").value = ""; $("monto").value = ""; error2.textContent = "";
    f2.style.display = "block"; $("listo").hidden = true; $("corregir").hidden = false;
    f.style.display = "none"; res.style.display = "block";
    $("factura").focus();
  }
  function volver(limpiar) {
    res.style.display = "none"; f.style.display = "block"; error.textContent = "";
    $("paso").textContent = "Paso 1 de 2 · Validar el número";
    actual = null;
    if (limpiar) $("telefono").value = "";
    $("telefono").focus(); $("telefono").select();
  }
  $("otra").onclick = function () { volver(true); };
  // Corregir = el número estaba mal: ese registro se anula (queda, pero no
  // cuenta) y, si había marcado un chat como ganado, ese chat vuelve a donde estaba.
  $("corregir").onclick = function () {
    var anterior = actual;
    volver(false);
    if (!anterior) return;
    fetch("/venta/anular", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ k: k, id: anterior.id, telefono: anterior.telefono }) })
      .catch(function () {});
  };

  f.addEventListener("submit", function (e) {
    e.preventDefault();
    $("vendedor").classList.remove("mal"); $("telefono").classList.remove("mal");
    enviar("/venta/registrar", { vendedor: $("vendedor").value, telefono: $("telefono").value },
      $("enviar"), "Validar número", error, function (j) {
        try { localStorage.setItem("vendedor", j.venta.vendedor); } catch (e) {}
        mostrar(j);
      });
  });

  f2.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!actual) return;
    if (!$("factura").value.trim()) { error2.textContent = "Escribe el número de factura o la referencia."; $("factura").focus(); return; }
    if (!$("monto").value.trim()) { error2.textContent = "Escribe el monto que pagó el cliente."; $("monto").focus(); return; }
    enviar("/venta/factura", { id: actual.id, telefono: actual.telefono, factura: $("factura").value, monto: $("monto").value },
      $("enviar2"), "Guardar factura", error2, function (j) {
        f2.style.display = "none"; $("corregir").hidden = true;
        $("listo").hidden = false;
        $("listo").textContent = "Listo. Factura " + j.venta.factura
          + (j.venta.monto != null ? " por $" + Number(j.venta.monto).toFixed(2) : "") + " guardada.";
        $("paso").textContent = "Venta registrada";
      });
  });
})();
</script>
</body>
</html>`;
}

const ENLACE_MALO = /* html */ `<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Enlace incompleto</title>
<body style="font:17px/1.5 -apple-system,sans-serif;max-width:420px;margin:48px auto;padding:0 16px">
<h1 style="font-size:22px">Este enlace no está completo</h1>
<p>Pide de nuevo el enlace para registrar ventas y ábrelo tal como te lo enviaron.</p></body></html>`;

// ── La página del dueño: todos los registros ────────────────────────────────

const fechaHora = (d: Date) =>
  d.toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const soloFecha = (d: Date | null) =>
  d ? d.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric" }) : "";

export function paginaDeRegistros(nombreNegocio: string, ventas: VentaRegistrada[], clave: string): string {
  const vivas = ventas.filter((v) => !v.anuladaAt);
  const si = vivas.filter((v) => v.vinoDeWhatsapp).length;
  const sinFactura = vivas.filter((v) => !v.factura).length;
  const filas = ventas.map((v) => `<tr>
    <td>${escapar(fechaHora(v.createdAt))}</td>
    <td>${escapar(v.vendedor)}</td>
    <td class="num">${escapar(v.telefono)}</td>
    <td><span class="chip ${v.vinoDeWhatsapp ? "si" : "no"}">${v.vinoDeWhatsapp ? "Sí" : "No"}</span></td>
    <td>${escapar(v.cliente ?? "")}</td>
    <td>${escapar(soloFecha(v.ultimoMensajeAt))}</td>
    <td>${v.vinoDeWhatsapp ? (v.cotizaciones > 0 ? "Sí" : "No") : ""}</td>
    <td class="num">${v.factura ? escapar(v.factura) : '<span class="falta">sin factura</span>'}</td>
    <td class="num">${v.monto != null ? `$${v.monto.toFixed(2)}` : '<span class="falta">sin monto</span>'}</td>
    <td>${v.anuladaAt ? `<span class="falta">${escapar(efectoEnPalabras(v))}</span>` : escapar(efectoEnPalabras(v))}</td>
  </tr>`).join("");
  const negocioHtml = escapar(nombreNegocio);
  return /* html */ `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Ventas registradas · ${negocioHtml}</title>
<style>
  body { margin:0; background:#f4f5f7; color:#14171c; font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 48px; }
  .negocio { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color:#5d6673; margin:0 0 4px; }
  h1 { font-size: 26px; margin: 0 0 16px; }
  .resumen { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:16px; }
  .dato { background:#fff; border:1px solid #d5d9e0; border-radius:10px; padding:8px 14px; }
  .dato b { font-size: 20px; margin-right: 6px; font-variant-numeric: tabular-nums; }
  a.boton { margin-left:auto; background:#14171c; color:#fff; text-decoration:none; font-weight:700; padding:10px 16px; border-radius:10px; }
  .tabla { background:#fff; border:1px solid #d5d9e0; border-radius:12px; overflow-x:auto; }
  table { border-collapse: collapse; width:100%; min-width: 1020px; }
  th, td { text-align:left; padding:10px 12px; border-bottom:1px solid #eceef2; white-space:nowrap; }
  th { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:#5d6673; background:#fafbfc; }
  tr:last-child td { border-bottom:0; }
  .num { font-variant-numeric: tabular-nums; }
  .chip { display:inline-block; padding:2px 10px; border-radius:999px; font-weight:700; font-size:13px; }
  .chip.si { background:#e6f6ec; color:#0e7a43; } .chip.no { background:#fff3e0; color:#a3540a; }
  .falta { color:#8a93a0; }
  .vacio { padding: 28px 16px; color:#5d6673; }
</style></head><body><main>
  <p class="negocio">${negocioHtml}</p>
  <h1>Ventas registradas</h1>
  <div class="resumen">
    <span class="dato"><b>${vivas.length}</b>registros</span>
    <span class="dato"><b>${si}</b>vinieron de WhatsApp</span>
    <span class="dato"><b>${vivas.length - si}</b>no están en los chats</span>
    <span class="dato"><b>${sinFactura}</b>sin factura</span>
    <a class="boton" href="/venta/registros.csv?k=${encodeURIComponent(clave)}">Descargar Excel</a>
  </div>
  <div class="tabla">${ventas.length ? `<table>
    <thead><tr><th>Registrado</th><th>Vendedor</th><th>Número</th><th>WhatsApp</th><th>Nombre en el chat</th><th>Último mensaje</th><th>Cotizó el bot</th><th>Factura o referencia</th><th>Monto</th><th>Ticket</th></tr></thead>
    <tbody>${filas}</tbody></table>` : '<p class="vacio">Todavía no hay ventas registradas.</p>'}</div>
</main></body></html>`;
}

// ── Las rutas ────────────────────────────────────────────────────────────────

export function createRegistroVentaRouter(): express.Router {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer");
    if (!claveValida(req.query.k)) {
      res.status(404).type("html").send(ENLACE_MALO);
      return;
    }
    res.type("html").send(paginaDeRegistro(nombreDelResponsable(negocio)));
  });

  router.get(["/registros", "/registros.csv"], async (req, res) => {
    res.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer");
    if (!claveDeRegistrosValida(req.query.k)) {
      res.status(404).type("html").send(ENLACE_MALO);
      return;
    }
    try {
      const ventas = await listarVentasRegistradas();
      if (req.path.endsWith(".csv")) {
        res.type("text/csv").attachment("ventas-registradas.csv").send(ventasACsv(ventas));
        return;
      }
      res.type("html").send(paginaDeRegistros(nombreDelResponsable(negocio), ventas, String(req.query.k)));
    } catch (error) {
      console.error("❌ /venta/registros:", error);
      res.status(500).type("html").send("No se pudieron cargar los registros. Recarga la página.");
    }
  });

  router.post("/registrar", express.json({ limit: "4kb" }), async (req, res) => {
    const cuerpo = (req.body ?? {}) as Record<string, unknown>;
    if (!claveValida(cuerpo.k)) {
      res.status(404).json({ ok: false, error: "El enlace no es válido. Pide de nuevo el enlace." });
      return;
    }
    if (!pasaElFreno(origen(req))) {
      res.status(429).json({ ok: false, error: "Demasiados registros seguidos. Espera unos minutos." });
      return;
    }
    const validacion = validarEntrada(cuerpo);
    if (!validacion.ok) {
      res.status(400).json(validacion);
      return;
    }
    try {
      const resultado = await registrarVenta(validacion.entrada, validacion.tel9);
      res.json({ ok: true, ...resultado });
    } catch (error) {
      console.error("❌ /venta/registrar:", error);
      res.status(500).json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." });
    }
  });

  router.post("/factura", express.json({ limit: "4kb" }), async (req, res) => {
    const cuerpo = (req.body ?? {}) as Record<string, unknown>;
    if (!claveValida(cuerpo.k)) {
      res.status(404).json({ ok: false, error: "El enlace no es válido. Pide de nuevo el enlace." });
      return;
    }
    if (!pasaElFreno(origen(req))) {
      res.status(429).json({ ok: false, error: "Demasiados registros seguidos. Espera unos minutos." });
      return;
    }
    const llave = tel9(cuerpo.telefono);
    if (!Number.isInteger(cuerpo.id) || !llave || !String(cuerpo.factura ?? "").trim()) {
      res.status(400).json({ ok: false, error: "Escribe el número de factura o la referencia." });
      return;
    }
    // El monto es opcional para la API (los enlaces viejos solo mandan la
    // factura); la página lo pide. Sin él la venta queda «factura pendiente».
    if (String(cuerpo.monto ?? "").trim() && leerMonto(cuerpo.monto) == null) {
      res.status(400).json({ ok: false, campo: "monto", error: "Revisa el monto: escribe solo el número, por ejemplo 230.50." });
      return;
    }
    try {
      const venta = await guardarFactura(cuerpo.id as number, llave, cuerpo.factura, cuerpo.monto);
      if (!venta) {
        res.status(404).json({ ok: false, error: "No se encontró ese registro. Vuelve a validar el número." });
        return;
      }
      res.json({ ok: true, venta });
    } catch (error) {
      console.error("❌ /venta/factura:", error);
      res.status(500).json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." });
    }
  });

  router.post("/anular", express.json({ limit: "4kb" }), async (req, res) => {
    const cuerpo = (req.body ?? {}) as Record<string, unknown>;
    if (!claveValida(cuerpo.k)) {
      res.status(404).json({ ok: false, error: "El enlace no es válido. Pide de nuevo el enlace." });
      return;
    }
    if (!pasaElFreno(origen(req))) {
      res.status(429).json({ ok: false, error: "Demasiados registros seguidos. Espera unos minutos." });
      return;
    }
    const llave = tel9(cuerpo.telefono);
    if (!Number.isInteger(cuerpo.id) || !llave) {
      res.status(400).json({ ok: false, error: "Falta el registro a corregir." });
      return;
    }
    try {
      const resultado = await anularRegistro(cuerpo.id as number, llave);
      if (!resultado) {
        res.status(404).json({ ok: false, error: "No se encontró ese registro." });
        return;
      }
      res.json({ ok: true, ...resultado });
    } catch (error) {
      console.error("❌ /venta/anular:", error);
      res.status(500).json({ ok: false, error: "No se pudo corregir. Intenta de nuevo." });
    }
  });

  return router;
}
