/*
 * Service worker del panel.
 *
 * 1. Notificaciones de la app del teléfono (22-nov-2026).
 * 2. Que la app ABRA SIEMPRE (23-nov-2026). Antes no guardaba nada: con mala
 *    señal, o si el servidor estaba reiniciando por un deploy, la app instalada
 *    pedía la página, no llegaba, y se quedaba en blanco hasta cerrarla.
 *    Ahora se guarda el cascarón (la página y sus archivos):
 *      · la página se pide SIEMPRE primero al servidor (sigue saliendo fresca);
 *        solo si no contesta en 3 s, o falla, se usa la guardada;
 *      · los archivos de `assets/` llevan su huella en el nombre y nunca
 *        cambian: se sirven de lo guardado y, si no están, se bajan.
 *    Los datos (`/api/…`) NO se guardan nunca: siempre son los del servidor.
 */
const CASCARON = "autoventa-cascaron-v1";
const ESPERA_MS = 3000;

const alcance = () => self.registration.scope;
const paginaGuardada = () => new URL("./index.html", alcance()).href;

/**
 * Al instalarse guarda la página y sus archivos, sin esperar a la próxima
 * visita: así la primera vez que falle la señal ya hay con qué abrir.
 */
async function guardarCascaron() {
  const cache = await caches.open(CASCARON);
  const respuesta = await fetch(paginaGuardada(), { cache: "no-store" });
  if (!respuesta.ok) return;
  const html = await respuesta.clone().text();
  await cache.put(paginaGuardada(), respuesta);
  const guardar = async (ruta) => {
    const url = new URL("./" + ruta, alcance()).href;
    const ya = await cache.match(url);
    if (ya) return ya;
    const r = await fetch(url);
    if (r.ok) await cache.put(url, r.clone());
    return r;
  };
  // El programa, los estilos y el ícono de la pantalla de carga.
  const archivos = [...new Set(html.match(/assets\/[A-Za-z0-9_.-]+/g) || [])];
  const bajados = await Promise.all([...archivos, "icon-192.png"].map((a) => guardar(a).catch(() => null)));
  // Las fuentes las nombra la hoja de estilos, no la página.
  for (let i = 0; i < archivos.length; i++) {
    if (!archivos[i].endsWith(".css") || !bajados[i] || !bajados[i].ok) continue;
    const css = await bajados[i].clone().text();
    const fuentes = [...new Set((css.match(/[A-Za-z0-9_.-]+\.woff2/g) || []))];
    await Promise.all(fuentes.map((f) => guardar("assets/" + f).catch(() => null)));
  }
  await limpiar(cache, html);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(guardarCascaron().catch(() => undefined));
});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));


/** Borra los archivos con huella que la página nueva ya no usa. */
async function limpiar(cache, html) {
  const usados = new Set((html.match(/assets\/[A-Za-z0-9_.-]+/g) || []).map((a) => new URL("./" + a, alcance()).href));
  for (const pedido of await cache.keys()) {
    // Solo el programa y los estilos (cambian con cada versión); las fuentes se quedan.
    if (/\/assets\/index-[^/]+\.(js|css)$/.test(pedido.url) && !usados.has(pedido.url)) await cache.delete(pedido);
  }
}

async function pagina(request) {
  const cache = await caches.open(CASCARON);
  const delServidor = fetch(request).then(async (respuesta) => {
    if (respuesta.ok) {
      const copia = respuesta.clone();
      await cache.put(paginaGuardada(), respuesta.clone());
      copia.text().then((html) => limpiar(cache, html)).catch(() => undefined);
    }
    return respuesta;
  });
  const guardada = await cache.match(paginaGuardada());
  if (!guardada) return delServidor;
  const tarde = new Promise((resolve) => setTimeout(() => resolve(null), ESPERA_MS));
  try {
    const respuesta = await Promise.race([delServidor, tarde]);
    // Un 502/503 del proxy mientras el servidor reinicia tampoco sirve: la guardada.
    if (respuesta && respuesta.ok) return respuesta;
  } catch (e) {
    /* sin red: la guardada */
  }
  delServidor.catch(() => undefined);
  return guardada;
}

async function archivo(request) {
  const cache = await caches.open(CASCARON);
  const guardado = await cache.match(request);
  if (guardado) return guardado;
  const respuesta = await fetch(request);
  if (respuesta.ok) await cache.put(request, respuesta.clone());
  return respuesta;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Sin el `#/…` ni el `?…`: en una navegación la dirección los trae, y con
  // ellos la página no se reconocía (la app se quedaba en blanco igual).
  const limpia = url.origin + url.pathname;
  if (url.origin !== self.location.origin || !limpia.startsWith(alcance())) return;
  const dentro = limpia.slice(alcance().length);
  if (request.mode === "navigate" && (dentro === "" || dentro === "index.html")) {
    event.respondWith(pagina(request));
  } else if (/^assets\/[^/]+$/.test(dentro) || /^(icon-192|icon-512|apple-touch-icon)\.png$/.test(dentro)) {
    event.respondWith(archivo(request));
  }
});

self.addEventListener("push", (event) => {
  let aviso = {};
  try {
    aviso = event.data ? event.data.json() : {};
  } catch (e) {
    aviso = { titulo: "Aviso", cuerpo: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(aviso.titulo || "Aviso del bot", {
      body: aviso.cuerpo || "",
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: aviso.etiqueta || undefined,
      data: { ruta: aviso.ruta || "#/avisos" },
    }),
  );
});

/*
 * El toque abre el panel en ese chat.
 *
 * Antes, si la app ya estaba abierta, se le mandaba a NAVEGAR a la dirección
 * nueva (`client.navigate`). En el iPhone eso recarga la app entera justo
 * cuando está volviendo del fondo, y a veces se quedaba cargando hasta cerrarla
 * (Manuel, 23-nov). Ahora se le pasa un mensaje y la app cambia de pantalla
 * ella sola, sin recargar. Solo si no hay ninguna abierta se abre una nueva.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const ruta = (event.notification.data && event.notification.data.ruta) || "#/avisos";
  const destino = new URL("./" + ruta, alcance()).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (ventanas) => {
      const abierta = ventanas.find((v) => v.url.startsWith(alcance()));
      if (!abierta) return self.clients.openWindow(destino);
      abierta.postMessage({ tipo: "abrir-ruta", ruta });
      try {
        await abierta.focus();
      } catch (e) {
        // El iPhone a veces no deja traerla al frente: se abre como nueva.
        return self.clients.openWindow(destino);
      }
    }),
  );
});
