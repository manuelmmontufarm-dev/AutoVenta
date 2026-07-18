# AutoVenta — Bot de ventas de llantas por WhatsApp

Bot para **Depot Tire** (Quito): recibe mensajes por WhatsApp, busca llantas por
medida en el catálogo, cotiza con PDF, indica el local más cercano y alerta al
vendedor cuando el cliente confirma. Construido genérico para revenderse a
otras llanteras cambiando solo `business` en [src/config.ts](src/config.ts).

## Arquitectura

```
Cliente WhatsApp ─► Meta Cloud API ─► POST /webhook (Express, firma verificada)
                                          │ 200 inmediato
                                          ▼
                              pipeline/inbound.ts
                              (idempotencia + debounce 5s + FIFO por chat)
                                          │
                                          ▼
                              agent/agent.ts — OpenAI function calling
                              ├─ buscar_llanta        → services/catalog.ts (← Google Sheets, sync 5 min)
                              ├─ fitment_vehiculo     → domain/fitment.ts (tabla Ecuador)
                              ├─ generar_cotizacion   → services/quotePdf.ts → sendPdf()
                              ├─ local_mas_cercano    → domain/locations.ts (haversine)
                              └─ notificar_vendedor   → wa/client.ts (alerta al vendedor)
                                          │
                                          ▼
                              Postgres (Supabase): conversaciones, mensajes,
                              cotizaciones, eventos de funnel
                                          │ (post-turno, async)
                              agent/classifier.ts — Haiku clasifica etapa
```

### Capas (dónde va cada cosa al crecer)

| Capa | Carpeta | Regla |
|---|---|---|
| Transporte | `src/wa/`, `src/server/` | Solo hablar con WhatsApp/HTTP. Nada de negocio. |
| Pipeline | `src/pipeline/` | Orden, dedupe y ritmo de los mensajes. |
| Agente | `src/agent/` | Prompt, tools y loop del LLM. Las tools NO tienen lógica: delegan a services/domain. |
| Dominio | `src/domain/` | Lógica pura de llantas (parser, fitment, distancias). Sin IO — 100% testeable. |
| Servicios | `src/services/` | IO con estado: catálogo, PDF, DB. |
| Config | `src/config.ts` | Todo lo específico del cliente (Depot Tire). Multi-tenant = mover a DB. |

## Mapa de reuso (qué viene de dónde)

| Pieza | Fuente | Licencia |
|---|---|---|
| Cliente Cloud API + firma webhook + middleware Express | [whatsapp-api-js](https://github.com/Secreto31126/whatsapp-api-js) | MIT |
| Loop del agente con tools | SDK oficial [`openai`](https://github.com/openai/openai-node) + function calling | MIT |
| Catálogo desde Google Sheets | [google-spreadsheet](https://github.com/theoephraim/node-google-spreadsheet) | MIT |
| PDF de cotización | [pdfmake](https://github.com/bpampuch/pdfmake) 0.3 (layout propio) | MIT |
| Postgres | [postgres (porsager)](https://github.com/porsager/postgres) | Unlicense |
| Parser de medidas | **Propio** ([src/domain/tireSize.ts](src/domain/tireSize.ts)) — no existe librería; diseño inspirado en Gan4x4/tyresize y tires_tgcode (solo ideas, sin licencia no se copia código) | — |
| Debounce/FIFO/idempotencia | **Propio** ([src/pipeline/inbound.ts](src/pipeline/inbound.ts)) — patrón documentado (guía Hookdeck, BullMQ dedup) | — |
| Fitment Ecuador | **Propio** ([src/domain/fitment.ts](src/domain/fitment.ts)) — ⚠️ pendiente validación del dueño | — |
| Esquema de datos | Inspirado en [horoshi10v/tires-shop](https://github.com/horoshi10v/tires-shop) | MIT |

Investigación completa: [docs/INVESTIGACION_GITHUB.md](../docs/INVESTIGACION_GITHUB.md).

## Correr en local

```bash
cp .env.example .env       # llenar credenciales
npm install
npm run db:migrate         # aplica src/db/schema.sql (idempotente)
npm test                   # tests del parser de medidas
npm run dev                # tsx watch
```

Para recibir webhooks en local: `ssh -R 80:localhost:3000 nokey@localhost.run`
o cloudflared tunnel, y registrar la URL en Meta → WhatsApp → Configuration.

## Deploy (Railway)

1. Servicio desde este repo, root = `app/`. Build `npm run build`, start `npm start`.
2. Variables de `.env.example` en Railway → Variables.
3. Registrar `https://<app>.up.railway.app/webhook` en Meta con el verify token.
4. `npm run db:migrate` una vez (Railway one-off o local apuntando a Supabase).

## Estado / pendientes (Fase 1)

- [ ] **Catálogo real**: hoja de Google del dueño con columnas `codigo, marca, diseno, medida, precio, stock` (bloqueo #1 del proyecto).
- [ ] Validar la tabla de fitment con el dueño (todo está `validated: false`).
- [ ] Template utility aprobado para alertas al vendedor fuera de la ventana 24h (hoy: texto simple).
- [ ] Coexistence: auto-pausar el bot cuando el dueño responde desde su app (webhook `smb_message_echoes`) — el flag `bot_paused_until` ya existe en DB.
- [ ] Fase 2: fotos de llantas (visión del modelo + confirmación), OCR de cotizaciones de competencia.
- [ ] Fase 3: dashboard `/admin` (las tablas `funnel_events`/`quotes` ya alimentan las métricas).
