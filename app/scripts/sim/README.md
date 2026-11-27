# El simulador · WhatsApp de mentira, bot de verdad

```bash
npm run sim            # → http://localhost:3210
npm run sim:humo       # ¿sigue funcionando? Sin gastar un token.
```

Levanta el bot **entero** (`src/`, sin un solo mock adentro) y te deja
conversar con él en una pantalla que se ve como WhatsApp, con las piezas
—cotización, opciones, guía de medida— dibujadas de verdad, y un panel de
rayos X al lado que muestra lo que en el teléfono no se ve: qué herramienta se
llamó, con qué modelo, qué dijo el Ángel Guardián y qué alerta le abrió al
asesor.

Sirve para lo que escribirle al número real no permite: **repetir el mismo caso
las veces que haga falta**.

## Antes de la primera vez: tu clave de OpenAI

El simulador gasta tokens de verdad, y con la clave de Depot esas pruebas
terminan **cobradas al cliente** (su factura es $80/mes + IVA + tokens). Por eso
el simulador **no arranca** con la clave del bot: pide una propia.

1. `platform.openai.com` → Settings → **Projects** → crear «AutoVenta · pruebas»
2. Dentro de ese proyecto: **API keys** → *Create secret key*
3. Guardarla en `app/.env.sim` (una línea; el archivo no se versiona):

```
OPENAI_API_KEY=sk-proj-…
```

Con un proyecto aparte, OpenAI reporta ese consumo por separado y no hay que
descontarlo a mano de la factura de Depot. Todo lo demás que pongas en
`.env.sim` también manda sobre `.env`, así que sirve para probar con otro
modelo sin tocar la configuración del bot.

Para saltárselo a propósito una vez: `--con-clave-de-produccion` (avisa).

## Lo que es de verdad y lo que no

| | |
|---|---|
| El bot | **De verdad.** `dist/index.js`, el mismo binario que Railway. |
| Los modelos de OpenAI | **De verdad y cuestan.** Vendedor, clasificador y guardián. |
| La configuración | **De producción.** Se copian `settings`, prompts por etapa, beneficios, perfiles de marca, asesores y políticas de seguimiento (solo lectura). Si allá el guardián está prendido, aquí también. |
| El catálogo | Una **foto** del real de Contífico, con el stock editable. |
| WhatsApp | De mentira. Una Graph API local que guarda las piezas en vez de mandarlas. |
| La base | Local y desechable: se crea al arrancar y se borra al salir. |
| Los teléfonos | `5939000xxxxx`, rango no asignado en Ecuador. |

Nada sale hacia Meta: `GRAPH_BASE_URL` apunta al servidor local **y además** el
`channel_config` que se copió de producción se pisa con credenciales de
mentira, para que el token real ni siquiera esté en la base del simulador.

## Los modelos y los interruptores: se alinean solos

Los modelos de Depot y los interruptores que cambian su comportamiento viven en
las **variables del servicio en Railway**, no en `app/.env`, y las dos cosas se
separan sin que nadie se entere — medido el 26-ago: el `.env` decía `gpt-5.4`
mientras producción llevaba días en `gpt-5.5`, y `AI_COMPACT_PROMPT_ENABLED`
—que reemplaza el prompt ENTERO del vendedor— estaba prendido allá y apagado
acá.

Al arrancar, el simulador las lee del servicio (`railway variables`) y arranca
con ellas:

```
🎯 Configuración del servicio de producción (Railway):
   · AI_COMPACT_PROMPT_ENABLED   true          ← se alinea (acá había nada)
   · AI_HISTORY_LIMIT            10            ← se alinea (acá había nada)
   · OPENAI_MODEL                gpt-5.5       ← se alinea (acá había gpt-5.4)
   · OPENAI_ROUTINE_MODEL        gpt-5.4-mini  ← se alinea (acá había nada)
   · OPENAI_CLASSIFIER_MODEL     gpt-5.4-mini  ✓
```

Solo cruzan variables de **comportamiento**: ni una credencial. Y toda variable
de producción que el simulador no sepa clasificar se reporta como deriva —
es el aviso de que alguien agregó un interruptor nuevo y hay que decidir si
copiarlo.

Si el CLI de Railway no está a mano, cae a deducir los **modelos** de `ai_runs`
(cada turno deja escrito qué modelo lo atendió) y avisa que los interruptores
quedaron como en `.env`. Con `--sin-alinear` manda el `.env` tal cual.

Y si la copia de configuración falla, **el simulador no arranca**. Correr
degradado en silencio es peor que no correr: pasó una vez —la copia se rompió,
el bot quedó en fase 1 sin guardián— y la prueba igual daba casi todo verde.

> **`OPENAI_BASE_URL` se borra siempre.** El SDK de OpenAI la lee solo, y si la
> terminal tiene un proxy exportado, el bot le habla al proxy y no a OpenAI: la
> primera corrida de este simulador salió así y las respuestas no eran del
> modelo configurado. Para ponerla a propósito: `--openai-base-url <url>`.

## ¿Sigue sirviendo? `npm run sim:humo`

Levanta todo contra un doble local de OpenAI (cero tokens, sin red) y comprueba
que el turno completo ocurre: el webhook firmado entra, el bot contesta, la
configuración de Depot está puesta, el agente corre, el guardián revisa y los
mensajes quedan guardados. Sale con código 1 si algo falla.

**Corré esto después de tocar producción.** Junto con `npx vitest run
test/simuladorFidelidad.test.ts` —que falla si aparece una tabla de
configuración o una variable de entorno que el simulador no copia— son las dos
cosas que evitan que esta herramienta se pudra en silencio.

## Reproducir un caso

El stock de Contífico cambia solo: entre que se reporta un error y se prueba el
arreglo, la llanta pasó de 3 unidades a 7 y el error «desaparece» sin que nadie
toque una línea. Por eso el catálogo es una foto y el stock se pisa a mano
desde la pestaña **Stock**: se busca la llanta, se le escribe el número y el
bot lo toma en la próxima sincronización (≤8 s).

Para arrancar desde una conversación que ya pasó de verdad:

```bash
npm run sim -- --copiar-conv 11061
```

Copia el hilo de producción a la base local (con teléfono del simulador) y el
bot sigue desde ahí, como si el cliente acabara de escribir.

## Banderas

| Bandera | Qué hace |
|---|---|
| `--perfil ID` | Corre el simulador como OTRO cliente (`depot`, `ejemplo`, `mundillantas`; tabla `PERFILES_SIM` en `lib/entorno-prod.mjs`). Fija `--env-file app/.env.sim.<id>`, `--db autoventa_sim_<id>` y, con catálogo de Contífico, `--catalogo-snapshot datos/catalogo.<id>.json`. Un perfil sin servicio en Railway siembra la base con `seed-negocio.ts` y toma solo los modelos `OPENAI_*` del servicio de Depot; uno con servicio copia su producción como siempre. `NEGOCIO` del perfil manda: si lo copiado dice otro negocio, aborta. Un id desconocido no arranca. |
| `--catalogo-archivo RUTA` | Con un perfil de catálogo por archivo: sube ese Excel/CSV por `POST /api/catalog/import` al arrancar. Sin esta bandera el bot arranca con el catálogo vacío y lo dice. Con catálogo por archivo NO se levanta el Contífico de mentira ni se exporta ninguna `CONTIFICO_*` (tampoco en `--humo`). |
| `--catalogo-confirmar` | Con `--catalogo-archivo`: lo carga aunque la regla de seguridad pida confirmar (p. ej. el archivo es más viejo que la carga que trae la configuración copiada de producción). |
| `--copiar-conv N` | Arranca con una conversación real de producción. |
| `--hasta ISO` | Con `--copiar-conv`, copia solo lo anterior a ese instante (para repetir el turno que falló). |
| `--catalogo-fresco` | Vuelve a bajar la foto del catálogo de Contífico. |
| `--sin-prod` | No toca producción: siembra la configuración por defecto. |
| `--sin-alinear` | Usa la configuración del `.env` en vez de la de producción. |
| `--humo` | Prueba de humo con doble local de OpenAI: no gasta tokens y sale con código. |
| `--con-clave-de-produccion` | Corre con la clave de Depot (te lo va a cobrar a él). |
| `--debounce N` | Acorta el agrupador de mensajes (producción usa 12000 ms; avisa que diverge). |
| `--exact-tool-model M` `--rollout N` | Fuerza el canary del turno exacto barato. |
| `--routine-model M` | Fuerza el modelo de las etapas rutinarias (`cotizacion_enviada`, `seguimiento_venta`; `OPENAI_ROUTINE_MODEL`) para medir otro. |
| `--canary-model M` `--canary-scope S` `--canary-digits D` | Canary de modelo barato por cliente (todos los dígitos por defecto; `S` = `vendedor,guardian`, `vendedor` o `guardian`). |
| `--canary-model-vendedor M` `--canary-model-guardian M` | Modelo distinto por pieza dentro del canary. Con un modelo `claude-…` hace falta `ANTHROPIC_API_KEY=` en `app/.env.sim` (clave de pruebas, aparte de la de OpenAI); el simulador la verifica antes de arrancar. |
| `--sin-build` | No recompila (útil cuando no cambiaste `src/`). |
| `--verboso` | Vuelca el log del bot a la terminal (también está en la pestaña Log). |
| `--reentrega-ms N` | Espera antes de reentregar un webhook que no devolvió 200 (Meta reentrega; por defecto 1000). |
| `--conservar-db` | No borra la base al salir, para poder inspeccionarla. |
| `--puerto N` | Otro puerto para la pantalla (3210 por defecto). |
| `--telefono N` | Otro número de cliente (por defecto `593900000101`). |

## Fotos, audios y ubicación

El 📎 de la pantalla manda una foto o una nota de voz **de verdad**: los bytes
quedan en la Graph de mentira y el bot los baja con su `downloadMedia` de
siempre, así que la visión y la transcripción corren sobre lo que adjuntaste.
Probado: una foto del costado con «185/70R14 KENDA KR203» entró como
`[El cliente mandó una foto. Se lee: 185/70R14, Kenda, KR203 Tubeless, 88H]` y
el bot cotizó desde ahí. El 📍 comparte una ubicación, para el camino de
«local más cercano».

## Botones de WhatsApp

Los mensajes con botones (local, día y, con `politica.botonesDeOpciones`, la
lista «¿Le cotizo la 1, la 2 o la 3?») se pintan en la pantalla y se pueden
tocar: el simulador manda el `interactive.button_reply` que manda Meta, con el
`context.id` del mensaje que tenía los botones. Desde un escenario de la flota:
`{ boton: { tocar: 2 } }` toca el 2.º botón del último mensaje con botones (no
hace falta saber el id ni el ciclo).

Para probar el respaldo a texto: `POST /api/graph {"rechazarBotones": N}`
(`true` = 1) hace que la Graph de mentira rechace los próximos N mensajes con
botones con el error 131009 de Meta y se apague sola; el bot tiene que mandar
el mismo texto plano. En un escenario: la parte `{ graph: { rechazarBotones: true } }`.

## OpenAI caído o sin crédito (avisos a soporte)

Con `--stub` (los dobles del humo, cero tokens, y el simulador se queda
sirviendo) el OpenAI de mentira se puede apagar como se apagó el de verdad:

```bash
npm run sim -- --stub --debounce 1500
curl -X POST localhost:3210/api/openai -d '{"fallar":"sin_credito"}'   # 429 «You have no credits remaining»
curl -X POST localhost:3210/api/openai -d '{"fallar":null}'            # vuelve a contestar
```

También `"limite"` (429 de velocidad), `"clave"` (401) y `"caido"` (503). Con
la falla prendida, el turno termina en «tengo un problema técnico» y a soporte
le sale UN aviso (`avisos_a_soporte` en la base, la línea `📣 Aviso a soporte`
en el log y el WhatsApp en la Graph de mentira). La app del teléfono no suena
acá: en la base del simulador no hay teléfonos suscritos.

## Qué NO prueba

- **La entrega real de WhatsApp** (plantillas aprobadas, ventana de 24 h del
  lado de Meta, acuses de entrega y lectura): eso solo se ve en
  `autoventa-staging`.
- **El Interbot**: los precios salen de la foto y de lo que quedó cacheado en
  la base copiada, no de una consulta viva.
- **La deriva del catálogo**: la foto es de cuando se tomó. `--catalogo-fresco`
  la renueva.

## La flota de Competimotor (perfil `mundillantas`)

Corre las 40 conversaciones difíciles de `datos/competimotor-40.mjs` en N
simuladores a la vez, 3 veces cada una, con el catálogo del Excel real de
Fénix. Desde `app/`:

```bash
node scripts/sim/competimotor-flota.mjs --solo-cargar            # ¿se leen las 40? (no levanta nada)
node scripts/sim/competimotor-flota.mjs --plomeria --reps 1      # cañería completa, 0 tokens
node scripts/sim/competimotor-flota.mjs                          # LAS 40 × 3, 4 carriles
node scripts/sim/competimotor-flota.mjs --comparar               # muestra de 6: rápida contra clásica (× 3)
```

Lo que hace distinto a la flota de Depot (`t115-flota.mjs`, que no se tocó):

- **Modalidad rápida.** Carriles «rápidos» con `--debounce 1500` donde la
  ráfaga del cliente sale de una (80 ms entre partes), y carriles «reales» con
  los 12 000 ms de producción. El turno se da por cerrado **leyendo hechos de
  la base** (entrante guardado → corrida de IA y saliente posteriores → nada
  nuevo durante 2,5 s si el guardián revisó, 8 s si no), nunca con pausas fijas.
- **Grupo `etapa`.** El `prefijo` se corre UNA vez con el bot real, se verifica
  `estadoEsperadoPrefijo` contra la base y, si no se cumple, **falla en voz
  alta sin guardar**. Si se cumple, se guardan las tablas de estado y cada
  repetición arranca de esa base restaurada (en cualquier carril, con los
  relojes corridos al presente). El costo del prefijo va aparte.
- **Grupo `completa`**: desde el hola, carril rápido. **Grupo `tiempo`**:
  carril real, con las pausas que declare el escenario (`pausaAntesMs` manda
  sin esperar al bot).
- **`--clasico`** corre cualquier escenario desde el hola con 12 s;
  **`--comparar`** corre la muestra (3 `etapa` + 3 `completa` repartidas por
  el archivo, o las de `--ids`) de las dos formas y compara veredicto, reloj y
  costo (a la etapa rápida se le suma su parte del prefijo). Las `tiempo` no
  entran: corren igual en las dos formas.
- **Encender el bot**: producción de Competimotor tiene el bot apagado y el
  perfil con «faltantes de arranque»; la flota lo enciende en su base
  desechable con `confirmarFaltantes: true`, como haría el panel.
- **Puertos**: cada carril busca solo un bloque libre desde 4300 (otras
  sesiones corren sus propios simuladores en la misma máquina).

Banderas: `--carriles N` (4; subir a 6–8 solo si el resumen dice `429: 0`),
`--reps N` (3), `--ids CM01,CM26`, `--grupo etapa`, `--escenarios RUTA`,
`--catalogo-archivo RUTA` (por defecto `datos/competimotor-inventario.xls`,
copia de `INVENTARIO_06NOV_fenix.xls`; no se versiona), `--servicio-prod`
(por defecto `Competimotors`: el servicio se renombró en Railway y
`PERFILES_SIM` todavía dice `Mundillantas`), `--debounce-rapido`,
`--gap-rapido`, `--gap-real`, `--carriles-reales`, `--sin-build`,
`--verificar-prefijo-en-plomeria`.

Salida en `mediciones/competimotor-<fecha>/` (no se versiona): `resumen.json`,
una corrida por archivo en `corridas/<id>-<modo>-r<rep>.json` (veredicto de
cada chequeo, estado final de la base, reloj, tokens y costo desde `ai_runs`,
modelos, acciones del guardián, alertas, avisos al asesor y la transcripción
completa) y cada prefijo armado en `prefijos/`. La carpeta del worktree tiene
que estar enlazada a Railway (`railway link`) para leer las variables reales.

## Archivos

| Archivo | Qué es |
|---|---|
| `sim.mjs` | El orquestador: base, copia de configuración, arranque, prueba de humo, la API de la pantalla. |
| `lib/entorno-prod.mjs` | Las variables reales del servicio, con lista blanca y aviso de deriva. |
| `lib/tablas.mjs` | Qué tabla es configuración y qué tabla es dato. |
| `../../test/simuladorFidelidad.test.ts` | El candado: falla si producción gana algo que el simulador no copia. |
| `lib/graph-sim.mjs` | La Graph API de mentira. Guarda las piezas y registra todo lo que salió. |
| `lib/contifico-sim.mjs` | La foto del catálogo, con el stock editable. |
| `ui/index.html` | La pantalla: chat + rayos X. |
| `datos/catalogo.json` | La foto. No se versiona. |
| `competimotor-flota.mjs` | La flota de Competimotor (modalidad rápida, etapa/completa/tiempo, clásico y comparativa). |
| `lib/corredor-competimotor.mjs` | Su motor: un carril por simulador, cierre del turno por hechos, guardar/restaurar estado, costo. |
| `escenarios-prueba-competimotor.mjs` | Tres conversaciones para probar la flota (una por grupo). |
