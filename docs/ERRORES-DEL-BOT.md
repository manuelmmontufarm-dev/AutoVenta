# Catálogo de errores reales del bot — y cómo se arreglaron

> **Qué es esto:** todos los errores de COMPORTAMIENTO del bot (lo que respondió
> mal, prometió mal o dejó de hacer) que hubo que arreglar desde que Depot Tire
> salió en vivo (1-ago-2026). Cada uno pasó de verdad, casi todos con el chat
> real citado. No incluye trabajo del hub/panel ni features — solo fallas.
>
> **Fuente:** BITACORA.md (el registro commit a commit). Este archivo es el
> resumen por familia; el detalle completo de cada arreglo está allá, buscando
> por fecha.
>
> **Última actualización:** 29-ago-2026 (deploy `2aed229`).

**La lección transversal de todo el catálogo:** un prompt es una petición, no
una garantía. Todo lo que tiene que ser cierto SÍ O SÍ terminó en un candado
determinístico (código que corre después del modelo), y el Ángel Guardián quedó
para lo que exige entender la conversación. Los errores que se arreglaron "solo
con prompt" fueron los que volvieron.

---

## 1 · Cantidades — un número que cuenta otra cosa

La familia más repetida del proyecto: el bot guardaba como "cantidad de
llantas" números que contaban otra cosa.

| Fecha | El error real | Arreglo |
|---|---|---|
| 27-ago | «quiero 265/65R17» → guardó **265 llantas** (llegó al prompt, al guardián y al chat: «cotización con 265 llantas») | `enmascararMedidas` tapa la medida antes de buscar cantidad |
| 27-ago | «Para arrizo 5» → cotizó **5 llantas** por $456.40 (conv 11366); el 5 es el modelo del carro | El número seguido de sustantivo-que-no-es-llanta se ignora |
| 27-ago | «Las 3 de ir marcas manejan ustedes» → guardó 3 (conv 11005) | Misma regla |
| 27-ago | «paso pasado las 5» → guardó 5 llantas; era la hora | Las horas se tapan ANTES de buscar cantidad |
| 26-ago | El «2» del menú de preferencia (2 = Equilibrio) → 2 unidades | `esRespuestaDelMenuDePreferencia` + candado en `generar_cotizacion` → juego de 4 |
| 27-ago | «Quiero 20 llantas» → muro: tope de 8 escondido en el esquema y en `extractExplicitQuantity` que nadie le contó al modelo («deme 8» funcionaba al instante) | Tope quitado (max 500), cantidad grande se confirma y se cotiza |
| 27-ago | «deme solo 3» tras cotizar 4 → «le ajusto al toque», «dale» → solo anotó y siguió con el local; **nunca salió la pieza de 3** y al pedirla le reenviaron la de 4 | `services/recotizar.ts`: ruta determinística que SÍ genera la pieza nueva |
| 6-ago | Rodrigo: **4 confirmaciones** para 5 llantas; J.F.R.C. escribió «4» dos veces y recibió la misma pieza por tercera vez | «Si no es un NO es un SÍ»: la cotización solo se frena por negativa explícita |

Estado hoy: la cantidad la declara el agente por herramienta (27-ago) y las
regex quedaron de respaldo. El lote de 50 del 29-ago pasó todos los casos de
cantidad, incluidas las trampas Arrizo 5 / «las 3» / «las 5».

## 2 · Medidas — la venta que se pierde o se firma mal

| Fecha | El error real | Arreglo |
|---|---|---|
| 13-ago | **El bot firmó otra medida** (chat 5499): pidió 265/70R16, le presentaron 3 medidas ajenas rotuladas como suyas, cotizó 225/70R16 en $499.04 y le confirmó «sí es su medida». Auditando: **12 cotizaciones firmadas en medidas nunca pedidas, $7.243 en juego** | Candado en `generar_cotizacion`: no se firma medida que el cliente no pidió (`domain/medidaPedida.ts`) |
| 13-ago | El parser no entendía «265/70/16» (la forma más común en Ecuador), ni «rin»/«aro» como separador | Parser ampliado — obligatorio ANTES del candado, o bloqueaba cotizaciones legítimas |
| 5-ago | «30x9.5r15» → «no hay», y sí había: el parser no reconocía NINGUNA medida de flotación (camioneta/4x4) | Parser de flotación |
| 14-ago | **6 familias de SKUs invisibles** a toda búsqueda (`30*9.50R15` con asterisco, `33X1250R20` sin punto, camión `7.00R15`) | Parser: separador `[xX*×]`, ancho sin punto; 0 de 385 SKUs sin medida |
| 14-ago | «at4» no encontraba la A/T4W teniéndola en stock — el bot **juró dos veces que no existía** la llanta estrella | Tokens en forma compacta + palabras de conversación («tienen», «busco») fuera del query |
| 14-ago | Consulta con medida devolvía llantas de 3 medidas distintas | La medida se DECODIFICA primero y filtra duro; el texto restante solo elige modelo |
| 26-ago | **Conv 4732 (Andrés Tamayo):** se firmó una 265/65R17 a alguien que compraba 235/70R15 — el candado aceptaba medidas pedidas en OTRA visita porque la conversación llevaba 13 días abierta | La visita corta a las 12 h de silencio; `medidasDelPedido.ts` es la única fuente de «qué se puede cotizar» |
| 14→16-ago | Equivalentes mostradas sin decir que no son la medida exacta | Sello en cada tarjeta («LE MONTA · no es su medida exacta»), primero rojo, después ámbar (el rojo se leía como «todo está mal») |
| 27-ago | Buscando por ARO la pieza prometía «TODO EN TU MEDIDA» con la medida de la primera llanta | Cabecera «OPCIONES EN SU ARO», cada tarjeta con SU medida |

## 3 · Preguntas de más, repetidas o duplicadas

El patrón que más molestó a Joaquín («no te parece que hace mucha pregunta?»).

| Fecha | El error real | Arreglo |
|---|---|---|
| 5-ago | El bot **pedía fotos que no podía leer** (18 pedidos en un día) — callejón sin salida | Primero se prohibió; el 6-ago se le dio visión de verdad y la foto entra como texto |
| 5-ago | «CONFIRMA versión/etiqueta antes de cotizar» mató la venta del Orlando, que ya había dado medida Y carro | VENTA PRIMERO en las 3 capas: con medida se cotiza de una |
| 19-ago | **Caso Eulalia** (conv 7832): 3 confirmaciones y 1 h 48 min para una cotización lista desde el primer sí — el campo `nombre_cliente` era OBLIGATORIO en el esquema, así que el modelo preguntaba «¿a nombre de quién?» para poder llenarlo | Campo opcional (usa el perfil de WhatsApp); «uyedeme porfa» y «list» cuentan como sí |
| 20-ago | **~30 casos de re-preguntar lo ya dado** en el informe del guardián | Cada hecho confirmado lleva su prohibición pegada en el prompt |
| 15-ago | El local ya elegido se re-preguntaba «¿Cumbayá o Quito Sur?» — era texto FIJO del código, no el modelo (convs 6275, 6375) | Con local elegido se pregunta solo el día |
| 12-ago | **Dos preguntas de ubicación en el mismo turno** (la del pie de la cotización + la del plan de visita) | Se quitó el pie |
| 18-ago | El cliente confirmó «viernes en Quito Sur» y el SEGUIMIENTO le volvió a preguntar el día — copy fijo que no miraba `visit_date` | El seguimiento mira la fecha; con visita futura no sale |
| 27-ago | «Dígame *qué día* sí le queda» (imperativo, sin «?») → el candado no lo reconoció como pregunta y la pegó otra vez: el cliente la vio dos veces | `preguntaElDia` acepta el imperativo |
| 29-ago | «¿Cumbayá o Quito Sur?» (sin la palabra «local») → mismo patrón: el candado duplicó la pregunta (lote, casos 35–37 y 44) | `preguntaElLocal` acepta los dos nombres dentro de una pregunta |
| 27-ago | Tras cotizar y pedir OTRA medida, remataba «¿a cuál local le queda mejor ir?» fuera de fase | Prompt por fases no lineales (29-ago): la necesidad del turno manda |

## 4 · Precios y dinero

| Fecha | El error real | Arreglo |
|---|---|---|
| 7-ago | RT01 315/70R17: bot **$502.16**, Interbot **$489.14** — el precio se reconstruía con una fórmula (margen 33 %) que solo cubría 96/362 productos | El precio se LEE del Interbot, no se calcula |
| 11-ago | El sync de precios llevaba **4 días muerto por media cookie** (faltaba `interbot.sid.sig`) — bomba de tiempo: no se notó porque los precios no cambiaron | `getSetCookie()` completo + el último sync bueno sobrevive al redeploy |
| 16-ago | **Doble IVA:** llantas anunciadas a $480 se firmaban en $552 (`product.taxRate=0` en una ruta y `buildQuote` sumaba 15 % encima) | El IVA se quita con la misma tasa con que se pone |
| 16-ago | El chat y la pieza mostraban DOS precios distintos de la misma cotización | Los dos caminos reciben los mismos números firmados |
| 15-ago | El texto decía «$811,48» (coma) y la pieza «$811.48» — el guardián lo corrigió 4 veces como error de precio | Un solo formato en todo el stack + corrector determinístico de céntimos |
| 16-ago | El descuento autorizado de un ciclo se reinyectaba fijo en otra cotización: descuento desproporcionado o turno tumbado | Se recalcula contra la cotización nueva; si no cabe, sale sin él |
| 20-ago | Pedían precio y el turno no lo decía (23 casos) | El cierre de opciones entrega la recomendación CON su precio |

## 5 · Fechas y visitas

| Fecha | El error real | Arreglo |
|---|---|---|
| 26-ago | **El «juebes»:** la falta de ortografía costó una visita — no se entendía el día | Días por fonética (`diasEnEspanol.ts`) |
| 27-ago | «Santo Domingo» (la ciudad) se leía como el día domingo | Contexto: ciudad ≠ día |
| 27-ago | **El bot dijo «Listo, 30 en Quito Sur, ya avisé al asesor» y en la base quedó todo en null** — «el 30» no se parseaba, y la alerta al vendedor salió igual | `diaDelMesSuelto`; y sin `visit_date` no hay aviso |
| 9-ago | «Martes 10 am» registrado… y el bot volvía a preguntar el día | La ruta de visita mira lo ya guardado |
| 27-ago | «mañana le confirmo» agendaba visita para mañana (era «mañana le aviso») | Detectado en auditoría; corregido en la familia de compromiso |
| 8-ago | Una fecha registrada que **nadie miraba**: no vendía nada | Aviso al asesor al darla + recordatorio la víspera |
| 29-ago | «La próxima semana voy a estar fuera» — `main` igual insistía con el local dos veces | La rama de fases difiere suave (verificado en el lote) |

## 6 · Cierres que se caían o ventas que no salían

| Fecha | El error real | Arreglo |
|---|---|---|
| 7-ago | Creta rin 19: «No tengo una medida verificada. ¿Me escribe la medida?» — **con el aro en la mano no ofreció nada** (cazado a los 40 min de encender) | El aro le gana al vehículo; prohibido cerrar un turno con limitación + pregunta sin ofrecer |
| 8-ago | Ticket 2150: el cliente pidió cotización TRES veces y el bot solo repetía «mándeme la foto» — la etapa `seguimiento_venta` **no tenía herramientas de venta** (Manuel mandó las opciones a mano) | Las etapas de cierre recuperan las herramientas; hoy, fases con 5–7 tools según la necesidad |
| 27-ago | El menú ofreció «2) Equilibrio» cuando la pieza traía DOS llantas y ese escalón no existía → «no quedó disponible» | El menú se arma con los escalones que la pieza SÍ trae |
| 27-ago | «dale con las kenda deme 20» → cero cotización, y el bot **inventó** que «no me dejó generar la imagen» (la herramienta ni corrió) | Mismo tope de 8 escondido en `hasExplicitQuantity`; quitado |
| 27-ago | Cerrar como perdida **borraba la ficha entera** y el clasificador cerraba sin evidencia de rechazo | `cierrePerdido.ts`: sin rechazo en el texto del cliente no se cierra (el borrado en sí sigue pendiente) |
| 27-ago | «Gracias, ya compré en otro lado» se leía como **compra nuestra**; y al que se despidió se le seguía insistiendo con día y descuento | `isExplicitPurchaseConfirmation` corregido + regla 18 del guardián: al despedido, despedida corta y ninguna pregunta |
| 25-ago | El cierre prometía «la opción exacta para su medida» contradiciendo el aviso de equivalentes del mismo turno | Coherencia entre pieza y cierre |
| 27-ago | Con cotización viva, un turno podía cerrarse **sin pedir lo que falta** (local → día) | `insistirCierre`: ningún turno sin la pregunta pendiente |

## 7 · Inventos y promesas sin respaldo

| Fecha | El error real | Arreglo |
|---|---|---|
| 20-ago | Inventaba ficha: lonas, origen, garantía, financiamiento (10 casos) | Regla: sin respaldo ni se afirma ni se niega — «se lo confirma el asesor» y se sigue con el precio |
| 20-ago | Prometía «su número de cotización» cuando NO había cotización | El texto solo promete lo que existe |
| 26-ago | El aviso de stock corto (cotizó 4 habiendo 3) **no viajaba con la cotización** | Regla 10 del guardián + candado determinístico en la salida |
| 25-ago | La vitrina mostraba llantas agotadas en su medida, y el bot ofrecía un local que no existe | Agotada = como si no hubiera; solo locales reales |
| 26-ago | El GUARDIÁN armaba ofertas nuevas con el catálogo — **vendía por su cuenta** | El guardián revisa, no vende (27-ago) |

## 8 · El Ángel Guardián — cuando el corrector era el problema

| Fecha | El error real | Arreglo |
|---|---|---|
| 26-ago | Leía mensajes de **ciclos cerrados** y "corrigió" con un «mañana por Quito Sur» rancio de otra visita | `armarContexto` filtra por ciclo |
| 27-ago | **Tres veces en dos días** reescribió justo lo prohibido: repuso los `COT-` que había que quitar, borró la cifra del descuento, y su corrección terminó con la misma pregunta prohibida | Lección de arquitectura: lo obligatorio va en candado DESPUÉS del guardián; su rúbrica es para juicio, no para listas cerradas |
| 27-ago | Fallaba abierto **en silencio**: sin fila ni alerta | Sigue fallando abierto, pero nunca más sin registro |
| 14-ago | No veía qué hicieron las herramientas: ante «no aparece en catálogo» solo podía suavizar el texto | `toolTrace` en su contexto + regla 9: nunca negar en seco un modelo de la casa |

## 9 · Tono, formato y texto que no debía salir

| Fecha | El error real | Arreglo |
|---|---|---|
| 5-ago | **12 «tuve un problema procesando» en un día** (Ricardo Nitro recibió TRES seguidos, dos calcados), 5 mensajes duplicados, re-saludos a mitad de hilo | Guardián de salida determinístico + llamada de RESCATE al agotar rondas (prohibido disculparse) |
| 8-ago | El primer mensaje a veces arrancaba con el interrogatorio, sin saludar | El saludo es determinístico en `sendCustomerText` (y no saluda «¡Hola, angelbarreiro1986!») |
| 25-ago | «ya que me entreguen **les molesto** para visitarlos» disparó `CLIENTE MOLESTO` y **apagó el bot para siempre en ese hilo** — era cortesía ecuatoriana | Distinción gramatical: verbo cortés vs adjetivo de estado |
| 27-ago | JSON crudo al cliente (`{"motivo": …}`) por la escalera | Tapado; el lote del 29-ago lo vigila en cada corrida |
| 27-ago | El SKU crudo salía en seguimientos («la opción 35405026») | **PENDIENTE conocido** (`followUpMessages.ts`) |
| 18-ago | Los seguimientos tuteaban mientras el bot habla de usted | Corregido en la tanda del 27-ago |
| 6-ago | Cadena de 4 mensajes seguidos tras la pieza («los mijines ya no leen» — Joaquín) | Imagen + INCLUYE + una pregunta; la recomendación se ofrece, no se recita |
| 27-ago | La pregunta final pegada al párrafo se leía como relato, no como pregunta | Cada pregunta en su propio mensaje |

## 10 · Parecían errores del bot y eran del sistema

| Fecha | El error real | Arreglo |
|---|---|---|
| 8-ago | **«Sale como si responde pero en vida real no»:** chats tomados por un humano cuya pausa venció — el bot pensaba el turno completo (tokens pagados), el envío se bloqueaba, y el panel pintaba doble check falso | Se pregunta la política ANTES de pensar; el chat vuelve al bot al vencer el plazo; el panel dice la verdad del envío |
| 9-ago | GPT-5.5 rechazaba tools+reasoning `low` con HTTP 400: **los turnos morían al llegar a OpenAI** con el health en verde | Matriz de parámetros aceptados, con prueba de regresión |
| 23-ago | Un ECONNRESET de Postgres **mató el proceso** — Depot caído días sin que se note | `unhandledRejection` capturado en los dos entrypoints |
| 8-ago | Joaquín llevaba **62 avisos sin recibir** y la tabla decía «enviado» — Meta responde 200 aunque la ventana esté cerrada | Se espera el veredicto real del webhook de estados |
| 27-ago | **151 clientes callados para siempre**: handoff a humano sin reloj de rescate (conv 10201: 26 mensajes sin responder en 3 días, con cotización y visita) | Parcial: el rescate por plazo existe; el chat `assigned_to=human` sin reloj sigue **PENDIENTE** |
| 6-ago | El bot pasó APAGADO desde las 13:16 y nadie lo supo (188 mensajes sin respuesta) | Watchdog: bot apagado + clientes esperando → alerta al asesor cada hora |

---

## Pendientes conocidos — TODOS CERRADOS el 29-ago-2026

1. ~~Cerrar como perdida borraba la ficha~~ → la reapertura por mensaje del cliente ya conservaba la ficha dentro de las 12 h (27-ago); el 29-ago la reapertura **manual desde el panel** pasó a usar la misma regla.
2. ~~Chat `assigned_to=human` sin reloj~~ → **el reloj de las 12 horas** (`rescatarChatsOlvidados`, barrido cada 15 min en el worker): un mensaje de cliente con 12 h sin respuesta del asesor devuelve el chat al bot, el bot contesta y el asesor recibe la alerta `rescate_chat_olvidado`. Excluidos: opt-out, cliente molesto y fuera de la ventana de 24 h.
3. ~~SKU crudo en seguimientos~~ → el texto solo imprime la etiqueta legible («KENDA KR20», vía catálogo); el código queda como señal interna.
4. ~~«¿Cuántas necesita de cada medida?» se escapaba~~ → regla nueva en el candado: «cuántas» + verbo de cantidad, sin exigir el sustantivo («¿cuántos km dura?» sobrevive).
5. ~~Aviso de stock duplicado en dos sitios~~ → una sola fuente: `asegurarAvisoDeStock` en `prepararSalida`, después del Ángel Guardián; la copia de `outboundGuard` (que corría ANTES de quien reescribe) se eliminó.

## Cómo se detectan hoy (las redes que quedaron)

- **Candados determinísticos** después del guardián (medida, cantidad, precios, preguntas prohibidas, cierre).
- **Ángel Guardián** con los hechos duros y el `toolTrace` del turno.
- **Simulador** (`npm run sim`) + lote real de 50 conversaciones (`scripts/sim/lote-50.mjs`).
- **Auditoría de chats reales** (`/auditar-desde-ultimo-cambio`) tras cada deploy.
- **Suite** de 1308 pruebas, muchas con los textos reales de producción como fixtures.
