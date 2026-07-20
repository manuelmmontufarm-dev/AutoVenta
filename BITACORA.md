# Bitácora AutoVenta

> **Qué es esto:** el registro cronológico de TODO lo que se hace en el proyecto.
> Cada commit tiene su entrada: qué cambió, **por qué**, y cuánto tiempo tomó.
> Sirve para que cualquier sesión de chat (o cualquier persona) lea esto primero
> y esté al día sin tener que reconstruir el contexto desde cero.

---

## 📌 Reglas (obligatorio)

1. **Cada commit añade una entrada nueva aquí**, arriba de todo (más reciente primero).
2. La entrada lleva: **fecha**, **qué se hizo**, **por qué se hizo**, y **horas estimadas**.
3. El "por qué" es lo más importante — el "qué" ya está en el diff; el "por qué" no.
4. Esto está **forzado por un git hook**: si intentas commitear sin tocar `BITACORA.md`,
   el commit se bloquea (ver más abajo cómo activarlo). Para saltarlo en un caso
   excepcional: `git commit --no-verify`.

### Cómo activar el hook (una sola vez por clon del repo)
```bash
git config core.hooksPath .githooks
```
Después de esto, cada `git commit` verifica que `BITACORA.md` esté en el commit.
Ya viene activado en este equipo.

---

## ⏱️ Resumen de horas (para las cuentas)

> Estimados de **tiempo humano invertido** (dirigir, revisar, probar, decidir) — no reloj de pared.
> Ajustables. Actualizar el total al añadir cada entrada.

| Fecha | Commit | Tema | Horas |
|---|---|---|---|
| 2026-07-20 | _(este mismo)_ | Cotizador funcional con inventario Contífico, fotos, tres flujos y bot compartido | 6.0 |
| 2026-07-20 | _(este mismo)_ | Sistema Showroom GP documentado y aplicado a todo el hub | 2.0 |
| 2026-07-18 | _(este mismo)_ | Fix handoff: guardar mensajes del cliente con bot pausado + typing honesto | 0.5 |
| 2026-07-18 | _(este mismo)_ | Racing Heritage aplicado a todo el frontend + hub compacto | 1.0 |
| 2026-07-18 | _(este mismo)_ | Demo del Hub en 4 estilos: temas CSS (showroom/racing/neobrutalista) + deploy | 1.5 |
| 2026-07-18 | _(este mismo)_ | Herramientas de operación en línea: /mensajes, /configuracion/ia, /tester | 2.5 |
| 2026-07-18 | _(este mismo)_ | Deploy en Railway en vivo: root dir, dominio, fix EBUSY del build | 1.0 |
| 2026-07-18 | _(este mismo)_ | Migración del agente de Anthropic a OpenAI GPT | 1.5 |
| 2026-07-18 | _(este mismo)_ | Preparar deploy en Railway (schema al boot, catálogo opcional, railway.toml) | 1.0 |
| 2026-07-17 | _(este mismo)_ | Publicación del hub completo en Vercel | 0.5 |
| 2026-07-17 | _(este mismo)_ | Hub interno centralizado + demo visual + documentación navegable | 2.0 |
| 2026-07-16 | _(este mismo)_ | Respuesta del cliente (audio) + pivote a Contífico + transcripción | 1.0 |
| 2026-07-15 | _(pendiente)_ | Esqueleto Fase 1 del bot (app/) + investigación de reuso GitHub | 5.0 |
| 2026-07-15 | _(pendiente)_ | Webhook (recibir) + setup app Meta en vivo + ngrok + prueba e2e + investigación GitHub + bitácora | 4.0 |
| 2026-07-15 | 6feb1f5 | Simulador: reencuadre "lo que pierdes hoy" | 0.5 |
| 2026-07-15 | abcc2a7 | Empresa confirmada Depot Tire + propuesta en verde/horas | 1.5 |
| 2026-07-15 | c53a059 | Rework propuesta a 5 fases + simulador de ahorro | 2.5 |
| 2026-07-15 | 971c70c | Doc HTML de reunión (fuente del PDF al cliente) | 2.0 |
| 2026-07-15 | 21df44f | wa-tester: leer .env fresco por request | 0.5 |
| 2026-07-14 | e355591 | Herramienta wa-tester (enviar) + guía operativa WhatsApp | 3.0 |
| 2026-07-14 | ac09171 | Ubicaciones de locales + análisis de features del cliente | 1.5 |
| 2026-07-13 | feadf57 | Brief + plan de desarrollo + plan financiero + catálogo | 4.0 |
| 2026-07-13 | d997844 | Commit inicial (repo) | 0.25 |
| | | **TOTAL** | **~45.25 h** |

---

## Entradas (más reciente primero)

### 2026-07-20 · Cotizador funcional conectado a Contífico · ⏱️ 6.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Se agregó el tab `Cotizador` al Hub con búsqueda por medida, código, marca o diseño y filtros independientes por marca y disponibilidad.
- Contífico es ahora la fuente primaria del catálogo: los productos se normalizan, cachean y conservan en memoria ante una falla de sincronización. Google Sheets queda como fallback.
- Se centralizaron las reglas de búsqueda, precio y disponibilidad para que las usen tanto el Hub como las herramientas del bot.
- Se separaron explícitamente tres salidas comerciales: **opciones filtradas** (todas las tarjetas visibles, agrupadas por marca), **comparación** (2–3 alternativas, sin cantidad ni total conjunto) y **cotización final** (un solo modelo decidido, con cantidad y total).
- Opciones filtradas genera mensaje distribuidor, mensaje cliente final e imagen para WhatsApp. Comparación y cotización final generan cada una su propio mensaje, imagen y PDF.
- Se añadió un manifiesto local de fotos limpias por marca + diseño, con los 38 diseños y 375 productos cubiertos desde fabricantes y distribuidores identificados, además de su registro de procedencia.
- Se incorporaron índice de carga/velocidad, garantía de fábrica, cobertura contra golpes, precio lista, precio hoy y descuento en tarjetas, mensajes e impresos.
- Se añadieron endpoints protegibles por `ADMIN_KEY`, configuración sin secretos, pruebas unitarias y el build actualizado del demo Showroom GP.

**Checks:** catálogo real de 375 llantas cotizables; búsqueda real por `205/55R16`;
36 tests; typecheck de backend y frontend; ambos builds; 100% de cobertura visual; filtros, mensajes,
comparación y cotización probados desde la interfaz; ambos PDF renderizados a
PNG y revisados visualmente sin recortes ni desbordes.

**Por qué:** Permite demostrar desde ahora el flujo comercial central de Interbot
con datos propios de Depot Tire, sin depender de su aplicación ni copiar su base
privada. El mismo dato y la misma regla alimentan al vendedor y al bot, evitando
precios o stock diferentes entre canales.

---

### 2026-07-20 · Sistema Showroom GP en todo el hub · ⏱️ 2.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Se creó `DESIGN.md` como fuente de verdad de Showroom GP: principios, paleta, tipografía, componentes, lenguaje racing, sonido, movimiento, responsive, accesibilidad y criterios de aceptación.
- La capa global del hub ahora agrega de forma consistente telemetría, carros, llantas, circuito, líneas de velocidad y placas técnicas, siempre fuera del contenido y con opacidad baja.
- Se unificaron tarjetas, campos, botones, estados, modales, documentos y el catálogo Pitstop con el showroom claro; se eliminó visualmente el patrón cuadriculado de las áreas de contenido.
- El sonido global cubre todos los enlaces y botones, conserva la preferencia entre páginas y mantiene un control visible para apagarlo.
- Showroom GP pasó a ser el tema por defecto y todos los accesos operativos apuntan al demo oficial; Racing Heritage y las otras direcciones quedan como referencias históricas comparables.
- `DESIGN.md` también se renderiza dentro del hub como documento navegable.

**Por qué:**
- La dirección híbrida ya fue aprobada por el usuario: la simplicidad del showroom facilita entender el producto y los detalles de carreras generan la emoción que sus clientes buscan. Documentarlo y convertirlo en una capa compartida evita que nuevas pantallas vuelvan a verse como productos distintos.

---

### 2026-07-18 · Fix handoff: mensajes con bot pausado + typing honesto · ⏱️ 0.5 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- **Bug:** con el bot pausado (handoff tras envío manual desde /mensajes), los mensajes del cliente se descartaban ANTES de guardarse — no aparecían en el panel, justo cuando el dueño más necesita leerlos. Además `received("text")` mostraba "escribiendo…" en cada mensaje entrante, aunque el bot estuviera pausado y nunca fuera a contestar.
- **Fix en `app/src/index.ts`:** el pipeline ahora guarda el mensaje (con idempotencia) y actualiza funnel/etapa ANTES del check de pausa; si está pausado, calla pero todo queda en el panel. El typing se movió a después del check: `showTyping()` (nuevo helper en `wa/client.ts` = markAsRead + indicador) solo cuando el bot sí va a responder. El handler de webhook ahora solo marca leído (`received()` sin argumento).
- Typecheck limpio y los 21 tests pasan.

**Por qué:**
- Prueba real del dueño: escribió al número, el mensaje no salía en el panel, y WhatsApp mostraba "escribiendo…" sin respuesta — parecía bot roto cuando en realidad estaba pausado por los envíos manuales de prueba. Ahora el panel es la fuente de verdad del chat y el typing no miente.

---

### 2026-07-18 · Racing Heritage en todo el frontend + hub compacto · ⏱️ 1.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Decisión tomada: **Racing Heritage (estilo 04) es el elegido**. Se aplicó a todas las superficies: hub (`/`), mensajes de WhatsApp, configuración de IA, WA tester, galería de estilos y el demo React (`/demo/` ahora arranca en racing por defecto; `?theme=aurora` conserva el tema anterior).
- El hub se reorganizó para ser más compacto: documentación, negocio y plataformas pasaron de cards grandes a filas densas de una línea; la demo destacada es una card navy con franja de pit lane y los 4 estilos como pills (racing marcado 🏆); operación queda en 4 cards compactas.
- Las herramientas (mensajes/config/tester) solo cambiaron de `<style>` — el JS y el HTML quedaron intactos, así que la lógica de Codex (API, gate ADMIN_KEY, polling) no se tocó.
- La galería `/estilos/` quedó en crema racing con la card 04 marcada "🏆 elegido" y la botonera reordenada.

**Por qué:**
- Feedback directo: "el Racing Heritage ux y color pallet ganó". Un solo lenguaje visual en todo el proyecto — de la landing al tester — para que se sienta producto y no colcha de retazos.

---

### 2026-07-18 · Demo del Hub en 4 estilos · ⏱️ 1.5 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- El demo del Hub ahora existe en 4 estilos completos, hosteados en Railway: `/demo/` (Claude × Aurora, el actual), `/demo-showroom/` (estilo 03), `/demo-racing/` (estilo 04) y `/demo-neobrutalista/` (estilo 05). La galería `/estilos/` tiene la botonera para abrirlos.
- Cómo: el hub se retematizó por design tokens. Los ~60 colores hardcodeados de los componentes pasaron a tokens/`color-mix` sobre `--color-paper` (se invierten solos en temas claros); etapas del funnel, cierres, avatares y confetti ahora son variables CSS con gama propia por tema. El documento de cotización quedó "papel literal" (un PDF es blanco en cualquier tema).
- 3 hojas de tema en `hub/src/design/themes/` activadas por `<html data-theme>`, que se deduce de la URL (`/demo-racing/` → racing). Un solo build de Vite (base `./`) copiado a las 4 rutas.
- Fidelidad a las páginas de estilos: neobrutalista con bordes 3px negros, sombras duras y chips negro/amarillo; racing con navy, Archivo Black y placa de box; showroom blanco con sombras suaves y rojo con cuentagotas.
- Verificado en dev server pantalla por pantalla (inbox, kanban, chat, dashboard) en los 4 temas; el tema por defecto quedó idéntico.

**Por qué:**
- Para la decisión de estilo con Joaquín: comparar mockups estáticos no es lo mismo que usar la app real en cada dirección visual. Ahora los 4 se pueden abrir lado a lado desde el hub.

---

### 2026-07-18 · Herramientas de operación en línea · ⏱️ 2.5 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Las 3 tarjetas del hub que decían "requiere dashboard local" (localhost:3001/3000) ahora funcionan en la URL de Railway: `/mensajes`, `/configuracion/ia` y `/tester`.
- API nueva `/api/*` en el bot: listar conversaciones y mensajes reales de Postgres, envío manual (pausa el bot en ese chat, mismo handoff que responder desde el celular), pausar/reactivar bot, configuración de IA, y envío directo del tester.
- Tabla `settings` (key/value jsonb): guarda personalidad, tono, emojis, longitud y cierre 🤝. `runAgent` los inyecta al system prompt en cada respuesta (cache 30 s).
- Protección con `ADMIN_KEY` opcional: si la variable existe en Railway, el navegador pide la clave una vez. Los errores de Meta se responden como 502 para no confundirlos con el 401 del login.
- Probado en local con Postgres temporal: lista, chat, pausa, guardado de config y errores del tester.

**Por qué:**
- Esas herramientas solo servían con un dashboard local que ni siquiera existe en el repo — el dueño necesita ver los chats y probar el bot desde cualquier lado. El tester local (tools/wa-tester) queda como respaldo de desarrollo; la versión en línea usa el token que ya vive en Railway.

---

### 2026-07-18 · Hub completo servido desde Railway · ⏱️ 0.5 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- `site/` se movió a `app/site/` — Railway solo incluye el Root Directory (`app/`) en el build, así que el hub tenía que vivir adentro.
- El servidor Express del bot ahora sirve el hub estático completo (`express.static` con `extensions: ["html"]`, que replica las cleanUrls de Vercel): raíz, `/estilos/` con las 9 paletas, `/docs/` y `/demo/`.
- `vercel.json` actualizado a `outputDirectory: "app/site"` para que el deploy de Vercel siga funcionando mientras exista.
- Smoke test local: las 9 paletas responden 200 con y sin `.html`, igual que docs, PDF y assets del demo.

**Por qué:**
- Centralizar todo en Railway: las paletas de estilos daban 404 en `autoventa-production.up.railway.app` porque ese servicio solo corría el bot. Ahora la misma URL sirve bot + hub.

---

### 2026-07-18 · Deploy en Railway en vivo · ⏱️ 1.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Proyecto Railway `cheerful-solace`: Postgres online + servicio AutoVenta desde GitHub.
- Se aplicaron las 7 variables que estaban en borrador (el "Apply changes" nunca se había pulsado).
- **Root Directory `/app` configurado** — era la causa del primer "Build failed" (Railway buildeaba la raíz del repo, sin package.json).
- Dominio público generado: `autoventa-production.up.railway.app` (puerto 3000).
- **Fix del segundo build fallido**: quitar `buildCommand` custom del `railway.toml`. Nixpacks monta un cache Docker en `node_modules/.cache` y nuestro `npm ci` no podía borrarlo (`EBUSY`). Nixpacks ya corre install+build solo.
- Token de WhatsApp verificado contra la Graph API (responde el test number ✅).

**Por qué:**
- Decisión de centralizar todo en Railway ($5/mes) sin Vercel. El deploy estaba "configurado" pero nunca aplicado ni con root directory — el bot no había corrido nunca. Pendientes detectados: `SELLER_PHONE=593` incompleto, y el token de WhatsApp es el mismo del wa-tester (posible 24h — funciona hoy, generar permanente).

---

### 2026-07-18 · Migración del agente a OpenAI GPT · ⏱️ 1.5 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Se reemplazó `@anthropic-ai/sdk` por el SDK oficial `openai`.
- El agente ahora usa `OPENAI_API_KEY`, GPT-4o mini por defecto y function
  calling para las cinco herramientas de ventas.
- El clasificador de funnel ahora usa la misma API de OpenAI con salida JSON.
- Se actualizaron `app/.env.example`, README, plan técnico e investigación para
  que Railway ya no solicite `ANTHROPIC_API_KEY`.
- Typecheck y las 21 pruebas existentes pasan correctamente.

**Por qué:**
- La cuenta y el saldo disponibles para este piloto son de OpenAI, no de
  Anthropic. Mantener el SDK anterior habría dejado el deploy de Railway
  configurado con el proveedor equivocado aunque el webhook estuviera listo.

**Railway:**
- Reemplazar `ANTHROPIC_API_KEY` por `OPENAI_API_KEY`.
- Opcionalmente fijar `OPENAI_MODEL=gpt-4o-mini`; ese es el valor por defecto.

---

### 2026-07-18 · Preparar deploy del bot en Railway · ⏱️ 1.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- `railway.toml` en `app/`: build `npm ci && npm run build`, start `npm start`, healthcheck `/health`.
- `db/schema.ts`: esquema inline + `ensureSchema()` que corre **al arrancar** (idempotente) → deploy de un clic, sin paso manual de migración. `migrate.ts` queda como opción manual.
- `db/client.ts`: SSL configurable (`PGSSL=require`) — Railway Postgres (red interna) no usa SSL; Supabase sí.
- Catálogo **opcional**: si faltan las credenciales de Sheets, el bot igual arranca y levanta el webhook (solo no cotiza con precios hasta conectarlo). Permite desplegar ya, con el catálogo pendiente (bloqueo #1 / Contífico).
- Root route `/` simple (evita 404 al abrir la URL; ahí irá el landing).
- Boot verificado: parsea config, importa todo y aplica schema; typecheck + 21 tests ✅.

**Por qué:**
- Decisión de centralizar TODO en Railway (una sola plataforma, $5/mes) en vez de Vercel+Railway. El bot es un proceso always-on (webhooks, sync, estado en memoria) → serverless no sirve. Hacer el catálogo opcional y el schema automático deja el deploy a "conectar repo + pegar variables", sin bloquear el despliegue por el catálogo que aún no está.

---

### 2026-07-17 · Hub publicado en Vercel · ⏱️ 0.5 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Se vinculó el repositorio local al proyecto existente `acesso-aefa4bef/auto-venta`.
- Se desplegó `site/` completo a producción: portada, demo, paletas, planes,
  documentos, catálogo y propuestas.
- Se verificaron por HTTP las rutas principales y el PDF publicado.
- Se añadió `.gitignore` para excluir `.vercel` y cualquier `.env*` local.

**Por qué:**
- El hub necesitaba una URL estable, accesible sin levantar servidores locales.
  La vinculación explícita evita crear proyectos duplicados y la exclusión de
  archivos de entorno protege tokens y metadatos locales de Vercel.

---

### 2026-07-17 · Hub interno centralizado de AutoVenta · ⏱️ 2.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Nuevo centro de recursos estático en `site/`, listo para abrir localmente o
  publicar con Vercel.
- Accesos centralizados al demo de producto, inbox, pipeline, métricas, dashboard
  real de WhatsApp, configuración de IA y tester técnico.
- Galería con las 9 direcciones de diseño, catálogo de referencia, planes por
  fases, documentación técnica, bitácoras y propuestas comerciales.
- Enlaces directos a GitHub, Meta for Developers, Business Settings y OpenAI,
  claramente diferenciados de los recursos locales y las demos simuladas.
- Generador de documentos Markdown → HTML y build verificado del frontend React.

**Por qué:**
- El proyecto ya acumulaba demos, planes, propuestas y herramientas en rutas
  diferentes. Una portada interna —siguiendo el patrón del hub de Mesita— reduce
  el tiempo de búsqueda y evita confundir una demo simulada con una herramienta
  conectada a producción. El hub solo guarda enlaces y documentos; nunca secretos.

---

### 2026-07-16 · Respuesta del cliente + pivote a Contífico · ⏱️ 1.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Transcripción del audio de respuesta de Joaquín (whisper local, `docs/respuesta-cliente-16jul.txt`).
- `PROYECTO.md §12`: análisis de la respuesta (le encantó, quiere pagar completo no por fases, inventario en Contífico) + implicaciones y nuevo pendiente #1.
- `PLAN_DESARROLLO.md §5`: fuente del catálogo cambia de Google Sheets → **API de Contífico** (Sheets queda como plan B).
- Guardado en `docs/` la propuesta enviada (`propuesta-autoventa.pdf`) y la transcripción.

**Por qué:**
- La respuesta del cliente cambia dos decisiones de fondo: (1) modelo de pago (completo con hitos, no fase por fase) y (2) la fuente de datos del inventario (Contífico en vez de Excel/Sheets). Contífico da stock en tiempo real real —lo que él pidió desde el inicio— y Manu ya lo integró en Mesita/Jardín Express, así que es ventaja, no riesgo. Registrar esto ahora evita reconstruir el contexto y marca el pendiente real (acceso al Contífico, no el Excel).

---

### 2026-07-15 · Esqueleto Fase 1 del bot (app/) · ⏱️ 5.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- **`app/`**: proyecto TypeScript por capas — el bot real de Fase 1.
  - `wa/`, `server/`: webhook Meta Cloud API con firma verificada (whatsapp-api-js).
  - `pipeline/inbound.ts`: anti-caos propio (idempotencia + debounce 5s + FIFO por chat).
  - `agent/`: agente Claude con 5 tools (tool runner oficial + Zod) + clasificador de funnel con Haiku.
  - `domain/`: parser de medidas propio (21 tests ✅), fitment ~30 vehículos Ecuador (sin validar), haversine locales.
  - `services/`: catálogo Google Sheets→cache, cotización PDF (pdfmake, probado ✅), Postgres.
  - `db/schema.sql`: conversaciones/mensajes/cotizaciones/funnel + flag de handoff.
- **`docs/INVESTIGACION_GITHUB.md`**: barrido de ~55 repos reusables (qué reusar vs construir, licencias).

**Por qué:**
- Antes de escribir desde cero, investigar qué ya existía → nadie tiene el paquete completo, pero las piezas de fontanería (webhook, loop del agente, PDF, Sheets) son librerías MIT probadas. Reusarlas baja riesgo (firma del webhook, idempotencia) y ahorra semanas; el valor propio queda en parser de medidas, fitment y el ensamblaje.
- Config del negocio aislada en `config.ts` para poder revender el bot a otra llantera sin tocar código.

---

### 2026-07-15 · Webhook para recibir mensajes + setup de la app Meta en vivo · ⏱️ 4.0 h
**Commit:** _(pendiente — este mismo)_

**Qué se hizo:**
- **`tools/webhook/`**: servidor Express que **recibe** mensajes de la Cloud API.
  Hace el handshake de verificación (`GET /webhook` con verify token), valida la
  firma HMAC-SHA256 (`X-Hub-Signature-256`) con el App Secret, y loguea cada
  mensaje entrante (texto, imagen, ubicación, documento) y los estados de entrega.
  Lee `.env` fresco por request, mismo patrón que el wa-tester.
- Setup completo de la app de Meta en el dashboard **en vivo**: app creada
  (`AutoVenta`, App ID `1053180323906811`), test number `+1 555 169-8138`
  reclamado, token permanente generado, webhook conectado vía **ngrok**
  (`https://overdraft-client-stark.ngrok-free.dev`), campo `messages` suscrito.
- **Prueba end-to-end exitosa**: el botón "Test" de Meta disparó un POST real que
  llegó, pasó la validación de firma y se parseó correctamente. Toda la tubería
  (Meta → ngrok → webhook → parseo) funciona.
- **`docs/INVESTIGACION_GITHUB.md`**: barrido de ~55 repos open source similares
  (de otra sesión) — conclusión: nadie tiene el paquete completo; hay piezas MIT
  reusables (whatsapp-api-js, BuilderBot). Se conserva como referencia de build.
- **`BITACORA.md`** (este archivo) + git hook que la vuelve obligatoria.
- **Seguridad**: se blindó `tools/wa-tester/.gitignore` para que los backups de
  `.env` (que contienen tokens) nunca lleguen a git.

**Por qué:**
- El wa-tester solo **enviaba**; un bot necesita **escuchar** al cliente. El webhook
  es la pieza que faltaba para poder responder automáticamente (siguiente paso: Claude).
- Se hizo el setup en vivo para **validar que la Cloud API funciona de verdad**
  antes de invertir en la lógica del bot — de-risking temprano.
- **Hallazgo clave**: los mensajes reales desde el celular NO llegan mientras la app
  esté sin publicar (modo desarrollo). El botón "Test" y payloads simulados sí
  sirven para construir toda la Fase 1. Publicar se pospone a Fase 3 (junto con la
  verificación de negocio de Depot Tire), porque publicar ahora exige política de
  privacidad y no desbloquea nada del desarrollo.

**Estado / próximos pasos:**
- ⏭️ Conectar el webhook con Claude (que el bot **responda** solo, no solo loguee).
- ⏭️ Catálogo mock (Google Sheet de prueba) para programar `buscar_llanta` sin
  esperar el Excel real del cliente (**bloqueo #1**).
- ⚠️ Regenerar el token permanente (se vio parcialmente en un screenshot).
- ⚠️ ngrok da URL nueva cada vez que reinicia → en producción se reemplaza por
  Railway con URL fija.

---

### 2026-07-15 · Simulador: reencuadre "lo que pierdes hoy" · ⏱️ 0.5 h
**Commit:** `6feb1f5`

**Qué:** El simulador de la propuesta ahora dice explícito que es el **costo actual
del tiempo del dueño** (no el precio del bot). Slider de valor/hora bajó de máx 15 a 10;
se quitó el escenario de 8 horas.

**Por qué:** Feedback del cliente — se malinterpretaba como si fuera el precio del
servicio. El reencuadre hace la cuenta más honesta y menos confusa.

---

### 2026-07-15 · Empresa confirmada: Depot Tire + propuesta en verde/horas · ⏱️ 1.5 h
**Commit:** `abcc2a7`

**Qué:** `PROYECTO.md` con el perfil completo de **Depot Tire** (tiredepotec.com):
2 locales en Quito con direcciones, teléfono, horario L–S 8:30–17:30, marcas
Kenda/Sunoco/Eurolub, 30+ años, promo 10% primer servicio, sin catálogo/precios
en su web. Propuesta: paleta de rojo → **verde** WhatsApp; montos por fase
reemplazados por **horas de esfuerzo**; cobro reformulado como por-fase + mensualidad.

**Por qué:** El cliente confirmó el nombre real del negocio — resuelve el misterio
"Depot Tire vs Pit Stop" de los mapas. Cambiar a horas evita anclar un precio
cerrado antes de conocer el volumen real de chats. Confirma que la fuente de datos
será el Excel del dueño (su web no tiene catálogo).

---

### 2026-07-15 · Rework propuesta: 5 fases + simulador de ahorro · ⏱️ 2.5 h
**Commit:** `c53a059`

**Qué:** Nueva estructura de fases según lo conversado con el cliente:
(1) bot IA que responde + ubicación + alerta simple, (2) cotizaciones PDF + avisa
cuando no entiende, (3) fotos + comprensión total, (4) dashboard KPIs, (5) "no
vuelves a abrir WhatsApp". Cada fase con chip de precio y entregable "Te llevas".
Caja de mantenimiento mensual. Simulador de ahorro interactivo.

**Por qué:** La estructura de 3 fases anterior mezclaba entregables. Separar en 5
deja que el cliente **apruebe y pague por fase viendo cada una funcionar** —
reduce su riesgo percibido y hace el "sí" más fácil.

---

### 2026-07-15 · Doc HTML de reunión (fuente del PDF al cliente) · ⏱️ 2.0 h
**Commit:** `971c70c`

**Qué:** One-pager editorial espejando el formato de Jardín Express: hero oscuro
con motivo de llanta + acento verde WhatsApp, resumen de situación, preguntas
abiertas, y el plan por fases con comparaciones HOY vs CON. Renderiza a PDF.

**Por qué:** El cliente necesita algo tangible y bien presentado para decidir con
su papá. Un PDF profesional comunica seriedad mejor que un chat.

---

### 2026-07-15 · wa-tester: leer .env fresco por request · ⏱️ 0.5 h
**Commit:** `21df44f`

**Qué:** El server cargaba el token una vez al arrancar; ahora re-lee `.env` en cada
`/send` y `/config`. Guardas el archivo y funciona al instante, sin reiniciar.

**Por qué:** Los tokens de prueba expiran cada 24 h; reiniciar el server cada vez
que se pega uno nuevo era fricción innecesaria durante las pruebas.

---

### 2026-07-14 · Herramienta wa-tester (enviar) + guía operativa · ⏱️ 3.0 h
**Commit:** `e355591`

**Qué:** `tools/wa-tester/`: mini app Express con interfaz web para **enviar**
mensajes por la Cloud API (test number). El token vive en `.env` local (gitignored),
nunca en el browser ni el repo. Muestra en español claro los errores de ventana de
24 h y token expirado. `WHATSAPP_BUSINESS.md`: guía paso a paso del setup de la API.

**Por qué:** Antes de construir el bot, había que **probar que se puede mandar un
mensaje real** por la API. Esta herramienta valida credenciales end-to-end y sirve
de sandbox manual. La guía destila la doc de Meta a lo que realmente usamos.

---

### 2026-07-14 · Ubicaciones de locales + análisis de features del cliente · ⏱️ 1.5 h
**Commit:** `ac09171`

**Qué:** `PROYECTO.md`: 2 ubicaciones de los locales (con la discrepancia de nombre
Depot Tire vs Pit Stop marcada). `PLAN_DESARROLLO.md`: análisis feature-por-feature
del pedido del cliente contra las fases; campañas de recuperación/seguimiento
marcadas como Fase 4 nueva (cambia el modelo de costo — templates de marketing + opt-in).

**Por qué:** El cliente mandó una lista de funcionalidades deseadas; había que cruzarlas
con el plan para saber qué ya estaba cubierto, qué era nuevo, y qué cambiaba el precio.

---

### 2026-07-13 · Brief + plan de desarrollo + plan financiero + catálogo · ⏱️ 4.0 h
**Commit:** `feadf57`

**Qué:** `PROYECTO.md` (brief: contexto, flujo, fases), `PLAN_DESARROLLO.md` (plan
técnico con research verificado), `PLAN_FINANCIERO.md` (costos de operación y precio),
`docs/` (catálogo HTML recibido del cliente — propuesta SUDINCO).

**Por qué:** Fundación del proyecto. Investigar factibilidad técnica (WhatsApp Cloud
API directo vs BSP, stack, costos reales) y de precio antes de comprometerse con el
cliente. Todo el research está verificado contra fuentes oficiales.

---

### 2026-07-13 · Commit inicial · ⏱️ 0.25 h
**Commit:** `d997844`

**Qué:** Repo creado con README.

**Por qué:** Arranque del control de versiones.
