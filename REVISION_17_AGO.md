# Revisión del 17-ago — comprobar la auditoría del 16-ago

Pégale esto a Claude Code en `/Users/manue/AutoVenta`. Está escrito para que
**pueda salir mal**: cada punto tiene un número esperado y qué hacer si no sale.

---

## Prompt

> Ayer (16-ago) se aplicó una auditoría al repo: commits `c4523c3`, `9429b11`,
> `94ebc10` y `7d9c99d`, todos ya en `main` y desplegados. Toca comprobar en
> datos reales si funcionó, y revertir lo que no.
>
> Trabaja contra la base de producción (solo lecturas y agregados; nada de
> contenido de clientes salvo que haga falta para explicar un caso).
>
> **1. ¿Subió el aprovechamiento del caché?**
> Ese fue el cambio de mayor ahorro: los bloques volátiles (hechos comerciales,
> descuentos) pasaron de ir en el índice 1 a ir detrás del historial, para que
> el prefijo cacheado no se cortara en el prompt de sistema.
>
> ```sql
> select case when created_at < timestamptz '2026-08-17 02:31:23+00'
>            then 'antes' else 'despues' end as tanda,
>        count(*) as corridas,
>        round(avg(input_tokens)) as entrada,
>        round(avg(cached_input_tokens)) as cacheada,
>        round(100.0 * sum(cached_input_tokens) / nullif(sum(input_tokens),0), 1) as cache_pct
> from ai_runs
> where call_type = 'chat' and created_at > now() - interval '4 days'
> group by 1 order by 1;
> ```
>
> **Predicción que hay que falsar:** `cacheada` sube de ~10.086 hacia ~11.800 por
> llamada y `cache_pct` del 69 % hacia 78–80 %.
> Si NO se movió, la hipótesis era falsa: el prefijo no se corta donde se creía.
> Dilo claro, no lo maquilles, y busca dónde corta de verdad antes de proponer
> nada nuevo. Necesitas al menos ~30 corridas «despues» para que signifique algo.
>
> **2. ¿Tomó efecto `OPENAI_ROUTINE_MODEL=gpt-5.4-mini`?**
> Se puso en Railway anoche pero no se pudo confirmar desde fuera.
>
> ```sql
> select route, model, count(*) as corridas,
>        round(avg(input_tokens)) as entrada,
>        round(avg(latency_ms)) as latencia_ms,
>        count(*) filter (where error is not null) as con_error
> from ai_runs
> where call_type = 'chat' and created_at > now() - interval '24 hours'
> group by route, model order by corridas desc;
> ```
>
> Si `routine_stage` sigue saliendo con `gpt-5.5`, la variable se guardó pero no
> se aplicó → hay que forzar redeploy en Railway.
> Si ya sale `gpt-5.4-mini`, mira `con_error` y `latencia_ms`: cualquier error
> nuevo en esa ruta es motivo de revertir la variable en el acto.
>
> **3. ¿El arreglo de doble IVA cambió precios reales, o estaba dormido?**
> Esto importa: se dijo que unas llantas anunciadas a $480 se firmaban en $552,
> pero eso solo pasa cuando `product.taxRate != business.taxRate` (0,15). En
> producción el catálogo viene de Contífico, y si todos los productos traen
> `porcentaje_iva`, el bug estaba **dormido** y no se cotizó nada mal.
>
> Compruébalo: revisa si algún producto del catálogo en memoria tiene
> `taxRate` distinto de 0,15, y contrasta cotizaciones de los últimos 10 días —
> ¿el `total` es igual a `cantidad × precio_unitario_con_iva`, o hay un 15 %
> de más?
>
> **Si estaba dormido, dilo:** entonces NO hay que avisarle a Depot de ningún
> precio mal cobrado, y la recomendación de ayer sobra.
>
> **4. Los arreglos de anoche, ¿rompieron algo?**
> Corre `npm test` y `npx tsc --noEmit` en `app/`. Después busca en los últimos
> 2 días señales de regresión:
> - `ai_runs` con `route='failed'` o `error is not null` → ¿subieron respecto a
>   la semana pasada?
> - `route='rescue'` → ¿se disparó? (se le subió el presupuesto de tokens)
> - Conversaciones sin respuesta del bot con mensaje del cliente pendiente.
> - Mensajes de tipo `document` o `video` (antes se descartaban en silencio):
>   ¿ahora se registran y se contestan?
>
> **5. Cómo está vendiendo.**
> Corre la skill `revision-contextual` sobre el día de hoy. Compara contra el día
> anterior. Presta atención especial a:
> - re-preguntas de datos ya dados (la señal que más duele),
> - la pieza de opciones enviada más de una vez (se arregló el candado),
> - la etapa del kanban retrocediendo (se arregló el clasificador).
>
> **Al final dame:** qué se confirmó, qué se desmintió, y qué hay que revertir.
> Si algo salió peor que antes, revertirlo es la respuesta correcta —
> no busques justificarlo.

---

## Contexto para quien lea esto

**Qué se cambió el 16-ago** (20 de 21 defectos confirmados, verificación
adversarial de por medio):

- Contención de errores: ninguna excepción del loop deja al cliente sin
  respuesta; `defineTool` no puede lanzar.
- Freno de fuerza bruta en `/api/auth/login` (la clave sigue siendo la que
  decidió el cliente; lo que faltaba era el freno).
- Caché del prompt: bloques volátiles detrás del historial.
- `buscar_llanta` de 8+5 a 5+3 resultados, reservando un hueco por escalón.
- Precio: el chat, la pieza y la cotización salen del mismo número.
- Doble IVA, descuento recalculado, clasificador que retrocedía, candado de
  opciones, webhook que podía matar el proceso, endpoints de render sin
  credencial, y varios de medios.

**Lo que NO se hizo, a propósito** — necesita replay previo:
deduplicar el playbook, bajar `AI_HISTORY_LIMIT`, encender
`AI_COMPACT_PROMPT_ENABLED`, y llevar `exact_tool_reply` a un modelo barato
(eso último además pide cambio de código: la ruta se decide *después* del turno,
así que ninguna variable de entorno la cubre).

**El ahorro grande sigue pendiente.** El informe del 10-ago concluyó 42,4 %
moviendo `exact_tool_reply` + `routine_stage` a mini. La variable de entorno solo
alcanza a `routine_stage` (12,9 % del gasto). El 37 % de `exact_tool_reply`
necesita código.

**Dato base para comparar** (10-ago, clientes externos, 50 corridas gpt-5.5):
14.620 tokens de entrada por llamada · 10.086 cacheados (69 %) · 77 de salida ·
$0,0798 por conversación · 74,8 % de la factura es entrada sin cachear.
