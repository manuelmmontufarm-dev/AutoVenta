# Conectar el WhatsApp de un cliente nuevo (que todavía no tiene API)

> **Guía completa, en orden:** [cliente-nuevo/README.md](cliente-nuevo/README.md). Este archivo es
> el detalle del paso 7 (Meta y WhatsApp).

> **Receta probada de punta a punta con Competimotor (11 → 17 nov 2026): el bot contestó el 17-nov.**
> Este archivo cubre lo que [CONECTAR_WHATSAPP_CLIENTE.md](CONECTAR_WHATSAPP_CLIENTE.md) da por hecho:
> que exista una cuenta de WhatsApp API con el número del cliente.
> Bitácora del caso real, con fechas e IDs: [clientes/mundillantas-meta.md](clientes/mundillantas-meta.md).
> Para dejar de depender de Kommo: [TECH_PROVIDER.md](TECH_PROVIDER.md).

---

## ✅ LA RECETA QUE FUNCIONÓ (seguir esto; lo demás es referencia)

**Idea:** nosotros no podemos crear la cuenta de WhatsApp del cliente por coexistencia (hace falta ser
Tech Provider). **Kommo sí puede**, y su prueba gratis alcanza. Kommo crea la cuenta dentro del
portafolio del cliente; después le colgamos nuestra app, igual que en Depot.

| # | Paso | Quién | Tiempo | Detalle |
|---|---|---|---|---|
| 1 | Pedir al cliente, en un solo mensaje: admin del portafolio para Manuel, certificado del RUC, **foto de un ID vigente** de un socio, qué número va al bot | Manuel | 5 min + espera | Fase 0 |
| 2 | Aceptar la invitación con el Facebook de Manuel | Manuel | 5 min | Fase 1 |
| 3 | Crear la app `AutoVenta <Cliente>` en el portafolio del cliente, URL de privacidad, publicar, usuario del sistema con la app | Claude (Manuel aprueba términos) | 1 h | Fase 2 |
| 4 | Verificar el negocio en Meta | Claude llena · Manuel: CAPTCHA + subir el ID | 20 min + 1–2 días de Meta | Fase 4 |
| 5 | Crear la cuenta de prueba en Kommo con el correo del cliente | Manuel | 5 min | «Kommo» abajo |
| 6 | Videollamada con quien tiene el celular: Kommo → Connect my WhatsApp → WhatsApp Business app → **Facebook personal de Manuel** → número → portafolio del cliente → escanear QR | Manuel + el del celular | 15 min | «Kommo» abajo |
| 7 | Comprobar: el celular sigue con sus chats · Kommo dice Connected · en Meta la cuenta dice «WhatsApp Business App» y «Owned by <cliente>» | Claude + Manuel | 2 min | |
| 8 | Asignar al usuario del sistema **los dos activos**: «WhatsApp accounts» y «Messaging accounts → Linked accounts» | Claude | 5 min | Fase 6 |
| 9 | Generar el token (Never) y pegarlo en el panel con el App secret | Manuel | 5 min | Fase 6 |
| 10 | Verificar el webhook en Meta con el verify token del panel | Manuel o Claude | 2 min | Fase 6 |
| 11 | Suscribir la app a la cuenta (`suscribir-waba.sh`) y dejar solo los campos `messages` y `smb_message_echoes` | Claude | 5 min | Fase 6 |
| 12 | Diagnóstico del panel 8 de 8 + mensaje real con el bot apagado | Claude + Manuel | 5 min | Fase 6 |
| 13 | `OPENAI_API_KEY` propia en Railway (ambiente **Depot_Tire** → servicio del cliente) y **Deploy** | Manuel | 5 min | Fase 6 |
| 14 | Probar solo con el número de Manuel: `BOT_APAGADO_EXCEPTO=<su número>` | Claude | 3 min | Fase 6 |
| 15 | Encender el bot desde Ajustes cuando Manuel lo decida | Manuel | 1 min | |

**Tiempo real con el cliente presente:** una videollamada de 15 minutos (paso 6). Todo lo demás es
entre Manuel y Claude. **Costo hasta aquí: $0** (prueba de Kommo sin tarjeta).

**No se usó** nuestro Embedded Signup (Fases 3 y 5): queda para cuando seamos Tech Provider.

**Sin probar:** si el paso 4 (verificar el negocio) hace falta para el camino de Kommo — en
Competimotor ya estaba verificado cuando conectamos; y qué pasa con la cuenta cuando vence la prueba
de Kommo (Competimotor: ~1-dic-2026).

---

## Fase 0 — Lo que se le pide al cliente EL PRIMER DÍA (un solo mensaje)

Pedir todo junto. En Mundillantas lo pedimos por partes y perdimos días.

1. **Acceso de administrador al portafolio** (Business Manager) para el correo del Facebook de Manuel
   (`manuelmmontufarm@gmail.com`). Ver Fase 1.
2. **Certificado del RUC** del SRI (PDF). Da la **razón social exacta**, el RUC y la dirección.
3. **Foto del documento de identidad VIGENTE** de un socio / representante que salga en el RUC o en
   los registros públicos. **Que esté vigente y que sea foto con el celular**, no escaneo:
   - ❌ La cédula de Jenny estaba **vencida (2022)** y era un **escaneo de CamScanner** → Meta la
     **rechazó** («There's a problem with the ID you submitted. Try submitting a different ID»).
   - ✅ Pasaporte vigente (hasta 2036), foto del celular → el que se usó en el reintento.
4. **Qué número va al bot** y **quién tiene ese celular en la mano** el día de conectar.
5. Teléfono y web públicos del negocio (si no hay web: beacons.ai / linktree / página de FB sirven,
   tiene que abrir con **https**).

Mensaje modelo (sin «¿»/«¡» de apertura, corto):

> Para conectar el WhatsApp al bot Meta pide verificar la empresa, es normal con todos. Necesito:
> el certificado del RUC, una foto con el celular de la cédula vigente de quien sale como socio
> (los dos lados, sin reflejo), y que me agreguen como administrador en su Business de Facebook.
> Con eso yo hago el resto.

**Por qué Meta pide esto** (para explicarle al cliente): Meta verifica que el negocio es real antes
de dejar que una app automática mande WhatsApp en su nombre. No toca su cuenta ni su WhatsApp; solo
certifica la empresa.

---

## Fase 1 — Acceso al portafolio

1. El cliente invita a Manuel: `https://business.facebook.com/settings/people` → **Agregar** →
   correo del Facebook de Manuel → **Acceso total / Administrador**.
2. **Manuel acepta la invitación desde el correo, con SU Facebook.** Si el navegador está con la
   sesión del cliente, sale «ya formas parte» y no sirve: hay que aceptarla desde el perfil propio.
3. Comprobar en Personas que figure «Manuel Montufar (you)» con acceso total.

Trampas:
- **Cuenta publicitaria fuera del portafolio** (de un perfil personal): desde el portafolio no se
  puede dar acceso. Se da desde el perfil dueño (Roles), y solo a **amigos de Facebook** de ese
  perfil. **No “moverla” al portafolio**: es irreversible. No hace falta para WhatsApp.
- **WhatsApp Manager da «Sorry, something went wrong»** = el portafolio no tiene WABA todavía. Normal.
- Si hay **dos navegadores de Chrome** conectados, hay que elegir el de Manuel antes de cada tanda
  (`select_browser`): el otro puede estar con la sesión del cliente.

---

## Fase 2 — App, privacidad, publicar, usuario del sistema

Pasos 1–5 de [CONECTAR_WHATSAPP_CLIENTE.md](CONECTAR_WHATSAPP_CLIENTE.md), con estas diferencias:

1. **Crear la app** `AutoVenta <Cliente>` en `developers.facebook.com/apps/creation/`, caso de uso
   **Connect with customers through WhatsApp**, **portafolio = el del cliente**.
   - Hay que aceptar **Meta Platform Terms** → pide OK explícito de Manuel.
2. **Use cases → WhatsApp → Production setup → Continue**: acepta términos de WhatsApp Business y
   Cloud API (OK de Manuel).
   - ⚠️ **NUNCA usar «Add phone number» del panel.** Registra el número por SMS y **lo saca de la
     app de WhatsApp Business del celular** (el local se queda sin WhatsApp). El número real entra
     solo por Embedded Signup con coexistencia (Fase 5).
3. **Privacy policy URL**: `https://<servicio>.up.railway.app/privacy`. Desde el PR #44 la página
   toma el nombre y teléfono del negocio de la instancia (`NEGOCIO=...`), así que **no dice Depot**.
   Comprobar que diga el nombre del cliente antes de guardarla.
   App domain: `<servicio>.up.railway.app`.
4. **Publish** → *Published*.
5. **Usuario del sistema**: Users → System users → Add.
   - Primero pide aceptar la **política de no discriminación de anuncios** (OK de Manuel).
   - Si sale «The Admin System User must be at least 7 days old…», crearlo como **Employee**: alcanza
     (el token sale de los activos asignados). El alta de WhatsApp ya crea un Admin oculto.
   - Asignarle la app con **Manage app**.
   - La WABA todavía no existe (solo «Test WhatsApp Account»): se asigna después de la Fase 5.

---

## Fase 3 — Embedded Signup propio (solo cuando seamos Tech Provider)

La página vive en el código: `app/site/alta-whatsapp.html` (PR #44). No hay que programar nada.

1. En la app: **Facebook Login for Business → Configurations → Create from template** →
   plantilla de **WhatsApp Embedded Signup**. Anotar el **config ID**.
   (La plantilla trae token de 60 días; no importa, el bot usa el token del usuario del sistema.)
2. El enlace queda:
   `https://<servicio>.up.railway.app/alta-whatsapp?app=<APP_ID>&config=<CONFIG_ID>`
3. La página abre el login de Meta con `featureType: whatsapp_business_app_onboarding` (=
   **coexistencia**: el número sigue funcionando en la app del celular) y, al terminar, muestra el
   **WABA ID** y el **Phone Number ID**. Nunca muestra el código.

**Si el portafolio no está verificado, Meta corta aquí** con
*«<Negocio> can't onboard customers right now»*. Publicar la app no lo arregla. → Fase 4.

Mundillantas: app `1446270733685984`, config `1525450712751173`.

---

## Fase 4 — Verificación del negocio (paso a paso, tal como sale)

**Dónde:** `https://business.facebook.com/latest/settings/security_center?business_id=<ID>` →
**Business Verification** → caso de uso «App requires access to permissions on Meta for Developers»
→ **Start verification** → **Get started**.

| # | Pantalla | Qué poner | Notas |
|---|---|---|---|
| 1 | Select a country | Ecuador | |
| 2 | Select your business type | **Private Company** | Una S.A. o S.A.S. que no cotiza en bolsa. *Corporation* es solo para empresas listadas |
| 3 | Business details | **Razón social EXACTA del RUC** (`COMPETIMOTOR S.A.`) + nombre comercial opcional | Copiar letra por letra del certificado |
| 4 | Address | Calle e intersección, referencia en la línea 2, ciudad, provincia, **código postal** | El RUC no trae código postal; usamos `230101` (Santo Domingo). Obligatorio |
| 5 | Contact information | Teléfono (+593, sin el 0) + web **https** | El teléfono debe poder recibir un código. Usamos el del bot |
| 6 | **CAPTCHA** «I'm not a robot» | **Lo hace Manuel** | Claude no resuelve CAPTCHAs. Sale **en cada intento** |
| 7 | Select your business | Elegir el registro público que **coincide con la dirección del RUC** | Meta buscó y encontró 2 registros de Competimotor; uno con la dirección exacta. Si no aparece: «My business isn't listed» → ahí sí se sube el certificado del RUC |
| 8 | Review details | Revisar y Next | |
| 9 | Confirm your connection | **Identity verification** (fue la única opción) | No ofreció código por teléfono ni correo |
| 9b | Choose the identity you want to verify | El principal dueño del documento | Salió en el 2.º intento. Jenny aparecía 2 veces (`J*** M P** ALV****` y `P** A****** J**** Mar****`); se eligió la que coincide con el orden del pasaporte (apellidos primero) |
| 9c | Choose type of ID to upload | Passport / National ID / Driver's license… | Elegir el que de verdad se sube |
| 10 | Upload a photo of your ID | **Manuel sube la foto** del documento | Claude prepara el archivo, no lo sube |
| 11 | Submit | Manuel | «Identity confirmation in progress… within 48 hours» |

Estado después: **In review** («about 2 business days»). Mundillantas: 1.er intento (cédula vencida) rechazado en ~1 día; 2.º intento (pasaporte vigente) enviado el 16-nov a las 23:00 y **«Verified» antes de las 00:40 del 17-nov** + correo de Meta. Resultado llega como notificación y en la
misma tarjeta («Couldn't be verified» → **Learn more** dice el motivo).

### Requisitos de la foto del documento (los aprendimos a golpes)

| Error de Meta | Causa | Arreglo |
|---|---|---|
| «This file type can't be accepted» | Era PDF | Convertir a **JPG** |
| «Your photo has too much blank space» | Hoja A4 con 3 documentos | **Recortar** para que el documento ocupe casi toda la foto |
| «Your photo must be at least 1500 x 1000 pixels» | Recorte chico | Renderizar a 600 dpi o ampliar: mínimo **1500×1000** |
| «There's a problem with the ID you submitted» (rechazo tras 1 día) | **Documento vencido** (y escaneo) | Documento **vigente**, foto con celular |

Comandos que se usaron (ImageMagick + poppler):

```bash
# PDF → imagen a 600 dpi
pdftoppm -png -r 600 "cedula.pdf" /tmp/ced
# recortar el documento (ajustar WxH+X+Y mirando una miniatura)
magick /tmp/ced-1.png -crop 2000x1440+1170+210 +repage -quality 95 ~/Downloads/ID_frente.jpg
# foto chica (p. ej. 1600x900 de WhatsApp) → recortar y ampliar a ≥1500x1000
magick foto.webp -crop 1140x780+100+85 +repage -filter Lanczos -resize 1800x -unsharp 0x0.8 -quality 95 ~/Downloads/ID.jpg
magick identify ~/Downloads/ID.jpg   # comprobar el tamaño
```

Borrar las copias del documento cuando Meta apruebe.

### El reintento empieza de cero

Tras un rechazo: tarjeta → **Learn more → Continue → Get started** y se repite **todo** (país,
tipo, datos, CAPTCHA, selección del registro, documento). Meta deja prellenado nombre, calle,
ciudad, teléfono y web, pero **borra provincia y código postal**: volver a ponerlos.

### No cambiar de registro a mitad de camino

En el reintento el clic cayó en el **segundo** registro («COMPETIMOTOR SA», Vía Quevedo 834, con
correo `com…@gmail.com`). Ese ofrece **Email** como forma de confirmar, pero **no sirve con Gmail**:
pide que el dominio del correo coincida con el de la web. Al volver atrás y elegir el primero,
Meta respondió «There was a problem saving your changes. Please wait a few minutes and try again»
y siguió fallando a los 30 s y a los 15 min. **Mirar el zoom antes de pulsar Next** y elegir una sola vez.

**Cómo se destrabó:** cerrar el asistente (X → «Yes, exit»), recargar Security Center. La tarjeta
dice **«Pending submission» → Continue**: guarda el avance, pero vuelve a pedir todo desde el país
(sin CAPTCHA esta vez). Con el registro bien elegido de una pasó.

### Sobre la persona del documento

En la pantalla 7 Meta muestra los **principals** enmascarados (`J*** M P** ALV****`). El documento
tiene que ser de uno de ellos. En Mundillantas: Jenny Marisol Paz Álvarez era la única del registro
elegido. La sube Manuel desde su cuenta: no hace falta que el socio entre a Facebook.

---

## Fase 5 — Conectar el número con nuestro enlace (solo cuando seamos Tech Provider)

1. Coordinar con quien tiene el celular del número del bot (en la mano, con WhatsApp Business abierto).
2. Abrir el enlace de la Fase 3 desde la compu de Manuel → iniciar sesión → elegir el portafolio →
   **conectar la app de WhatsApp Business existente** (coexistencia) → el celular muestra un QR/aviso
   y se acepta **en el celular**.
3. La página muestra **WABA ID** y **Phone Number ID**. Anotarlos.
4. ⚠️ **Verificar el negocio NO alcanza.** En Mundillantas, ya «Verified», el popup siguió diciendo
   «can't onboard customers right now». El dashboard de la app pide **«Become a Tech Provider»**
   (App Review de `whatsapp_business_messaging` y `whatsapp_business_management`). Embedded Signup /
   coexistencia solo funciona para Tech Providers. **Empezar el trámite de Tech Provider el día 1,
   en paralelo con la verificación.** (17-nov-2026; resultado pendiente.)

## Fase 6 — Token, webhook, panel (tal como se hizo en Competimotor)

1. **Asignar la cuenta al usuario del sistema** (Business Settings → System users → el usuario →
   ··· → Assign assets). Hay que asignar **dos** cosas, con «Everything»:
   - **WhatsApp accounts** → la cuenta nueva (en la lista sale como **«unknown»**).
   - **Messaging accounts → Linked accounts** → la cuenta con el nombre del cliente.
   Sin la segunda, la API responde error 100/33 «does not exist… missing permissions».
2. **Los IDs** (trampa): en Business Settings hay dos pantallas y dos IDs distintos.
   - *Messaging accounts* → ID de la **WABA**, el que usa la API (Competimotor: `847835534545450`).
   - *WhatsApp accounts* → ID del número como activo (`1179011657978614`). La API lo rechaza con
     «This API is not supported for this WhatsApp Business Account».
   - **Phone Number ID**: WhatsApp Manager → Phone numbers → engranaje del número (`834221969785099`).
3. **Token** (Manuel): System users → Generate token → app del cliente → **Never** → permisos
   `whatsapp_business_messaging`, `whatsapp_business_management`, `business_management`.
4. **Panel** (`https://<servicio>.up.railway.app/admin` → chip «Conectado» → Conexión de WhatsApp):
   pegar token y App secret (App settings → Basic → Show). El panel solo vuelve a mostrar «ya
   guardado». El Phone Number ID, el WhatsApp del vendedor y el verify token se pueden dejar puestos
   antes en `settings.channel_config`.
5. **Webhook** (app → Use cases → Connect on WhatsApp → Step 2. Production setup → Configure
   Webhooks): Callback `https://<servicio>.up.railway.app/webhook` + verify token del panel →
   **Verify and save**. Solo funciona **después** del paso 4: sin token y App secret el webhook da 503.
6. **Suscribir la app a la cuenta:**
   `app/scripts/meta/suscribir-waba.sh <Postgres-del-cliente> <host:puerto del proxy> <WABA_ID>`
   (usa el token guardado en el panel sin mostrarlo). Debe decir `{"success":true}` y listar la app
   junto a Kommo.
7. **Campos del webhook** (misma pantalla del paso 5, tabla de abajo): dejar **Subscribed** solo
   `messages`, `smb_message_echoes` y `calls`. Los demás (`account_update`, `security`,
   `phone_number_*`, `message_template_*`, `account_alerts`…) vienen prendidos y hacen fallar al
   webhook: responde 500 y Meta reintenta sin fin. `message_echoes` da error de permisos; no hace falta.
8. **Diagnóstico**: panel → Revisar conexión → 7 de 8. El octavo («Mensajes entrando») se pone verde
   al escribirle al número desde otro celular; con el bot apagado el mensaje aparece en el Inbox sin
   respuesta.
9. **Clave de OpenAI** (Manuel): Railway → proyecto AutoVentas → ambiente **Depot_Tire** (no
   staging) → servicio del cliente → Variables → `OPENAI_API_KEY` → **Deploy** (Railway deja el cambio
   en espera hasta pulsarlo).
10. **Probar solo con un número:** `railway variables --set "BOT_APAGADO_EXCEPTO=593…" --service <servicio> --environment Depot_Tire`.
    Con el bot apagado, solo ese número recibe respuesta (`contestaAunApagado` en `botPower.ts`).
    Ojo: sin esa variable el exceptuado es el WhatsApp del vendedor.
11. **Producción:** Ajustes → Encender el bot. Pendiente del cliente: método de pago en la cuenta de
    WhatsApp (solo para mensajes fuera de la ventana de 24 h).

---

## Kommo: por qué funciona y cómo se hace (el atajo que usó Depot)

**Con Depot NUNCA hicimos coexistencia nosotros.** Cuando llegamos (1-ago-2026) el número ya estaba
en la Cloud API: **Kommo** (el CRM que Depot usaba) lo había conectado por coexistencia. Kommo es
Tech Provider aprobado por Meta, así que su Embedded Signup sí funciona. Pruebas:

- `GET /970823328872837/subscribed_apps` devolvía **Kommo** (app `1022173854571346`) además de la nuestra.
- La WABA «DEPOT TIRE» figura como *«App de WhatsApp Business»* (= entró por coexistencia) y vive en
  el portafolio de Depot, no en el de Kommo.
- Nosotros solo hicimos los 11 pasos de [CONECTAR_WHATSAPP_CLIENTE.md](CONECTAR_WHATSAPP_CLIENTE.md):
  app propia en el portafolio del cliente + `subscribed_apps` sobre **la WABA que ya existía**.
  Sin App Review, sin Tech Provider, sin verificación (el portafolio ya estaba verificado).

**Por qué funciona:** el permiso de Tech Provider solo hace falta para **crear** la WABA por
coexistencia. Una vez creada, la WABA es del portafolio del cliente y cualquier app de ese mismo
portafolio se puede suscribir con acceso estándar.

**Cómo repetirlo con un cliente sin WABA:** que el cliente abra una cuenta en un proveedor que ya sea
Tech Provider con coexistencia (Kommo: prueba de 14 días, sin tarjeta) y conecte ahí su WhatsApp
Business con «Connect WhatsApp Business app» eligiendo **su propio portafolio**. Eso crea la WABA.
Después, pasos 6–11 del playbook.

### Pasos en Kommo (de su guía oficial, leída el 17-nov-2026)

Requisitos: cuenta Kommo (cualquier plan **o la prueba de 14 días**, sin tarjeta) · app de WhatsApp
Business ≥ 2.24.17 en el celular · número ya en uso activo (Meta decide la elegibilidad por
antigüedad y calidad) · un Facebook personal con acceso de administrador al portafolio del cliente.

1. Crear la cuenta de prueba en kommo.com.
2. En Kommo: **WhatsApp Business → Install → vincular un número → «WhatsApp Business app»** → continuar con Facebook.
3. Entrar con el Facebook que administra el portafolio → **Get Started** → elegir **el portafolio del cliente** → **Connect WhatsApp Business app**.
4. Escribir el número → confirmar la cuenta → Kommo muestra un **QR**.
5. En el celular: abrir el mensaje del QR en WhatsApp Business → **Scan QR Code** → escanear la pantalla.
6. Elegir si compartir historial (no hace falta) → **Continue** → **Finish**.
7. Esperar la importación (10–15 min) hasta que el número diga **Connected**.

Quién: todo lo hace quien administra el portafolio (Manuel), menos el paso 5, que necesita el
celular del número (videollamada con pantalla compartida). No hace falta el dueño de la empresa.

### Lo que cambia en el celular del cliente (guía de Meta, verificado el 17-nov-2026)

Avisarle al cliente **antes** de conectar:

- **Se cierran WhatsApp Web y los demás dispositivos vinculados.** Se vuelven a vincular después
  (menos WhatsApp para Windows y WearOS, que dejan de servir).
- **Las listas de difusión dejan de funcionar** (las que existen quedan de solo lectura).
- Se apagan los mensajes temporales, «ver una vez» y la ubicación en tiempo real en chats 1 a 1.
- Los grupos, las llamadas, el catálogo y las etiquetas siguen en el celular, pero la API no los ve.
- **Hay que abrir WhatsApp Business en ese celular al menos cada ~14 días**, o Meta desconecta el número.
- Escribir desde el celular sigue siendo gratis. Lo que manda el bot por la API se cobra según Meta.
- Se deshace desde el celular: Ajustes → Cuenta → Plataforma Business → Desconectar cuenta.

En la pantalla de **compartir historial**, elegir **no compartir**: no lo usamos y evita mandarle
las conversaciones de los clientes a Kommo.

### ✅ Probado con Mundillantas (17-nov-2026): funcionó con la prueba gratis

Lo que de verdad pasó, distinto de la guía de Kommo:

- En Kommo: **Communication → WhatsApp Business → Connect my WhatsApp → WhatsApp Business app → Continue with Facebook**.
- **Entrar con el Facebook PERSONAL del administrador (Manuel), no con el perfil de la empresa.** Con
  el perfil «Competimotor SA» el asistente no pedía portafolio y solo ofrecía número nuevo/virtual/de prueba.
- El asistente abre en **«Add your WhatsApp phone number»** con «Text message / Phone call». Asusta
  (parece el alta de número nuevo), pero con el perfil personal es el paso 1 del flujo bueno: se
  pone el país (EC +593) y el número, y **después** pide el portafolio («Select the business assets
  to share with Kommo» → elegir el del cliente, NO «Create a Business portfolio»).
- Zona horaria: **America/Guayaquil** (viene America/New_York).
- Final: «Your account is connected to Kommo» + «Assets successfully created». **Skip and finish
  setup** (el método de pago es la tarjeta del cliente, después).
- Cómo comprobar que fue coexistencia: Business Settings → WhatsApp accounts → la cuenta nueva dice
  **«WhatsApp Business App»** debajo del nombre, «Owned by: <cliente>», y Kommo sale como partner.
  En el celular: Ajustes → Cuenta → Plataforma Business.

Confirmado: la prueba gratis de Kommo sí hace la coexistencia. Sin confirmar: que la cuenta siga
funcionando para nuestra app cuando la prueba de Kommo venza (en Depot Kommo sigue suscrito, así que
ese caso no está probado). Kommo importa los chats del último mes aunque no se le pida: si al
cliente le importa, borrar la cuenta de Kommo cuando se confirme que no hace falta.

---

## Lo que Claude puede y no puede hacer

| Claude hace | Manuel / el cliente hace |
|---|---|
| Navegar Meta, llenar formularios, crear app/config/usuario del sistema | Aceptar invitaciones con su propio Facebook |
| Preparar (convertir/recortar) la foto del documento | **Subir** el documento de identidad |
| Proponer términos para aceptar | Dar el OK explícito a cada término |
| | **CAPTCHAs** (salen en cada intento de verificación) |
| | Códigos de verificación, contraseñas, App secret, token, clave de OpenAI |
| Configurar webhook y `subscribed_apps` | Aceptar la coexistencia en el celular |

---

## Checklist

La tabla de «LA RECETA QUE FUNCIONÓ», arriba, es la checklist: 15 pasos en orden.
