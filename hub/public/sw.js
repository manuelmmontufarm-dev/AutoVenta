/*
 * Service worker del panel — SOLO para las notificaciones de la app del
 * teléfono (22-nov-2026). No guarda nada en caché: el panel se sirve siempre
 * fresco del servidor, como antes.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
      data: { ruta: aviso.ruta || "#/avisos", whatsapp: enlaceWhatsApp(aviso.telefono) },
      // Android muestra el botón; el iPhone lo ignora y el toque abre el chat del panel.
      actions: enlaceWhatsApp(aviso.telefono) ? [{ action: "whatsapp", title: "WhatsApp" }] : [],
    }),
  );
});

/** Mismo criterio que `hub/src/lib/whatsapp.ts` (el service worker no importa módulos). */
function enlaceWhatsApp(telefono) {
  const d = String(telefono || "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(d)) return "https://wa.me/593" + d.slice(1);
  if (/^9\d{8}$/.test(d)) return "https://wa.me/593" + d;
  if (d.length >= 11 && d.length <= 15 && !d.startsWith("0")) return "https://wa.me/" + d;
  return null;
}

// El toque abre el panel en ese chat; si ya está abierto, lo trae al frente.
// El botón «WhatsApp» (Android) abre el chat con el cliente en WhatsApp.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const whatsapp = event.notification.data && event.notification.data.whatsapp;
  if (event.action === "whatsapp" && whatsapp) {
    event.waitUntil(self.clients.openWindow(whatsapp));
    return;
  }
  const ruta = (event.notification.data && event.notification.data.ruta) || "#/avisos";
  const destino = new URL("./" + ruta, self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (v.url.startsWith(self.registration.scope)) {
          v.navigate(destino);
          return v.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
