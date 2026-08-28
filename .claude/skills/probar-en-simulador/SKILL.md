---
name: probar-en-simulador
description: Arregla un error del bot de AutoVenta (Depot Tire) hasta dejarlo probado en el simulador, sin parar antes, y cierra con un cuadro de antes/después y las pruebas que se corrieron de verdad. Úsalo cuando el usuario reporte una falla del bot —una captura de WhatsApp, un pedazo de conversación, «el bot cotizó 4 y solo había 3», «volvió a preguntar la medida», «prometió algo que no existe»— o cuando pida «probalo en el simulador», «no pares hasta que funcione», «verificá que ya no pase», «marcá el error como fixed». También cuando toque el bot y haya que comprobar que el cambio funciona de verdad antes de decir que está listo. No es para cambios que el simulador no puede ejercitar (el hub, piezas de diseño sueltas, scripts de facturación).
---

# Arreglar un error del bot hasta verlo arreglado

El repo es `/Users/manue/AutoVenta`. El bot atiende clientes reales de Depot
Tire por WhatsApp. Hay un simulador —`cd app && npm run sim`— que levanta el
bot ENTERO contra una base local, con la configuración y los modelos de
producción, y deja repetir el caso las veces que haga falta. Léelo:
`app/scripts/sim/README.md`.

**La regla de esta skill:** un error no está arreglado porque el código se vea
bien ni porque pasen los tests. Está arreglado cuando la conversación que
falló, repetida en el simulador, ya no falla. Sin esa evidencia no se dice
«listo».

**Y siempre se cierra con el cuadro** (sección 8): el antes y el después con
los mensajes textuales, la lista de las pruebas de verdad que se corrieron, y
cuántas pasaron a la primera. Sin eso el trabajo no está entregado, aunque el
error esté arreglado.

## El ciclo

No es una lista para marcar de corrido: los pasos 4–6 se repiten hasta que el 6
pase. Si el 6 falla, se vuelve al 2 — casi siempre porque la causa raíz era otra
o estaba incompleta.

**Llevá la cuenta de las vueltas desde el paso 4.** Cada prueba que hubo que
correr más de una vez se anota con cuántos intentos costó y qué falló en el
primero. No es para castigarse: una prueba que costó tres vueltas es justo la
que hay que mirar con desconfianza dentro de un mes, y esa información se pierde
si no se escribe en el momento.

### 1. Los hechos, de la base de producción

Antes de tocar código, mirá lo que pasó de verdad. La `DATABASE_URL` de
producción está en `app/.env` (Railway, proxy público). **Solo lectura.**

```bash
DBURL=$(grep '^DATABASE_URL' .env | cut -d= -f2-)
psql "$DBURL" -c "select id, phone, stage, current_cycle, tire_size, selected_quantity from conversations where phone like '%NUMERO%';"
```

Con el `id`, las cuatro tablas que cuentan la historia completa:

| tabla | qué te dice |
|---|---|
| `messages` | lo que se dijo, en orden, con hora |
| `ai_runs` | qué ruta y qué modelo atendió cada turno, y qué herramientas usó |
| `guardian_reviews` | el borrador, el veredicto y los hallazgos del Ángel Guardián |
| `bot_alerts` | qué se le avisó al asesor |

`guardian_reviews` es la que más veces resuelve el caso: **el mensaje malo
suele ser una corrección del guardián**, no el borrador del vendedor. Si el
`corrected_text` es el que el usuario te mandó en la captura, la causa está en
el guardián, no en el prompt del vendedor.

**Guardá el ANTES ahora, textual.** Copiá el mensaje malo tal como salió, con su
hora y su número de conversación. Es la mitad del cuadro de cierre y después no
se puede reconstruir: en cuanto el arreglo esté puesto, el simulador ya no lo
produce. Si el caso no vino de producción sino de una captura, reproducilo
primero en el simulador **sin el arreglo** y guardá lo que salga.

### 2. La causa raíz, no el síntoma

Preguntá siempre: *¿por qué el sistema permitió esto?* «El modelo se olvidó» no
es una causa: el modelo siempre se puede olvidar. La causa es qué no se lo
exigía.

Dos patrones que ya se pagaron caro en este repo:

- **El dato vive un solo turno.** Se calcula en una tool, sale en ese mensaje y
  muere ahí; los turnos siguientes vuelven a decir lo contrario. Si el arreglo
  es «que el modelo se acuerde», está mal: tiene que ser un hecho consultable.
- **El candado corre antes de quien reescribe.** El orden de un turno es
  `runAgent → applyOutboundGuard → revisarConGuardian → enviar`. Un candado
  determinístico puesto en `applyOutboundGuard` **no protege** de lo que el
  guardián de IA escriba después. Lo que tenga que ser cierto sí o sí va al
  final (`src/services/stockCorto.ts` es el ejemplo).

### 3. Contá TODAS las puertas

Antes de escribir el arreglo, buscá por dónde más sale lo mismo. La misma
cotización sale por tres caminos distintos y los tres tienen que decir lo mismo:

1. el agente y sus tools (`src/agent/tools.ts`),
2. las rutas directas, que **no pasan por el agente**
   (`src/services/directSalesRoutes.ts`, con `DIRECT_SALES_ROUTES_ENABLED=true`),
3. los seguimientos automáticos (`src/services/followUpProcessor.ts`), que salen
   días después y no pasan por `applyOutboundGuard`.

Arreglar una sola y probar esa es cómo un error vuelve «arreglado».

Y ojo con el prompt: **`AI_COMPACT_PROMPT_ENABLED=true` en producción**, así que
toda regla que se edite en `prompts.ts` va también en `compactPlaybook.ts`.

### 4. Test de regresión que reproduzca el diálogo

Con los textos REALES sacados de la base, no inventados. Separá:

- lo puro en `test/<caso>.test.ts` (sin base, corre en milisegundos),
- lo que toca base en `test/<caso>.integration.test.ts` (necesita Postgres local).

Los tres bordes que no pueden faltar: el caso que falló, el caso que **no** debe
disparar el arreglo (para que no se vuelva ruido en cada mensaje), y el caso
límite.

```bash
cd /Users/manue/AutoVenta/app && npx tsc --noEmit && npx vitest run test/<caso>*
```

### 5. El Ángel Guardián tiene que poder verlo

Segunda línea de defensa, y el usuario la pide explícitamente. Dos cosas en
`src/services/guardian.ts`:

- **El hecho duro** en `armarContexto`: si el revisor no recibe el dato, no
  puede juzgarlo. No alcanza con que el dato esté en el historial — en el caso
  del stock, el guardián tenía el aviso a la vista y lo borró igual.
- **La regla en la rúbrica** (`INSTRUCCIONES`), con su categoría en `CATEGORIAS`
  para que el informe pueda contarla por familia.

Se comprueba con el borrador exacto que salió mal, en un script suelto contra
el guardián real. Tiene que devolver el hallazgo con la categoría nueva y
severidad `alta`.

### 6. La prueba que manda: el simulador

```bash
cd /Users/manue/AutoVenta/app
pkill -f "scripts/sim/sim.mjs"; pkill -f "dist/index.js"   # nada viejo en los puertos
npm run build && npm run sim                                 # → http://localhost:3210
```

Después: repetir la conversación **igual que el cliente**, con los mismos
mensajes, incluidos los que parecen irrelevantes. El error suele estar dos
turnos después del que se ve en la captura.

- Si el caso depende de un dato que se mueve (stock, precio), **fijalo**:
  `POST /api/stock {"codigo":"K…","cantidad":3}` o la pestaña Stock. Sin eso el
  caso no se puede repetir mañana.
- Se puede arrancar desde la conversación real: `npm run sim -- --copiar-conv 11061`.
- Mandar mensajes por API:
  `curl -s -X POST localhost:3210/api/enviar -H 'Content-Type: application/json' -d '{"texto":"…"}'`
  y leer con `GET /api/estado?desde=0` (trae los salientes, las corridas, el
  guardián y las alertas). Filtrá los del asesor: `para === cliente`.
- Para fotos y audios va `adjunto: {mime, base64}` — la visión y la
  transcripción corren de verdad.

**Verificá el mecanismo, no solo el resultado.** Que el mensaje salga bien una
vez puede ser suerte del modelo: buscá en el log del bot la marca de tu candado
y en `bot_alerts` la alerta que debía crearse. Si el mensaje salió bien pero el
candado no disparó, el arreglo no está probado — el próximo turno vuelve a
fallar.

### 7. Cerrar

```bash
npx vitest run            # la suite entera, ~825 pruebas
npm run sim:humo          # el simulador sigue en pie (0 tokens)
npx vitest run test/simuladorFidelidad.test.ts
```

La entrada en `BITACORA.md` es **obligatoria** (hay un hook que bloquea el
commit sin ella): qué, **por qué** y horas, arriba de todo, más la fila en la
tabla de horas. El «por qué» es lo que importa — el «qué» ya está en el diff.

### 8. El cuadro de cierre (obligatorio)

La respuesta final termina SIEMPRE con esto. Corto: cabe en una pantalla.

```markdown
## ✅ <el error, en una línea> — probado en el simulador

**Antes** · conv 11061, producción, 26-ago 12:04
> Por ahora la cotización vigente que tiene es la *COT-MTACEW5X* por
> *4 × KENDA KR203 185/70R14* a *$65.65 c/u*, total *$262.60*.

**Después** · simulador, misma conversación, stock fijado en 3
> …*4 × KENDA KR203 185/70R14* a *$65.65 c/u*, total *$262.60*.
> ⚠️ Recuerde que de esa llanta hoy hay *3* y la cotización es por *4*:
> el resto se lo confirma el asesor en el local.

| Prueba | Cómo se corrió | Resultado | ¿A la primera? |
|---|---|---|---|
| La conversación de Edison, mensaje a mensaje | simulador, bot real gpt-5.5, config de prod | ✅ el aviso sale en los 3 mensajes que repiten la cotización | no — 2 vueltas |
| El candado disparó de verdad | log del bot + `bot_alerts` | ✅ alerta `guard_stock_recordado` creada | sí |
| El guardián lo detecta solo | borrador del 26-ago contra el guardián real | ✅ `stock_prometido` / alta | no — 3 vueltas |
| Regresión del caso | `vitest run test/stockCorto*` | ✅ 27/27 | sí |
| Suite completa | `npx vitest run` | ✅ 955/955 | sí |
| El simulador sigue en pie | `npm run sim:humo` | ✅ 8/8 checks | sí |

**A la primera: 4 de 6.** Las dos que no:
- La conversación: el aviso salía en el reenvío pero no en el resumen — faltaba
  la tercera puerta (el seguimiento automático).
- El guardián: con la regla sola aprobaba igual; hizo falta el hecho duro en
  `armarContexto` para que pudiera verlo.
```

Cómo se llena, sin adornarlo:

- **Antes y después son textuales.** El mensaje real, entre `>`, con su origen
  (conversación y hora si vino de producción; «simulador» si se reprodujo). Un
  resumen en tus palabras no sirve: lo que convence es leer los dos mensajes uno
  debajo del otro. Recortá con `…` si es largo, pero no reescribas.
- **En la tabla van las pruebas de VERDAD**, y arriba las del simulador: son las
  que prueban el arreglo. Los `vitest` son respaldo y van abajo. Una fila por
  prueba, con el comando o el método en «cómo se corrió» — que cualquiera pueda
  repetirla.
- **El resultado lleva el número** cuando lo hay (`27/27`, `8/8 checks`, `3 de 3
  mensajes`). «Funciona» no es un resultado.
- **«¿A la primera?» se dice sin maquillar.** Si costó vueltas, va el número y
  abajo qué falló en el primer intento. Un cuadro donde todo salió a la primera
  y no fue así vale menos que no tener cuadro: la próxima sesión confía en él.
- **Si algo quedó sin probar, va igual, con ❌ o ⚠️ y por qué.** Media prueba
  anunciada es honesta; media prueba escondida bajo un ✅ es un error nuevo
  esperando.

## Cosas que no se hacen

- **No declarar arreglado sin la corrida del simulador.** Ni «debería
  funcionar», ni «los tests pasan». La evidencia es la conversación repetida.
- **No usar la clave de OpenAI del bot.** El simulador usa la suya
  (`app/.env.sim`) porque los tokens del bot se le facturan a Depot. Si falta,
  pedirla — no pasar `--con-clave-de-produccion` por comodidad.
- **No escribir en la base de producción.** Se lee y nada más.
- **No hacer push sin que lo pidan**: `main` deploya a producción Y a staging.
- **No apagar un test que estorba.** Si un test falla por el arreglo, o el test
  estaba mal (y se dice por qué) o el arreglo está mal.
- **No cerrar sin el cuadro, ni llenarlo de memoria.** Cada ✅ tiene que
  corresponder a una corrida que de verdad pasó en esta sesión. Si una fila no
  se corrió, no se pone.

## Cuando el paso 6 falla dos veces seguidas

No sigas parchando. Volvé a la base de producción y buscá qué se te escapó:
casi siempre es una puerta que no contaste (paso 3) o un candado puesto antes
de quien reescribe (paso 2). Si después de eso sigue fallando, decilo con lo
que sí quedó probado y lo que no — a medias y anunciado es honesto; a medias y
declarado listo, no.
