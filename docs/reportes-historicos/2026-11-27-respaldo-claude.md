# Si Claude falla, ¿el bot sigue contestando? (27-nov-2026)

Depot, Competimotor y el simulador usan **la misma clave de Anthropic**. Si se acaba el saldo,
los dos bots viven del respaldo `AI_CLAUDE_RESPALDO_MODEL` (gpt-5.5). Ese camino solo se había
probado con «nadie escucha en el puerto». Se probó con cada error real, sin gastar en la API:
el SDK de verdad contra un Anthropic de mentira que contesta lo mismo que el real.

Gasto real en la API: **menos de un centavo** (una llamada de Haiku de 21 tokens y dos errores
que no se cobran) para ver la forma real de los errores y los headers de límite.

## Lo que caía mal antes

Medido corriendo las mismas escenas contra `main` (019a7d5), sin los arreglos:

| Caso | Antes | Ahora |
|---|---|---|
| Saldo de Anthropic agotado (400 «credit balance is too low») | Contestaba gpt-5.5, pero **nadie se enteraba**: el bot podía pasar días en OpenAI sin aviso. Cada llamada volvía a probar Claude. | Contesta gpt-5.5 y a soporte le llega **un** aviso naranja «Claude no contesta, responde gpt-5.5» con «recarga en console.anthropic.com». Las llamadas siguientes van directo a gpt-5.5 durante 5 min; luego se prueba Claude otra vez y, si contesta, llega «Claude volvió a contestar». |
| Clave inválida (401) | Igual: sin aviso. | Aviso «Anthropic rechazó la clave del bot · revisa ANTHROPIC_API_KEY». |
| Modelo mal escrito en Railway (404) | Igual: sin aviso, todo en gpt-5.5 para siempre. | Aviso «revisa el nombre del modelo». |
| Límite de uso (429 con `retry-after`) | El SDK **esperaba lo que dijera `retry-after`** (20 s en la prueba) antes de reintentar, en cada llamada. | Al toque a gpt-5.5; Claude en pausa lo que pidió `retry-after` (5 s–5 min). Sin aviso: se pasa solo. |
| Saturado (529) o caído (500) | Dos llamadas a Anthropic (reintento) antes del respaldo, en cada llamada. | Una sola; ese modelo en pausa 1 min. Sin aviso. |
| Anthropic colgado (timeout) en el **Guardián** | Claude tenía 45 s × 2 intentos y el Guardián solo 20 s: **el borrador salía sin revisar** aunque gpt-5.5 estaba listo. | Claude tiene 12 s dentro del Guardián (Haiku tardó p99 10,9 s en 1.184 revisiones de prod), el respaldo revisa en el tiempo que queda. |
| Anthropic colgado en el **vendedor** | 45 s × 2 por cada ronda y por el rescate: un turno de 3 rondas pasaba de los 5 min (`turno_colgado`). | 45 s una vez (sin reintento, hay respaldo); las rondas siguientes van directo a gpt-5.5. |
| Respuesta cortada por `max_tokens` | **La frase cortada le llegaba al cliente**, y un JSON cortado del Guardián dejaba el borrador sin revisar. | Se trata como fallo: contesta gpt-5.5 con la petición entera. |
| Rechazo (`refusal`) de Sonnet 5.5 (con `fallbacks`) y de Haiku 5.5 (sin) | Bien: contestaba gpt-5.5. | Igual, y ahora queda registrado por qué. |
| Respuesta vacía | Bien. | Igual, registrado. |
| Respaldo apagado + saldo agotado | La causa salía «error interno» y al cliente **se le pedía que repita**. | Causa «sin crédito de Anthropic (Claude)», al cliente no se le pide repetir, el aviso dice dónde recargar. |
| `ai_runs` | Decía `gpt-5.5` y nada más: no se distinguía un turno de respaldo de uno normal. | `tools` lleva `respaldo_claude:<motivo>` (`sin_credito`, `rechazo`, `cortada`, `…:en_pausa`). Una auditoría ya puede contar cuántos turnos de «Claude» atendió de verdad gpt-5.5. |
| Respaldo del servidor de Sonnet (otro modelo contesta) | Se registraba y cobraba como Sonnet 5.5. | Se registra el modelo que contestó. |

Los rechazos, respuestas vacías y cortadas **no** ponen a Claude en pausa ni avisan: dependen
del contenido, la próxima petición es otra.

## Saldo de Anthropic

Hasta hoy `saldoDeIA.ts` solo contaba OpenAI. Ahora en Ajustes → Bot hay un segundo bloque
«Saldo de Anthropic (Claude)»: soporte anota lo que ve en console.anthropic.com y el bot le
resta lo que registró en `ai_runs` con modelos `claude-` (a la tarifa de la factura, con el
recargo de lo escrito al caché). Avisa una vez al bajar del mínimo, igual que el de OpenAI.
**Es una estimación**: no ve lo que gastan Competimotor ni el simulador con la misma clave, así
que el saldo real puede ser menor. Por eso el aviso de «Claude sin crédito» de arriba es la red
de verdad. Se guarda en `settings` (`saldo_de_anthropic`), sin migración.

## Pruebas

- `test/respaldoDeClaude.casos.test.ts` — 16 casos, SDK real contra Anthropic de mentira.
- `test/claudeSinCredito.integration.test.ts` — el turno entero (`runAgent`) con el vendedor en
  Claude sin saldo: 4 chats a la vez reciben la respuesta de gpt-5.5, `ai_runs` lo dice, soporte
  recibe UN aviso que nombra a Anthropic, Anthropic no se vuelve a tocar durante la pausa, y al
  volver llega «Claude volvió a contestar».
- `test/saldoDeIA.integration.test.ts` — caso nuevo: el saldo de Anthropic no se mezcla con el
  de OpenAI.

## Lo que no se probó

- Contra la API real solo se vieron 404, 401 y una respuesta buena. El 400 de saldo agotado,
  429, 529 y 500 usan la forma documentada (el texto del 400 es el que Anthropic publica).
- No se probó en el simulador con conversaciones reales (no cambia lo que el bot dice cuando
  Claude contesta).
