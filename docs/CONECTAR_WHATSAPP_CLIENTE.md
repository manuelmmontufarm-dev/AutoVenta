# Conectar AutoVenta al WhatsApp de un cliente

> Playbook definitivo. Escrito el **1-ago-2026** después de conectar Depot Tire, donde el camino
> equivocado costó una jornada entera. Lee la regla de oro antes de tocar nada.

---

## ⚠️ La regla de oro

**La app de Meta tiene que ser propiedad del portafolio empresarial DEL CLIENTE.**

Si la app vive en tu portafolio y la WABA en el del cliente, Meta lo clasifica como *agency sharing*
y te bloquea de dos formas que no son evidentes:

1. **No puedes darle control total de la app al usuario del sistema.** El toggle "Manage app" sale
   deshabilitado con el mensaje literal: *"Manage task is disabled for agency sharing scenarios."*
2. **Los permisos se quedan en "Ready for testing"** (acceso estándar). El token funciona para
   *leer* la WABA, el número y las suscripciones — todo parece bien — pero **Meta nunca enruta los
   mensajes reales a tu webhook**. El evento de prueba del dashboard sí llega; los mensajes de
   clientes de verdad, no.

Ese segundo punto es el que hace perder el día: el diagnóstico da verde en token, número, webhook,
firma y suscripción, y aun así no entra un solo mensaje.

La salida por acceso avanzado existe (App Review + onboarding como Tech Provider) y es el modelo
correcto para escalar a 50 clientes, pero son días de trámite. **Para poner a un cliente en marcha
hoy, la app va en el portafolio del cliente.**

---

## Lo único que le pides al cliente

Un solo mensaje. Todo lo demás lo haces tú.

> Necesito que me des acceso de administrador al portafolio empresarial. Entra a
> https://business.facebook.com/settings/people → **Agregar** → mi correo → rol **Administrador**.
> Con eso yo hago el resto sin molestarte más, y me lo puedes quitar cuando quieras: la cuenta, el
> número y la WhatsApp Business Account siguen siendo de ustedes.

Detalles que ahorran ida y vuelta:

- El correo tiene que ser **el de tu cuenta de Facebook** (míralo en
  `https://accountscenter.facebook.com/personal_info`), no cualquier correo tuyo.
- **La invitación llega por correo y hay que aceptarla.** Hasta que no pulses el botón, el portafolio
  del cliente no aparece — Meta te redirige en silencio a tu propio portafolio, lo que parece falta
  de permisos y no lo es.
- Si el cliente ya usa la app verde de WhatsApp Business en un celular, **pregunta antes si ese
  número ya está conectado a la Cloud API**. Nunca aceptes un flujo que hable de *migrar* o
  *eliminar el número de la app*: eso deja al local sin WhatsApp. El camino correcto es
  **coexistencia**, donde la app del celular sigue funcionando.

---

## Los 11 pasos, en orden

Todo desde tu computadora, con tu cuenta, una vez aceptada la invitación.

### 1. Crear la app dentro del portafolio del cliente
`https://developers.facebook.com/apps/creation/`

- Nombre: `AutoVenta <Cliente>`
- Caso de uso: **Connect with customers through WhatsApp**
- **Business portfolio: el del cliente** ← el paso que decide todo
- En "Requirements" debe decir *No requirements identified*. Si pide App Review, elegiste el
  portafolio equivocado.

### 2. Completar el alta de WhatsApp
En la app → **Use cases → Connect on WhatsApp → Step 2. Production setup** aparece un panel de
bienvenida con el portafolio preseleccionado → **Continue**. Acepta los términos de WhatsApp
Business y de hosting de Cloud API.

### 3. Privacy policy URL
`App settings → Basic → Privacy policy URL` → la del deploy del cliente, p. ej.
`https://autoventa-<cliente>.up.railway.app/privacy` → **Save Changes**.

Sin esto el botón de publicar sale deshabilitado.

### 4. Publicar la app
`Publish` → **Publish**. El estado pasa de *Unpublished* a *Published*.

> Meta lo avisa en la propia pantalla de webhooks: *"Apps will only be able to receive test webhooks
> sent from the app dashboard while the app is unpublished. No production data will be delivered
> unless the app has been published."* Si te saltas este paso, el evento de prueba llega y los
> mensajes reales no.

### 5. Asignar la app al usuario del sistema
Business Settings del cliente → **Accounts → Apps** → tu app nueva → **Assign people** →
el usuario del sistema → **Full access (Manage app)** → Assign.

Aquí es donde se nota que elegiste bien el portafolio: el toggle "Manage app" está disponible.

*Si el portafolio no tiene usuario del sistema, créalo en Users → System users → Add, rol
**Administrador**. Ojo: un portafolio sin verificar solo admite **1** usuario del sistema Admin.*

### 6. Asignar la WABA al mismo usuario del sistema
Users → System users → el usuario → la cuenta de WhatsApp del cliente con **Full access**.

### 7. Generar el token
Mismo usuario del sistema → **Generate token**:

| Campo | Valor |
|---|---|
| App | la app nueva |
| Token expiration | **Never** ← el default suele ser 60 días |
| Permisos | `whatsapp_business_messaging`, `whatsapp_business_management`, `business_management` |

Meta lo muestra **una sola vez**. Cópialo con el botón, no arrastrando.

### 8. Verificar el token antes de usarlo
`https://developers.facebook.com/tools/debug/accesstoken` → debe decir **Expires: Never**,
**Type: System User**, **Valid: True** y los tres ámbitos. Si algo falla, regenera: no cuesta nada.

### 9. Suscribir la app a la WABA
El paso que más se olvida. Suscribir el campo `messages` en la UI **no** es lo mismo.

```bash
curl -X POST "https://graph.facebook.com/v21.0/<WABA_ID>/subscribed_apps" \
  -H "Authorization: Bearer <TOKEN>"
```

Esperado `{"success": true}`. Compruébalo con el mismo GET sin `-X POST`: la lista debe incluir tu app.

### 10. Webhook
App → **Use cases → Connect on WhatsApp → Step 2 → Configure Webhooks**:

- **Callback URL:** `https://autoventa-<cliente>.up.railway.app/webhook`
- **Verify token:** el que genera el panel del cliente (Ajustes → WhatsApp) — **guárdalo primero en
  el panel**, o la verificación falla
- **Verify and save**, y confirmar que el campo **`messages`** quede *Subscribed*

⚠️ Al editar estos campos se puede activar solo el toggle **"Attach a client certificate"**.
Déjalo apagado.

### 11. Cargar credenciales en el panel del cliente
`https://autoventa-<cliente>.up.railway.app/admin` → **Ajustes → WhatsApp**:

| Campo | De dónde sale |
|---|---|
| Token de acceso permanente | paso 7 |
| Phone Number ID | ver la trampa de abajo |
| Verify token | el generado por el panel |
| App secret | App settings → Basic → **Show** (pide tu contraseña de Facebook) |
| WhatsApp del vendedor | el que recibe las alertas, sin `+` |

Se guarda en la DB y entra en caliente: **sin redeploy**, efectivo en ≤15 s
(ver [channel.ts](../app/src/services/channel.ts)).

---

## Verificación final

No se cierra sin las dos:

1. **Diagnóstico del panel** (botón *Revisar conexión*): los siete pasos en verde, incluido
   **"Mensajes entrando"**.
2. **Mensaje real** desde otro teléfono al número del negocio, y el bot responde.

---

## Trampas que ya nos costaron tiempo

| Trampa | Cómo se ve | Qué hacer |
|---|---|---|
| **App en tu portafolio** | Todo verde pero no entra ni un mensaje real | La app va en el portafolio del cliente (regla de oro) |
| **App sin publicar** | El evento de prueba del dashboard llega; los mensajes reales no | Publish → Published |
| **Phone Number ID equivocado** | *"Meta no reconoce ese Phone Number ID"* | La app nueva viene con un **número de prueba de Meta**. El bueno sale de `GET /<WABA_ID>/phone_numbers` |
| **Falta `subscribed_apps`** | Webhook perfecto, cero mensajes | Paso 9 |
| **Falta el campo `messages`** | *"Meta entregando aquí: falta el campo «messages»"* | Marcarlo en la tabla de webhook fields |
| **Token de 60 días** | El bot se muere sin avisar dos meses después | Expiration = **Never** |
| **Usuario del sistema equivocado** | Error 100/33 `does not exist, cannot be loaded` | El token lleva dentro de qué usuario salió; asignar activos a otro no sirve |
| **Límite de 1 system user Admin** | *"maximum number of admin system user is 1"* | Usa el que ya existe, no crees otro |
| **Otro proveedor conectado** | `subscribed_apps` lista una app ajena (Kommo, etc.) | `DELETE /subscribed_apps` solo borra la tuya. La ajena se quita desde su panel o desde WhatsApp Manager del cliente |
| **Un webhook por app** | Mover la URL a un cliente deja al otro entorno ciego | **Nunca compartas una app entre staging y un cliente** |
| **Pantallas de verificación de Meta** | *"Verification needed… Verify account"* | Las tiene que pasar la persona; piden contraseña o documento |

---

## Comandos de diagnóstico

```bash
# ¿El token ve la WABA y el número?
curl "https://graph.facebook.com/v21.0/<WABA_ID>/phone_numbers?fields=id,display_phone_number,verified_name,status" \
  -H "Authorization: Bearer <TOKEN>"

# ¿Qué apps están suscritas a esta WABA?
curl "https://graph.facebook.com/v21.0/<WABA_ID>/subscribed_apps" -H "Authorization: Bearer <TOKEN>"

# ¿El webhook del cliente responde el handshake?
curl "https://autoventa-<cliente>.up.railway.app/webhook?hub.mode=subscribe&hub.verify_token=<VERIFY>&hub.challenge=12345"
# → 200 y devuelve 12345

# ¿Rechaza lo no firmado? (debe dar 401)
curl -o /dev/null -w "%{http_code}\n" -X POST "https://autoventa-<cliente>.up.railway.app/webhook" \
  -H "Content-Type: application/json" -d '{"object":"whatsapp_business_account","entry":[]}'
```

Si el handshake da 200, el POST sin firma da 401, la suscripción incluye tu app y el campo
`messages` está marcado — y aun así no entra nada — el problema es que **Meta no está enrutando**:
revisa la regla de oro y que la app esté publicada.

---

## Cuándo dejar de usar este playbook

Una app por cliente no escala: son 50 apps, 50 App Secrets y 50 webhooks. El modelo destino es
**una sola app tuya con acceso avanzado**, que enruta por el `phone_number_id` que Meta incluye en
cada payload. Eso exige App Review, onboarding como Tech Provider y un router en el código.
Empieza el trámite cuando entre el tercer cliente, no antes.

Ver [PLAN_CARGA_50_CLIENTES.md](../PLAN_CARGA_50_CLIENTES.md).
