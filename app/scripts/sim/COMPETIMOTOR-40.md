# Competimotor · 40 conversaciones de prueba

Cuarenta conversaciones para probar el bot de Competimotor (perfil `mundillantas`,
identidad `competimotor`) antes del arranque, escritas el 18-nov-2026 contra el PR #59
(`6c22842`). Cada una sale de una conversación o un error que ya le costó al bot con
Depot, llevado a lo que en Competimotor es distinto. Los datos y los jueces están en
[`datos/competimotor-40.mjs`](datos/competimotor-40.mjs).

> **Ojo:** `datos/` está en `.gitignore` entero (`datos/.gitignore`: `*`). El archivo
> existe en disco pero git no lo ve: para versionarlo hay que agregarlo con `git add -f`
> o moverlo fuera de `datos/`.

## Cómo se corren

- **Corredor:** `node scripts/sim/competimotor-flota.mjs` (lee este archivo por defecto;
  `--solo-cargar` lo valida sin levantar nada: las 40 se leen bien).
- **Catálogo:** el Excel real de Fénix del 6-nov, 482 llantas. La flota usa
  `datos/competimotor-inventario.xls`, que es el mismo archivo que
  `~/Downloads/INVENTARIO_06NOV_fenix.xls` (mismo md5). Con catálogo por archivo `/api/stock` no fuerza stock, así que los casos de
  stock justo (CM03, CM04, CM35) dependen de ese archivo. Cada medida usada está comprobada
  contra él (extracto en `CATALOGO` dentro del `.mjs`).
- **`etapa` (25):** el corredor manda el `prefijo` una vez con el bot real, comprueba
  `estadoEsperadoPrefijo` y guarda ese estado; las 3 repeticiones arrancan desde ahí
  con `mensajes`.
- **`completa` (10):** desde el hola, 3 veces.
- **`tiempo` (5):** con la espera real de producción (12 s, sin `--debounce`). En
  `turnosDeclarados`, `esperaMs[i]` es la pausa antes de mandar `rafaga[i + 1]` sin esperar
  al bot; en `mensajes` queda como `pausaEntreMs` (pausas iguales) o como turnos con
  `pausaAntesMs` (pausas distintas, CM36), que la flota agrupa en uno.
- **Extras:** CM34 llega desde un anuncio de Meta: la parte lleva `anuncio` y la flota la
  pasa tal cual a `/api/enviar`.
- **Juicio:** `checks` tiene la forma de los del T115, `[nombre, (turnos, estadoFinal) => motivo | null]`.
  Todo es un hecho de la base (`conversations`, `quotes`, `bot_alerts`) o de `ai_runs.tools`.
  La única mirada al texto es `noDiceCifras`: busca una cifra exacta del catálogo que no
  puede salir (precio D, el precio del anuncio viejo). Lo que solo se ve en palabras va en
  `rubrica`, para un juez.
- **Lo que vale en las 40** además de los invariantes del corredor: cada línea cotizada al
  precio A del Excel (ni C, ni D, ni promo, y el total cuadra), nada con existencia 0 y
  nada por encima de la existencia total.
- **Avisos al asesor:** `advisor_notifications` también guarda «nueva cotización» y los
  avisos del candado, y la foto de la flota no lee su `type`. Por eso las derivaciones se
  cuentan con la herramienta `notificar_vendedor` en `ai_runs.tools`, no con el total de
  avisos.
- **Campos del estado:** CM20 usa `visit_time_label` y CM33 `conversacion.bot_paused_reason`;
  los dos ya vienen en `Carril.estadoFinal()`.

## Las 40

| id | grupo | familia | de dónde sale | qué ataca |
|---|---|---|---|---|
| CM01 | etapa | cantidades | ERRORES §1 · «Para arrizo 5» cotizó 5 (conv 11366) y «265/65R17» guardó 265 · T115 M14 | «pal aveo 5 puertas» después de dar la medida. El número del modelo del carro (5 puertas) y los de la medida no son cantidad; en el Excel la 185/60R14 tiene 7 marcas. |
| CM02 | etapa | cantidades | ERRORES §1 · «paso pasado las 5» guardó 5 llantas · T115 V06 | «paso el sábado tipo 3» con cotización de 2. La hora (3) no cambia la cantidad cotizada; el sábado Competimotor abre 8–16, así que las 3 de la tarde sí vale. |
| CM03 | etapa | stock-justo | ERRORES §7 · el aviso de stock corto no viajaba con la cotización (cotizó 4 habiendo 3) · plan T115 G08 (conv 11720) | Pide 4 de 205/65R15 y en el Excel hay 3 (una sola marca). Con un solo stock total no hay «otro local» que complete: la Kenda KR203 205/65R15 tiene existencia 3 y es la única de esa medida. |
| CM04 | etapa | stock-justo | ERRORES §7 · promesas sin respaldo + respuesta de Jenny del 18-nov (stock = total de todos los locales) | Hay 2 de 175/65R14, pide 4 y que «traigan de otro local o bodega». En Depot el stock era por local; aquí la existencia ya es la suma de todos los locales, así que no hay de dónde traer más ni fecha de llegada. |
| CM05 | etapa | medida-fuera-del-excel | Histórica H02 · conv 8288 (una 165/80R13 sin stock, «Xfvr», emojis, bucle) · ERRORES §2 | Una 165/80R13 que no está en el Excel, insiste y manda emojis. La 165/80R13 no existe en el Excel de Fénix (ni agotada: no hay fila). El bot no puede firmar otra medida como si fuera esa. |
| CM06 | etapa | medidas | T115 M06 («7.00R15» → 7 como cantidad) · ERRORES §2 (SKUs de camión invisibles) | Camioncito con 7.00 R15 de 12 lonas, pide 6. En el Excel la medida está escrita «700R15» / «700/15» y el lector del bot no le saca etiqueta (Kenda KR12, existencia 18): o la encuentra o deriva, pero no inventa ni confunde 7 o 12 con cantidad. |
| CM07 | etapa | medidas | ERRORES §2 · «at4» no encontraba la A/T4W · §7 · la vitrina mostraba agotadas | Pide la Falken AT4W en 265/65R17, que está con existencia 0. La fila existe en el Excel pero con existencia 0; hay Kenda y Winrun A/T en la misma medida. |
| CM08 | etapa | cambio-a-mitad | T115 M07 / O09 · histórica H01 (conv 7946, tres cambios de medida) · ERRORES §2 (firmó otra medida, chat 5499) | Cotizó 225/65R17 y el cliente corrige a 235/65R17. Después de la corrección, la medida vieja no puede volver a firmarse; «esa misma marca» obliga a usar la marca de la cotización anterior en la medida nueva. |
| CM09 | etapa | cambio-a-mitad | ERRORES §1 · «deme solo 3» tras cotizar 4: nunca salió la pieza de 3 (services/recotizar.ts) | Cotizó 4 Maxxis 205/55R16 y pide «mejor solo 2». Al bajar de 4 a 2 se pierde la alineación (en Competimotor solo va con 4); el bot no puede seguir prometiéndola. |
| CM10 | etapa | alineacion | ERRORES §7 · inventos de beneficios · regla de Jenny del 8-nov (alineación solo con 4) | Compra 2 y pide la alineación «gratis». En Depot el INCLUYE era fijo; aquí depende de la cantidad: con 2 no hay alineación, con 2 sí mantenimiento cada 10.000 km. |
| CM11 | etapa | precio-mayorista | Solo Competimotor (lista D del Excel) · emparenta con T115 Q11 («¿me mejora el precio?»: inventar porcentaje) | Mecánico pide precio de distribuidor. El Excel trae el precio D (mayorista sin servicios); el bot lo tiene a mano y NUNCA puede darlo. |
| CM12 | etapa | precio-mayorista | Solo Competimotor (lista D) · T115 Q11 · ERRORES §4 (descuento desproporcionado reinyectado) | «El precio más bajito que me pueda dejar». «El más bajo» puede ser la llanta más barata (legítimo, a precio A) o la lista más baja (D, prohibida). |
| CM13 | etapa | precios | ERRORES §4 · el chat y la pieza con dos precios distintos · regla de Manuel del 18-nov (un mensaje con el precio por método) | Con cotización de 4 Maxxis 265/70R16 pregunta efectivo y tarjeta. B = A (tarjeta) y C = efectivo/transferencia; D nunca. La pieza firmada sigue en A. |
| CM14 | etapa | promo-inexistente | Familia «precio c/u con Black Friday» (auditoría 9-nov) · ERRORES §4 | «No tienen Black Friday?». El código trae Black Friday para Depot; la política de Competimotor no tiene promoción: ni 60 % en la segunda ni −25 %. |
| CM15 | etapa | promo-inexistente | Solo Competimotor (promo del 10 al 31-dic sin definir) · T115 C06/O14 («lo voy a pensar» / «el próximo mes» no es rechazo) | Pregunta por la promo de diciembre y si mejor espera. Jenny dijo que habrá promo del 10 al 31 pero no cuál, y el bot no la anuncia: no puede inventar el descuento ni agendar para diciembre. |
| CM16 | etapa | envios | T115 E06 / histórica H05 (conv 9887, Ibarra) · ERRORES §7 (inventar cobertura o costo) | Es de Quevedo: ¿envían? ¿quién paga y cuánto?. Competimotor SÍ envía (Laar Courier o Transportes Bemaut) pero quién paga y cuánto no se sabe. Además «Quevedo» es una ciudad y también la vía del local. |
| CM17 | etapa | identidad-de-marca | Solo Competimotor (una marca por servicio, cierre del 18-nov) · ERRORES §7 (local que no existe) | «Ustedes son los de Mundillantas?» y quiere retirar en Mundillantas Falken. El perfil conoce los locales de Mundillantas pero el servicio de Competimotor no puede presentarse como ellos ni mandar al cliente allá. |
| CM18 | etapa | parte-de-pago | Histórica H06 (conv 10002, pidió que le recibieran sus llantas) · T115 E05 — en Competimotor la respuesta cambia: SÍ reciben | Quiere dejar sus 4 usadas y los aros por $50 cada una. En Depot era «no prometer recompra»; aquí reciben llantas y aros usados como parte de pago, pero el valor lo pone el asesor. |
| CM19 | etapa | fuera-de-horario | T115 V05 / V09 (registrar visita sin elegir un día arbitrario) · horario por día (Depot abría distinto) | «Paso el domingo a ponerlas». Competimotor cierra el domingo; lunes a viernes 8–18 y sábado 8–16. |
| CM20 | etapa | fuera-de-horario | ERRORES §1 («las 5» como cantidad) · T115 V06 · horario por día | Sábado a las 5 y media, cuando ya cerraron. El sábado cierran a las 16:00; las «5» no son cantidad (cotizó 4). |
| CM21 | etapa | fechas-y-visitas | ERRORES §5 · el «juebes» costó una visita (diasEnEspanol.ts) | «El juebes paso». Igual que en Depot, pero con el horario y el único local de Competimotor. |
| CM22 | etapa | fechas-y-visitas | ERRORES §5 · «Santo Domingo» leído como el día domingo · «mañana le confirmo» agendaba visita | «Estoy en Santo Domingo centro, mañana le confirmo». En Depot «Santo Domingo» era rara; aquí es la ciudad del cliente y del local, la van a escribir todos. |
| CM23 | etapa | cierres | ERRORES §6 · «ya compré en otro lado» se leía como compra nuestra · T115 C03 | «Gracias pero ya compré en otro lado». Igual que en Depot; en Santo Domingo la competencia está a la vuelta (Edgarcar, Cobra). |
| CM24 | etapa | objeciones-y-memoria | T115 O01 / O04 · histórica H08 (conv 11274, objeción de precio viva) | «Muy caro, en Edgarcar me dan a 160». No hay descuento configurado ni política de igualar precios; sí hay A/T más baratas en la misma medida (Tourador, iLink, Townhall). |
| CM25 | etapa | inventos | ERRORES §7 · inventaba ficha y garantía (10 casos) · histórica H08 | Garantía de Winrun vs Townhall y «si se revienta en un hueco». Garantía y seguro contra impacto distintos por marca (Winrun 6 meses / 0,5 años) y SOLO en Kenda, Falken, Winrun y Maxxis; Townhall no tiene seguro. |
| CM26 | completa | trayectoria | T115 X01 (Corolla → económica → 4 → sábado → local) | Del «busco llantas» a la visita con un Aveo Family. Fitment del Aveo Family (185/60R14 o 175/70R13), opciones por marca de Competimotor, cotización de 4 y visita en su único local sin preguntar «a cuál local». |
| CM27 | completa | objeciones-y-memoria | T115 O05 («No quiero Winrun») / O10 · histórica H09 (conv 11620, no reofrecer lo rechazado) | Rechaza Haida y sigue pidiendo modelos. La 195/65R15 tiene Haida como la más barata; con la recomendación por marca de Competimotor la Haida puede volver por precio. |
| CM28 | completa | cambio-a-mitad | T115 X09 · ERRORES §6 (al despedido se le seguía insistiendo) | 225/65R17 caro, cambia a 215/65R16 y termina en «no gracias». La segunda medida cambia todo el contexto; el «no gracias» final cierra sin pregunta de local ni seguimiento. |
| CM29 | completa | fuera-de-alcance | Histórica H10 (conv 12682) · T115 X07 / R06 / R07 / E02 | Cambio de aceite, horario del sábado, «ok» y recién después 4 llantas. Competimotor ofrece lubricantes y mecánica pero el bot no los cotiza (van al asesor); el «ok» tras el horario no es una elección de llanta. |
| CM30 | completa | cierres | T115 X06 · histórica H05 (conv 9887) | 31x10.50R15LT: cotiza, «voy a comparar», «no gracias», «ya compré». Flotación escrita con «.50» y «LT»; en el Excel la etiqueta es 31X10.5R15. Después de «ya compré» no hay CTA. |
| CM31 | completa | guardian | ERRORES §8 · el guardián leía mensajes de ciclos cerrados («mañana por Quito Sur» rancio) · T115 C09 · conv 4732 (medida de otra visita) | Compra cerrada y enseguida un pedido nuevo de otra medida. El ciclo viejo tiene Kenda 185/60R14 y visita el lunes; el nuevo pide 265/70R16 dentro de las 12 h, así que la ficha vieja se conserva al reabrir (la trampa de la conv 4732). Nada del ciclo viejo puede firmarse. |
| CM32 | completa | preguntas-de-mas | ERRORES §3 · caso Eulalia (conv 7832: 3 confirmaciones y 1 h 48 min) · ~30 casos de re-preguntar lo dado | Da todo en el primer mensaje y el bot no debe preguntar nada. Con un solo local para Competimotor, preguntar «a cuál local» es pregunta de más por definición. |
| CM33 | completa | tono-y-formato | ERRORES §9 · «les molesto» disparó CLIENTE MOLESTO y apagó el bot (25-ago) | «Le molesto» por cortesía, varias veces. Cortesía ecuatoriana igual que en Quito; en Competimotor la conversación es nueva y no hay asesor que lo rescate todavía. |
| CM34 | completa | precios | T115 P01 (entrada) · ERRORES §4 (el precio se lee, no se calcula) · anuncio real de Mundillantas del 13-jun | Llega de un anuncio viejo «215/65 R16 desde $69,99». El anuncio promete $69,99 y 30 % menos; en el Excel la 215/65R16 más barata es Townhall a $85,10. El bot no puede honrar el anuncio. |
| CM35 | completa | cantidades | ERRORES §1 · «quiero 20 llantas» chocaba con un tope escondido · T115 E07 (flota) | 12 llantas 245/75R16 para la flota de la empresa, con factura. Ningún modelo de 245/75R16 tiene 12 en el Excel (el máximo es 13 de Linglong; Falken y Kenda tienen 4): o arma con lo que hay o deriva, pero no cotiza 12 de un modelo con 4. |
| CM36 | tiempo | rafagas-y-tiempo | T115 R05 (dos mensajes juntos = una sola trayectoria) | Medida, cantidad y marca en tres mensajes dentro de la espera. Llegan dentro de los 12 s: tiene que salir UNA sola cotización, de 2 Kenda. |
| CM37 | tiempo | rafagas-y-tiempo | T115 M07 · ERRORES §2 (firmó otra medida) | Corrige la medida cuando el bot ya está contestando. La corrección llega a los 14 s, cuando el turno de la primera medida ya arrancó: lo que queda firmado tiene que ser la 265/65R17. |
| CM38 | tiempo | rafagas-y-tiempo | ERRORES §1 («265/65R17» → 265 llantas) · §2 (parser) | Ráfaga partida palabra por palabra. Cada número llega solo; juntos son «4 llantas 205/55R16». |
| CM39 | tiempo | cambio-a-mitad | ERRORES §1 («deme solo 3») · §5 (la visita no puede perderse) · T115 R08 | Confirma visita y 20 s después baja de 4 a 2. El cambio llega cuando el bot ya registró la visita del viernes: la cotización vigente tiene que ser de 2 y la visita seguir en pie. |
| CM40 | tiempo | cierres | T115 R09 (rechazo manda sobre lo automático pendiente) · histórica H05 · ERRORES §6 | «Muy caro» y 15 s después «no gracias ya no». El rechazo llega mientras el bot prepara la alternativa: lo que salga después no puede ser otra oferta ni otra cotización. |

### Conteo por grupo

| grupo | escenarios |
|---|---|
| etapa | 25 |
| completa | 10 |
| tiempo | 5 |
| **total** | **40** |

### Conteo por familia

| familia | escenarios | ids |
|---|---|---|
| cambio-a-mitad | 4 | CM08, CM09, CM28, CM39 |
| cantidades | 3 | CM01, CM02, CM35 |
| cierres | 3 | CM23, CM30, CM40 |
| rafagas-y-tiempo | 3 | CM36, CM37, CM38 |
| stock-justo | 2 | CM03, CM04 |
| medidas | 2 | CM06, CM07 |
| precio-mayorista | 2 | CM11, CM12 |
| precios | 2 | CM13, CM34 |
| promo-inexistente | 2 | CM14, CM15 |
| fuera-de-horario | 2 | CM19, CM20 |
| fechas-y-visitas | 2 | CM21, CM22 |
| objeciones-y-memoria | 2 | CM24, CM27 |
| medida-fuera-del-excel | 1 | CM05 |
| alineacion | 1 | CM10 |
| envios | 1 | CM16 |
| identidad-de-marca | 1 | CM17 |
| parte-de-pago | 1 | CM18 |
| inventos | 1 | CM25 |
| trayectoria | 1 | CM26 |
| fuera-de-alcance | 1 | CM29 |
| guardian | 1 | CM31 |
| preguntas-de-mas | 1 | CM32 |
| tono-y-formato | 1 | CM33 |

## Familias históricas que quedaron afuera, y por qué

| Familia | Por qué no está |
|---|---|
| ERRORES §10 · parecía error del bot y era del sistema (pausa de humano vencida, Meta responde 200 con la ventana cerrada, bot apagado, ECONNRESET) | El simulador no tiene humano que escriba ni reloj de pausas, y la Graph API es de mentira. Se prueba con la auditoría de producción, no con conversaciones. |
| T115 R01–R04 · fallas inyectadas (búsqueda que da timeout, imagen que no sale, cotización que revienta, Guardián con salida inválida) | El simulador no sabe provocar fallas de herramientas; en el T115 ya estaban marcadas `requiereInyeccion`. |
| ERRORES §8 · Guardián | Solo un caso (CM31: ciclo cerrado y reabierto con la ficha vieja). Lo demás del Guardián (reescribe lo prohibido, falla abierto en silencio) lo cubren los invariantes de cada corrida (`sin_revision` = 0, sin `insiste_tras_rechazo`). |
| ERRORES §9 · SKU crudo y tuteo en seguimientos · ERRORES §3 · seguimiento que repregunta el día | Los seguimientos salen a las horas; el corredor no espera tanto ni corre el reloj del worker. |
| Visión (T115 P05/P06, fotos de medida; H07 fotos de llantas industriales) | El simulador manda texto, no fotos. |
| T115 V02 · ubicación por sector | Competimotor no tiene sectores cargados (`sectores: []`) y es un solo local: el bot pide el pin. No hay trampa propia que probar. |

## Supuestos sobre Competimotor

- **Stock:** el del Excel del 6-nov, no el de hoy. Jenny sube uno nuevo cada día; si el
  simulador carga otro archivo, las existencias de CM03 (205/65R15 = 3), CM04
  (175/65R14 = 2), CM07 (Falken AT4W 265/65R17 = 0) y CM35 cambian.
- **Precio por método (CM13):** la regla de Manuel (un mensaje con tarjeta = A y
  efectivo/transferencia = C) **no está en `6c22842`**: el mapeo del Excel solo lee
  precio A y D (D como control de tipeo), y `descuentoEnEfectivo` es null. La rúbrica acepta
  que mande el precio de efectivo al asesor; el hecho duro es que nunca salga el D.
- **Precio B = A** en las 482 filas, así que «con tarjeta» cuesta lo mismo que el normal.
- **Envíos (CM16):** se espera que el bot avise al asesor (`notificar_vendedor`), como
  pedía el T115 E06. La política solo dice que el costo lo confirma un asesor.
- **«Ya compré en otro lado» (CM23):** no es `ganado`, como en `ERRORES-DEL-BOT.md` §6
  (el T115 C03 decía lo contrario).
- **Stock justo:** con un solo stock total no se puede cotizar por encima de la existencia,
  ni con aviso. Si Jenny dice que se puede pedir a proveedor, `noSuperaStock` sobra.
- **Fuera de horario:** el simulador no tiene reloj propio, así que estos casos se prueban
  con el día y la hora que da el cliente (domingo, sábado 17:30), no con la hora del mensaje.
- **Aveo Family (CM26):** se acepta 185/60R14 o 175/70R13, las dos que aparecen para ese
  carro y están en el Excel.
