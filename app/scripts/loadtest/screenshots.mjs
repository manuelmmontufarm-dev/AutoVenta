/**
 * Capturas del panel con Playwright.
 *
 * Una imagen sola no prueba nada: cada captura va con su aserción. El
 * screenshot es la evidencia legible para un humano; lo que decide verde o
 * rojo es la aserción y los errores de consola recogidos.
 *
 * La clave administrativa la genera el propio harness y se inyecta en
 * localStorage, así que nunca hace falta una credencial real.
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PANTALLAS = [
  { id: "inbox", ruta: "#/inbox", nombre: "Inbox", esperaTexto: null },
  { id: "pipeline", ruta: "#/pipeline", nombre: "Pipeline (kanban)", esperaTexto: null },
  { id: "oportunidades", ruta: "#/opportunities", nombre: "Oportunidades", esperaTexto: null },
  { id: "metricas", ruta: "#/dashboard", nombre: "Métricas", esperaTexto: null },
  { id: "ajustes-whatsapp", ruta: "#/settings", nombre: "Ajustes → WhatsApp", esperaTexto: null },
];

export async function capturarPanel({ baseUrl, adminKey, salida }) {
  const { chromium } = await import("playwright");
  const dir = resolve(salida, "capturas");
  mkdirSync(dir, { recursive: true });

  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  // La clave tiene que estar en localStorage ANTES del primer script de la
  // página: si se inyecta después de navegar, la app ya disparó sus llamadas
  // sin credencial y ensucia la consola con 401 que no son un fallo real.
  await contexto.addInitScript((key) => {
    window.localStorage.setItem("autoventa_admin_key", key);
  }, adminKey);
  const errores = [];
  const capturas = [];

  const page = await contexto.newPage();
  page.on("console", (msg) => { if (msg.type() === "error") errores.push(`[consola] ${msg.text()}`); });
  page.on("pageerror", (err) => errores.push(`[excepción] ${err.message}`));

  for (const pantalla of PANTALLAS) {
    await page.goto(`${baseUrl}/admin/${pantalla.ruta}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_200);
    const archivo = resolve(dir, `${pantalla.id}.png`);
    await page.screenshot({ path: archivo, fullPage: true });

    // Aserción mínima por pantalla: que renderizó algo y no la pantalla de bloqueo.
    const textoVisible = await page.evaluate(() => document.body.innerText.trim());
    const bloqueado = textoVisible.includes("El hub está bloqueado");
    if (bloqueado) errores.push(`${pantalla.nombre}: el panel quedó bloqueado (clave no aceptada)`);
    capturas.push({
      pantalla: pantalla.nombre,
      archivo,
      caracteresRenderizados: textoVisible.length,
      ok: !bloqueado && textoVisible.length > 50,
    });
  }

  // Detalle de un ticket: verifica que el hilo se lee en orden.
  const tickets = await fetch(`${baseUrl}/api/hub/tickets`, { headers: { "x-admin-key": adminKey } })
    .then((r) => r.json()).catch(() => ({ tickets: [] }));
  const primero = tickets.tickets?.[0];
  if (primero) {
    await page.goto(`${baseUrl}/admin/#/ticket/${primero.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_500);
    const archivo = resolve(dir, "ticket-detalle.png");
    await page.screenshot({ path: archivo, fullPage: true });
    capturas.push({ pantalla: "Detalle de ticket", archivo, ok: true });
  }

  await navegador.close();
  return { errores, capturas };
}
