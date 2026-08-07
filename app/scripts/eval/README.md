# Harness de evaluación · el bot nuevo contra el historial real

Vuelve a servirle al bot de hoy, mensaje por mensaje y en orden, **todo lo que los
clientes de Depot Tire escribieron de verdad**, y compara sus respuestas con las
que dio el bot de aquel día. Sale un `informe.html` que se abre sin internet.

```
extraer.mjs  ──►  datos/historial.json
                        │
replay.mjs   ──────────►│  (corre el bot real sobre una base LOCAL desechable)
                        ▼
                  datos/replay.json          {conversacion, mensaje, respuesta_vieja,
                        │                     respuesta_nueva, modelo, tokens, ms,
                        │                     tools_usadas, …}
calificar.mjs ─────────►│  (detectores determinísticos + juez LLM)
                        ▼
                  datos/calificaciones.json
                        │
informe.mjs   ─────────►│
                        ▼
                  datos/informe.html         autocontenido, cero red
```

## Prueba en seco (sin claves, sin gastar un centavo)

```bash
node scripts/eval/extraer.mjs   --dry   # copia fixtures/ → datos/historial.dry.json
node scripts/eval/replay.mjs    --dry   # corre el BOT REAL contra dobles locales
node scripts/eval/calificar.mjs --dry   # detectores reales + juez simulado
node scripts/eval/informe.mjs   --dry   # datos/informe.dry.html
```

`--dry` **no lee `.env`**: la promesa es que corre sin claves, y leerlas "por si
acaso" abriría la puerta a gastar dinero sin querer. Lo único que necesita es un
Postgres local escuchando (`pg_isready`). El bot que corre es el de `src/` sin
tocar nada.

Los dobles los sirve `lib/stub-eval.mjs`, en el mismo proceso y en el mismo
puerto: **OpenAI** (guion determinista) y **Contífico** (catálogo mínimo en
memoria con las medidas de las fixtures). El catálogo no es un adorno — sin él
`ensureCatalogReady()` lanza, ninguna tool llega a escribir un mensaje y los
detectores que viven de lo que escriben las tools no se ejercitan nunca. Con el
stub de carga (`scripts/loadtest/stub-openai.mjs`), que responde otra pregunta,
eso era exactamente lo que pasaba: `tools_usadas` salía `[]` en todos los turnos
y `cotizacion_duplicada` / `opciones_reenviadas` no se ejecutaban jamás.

`extraer.mjs --dry` escribe a `historial.dry.json`, **no** a `historial.json`:
era la única etapa que compartía nombre entre los dos modos, y la secuencia
natural —extraer de producción, probar el cableado, correr el replay— le pisaba
a la corrida real su entrada. Además `replay.mjs` sin `--dry` **aborta** si el
historial que le dan viene de fixtures.

Las 10 conversaciones de `fixtures/historial.json` son **sintéticas** (teléfonos
del rango 59390000xxxx, no asignado) y cada una reproduce a mano una falla del
censo del 5-ago, para que si alguien rompe un detector el `--dry` lo delate. Dos
existen solo para eso: la 1103 (el cliente corrige la medida → dos piezas de
opciones en el mismo ciclo) y la 1131 (pide precio de dos marcas del mismo
precio → dos `COT-` por la misma compra, el caso KLEVER).

Lo que el `--dry` **no** puede probar por sí solo lo prueba
`test/evalMedicion.test.ts`, que corre con `npx vitest run`: la fusión de
salidas, el respeto de la marca de tiempo por mensaje, los dos detectores de
tools, el aislamiento del stub de WhatsApp bajo concurrencia y el checkpoint.

## Corrida real

```bash
node scripts/eval/extraer.mjs                    # todo el historial
node scripts/eval/extraer.mjs --dias 14          # solo los últimos 14 días
node scripts/eval/replay.mjs --max 5             # ← SIEMPRE empieza por aquí
node scripts/eval/replay.mjs                     # la corrida completa
node scripts/eval/calificar.mjs
node scripts/eval/informe.mjs
open scripts/eval/datos/informe.html
```

> ⚠️ **La `DATABASE_URL` del `.env` apunta a `postgres.railway.internal`**, que
> solo resuelve dentro de la red privada de Railway: desde el portátil no
> resuelve y `extraer.mjs` aborta con las dos salidas posibles (la URL pública
> del proxy, o `railway run`). Es el único paso que necesita red de Depot; el
> resto del harness corre entero en local.

### Variables de entorno

Se leen de `/Users/manue/AutoVenta/app/.env` (sin pisar lo que ya venga del
entorno, así que `OPENAI_EVAL_MODEL=otro node …` funciona sin editar el archivo).

| Variable | Quién la usa | Nota |
|---|---|---|
| `DATABASE_URL` | `extraer.mjs` | Base de **producción**. Se abre en solo lectura (`default_transaction_read_only`). `replay.mjs` la ignora a propósito. |
| `OPENAI_API_KEY` | `replay.mjs`, `calificar.mjs` | |
| `OPENAI_MODEL`, `OPENAI_ESCALATION_MODEL`, `OPENAI_CLASSIFIER_MODEL`, `OPENAI_VISION_MODEL`, `OPENAI_RESEARCH_MODEL` | el bot | Son los del bot: el replay mide **lo que esté configurado**, no otra cosa. |
| `OPENAI_EVAL_MODEL` | `calificar.mjs` | El juez. Por defecto `gpt-5.5`. |
| `CONTIFICO_API_KEY` | el bot | Sin ella el catálogo no sincroniza y **las tools de búsqueda y cotización fallan**: el informe lo dice en las limitaciones, pero conviene tenerla. |
| `PGUSER` | `replay.mjs` | Usuario del Postgres local; por defecto, el del sistema. |

### Banderas

| Bandera | Dónde | Qué hace |
|---|---|---|
| `--dias N` | extraer | Solo las conversaciones de los últimos N días (sin ella: todo). |
| `--limite N` | extraer | Corta el `select` (para probar). |
| `--max N` | replay, calificar | N conversaciones / N turnos. Para tantear el costo. |
| `--concurrencia N` | replay, calificar | Por defecto 3. Subir de 5 no ayuda en el replay: el pool de `src/db/client.ts` es de 5 conexiones. |
| `--retomar` | replay, calificar | Continúa desde el checkpoint en vez de empezar de cero. |
| `--modo autonomo` | replay | Encadena las respuestas NUEVAS en vez de las viejas (ver abajo). |
| `--sin-clasificador` | replay | Se salta `classifyStage`: una llamada menos por turno, pero la etapa deja de avanzar. |
| `--sin-juez` | calificar | Solo detectores. Gratis e instantáneo. |
| `--db NOMBRE` | replay | Otra base local (por defecto `autoventa_eval`). |
| `--entrada` / `--salida` | todos | Rutas explícitas. |

## Cómo retomar

Los dos scripts caros escriben una línea JSON por unidad terminada:

- `datos/replay.<modo>.jsonl` — una línea por **turno** replayado.
- `datos/juez.jsonl` — una línea por **juicio** pedido.

```bash
node scripts/eval/replay.mjs --retomar      # no vuelve a correr lo hecho
node scripts/eval/calificar.mjs --retomar
```

Sin `--retomar`, **ambos borran su checkpoint y empiezan de cero** (y el replay
recrea la base local). Con `--retomar`, el replay conserva la base y salta las
conversaciones que ya terminaron.

**Cada checkpoint pertenece a unos parámetros, no al script.** Su primera línea
es una firma (`modo`, `entrada`, `max`, `dry` en el replay; prompt, modelo y
entrada en el juez) y `--retomar` la exige idéntica: si no calza, **aborta** en
vez de mezclar. Antes, una corrida `--modo autonomo` a medias se completaba con
turnos `fiel` y el JSON resultante decía `modo: "fiel"` sobre datos generados en
`autonomo` — o sea, reclamaba una comparabilidad que no tenía.

**El juez sí reintenta lo que falló.** Un 429 que sobrevivió a los cinco
reintentos queda escrito como fila con `error`, y `--retomar` la vuelve a pedir
en vez de darla por pagada para siempre. Al agregar se toma una fila por turno,
la última: un turno que falló y luego salió bien no se cuenta dos veces.

La reanudación del replay es **por conversación entera**, no por turno: para
retomar a mitad habría que volver a ejecutar las tools de los turnos anteriores
—cotizaciones, descuentos, piezas— y eso cuesta casi lo mismo que rehacer el
turno. El juez sí retoma turno por turno, porque no tiene estado.

## Costo aproximado

No hay una cifra fija que valga para todas las corridas: depende del modelo
configurado y de lo largas que sean las conversaciones. La forma honesta de
saberlo es medirla:

```bash
node scripts/eval/replay.mjs --max 5
# → 📊 N turnos · … ; el JSON trae totales.tokensEntrada / totales.tokensSalida
```

Regla de tres desde ahí. Órdenes de magnitud del historial de Depot
(≈164 conversaciones, ≈3–4 turnos de cliente cada una → **≈500–650 turnos**):

- **Replay**: 2–3 llamadas al modelo por turno (loop + tools) más una del
  clasificador. Entrada ≈ 2–5 k tokens por llamada (el prompt base es largo),
  salida ≈ 200–400. Grueso: **1,5–3 M tokens de entrada, 150–250 k de salida**.
- **Juez**: 1 llamada por turno, ≈1,5–2,5 k de entrada y ≈120 de salida →
  **≈1 M de entrada, ≈75 k de salida**.

Multiplica por la tarifa del modelo que tengas puesto. Dos formas de gastar
menos sin perder la señal: `--max 40` (una muestra ya mueve los porcentajes) y
`--sin-clasificador`.

## Cómo se neutraliza WhatsApp

Tres candados independientes, porque uno solo se olvida:

1. **El módulo no existe.** `lib/loader.mjs` registra un hook de resolución que
   sustituye `src/wa/client.ts` por `lib/wa-stub.mjs`. El archivo que habla con
   la Graph API no se carga: ni siquiera se lee del disco. `replay.mjs` se
   relanza solo con ese loader, así que no hay forma de correrlo sin él.
2. **Verificación al arrancar.** El replay comprueba que el módulo cargado sea
   el stub (`typeof wa._eval_enviados === "function"`) y **aborta** si no lo es.
3. **Teléfonos inventados.** Cada conversación se replaya con un número del
   rango `5939000xxxxxx`, no asignado en Ecuador. Aunque alguien cambiara el
   stub mañana, no habría a quién escribirle.

Y la base de producción tampoco corre riesgo: el replay trabaja siempre contra
`postgresql://…@localhost/autoventa_eval`, que crea y borra él mismo, y aborta
si esa URL no es local. `--db` y `--admin` son lo único que llega a SQL crudo
(Postgres no acepta parámetros en `create database`), así que se validan antes
de construir ninguna URL: `--db` tiene que ser un identificador simple y
`--admin` tiene que apuntar a localhost. El replay **borra** bases; contra un
servidor remoto eso destruye datos ajenos.

Además, cada conversación lleva su propio registro de piezas
(`AsyncLocalStorage` en `wa-stub.mjs`). Con un array de módulo y
`--concurrencia 3`, el `_eval_reset()` de una borraba lo que otra acababa de
enviar: medido, 3 piezas enviadas → 8 atribuidas.

## `fiel` vs `autonomo`

- **`fiel` (por defecto)**: en el turno N el bot nuevo ve el hilo real anterior,
  **incluidas las respuestas del bot viejo**. Los dos contestaron con el mismo
  contexto exacto, que es lo único que hace comparable turno contra turno.
- **`autonomo`**: se encadenan las respuestas nuevas. Se lee más natural, pero a
  los dos o tres turnos la conversación se bifurcó y ya no hay comparación
  posible: el cliente real nunca contestó a *esa* pregunta.

## Los detectores

`lib/detectores.mjs` es un espejo literal de los de `scripts/auditoria/extraer.mjs`
(ese archivo es un script que exige `DATABASE_URL` al importarlo, así que no se
puede reusar con un `import`). La guardia compara las expresiones **y los
umbrales** —`>= 0.6` de similitud, la ventana de `minutos <= 10`, el filtro de
palabras `w.length > 3`—: un detector es su regex y su número de corte, y una
regex idéntica con otro umbral mide otra cosa. `verificarSincronia()` lee el original como texto
y comprueba que cada expresión siga apareciendo ahí; si alguien afina un detector
allá y no lo trae aquí, **el harness se niega a correr** y dice cuál cambió.

`pide_foto_que_no_puede_leer` mide una falla que **ya no lo es**: la visión está
activa (`src/services/vision.ts`). Se sigue contando —borrarla escondería un
cambio de criterio— pero sale aparte y **no cuenta** en el titular de
conversaciones afectadas del bot nuevo.

Un `0 → 0` tiene dos lecturas contrarias: «no encontró la falla» o «el detector
no llegó a ejecutarse». `cotizacion_duplicada` y `opciones_reenviadas` solo
pueden disparar si en las salidas hubo cotizaciones o piezas de opciones, así
que `calificar.mjs` cuenta cuánto material tuvieron y **lo dice** —en consola y
en el informe— cuando no tuvieron ninguno. Un cero sin ocasión de hallar nada no
es un hallazgo.

## El juez simulado de `--dry`

No opina y **no mira los detectores**. Devuelve ruido derivado de un hash del
turno, por el mismo camino que el real (texto → `validarJuicio`), para probar el
cableado y la validación del JSON. Antes derivaba sus notas de
`analizarConversacion`, o sea de la capa (a): las «dos capas que se vigilan entre
sí» eran una sola disfrazada de dos, y su `mejor N · igual N · peor N` parecía
una segunda opinión sin serlo.

## Qué NO mide

Está escrito en el propio informe, sección 08, y conviene leerlo antes de
enseñárselo a nadie. Lo esencial: es un contrafactual (ningún cliente reaccionó
a las respuestas nuevas), las fotos y audios viejos no se pueden volver a bajar
—el `media_id` de Meta caduca en días— así que **la visión y la transcripción
quedan casi sin medir**, y el juez es un modelo que opina, no un cliente que
compra.

## Archivos

| Archivo | Qué es |
|---|---|
| `extraer.mjs` `replay.mjs` `calificar.mjs` `informe.mjs` | Las cuatro etapas. |
| `lib/comun.mjs` | Flags, `.env`, checkpoints con firma, reintentos con backoff, pool de concurrencia, validación de `--db` y `--admin`. |
| `lib/detectores.mjs` | Detectores de la auditoría + guardia de sincronía (expresiones **y** umbrales). |
| `lib/medicion.mjs` | El camino de la medición: fusión de salidas, lectura por lado, detección y cobertura. Puro, para poder probarlo con datos. |
| `lib/stub-eval.mjs` | Los dobles de `--dry`: OpenAI con guion determinista + Contífico en memoria. |
| `lib/loader.mjs` `lib/loader-hooks.mjs` `lib/wa-stub.mjs` | La neutralización de WhatsApp. |
| `lib/svg.mjs` | Los gráficos, calculados a mano para que el HTML no dependa de nada. |
| `fixtures/historial.json` | 10 conversaciones sintéticas para `--dry`. |
| `test/evalMedicion.test.ts` | (fuera de esta carpeta) La medición y los candados, probados con datos. |
| `datos/` | Todas las salidas. **No se versiona**: trae mensajes de clientes reales. |
| `run.mjs` `rubrica.mjs` `reports/` | Otra herramienta, anterior y distinta: 7 conversaciones **inventadas** contra reglas duras, para saber si un cambio de prompt rompió algo antes de desplegar (`npm run test:calidad`). Este harness responde otra pregunta: qué habría pasado con los clientes de verdad. |
