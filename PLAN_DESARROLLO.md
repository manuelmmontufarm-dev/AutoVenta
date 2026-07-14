# AutoVenta — Plan de Desarrollo Técnico

> Investigación y decisiones a **2026-07-13**. Todos los precios y APIs verificados contra fuentes oficiales en esa fecha.
> Volumen objetivo: 10–50 chats/día (~300–1.500 conversaciones/mes), 2 locales, Ecuador.

---

## 0. Resumen ejecutivo — cómo se hace cada cosa y con qué

| Pieza | Con qué | Por qué | Costo |
|---|---|---|---|
| **Canal WhatsApp** | **Meta WhatsApp Cloud API directo** + **coexistence** (app + API en el mismo número) | Conversaciones iniciadas por el cliente son **GRATIS e ilimitadas** desde nov-2024. Un BSP (WATI, 360dialog, Twilio) cobra $15–75/mes por el mismo tráfico. Coexistence deja al dueño seguir usando su app. | ~$1–2/mes (solo alertas) |
| **Cerebro del bot** | **Claude API** (`@anthropic-ai/sdk`, tool runner con Zod), agente único con 6–8 tools | Patrón dominante 2026: un LLM con function calling decide qué tool llamar. LangGraph = sobre-ingeniería para un solo agente. | $5–25/mes según modelo/volumen |
| **Modelo LLM** | **Sonnet 5** ($3/$15, intro $2/$10 hasta ago-2026) para conversación; **Haiku 4.5** ($1/$5) para clasificador de etapa | A este volumen el costo es marginal — se elige por calidad, no por precio. Visión incluida (fotos de llantas). | incluido arriba |
| **Anti-caos de mensajes** | Debounce por número (timer 4–8 s) + cola FIFO por usuario + idempotencia por `message.id` | La gente manda 3 mensajes seguidos; sin buffer = respuestas duplicadas y 3× costo. Meta reintenta webhooks → idempotencia obligatoria. | $0 (~30 líneas) |
| **Parsing de medidas** | Tool con schema `strict: true` + **regex de normalización** (`185 R14`, `185/65-14`, `175 65 14` → canónico) | El LLM extrae, la regex valida. Cero medidas alucinadas: la búsqueda solo acepta valores validados. | $0 |
| **Fotos (OCR)** | Visión del propio LLM + **confirmación obligatoria** del cliente ("Vi 185/65R14, ¿correcto?") | Costado de llanta = texto negro sobre negro; el LLM lee ~80-90%, la confirmación lo vuelve 100% seguro. Cotizaciones de la competencia (texto impreso) = caso fácil. Sin OCR de terceros. | $0 extra |
| **Fitment (vehículo→medida)** | **Tabla curada de ~30–50 vehículos** comunes en Ecuador (el dueño la valida en una tarde) + LLM con disclaimer como fallback | No existe dataset libre de fitment; Wheel-Size API cuesta $450/año — solo si escala. La tabla propia cubre >90% de consultas (Hilux, Vitara, Sail, D-Max, Sportage…). | $0 |
| **PDF de cotización** | **pdfmake** (layout declarativo JSON: logo + tabla + totales) | Sin Chromium: ~5–15 MB RAM vs 100–200 MB de Puppeteer. Cabe en Railway 512 MB. Se envía por WhatsApp como `type: document` (hasta 100 MB). | $0 |
| **Catálogo/stock** | **Google Sheets del dueño como fuente de verdad** → sync cada 5–10 min a caché local | El dueño ya vive en Excel. API de Sheets gratis (300 lect/min, sobra). Validación al importar: medidas que no pasen la regex se reportan por WhatsApp. | $0 |
| **Ubicación → local cercano** | Location message nativo de WhatsApp (webhook trae lat/lng) + haversine contra los 2 locales | Soporte nativo, incluye botón "solicitar ubicación" (`location_request_message`). | $0 |
| **Confirmación de compra** | Tool `notificar_vendedor` (el agente la llama al detectar confirmación) + clasificador de etapa post-turno (JSON estructurado con Haiku) | Doble red: la tool es la señal precisa; el clasificador persiste el funnel para el dashboard y actúa de respaldo. El humano cierra la venta — nunca cobro automático. | $0 extra |
| **Alerta al vendedor** | Template utility de WhatsApp al número del vendedor (~$0,0113/msg; $0 si tiene ventana abierta) | El vendedor es un usuario más de WhatsApp. | ~$1/mes |
| **Handoff a humano** | Flag `bot_paused` por conversación + webhook `smb_message_echoes` de coexistence (si el dueño responde desde su app, el bot se auto-silencia X horas en ese chat) | La API no tiene "pausa" nativa; este es el patrón estándar y el gran beneficio operativo de coexistence. | $0 |
| **Hosting** | **Railway Hobby** ($5/mes, incluye $5 de crédito de uso) — bot + dashboard en el mismo servicio | Cliente ya conoce Railway. Always-on (webhooks no toleran cold starts), auto-deploy desde GitHub, TLS automático. Serverless/Vercel descartado (ver §8). | $5/mes |
| **Base de datos** | **Supabase Free** (Postgres 500 MB + Auth) + keep-alive diario + backup por GitHub Actions | 1.500 convs/mes = pocos MB/mes; 500 MB dan para años con purga. Pausa a los 7 días de inactividad → keep-alive lo cubre. | $0 |
| **Colas / Redis** | **Sin Redis.** Debounce en memoria + pg-boss sobre Postgres si hacen falta colas formales | <1 mensaje/minuto en promedio. Redis solo con múltiples réplicas — no existe ese escenario. | $0 |
| **Dashboard/Hub** | SPA (Vite + React) servida por el mismo Express del bot bajo `/admin` + Supabase Auth | Vercel Hobby **prohíbe uso comercial** → descartado. Mismo deploy, cero costo marginal. | $0 |
| **Observabilidad** | Sentry Developer free (5k errores/mes) + Better Stack free (uptime `/health` cada 3 min + heartbeat de backups) | UptimeRobot free quedó restringido a uso no comercial (dic-2024) → Better Stack. | $0 |

**Total infra + canal: ~$6–7/mes. Con LLM: ~$12–30/mes de operación.**

---

## 1. Arquitectura general

```
Cliente WhatsApp ──► Meta Cloud API ──► Webhook (Express en Railway)
                                            │  200 inmediato
                                            ▼
                                     Debounce (4–8s) + cola FIFO por número
                                            │
                                            ▼
                              Agente Claude (tool runner, 6–8 tools)
                              ├─ buscar_llanta(ancho, perfil, rin)  ──► caché catálogo (← Google Sheets sync)
                              ├─ fitment_vehiculo(marca, modelo, año) ──► tabla curada Ecuador
                              ├─ generar_cotizacion(items) ──► pdfmake ──► media upload ──► WhatsApp
                              ├─ local_mas_cercano(lat, lng) ──► haversine 2 locales
                              ├─ notificar_vendedor(resumen) ──► template utility
                              └─ leer_imagen (visión del propio modelo + confirmación)
                                            │
                                            ▼
                              Postgres (Supabase): conversaciones, perfil cliente,
                              etapa funnel, cotizaciones, leads
                                            │
                                            ▼
                              Dashboard /admin (métricas funnel, actividad, alertas)
```

**Flujo estándar por mensaje:** webhook recibe → responde 200 → encola → (debounce) → LLM con historial + tools → ejecuta tools → responde vía Cloud API → clasificador de etapa (Haiku, JSON estricto) → persiste.

**Grounding:** el bot solo afirma precios/stock que vienen de una tool — nunca de memoria del modelo.

---

## 2. WhatsApp: conexión, requisitos y detalles operativos

### 2.1 Setup (Meta directo, sin BSP)
1. Meta Business Manager + app tipo Business en developers.facebook.com.
2. **Verificación del negocio:** RUC + factura de servicios (nombre legal exacto). Demora típica 2–5 días hábiles (máx 14). Iniciar **en paralelo** al desarrollo.
3. **Desarrollo contra el test number gratuito** de Meta: sin método de pago, templates pre-aprobados, hasta 5 destinatarios verificados (yo + dueño + vendedor). El número real no se toca hasta el final.
4. **Coexistence** para el número real: requiere app WhatsApp Business ≥ 2.24.17 y cuenta con uso real. Mensajes espejados app↔API en tiempo real; historial sincronizado hasta 180 días. Limitaciones: 20 msg/s, sin listas de difusión, se desvinculan dispositivos companion.
   - ⚠️ Onboarding directo requiere configurar Embedded Signup (Tech Provider). Plan B: 360dialog (€49/mes) solo como puente.
5. **System User token permanente** (no el token de 24 h). Se invalida ante cambios de seguridad → manejar 401 con alerta.
6. Display name debe ser el nombre real del negocio (revisión de Meta, horas–días). Desde ene-2026 exigen URL de política de privacidad.

### 2.2 Precios vigentes (Ecuador = "Rest of Latin America")
- **Servicio (cliente escribe primero): GRATIS e ilimitado** — texto, PDF, imágenes, ubicación, botones, dentro de la ventana de 24 h que cada mensaje del cliente renueva.
- Templates **utility** fuera de ventana: **~$0,0113/msg**. **Marketing**: ~$0,074/msg. Utility dentro de ventana abierta: gratis.
- El bot de ventas es ~100% reactivo → **costo de canal ≈ $0** + ~$1/mes de alertas al vendedor.
- Templates necesarios (~3): alerta vendedor (utility), reapertura de cotización (utility/marketing), confirmación de pedido (utility). Aprobación en minutos–48 h. ⚠️ Meta puede recategorizar utility→marketing (sube 6,5×) o pausar templates por feedback negativo — monitorear webhook `message_template_status_update`.

### 2.3 Media y ubicación
- **Enviar PDF:** `POST /{PHONE_NUMBER_ID}/media` (hasta 100 MB, persiste 30 días) → mensaje `type: document` con `media_id` y `filename`.
- **Recibir fotos:** webhook trae `media_id` → `GET /{MEDIA_ID}` devuelve URL **válida solo 5 minutos** → descargar inmediatamente con el Bearer token. ⚠️ Diseñar el worker para bajar media al instante o se pierde.
- **Ubicación:** `type: location` con lat/lng en el webhook; se puede pedir con botón nativo (`location_request_message`).

### 2.4 Por qué NO librerías no oficiales (Baileys / whatsapp-web.js)
- Violan ToS; vida útil típica de un número automatizado no oficial: **2–8 semanas** antes del baneo, sin apelación garantizada. ~1 de cada 5 cuentas baneadas en el primer año.
- Diciembre 2025: fork malicioso `lotusbail` en npm (56k descargas) robando sesiones — riesgo de cadena de suministro.
- **El número ES el negocio.** Como mucho, whatsapp-web.js en un número desechable para una demo interna. Nunca en producción.

---

## 3. El agente (cerebro)

### 3.1 Stack
- `@anthropic-ai/sdk` directo con **tool runner** (`toolRunner` + `betaZodTool`): el SDK ejecuta el loop agéntico completo (~50–100 líneas propias). Sin LangGraph/LangChain.
- **Modelos:** Sonnet 5 para la conversación (calidad en español informal + visión); Haiku 4.5 para el clasificador de etapa. Opus 4.8 como opción de máxima calidad (a este volumen la diferencia son ~$20–40/mes).
- **Prompt caching:** system prompt + tools estables al inicio → lecturas de caché a ~10% del precio. Regla: nada volátil (timestamps) en el system prompt.
- Español ecuatoriano: no requiere nada especial — system prompt con tono local y 5–10 ejemplos de jerga ("de una", "aro" = rin, "ñaño").

### 3.2 Estado y memoria
- Tabla `conversations` (últimos ~20 mensajes por número) + mini-perfil JSON por cliente (vehículo declarado, medida buscada, última cotización) inyectado al system prompt.
- TTL conceptual de 24 h alineado con la ventana de WhatsApp; archivado de conversaciones >90 días (job mensual).

### 3.3 Debounce, colas, idempotencia (el trabajo real)
- Buffer por remitente: `Map<telefono, {buffer, timer}>`; cada mensaje resetea un `setTimeout(flush, ~4000)`. Al silencio, UNA llamada al LLM con todo concatenado.
- Cola FIFO por usuario: nunca 2 corridas del agente concurrentes para el mismo número; mensaje que llega mientras corre → se encola.
- Idempotencia por `message.id` (Meta reintenta webhooks). Ignorar mensajes propios y statuses.
- Riesgo aceptado: reinicio del proceso en medio de un debounce pierde el buffer de UN usuario (respuesta en dos partes, una vez cada muchas semanas).

### 3.4 Medidas de llanta
- Formato: `ancho/perfil R rin` (+ índice carga/velocidad). Variantes reales: `185 R14` (perfil omitido = 80/82), `185/65-14`, `175 65 14`, `31x10.5R15`.
- Pipeline: LLM extrae → regex valida/normaliza: `/(\d{3})\s*[\/\s-]?\s*(\d{2})?\s*[Rr\s-]\s*(\d{2})/` + reglas (ancho 125–355 múltiplo de 5, perfil 25–85, rin 10–24, sin perfil → 80). `strict: true` en el schema garantiza tipos.
- Fotos: visión del mismo modelo con prompt "extrae medida; responde `no_legible` si no estás seguro" → regex → **confirmación con el cliente siempre**.

### 3.5 Fitment
- Fase 1–2: **tabla curada** (~30–50 vehículos Ecuador × generación → medidas OE y alternativas). El dueño la valida — conoce su mercado mejor que cualquier API.
- Fallback: conocimiento del LLM con disclaimer + confirmación ("Para una Hilux 2018 normalmente es 265/65R17 — ¿confirmas viendo el costado de tu llanta?"). **Nunca cotizar sin medida confirmada** (dato de seguridad vehicular).
- Si escala: Wheel-Size.com Fitment API — Basic $450/año (5.000 hits/día). Alternativa: Tire Size API vdim.app (free 300 req/día; Starter $40/mes).

### 3.6 Detección de confirmación de compra
1. Tool `notificar_vendedor`: el system prompt instruye llamarla cuando el cliente confirme/aparte/pida pagar. Señal más precisa (contexto completo).
2. Clasificador post-turno (Haiku + `output_config.format` JSON estricto): `{etapa: approach|cotizado|ubicacion|confirmado, confianza}` → persiste funnel para el dashboard + red de seguridad (confirmado con confianza alta y sin tool → alerta igual).
- Con 4 etapas y ejemplos ecuatorianos en el prompt: precisión práctica >90–95%.

---

## 4. PDF de cotización

- **pdfmake**: layout declarativo (logo, datos cliente, tabla 1–5 ítems, condiciones, totales). ~5–15 MB RAM por PDF, sin binarios.
- Descartados: Puppeteer/Playwright (100–200 MB RAM + Chromium 150–400 MB en disco — riesgoso en Railway 512 MB), pdf-lib (solo manipulación).
- Alternativa equivalente si se prefiere JSX: @react-pdf/renderer.

## 5. Catálogo (Google Sheets)

- Hoja con columnas fijas: `marca | modelo | medida | precio | stock | local`.
- Sync con `googleapis` (service account, gratis): 1 request lee toda la hoja cada 5–10 min → caché local (SQLite/memoria). Límites API: 300 lect/min por proyecto — irrelevante.
- Validación al importar: filas cuya medida no pase la regex se reportan al dueño por WhatsApp. Guardar `ultima_sync` y alertar si la hoja tiene errores.
- ⚠️ Pendiente del cliente: el HTML de SUDINCO **no sirve** como fuente (es una propuesta de marketing sin data). Se necesita el Excel real o acceso a armar la hoja juntos.

## 6. Dashboard / Hub (Fase 3, versión simple)

- SPA Vite+React servida bajo `/admin` por el mismo Express. Métricas: cuántos escribieron, respondieron 1er/2do mensaje, cotizados, confirmados; feed de actividad; lista de alertas.
- Auth: Supabase Auth (email+password, 2–3 usuarios) o cookie firmada simple.
- El cliente dijo explícitamente que el hub le importa menos que el agente → mínimo viable, sin SSR.

## 7. Infraestructura

| Capa | Servicio | Detalle | $/mes |
|---|---|---|---|
| Hosting | Railway Hobby | Bot+dashboard, always-on, auto-deploy GitHub, TLS. **No activar "serverless/sleep"** (Meta marca webhooks fallidos). | $5 (uso suele caber en el crédito) |
| DB + Auth | Supabase Free | 500 MB, pausa a 7 días sin actividad → keep-alive diario (`SELECT 1` vía cron / health check). Sin backups automáticos → GitHub Actions `pg_dump` diario → artifact/R2 + heartbeat. | $0 |
| Colas | pg-boss (opcional) | Sobre el mismo Postgres. | $0 |
| Errores | Sentry Developer | 5k eventos/mes; sin tracing. | $0 |
| Uptime | Better Stack free | Monitor `/health` cada 3 min + heartbeat de backups. (UptimeRobot free = solo uso personal desde dic-2024.) | $0 |
| CI/CD | GitHub → Railway | Push a main = deploy; Action de typecheck que bloquea push roto; Dependabot mensual. | $0 |

Descartados: **Vercel Hobby** (uso comercial prohibido explícitamente; Pro $20/mes no se justifica; el modelo request/response pelea con debounce y timers), **Render** (free duerme; Starter $7 > Railway), **Fly.io** (barato ~$5,3 pero más ops), **Hetzner VPS** (mejor HW/$ pero eres tu propio sysadmin — las horas son tu margen), **Redis/Upstash** (innecesario a este volumen; BullMQ sobre Upstash free se come la cuota por polling).

Ruta de crecimiento sin re-arquitectura: Supabase Pro (+$25) cuando haga falta no-pausa/backups gestionados; Railway absorbe 10× el volumen pagando overage.

## 8. Mantenimiento en el tiempo (qué se rompe solo)

| Qué | Frecuencia | Mitigación |
|---|---|---|
| Versión de Graph API expira (~cada 2 años; Meta saca ~3/año) | 1×/año subir versión | Versión parametrizada en config; leer changelog |
| System User token invalidado (cambio de contraseña/permisos/security reset de Meta) | Impredecible | Manejo de 401 con alerta inmediata (Better Stack + Sentry) |
| Templates pausados por calidad (3 h → 6 h → permanente) o recategorizados utility→marketing | Ocasional | Templates estrictamente transaccionales; webhook `message_template_status_update` |
| Free tiers que cambian (ya pasó: UptimeRobot dic-24, Fly oct-24, Hetzner jun-26) | 1–2×/año | Presupuestar que algún $0 se vuelva $5–10 |
| Dependencias npm / SDK majors | Continuo | Dependabot agrupado mensual |
| DB acercándose a 500 MB | Silencioso | Purga >90 días + alerta a 350 MB |
| Modelos de Claude deprecados | ~1×/año | ID del modelo en config |
| Pausa Supabase por inactividad | Solo si el negocio para >7 días | Keep-alive diario |

**Horas realistas: 1–3 h/mes normal; picos de 4–8 h 1–2×/año. Total ~25–40 h/año.** → Esto se cobra en la mensualidad, no se regala (ver PLAN_FINANCIERO.md).

## 9. Plan por fases (tareas y estimaciones)

### Fase 0 — Preparación (4–6 h) — en paralelo con todo
- [ ] Iniciar verificación Meta Business (RUC + factura). ⏱ 2–5 días hábiles de espera.
- [ ] Confirmar elegibilidad de coexistence del número real (app ≥ 2.24.17, cuenta con uso).
- [ ] Conseguir del cliente: **Excel real del catálogo**, número del vendedor, direcciones/lat-lng de los 2 locales, logo para el PDF.
- [ ] Crear app Meta + test number; repo con CI; Railway + Supabase provisionados.

### Fase 1 — MVP: buscar por medida + cotizar + PDF (30–40 h) → **demo en ~2 semanas**
- [ ] Webhook (verify token, firma, 200 inmediato) + idempotencia + debounce + cola por usuario (6–8 h)
- [ ] Google Sheets → sync → caché + normalización de medidas del catálogo (4–6 h)
- [ ] Agente con tools `buscar_llanta` + `generar_cotizacion`; system prompt tono ecuatoriano; prompt caching (8–10 h)
- [ ] Regex de medidas + validación estricta (2–3 h)
- [ ] PDF con pdfmake + media upload + envío (4–6 h)
- [ ] Persistencia (conversaciones, cotizaciones) + pruebas con test number (6–8 h)
- **Entregable:** demo funcional con el test number: cliente manda medida → recibe cotización PDF.

### Fase 2 — Sin datos, fotos, ubicación, alertas (20–30 h)
- [ ] Tabla curada de fitment Ecuador + tool `fitment_vehiculo` + flujo de confirmación (6–8 h)
- [ ] Recepción de fotos (descarga <5 min) + visión + confirmación de medida (5–7 h)
- [ ] Ubicación: request nativo + haversine + respuesta con local (3–4 h)
- [ ] Tool `notificar_vendedor` + template utility + clasificador de etapa (Haiku, JSON estricto) (5–7 h)
- [ ] Alternativas cuando no hay stock (misma medida otra marca / medidas compatibles) (3–4 h)
- **Entregable:** flujo completo de venta de punta a punta en test number.

### Fase 3 — Producción + Hub (20–25 h)
- [ ] Onboarding del número real vía Embedded Signup + coexistence; templates aprobados (4–6 h + esperas de Meta)
- [ ] Handoff: `bot_paused` + auto-silencio con `smb_message_echoes` (3–4 h)
- [ ] Dashboard `/admin`: funnel, actividad, alertas + auth (8–10 h)
- [ ] Hardening: Sentry, Better Stack, backups pg_dump + heartbeat, keep-alive, job de purga (4–5 h)
- [ ] Piloto 1 semana con tráfico real + ajustes de prompt (incluido)
- **Entregable:** producción en el número real del negocio + hub + manual corto de uso para el dueño.

**Total estimado: 75–100 h.**

## 10. Riesgos principales

1. **Coexistence no elegible o onboarding directo trabado** (Embedded Signup requiere registro como Tech Provider) → Plan B: 360dialog €49/mes como puente, o número nuevo dedicado al bot (evitar sacar el número de la app).
2. **Verificación Meta trabada** (documentos ≠ nombre legal) → preparar RUC + factura exactos; hasta 14 días hábiles.
3. **No llega el catálogo real** → sin Excel no hay Fase 1; el HTML de SUDINCO no sirve como fuente. Bloqueo #1 hoy.
4. **Templates recategorizados/pausados** → redactar transaccional puro; monitorear webhooks.
5. **Media URL de 5 minutos** → descargar al instante en el worker.
6. **Fitment incorrecto = riesgo de seguridad** → nunca cotizar sin confirmación de medida del cliente.
7. **Cambios de precios/free tiers** → LATAM no cambió el 1-jul-2026; impacto acotado a templates ($1–10/mes a este volumen).

## 12. Funcionalidades pedidas por el cliente (14-jul-2026) — análisis

El cliente (vía Joaquín) mandó dos listas de funcionalidades deseadas por WhatsApp. Cruce contra el plan de fases ya armado:

| Pedido del cliente | ¿Ya cubierto? | Fase | Nota |
|---|---|---|---|
| Entiende mensajes escritos naturalmente | ✅ | Núcleo / F1 | Es lo que hace el LLM por defecto |
| Identifica medida, vehículo y rin | ✅ | F1 (medida) / F2 (vehículo→rin) | Ya en el plan |
| Busca alternativas compatibles | ✅ | F2 | "Alternativas cuando no hay stock" ya estaba |
| Consulta una base de inventario y precios | ✅ | F1 | Google Sheets → caché |
| Envía cotización | ✅ | F1 | PDF con pdfmake |
| Envía foto (del producto) | ⚠️ nuevo, chico | F1/F2 | No estaba explícito enviar foto del producto (sí recibirla). Fácil: columna de imagen en el Sheet + adjuntarla junto al PDF. +2–3 h |
| Detecta cuándo no sabe y entrega el chat a un humano | ⚠️ nuevo, chico | F2 | Ya había handoff *manual* (dueño toma el chat); falta el trigger *proactivo* del bot ("no sé" / cliente frustrado → tool `escalar_a_humano`). +2–3 h |
| Cambios automáticos de precio y disponibilidad | ✅ (si es vía el Sheet) | F1 | Ya cubierto por el sync — si tienen un sistema de inventario real aparte del Excel, es otra conversación (ver abajo) |
| Integración en tiempo real con inventario | ⚠️ aclarar | — | Ver "Pregunta abierta" abajo |
| Reglas comerciales diferentes por marca, margen y stock | 🆕 nuevo | F2/F3 | Factible, pero es lógica de negocio nueva (no solo mostrar el precio del Sheet, sino aplicarle reglas por marca). +6–10 h |
| Recuperación de clientes que dejaron de responder | 🆕 nuevo | **Fase 4** (fuera del alcance/precio original) | Ver abajo — cambia el modelo de costo |
| Seguimiento / seguimientos automáticos | 🆕 nuevo (mismo tema) | **Fase 4** | Ídem |
| Envía promoción y beneficios | 🆕 nuevo (marketing proactivo) | **Fase 4** | Ídem |

### Pregunta abierta: "integración en tiempo real con inventario"

Si "tiempo real" significa *"cuando el dueño edita el Excel/Sheet, el bot ya lo sabe"* → **ya está cubierto** (sync cada 5–10 min es prácticamente instantáneo para este uso). Si significa *"conectar con un sistema de inventario/POS real que ya tienen"* → es un proyecto de integración aparte, con su propio scope y precio, y cambia varias decisiones técnicas del plan (ya no Google Sheets como fuente). **Preguntar directo: ¿tienen algún sistema de inventario más allá del Excel?**

### Por qué "recuperación de clientes" y "seguimientos" van en Fase 4, no gratis dentro de las 75–100 h

Es una campaña de re-enganche proactiva (el bot le vuelve a escribir a quien se quedó callado). Dos cosas la separan del resto del bot:

1. **Ya no es gratis.** Todo lo demás vive dentro de la ventana de 24 h que abre el cliente (servicio = $0, ver §2.2). Un seguimiento a alguien que no respondió en días es un mensaje **iniciado por el negocio fuera de ventana** → template de **marketing**, ~$0,074/mensaje (6,5× el precio de una alerta utility). Con 50-100 chats/día y seguimiento a cada uno que no compró, esto puede sumar $30–80+/mes solo en mensajes — aparte del costo de tokens y de la mensualidad ya cotizada.
2. **Requiere opt-in explícito.** WhatsApp no permite reescribirle a alguien "en frío" sin su consentimiento previo — hay que pedirlo dentro de la conversación original ("¿quieres que te avisemos si baja el precio / te recordemos en unos días?") y guardarlo.
3. Es lógica nueva real: detectar "se enfrió" (¿cuánto tiempo sin respuesta?), no volver a escribirle repetidamente, evitar mandarlo a quien ya compró.

**Recomendación:** cotizarlo como **Fase 4 aparte** (~15–20 h + costo de templates de marketing), no comprimirlo en el precio ya conversado ($600 por fases + $40/mes). Es la pieza que más cambia el modelo de negocio de las que pidieron.

### Lo que sí entra fácil en las fases existentes

"Envía foto" y "escalar a humano por incertidumbre" son chicas — se agregan a Fase 1/2 sin tocar el precio ni el cronograma. "Reglas comerciales por marca/margen" es más grande pero cabe en Fase 2/3 si el cliente confirma que la quiere desde ya.

## 13. Fuentes principales

Meta: [Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) · [Coexistence](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) · [Media](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media) · [Get started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) · [Graph API versions](https://developers.facebook.com/docs/graph-api/changelog/versions/)
Infra: [Railway](https://docs.railway.com/pricing/plans) · [Supabase](https://supabase.com/pricing) · [Fly.io](https://fly.io/docs/about/pricing/) · [Render](https://render.com/pricing) · [Sentry](https://sentry.io/pricing/) · [Better Stack](https://betterstack.com/uptime) · [Vercel Hobby (no comercial)](https://vercel.com/docs/plans/hobby)
Agente: [Wheel-Size API](https://developer.wheel-size.com/) · [Google Sheets API limits](https://developers.google.com/workspace/sheets/api/limits) · [pdfmake vs Puppeteer](https://pdfbolt.com/blog/top-nodejs-pdf-generation-libraries) · [Riesgo Baileys](https://github.com/WhiskeySockets/Baileys/issues/1869)
