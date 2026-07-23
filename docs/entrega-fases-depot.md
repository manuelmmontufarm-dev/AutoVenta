# Entrega por fases a Depot Tire

> Cómo entregar Fase 1 (y encender 2 y 3 después) sin duplicar código.
> Un solo repo → varios entornos de Railway, con un **panel central** que
> controla las fases de cada cliente.

## Topología (3 superficies, 1 base de código)

```
                 AutoVenta Hub  (índice: encuentra todo)
                        │
   ┌────────────────────┼────────────────────────┐
   ▼                    ▼                         ▼
STAGING              CLIENTE (Depot Tire)     PANEL /panel
tu laboratorio       su producto              control central APARTE:
WhatsApp TESTER      su WhatsApp Business      enciende las fases de
todas las fases      fases limitadas          cada cliente por su API
= mismo repo, distinto entorno de Railway (env + base de datos) =
```

- **staging** = `autoventa-staging.up.railway.app`, la fuente de verdad. Deploya
  solo con `push a main`.
- **production** viejo = **muerto**. Bórralo desde tu consola de Railway; el repo
  no apunta a él (los links del hub son relativos).

| Entorno | Base de datos | Fases | ADMIN_KEY |
|---|---|---|---|
| **staging** | Postgres A (datos de prueba) | `PHASES_DEFAULT=all` | clave tuya |
| **depot** (producción) | Postgres B **nueva y vacía** | arranca en Fase 1 | clave del cliente, distinta |

El backend trae TODAS las capacidades en ambos. Solo cambian: **fases** activas
(tabla `settings`), **base de datos** (datos aislados) y **ADMIN_KEY**.

## El panel central `/panel`

Vive **aparte** del hub del cliente. Sirve para encender fases sin entrar a la
operación del cliente. Es tu herramienta interna.

1. Ábrelo en `…/panel/` (staging ya lo sirve).
2. **Agregar cliente**: nombre + URL base del deploy + su `ADMIN_KEY`.
   Las claves se guardan solo en tu navegador (localStorage), nunca en el repo.
3. Cada cliente muestra sus fases y el estado de WhatsApp. Flip del toggle =
   `PUT {url}/api/phases` → surte efecto en el próximo mensaje, sin redeploy.

> El cliente **no** ve controles de fase en su hub: solo opera (Inbox, Pipeline…).

## Montar el entorno de Depot (una vez — lo haces tú en Railway)

1. **New Service → Deploy from GitHub repo** (el mismo repo). Root Directory =
   `app/`. Auto-deploy: ver "promoción manual" abajo.
2. Agrega un **Postgres nuevo** y referencia `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
   Base limpia → cero conversaciones de staging.
3. Variables del servicio Depot:
   - `ADMIN_KEY=` clave del cliente, **distinta** de staging.
   - `NODE_ENV=production` → fuerza el fail-closed del panel (sin clave, bloqueado).
   - `OPENAI_API_KEY`, `CONTIFICO_API_KEY`, etc. (las del negocio).
   - `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`,
     `WHATSAPP_PHONE_ID`, `SELLER_PHONE` → los del **WhatsApp Business** de Depot.
   - **Sin** `PHASES_DEFAULT` → arranca en Fase 1.
4. Deploy. El bot crea el esquema solo al arrancar. Opcional, para dejar el
   estado explícito y verificar que no hay datos: `npm run seed:depot`
   (reutilizas una base con tráfico previo y quieres vaciarla: `SEED_WIPE=true npm run seed:depot`).
5. Registra `https://<depot>.up.railway.app/webhook` en Meta con el verify token.

## Entregar hoy (Fase 1 y 2)

1. Verifica WhatsApp: el bot responde a un mensaje de prueba al número de Depot.
2. En **`/panel`** agrega a Depot (URL + su ADMIN_KEY) y enciende **Fase 2** si
   ya entregas OCR/fitment. Deja **Fase 3 apagada** → Cotizador y Métricas no
   aparecen para el cliente.
3. Listo: el cliente ve solo lo prometido; el bot responde por su WhatsApp.

## Seguir mejorando staging y actualizar Depot (promoción MANUAL)

- Trabajas en `main` → **staging** se redeploya solo.
- El servicio **Depot** debe tener el **auto-deploy APAGADO** (Railway → servicio
  Depot → Settings → desactivar "Deploy on push").
- Cuando una versión esté probada en staging, promuévela a mano: **Railway →
  servicio Depot → Deploy → elegir el commit** (o "Redeploy").

Así el cliente nunca recibe un cambio a medio hornear.

## Qué desbloquea cada fase

| Fase | Frontend (hub cliente) | Bot (herramientas) |
|---|---|---|
| **1 · Núcleo** (siempre) | Inbox, Pipeline | buscar por medida, cotización, local, alerta vendedor |
| **2 · Sin datos** | — (sin pantallas nuevas) | + fitment vehículo→medida |
| **3 · Completo** | + Cotizador, + Métricas | + comparativas visuales |

Mapeo en código: `app/src/services/phases.ts` (backend + tools por fase),
`hub/src/App.tsx` + `hub/src/store.ts` (nav del cliente), `app/site/panel/`
(panel central).
