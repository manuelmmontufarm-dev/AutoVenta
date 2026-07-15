# WhatsApp Business — Guía operativa (Cloud API)

> Destilado de la guía oficial **WhatsApp Cloud API — Get Started** de Meta
> (developers.facebook.com), leída el **2026-07-14**.
> Esto es el **cómo hacerlo paso a paso**. Las **decisiones de arquitectura y precios**
> ya están en [PLAN_DESARROLLO.md §2](PLAN_DESARROLLO.md#2-whatsapp-conexión-requisitos-y-detalles-operativos)
> — este archivo no las repite, las aterriza.

---

## 0. Lo esencial en 6 líneas

- Usamos **WhatsApp Cloud API directo de Meta** (no BSP). Ya decidido.
- Meta te da **GRATIS** un **número de prueba (test number)** dentro del dashboard.
  **No se "descarga" ningún sandbox** — aparece solo al crear la app. Con eso se desarrolla toda la Fase 1.
- El número real del negocio **no se toca** hasta el final (Fase 3, vía coexistence).
- El token que da el dashboard es **temporal (24 h)** → sirve para el primer test; para
  desarrollo se genera un **token permanente de System User**.
- Se necesita un **webhook** (endpoint HTTPS) para **recibir** mensajes. Para enviar basta un `curl`.
- La "ventana de servicio" de 24 h se abre cuando **el cliente escribe/responde**; dentro de
  ella, mandar texto/PDF/imagen es **gratis**.

---

## 1. IDs y credenciales que hay que guardar (glosario)

Al hacer el setup, Meta te va soltando estos valores. Anótalos todos — se usan en cada llamada:

| Valor | Qué es | De dónde sale | Dónde se usa |
|---|---|---|---|
| **App ID** | ID de la app de Meta | App Dashboard al crear la app | Config general |
| **WhatsApp Business Account ID** (WABA ID) | La cuenta de negocio de WhatsApp | API Setup, tras conectar la WABA | Gestión de templates, gestión de números |
| **Phone Number ID** (`PHONE_NUMBER_ID`) | ID **interno** del número (≠ el número telefónico) | API Setup, dropdown "From" | En la **URL** de cada envío: `POST /{PHONE_NUMBER_ID}/messages` |
| **Token temporal (24 h)** | Access token de prueba | Botón "Generate access token" | Solo el primer test manual |
| **Token permanente (System User)** | Access token que no expira solo | Business Settings → System users → Generate token | `Authorization: Bearer <token>` en TODO |
| **Verify token** (lo inventas tú) | String secreto para validar el webhook | Lo defines tú al configurar el webhook | Handshake inicial del webhook con Meta |

> ⚠️ Nunca commitear tokens. Van en variables de entorno de Railway (`.env` local en `.gitignore`).

---

## 2. Los 7 pasos del Get Started, mapeados a AutoVenta

### Paso 1 — Crear la app de Meta con el caso de uso WhatsApp
- [App Dashboard](https://developers.facebook.com/apps) → **Create App** → nombre + email.
- Caso de uso: **"Connect with customers through WhatsApp"**.
- Seleccionar/crear un **Business Portfolio** (portafolio de negocio).
- Al terminar caes en **Quickstart → Connect on WhatsApp**.
- 📌 Para AutoVenta: crear la app bajo el portafolio del negocio (o uno propio para desarrollo).

### Paso 2 — Empezar a usar la API (conectar la WABA)
- Botón **"Start using the API"** → página **API Setup**.
- Conectar la app a una **WhatsApp Business Account** (existente o nueva).
- Guardar el **WABA ID** que aparece.
- 📌 Si al crear el portafolio se creó una WABA automática, **verificar** que quedó conectada.

### Paso 3 — Enviar y recibir el primer mensaje (test number)
- **Generate access token** (temporal, 24 h).
- **From**: el número de prueba de Meta (o agregar uno). **To**: tu WhatsApp personal (destinatario verificado).
- **Send message** → llega la plantilla `hello_world`.
- **Responde** desde tu WhatsApp → esto **abre la ventana de servicio de 24 h**.
- Guardar **`PHONE_NUMBER_ID`** y **WABA ID**.
- 📌 El test number permite hasta **5 destinatarios verificados** (yo + dueño + vendedor + 2). Suficiente para toda la Fase 1.

### Paso 4 — Webhook de prueba (recibir notificaciones)
- Sin webhook **no recibes** mensajes entrantes (ni estados delivered/read).
- Meta ofrece un **echo bot / sample webhook server** para probar rápido
  ([guía "Using a test webhook app"](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/set-up-whatsapp-echo-bot)).
- El payload que llega tiene esta forma (lo que vamos a parsear en producción):

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "display_phone_number": "...", "phone_number_id": "..." },
        "contacts": [{ "profile": { "name": "..." }, "wa_id": "..." }],
        "messages": [{
          "from": "1786...",
          "id": "wamid.HBg...",          // ← idempotencia: dedup por este id
          "timestamp": "1758254144",
          "text": { "body": "Hi!" },
          "type": "text"                  // text | image | location | document | ...
        }]
      },
      "field": "messages"
    }]
  }]
}
```

- 📌 Nuestro webhook real (Express en Railway) hace: **verify token** en el GET inicial →
  responder **200 de inmediato** → dedup por `messages[].id` → encolar → debounce.
  (Detalle en [PLAN_DESARROLLO.md §3.3](PLAN_DESARROLLO.md#33-debounce-colas-idempotencia-el-trabajo-real).)

### Paso 5 — Token permanente de System User
- [Business Settings](https://business.facebook.com/latest/settings) → **System users** → **Add**.
- Asignar activos al system user (**Assign Assets**):
  - La **app** → Manage app (control total).
  - La **WABA** → Manage WhatsApp Business accounts (control total).
- **Generate token** con estos permisos:
  - `business_management`
  - `whatsapp_business_messaging`
  - `whatsapp_business_management`
- Copiar y guardar seguro. 📌 Este token **reemplaza** al de 24 h para todo el desarrollo.
- ⚠️ Se invalida ante cambios de seguridad de Meta → nuestro código maneja **401 con alerta**.

### Paso 6 — Enviar un mensaje NO-template (dentro de la ventana de 24 h)
Al haber respondido en el Paso 3, la **ventana de servicio** está abierta → se puede mandar texto libre:

```bash
curl 'https://graph.facebook.com/v23.0/<PHONE_NUMBER_ID>/messages' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <SYSTEM_USER_TOKEN>' \
  -d '{
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": "<TU_NUMERO>",
    "type": "text",
    "text": { "body": "Hello!" }
  }'
```

- 📌 **Este es exactamente el patrón que usa el bot** para todas sus respuestas (cotización, preguntas, etc.):
  el cliente escribe → ventana abierta → respondemos con `type: text` / `type: document` (PDF) **gratis**.
- Versión de Graph API: **`v23.0`** hoy. Va **parametrizada en config** (Meta saca ~3 versiones/año, expiran ~cada 2 años).

### Paso 7 — Fin / avanzar
Enviar + webhooks = los dos bloques base. Lo demás (templates, grupos, llamadas) es adicional.

---

## 3. Conceptos clave que hay que tener claros

### Ventana de servicio (customer service window) de 24 h
- Se **abre/renueva** cada vez que el cliente te escribe.
- Dentro de ella: mensajes **libres (no-template)** de cualquier tipo, **gratis e ilimitados**.
- Fuera de ella: solo puedes iniciar con un **template aprobado** (y pagas).
- 📌 El bot de ventas es ~100% reactivo → vive casi siempre **dentro** de la ventana → **canal ≈ $0**.

### Mensaje template vs. no-template
- **Template**: pre-aprobado por Meta. Necesario **fuera** de la ventana (ej. alertar al vendedor, reabrir cotización).
- **No-template (free-form)**: texto/PDF/imagen/botones libres **dentro** de la ventana.
- Templates que vamos a necesitar (~3): alerta vendedor (utility), reapertura de cotización, confirmación de pedido.

### Tipos de mensaje relevantes para AutoVenta
| Tipo | Uso en el bot |
|---|---|
| `text` | Conversación, preguntas, respuestas |
| `document` | **Enviar el PDF de cotización** (`media_id` + `filename`) |
| `image` | Enviar foto del producto (Fase 1/2) |
| `location` | Recibir ubicación del cliente → local más cercano |
| `interactive` | Botones (ej. pedir ubicación con `location_request_message`) |

### Media (para el PDF y las fotos)
- **Enviar**: `POST /{PHONE_NUMBER_ID}/media` sube el archivo → devuelve `media_id` → mensaje `type: document`.
- **Recibir foto**: webhook trae `media_id` → `GET /{MEDIA_ID}` da una URL **válida solo 5 minutos**
  → hay que **descargarla al instante** con el Bearer token. (Detalle en [PLAN_DESARROLLO.md §2.3](PLAN_DESARROLLO.md#23-media-y-ubicación).)

---

## 4. Sample app / Echo bot (lo "descargable")

Hay dos cosas descargables — **ninguna es un sandbox de cuenta**, son **código de ejemplo**:

1. **Jasper's Market sample app** — app de demo completa con todos los mensajes/código del demo de Meta.
   Útil para **ver cómo se estructura** una app que envía y maneja datos de la Cloud API. Referencia, no base.
2. **Echo webhook server** (Paso 4) — servidor de webhook de ejemplo para **probar recepción** rápido,
   sin montar todo nuestro Express todavía.

📌 Para AutoVenta: el **echo bot** sí vale la pena para el primer test de webhook. La **Jasper's Market app**
es solo para ojearla — nuestro stack (Express + `@anthropic-ai/sdk` tool runner) ya está decidido y es más simple.

---

## 5. ¿Qué NO cubre esta guía (y ya resolvimos aparte)?

- **Precios por región** → [PLAN_DESARROLLO.md §2.2](PLAN_DESARROLLO.md#22-precios-vigentes-ecuador--rest-of-latin-america) (Ecuador = "Rest of Latin America", servicio gratis).
- **Coexistence** (app + API en el mismo número real) → [PLAN_DESARROLLO.md §2.1](PLAN_DESARROLLO.md#21-setup-meta-directo-sin-bsp), es la ruta para el número del negocio en Fase 3.
- **Verificación del negocio** (RUC + factura, 2–5 días) → arrancar **en paralelo**, [PLAN_DESARROLLO.md §9 Fase 0](PLAN_DESARROLLO.md#fase-0--preparación-46-h--en-paralelo-con-todo).
- **Firma del webhook / seguridad** → validar `X-Hub-Signature-256`, va en la implementación de Fase 1.

---

## 6. Enlaces

- Get Started (esta guía): https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started
- Echo bot / test webhook: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/set-up-whatsapp-echo-bot
- Send messages (tipos): https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages
- Templates: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview
- Business Settings (System users): https://business.facebook.com/latest/settings
- App Dashboard: https://developers.facebook.com/apps
