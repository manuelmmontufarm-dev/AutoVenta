# Volvernos Tech Provider de WhatsApp (para conectar clientes sin depender de Kommo)

> Empezado el **17-nov-2026**. Fuente: guía oficial de Meta
> ([Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers))
> y lo que muestra el panel de nuestra app. Estado al final de este archivo.

## Qué es y por qué lo necesitamos

Un **Tech Provider** es una empresa de software a la que Meta le permite conectar el WhatsApp de
**otros** negocios. Solo un Tech Provider puede usar **Embedded Signup**, y Embedded Signup es la
única forma de hacer **coexistencia** (el número sigue en la app del celular y además en la API).

Por eso Mundillantas se trabó con «can't onboard customers right now», y por eso Depot fue fácil:
Kommo ya es Tech Provider y lo había hecho por nosotros (ver
[ALTA_META_CLIENTE_NUEVO.md](ALTA_META_CLIENTE_NUEVO.md), «El atajo que usó Depot»).

## Quién se vuelve Tech Provider

**Nuestro portafolio (Acesso), con nuestra app — no el del cliente.**

| | |
|---|---|
| Portafolio | Acesso · `4483301648607233` · **sin verificar** |
| App | AutoVenta · `1053180323906811` · Published · caso de uso WhatsApp ya agregado |
| Dónde | App → Use cases → *Connect on WhatsApp* → Customize → **Become a Partner → Become Tech Provider** |

Se hace **una sola vez** y sirve para todos los clientes siguientes.

## Los pasos, en orden

| # | Paso | Quién | Qué hace falta | Tiempo |
|---|---|---|---|---|
| 1 | **Start onboarding** como *Independent Tech Provider* | Manuel da el OK (acepta los **Tech Provider Terms**) | Nada | 1 min |
| 2 | **Verificar NUESTRO negocio** (portafolio Acesso) | Claude llena, Manuel pasa CAPTCHA y sube documentos | Empresa o RUC a nombre de quien figure, documento con razón social, dirección, teléfono, web https, ID vigente del titular | 20 min + ~1–2 días hábiles de Meta (lo que tardó Competimotor) |
| 3 | **Datos básicos de la app** | Claude | Ícono, URL de privacidad, categoría | 10 min |
| 4 | **Dos videos** para App Review | Claude prepara, Manuel graba la pantalla | Ver abajo | 30 min |
| 5 | **Pedir acceso avanzado** a `whatsapp_business_messaging` y `whatsapp_business_management` → **Begin App Review** | Claude llena, Manuel envía | Los videos y una explicación corta de para qué se usa cada permiso | 15 min + revisión de Meta (días; la guía no da plazo) |
| 6 | **Configurar Embedded Signup** en nuestra app | Claude | Ya está construido: `app/site/alta-whatsapp.html`. Solo crear la configuración en *Facebook Login for Business* y usar nuestro app ID | 20 min |
| 7 | **Conectar un cliente** | Manuel + quien tenga el celular | El enlace `/alta-whatsapp?app=…&config=…`, el cliente elige su portafolio y escanea el QR | 10 min por cliente |

El paso 2 tiene que estar aprobado **antes** de poder enviar el paso 5.

### Los dos videos (paso 4)

Meta pide ver que la app sabe hacer dos cosas:

1. **Enviar un mensaje:** grabar cómo se escribe y envía un mensaje **desde nuestra app** (el Inbox
   del panel de staging) y cómo llega al WhatsApp del celular o a WhatsApp Web.
2. **Crear una plantilla:** grabar la creación de una plantilla de mensaje. Nuestro panel no crea
   plantillas, pero Meta acepta la alternativa: grabar **WhatsApp Manager** creando una.

Alternativa para el video 1 si el panel da problemas: grabar el script cURL de *API Setup* mandando
un mensaje a un número de prueba.

### Lo que puede salir mal

- **La verificación de Acesso.** Es el mismo trámite que Competimotor (ver
  [ALTA_META_CLIENTE_NUEVO.md](ALTA_META_CLIENTE_NUEVO.md), Fase 4): la razón social tiene que
  coincidir con un registro público o con un documento, y el ID tiene que estar **vigente** y ser
  **foto**. Hay que decidir **a nombre de quién** se verifica (ver «Decisión pendiente»).
- **App Review rechazado.** El motivo más común según las guías de terceros: pedir permisos que la
  app no usa. Pedir solo los dos de WhatsApp.
- **Dos portafolios.** El cliente tiene que elegir **su** portafolio en Embedded Signup, no el nuestro:
  la cuenta de WhatsApp queda suya y Meta le cobra a su tarjeta (regla de los contratos).

## Después de ser Tech Provider: cómo queda cada cliente

Dos formas de recibir los mensajes, a elegir cuando llegue el momento:

- **Como hoy (una app por cliente):** Embedded Signup crea la cuenta de WhatsApp en el portafolio del
  cliente y después se le suscribe la app propia de ese cliente, igual que Depot. No requiere código nuevo.
- **Una sola app para todos:** los mensajes de todos los clientes llegan al webhook de nuestra app y
  un router los reparte por `phone_number_id`. Requiere código (ver [PENDIENTES.md](PENDIENTES.md),
  «Una app por cliente no escala»).

## Decisión pendiente

**A nombre de qué empresa se verifica Acesso → DECIDIDO 17-nov-2026: la compañía propia de Manuel**
(no el RUC de Rosanna). Falta que Manuel pase:

1. **Certificado del RUC** de la compañía (PDF del SRI): da la razón social exacta, el RUC y la dirección.
2. **Foto con el celular de un ID vigente** (cédula o pasaporte) de quien figure como representante o socio.
3. **Teléfono** del negocio y **sitio web https** donde aparezca el nombre de la empresa.

## Estado

- **17-nov-2026, 01:10:** abierto el asistente en la app AutoVenta (Acesso). Elegido *Independent Tech
  Provider*.
- **17-nov-2026, 10:40:** ✅ **Onboarding iniciado** (Tech Provider Terms aceptados con el OK de Manuel).
  El panel muestra «Onboard as an independent Tech Provider — 0 of 2 steps complete»:
  1. **Business Verification** → botón *Start verification* (sin empezar: falta decidir la empresa).
  2. **App Review** → *Review your app settings* · *Record video documentation* · *Submit documentation*.
  Aparecieron menús nuevos: **Embedded Signup Builder**, **Partner Solutions**, **Migrate customers**,
  y una tarjeta **«Meta-hosted embedded signup → Generate link»** (Meta aloja la página de alta: puede
  reemplazar a nuestro `alta-whatsapp.html`; sin probar).

### Lo que mostró App Review (leer antes de enviar)

- Estado: **Not submitted**.
- Meta ahora revisa **la app entera** en cada envío (ícono, nombre, URL de privacidad y de borrado de
  datos, y todos los permisos), y **un envío en revisión no se puede editar ni cancelar**.
- La lista de «New requests» trae 11 cosas, no 2: además de `whatsapp_business_messaging` y
  `whatsapp_business_management` están `whatsapp_business_manage_events`, `manage_app_solution`,
  `business_management`, `public_profile` y **todo lo de anuncios** (`ads_read`, `ads_management`,
  `pages_show_list`, `pages_read_engagement`, *Marketing API Access Tier*), que viene del caso de uso
  «Create & manage ads with Marketing API».
- **Antes de enviar hay que quitar de la lista lo de anuncios** (enlace *remove* en cada uno): pedir
  permisos que no se demuestran en los videos es el motivo de rechazo más común.

- **17-nov-2026, 16:20 — Plan y plazos (conversación con Manuel):**
  - La empresa propia de Manuel **no está registrada**: hace falta el RUC antes de poder verificar.
    Orden: (1) sacar el RUC — persona natural es lo más rápido; (2) verificación de Meta, ~1–2 días
    hábiles; (3) App Review con los dos videos, varios días sin plazo fijo.
  - **Atajo disponible hoy:** verificar con el RUC de Rosanna Mancino, que ya existe. Manuel prefiere
    su propia empresa; decisión abierta si el plazo aprieta.
  - **Meta: llegar antes del ~1-dic-2026**, cuando vence la prueba de Kommo de Competimotor. Son 14
    días para un RUC más dos revisiones seguidas: posible, no seguro.
  - Ser Tech Provider **no elimina** la duda de Kommo para Competimotor (su cuenta se creó a través de
    Kommo). Da un arreglo si se rompe: reconectar el número con nuestro enlace (otro QR con Carlos).

## Kommo: costo y riesgo al vencer la prueba (17-nov-2026)

- Precios de kommo.com/pricing: Base $25, Advanced $35, Pro $45 por usuario al mes; **mínimo 6 meses**
  → entrada más barata **$150**. Números de WhatsApp: Base 1 por usuario, Advanced 3, Pro ilimitado.
- La prueba no tiene tarjeta ni botón de «cancelar»: simplemente termina. No está documentado qué le
  pasa a la cuenta de WhatsApp. Lo esperado: sigue, porque en Meta es del cliente y Kommo es solo partner.
- **No desconectar el número ni borrar la cuenta en Kommo para «probar»:** no equivale a que la prueba
  venza y puede sacar el número de la API (habría que repetir el QR con el celular).
- Formas de saberlo: preguntar al chat de soporte de Kommo, o esperar al vencimiento y revisar.
- Si se rompe: pagar el mínimo de Kommo, o reconectar con una cuenta de prueba nueva, o con nuestro
  enlace si ya somos Tech Provider.
