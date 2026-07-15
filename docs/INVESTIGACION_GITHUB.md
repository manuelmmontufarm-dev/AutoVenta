# Investigación GitHub — qué existe parecido a AutoVenta y qué reusar

> Fecha: 2026-07-15 · 4 barridos paralelos (~55 repos evaluados, ~15 por frente)
> Frentes: (1) stacks WhatsApp Cloud API, (2) bots de ventas/commerce completos, (3) dominio llantas, (4) PDF/Sheets/agente Claude/dashboard.

## Conclusión ejecutiva

**Nadie tiene el paquete completo.** No existe ningún proyecto open source que haga
catálogo + cotización PDF + notificación al vendedor + funnel sobre WhatsApp.
Cada pieza existe por separado con licencia MIT; el ensamblaje (y el dominio
llantas) es nuestro diferenciador. La decisión validada en PLAN_DESARROLLO.md
(Cloud API directo + agente Claude con tools) coincide con lo que hace la punta
del ecosistema.

## Descomposición: pieza → qué reusar

| Pieza | Reusar | Licencia | Notas |
|---|---|---|---|
| Cliente Cloud API + webhook (firma, media) | [whatsapp-api-js](https://github.com/Secreto31126/whatsapp-api-js) (349★, sin deps) o [whatsapp-business-sdk](https://github.com/MarcosNicolau/whatsapp-business-sdk) (168★) | MIT ✅ | También [great-detail/WhatsApp-JS-SDK](https://github.com/great-detail/WhatsApp-JS-SDK) (fork mantenido del SDK oficial de Meta, jun-2026). |
| Framework de bot (alternativa) | [BuilderBot](https://github.com/codigoencasa/builderbot) (~3k★) | MIT ✅ | Provider Meta oficial intercambiable con Baileys, flujos, estado y cola por conversación, comunidad LATAM en español. Candidato #1 si preferimos framework en vez de SDK + loop propio. |
| Loop del agente (tools) | Tool runner oficial del SDK Anthropic: [`betaZodTool` + `toolRunner`](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/examples/tools-helpers-zod.ts) | MIT ✅ | ~30 líneas, sin framework. Memoria de conversación: array `messages` por teléfono en Postgres (JSONB), propia y trivial. |
| Cotización PDF | [pdf-invoice](https://github.com/h1dd3nsn1p3r/pdf-invoice) (TS, MIT, feb-2026; soporta "estimate", i18n español) o [pdfmake](https://github.com/bpampuch/pdfmake) + [gist plantilla tusharf5](https://gist.github.com/tusharf5/034d3e0599ae87ec4033c53107965569) | MIT ✅ | pdf-invoice = atajo de 1 día (gap: logo solo SVG). pdfmake = control total del branding (2-3 días). Evitar easyinvoice (renderiza en API externa de pago). |
| Catálogo desde Google Sheets | [node-google-spreadsheet](https://github.com/theoephraim/node-google-spreadsheet) (2.5k★, v5.3.0 jun-2026) | MIT ✅ | No existe "sheet→Postgres sync" empaquetado; el job de sync son ~50 líneas propias. Fase 1: cache en memoria con TTL 5-10 min basta. |
| Parser de medidas | **Escribir propio** (~50 líneas, una tarde) | — | No hay librería npm/PyPI. Referencias de diseño: [Gan4x4/tyresize](https://github.com/Gan4x4/tyresize) (PHP, métrico+pulgadas+conversiones) y regexes tolerantes de [tires_tgcode](https://github.com/ricilandolt/tires_tgcode). Ambos SIN licencia → portar ideas, no copiar. Validar rangos: width 125–445, aspect 25–85, rim 10–24. |
| Modelo de datos tienda de llantas | [horoshi10v/tires-shop](https://github.com/horoshi10v/tires-shop) (Go, MIT, activo jun-2026) | MIT ✅ | Único repo MIT con dominio completo: productos/lotes/stock/bodegas/órdenes vía bot de mensajería (Telegram). Copiar el esquema de datos. |
| Fitment vehículo→medida | [Wheel-Size API](https://developer.wheel-size.com/) (sandbox gratis 300 hits/día; $450/año prod) | Comercial | Confirma el plan: NO hay dataset abierto de fitment. Tabla curada de ~50 modelos Ecuador sigue siendo la ruta correcta para Fase 2. Scrapers = riesgo legal, descartados. |
| Foto de llanta → medida (Fase 2) | Visión del propio LLM | — | Los repos de OCR de flanco ([esolnguyen](https://github.com/esolnguyen/tire-sidewall-text-extraction), Roboflow) confirman: Tesseract falla en negro-sobre-negro y todos terminan usando un VLM. Nuestro plan (Claude vision + confirmación) es el estado del arte simplificado. |
| Debounce / colas / idempotencia | Patrón propio (~100-200 líneas) | — | No hay librería empaquetada. Referencias: [BullMQ](https://github.com/taskforcesh/bullmq) dedup con `id`+delay, [guía Hookdeck](https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices) (200 inmediato + dedupe por `message.id`). Sin Redis a nuestro volumen: en memoria. |
| Funnel / panel vendedor (Fase 3) | [wacrm](https://github.com/ArnasDon/wacrm) (1.6k★, MIT, Next.js+Supabase) | MIT ✅ | Kanban de ventas ligado a conversaciones, broadcasts, handoff, pensado para forkear y rebrandear. Alternativa pesada: [Chatwoot](https://github.com/chatwoot/chatwoot) (MIT core) — su AgentBot API es el patrón canónico de pausa bot→humano. |
| Dashboard simple (Fase 1-2) | [tremor template-dashboard-oss](https://github.com/tremorlabs/template-dashboard-oss) (Apache 2.0) o shadcn Vite template | ✅ | Componentes KPI/gráficos listos; servido por el mismo Express bajo `/admin`. |

## Referencias de arquitectura (leer, no copiar)

- [wassengerhq/whatsapp-chatgpt-bot](https://github.com/wassengerhq/whatsapp-chatgpt-bot) (MIT) — mejor diseño de loop LLM + function calling multimodal para WhatsApp.
- [bibinprathap/whatsapp-chatbot](https://github.com/bibinprathap/whatsapp-chatbot) (132★, MIT) — pipeline NL→carrito→pedido + recuperación de carritos por cron (útil para las campañas de seguimiento que pidió el cliente el 14-jul).
- [adithyadilum/wa-demo-shop-bot](https://github.com/adithyadilum/wa-demo-shop-bot) (sin licencia) — el más cercano funcionalmente: Cloud API + Meta Commerce Catalog + carrito + handover con pausa del bot. Solo ideas.
- [skorokithakis/stavrobot](https://github.com/skorokithakis/stavrobot) (185★, **AGPL** ⚠️) — stack exacto (WhatsApp+Claude+Postgres), memoria en 3 niveles. Referencia arquitectónica; no copiar código.
- [CaveMindLabs/whatsapp-fastapi-agent](https://github.com/CaveMindLabs/whatsapp-fastapi-agent) (Python) — Cloud API + tool calling + memoria por usuario, blueprint completo.

## Minas de licencia (evitar código)

- **AGPL-3.0**: ticketz/forks de Whaticket, stavrobot, Plausible → si se vende modificado hay que liberar el código.
- **FSL-1.1**: Typebot → prohíbe uso comercial competidor.
- **GPL-3.0**: j05u3/whatsapp-cloud-api-express → copiar el patrón, no la dependencia.
- **Apache con condiciones extra**: Evolution API (cláusula de marca/logo) → incómodo para marca blanca.
- **Sin licencia** (wa-demo-shop-bot, bot-ventas, tyresize, Gan4x4…): legalmente no copiables; solo referencia de diseño.

## Decisión de arquitectura pendiente

Dos caminos viables, ambos MIT:

1. **SDK + loop propio** (plan actual de PLAN_DESARROLLO.md): `whatsapp-api-js` + tool runner Anthropic + Express. Menos dependencias, control total, todo el bot ~1.500 líneas nuestras.
2. **BuilderBot como esqueleto**: flujos/estado/cola por conversación ya resueltos + provider Meta oficial; se le inyecta el loop de Claude. Más rápido para el demo, comunidad hispana, y permite demo con Baileys → producción con Meta sin tocar lógica.

Recomendación: **camino 1 para producción** (coincide con el plan y el volumen es bajo), usando BuilderBot solo si el demo de 1-2 semanas se aprieta.
