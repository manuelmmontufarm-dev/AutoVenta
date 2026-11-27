# El caché del vendedor en Claude — 27-nov-2026

Rama `perf/cache-vendedor` (PR sin merge). Producción no se tocó: ni variables de Railway ni deploy.

## Qué estás viendo

El vendedor (Claude Sonnet 5.5) le manda a Anthropic, en cada turno, ~7.500 tokens que casi nunca cambian
(las herramientas y las reglas) más la conversación. Lo que no cambia se puede guardar en el caché de
Anthropic y releer a 5 centavos el millón… **si se relee**. Si no, se paga por guardarlo (2,50 el millón) y
se vuelve a guardar en el turno siguiente. Eso es lo que estaba pasando: **de cada $10 del vendedor, $8,20
eran «guardar en el caché»**.

**El número clave: el vendedor de Depot baja de ~$0,030 a ~$0,020 por turno (−33 %), unos $42 al mes con el
tráfico de esta semana**, sin cambiar lo que el bot dice.

## 1. Lo que muestra producción (25-nov 01:41 → 27-nov, solo lectura)

| | |
|---|---|
| Turnos del vendedor Sonnet 5.5 | 383 |
| Costo | $11,57 ($0,030 por turno) |
| De eso, escritura al caché | **$9,51 (82 %)** |
| Turnos de una sola ronda que leyeron el prefijo fijo | 30 de 96 |
| … si el turno anterior de esa fase fue hace < 5 min | 27 de 36 |
| … si fue hace 5–60 min | **3 de 46** |

Tres causas, cada una comprobada:

1. **El caché vencía antes de que llegara el siguiente chat.** El caché normal dura 5 minutos. Entre un turno
   y el siguiente de la misma fase pasan casi siempre entre 5 y 60 minutos (Depot recibe ~6 turnos por hora,
   repartidos en 4 fases). Con 5 minutos, solo 28 % de los turnos encontraba el prefijo guardado.
2. **Una línea de la conversación iba dentro de las reglas fijas.** «La tarjeta del Kanban sigue en nuevo»
   cambia por conversación y estaba al final del system, que es justo lo que se cachea. Partía el caché de
   cada fase en hasta cinco versiones: la fase `medida_confirmada` con la tarjeta en `nuevo` (146 turnos) y
   con la tarjeta en `medida_confirmada` (88) eran dos prefijos distintos de 7.466 tokens que se guardaban
   por separado. Comprobado byte a byte sin llamar al API (`app/scripts/sim/prefijo-cache-vendedor.ts`):
   antes, dos conversaciones de la misma fase con distinta tarjeta daban prefijos distintos; ahora, iguales.
3. **El historial no se reusaba entre turnos.** El último punto de caché caía detrás de los hechos del turno,
   que cambian siempre; el turno siguiente no podía releer nada de la conversación.

Lo que NO era la causa: el orden de las herramientas (es fijo por fase) ni texto con fecha u hora dentro del
system (el horario cambia una vez al día).

Tamaño exacto del prefijo fijo (count_tokens de Anthropic, gratis):

| Fase | Herramientas | System | Total |
|---|---|---|---|
| nuevo | 5.233 | 1.963 | 7.206 |
| medida_confirmada | 5.429 | 2.027 | 7.466 |
| seleccionando | 6.114 | 1.998 | 8.122 |
| cotizacion_enviada / seguimiento | 6.475 | 1.932 | 8.417 |

## 2. El arreglo (en orden de seguridad)

- **(a) La línea del Kanban sale del system** y va con los demás hechos del turno, detrás del historial
  (`hechoDeLaTarjeta` en `prompts.ts`). El modelo la sigue leyendo, solo que más abajo, junto a los otros
  datos de la conversación. Vale también para gpt-5.5 de respaldo, que cachea igual por prefijo.
- **(b) El prefijo fijo se guarda 1 hora en vez de 5 minutos** (solo el vendedor; el Guardián y el
  clasificador siguen igual). Guardar por 1 hora cuesta 2× la entrada en vez de 1,25×; leer cuesta lo mismo.
  Conviene porque el hueco típico entre chats de la misma fase está entre 5 y 60 minutos.
- **(c) Un punto de caché al final del mensaje del cliente, antes de los hechos.** El turno siguiente de la
  misma conversación trae ese mismo historial y lo relee. No cuesta escritura extra: la cola ya se guardaba
  hasta el final. Solo con herramientas (sin herramientas nadie escribiría hasta el final).
- La cola de la conversación se sigue marcando en la primera ronda: 3 de cada 4 turnos tienen una segunda
  ronda que la relee, y eso paga de sobra el recargo en los turnos de una sola ronda (~$0,002 cada uno).
- **La factura cuadra:** lo guardado por 1 hora se registra aparte (migración 043,
  `ai_runs.cache_write_1h_tokens`) y `billing.ts` lo cobra a 2×.

## 3. ¿Conviene la hora? El tráfico real, repetido con cada opción

`app/scripts/sim/simular-ttl-cache.mjs` repite los 384 turnos reales (CSV sacado de `ai_runs`, solo lectura), con su hora y su fase, y cuenta qué
pasa con el prefijo fijo en cada caso. El modelo reproduce lo medido: con la configuración de hoy da 28 % de
aciertos; producción midió 31 % (30 de 96 en los turnos de una ronda).

| Escenario | Aciertos | Costo del prefijo por turno | Ahorro al mes (Depot) |
|---|---|---|---|
| Hoy (5 min, Kanban dentro) | 106/384 (28 %) | $0,0145 | — |
| (a) Kanban fuera, 5 min | 161/384 (42 %) | $0,0119 | $11 |
| (b) Kanban dentro, 1 hora | 301/384 (78 %) | $0,0079 | $29 |
| **(a)+(b), lo que va en el PR** | **340/384 (89 %)** | **$0,0049** | **$42** |

A eso se suma (c), el historial reusado entre turnos: en 85 de 383 turnos el anterior de la misma conversación
fue hace menos de 5 minutos y en la misma fase. Es un extra chico (unos pocos dólares al mes como mucho) y no
está sumado en los $42: el historial de un chat típico es corto y el primer turno no se relee (ver «Para
después»). Se comprobó que funciona en el simulador (sección 4).

«Al mes» = 30 días al ritmo de esta semana (147 turnos del vendedor por día). Competimotor corre el mismo
código, así que ahorra en proporción a su tráfico.

## 4. Medición en el simulador

Dos simuladores a la vez, vendedor Claude Sonnet 5.5 y Guardián Haiku 5.5, cada uno con su propio caché (una
marca inocua en los prompts de fase para no leer el caché de producción ni el del otro). Los mensajes de la
conversación estándar (la 18588), tres conversaciones seguidas con **6,5 minutos de pausa** entre una y otra:
el hueco típico de producción, justo pasado el vencimiento de 5 minutos. Script:
`app/scripts/sim/medir-cache-vendedor.mjs`; detalle en `app/scripts/sim/mediciones/202611271738-cache-*.json`.

| Costo del vendedor por conversación | Antes (`main`) | Después (esta rama) |
|---|---|---|
| Conversación 1 (caché vacío) | $0,0672 | $0,0877 (guardar 1 hora cuesta más la primera vez) |
| Conversación 2 (6,5 min después) | $0,0666 | **$0,0277** |
| Conversación 3 (6,5 min después) | $0,0651 | **$0,0306** |

Por turno del vendedor: antes ~$0,033 siempre (cada turno volvía a guardar los ~7.500 tokens fijos); después,
con el caché vivo, ~$0,015. En las conversaciones 2 y 3 el turno 1 leyó 7.526 tokens del caché de la
conversación anterior en vez de escribirlos.

Esto es el mejor caso (todas las conversaciones en la misma fase y a 6,5 minutos). El número para producción
es el de la sección 3, que usa los huecos y las fases reales: −32 % en el vendedor.

**Calidad:** las 6 conversaciones mostraron las mismas tres llantas (Kenda KR15, KR33A, KR100) con los mismos
precios, la misma pregunta de cierre y el mismo «quedo pendiente de su confirmación». La única variación
(a veces texto comparando la 2 y la 3, a veces la lámina comparativa) aparece en los dos lados y es la
variación normal del modelo. Ningún turno falló, ningún 400 del API con los puntos de caché nuevos.

**El historial entre turnos (c)**, con preguntas seguidas en la misma fase (`--textos`, `…-cache-historial2.json`):
el turno 3 leyó 8.786 tokens y el 4, 8.964, contra 8.188 del prefijo fijo solo: releyó la conversación
anterior. Es poco en chats cortos y crece con el largo del chat. No suma escritura: lo escrito por turno sigue
siendo «todo lo que no se leyó».

**Un hallazgo del simulador, ya corregido en el PR:** en un turno con el historial vacío, los hechos del turno
quedaban pegados al system y lo hacían único por conversación (justo el bloque que ahora se guarda una hora).
En el vendedor, ahora solo el primer system va arriba; los hechos van detrás del mensaje del cliente, como en
todos los demás turnos. En Depot casi no pasa (el saludo automático llega antes que el vendedor), pero sin
esto un cliente sin saludo pagaría la escritura de 1 hora en cada primer turno.

## 5. Riesgos

- **Si el tráfico baja mucho** (huecos de más de 1 hora entre chats de una fase), cada escritura de 1 hora
  cuesta 4 en vez de 2,50 y no se relee: el peor caso es pagar ~$0,011 más por turno en esas horas muertas.
  Con el tráfico de esta semana pasa en 44 de 384 turnos y ya está descontado en la cuenta de arriba.
- **La línea del Kanban cambió de lugar.** Mismo texto, ahora junto a los hechos del turno. No hay prueba de
  que el modelo la use distinto; las conversaciones del simulador no muestran diferencia (sección 4).
- **Migración 043** (columna nueva con valor por defecto 0): corre sola al arrancar, como la 041. Si otra rama
  también trae una 043, hay que renumerar al integrar y mover `ULTIMA_MIGRACION_REGISTRADA`.
- **Scripts que no leen la columna nueva:** `scripts/canary/claude-antes-despues.mjs` y
  `scripts/sim/lote-canary.mjs` cobran toda la escritura a 1,25×; subestiman ~1 % del costo del vendedor
  hasta que se actualicen.
- Cómo volver atrás: revertir el commit. Sin variables nuevas.

## Para después (no va en este PR)

- **El primer turno del vendedor manda el mensaje del cliente dos veces.** El saludo automático se guarda
  antes de que corra el vendedor, así que el historial termina en el saludo y no en el mensaje del cliente;
  `agent.ts` solo quita el mensaje repetido cuando es lo último del historial. Resultado: el cliente aparece
  en el historial y otra vez como mensaje actual. Son pocos tokens, pero es un prompt raro y además le impide
  al turno siguiente releer ese historial del caché. Arreglarlo cambia lo que ve el modelo: va con su propia
  prueba en el simulador.

## 6. Cómo confirmarlo en producción (después del deploy)

Una semana después, por turno del vendedor Sonnet (sin la primera hora tras publicar):

```sql
select count(*) turnos,
  avg(cache_write_tokens) escrito, avg(cache_write_1h_tokens) escrito_1h, avg(cached_input_tokens) leido,
  avg(((input_tokens - cached_input_tokens - cache_write_tokens) * 2 + cached_input_tokens * 0.1
       + (cache_write_tokens - cache_write_1h_tokens) * 2.5 + cache_write_1h_tokens * 4
       + output_tokens * 10) / 1e6) usd_por_turno
from ai_runs
where model like 'claude-sonnet-5-5%' and call_type = 'chat' and created_at > :desde;
```

Fase I (antes): media $0,0302 por turno, límites ±3σ (XmR) $0,0032–$0,0572, 383 turnos. Si el arreglo
funciona, la fase II tiene que mostrar 8 o más turnos seguidos por debajo de $0,0302 y una media cerca de
$0,020. Un turno suelto bajo la línea es ruido.
