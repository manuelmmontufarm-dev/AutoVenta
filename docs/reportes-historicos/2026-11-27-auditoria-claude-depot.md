# Auditoría de Depot con Claude (25 al 27 de noviembre de 2026)

## Veredicto

**Claude vende igual que gpt-5.5 y cuesta menos de la mitad, pero el Guardián nuevo (Haiku) mete errores
que antes no había.** Las cifras de venta quedan dentro del ruido normal: ni mejor ni peor. Lo que sí
cambió es el Guardián: además de corregir, ahora también **rompe borradores que estaban bien** (fechas,
local, totales, links) y deja salir mensajes en los que él mismo anotó un problema.

**Revisé:** las 293 conversaciones de Depot con actividad entre el **24-nov 20:41** (hora de Quito, cuando
Depot pasó a Claude) y el **27-nov 12:10**. 227 tienen mensajes del cliente. Las leí completas en 12 lotes,
con su telemetría (corridas, Guardián, alertas, cotizaciones). Commit vivo durante la auditoría:
**019a7d5** (arrancó el 27-nov 04:23). En la ventana hubo 5 despliegues de `main`; casi todos son del
panel o de Competimotor y no cambian lo que contesta el bot de Depot. Comparo contra **el 7 al 23 de
noviembre** (gpt-5.5) para los gráficos de control y contra **la ventana anterior de igual duración** (22-nov
05:12 → 24-nov 20:41) para el costo. Solo lectura: no toqué producción.

Gráficos de control (6): [`2026-11-27-claude-depot-control.html`](2026-11-27-claude-depot-control.html).
Lecturas de cada lote, chat por chat: [`2026-11-27-auditoria-claude-depot-lotes/`](2026-11-27-auditoria-claude-depot-lotes/).

## Qué estás viendo (gráficos de control)

Cada día es un punto. Del 7 al 23 de noviembre (gpt-5.5, Black Friday ya activo) salen la línea central y
los límites de ±3σ. El 25 y el 26 son los días completos con Claude. El 24 (día del cambio) y el 27 (hoy, a
medias) no se juzgan. Un punto fuera de los límites es una **señal**. Dentro de los límites es **ruido**:
no se puede decir «mejor» ni «peor». Con solo 2 días completos, la regla de «8 seguidos del mismo lado»
todavía no se puede aplicar.

| Medida (por día) | Antes: centro y límites ±3σ | 25-nov | 26-nov | Lectura |
|---|---|---|---|---|
| Costo de IA por conversación | 8,7 ¢ (4,3–13,2) | 4,4 ¢ | **3,3 ¢** | **Señal: bajó** |
| Chats nuevos que dan su medida | 84 % (73–96) | **96,6 %** | 94,8 % | Señal leve: subió (ver nota) |
| Chats nuevos que reciben opciones | 80 % (67–93) | 91 % | 94,8 % | Arriba, dentro del límite |
| Chats nuevos que llegan a cotización | 36 % (21–52) | 40 % | 41 % | **Ruido** |
| Chats nuevos que acuerdan un día | 6,7 % (0–15) | 3,4 % | 8,6 % | **Ruido** |
| Borradores que el Guardián corrige | 34,7 % (29–41) | **41,7 %** | **42,5 %** | **Señal: subió** |
| Corridas del vendedor con error técnico | 0,1 % | 0 % | 0 % | Bajó a cero |

Nota sobre «da su medida»: ya venía subiendo desde el 16-nov (del 77 % de la primera semana al 89 % de la
segunda). Parte de la señal puede ser la mezcla de anuncios y no Claude. No se lo atribuyo con certeza.

**Black Friday como confusor:** el Black Friday corrió todo noviembre, así que está en los dos lados de la
comparación. No es la explicación de nada de lo de arriba. Sí lo será a partir del 1-dic: la comparación
después de esa fecha no sirve para juzgar a Claude.

## Lo que sí quedó bien

- **El costo por conversación bajó de 14,2 ¢ a 5,8 ¢ (−59 %)** contra la ventana anterior de igual duración.
  Casi todo el ahorro es el Guardián, que pasó de **$17,52 a $1,20** (−93 %).
- **Cero turnos rotos.** Antes hubo 23 turnos del vendedor que terminaron en error y 2 «sin créditos» de
  OpenAI. Con Claude, ninguno. Mensajes que salieron sin revisión del Guardián: **49 → 1**.
- **No se le escapó texto del sistema al cliente.** Busqué en los 2.776 mensajes del bot: cero
  «system-reminder», cero «Continúa el turno», cero «(mensajes anteriores no incluidos)», cero JSON o
  nombres de herramientas, cero respuestas vacías y cero rechazos.
- **El tiempo de respuesta no cambió:** la mitad de las respuestas llega en 20 segundos y el 95 % en menos
  de 35. Respuestas de más de 2 minutos: **8 → 1**.
- **Claude contesta bien las preguntas difíciles** (diferencias técnicas, marcas inexistentes, «¿son
  chinas?», objeciones de precio con tacto). Los 12 lectores lo destacan.

## Errores comprobados

Los 12 lectores anotaron **256 errores visibles** (los que de verdad le llegaron al cliente) en 166 de los
293 chats: **40 graves, 118 medios y 98 menores.** De esos, 120 los marcaron como propios de Claude, 83 como
de antes y 53 sin poder decirlo. No hay una lectura igual de profunda de la semana con gpt-5.5, así que
**estos números no se comparan contra antes**: solo sirven para ordenar las familias.

### 🔴 1 · El Guardián Haiku rompe borradores que estaban bien (nuevo, propio de Claude)

**Qué pasó:** el Guardián debería solo frenar errores. Ahora además los fabrica. Unos **64 de los 256**
errores (1 de cada 4) aparecieron cuando el Guardián reescribió un borrador. Lo vieron los 12 lotes.

> Cliente (26-nov 09:34, conv 34218): «Ya tiene la medida que necesito»
> Bot: «Su visita a Depot Tire Cumbayá ya está registrada para **hoy, miércoles 25** de noviembre.»
> *(era jueves 26; el borrador no traía ninguna fecha: la puso el Guardián)*

> Cliente (26-nov, conv 54189, vive en Mitad del Mundo): «Es de extremo a extremo.»
> Bot: «Como usted vive en esa zona, le conviene **Depot Tire Quito Sur**» — y antes le mandó el link de
> Cumbayá rotulado como Quito Sur, y después le volvió a preguntar el día en Cumbayá.

> Cliente (25-nov 21:28, conv 53569): «…total de las cuatro y cuánto de descuento por favor»
> Bot: «Para las cuatro llantas **no tengo una cotización firmada**, así que no le confirmo ese total.»
> *(el borrador de Claude traía bien los $619,02, el mismo total que el bot le había dado 3 minutos antes)*

Más casos: 53333 (anotó «hoy, miércoles 25» al corregir una contradicción que él mismo vio), 53569 (cambió
«DOT semana 47 de 2023» por «de 2025»), 54131 (cambió «necesito la medida» por «no necesito la medida»),
52957 («A/T 4w» era la opción 3 y el Guardián le reenvió el menú), 52677 (quitó la pregunta correcta
«¿es para camión?» de un aro 17.5), 53306 (puso el total de 4 llantas como si fuera de 2), 52600 (reafirmó la
cara después de que el cliente aceptó la barata), 53908 (convirtió un «no gracias» en despedida).

**Los números que lo confirman:**

| | gpt-5.5 / 5.4-mini (22–24 nov) | Haiku (25–27 nov) |
|---|---|---|
| Corrige en un turno normal | 38 % | 38 % |
| **Corrige un seguimiento** | **24 %** | **49 %** |
| **Aprueba aunque él mismo anotó un problema** | **1,4 %** (15 de 1.054) | **34 %** (402 de 1.183) |
| Aprueba con un problema marcado «alta» | 2 | 18 |
| Cuánto alarga el texto al corregir | +4 caracteres | +48 caracteres |

**Por qué pasó:**
1. **El Guardián no sabe qué día es hoy.** Solo recibe la fecha de la visita, nunca la de hoy, así que Haiku
   la adivina. gpt-5.5 casi nunca escribía fechas por su cuenta; Haiku sí.
2. **Haiku obedece los «hechos» guardados más que lo que el cliente acaba de decir** (local, día pendiente,
   «menú sin elegir»), y por eso mete la pregunta del local o del día donde no va.
3. **Haiku reescribe de más:** duplicó las correcciones de los seguimientos y alarga cada texto. Cada
   reescritura es una nueva oportunidad de inventar.

**Qué riesgo tiene:** alto. Son errores de fecha, de local y de dinero que ninguna regla automática ve,
dichos con seguridad. Además el borrador de Claude estaba bien en muchos de estos casos: se pierde
precisamente lo que Claude hace mejor.

### 🔴 2 · El cliente elige y no le llega la cotización (de antes, con parte de Claude)

**Qué pasó:** el cliente elige una opción («La 1», «2», «A/T 4w», «Las 4 necesito kr629») y el bot vuelve a
preguntar cuál, cotiza otra o no cotiza nunca. Es justo el paso del embudo donde más gente se pierde.

> Cliente (25-nov 10:32, conv 52940): «La 1» (KENDA KR628 a $758,24)
> Bot: *(nada: no hay corrida ni cotización)*

> Cliente (25-nov 10:39, conv 52956): «2 y q labrado tiene»
> Bot: «No tengo confirmado el diseño del labrado del KR100… **¿Cuál le cotizo, la 1 o la 2?**»

Casos: 52940, 52956, 52915 (4 veces «¿Se la cotizo?», bloqueada por el candado de medida), 52948 (pidió la
KR629 y no se la cotizó), 52458 (pidió la 1 y le cotizaron la 3), 52671, 53998, 52468, 52823, 53607. Al
revés, también **cotiza sin que el cliente elija**: 53752, 53982, 52703, 52600.

**Por qué pasó:** mezcla de tres causas. (a) Claude y el Guardián leen mal la elección cuando viene con
otra pregunta («2 y q labrado tiene») o por nombre de modelo. (b) Candados que bloquean la cotización sin
decirle al cliente por qué (52915). (c) En 52940 el mensaje llegó a las **10:32:49 del 25-nov, en medio de un
despliegue de `main` en horario de atención** (PR #121 se mezcló a las 10:32:04): el mensaje se guardó pero
nunca se procesó. Esto último es **hipótesis fuerte** (hora y datos cuadran; no revisé el código del
arranque). Hubo 5 despliegues ese día entre las 10:09 y las 11:18, en horario de Depot.

**Qué riesgo tiene:** venta perdida en el momento más caliente.

### 🟠 3 · Seguimientos que ignoran lo último que dijo el cliente (de antes, empeorado por Haiku)

**Qué pasó:** el seguimiento automático insiste con el día o el local después de un «no puedo ir», «soy de
provincia», «ya le confirmo», «ya noo», o reofrece lo que el cliente rechazó por caro.

> Cliente (25-nov 10:09, conv 49852): «Noo» «Ya noo»
> Bot (10:10): «Entendido, no le escribo más. 🤝» — y 3 horas después: «Quedamos para el lunes 23… ¿Le
> reagendamos para otro día?»

Casos: 49852, 49940, 52366, 53524, 51506, 37363, 53252, 54189, 53888 (después de «Carísimas» le recordó la
cotización cara), 53159, 52538.

**Por qué pasó:** la redacción con IA de los seguimientos **está rota desde antes de Claude**: le pide a
gpt-5.5 una «temperatura» que ese modelo no acepta, falla siempre y cae al texto fijo de plantilla (está
en los registros de Railway de hoy). El texto fijo no mira el último mensaje, y ahora Haiku reescribe la
mitad de esos seguimientos guiándose por los hechos guardados, no por la conversación.

**Qué riesgo tiene:** molestia y clientes que se van. En 49852 el bot rompió su propia promesa.

### 🟠 4 · Cantidad o medida mal leída (de antes, no es de Claude)

> Cliente (26-nov 16:51, conv 52805): «Para F150 R17 275/70 AT»
> Bot: «En **150R17** no tengo llantas disponibles hoy… la KENDA KR608 en 275/70R17… no es su medida.»

Casos: 52805 («F150» como medida 150R17), 52677 (camión R17.5 leído como R17), 31830 y 53656 (el número de
opción «1» o «Las 2» guardado como cantidad), 1455, 53607, 53998 y 53569 (cotizó 2 cuando pidió 4).

**Por qué pasó:** son las reglas fijas que extraen medida y cantidad (gpt-5.4-mini y el código), no el
vendedor Claude. La familia ya estaba en el catálogo de errores; volvió con casos nuevos.

**Qué riesgo tiene:** cotización equivocada o «no hay» cuando sí hay.

### 🟡 5 · Texto roto o repetido por cómo se arma el mensaje (de antes, disparado por Claude)

> Bot (26-nov 09:33, conv 53104): «…su cotización de las KENDA KR605 235/60R18 **(, total $565.20)**.»

- **«(, total»** (46195, 53104, 53322): el Guardián Haiku escribe «(COT-…, total $…)» y un candado posterior
  borra el número de cotización. Ese candado limpia «( )» pero no «(, ». Con gpt-5.5 no pasaba porque no
  escribía el número ahí. **Causa comprobada** (chat + Guardián + código).
- **Aviso «medidas distintas» dos veces** en el mismo mensaje (52632, 53842, 52673, 54385): el Guardián lo
  reescribe y el candado repone el original. 32 avisos con Claude contra 23 antes.
- **Fragmentos sueltos y «---» a la vista** (46195, 54116, 54247, 53569, 54263 «Carlos.»): el corte de
  mensajes en partes falla cuando el Guardián agrega un bloque.

**Qué riesgo tiene:** cosmético, pero se ve poco profesional.

### Casi-errores contenidos (no le llegaron al cliente)

El vendedor Claude **inventa datos de producto** con facilidad: «6 lonas», «4,7 de 5 en más de 700
reseñas», «seguro de 18 meses», listas de marcas (49940, 54518, 54189, 14822). En todos los casos que
vieron los lectores **el Guardián lo frenó**. Es la parte en que Haiku sí funciona bien. Los lectores
encontraron casi-errores en 128 de los 293 chats.

## Los 16 turnos que contestó gpt-5.5

**No son fallas de Claude.** Cuando un turno usa las 3 rondas de herramientas, el último paso («rescate»)
lo escribe el modelo de escalada, que sigue siendo **gpt-5.5** (`OPENAI_ESCALATION_MODEL`). Los 16 tienen 4
rondas. Anthropic no devolvió ningún error en toda la ventana. Dos consecuencias:

- Esos 12 rescates costaron **$1,51 (9 % del total)**: 12,6 ¢ cada uno, porque la factura cobra todas las
  rondas del turno (las de Claude incluidas) a precio de gpt-5.5.
- Varios de esos turnos salieron mal (19143 cotizó 245/70R16 en vez de 265/65R17; 38794 no atendió la
  objeción de precio), pero son pocos para culpar al modelo.

## Lo que no puedo asegurar

- **Ventas:** con Claude se facturaron **2 ventas del bot** ($1.457: 43941 el 25-nov y 48631 el 27-nov) y en la
  ventana anterior 3 ($1.718). Son muy pocas y la venta llega días después del chat, así que de los chats
  nuevos con Claude todavía no compró nadie (0 de 147, dentro del ruido: el límite de abajo es 0 %). **No se
  puede juzgar la venta todavía.**
- **Silencios:** 14 mensajes del cliente no tienen respuesta registrada. 7 son reacciones 👍 o mensajes que
  WhatsApp no le entrega al sistema (el bot no contesta eso a propósito), 3 estaban con un asesor (no hay
  respuesta registrada, que no es lo mismo que nadie le respondió), 1 era un «A ok amigo». Quedan **52940**
  (el del despliegue) y **53003** (audio con preguntas, sin respuesta).
- **El costo real es mayor que el medido:** no cuentan los audios transcritos, la búsqueda web de calce ni los
  seguimientos con IA (que hoy no corren, ver familia 3).
- Las cifras de «propio de Claude» son juicio de los lectores sobre la telemetría, no una medición.

## Qué conviene hacer primero

1. **Arreglar el Guardián Haiku** (familia 1): darle la fecha y el día de hoy en el contexto, prohibirle
   agregar fechas, links, locales o totales que el borrador no traía (que solo pueda quitar o reemplazar
   con datos que estén en sus «hechos») y que un hallazgo «alta» obligue a corregir. Medirlo después con el
   simulador contra los chats 34218, 53333, 54189, 53569, 54131, 52957 y 52677. Si no mejora, probar el
   Guardián de turno con Sonnet (hoy cuesta $0,75 por ventana; con Sonnet costaría unos $14, lo mismo que
   costaba con gpt-5.5, y se perdería casi todo el ahorro).
2. **No desplegar `main` en horario de Depot** y revisar que un mensaje que llega durante el arranque se
   procese al volver (familia 2, chat 52940). Ya está en `CLAUDE.md`; el 25-nov no se cumplió.
3. **Arreglar la redacción de seguimientos** (quitar la temperatura que gpt-5.5 rechaza o pasarla a
   Claude) y que el seguimiento lea el último mensaje del cliente antes de salir (familia 3).

## Estado de los últimos arreglos

| Arreglo | Resultado |
|---|---|
| Vendedor Sonnet 5.5 + Guardián Haiku 5.5 (24-nov) | Funcionó en costo y estabilidad; el Guardián volvió a fallar de otra forma (familia 1) |
| Respaldo gpt-5.5 si Claude falla | No se ejercitó: Claude no falló ni una vez |
| Mensajes entrantes nunca se pierden (PR #119, 25-nov) | Funciona para guardarlos; el 52940 se guardó pero no se procesó |
| Promociones del panel explicadas por el bot (PR #126) | No vi errores de promociones en Depot |
| Arreglos de Competimotor (26 y 27-nov) | No aplican a Depot (van detrás de la política de mundillantas) |

## Dónde se pierde la gente (embudo)

Chats que empezaron en cada ventana (de igual duración, 63,5 horas):

| Paso | Con Claude (24→27 nov) | Antes (22→24 nov) |
|---|---|---|
| Escribieron | 175 | 194 |
| Dieron su medida | 168 (96 %) | 168 (87 %) |
| Recibieron opciones | 163 (93 %) — pasa el 97 % | 161 (83 %) — pasa el 96 % |
| **Recibieron cotización** | **73 (42 %) — pasa el 45 %** | **69 (36 %) — pasa el 43 %** |
| **Acordaron un día** | **11 (6 %) — pasa el 15 %** | **18 (9 %) — pasa el 26 %** |
| Compraron (factura) | 0 todavía | 2 |

**Donde más gente se pierde es entre las opciones y la cotización** (90 de 163 se quedan ahí). Leí lo que
anotaron los lectores de los chats que murieron en ese paso: la mitad **se calla después de ver las
opciones** (no se sabe si por precio), uno de cada cinco **pidió algo que no hay** (otra marca, A/T cuando
solo hay M/T, una sola opción), unos cuantos **se fueron por precio**, y en 8 chats **el bot falló**
(52940, 52948, 53656, 52677, 53221, 53908, 54189, 53662). El segundo hueco es **de cotización a día**:
bajó de 26 % a 15 %, pero con 11 contra 18 chats está dentro del ruido. Vigilarlo: si el 28 y 30 siguen
abajo, la familia 3 (seguimientos que insisten mal) es la sospechosa.

No separé días con y sin anuncios: no tengo el calendario de pauta en la base.

## Cuánto costó

**Claude cuesta menos de la mitad por conversación y el costo es razonable para lo que vende.**

| | Con Claude (63,5 h) | Antes (63,5 h) |
|---|---|---|
| Gasto en IA (con IVA) | **$18,71** | $36,64 |
| Conversaciones con gasto | 281 | 225 |
| Por conversación (sin IVA) | **5,8 ¢** (mediana 3,8 ¢) | 14,2 ¢ (mediana 10,3 ¢) |
| Por mensaje del cliente | 1,6 ¢ | 3,0 ¢ |
| Por cotización | **$0,18** | $0,37 |
| Por venta del bot (IA + mantenimiento) | $13,42 (2 ventas) | $14,92 (3 ventas) |
| Como % de lo vendido por el bot | 1,8 % | 2,6 % |

Tarifas: las de `billing.ts` del commit vivo (Sonnet 5.5: $2 entrada / $0,10 la parte repetida / $2,50 al
guardarla / $10 salida; Haiku 5.5: $0,10 / $0,01 / $0,125 / $0,50), verificadas contra la lista de precios de
Anthropic. El panel de facturación cobra lo mismo (mes de noviembre: $281,42 con IVA hasta hoy).

- **Dónde se va:** el vendedor Sonnet en turnos con herramienta exacta (**44 %**), el vendedor Sonnet en turnos
  comerciales (**22 %**) y los 12 rescates con gpt-5.5 (**9 %**). El Guardián, que antes era el 57 %, ahora es
  el 7 %.
- **Por qué Sonnet cuesta lo mismo por llamada que gpt-5.5 (3,0 ¢ contra 3,2 ¢):** cada llamada lee casi el
  doble de entrada (11.600 contra 6.300 por ronda) y escribe el triple de salida (330 contra 96). La parte
  que se cobra más barata porque se repite es igual (55 %), pero un 44 % de la entrada se **guarda de nuevo
  en cada turno**, que en Claude se paga con recargo.
- **Concentración:** el 10 % de chats más caros se lleva el 38 % del gasto. El más caro (53569, $0,69) fue
  gasto con vueltas: el Guardián rompió tres respuestas buenas y el cliente tuvo que volver a preguntar.
- **Plata que no compró nada (estimación):** los 12 rescates con gpt-5.5 ($1,51); unos 225 seguimientos
  reescritos por el Guardián que con la redacción arreglada no harían falta (225 × 0,1 ¢ ≈ $0,23); y los
  turnos extra de las familias 1 y 2 (≈ 60 turnos × 3 ¢ ≈ $1,80). Total ≈ **$3,50 de $16,27** (sin IVA).
  Es una cuenta aproximada, no un ahorro garantizado.
- **Lo que no está contado:** audios transcritos, búsqueda web de calce y visión desde vista previa de links
  (no quedan en la base); la redacción de seguimientos con IA no gastó porque falla antes de llamar.
- **Dónde ahorrar** (hasta tres, de mayor a menor):
  1. **Escalada con Sonnet en vez de gpt-5.5:** unos 12 rescates × (12,6 ¢ − ~4 ¢) ≈ **$1 por ventana (~6 %)**.
  2. **No volver a guardar lo que nadie relee:** marcar la cola de la conversación solo en las rondas
     intermedias. Techo ≈ $1,90 por ventana; lo probable, la mitad.
  3. **El Guardián de turno con Sonnet** costaría ≈ $13 más por ventana: solo si el punto 1 de «Qué
     conviene hacer primero» no alcanza. La calidad va antes que este ahorro.

## Control de calidad

- [x] Commit y hora de inicio: 019a7d5 vivo; la ventana empieza en el cambio de modelo (25-nov 01:41:30
  UTC), no en un commit; incluye 5 despliegues de panel/Competimotor.
- [x] Las 293 conversaciones de la ventana leídas completas (12 lotes de 23–25).
- [x] Cada familia tiene cita del cliente y del bot, y lo citado salió de verdad (líneas BOT).
- [x] Casi-errores separados.
- [x] Causas altas: familia 1 (chat + Guardián + código: el contexto no trae la fecha de hoy), «(, total»
  (chat + Guardián + código). Familia 2, caso 52940: **hipótesis fuerte**, sin código del arranque.
- [x] Familia y caso sano: Claude entendió «A/T 4w» en 52957 y el Guardián lo rompió; en 53888 el Guardián
  contestó bien el «Carísimas».
- [x] Silencios con asesor: «no hay respuesta registrada».
- [x] Delta al cierre: 1 mensaje del bot después de las 12:10, sin cambios.
- [x] Tarifas de `billing.ts` del commit vivo, verificadas.
- [~] El total cuadra con el panel solo por mes calendario; la ventana corta a mitad de día.
- [x] Costos por conversación y por mensaje, no por total de ola.
- [x] El gasto evitable dice que es estimación y muestra la cuenta.
- [x] Puntos ciegos nombrados (sin cantidad: no quedan en la base).
- [x] No modifiqué producción ni publiqué nada.

## Apéndice técnico

**Ventana:** `2026-11-25T01:41:30Z` → `2026-11-27T17:10:45Z`. Anterior: `2026-11-22T10:12:15Z` →
`2026-11-25T01:41:30Z`. Todo con `default_transaction_read_only`.

**F1 · Guardián sin fecha de hoy.** `app/src/services/guardian.ts` → `armarContexto` (línea ~592) solo pone
la fecha de la visita (`hechos.visit_date`, línea ~919) y si es hoy o ya pasó; nunca «hoy es jueves 26 de
noviembre». El vendedor tampoco la recibe (`agent.ts`, solo «Día de visita YA REGISTRADO», línea ~1383).
Consulta del «aprueba con hallazgo»: `guardian_reviews` con `verdict='aprobar'` y
`jsonb_array_length(findings)>0` → 402/1.183 con Haiku contra 15/1.054 antes. Corrige seguimientos: ruta
`guardian_seguimiento+canary` 225/458 contra 63/260.

**F2 · Despliegue en horario.** Merges a `main` el 25-nov 10:09, 10:32, 10:44, 11:16 y 11:18 (−05). Conv 52940:
mensaje 15:32:49 UTC, sin `ai_runs` después; alerta `advisor_follow_up` 24 h más tarde.

**F3 · Redacción de seguimientos.** `app/src/services/followUpCopy.ts:85-86` llama a `config.openai.model`
(gpt-5.5) con `temperature: 0.65`; Railway registra «400 Unsupported value: 'temperature' does not support
0.65 with this model» y cae al copy determinístico.

**F5 · «(, total».** `app/src/domain/numerosDeCotizacion.ts` → `sinNumerosDeCotizacion`: quita
`COT-XXXX` con su espacio y limpia `\(\s*\)`, pero no `\(\s*,`. Corre en `services/prepararSalida.ts`
después del Guardián. Disparado por correcciones de Haiku que escriben «(COT-…, total $…)» (53104 26-nov
14:33 UTC, 53322, 46195).

**Escalada.** `agent.ts:1061` (`modeloUsado = config.openai.escalationModel`) y `modeloDelTurno`
(línea ~119): con `AI_MAX_TOOL_ITERATIONS=3` el rescate va a `OPENAI_ESCALATION_MODEL=gpt-5.5`. `logAiRun`
suma las rondas de Claude en la fila del rescate y `billing.ts` cobra todo a tarifa de gpt-5.5.

**Costo.** Por ruta (Claude): `exact_tool_reply` Sonnet 239 llamadas $7,23 (entrada media 23.113, 55 %
leída del caché, 44 % escrita, salida 332); `commercial` Sonnet 127 llamadas $3,60; `tool_chain_finalized`
gpt-5.5 12 llamadas $1,51; Guardián Haiku 722 + 461 llamadas $1,20.

**Scripts** (solo lectura, en la sesión): resumen por ruta y modelo, costo con escritura de caché, embudo por
día con límites p-chart de la fase I, cruce con `/api/hub/metrics` (GET) para las ventas. El gráfico se
regenera con `node app/scripts/canary/claude-antes-despues.mjs --cambio 2026-11-25T01:41:30Z`.
