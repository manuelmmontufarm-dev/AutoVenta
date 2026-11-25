# Plan: probar Claude (Fable 5.2 y familia) en Depot contra gpt-5.5

22-nov-2026 · rama `feat/proveedor-fable` · escrito ANTES de tener la clave de Anthropic.

## Qué estás viendo

Tres preguntas y lo que se sabe hoy de cada una:

| Pregunta | Respuesta hoy | De dónde sale |
|---|---|---|
| ¿Fable sale más barato? | **No.** Fable en todo costaría 3 a 8 veces lo que se paga hoy | Tokens reales de producción, 30 días |
| ¿Hay algo de Claude que sí abarate? | **Sí: Haiku 5.5 en el Guardián** (y es la mitad de la cuenta) | Mismos tokens, tarifas del 22-nov |
| ¿Vende más con Fable? | **No se sabe.** Es lo único que justificaría pagarlo, y hay que medirlo | Por eso la prueba pares/impares |

Nada de lo que hay en esta rama cambia el bot que atiende hoy. Sin `ANTHROPIC_API_KEY`
y sin poner un modelo `claude-…` en una variable, todo corre exactamente igual.

## 1. Los números de Depot (producción, 23-oct → 22-nov, solo lectura)

1.871 conversaciones, 21.134 llamadas a la IA, **$248 pagados** ($0,13 por conversación).

| Pieza | Llamadas | Tokens de entrada | En caché | Tokens de salida | Pagado |
|---|---:|---:|---:|---:|---:|
| Ángel Guardián | 10.324 | 81,8 M | 61 % | 2,07 M | $133 |
| Vendedor | 4.315 | 44,5 M | 54 % | 0,41 M | $102 |
| Rutina post-cotización | 915 | 7,8 M | 43 % | 0,06 M | $8 |
| Visión + clasificador | 5.580 | 2,8 M | — | 0,09 M | $6 |

Dos cosas mandan en el costo: **casi todo es entrada** (137 M de entrada contra 2,6 M de
salida) y **el Guardián es más de la mitad**. Por eso el precio de la entrada y del caché
decide todo, y por eso el Guardián es donde más se gana o se pierde.

Referencias con OpenAI: todo en gpt-5.5 serían $387; hoy (Guardián mitad en gpt-5.4-mini)
$282 calculado / $248 pagado; Guardián 100 % en gpt-5.4-mini serían $176.

## 2. Tarifas (USD por millón de tokens, verificadas el 22-nov-2026)

| Modelo | Entrada | Escribir caché | Leer caché | Salida |
|---|---:|---:|---:|---:|
| gpt-5.5 (hoy) | 5,00 | no cobra | 0,50 | 30 |
| gpt-5.4-mini | 0,75 | no cobra | 0,075 | 4,5 |
| **Claude Fable 5.2** | 8,00 | 10,00 | 0,20 | 40 |
| Claude Opus 5.5 | 4,00 | 5,00 | 0,20 | 20 |
| Claude Sonnet 5.5 | 2,00 | 2,50 | 0,10 | 10 |
| Claude Haiku 5.5 | 0,10 | 0,125 | 0,01 | 0,50 |

Fuente: platform.claude.com/docs/en/about-claude/pricing. Tres diferencias que no se ven
en la tabla y que suben la cuenta de Claude:

1. **Claude cobra por escribir al caché** (1,25× la entrada) y el caché dura 5 minutos;
   el de OpenAI dura 24 h y escribir es gratis. En horas flojas se paga la escritura y
   nadie la lee.
2. **Claude cuenta ~30 % más tokens** por el mismo texto (lo dice su propia página de precios).
3. **Claude razona siempre** y ese razonamiento se cobra como salida. gpt-5.5 corre el
   turno con herramientas sin razonar. Con esfuerzo `low` es poco, pero no es cero.

## 3. Lo que costarían los mismos 30 días con cada combinación

Tres escenarios porque hay tres cosas que no se pueden saber sin la clave (cuánto más
cuenta el tokenizador, cuánto del caché se conserva, cuánto razona):

| Vendedor | Guardián | Optimista | Central | Pesimista |
|---|---|---:|---:|---:|
| gpt-5.5 | mitad mini (**hoy**) | | **$248** | |
| Fable 5.2 | Fable 5.2 | $824 | $1.240 | $2.033 |
| Fable 5.2 | Sonnet 5.5 | $417 | $607 | $950 |
| Fable 5.2 | Haiku 5.5 | $285 | $404 | $604 |
| Opus 5.5 | Haiku 5.5 | $155 | $217 | $320 |
| Sonnet 5.5 | Haiku 5.5 | $88 | $121 | $176 |
| gpt-5.5 | Haiku 5.5 | $146 | $150 | $158 |
| Haiku 5.5 | Haiku 5.5 | $24 | $29 | $39 |

Supuestos — optimista: 10 % más tokens, mismo acierto de caché que OpenAI, el doble de
salida. Central: 25 % más tokens, 80 % del acierto, el triple de salida. Pesimista: 35 %
más tokens, la mitad del acierto, seis veces la salida. El primer lote del simulador
reemplaza estos supuestos por medidas (el script ya guarda tokens leídos, escritos y de
razonamiento por pieza).

**Lectura:** con el contrato de $600/mes con IA incluida, la IA es margen de Manuel.
Fable en todo se comería entre $800 y $2.000 de ese margen. Las dos jugadas con sentido:

- **Guardián a Haiku 5.5**: ahorra ~$95/mes sobre lo de hoy, si revisa igual de bien.
- **Vendedor a Fable 5.2 con Guardián Haiku**: cuesta ~$150 más por mes que hoy (central).
  Para Depot se justifica con muy poco: una sola venta extra al mes son ~$600 de
  facturación. Para Manuel no es automático: los $600 del contrato son fijos, así que
  esos $150 salen del margen salvo que el resultado sirva para cobrar más, para retener
  al cliente o como argumento con los referidos. La prueba dice si vende más; qué hacer
  con ese dato es decisión de negocio.

## 4. Lo que ya está construido (y probado sin clave)

| Qué | Dónde | Cómo se probó |
|---|---|---|
| Una sola puerta a un modelo de chat; el nombre del modelo decide el proveedor | `app/src/agent/chat.ts` | 8 pruebas con el SDK real contra un Anthropic de mentira |
| La traducción de ida y vuelta | `app/src/agent/chatClaude.ts` | 20 pruebas en memoria |
| Vendedor, rescate, Guardián, clasificador, visión y redacción de seguimientos pasan por esa puerta | `agent.ts`, `guardian.ts`, `classifier.ts`, `vision.ts`, `followUpCopy.ts` | Suite completa: 4.598 pasan; los 4 archivos en rojo ya fallan en `main` sin este cambio |
| El canary valida cada modelo en SU proveedor y se apaga solo si falta la clave | `app/src/agent/canary.ts` | 2 pruebas nuevas |
| El costo cuenta lo escrito al caché | `billing.ts`, migración 041, `logAiRun` | 5 pruebas |
| El simulador acepta modelos `claude-…` con clave de pruebas aparte | `scripts/sim/sim.mjs` | `npm run sim:humo` ✅, y el bot real contra el Anthropic de mentira: 4 peticiones, 0 rechazos |
| Los lotes cuestan bien a Claude, guardan tokens por pieza y suman un segundo juez | `lote-canary.mjs`, `comparar-canary.mjs` | Sintaxis; se estrena con la clave |
| Humo contra la API real | `npm run claude:humo` | 14 de 14 contra el doble local |

Siguen en OpenAI, a propósito: la **transcripción de audios** (Anthropic no transcribe) y
la **investigación de fitment** (usa la búsqueda web de OpenAI). O sea: la clave de OpenAI
no se puede dar de baja aunque todo lo demás pase a Claude.

### Decisiones de diseño que conviene conocer

- **Mismos prompts, mismas herramientas, mismos candados.** La comparación mide el modelo,
  no una reescritura. Afinar el prompt para Claude es un paso posterior, solo si gana.
- **Esfuerzo `low`** en vendedor y Guardián (`AI_CLAUDE_EFFORT_VENDEDOR` / `_GUARDIAN`):
  es lo comparable al «sin razonar» de gpt-5.5 y lo que cabe en los tiempos de un chat.
- **Los «hechos del turno»** que el vendedor mete como `system` detrás del historial salen
  como mensaje `system` después del mensaje del cliente (Claude no lo acepta antes).
- **Si un filtro de seguridad de Claude rechaza un mensaje**, Anthropic lo reintenta solo
  en otro modelo (opción `fallbacks`, activada); si aun así rechaza, entra el rescate del
  bot, que hoy es gpt-5.5. Es raro en ventas de llantas, pero no deja al cliente sin respuesta.
- **Fable guarda los datos 30 días** (requisito de Anthropic para ese modelo). Depot ya
  manda sus chats a OpenAI; con esto pasan también por Anthropic.

## 5. Riesgos, de mayor a menor

1. **Latencia.** Hoy el vendedor contesta en ~3,5 s por llamada (mediana) y el Guardián en
   ~2 s, con tope de 20 s: si se pasa, el borrador sale SIN revisar. Claude razona siempre.
   El humo mide esto primero; si el Guardián en Fable roza los 20 s, Fable queda descartado
   para esa pieza sin gastar un lote.
2. **El caché de 5 minutos.** En horas flojas cada llamada paga escritura. Se ve en el
   primer lote (columna «% leído de caché»). Si pega poco, hay dos salidas ya previstas:
   caché de 1 hora (escribir cuesta el doble) o un «latido» barato que lo mantenga vivo.
3. **Que el Guardián de Claude corrija distinto.** El Guardián es la última mano que toca el
   texto y ya rompió cosas tres veces. Los candados determinísticos corren después de él,
   así que lo grave está cubierto; lo que hay que mirar es cuánto corrige y qué.
4. **Límites de cuenta nueva.** Una cuenta recién creada puede arrancar en un nivel de
   evaluación con límites más bajos y tiene tope de gasto de $500/mes en el primer nivel.
   Alcanza para la prueba; para producción al 100 % en Fable habría que subir de nivel.
5. **Un solo canary a la vez.** El mecanismo pares/impares hoy lo ocupa la fase III
   («solo Guardián» en gpt-5.4-mini, que tocaba revisar el 20-nov). Hay que cerrarla antes
   de usar el canary para Claude.

## 6. Las pruebas, en orden, con los $100

Cada paso decide si se hace el siguiente. El control (gpt-5.5) y el juez de siempre corren
con la clave de pruebas de OpenAI, no gastan de los $100.

Los 50 casos son `scripts/sim/datos/dificiles-50.json` (conversaciones reales difíciles,
no se versionan). El control de octubre NO sirve de comparación: el bot cambió mucho desde
entonces, así que el paso 1 incluye correr el control de nuevo con el código de hoy.

| # | Qué | Para decidir | Costo Anthropic |
|---|---|---|---:|
| 0 | `npm run claude:humo -- --modelos claude-fable-5-2,claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5` | ¿La API acepta cada forma de petición? ¿Pega el caché? ¿Cuánto tarda cada modelo? | ~$0,50 |
| 1 | Lote 50 difíciles: **gpt-5.5 + Guardián Haiku** | ¿Haiku revisa tan bien como gpt-5.5? (el ahorro seguro) | ~$1 |
| 2 | Lote 50: **Fable + Guardián Haiku** | ¿Fable cotiza y agenda más que gpt-5.5? ¿Cuánto cuesta de verdad? | ~$12 |
| 3 | Lote 50: **Opus 5.5 + Haiku** y **Sonnet 5.5 + Haiku** | ¿Hay un punto medio que rinda parecido por la mitad? | ~$8 |
| 4 | Lote 25: **Fable + Guardián Fable** | ¿El Guardián caro cambia algo? (para descartarlo con datos) | ~$15 |
| 5 | La mejor combinación, **dos corridas más** (regla de las 3 corridas) | ¿El resultado se repite o fue suerte? | ~$20 |
| — | Segundo juez (Claude Opus 5.5) en todos los lotes | Que el juez de OpenAI no esté prefiriendo «su» estilo | ~$6 |
| | **Total** | | **~$63**, quedan ~$37 de margen |

Cómo se corre un lote (igual que el canary de octubre):

```bash
cd app && npm run build
npm run sim -- --canary-model claude-haiku-5-5 --canary-model-vendedor claude-fable-5-2 --canary-model-guardian claude-haiku-5-5 --debounce 1500
node scripts/sim/lote-canary.mjs --etiqueta fable-haiku --rango 1-50
node scripts/sim/comparar-canary.mjs mediciones/canary-fable-haiku.json mediciones/canary-control.json
```

Qué se mira, en este orden: invariantes rotos y fallas técnicas (si suben, se para ahí),
cotizaciones y visitas acordadas, nota de los dos jueces, costo por conversación, segundos
por llamada. Se muestra como gráfico de control (`grafico-canary.mjs`), no como «mejor/peor».

## 7. Pastilla roja / pastilla azul en producción (solo si el simulador no muestra daño)

- **Reparto:** teléfonos terminados en dígito par = Claude; impares = lo de hoy. Es el
  canary de `src/agent/canary.ts`, sin código nuevo.
- **Variables en Railway (Depot_Tire):** `ANTHROPIC_API_KEY` (una clave de PRODUCCIÓN,
  distinta de la de pruebas), `OPENAI_CANARY_MODEL`, `OPENAI_CANARY_MODEL_VENDEDOR`,
  `OPENAI_CANARY_MODEL_GUARDIAN` con los modelos ganadores, `AI_CANARY_DIGITS=0,2,4,6,8`,
  `AI_CANARY_SCOPE=vendedor,guardian`.
- **Duración:** dos semanas y después se cruzan los grupos una semana, como en octubre
  (así se ve si la diferencia sigue al modelo o a los teléfonos). Con ~170 chats con
  medida por grupo en dos semanas se detecta una diferencia de ~9 puntos en «cotiza»;
  algo más fino necesita más semanas.
- **Qué se mide:** % que cotiza después de dar la medida, % que cotiza después de ver
  opciones, % con día de visita, % que el Guardián corrige, fallas técnicas, costo por
  chat, segundos por respuesta, y ventas contra facturas de Contífico.
- **Volver atrás:** borrar `AI_CANARY_DIGITS` (o dejarlo vacío). Un minuto, sin deploy de código.
- **Cuándo:** no durante Black Friday (hasta el 30-nov). Lo sano es simulador esta semana
  y producción desde el 1-dic.
- **Falta construir para esta etapa:** que `scripts/canary/control-charts.mjs` cueste a
  Claude y tenga su fase. No se tocó ahora porque tiene cambios sin subir en otra rama
  (`chore/canary-fase-iii`) y porque en producción la columna nueva no existe hasta el deploy.

## 8. Qué necesito de Manuel

1. La clave de Anthropic de **pruebas**, pegada en `app/.env.sim` (no en el chat):
   `ANTHROPIC_API_KEY=sk-ant-…`
2. Decidir qué pasa con la fase III del canary (Guardián gpt-5.4-mini): ocupa el lugar que
   la prueba de Claude necesita en producción.
3. Después del simulador: elegir la combinación que va a producción y cuándo.
