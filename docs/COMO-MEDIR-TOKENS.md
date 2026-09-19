# Cómo medir tokens y costo sin engañarse

> Investigado el 12-sep-2026 contra el código, la documentación de OpenAI y
> producción (`ai_runs`, solo lectura). Nació de una pregunta concreta: ¿cuánto
> ahorra de verdad recortar la rúbrica del guardián? La respuesta corta es
> **mucho menos de lo que decía el plan**, y la razón es el caché.

## Resumen: qué herramienta para qué pregunta

| Pregunta | Herramienta | Ruido |
|---|---|---|
| ¿Cuántos tokens ahorra este cambio de texto en un prompt? | `scripts/guardian/contar-tokens-rubrica.mjs` (conteo exacto de OpenAI) | Cero |
| ¿Cuánto cuesta una conversación hoy? ¿Este cambio la encarece? ¿Se rompió algo? | `scripts/sim/medir-conversacion-estandar.mjs` (conversación estándar en el simulador) | Medio |
| ¿Se cumplió el ahorro en la factura? | Producción antes/después, por llamada (sección 5) | Bajo, pero tarda una semana |

Nunca uses caracteres ÷ 4. El conteo real de la rúbrica da **3,7 caracteres
por token**, no 4. Con ÷ 4 el plan subestimó los tokens de la rúbrica en ~8 %,
y la regla 22 salió con 611 cuando tenía 469.

## 1. De dónde salen los números

Cada llamada al modelo deja una fila en `ai_runs`:

- `input_tokens`: toda la entrada, **incluida** la parte cacheada (`prompt_tokens`).
- `cached_input_tokens`: la parte que se cobró a precio de caché.
- `output_tokens`: toda la salida, **incluido** el razonamiento (`completion_tokens`).
- `call_type` (`chat`, `guardian`, `classifier`, `vision`) y `route` (por ejemplo `guardian` y `guardian_seguimiento`).

`services/billing.ts` cobra `(entrada − cacheada) × tarifa + cacheada × tarifa_caché + salida × tarifa_salida`.
Esa fórmula es consistente con la API (https://developers.openai.com/api/docs/guides/prompt-caching,
https://developers.openai.com/api/docs/guides/reasoning) y las tarifas de gpt-5.5
($5 / $0,50 / $30 por millón) y gpt-5.4-mini ($0,75 / $0,075 / $4,50) coinciden
con https://developers.openai.com/api/docs/pricing.

### Lo que NO queda registrado (puntos ciegos)

Todo esto gasta y no aparece en `ai_runs`, ni en producción ni en el simulador:

| Llamada | Dónde | Qué falta |
|---|---|---|
| Transcripción de audios | `services/transcripcion.ts` | Todo (se cobra por minuto: $0,006) |
| Investigación de fitment con búsqueda web | `services/vehicleFitmentResearch.ts` | Todo, más $10 por cada 1.000 búsquedas |
| Redacción del texto de seguimiento | `services/followUpCopy.ts` | Todo |
| Visión desde vista previa de links | `services/linkPreview.ts` → `vision.ts` sin `audit` | Todo |
| Guardián que se pasa de tiempo o devuelve JSON roto | `guardian.ts`, `registrarFalloAbierto` | Los tokens (queda `guardian_reviews` con `sin_revision`) |
| Agente con varias rondas | `agent/agent.ts` | Suma las rondas en una fila y cobra todo con el **último** modelo |
| Razonamiento del guardián | `guardian.ts` (`logAiRun`) | `reasoning_tokens` queda en 0; el costo igual sale bien porque va dentro de la salida |

Consecuencia: `ai_runs` **subestima** el costo real. Para comparar antes/después
da igual, porque falta lo mismo en los dos lados. Para facturar, no.

## 2. El caché decide cuánto vale un token

Producción, 7 días al 12-sep-2026:

| Llamada | Entrada media | Cacheada media | Llamadas con ≥ 4.096 cacheados | Salida media |
|---|---|---|---|---|
| guardián (turno) | 6.455 | 4.850 | 96,1 % | 127 |
| guardián (seguimiento) | 6.586 | 4.862 | 99,0 % | 86 |
| vendedor gpt-5.5, `exact_tool_reply` | 8.895 | 5.400 | 62,4 % | 92 |
| vendedor gpt-5.5, `commercial` | 8.123 | 4.283 | 40,5 % | 102 |
| vendedor gpt-5.4-mini, `routine_stage` | 6.153 | 2.650 | 19,0 % | 50 |
| clasificador gpt-5.4-mini | 396 | 0 | 0 % | 14 |

Lo que dicen estos números:

- **El guardián tiene la rúbrica en caché casi siempre.** En 1.182 de 1.415
  llamadas la parte cacheada fue exactamente 4.864 tokens: el prefijo fijo (la
  rúbrica). Un token de rúbrica cuesta casi siempre **$0,50/M, no $5/M**.
- **Lo caro del guardián es lo que cambia en cada llamada.** Son ~1.600 tokens
  de contexto sin caché (≈ $0,008 por llamada) y la salida (≈ $0,004). La
  rúbrica cacheada es ≈ $0,0024.
- **El caché avanza de a 128 tokens.** El 100 % de los valores es múltiplo de
  128. La documentación sugiere bloques de 2.048 para gpt-5.5, pero los datos no
  lo muestran: 4.864 no es múltiplo de 2.048.
- **Cada edición de la rúbrica enfría el caché un rato**, hasta que el tráfico lo
  vuelve a llenar. En los días de cambios grandes (31-ago, 1-sep) la parte
  cacheada bajó a ~3.100.

**Precio efectivo de un token de rúbrica**
= `p × $0,50/M + (1 − p) × $5/M`, donde `p` es la parte de llamadas con la rúbrica en caché (hoy ≈ 0,96).

### Palancas que muestran los datos (no implementadas)

1. **Orden del contexto del guardián.** `armarContexto` pone los HECHOS (que
   cambian) antes que los beneficios y el catálogo del día (casi fijos), y el
   bloque fijo de seguimiento al final. Lo fijo primero amplía el prefijo cacheable.
2. **`prompt_cache_retention: "24h"` en el guardián.** El vendedor y la visión ya
   lo mandan (`agent.ts:674`, `vision.ts:75`); el guardián no.
3. **Salida del guardián.** A $30/M, sus ~127 tokens por llamada pesan más que
   toda la rúbrica cacheada.
4. **gpt-5.4-mini casi no aprovecha el caché** (19 % de llamadas con ≥ 4.096).
   No figura en la lista de retención extendida.

## 3. Conteo exacto: cuánto pesa un texto

`scripts/guardian/contar-tokens-rubrica.mjs` usa
`openai.responses.inputTokens.count` (https://developers.openai.com/api/docs/guides/token-counting),
que cuenta sin generar. Arma la misma petición del guardián (rúbrica + contexto
de muestra + esquema de salida) con el código de dos árboles y resta.

```bash
cd app && npm run build   # en los dos árboles
node scripts/guardian/contar-tokens-rubrica.mjs --a <árbol antes> --b <árbol después>
```

Traduce la diferencia a plata con el caché de producción (`--pct-cache`,
`--llamadas`, `--pct-seguimiento`; los valores por defecto están medidos al
12-sep). Da dos números: el ahorro probable y el techo sin caché.

Sirve para **cualquier** cambio de texto en un prompt, no solo la rúbrica.

## 4. La conversación estándar: cuánto cuesta una conversación

`scripts/sim/estandar/conversacion-estandar.json` es la conversación 18588
(10-sep-2026), elegida porque es la conversación promedio:

- **Camino más común:** medida → opciones → sin cotización (51 % de las
  conversaciones, 54 % del costo).
- **Tamaño:** 4 mensajes del cliente y 4 corridas del guardián (las dos medianas).
- **Costo:** $0,122, contra una media de $0,125 en 30 días.
- **Recorrido:** elección por preferencia, «mañana le confirmo», un sticker y el seguimiento automático.

Los mensajes del cliente van tal cual. El sticker va como sticker de verdad (el
simulador acepta `{ sticker: true }`). El seguimiento se adelanta en la base del
simulador y se abre el horario de atención, que si no lo cancela de noche.

### Cómo correrla

```bash
# 1. Un simulador por árbol, con puertos y base propios
node scripts/sim/sim.mjs --sin-build --nombre Mario \
  --puerto 3410 --puerto-bot 3405 --puerto-graph 4920 --puerto-contifico 4921 --puerto-stub 4922 \
  --db autoventa_sim_n1

# 2. La medición (1 de calentamiento que se descarta + 3 medidas)
SIM_UI_URL=http://127.0.0.1:3410 SIM_APP_URL=http://127.0.0.1:3405 \
SIM_DATABASE_URL=postgresql://manue@localhost/autoventa_sim_n1 \
node scripts/sim/medir-conversacion-estandar.mjs --etiqueta nivel1 --arbol <raíz del árbol> --repeticiones 3
```

Cada corrida deja un detalle en `scripts/sim/mediciones/<fecha>-<etiqueta>.json`
(tokens por tipo de llamada, veredictos del guardián y la transcripción) y una
línea en `scripts/sim/mediciones/historial.jsonl`, que es la serie de «cuánto
cuesta una conversación» a lo largo del tiempo.

### Cómo leerla

- **Costo normalizado** (el número que se compara): la entrada de cada llamada
  se cobra con la parte cacheada que producción tiene de verdad para ese tipo de
  llamada (`cacheDeProduccion` en el fixture). Así se saca el ruido del caché
  frío del simulador y de su clave aparte.
- **Costo medido:** lo que de verdad costó en el simulador. Sirve para la factura
  de pruebas, no para comparar.
- **Tokens del guardián por llamada:** la señal más estable.

### Qué NO sirve para medir

El ahorro exacto de un recorte chico. El vendedor no contesta igual dos veces,
así que el guardián recibe borradores distintos y la variación entre corridas
tapa diferencias de pocos cientos de tokens. Para eso está la sección 3. La
conversación estándar sirve para ver el costo total, detectar que un cambio lo
sube y mirar que el bot siga contestando bien.

### Cuándo cambiar la conversación estándar

`scripts/sim/estandar/perfil-historico.mjs` recalcula el perfil promedio y las
candidatas. Hay que correrlo cada trimestre o cuando cambie el tipo de cliente.
Si el camino dominante o la media se movieron, se elige otra y se sube
`version`. **Mediciones de versiones distintas no se comparan entre sí.**

## 5. Producción antes/después: la confirmación

Solo `ai_runs`, **por llamada** del guardián y no por conversación (la cantidad
de turnos cambia de semana a semana):

```sql
select route, count(*) llamadas,
  avg(input_tokens) entrada, avg(cached_input_tokens) cacheada, avg(output_tokens) salida,
  avg(((input_tokens - cached_input_tokens) * 5 + cached_input_tokens * 0.5 + output_tokens * 30) / 1e6) usd_por_llamada
from ai_runs
where call_type = 'guardian' and created_at between :desde and :hasta
group by route;
```

- 7 días antes contra 7 días después.
- Sin la primera hora después de publicar, porque el caché está frío.
- `guardian` y `guardian_seguimiento` por separado.
- Contar también `guardian_reviews` con `verdict = 'sin_revision'` en cada
  período: esas llamadas gastaron y no tienen fila.

## 6. Resultado: nivel 1 del plan de adelgazar al guardián

**Conteo exacto** (`contar-tokens-rubrica.mjs`, 12-sep-2026):

| | Antes (`main` ef8df46) | Después (nivel 1) |
|---|---|---|
| Rúbrica | 5.120 tokens | 4.608 tokens (−512) |
| Bloque de seguimiento | 203 tokens | 418 tokens (+215; ahí se movió la regla 18) |
| Neto por llamada del guardián | | −449 tokens |
| **Ahorro por conversación, con el caché de producción** | | **$0,0013 (~1 %)** |
| Techo, si nada estuviera en caché | | $0,0098 |

El plan decía $0,004 (3,1 %). Asumía que el token de rúbrica se cobra a precio
casi pleno; se cobra a precio de caché.

**Conversación estándar** (dos simuladores a la vez, 1 de calentamiento + 3
medidas cada uno, 12-sep-2026, `scripts/sim/mediciones/202609130329-*.json`):

| | Base (`main`) | Nivel 1 |
|---|---|---|
| Costo por conversación, normalizado (mediana) | $0,1275 (rango $0,120–0,159) | $0,1454 (rango $0,142–0,159) |
| Referencia: la conv 18588 en producción | $0,122 | |
| Entrada del guardián por llamada | 6.635 | **6.142 (−493)** |
| Guardián, costo normalizado (turnos + seguimiento) | $0,0608 | **$0,0587** |
| Vendedor, costo normalizado | $0,066 | $0,083 |

Cómo se lee:
- **La conversación estándar reproduce el costo real:** $0,1275 contra $0,122.
- **El guardián bajó lo que dijo el conteo exacto:** −493 tokens por llamada.
- **El total subió por el vendedor, no por el nivel 1.** En las 3 medidas del
  nivel 1 el vendedor tomó dos veces la ruta `commercial` (la más cara); en la
  base solo en 1 de 3. Esa ruta se decide antes del guardián, en un código que
  el nivel 1 no toca. Es la variación del modelo: con 3 repeticiones mueve el
  total ±$0,03 y tapa un cambio de $0,001. **Por eso el ahorro de un recorte se
  mide con el conteo exacto y no con la conversación estándar.**
- **Calidad:** todos los turnos respondieron y el seguimiento salió en las 6 medidas.
- **Cobertura:** esta conversación no pasa por las reglas que sacó el nivel 1
  (sin cotización, sin stock corto, sin despedida); esas las sostienen sus
  pruebas unitarias.

**Detalle observado:** en los dos simuladores, la primera conversación de una
base recién creada no agendó el seguimiento. Las siguientes sí. Es otra razón
para descartar la repetición de calentamiento.

**Lo que cambia para los niveles 2 y 3:** con el mismo cálculo, recortar los
~2.500 tokens reales que quedan identificados ahorra del orden de **$0,007 por
conversación**. Siguen
valiendo por disciplina (que la rúbrica no crezca sola) y por calidad, pero **no
son la palanca de costo**. Las palancas de costo son las de la sección 2.
