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
      data: { ruta: aviso.ruta || "#/avisos" },
    }),
  );
});

// El toque abre el panel en ese chat; si ya está abierto, lo trae al frente.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
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
