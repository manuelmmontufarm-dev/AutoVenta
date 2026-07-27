# Plan — Prueba de carga: 50 clientes simultáneos

> Objetivo: una prueba **rígida y repetible** que responda una sola pregunta con
> evidencia, no con opinión: *¿el backend aguanta 50 conversaciones en paralelo
> sin perder mensajes, sin duplicarlos, sin corromper estado y con el panel
> usable?* Si algo falla, se arregla y se vuelve a correr hasta que pase entero.

---

## 1. Qué prueba esto — y qué NO

**Sí prueba:** capacidad y corrección bajo concurrencia. Mensajes perdidos,
duplicados, condiciones de carrera en la base, agotamiento del pool, latencia de
ACK al webhook, el worker de seguimientos mandando dos veces, y si el panel
(Inbox, Pipeline/kanban, Oportunidades, Métricas) sigue respondiendo y mostrando
datos correctos mientras todo eso ocurre.

**No prueba:** la *calidad comercial* de lo que responde el bot. Con el modelo
mockeado las respuestas son fijas; con el modelo real son plausibles pero nadie
las está calificando. Eso es evaluación de agente, es otro trabajo.

**Honestidad sobre el título:** una prueba de carga verde no significa
"listo para producción". Significa "aguanta 50 clientes concurrentes y no
corrompe datos". Producción además necesita: backups probados, alertas,
rollback, y el número de WhatsApp con token permanente. Este plan cubre lo
primero y lo dice explícito para no vender más de lo que mide.

---

## 2. Los 7 obstáculos que hay que resolver ANTES de poder medir

Esto no es opinión: cada uno está verificado en el código. **Ninguna herramienta
de carga existe hoy en el repo** — ni k6, ni artillery, ni Playwright, ni un
generador de webhooks. Hay que construir el banco.

| # | Obstáculo | Dónde | Qué hacer |
|---|---|---|---|
| 1 | **No existe generador de mensajes entrantes.** `staging-follow-ups-smoke.mjs` solo hace 6 GET de lectura; no firma nada. | `app/scripts/` | Construir el emisor. El algoritmo HMAC-SHA256 sobre el body crudo ya está, del lado *verificador*, en `tools/webhook/server.js` — hay que invertirlo. |
| 2 | **La URL de Meta está hardcodeada.** `const GRAPH = "https://graph.facebook.com/v21.0"` | `app/src/wa/client.ts:17` | **Cambio de código obligatorio:** `GRAPH_BASE_URL` por entorno, default el actual. Sin esto, la prueba manda WhatsApps reales a números falsos. |
| 3 | **No hay mock de OpenAI en el camino de entrada.** El agente y el clasificador llaman a la API real siempre; el guarda `VITEST` solo existe en `followUpCopy.ts` y `vehicleFitmentResearch.ts`. | `app/src/agent/agent.ts:73`, `agent/classifier.ts:28` | Levantar un stub compatible con OpenAI y apuntar el SDK con `OPENAI_BASE_URL`. **Verificar primero** que el SDK lo respeta sin pasar `baseURL` explícito; si no, añadirlo desde `config.ts`. |
| 4 | **Trampa de falso verde.** Si `getWa()` devuelve `null` (canal sin token/appSecret), el webhook responde **200 sin procesar nada**. | `app/src/server/webhook.ts:22-27` | La prueba **no puede** dar por buena una respuesta 200. Cada mensaje inyectado debe verificarse contra la base: fila en `messages` + respuesta saliente registrada. |
| 5 | **Pool de Postgres = 5 conexiones.** Cada mensaje entrante dispara del orden de 8-12 queries. | `app/src/db/client.ts` (`max: 5`) | Es el cuello de botella más probable. No tocarlo antes de medir: **primero medir, después decidir**. Subirlo a ciegas esconde el problema real. |
| 6 | **Debounce de 5 s por usuario** y cola FIFO por remitente; sin límite global de concurrencia entre usuarios distintos. | `app/src/pipeline/inbound.ts` (`DEBOUNCE_MS=5000`) | 50 clientes = hasta 50 llamadas al modelo en ráfaga. El guion debe respetar el debounce o medirá otra cosa. |
| 7 | **La política de ventana de 24 h bloquea envíos sintéticos.** | `app/src/services/whatsappPolicy.ts` | Las conversaciones sembradas deben tener `last_customer_message_at` reciente para estar "en ventana". |

**Estado in-process, importante:** la idempotencia por `message.id` (TTL 6 h) y
las colas por usuario viven **en memoria**. No sobreviven a un reinicio ni
escalan a varias réplicas. La prueba debe incluir un reinicio a propósito
(escenario E) para exponer exactamente eso.

---

## 3. Arquitectura del banco de pruebas

Todo local o en un servicio efímero. **Nunca contra el Depot de producción.**

```
┌─────────────────┐   webhooks firmados    ┌──────────────────┐
│  harness/       │  POST /webhook  ──────▶│  app (bot)       │
│  50 "clientes"  │                        │  PORT=3100       │
│  con guion      │◀────── stub Graph ─────│  worker aparte   │
└─────────────────┘   (lo que el bot       └────────┬─────────┘
         │             "envía" al cliente)          │
         │                                          ▼
         │            ┌──────────────┐      ┌───────────────┐
         └───────────▶│ stub OpenAI  │      │ Postgres      │
                      │ fixtures     │      │ efímero       │
                      └──────────────┘      └───────────────┘
                                                    ▲
                      ┌──────────────┐              │
                      │  Playwright  │──────────────┘
                      │  screenshots │  lee el panel mientras corre la carga
                      └──────────────┘
```

**Cuatro piezas nuevas, todas en `app/scripts/loadtest/`:**

1. **`client-sim.mjs`** — genera webhooks de Meta firmados con HMAC-SHA256
   (`x-hub-signature-256`). Cada cliente virtual sigue un guion. Los guiones
   salen de `hub/src/data/mock/simulator.ts`, que ya tiene conversaciones
   realistas de clientes ficticios — se reusan, no se inventan.
2. **`stub-graph.mjs`** — se hace pasar por `graph.facebook.com`. Registra todo
   lo que el bot intenta enviar (ese log **es** el criterio de "no duplicó").
   Modo caos: puede devolver 429 y 503 para probar los reintentos.
3. **`stub-openai.mjs`** — respuestas deterministas por fixture. Set mínimo,
   siguiendo la práctica estándar: una respuesta normal, una con tool-call, una
   negativa, una malformada y una vacía. Con latencia artificial configurable
   (150 ms / 2 s / 10 s) para simular un modelo lento.
4. **`verify.mjs`** — corre las aserciones contra la base y escribe el reporte.

**Herramienta de carga:** no hace falta k6 ni artillery. La carga real la
determina el debounce y el modelo, no el HTTP; 50 clientes en Node puro son
triviales de orquestar y el guion necesita lógica con estado (esperar respuesta,
responder en consecuencia) que se expresa mejor en JS que en un DSL de carga.
Si más adelante se quiere pasar a 500 clientes, ahí sí conviene k6.

---

## 4. Los cinco escenarios

Cada uno corre por separado y tiene su propio veredicto.

**A — Ráfaga fría (el titular).** 50 clientes escriben a la vez, en frío, y
mantienen 4 turnos cada uno. ~200 mensajes entrantes, ~600 llamadas al stub del
modelo. Mide: nada perdido, nada duplicado, ACK < 3 s, y el panel usable.

**B — Duplicados de Meta.** Meta entrega *at-least-once*: el mismo `wamid`
puede llegar 2-10 veces durante un hipo de red. El harness reenvía el 20 % de
los mensajes 3 veces, algunos en paralelo. **Debe resultar en cero respuestas
duplicadas.** Esto ataca directo la idempotencia in-process.

**C — Desorden y ráfaga por usuario.** Un mismo cliente manda 5 mensajes en
2 s (por debajo del debounce). Debe salir **una** respuesta que considere los
5 textos concatenados, no 5 respuestas.

**D — Presión sobre el worker de seguimientos.** Sembrar 50 conversaciones con
seguimientos vencidos y arrancar **dos réplicas** del worker a la vez. El
`FOR UPDATE SKIP LOCKED` debería evitar el doble envío; esto lo demuestra.
Aquí también se verifica lo que acabamos de construir: que `aiPending` haga
que la redacción ocurra **una sola vez por job** y solo si el mensaje sale.

**E — Reinicio a media carga.** Matar el proceso del bot con 50 conversaciones
en vuelo y levantarlo. Expone la pérdida del estado in-process: mensajes
debounced que nunca se procesaron y el mapa de idempotencia vacío. **Predicción:
este escenario falla.** Es el que más probablemente obligue a mover el debounce
y la deduplicación a Postgres.

---

## 5. Criterios de aceptación — rígidos, sin interpretación

La corrida es verde solo si **todos** pasan. Cualquier rojo = bug que se arregla
y se vuelve a correr entero.

| # | Criterio | Umbral | Por qué ese número |
|---|---|---|---|
| 1 | Mensajes entrantes perdidos | **0** | Cada `wamid` inyectado debe tener fila en `messages`. |
| 2 | Respuestas duplicadas al mismo cliente | **0** | Contado en el log del stub de Graph, no en la base. |
| 3 | Latencia de ACK del webhook (p99) | **< 3 s** | Meta reintenta lo que no responde 200 en 3 s. Pasarse no es lentitud: es una avalancha de reintentos. |
| 4 | Errores 5xx en `/webhook` | **0** | Un 5xx dispara reintentos de Meta durante hasta 7 días. |
| 5 | Conversaciones que terminan en etapa correcta | **50/50** | Sin corrupción de `stage` ni de `current_cycle` por escrituras concurrentes. |
| 6 | Errores de pool agotado / timeout de conexión | **0** | Con `max: 5` este es el primer sospechoso. |
| 7 | Seguimientos enviados dos veces (escenario D) | **0** | Prueba el lease y el `SKIP LOCKED`. |
| 8 | Llamadas al modelo por seguimiento enviado | **≤ 1** | Verifica la redacción perezosa recién implementada. |
| 9 | Redacciones de seguimientos cancelados | **0** | Si el portón canceló, no debió generarse texto. |
| 10 | `/api/hub/*` responde con la carga encima (p95) | **< 2 s** | El asesor tiene que poder trabajar mientras entra tráfico. |
| 11 | Errores en consola del panel | **0** | Recogidos por Playwright. |
| 12 | Memoria del proceso al final vs. inicio | **< 2×** | Fugas obvias en los mapas in-process. |

**Números de referencia de Meta** (para saber qué NO es el cuello de botella):
80 mensajes/segundo por número y 10 requests/segundo de la API. 50 clientes
conversando están muy por debajo — **el límite lo pone nuestro backend, no
Meta.** Por eso todos los umbrales de arriba miran hacia adentro.

---

## 6. Screenshots — qué se captura y por qué

Playwright (no existe hoy en el repo; se añade como dependencia de desarrollo).
Corre contra el panel local con una `ADMIN_KEY` que **genera el propio harness**,
así no hace falta ninguna clave real.

Se capturan **7 pantallas en 3 momentos** (antes / durante el pico / después):

1. **Inbox** — 50 tickets, contadores de no leídos.
2. **Pipeline (kanban)** — distribución por etapa; se verifica que suma 50.
3. **Oportunidades** — incluida la tarjeta con el botón «Generar con IA».
4. **Métricas** — embudo y `generations_avoided`.
5. **Detalle de ticket** — un hilo completo, para ver que el orden de los
   mensajes es correcto.
6. **Ajustes → WhatsApp** — el diagnóstico de canal contra el stub.
7. **Kanban con drag & drop** — mover un ticket de etapa mientras entra carga.

Cada captura va con su aserción: **una imagen sola no prueba nada.** El
screenshot es la evidencia legible para un humano; la aserción es lo que decide
verde o rojo. Se guardan en `app/scripts/loadtest/reports/<timestamp>/` junto
con el JSON de métricas, para poder comparar corridas.

---

## 7. Bugs que espero encontrar

Predicciones explícitas, para poder juzgar después si el plan sirvió:

1. **Pool agotado** (`max: 5`) con 50 conversaciones concurrentes → timeouts.
2. **ACK > 3 s** bajo carga, porque el webhook hace trabajo antes de responder.
   La práctica correcta es responder 200 de inmediato y procesar después.
3. **Escenario E rompe** por el estado in-process.
4. **El bucle caliente del worker**: cuando procesa jobs no duerme, así que con
   backlog itera sin pausa contra el mismo pool de 5.
5. **`max_messages_per_day = 2`** puede cancelar seguimientos legítimos en la
   prueba y parecer un bug cuando es la política haciendo su trabajo — hay que
   distinguirlo antes de "arreglar" nada.

---

## 8. Fases y esfuerzo

| Fase | Qué | Horas |
|---|---|---|
| **0** | Desbloquear: `GRAPH_BASE_URL`, verificar `OPENAI_BASE_URL`, script de BD efímera | 2-3 |
| **1** | `stub-graph.mjs` + `stub-openai.mjs` con fixtures | 3-4 |
| **2** | `client-sim.mjs` con firma HMAC y guiones reusados del simulador del hub | 4-5 |
| **3** | `verify.mjs` con los 12 criterios | 3-4 |
| **4** | Playwright + capturas + aserciones visuales | 3-4 |
| **5** | Correr, arreglar bugs, volver a correr hasta verde | 6-10 |
| | **Total** | **21-30 h** |

La fase 5 es la que más varía: depende de cuántos de los bugs predichos
aparezcan de verdad.

**Costo de una corrida:** con los stubs, **$0**. Con el modelo real (una sola
corrida final de verdad, escenario A), del orden de **$0,30** — unas 600
llamadas a `gpt-4o-mini` a ~$0,0005 cada una, el mismo número que ya usamos en
`PLAN_SEGUIMIENTOS_LAZY.md`. Es barato: conviene hacer esa corrida real al final
para confirmar que los stubs no escondieron nada.

---

## 9. Riesgos y decisiones abiertas

- **Dónde correrlo.** Recomendación: **local con Postgres efímero**, no en
  staging. Staging comparte configuración con el servicio de Depot y una carga
  de 50 clientes con seguimientos sembrados ensucia datos que después hay que
  limpiar a mano. Local además permite matar el proceso (escenario E).
- **Los stubs pueden mentir.** Un mock que siempre responde en 150 ms esconde
  los timeouts que un modelo lento causaría. Por eso el stub tiene latencia
  configurable y hay una corrida final contra la API real.
- **`GRAPH_BASE_URL` es un cambio en código de producción** para poder probar.
  Riesgo bajo (default = valor actual), pero hay que revisarlo con cuidado: si
  se configura mal en producción, el bot deja de enviar. Conviene que arranque
  logueando a qué host va a hablar.
- **Dos repos.** Existe un clon en `/Users/manue/Documents/AUTOVENTAS/AutoVenta/`.
  Antes de empezar hay que confirmar cuál es el activo — el trabajo reciente va
  en `/Users/manue/AutoVenta`.
