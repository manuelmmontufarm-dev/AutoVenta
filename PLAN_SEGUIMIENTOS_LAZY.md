# Plan — Seguimientos "perezosos" (generar al enviar, no al responder)

> Objetivo: dejar de gastar tokens **y** templates de WhatsApp en seguimientos que
> nunca se envían (el cliente respondió, compró, o el asesor cerró el ticket antes).
> Regla de oro: **no generar ni mandar nada que pueda no usarse.**

## El problema hoy

Cuando una conversación se enfría, el sistema **pre-genera** los N mensajes de
seguimiento (aparecen a la derecha) y los **manda automáticamente** a su hora.
Se paga por adelantado por mensajes que muchas veces se descartan:

- **Tokens** quemados generando drafts que no salen (chico, ~$0,0005 c/u en gpt-4o-mini).
- **Templates de Meta** (~$0,074 c/u) — el costo grande, porque un seguimiento fuera
  de la ventana de 24 h es un template de marketing. Ese es el gasto que duele.

## El cambio en una frase

El seguimiento se guarda como **una cita (cuándo + a quién + contexto), no como texto**.
El texto se genera **en el último momento**: al enviar, o cuando el asesor aplasta
**Generar** — y solo si en ese momento **todavía tiene sentido mandarlo**.

## Modelo de datos

Fila de seguimiento (una por mensaje programado):

| Campo | |
|---|---|
| `estado` | `programado` → `generado` → `enviado` / `cancelado` |
| `enviar_en` | timestamp objetivo |
| `texto` | **null** hasta que se genera (perezoso) |
| `conversacion_id` / `ticket_id` | puntero al contexto (no se copia el historial) |
| `motivo_cancelacion` | "cliente respondió", "compró", "ticket cerrado", "asesor canceló" |

## Flujo nuevo

1. **La conversación se enfría** → se **inserta la programación** (fecha + tipo).
   **Cero llamadas al modelo aquí.** Es el ahorro principal.
2. **Worker despierta cerca de `enviar_en`** → **portón de relevancia** ANTES de generar:
   - ¿el cliente escribió algo después? → cancelar
   - ¿ya compró / el ticket se cerró ganado? → cancelar
   - ¿el asesor lo canceló a mano? → cancelar
   - si sigue vigente → **generar el texto (1 llamada mini) y enviar**.
3. **Botón "Generar" (preview)** → el asesor genera on-demand, se guarda el `texto`
   (estado `generado`) y **puede editarlo**. A la hora, el worker ve que ya hay texto,
   **no regenera** — solo revalida el portón y envía.
4. **Botón "Enviar ahora"** → genera (si falta) + envía en el momento.

Con esto, el texto se genera **una sola vez** y **solo si va a salir de verdad**.

## Cuánto se ahorra (volumen real ~800 conv/mes, ~40% se enfrían, 3 seguimientos)

| | Se generan/mandan | Costo |
|---|---|---|
| **Hoy** (pre-genera + manda los 3) | ~960 | tokens ~$0,50 + **templates ~$71** |
| **Perezoso + portón** (~1,8 promedio) | ~580 | tokens ~$0,30 + **templates ~$43** |
| **Ahorro/mes** | | **~$25–30** (casi todo en templates de Meta) |

- El ahorro de **tokens es centavos** (mini es baratísimo).
- El ahorro real son **templates de WhatsApp** que ya no se mandan a quien no aplica.
- A más volumen (o si Depot escala), el ahorro crece linealmente.

## Implementación por fases

- **Fase A — el 80% del ahorro (rápida).** Dejar de pre-generar: al enfriarse solo se
  inserta la cita. Mover la generación al worker, con el portón de relevancia justo
  antes de enviar. Esto por sí solo elimina casi todo el desperdicio. *(~4–6 h)*
- **Fase B — control del asesor.** Botón "Generar" (preview + edición) y "Enviar ahora";
  el worker respeta el `texto` ya generado. *(~3–4 h)*
- **Fase C — medición.** Contador de seguimientos `cancelado` por el portón = ahorro
  visible en el dashboard ("X seguimientos evitados este mes"). *(~2 h)*

## Riesgos / notas

- **Latencia al enviar:** generar al momento agrega ~1–2 s antes de mandar. Irrelevante
  para un seguimiento (no es tiempo real). Si molesta, generar 1–2 min antes con el worker.
- **Idempotencia:** el worker debe marcar `enviado` en la misma transacción para no
  mandar dos veces si se reinicia el proceso.
- **Ventana de 24 h:** confirmar si cada seguimiento va como template (fuera de ventana)
  o como texto normal (si el cliente escribió en las últimas 24 h → gratis). El portón
  puede preferir texto normal cuando la ventana sigue abierta = otro ahorro.
- **Contrato:** los templates de marketing de Meta los paga el volumen de seguimientos;
  hoy no están cubiertos en los $100/mes. Al activar seguimientos a full conviene dejar
  por escrito que esos ~$0,074/msg van por cuenta de Depot o en un tope aparte.

## Implementado (27-jul-2026)

La nota anterior quedó obsoleta: el código de seguimientos **sí** está en `app/src`.
Mapa de lo que se tocó:

| Pieza | Archivo |
|---|---|
| Antes pre-generaba al enfriarse; ahora solo inserta la cita | `app/src/services/followUps.ts` → `scheduleConversationFollowUps` |
| Redacción de un solo mensaje, perezosa | `app/src/services/followUpCopy.ts` → `generateFollowUpCopy` |
| Generación idempotente + persistencia | `app/src/services/followUps.ts` → `ensureFollowUpJobCopy` |
| Portón de relevancia y generación al enviar | `app/src/services/followUpProcessor.ts` |
| Botón «Generar» (API) | `POST /api/hub/follow-ups/:id/generate` en `app/src/server/admin.ts` |
| Botón «Generar» (UI) | `hub/src/screens/Pipeline.tsx` |
| Contador de ahorro | `getFollowUpMetrics` → `generations_avoided` / `generations_used` |

Cómo quedó el contrato del `payload`:

- `aiPending: true` → el `preview` es el borrador determinístico; nadie pagó tokens.
- `aiPending: false` + `copySource` (`ai` \| `fallback` \| `advisor`) → texto fijado;
  el worker lo respeta y **no** vuelve a llamar al modelo.
- Jobs viejos sin `aiPending` se envían tal cual: el cambio es retrocompatible y no
  necesitó migración (el `payload` ya era jsonb).

Fase C quedó en el backend (`generations_avoided`); falta pintarlo en el dashboard.
