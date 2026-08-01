# Pendientes

> Cosas abiertas, con dueño y con el porqué. Se borran cuando se hacen, no se acumulan.
> Última revisión: **1-ago-2026**.

---

## 🔴 Seguridad — hacer pronto

### Rotar los tokens expuestos
Durante la conexión de Depot Tire (31-jul/1-ago) se pegaron **tres tokens completos** en un chat de
asistente, y el App Secret de la app `AutoVenta` (Acesso) quedó visible en pantalla:

| Credencial | Estado |
|---|---|
| Token del system user "Employee" (Acesso) | expuesto — **revocar**, no se usa |
| Token de `AutoVentas Bot` para la app `AutoVenta` | expuesto — **revocar**, ya no se usa |
| Token de `AutoVentas Bot` para `AutoVenta Depot Tire` | expuesto — **rotar**, es el que está en producción |
| App Secret de `AutoVenta` (Acesso) | visto en pantalla — evaluar reset |

Rotar el de producción: generar uno nuevo desde `AutoVentas Bot` (caducidad **Never**, los tres
permisos), pegarlo en el panel de Depot, y **después** revocar el viejo. El panel lo toma en ≤15 s
sin redeploy, así que la ventana de corte es de segundos.

⚠️ **No resetear el App Secret** sin coordinarlo: invalida el token al instante y hay que
actualizarlo en el panel en la misma maniobra.

### Verify token débil
El verify token de Depot es `autoventa2026`, adivinable y escrito en varios documentos. El impacto
es bajo (solo gobierna el handshake inicial; la protección real es la firma con el App Secret), pero
conviene generar uno aleatorio desde el panel y actualizarlo en Meta en la misma pasada.

### Token y App Secret en claro en la base
`channel_config` guarda token y App Secret **en texto plano** en la tabla `settings`. Cualquiera con
el `DATABASE_URL` los lee, y los respaldos de [OPERACION.md](OPERACION.md) los llevan dentro del
`.dump`. Aceptable con un cliente; inaceptable con los 50 de
[PLAN_CARGA_50_CLIENTES.md](../PLAN_CARGA_50_CLIENTES.md). Cifrar con una clave de entorno es un
cambio acotado en [channel.ts](../app/src/services/channel.ts).

---

## 🟡 Depot Tire — cerrar la puesta en marcha

### Kommo sigue suscrito a la WABA de Depot
`GET /970823328872837/subscribed_apps` devuelve **Kommo** (app `1022173854571346`) además de la
nuestra. Recibe copia de cada mensaje entrante de Depot. No duplicó respuestas en las pruebas, así
que parece inactivo, pero es un tercero leyendo las conversaciones del cliente.

No se puede quitar con nuestro token: `DELETE /subscribed_apps` solo borra la app dueña del token.
Sale del panel de Kommo del cliente, o desde WhatsApp Manager de DepotTire. **Dueño: Andrés
(cliente).** Preguntar además quién creó esa cuenta y si hay un proveedor anterior de por medio.

### Devolver el webhook de la app `AutoVenta` a staging
Durante el diagnóstico se movió el callback de la app de Acesso a la URL de Depot. Depot ya usa su
propia app, así que hay que devolverlo:

`developers.facebook.com/apps/1053180323906811` → WhatsApp → Configuración → Webhooks →
`https://autoventa-staging.up.railway.app/webhook`

Mientras no se haga, **staging no recibe mensajes entrantes**.

### Método de pago en la cuenta de WhatsApp de Depot
Sin él no se pueden enviar plantillas (mensajes iniciados por el negocio). Responder dentro de la
ventana de 24 h es gratis y ya funciona, así que no bloquea el piloto — bloquea seguimientos y
reaperturas fuera de ventana.

### Confirmar que la app verde del local sigue viva
El número entró por **coexistencia** (la WABA figura como "App de WhatsApp Business" y WhatsApp
mostró el aviso de *"secure service from Meta"*), así que en principio está bien. Confirmarlo con
Andrés después de unos días de uso real, no solo el día del alta.

---

## 🟢 Producto — decisiones tomadas, sin trabajo pendiente inmediato

### Historial de conversaciones: NO se importa
Decidido el 1-ago-2026: el bot arranca **solo con los mensajes de aquí en adelante**.

**Por qué:** importar una semana de historial mete conversaciones con fecha vieja en `messages`, y
el worker de seguimientos las trataría como leads sin atender — el bot le escribiría a clientes ya
atendidos o reabriría cotizaciones cerradas. Además la mayoría tiene la ventana de 24 h cerrada, así
que entrarían al pipeline como tarjetas muertas. Y la asimetría manda: agregar historial después es
fácil, deshacer un import que ya disparó seguimientos no.

**Si más adelante se quiere:** importarlo como **contexto de solo lectura** para el vendedor, sin
crear tarjetas en el pipeline ni armar `follow_up_jobs`. Eso es trabajo de código, no un toggle.

---

## 🔵 Arquitectura — antes del tercer cliente

### Una app por cliente no escala
Hoy cada cliente necesita su propia app de Meta dentro de su portafolio (ver
[CONECTAR_WHATSAPP_CLIENTE.md](CONECTAR_WHATSAPP_CLIENTE.md)). A 50 clientes eso son 50 apps, 50 App
Secrets y 50 webhooks.

El modelo destino es **una sola app con acceso avanzado** que enruta por el `phone_number_id` que
Meta manda en cada payload. Requiere:

1. Verificación del negocio del portafolio propio (Acesso aparece **sin verificar**; DepotTire sí lo está).
2. **App Review** para `whatsapp_business_messaging` y `whatsapp_business_management` — hoy están en
   *"Ready for testing"* (acceso estándar).
3. Onboarding como **Tech Provider** para poder usar Embedded Signup.
4. Un router en el webhook que despache por `phone_number_id` al cliente correcto.

Los tres primeros son trámite con Meta y tardan días: **arrancarlos con tiempo**, no cuando haga falta.

### `ADMIN_KEY` y `ADMIN_PANEL_ORIGIN` en cada deploy nuevo
Sin `ADMIN_KEY` y con `NODE_ENV=production`, la API del panel responde 503 a propósito
([admin.ts](../app/src/server/admin.ts)). `ADMIN_PANEL_ORIGIN` viene con `*` por defecto; apuntarlo
al panel central.

---

## Referencia rápida — Depot Tire

| Dato | Valor |
|---|---|
| Portafolio cliente | DepotTire · `1557731072531358` · verificado |
| Portafolio propio | Acesso · `4483301648607233` · **sin verificar** |
| App de producción | AutoVenta Depot Tire · `1351729383802913` · en DepotTire · **Published** |
| App de staging | AutoVenta · `1053180323906811` · en Acesso |
| WABA | DEPOT TIRE · `970823328872837` |
| Número | +593 98 280 1766 · Phone Number ID `1177218982136150` · calidad GREEN |
| Usuario del sistema | AutoVentas Bot · `61592642284020` · Admin en DepotTire |
| Panel | https://autoventa-depottire.up.railway.app/admin |
| Webhook | https://autoventa-depottire.up.railway.app/webhook |
