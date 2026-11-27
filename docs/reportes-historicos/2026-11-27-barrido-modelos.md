# Barrido de modelos del vendedor (27-nov-2026)

> Pregunta: ¿qué modelo de Claude y qué esfuerzo dan la mejor venta por dólar
> para el VENDEDOR, en los casos difíciles del simulador?
> Gráfico de control: [`2026-11-27-barrido-modelos.html`](2026-11-27-barrido-modelos.html).
> Solo medición: producción no se tocó.

## Qué estás viendo

Las mismas conversaciones reales difíciles (el lote de 50 del 24-nov,
`dificiles-50.json`) se repitieron en el simulador con cuatro vendedores
distintos. El Guardián fue Haiku 5.5 en todas. Cada conversación la calificó un
juez a ciegas (un subagente de Claude Code que no sabía qué combinación era),
con la misma rúbrica del 24-nov: «venta primero», nota de 1 a 10.

Se compara cada combinación contra **A, lo que hay hoy en producción**, caso por
caso. «Δ vs A ±σ» es la diferencia media de nota con su error. En el gráfico de
control, cada punto es un caso (nota de la combinación menos nota de A) y la
franja son los límites ±3σ. **Ningún punto sale de la franja en ninguna
combinación, ni hay 8 seguidos del mismo lado: todo lo que se ve es ruido.**

## Resultado

| Combinación | Casos | Nota | Δ vs A ±σ | Cotiza | Graves (frenó Guardián · vio cliente) | $ / conv total | $ / conv Anthropic | $ por conv. que cotiza | Vendedor p50 / p90 |
|---|---|---|---|---|---|---|---|---|---|
| **A** · Sonnet 5.5, esfuerzo `low` (producción hoy) | 40 | 5,1 | — | 28 % (11) | 11 · 14 | $0,086 | $0,067 | $0,31 | 3,9 / 6,5 s |
| **C** · Sonnet 5.5, esfuerzo `medium` | 40 | 5,0 | −0,10 ± 0,20 | 23 % (9) | 16 · 14 | $0,093 | $0,063 | $0,42 | 4,3 / 6,2 s |
| **D** · Haiku 5.5, esfuerzo `medium` | 40 | 4,8 | −0,28 ± 0,19 | 25 % (10) | 13 · 10 | **$0,036** | **$0,009** | **$0,14** | 5,1 / 7,9 s |
| **E** · Opus 5.5, esfuerzo `low` | 10 | 4,8 | −0,30 ± 0,47 | 0 % (0) | 5 · 3 | $0,212 | $0,158 | — | 5,6 / 7,3 s |

- **B** (Sonnet `low`) es igual a A: producción no define `AI_CLAUDE_EFFORT_VENDEDOR`
  y el código usa `low` por defecto (`app/src/config.ts`). No se corrió aparte.
- «Graves que frenó el Guardián»: conversaciones donde el Guardián tuvo que
  corregir un borrador por precio, stock, medida o dato comercial inventado
  (severidad alta). «Vio el cliente»: errores graves que el juez vio en el texto
  final (medida equivocada, precio o stock contradictorio, dato inventado).
- Sin el caso 28 los números casi no cambian (A 5,13; C −0,10; D −0,26).
- «$ / conv total» incluye OpenAI (clasificador, ruta exacta con gpt-5.4-mini y el
  rescate con gpt-5.5, ver abajo). Es lo que de verdad cuesta una conversación.

## Recomendación

1. **Quedarse con A (Sonnet `low`) por ahora.** Ninguna combinación vende mejor.
2. **Sonnet `medium` (C) no:** misma nota, cotiza menos, el Guardián tuvo que frenar
   más errores graves (16 contra 11), 9 % más caro y más lento por conversación.
3. **Opus `low` (E) no:** 2,5 veces más caro, no cotizó en ninguno de sus 10 casos
   y no sube la nota.
4. **Haiku `medium` (D) es lo único que vale la pena seguir.** Cuesta 59 % menos por
   conversación (7 veces menos en Anthropic) y queda dentro del ruido. Pero
   la diferencia media es −0,28 ± 0,19: con 40 casos no se puede descartar una
   pérdida real de hasta ~0,6 puntos, y tiene más conversaciones con nota ≤ 4
   (17 contra 12). En octubre, un vendedor más barato (gpt-5.4) que en el
   simulador parecía empatar perdió 16 puntos de cotización en producción.
   **Si se quiere el ahorro, el siguiente paso es un canary en producción (la
   mitad de los teléfonos con Haiku de vendedor), midiendo el % que cotiza con
   gráfico de control y cortándolo si cae.** Orden de magnitud del ahorro: unos
   5 centavos por conversación; con ~100 conversaciones al día entre los dos
   clientes, del orden de $150 al mes (los casos difíciles cuestan más que el
   promedio, así que es un techo).

## Caso 28 (medida dicha a pedazos: «la a 65 Rin 13»)

Sale mal con todos: A 4, C 4, D 3 (E no lo corrió). Los tres fallan igual:
no entienden que «65 rin 13» es 165/65R13, insisten con la foto y no dan el
precio que se pidió. C además ofreció una 175/60 como si fuera perfil 65.
**No lo arregla un modelo más caro: hay que arreglarlo en el código o el prompt**
(lectura de medidas a pedazos), con este caso como prueba en rojo.

## Hallazgos de paso (no se tocó nada)

1. **El rescate lo escribe gpt-5.5, aunque el vendedor sea Claude.** Cuando la
   cadena de herramientas llega al límite (`AI_MAX_TOOL_ITERATIONS=3`), la última
   respuesta la escribe `OPENAI_ESCALATION_MODEL` (gpt-5.5), no el modelo del
   canary (`agent.ts`, ruta `tool_chain_finalized`). Pasa en producción: 13 veces
   desde el 24-nov. Y la fila de `ai_runs` **suma las rondas de Claude con el
   rescate y las cobra todas a tarifa de gpt-5.5**, así que el costo de esas
   conversaciones queda inflado y el de Anthropic escondido (punto ciego ya
   anotado en `docs/COMO-MEDIR-TOKENS.md`, ahora con Claude).
2. **Haiku llega más al límite de herramientas:** 6 rescates con gpt-5.5 en 40
   casos, contra 2 de Sonnet. Esos rescates son la mitad del costo que le queda a
   D. Si se adopta Haiku, conviene que el rescate use un modelo barato.
3. **Haiku con esfuerzo `medium` es más lento que Sonnet `low`** (p50 5,1 s contra
   3,9 s). Haiku `low` no se probó: podría ser más rápido y más barato todavía.
4. **El error más común no depende del modelo:** en todas las combinaciones la
   falla número uno es «no entendió lo que pidió», y se repite el patrón de volver
   a preguntar «¿le cotizo la 1, la 2 o la 3?» cuando el cliente ya eligió. Un
   cambio de modelo no lo arregla.
5. Un turno mudo con Opus (caso 3, turno 4) salió de la ruta exacta con
   gpt-5.4-mini generando la cotización, no de Opus.

## Cómo se midió

- **Casos:** 1–40 de `app/scripts/sim/datos/dificiles-50.json` (el mismo lote del
  24-nov, copiado de `/Users/manue/AutoVenta-wt-fable`; está en `.gitignore`).
  Primero 1–20 + 28 con A, C y D; se agrandaron a 21–40 las que quedaron cerca
  de A (C y D, y A como control). E, solo 1–10 por el tope de gasto.
- **Simulador:** `main` en `019a7d5`, un simulador por combinación (máximo 3 a la
  vez), debounce 1500 ms. El worktree no está enlazado a Railway, así que las
  variables de producción de Depot se pusieron a mano tal cual las devolvió
  `railway variables` ese día (`app/scripts/sim/barrido/lanzar-sim.sh`). Una
  corrida por caso y combinación.
- **Juez:** subagentes de Claude Code, a ciegas (letras barajadas por caso, la
  clave en un archivo aparte), cada uno con todas las variantes de un mismo caso
  a la vista. Ninguna llamada a la API para juzgar. **Confiabilidad del juez:**
  las mismas transcripciones calificadas dos veces por jueces distintos (68
  pares) dieron la misma nota en 42 y solo una vez más de 1 punto de diferencia
  (±0,4–0,5 de ruido por nota). Para cada caso vale la última ronda que lo vio con todas
  sus variantes.
- **Costo:** de `ai_runs` del simulador con las tarifas de `billing.ts`. La
  latencia es la de cada llamada del vendedor Claude (`latency_ms`).

## Gasto

- **API de Anthropic: entre $7,18 y $8,78** de un tope de $10. $7,18 son llamadas
  a Claude con certeza; los $1,60 restantes son filas de rescate que mezclan
  rondas de Claude con gpt-5.5 y se contaron enteras para no pasarse del tope.
- Clave de OpenAI del simulador (aparte del tope): unos $1,90 más esos $1,60
  mezclados.
- Jueces: tokens de Claude Code, no de la API.

## Reproducir

```bash
cd app
# un simulador por combinación (puertos 3700+n·10)
LOGS=/tmp scripts/sim/barrido/lanzar-sim.sh a 1 claude-sonnet-5-5 low
# el lote, caso por caso, con tope de gasto en Anthropic
TOPE=9.5 scripts/sim/barrido/correr.sh a a 1 "1-20,28"
# paquetes a ciegas → jueces (subagentes) → notas → análisis → HTML
node scripts/sim/barrido/paquetes-juez.mjs <dir> bm-a bm-c bm-d --casos 1-20,28
node scripts/sim/barrido/inyectar-notas.mjs <dir>...
node scripts/sim/barrido/analizar.mjs <dir> bm-a bm-c bm-d bm-e
node scripts/sim/barrido/informe-html.mjs <dir>/analisis.json scripts/sim/barrido/conclusion-2026-11-27.html
```

Números por caso: `app/scripts/sim/mediciones/barrido-2026-11-27-analisis.json`.
Transcripciones completas (no versionadas): `app/scripts/sim/mediciones/canary-bm-*.json`.
