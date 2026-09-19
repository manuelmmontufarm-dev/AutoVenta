# Pedido de diseño — adelgazar al guardián, niveles 2 y 3

> Este es el pedido para la sesión que va a DISEÑAR (no implementar) los niveles
> 2 y 3 de `docs/PLAN-ADELGAZAR-GUARDIAN.md`. Reemplaza al pedido original del
> 12-sep: corrige cuatro datos que estaban mal y agrega las protecciones que
> faltaban. Pegar entero en una sesión nueva.

---

Sos arquitecto de software revisando el repo AutoVenta (bot de ventas de llantas
por WhatsApp, cliente Depot Tire, Quito). Tu tarea es **diseñar —no
implementar—** cómo sacar de la rúbrica del Ángel Guardián (un juez de IA que
revisa cada respuesta del bot antes de enviarla) las reglas que se pueden
verificar con código determinístico, **sin devolverle al cliente errores que hoy
el guardián atrapa**. El objetivo es bajar costo; la restricción dura es no
empeorar ningún error.

## Dónde trabajar

- Rama `perf/adelgazar-guardian`, worktree
  `/Users/manue/AutoVenta/.claude/worktrees/adelgazar-guardian`. Ya trae el
  nivel 1 (`e6cbe92`) mergeado sobre `main` (`4d83b9f`), con typecheck y 2.055
  pruebas en verde. **No trabajes sobre la rama vieja del nivel 1**: estaba 27
  commits detrás de `main`.
- Hay otros chats trabajando el repo. `guardian.ts` y `prepararSalida.ts` son
  zona caliente: trabajá solo en tu worktree.
- Entregable: `docs/DISENO-ADELGAZAR-NIVEL-2-3.md`. Nada de código todavía.

## Por qué importa (números corregidos)

- El guardián es el 55 % de la factura de OpenAI: $0,079 de $0,140 por
  conversación, 5.740 corridas/mes (≈4,7 por conversación). El 36 % de su costo
  es **salida** (reescribe el mensaje entero, 185 tokens promedio a $30/M).
- Apagarlo no es opción: corrige el 43 % de los borradores (769 de 1.230
  conversaciones/mes) y ahí viven los errores duros (medida, precio, stock).
- Nivel 1 sacó 512 tokens reales de rúbrica. El plan lo contó como 3,1 % del
  costo ($0,140 → $0,136); medido con el caché de producción es **$0,0013 por
  conversación, ~1 %**.
- Costo medido en producción (30 días al 12-sep): **$0,125 por conversación**,
  guardián 52 %. Últimos 7 días: $0,106, guardián 58 %.

**Correcciones a lo que decía el plan:**

1. **Los "tokens" del plan son caracteres ÷ 4, no un tokenizer.** Todas las
   reglas dan exactamente 4,0 caracteres por "token" medido, salvo la 22.
   Medidas con la misma vara sobre el texto actual:

   | Regla | Tokens (car/4) | Plan decía |
   |---|---|---|
   | 12 estado desincronizado | 197 | 197 |
   | 21 tipo sale del catálogo | 326 | 326 |
   | 15 preguntas prohibidas (entera) | 633 | 633 |
   | 22 sin medida no hay cotización | **469** | 611 |
   | 19 reofrece lo aceptado | 248 | 248 |
   | 20 ancho rechazado | 193 | 193 |
   | 11 negativa con alternativa | 237 | 237 |

   Rúbrica `INSTRUCCIONES` tras nivel 1: ~4.250.

2. **El ahorro prometido estaba muy inflado, porque la rúbrica vive en caché.**
   Contado exacto (`scripts/guardian/contar-tokens-rubrica.mjs`): el nivel 1
   sacó 512 tokens reales y ahorra **$0,0013 por conversación**, no $0,004. En
   producción el 96 % de las llamadas del guardián trae la rúbrica en caché,
   así que un token de rúbrica cuesta ~$0,68/M, no $5/M. Con esa vara (tokens
   reales ≈ la tabla × 1,08):
   - Nivel 2: **$0,0025–0,0037** por conversación. El plan decía $0,021.
   - Nivel 3: **~$0,0037**; sin la 11, ~$0,003. El plan decía $0,030.
   - Todo junto: **~$0,007**. No $0,051.

   Consecuencia de diseño: **el costo no justifica correr ningún riesgo de
   calidad**. Los niveles 2 y 3 se hacen por disciplina (que la rúbrica no
   crezca sola) y porque un candado no falla, no por plata. Leé
   `docs/COMO-MEDIR-TOKENS.md` antes de estimar cualquier ahorro.

3. **La palanca de salida es más grande que todo el nivel 3.** Salida del
   guardián ≈ 36 % × $0,079 ≈ **$0,028 por conversación**. Para las categorías
   que un candado posterior arregla igual, pedir solo veredicto + hallazgo (sin
   el texto reescrito) ahorra plata sin tocar ninguna regla. Evaluala en el
   diseño y medí qué fracción de las correcciones cae en categorías cubiertas.

4. **`PASOS` ya no tiene 24 pasos: tiene 29.** El guardián sigue en el paso 3
   (`angel_guardian`). Los pasos 1–2 corren ANTES del guardián
   (`sin_pregunta_pendiente_consecutiva`, `guardian_deterministico`), y el 4 es
   `guardian_no_vende_solo`. Releé la lista entera antes de proponer posiciones.

## Reglas de trabajo que no se rompen

Las tres del plan siguen (mismas puertas; se verifica en simulador; nada nuevo
entra a la rúbrica si un candado puede verificarlo). Se agregan cinco:

4. **Una regla por cambio, publicada por separado.** Si algo se rompe en
   producción, tiene que saberse cuál fue sin investigar.
5. **Modo sombra antes de borrar.** Todo candado nuevo que reemplace juicio
   (21, 22, 19, 20, 11) entra primero en producción **solo observando**:
   corre, registra lo que habría hecho (alerta o log), y **no cambia el
   texto**. La regla sigue en la rúbrica. Durante 1–2 semanas se compara contra
   los hallazgos del guardián de esa categoría. Recién cuando el candado atrapa
   lo mismo (umbral a definir por regla) se borra la regla. Diseñá, por regla:
   qué se registra, contra qué categoría del guardián se compara, cuánto dura y
   cuál es el umbral.
6. **Definí qué hace el candado cuando detecta.** Detectar es fácil; corregir
   texto libre sin modelo es donde nacen errores nuevos (frases cortadas,
   mensaje mudo, contradicciones). Para cada regla elegí explícitamente:
   reemplazo entero por plantilla, quitar una frase (y qué garantiza que no
   queda mudo), o frenar y dejar alerta.
7. **Tres opciones por regla, no dos.** Además de "candado reemplaza" y "se
   queda", evaluá **regla a demanda**: el código detecta la situación (el HECHO
   existe) y **solo entonces** se agrega el párrafo de la regla, **al final**
   del contexto, después del prefijo fijo que se cachea. Así la mayoría de las
   corridas no lo pagan y el juicio sigue donde hace falta. Para cada regla
   estimá en qué % de corridas aparece su HECHO (sale de la base de producción,
   solo lectura) y cuánto ahorra cada opción.
8. **Medí con tokens reales antes y después.** Cada cambio de texto se cuenta
   con `scripts/guardian/contar-tokens-rubrica.mjs` y se corre la conversación
   estándar (`scripts/sim/medir-conversacion-estandar.mjs`) para ver que el
   costo total no suba y el bot siga contestando bien. Método completo en
   `docs/COMO-MEDIR-TOKENS.md`. Nunca caracteres ÷ 4.

## Archivos clave (leelos antes de proponer)

- `docs/PLAN-ADELGAZAR-GUARDIAN.md`: el plan; incluye las 4 reglas del nivel
  1 que parecían cubiertas y no lo estaban. Esa es la vara.
- `app/src/services/guardian.ts`: `INSTRUCCIONES`, `INSTRUCCIONES_SEGUIMIENTO`
  y `armarContexto` (los HECHOS). Arriba está la doctrina del nivel 1.
- `app/src/services/prepararSalida.ts`: `PASOS`, 29 pasos, cada uno con
  `corre: [...]`. El orden es un dato.
- `docs/COMO-ARREGLAR-EL-BOT.md`, "Elegir la capa correcta": tres capas y
  cuatro puertas de salida (`index.ts`, `resumeBot.ts`,
  `followUpProcessor.ts`, `/restart`).
- `app/test/rubricaAdelgazada.test.ts`: el molde de prueba (la regla salió + el
  candado sostiene el caso solo + orden y puertas en `PASOS`).
- **Herramientas de medición que ya existen, usalas en el diseño:**
  - `app/scripts/guardian/probar-rubrica.mjs`: le da al guardián real los
    borradores exactos de producción y comprueba categoría y severidad. Sirve
    para correr la rúbrica recortada contra los casos reales **antes** de
    publicar. Ya trae el caso conv 13862 (cotizacion_sin_medida).
  - `app/scripts/eval/replay.mjs`: le vuelve a servir al bot nuevo las
    conversaciones reales, sin mandar WhatsApp ni tocar producción.

## Nivel 2

1. **Regla 12 — estado desincronizado (197).** La regla dice «repórtalo y
   APRUEBA el texto tal cual»: paga tokens para un hallazgo que nunca cambia
   el mensaje. Diseñá la alerta de código (`createBotAlert`, como ya hacen
   varios pasos) que compare lo que el bot confirmó contra los HECHOS
   REGISTRADOS. OJO: la regla tiene una segunda mitad que SÍ corrige («solo
   corrige si el borrador además promete algo que contradice un hecho que SÍ
   está anotado»). Decidí si esa mitad se queda en la rúbrica (probablemente
   sí, corta) o si ya la cubre otra regla. **Riesgo esperado: bajo** para el
   cliente; el riesgo es que la detección por código de «el bot confirmó una
   visita» tenga falsos positivos y llene de alertas al asesor.

2. **Regla 21 — el tipo sale del catálogo (326).** Comparación contra el
   CATÁLOGO DE HOY (tipo entre corchetes por fila). Piezas existentes:
   `domain/tireTypes.ts` (`tipoDeProducto(codigo, modelo)`, `normalizarTipo`,
   `lineasPorAro`) y `productosDelCatalogoMencionados` (usado por
   `guardian_no_vende_solo`). Diseñá firma, archivo en `domain/`, contexto
   (tipo pedido por el cliente + tipos del catálogo en esa medida) y posición
   en `PASOS`.
   **Conflicto a resolver primero:** la rúbrica permite una EXCEPCIÓN a la
   regla 0 (el guardián puede nombrar una llanta del catálogo cuando el cliente
   pidió un tipo y el borrador lo niega o lo disfraza). Pero el paso 4,
   `guardian_no_vende_solo` (`domain/guardianNoVendeSolo.ts`), frena toda
   corrección que agregue un producto que el borrador no traía y manda el
   borrador ORIGINAL; **no conoce esa excepción**. Verificá en producción
   (alertas `guardian_hecho_nuevo_bloqueado`) si hoy la excepción está muerta
   en la práctica. Si lo está, la regla 21 cuesta 326 tokens para una
   corrección que no llega al cliente, y eso cambia el diseño.

3. **Regla 15 — preguntas prohibidas (633).** La enumeración cerrada ya la
   cubre `sin_preguntas_prohibidas` en las 3 puertas. La cabecera de
   `domain/preguntasProhibidas.ts` documenta que el guardián falló 3 de 3 con
   esta familia en el simulador (26-ago). Argumentá si conviene sacar la regla
   **entera** y dejar al candado como única autoridad. Lo que no puede
   perderse, y hay que decidir dónde vive: (a) «al recortar una pregunta, el
   mensaje no puede quedar mudo» (conv 13617); (b) la categoría
   `cotizacion_sin_eleccion` (preguntar el precio a secas no es elegir, conv
   13615); (c) la exención del aviso de cantidad grande («Aquí le mando la
   cotización con *9 llantas*»). `app/test/preguntasProhibidas.test.ts:120`
   fija literalmente parte del texto de la rúbrica: proponé reemplazarla por
   una prueba de comportamiento (el candado + la constante `CIERRE_COTIZAR`)
   en vez de texto exacto.

## Nivel 3

1. **Regla 22 — sin medida no hay cotización (469, 33 hallazgos/mes).** La más
   delicada. Distingue «MEDIDA NO CONFIRMADA POR EL CLIENTE» (medida deducida
   del vehículo) de «ARO DADO POR EL CLIENTE» (eligió una opción de su aro, lo
   cual SÍ autoriza cotizar). Base: `domain/medidaConfirmada.ts`,
   `domain/medidaPedida.ts`. OJO: `generar_cotizacion` en `agent/tools.ts` ya
   tiene un candado de medida (cerca de la línea 2302); la brecha es el TEXTO
   que anuncia o promete la cotización, no la pieza. Diseñá la detección de
   «anuncia, adjunta o promete una cotización» y que NO se dispare con aro
   dado. **Evaluá seriamente regla a demanda**: el HECHO ya existe y solo
   aparece cuando falta la medida.

2. **Regla 19 — reofrece lo aceptado (248, 18/mes).**
   `domain/ofertaAceptada.ts` (`ofertaDeCotizarAceptada`) ya existe, arma el
   HECHO en `guardian.ts` y ya se usa en `agent.ts`, pero no tiene paso en
   `PASOS`. Diseñá el paso. EXCEPCIÓN documentada: con «DÍA DE VISITA
   PENDIENTE», un «gracias» es acuse, no un sí; preguntar el día sigue siendo
   correcto, y la regla además carga la categoría `cierre_sin_pregunta_dia`
   (conv 13909). Decidí dónde vive esa segunda categoría si la regla sale.

3. **Regla 20 — ancho rechazado (193, 28/mes).**
   `domain/restriccionesLlanta.ts` ya existe **y ya filtra río arriba**: las
   búsquedas de catálogo descartan anchos/perfiles rechazados
   (`agent/tools.ts` ~937 y ~1434) y `generar_cotizacion` también lo consulta
   (~2301). La brecha que queda es el texto libre del modelo (repetir un ancho
   de un turno anterior). Diseñá el paso con `violaRestriccionesDeLlanta`
   sobre las medidas que menciona el borrador.
   **Corregido del pedido anterior:** decía «corregir antes de que llegue al
   guardián». Si la regla sale de la rúbrica, el candado tiene que correr
   **después** (un paso previo lo puede deshacer la reescritura del guardián).
   Existen pasos previos al guardián (1 y 2); si proponés uno, justificá por
   qué la reescritura no lo pisa.

4. **Regla 11 — negativa específica con alternativa (237).** Necesita la
   HUELLA DE HERRAMIENTAS del turno y tiene jerarquía (catálogo caído/vacío →
   ninguna negativa vale; herramienta encontró alternativa → nombrarla; nada en
   ninguna lista → «no lo manejamos» + siguiente paso). Evaluá si es candado
   viable. Hipótesis de partida: **no sale**, porque la corrección es redactar
   una alternativa con productos, que es juicio y además choca con
   `guardian_no_vende_solo`. Si concluís eso, justificalo con la misma vara de
   las 4 reglas descartadas en el nivel 1.

## Qué tiene que traer el diseño

1. **Por regla:** opción elegida (candado / regla a demanda / se queda) con su
   ahorro real estimado; candado exacto (firma, archivo, `domain/`); posición
   en `PASOS` y por qué respeta «después del guardián» y «mismas puertas que la
   regla cubría» (el guardián revisa `respuesta`, `retomada` y `seguimiento`);
   qué hace al detectar; qué pasa con su HECHO en `armarContexto` (en nivel 1
   el HECHO se quedó aunque la regla se fue).
2. **Orden relativo** entre candados nuevos y con los existentes
   (`guardian_no_vende_solo`, `sin_preguntas_prohibidas`,
   `sin_cotizacion_prometida`, `estructura_del_turno`, `sin_frase_colgando`).
   Ejemplo: ¿el de la 22 va antes o después del de la 19?
3. **Pruebas** con el molde de `rubricaAdelgazada.test.ts`: la mitad que fija
   que la regla salió y la mitad que prueba el candado con los casos reales
   documentados en las cabeceras (fecha + número de conversación) como
   fixtures.
4. **Plan de sombra por regla** (regla de trabajo 5).
5. **Riesgo honesto por regla:** cuáles son seguras (el candado ya existe, falta
   el paso) y cuáles meten lógica de juicio nueva. Decí explícitamente cuáles
   NO deberían moverse.
6. **Verificación antes de publicar, por regla:** (a) `probar-rubrica.mjs` con
   la rúbrica recortada contra los casos reales de esa categoría; (b) el
   escenario de simulador que ejercita el borrador CRUDO (sin la regla, el
   candado recibe otra forma de texto); (c) si aplica, `replay.mjs` sobre
   conversaciones reales de esa familia.
7. **Orden de ejecución recomendado**, de menor a mayor riesgo, incluyendo la
   palanca de salida, con el ahorro acumulado esperado en cada paso.
