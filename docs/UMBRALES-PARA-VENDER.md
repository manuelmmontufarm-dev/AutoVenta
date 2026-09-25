# Umbrales para vender — las siete cifras que dicen si el bot está listo

> Definidos el 24-sep-2026 a partir de la auditoría del commit `93b1913`
> (22 al 24-sep, 120 chats). La regla: el bot se ofrece a un cliente nuevo
> cuando las siete están en verde durante una semana seguida. Ninguna sale de
> leer chats a mano: seis salen de la base con una regla fija, la séptima de la
> facturación. El conteo de «errores por chat» de las auditorías leídas NO
> entra acá: sirve para encontrar qué arreglar, no para decidir si se vende.

| # | Qué mide | Cómo se calcula (sobre la ventana) | 24-sep-2026 | Umbral |
|---|---|---|---|---|
| 1 | Cotizaciones que cuadran | `quotes`: Σ cantidad × `salePriceWithTax` = `total` (±0,05), medida de los ítems = `tire_size` de la ficha o equivalente consentida | 25 de 25 | **100 %** |
| 2 | Errores de dato | `guardian_reviews.findings` con categoría `medida_incorrecta`, `precio_incorrecto`, `stock_prometido`, `hecho_comercial_inventado`, `cotizacion_sin_medida`, `tipo_negado_con_stock`. Dos cifras: los que LLEGARON (`verdict = 'sin_revision'` o texto final igual al borrador) y los intentos por conversación con IA | 0 llegaron · 0,42 intentos/chat | **0 llegan · < 0,20 intentos/chat** |
| 3 | Preguntas sin respuesta | Entrante con `assigned_to = 'bot'`, sin `bot_paused_until` vigente y sin mensaje saliente en 5 min | 1 de 426 | **0** |
| 4 | Elegir es cotizar | Entrante que responde el menú (`respuestaDePreferencia` ≠ null) o dice sí a «¿Se la cotizo?» → `quotes` del mismo ciclo en ≤ 3 min. Se excluye la equivalente pendiente de consentimiento | 13 de 16 del menú · 6 de 12 con otras palabras | **≥ 90 %** |
| 5 | Seguimientos que re-preguntan | Mensaje con `metadata.followUpJobId` cuyo texto pide medida/local/día que ya está en `conversations` (`tire_size`, `nearest_store`, `visit_date`) | 29 de 184 (16 %) | **< 5 %** |
| 6 | Correcciones del guardián por chat | `guardian_reviews` con `verdict = 'corregir'` ÷ conversaciones con `ai_runs` | 2,1 | **< 1,0** |
| 7 | Costo por conversación | `ai_runs` × tarifas de `services/billing.ts` ÷ conversaciones con `ai_runs` | $0,140 | **< $0,11** |

## Historial

| Fecha | Commit | 1 | 2 (llegan · intentos) | 3 | 4 (menú · otras palabras) | 5 | 6 | 7 | En verde |
|---|---|---|---|---|---|---|---|---|---|
| 24-sep-2026 | 93b1913 | 25/25 ✅ | 0 ✅ · 0,42 ❌ | 1 ❌ | 81 % ❌ · 50 % ❌ | 16 % ❌ | 2,1 ❌ | $0,140 ❌ | 2 de 7 |

Referencia del periodo anterior (12 al 18-sep, commit 32df6f3): intentos de dato 0,25/chat, correcciones 1,9/chat, $0,135.

## Qué mueve cada cifra hoy

- **2, 5 y 6** tienen la misma causa: las plantillas de seguimiento no miran la ficha
  (`domain/followUpMessages.ts:213-214` y `265-273`), el lector de medidas en pulgadas
  no lee «Rin 15 31 x 10.50» ni «31x10x50 rin 15» (`domain/tireSize.ts:265-267`), y el
  modelo pide permiso para cotizar tras el bloqueo de `generar_cotizacion`
  (`agent/tools.ts:2292`) sin que un candado lo reemplace por «¿Se la cotizo?».
- **3**: `sin_visita_si_no_puede_venir` (`services/prepararSalida.ts:975-990`) deja el
  turno vacío cuando lo aprobado era solo mapas + pregunta de local (Guayaquil, Ibarra).
- **4, otras palabras**: «4 llantas y de contado», «Eso», «Precio por favor», «Wildpeak RT»,
  «la de 163» no cuentan como sí ni como elección.
- **7** baja sola cuando bajan 5 y 6: los seguimientos son el 36 % de las corridas del guardián.

## Cómo se corre

Todavía a mano, con la extracción de solo lectura de la auditoría (`telemetria.mjs`
sobre `DATABASE_URL`, ventana por commit). Pendiente: dejarlo como script nocturno que
agregue una fila al historial de arriba y a `app/scripts/auditoria/registro/historial.jsonl`.
