# Plan de eficiencia IA sin sacrificar ventas

**Fecha:** 2026-08-09  
**Objetivo de negocio:** bajar el costo por conversación y la latencia manteniendo como métricas primarias (1) cotización enviada y (2) cotización más intención de visita, local y fecha.  
**Principio:** no optimizar tokens a costa de cerrar menos. GPT-5.5 se conserva donde decide, compara, maneja objeciones o interpreta una foto; el ahorro inicial sale de no llamar al modelo cuando el resultado ya es exacto.

## 1. Línea base y problemas observados

El análisis del 8 de agosto mostró una mejora comercial grande con GPT-5.5: 23 cotizaciones reales sobre 77 chats activos (29,9%), frente a 4 sobre 227 (1,8%) entre el 5 y el 7. El replay controlado también favoreció a GPT-5.5: 14 cotizaciones y 0 errores contra 5 cotizaciones y 7 errores con GPT-5.4. Por eso bajar el cerebro completo sería ahorro falso.

Las pérdidas restantes sí tienen causas de software:

- El loop podía hacer 8 rondas, reenviando el prompt, historial y tools completos.
- El historial era de 30 mensajes aun cuando medida, producto, cantidad y cotización ya estaban estructurados.
- Fecha, compromiso y local estaban en la base pero no llegaban a `HECHOS COMERCIALES`; el bot los preguntaba otra vez.
- Un local recomendado podía sobrevivir aunque el cliente eligiera explícitamente el otro.
- El candado anti-cotización impedía reenviar la imagen solicitada.
- Comparación no estaba disponible en etapas de cierre y el candado de opciones bloqueaba productos nuevos de la misma medida.
- Visión daba solo 150 tokens totales a GPT-5.5; ese presupuesto incluye razonamiento y salida, por lo que podía no quedar texto visible. Además el caption no llegaba desde el webhook.
- `ai_runs` no distinguía ruta, caché, razonamiento ni número de rondas.

## 2. Arquitectura desplegable

```text
Mensaje del cliente
  ├─ pedido exacto: reenvío cotización ──────► código/render existente ─► 0 IA
  ├─ local/fecha/visita inequívocos ─────────► parser + base + confirmación ─► 0 IA
  └─ venta, comparación, objeción o duda ────► GPT-5.5 low, máx. 3 rondas
                                                └─ rescate GPT-5.5 medium, sin tools
```

### Implementación de la modalidad

1. **Rutas directas reversibles.** `DIRECT_SALES_ROUTES_ENABLED` atiende reenvíos de cotización y respuestas secas de local/fecha sin una llamada al modelo. Re-renderiza el mismo número y los precios guardados; no crea una segunda cotización.
2. **Give the client what he asks for.** La tool `reenviar_cotizacion` existe como respaldo para solicitudes menos literales. En cotización y seguimiento también quedan habilitadas `enviar_comparacion`, búsqueda y opciones. La regla operativa es entregar primero la foto/pieza solicitada y después continuar el funnel.
3. **Memoria comercial completa.** El prompt recibe `nearest_store`, `visit_date` y `customer_commitment`. Una elección explícita de Cumbayá o Quito Sur reemplaza la recomendación automática. Con local y visita ya guardados queda prohibido preguntarlos otra vez.
4. **Contexto más pequeño.** `AI_HISTORY_LIMIT=10` sustituye 30 mensajes por los últimos 10 más hechos estructurados. El playbook compacto elimina ejemplos duplicados: el bloque reemplazado baja de 16.504 a 2.550 bytes y conserva precio primero, aro, seguridad, cumplimiento de piezas y cierre.
5. **Loop acotado.** `AI_MAX_TOOL_ITERATIONS=3`, sin tool calls paralelas, con candado de `tool+argumentos` repetidos y un rescate final sin herramientas. Las rondas normales usan razonamiento `low` y verbosity `low`; el rescate usa `medium`.
6. **Caché estable.** Prompt permanente primero, hechos variables después y retención de caché 24 horas para GPT-5.5.
7. **Visión corregida.** Se mantiene GPT-5.5, con caption, detalle automático, razonamiento `low` y presupuesto de 400. La precisión de una medida vale más que bajar el modelo de OCR.
8. **Telemetría.** Cada turno registra tokens cacheados, tokens de razonamiento, iteraciones, tipo de llamada y ruta. Las rutas directas se registran como `respuesta_directa`.

## 3. Balance costo–efectividad

El orden de optimización importa:

| Capa | Ahorro | Riesgo comercial | Decisión |
|---|---:|---:|---|
| Rutas exactas sin IA | Muy alto por turno | Bajo | Activar ahora |
| 30 → 10 mensajes + prompt compacto | Alto | Bajo/medio | Activar con rollback |
| 8 → 3 rondas + rescate | Alto en atascos | Bajo | Activar ahora |
| Reasoning/verbosity bajos | Medio | Bajo | Activar; rescate conserva medium |
| Modelo pequeño en post-cotización | Alto | Medio/alto | Infraestructura lista, no bajar mañana |
| Modelo pequeño en venta/objeciones/visión | Alto | Alto | No hacer |

La meta inicial razonable es 30–50% menos costo por conversación, no 65% prometido a ciegas. Una ruta directa elimina el 100% de tokens de ese turno; recortar una llamada de un loop elimina también su prompt e historial completos. Eso rinde más y es más seguro que cambiar el cerebro que produjo el salto de cotizaciones.

## 4. Camino seguro para bajar modelo después

`OPENAI_ROUTINE_MODEL` separa las primeras rondas de `cotizacion_enviada` y `seguimiento_venta`, pero comienza en GPT-5.5. Para bajarlo:

1. Acumular al menos 100 turnos post-cotización con esta modalidad.
2. Ejecutar GPT-5.4-mini en *shadow*: ve el mismo input pero no envía nada.
3. Comparar acción, tool y argumentos contra GPT-5.5, no una “confianza” declarada por el modelo.
4. Exigir cero precios/locales inventados, cero piezas pedidas sin entregar y no más de 2 puntos porcentuales de caída en éxito superior.
5. Rollout estable por conversación: 10%, 50%, 100%.
6. Escalar inmediatamente a GPT-5.5 ante ambigüedad, objeción, comparación técnica, cambio de medida/producto o primer fallo de tool.

El clasificador interno ya usa el modelo pequeño. Las próximas candidatas son extracción de hechos y follow-ups repetibles; venta, visión y rescate permanecen en GPT-5.5.

## 5. Medición de mañana

Medir por conversación y por éxito, no solo por request:

- cotizaciones / chats activos;
- cotización + intención explícita de ir;
- cotización + local;
- cotización + local y fecha;
- solicitudes de imagen/opciones/comparación atendidas en el mismo turno;
- preguntas repetidas de local/fecha;
- llamadas IA por conversación, rondas, p50/p95 de latencia;
- tokens totales, no cacheados, cacheados, razonamiento y salida;
- costo por cotización y por éxito superior;
- errores de visión y lecturas con salida visible.

Comparar contra el 8 de agosto, separando pruebas internas de clientes reales. No atribuir una diferencia a modelo si cambió el mix de mensajes.

## 6. Rollback

Las palancas son independientes y no requieren revertir código:

- `DIRECT_SALES_ROUTES_ENABLED=false`
- `AI_COMPACT_PROMPT_ENABLED=false`
- `AI_HISTORY_LIMIT=30`
- `AI_MAX_TOOL_ITERATIONS=8`
- `OPENAI_ROUTINE_MODEL=gpt-5.5`

Rollback inmediato si aparece una cotización duplicada, un precio/local incorrecto, una imagen pedida no entregada, una pregunta repetida con hechos guardados, errores de turnos o caída comercial material. Primero se apaga la bandera responsable; GPT-5.5 permanece como red de seguridad.

## 7. Criterio de éxito

La modalidad se considera ganadora si reduce al menos 30% los tokens no cacheados por chat sin bajar la tasa de cotización ni el éxito superior del rango esperado del 8 de agosto, y si elimina los fallos de reenvío y repetición local/fecha observados. Solo después se autoriza experimentar con un modelo menor en las primeras rondas rutinarias.
