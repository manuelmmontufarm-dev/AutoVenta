## Resumen del lote
24 chats leídos, 12 con errores visibles, 10 con casi-errores.

## Errores visibles
### Fecha de visita mal registrada y confirmada al cliente — conv 48631 — gravedad alta — ¿propio de Claude? no
- Hora: 25/11 09:45 (sigue 13:38 y 26/11 11:37)
- CLIENTE: «El Martes que fui no tenían las llantas para que esté seguro que el viernes van a tener»
- BOT: «Ya dejé anotado en el sistema su compromiso para el viernes» → 12:47 «tenemos registrada su visita el *martes 1 de diciembre*» → 13:38 «lo dejo anotado: va a ir el martes 1 de diciembre»
- Qué pasó: el lector de fechas tomó «Martes» (pasado) como visita el martes 1/12, y la ficha quedó así. El Guardián (Haiku) le dijo al cliente que el viernes ya estaba anotado, cosa que no era cierta. Luego el seguimiento y la rutina gpt-5.4-mini confirmaron el 1/12, y el Guardián aprobó aunque había marcado el desfase como alta. El cliente piensa ir el viernes 27 y el asesor lo espera el 1/12.

### Opciones de otra medida ignorando la ya cotizada — conv 48631 — gravedad media — ¿propio de Claude? no sé
- Hora: 25/11 09:28
- CLIENTE: audio «no tenían la rin 16 … iba a traer unas RT y las AT»
- BOT: «estas opciones son de *medidas distintas* del mismo aro (215/65R16, 245/70R16, 225/70R16)»
- Qué pasó: la ficha ya decía 265/75R16 y la Falken ya estaba cotizada en $1080.26, pero el bot tomó solo «rin 16» y mandó medidas que no son las suyas. El cliente tuvo que repetir «4 falken 265/75 rin 16 ya me cotizó … $1080». No aparece la corrida del vendedor en la telemetría; el Guardián Haiku corrigió otra cosa y dejó pasar la medida.

### Guardián reescribe y mete errores nuevos — conv 48631 — gravedad media — ¿propio de Claude? sí
- Hora: 25/11 09:40
- CLIENTE: «Pero en cumbaya no las tenían»
- BOT: «Hoy en Cumbayá la Falken 265/75R16 … sí tiene stock para su juego de 4 … Le mando los links de Maps de nuestros dos locales» + «¿Cuál de los dos locales le queda mejor para ir el viernes?»
- Qué pasó: el texto CORREGIDO del Guardián Haiku hizo tres cosas. Afirmó stock en Cumbayá, aunque el catálogo da el total y el cliente acababa de decir que allí no había. Prometió los links de Maps, que nunca salieron. Y volvió a preguntar el local que el cliente ya había dicho a las 09:36 («En cumbaya»).

### «¿Se la cotizo?» dos veces — conv 48631 — gravedad baja — ¿propio de Claude? sí
- Hora: 25/11 09:38 y 09:41
- CLIENTE: «Si estás» (sí, está)
- BOT: «¿Se la cotizo?» … tras otro turno, «¿Se la cotizo?» de nuevo
- Qué pasó: el primer sí no generó cotización (quedó bloqueada) y el Guardián Haiku volvió a meter la misma pregunta. El cliente tuvo que decir sí dos veces.

### Seguimiento ignora que el cliente ya fue — conv 48631 — gravedad baja — ¿propio de Claude? no
- Hora: 25/11 08:31
- CLIENTE (24/11 16:18): «Ya pasé por ahí»
- BOT: «Quedamos para el martes 24 … pero ese día ya pasó. Si todavía le sirve pasar, dígame qué día le queda mejor»
- Qué pasó: el seguimiento de plantilla trató como pendiente una visita que el cliente ya hizo. El Guardián lo detectó, pero su corrección siguió pidiendo un día.

### Medida mal leída y dos turnos que se contradicen — conv 53842 — gravedad alta — ¿propio de Claude? no
- Hora: 26/11 12:33
- CLIENTE: «De esta» + foto «215/75R15C 106/104S»
- BOT: «Esa medida es 175R15C 106/104R 8PR. Ahorita no puedo confirmarle … el catálogo no está respondiendo» y 14 s después, en otro mensaje, la lámina y las opciones 215/75R15 (KR28 / KR601 / Falken A/T Trail)
- Qué pasó: el respaldo gpt-5.5 (tool_chain_finalized) repitió la medida de la foto anterior y dijo que el catálogo estaba caído. En paralelo, Claude Sonnet sí mandó opciones de la medida nueva. Fueron dos turnos para el mismo mensaje que se contradicen. No verifiqué si esas opciones aguantan la carga C 106/104 que muestra la foto.

### Pregunta de elección fuera de lugar — conv 53842 — gravedad baja — ¿propio de Claude? no sé
- Hora: 26/11 12:31
- CLIENTE: «Gracias»
- BOT: «¿Cuál le cotizo, la 1, la 2 o la 3?»
- Qué pasó: un minuto antes el bot había pasado la 175R15C al asesor. Aun así volvió a pedir que eligiera entre las opciones genéricas de aro 15, que no le servían. No hay corrida del vendedor registrada; el Guardián aprobó.

### Aviso de «medidas distintas» duplicado — conv 53842 y 52673 — gravedad baja — ¿propio de Claude? no
- Hora: 26/11 12:28 (53842) y 25/11 05:51 (52673)
- CLIENTE: «Buenos días cuanto cuesta el rin15» / «disculpe rin 14 tiene»
- BOT: «⚠️ Ojo: estas opciones son de *medidas distintas* del mismo aro (…)» seguido de «Estas opciones son de su aro 15, y cada una lleva su medida en la lámina»
- Qué pasó: el Guardián quitó el aviso y el candado `aviso_de_medidas_repuesto` lo volvió a pegar encima de la corrección. Salieron dos frases seguidas que dicen lo mismo.

### Aros (rines) tratados como llantas y promesas sin mecanismo — conv 40668 — gravedad media — ¿propio de Claude? no sé
- Hora: 26/11 16:35; 27/11 09:01, 08:31 y 12:01
- CLIENTE: «modelos de aros rin 16 y rin 17 para volks Tera» … «Los aros» … «Necesito rin 16 y rin 17»
- BOT: «Para rin 16 también tengo opciones y se las muestro con su medida en la lámina.⏎⏎ Se lo consulto y le confirmo.» y dos seguimientos «¿me confirma la medida que aparece en el costado de su llanta?»
- Qué pasó: el respaldo gpt-5.5 respondió los turnos del vendedor ofreciendo llantas de rin 17, no los aros que pedía, y nunca se ocupó del rin 16. La frase «Se lo consulto y le confirmo» la metió el Guardián Haiku sin que hubiera aviso al asesor; la alerta `caso_sin_resolver` salió después, como efecto. La lámina de rin 16 prometida nunca salió. Los seguimientos piden la medida a alguien que busca rines.

### Re-pregunta la medida ya dada — conv 39120 — gravedad media — ¿propio de Claude? no
- Hora: 25/11 08:31
- CLIENTE (24/11): «De esa llanta» / «Y si tiene Rt talves»
- BOT: «Para recomendarle opciones reales, ¿me confirma la medida que aparece en el costado de su llanta?»
- Qué pasó: el cliente ya había dado 235/75R15 en dos ciclos anteriores y volvió a escribir sobre «esa llanta». El seguimiento de plantilla volvió a pedir la medida y el Guardián lo aprobó.

### R/T pedida, A/T ofrecida, sin aclarar — conv 39120 — gravedad media — ¿propio de Claude? sí
- Hora: 25/11 08:37–08:38
- CLIENTE: «Esa es At!» … «Talves RT ?»
- BOT: «Para lo que me pidió, le recomiendo la *FALKEN WILDPEAK A/T 4W*» … y luego solo la lámina de la KR601 con «¿Se la cotizo? 😊»
- Qué pasó: el cliente dudó si la KR601 era A/T. Claude Sonnet no le explicó que es R/T: le cambió a una A/T, justo lo contrario de lo que pedía, y después volvió a la KR601 sin una palabra. El cliente no volvió a escribir.

### Dos preguntas seguidas e ignora «quiero verlas» — conv 12098 — gravedad baja — ¿propio de Claude? sí
- Hora: 27/11 08:08
- CLIENTE: «Quiero aserca a ver las llantas para poder ver cuál me interesa»
- BOT: «¿Qué día cree que puede pasar por Depot Tire Quito Sur?» + «¿Le cotizo la 1, la 2 o la 3?»
- Qué pasó: el Guardián Haiku agregó la pregunta del día y dejó también la de elegir, así que salieron dos preguntas, y la de elegir ignora que el cliente quiere decidir en el local. Antes, a las 08:06, el bot ya había reenviado el link de Quito Sur que mandó un minuto antes.

### Seguimiento con opciones de otra medida — conv 52431 — gravedad alta — ¿propio de Claude? sí
- Hora: 25/11 08:31
- CLIENTE (24/11): «La mía es 265-70-17» / «Es para una relay r8»
- BOT: «🛞 Estas son las opciones 265/70R17 que le mostré: 1 · WINRUN MAXCLAW A/T — $99.53 c/u … 3 · FALKEN ZIEX CT60 A/S …»
- Qué pasó: las opciones eran de 225/60R17, 215/60R17 y 225/65R17, y la Winrun no tenía stock. El Guardián Haiku marcó tres hallazgos de gravedad alta y aun así aprobó el mensaje. Minutos después llegaron las opciones reales de 265/70R17, entre $707 y $1107, frente a los $398–622 que acababa de ver el cliente.

### Doble turno con la misma lista — conv 52431 — gravedad baja — ¿propio de Claude? sí
- Hora: 25/11 08:32:51 y 08:33:06
- CLIENTE: «Las fotos por favor» / «De las llantas 1 por una y los precios gracias»
- BOT: la lista de 3 opciones dos veces en 15 s (la segunda con «Las fotos de las tres llantas van en la lámina que ya le envié»)
- Qué pasó: hubo dos corridas de Sonnet, `exact_tool_reply` y `commercial`, una por cada mensaje del cliente, y las dos mandaron la lista.

### Seguimiento afirma stock que el bot había negado — conv 45109 — gravedad baja — ¿propio de Claude? no
- Hora: 25/11 10:05
- CLIENTE (23/11): foto del labrado KR20 «Este labrado era el que me ofreció en la medida 185/70/14»
- BOT: «Hola Gato, ayer le esperábamos en Depot Tire Cumbayá. Sus llantas 185/70R14 siguen disponibles.»
- Qué pasó: el recordatorio de plantilla, sin corrida, dice que hay stock, cuando el propio bot había dicho que no alcanzaba para 4 y la asesora ofreció otra opción. La pregunta del cliente del 23/11 sigue sin respuesta registrada.

### Seguimiento ignora que el cliente canceló — conv 37363 — gravedad media — ¿propio de Claude? no
- Hora: 25/11 10:05
- CLIENTE (23/11): «No voy a poder ir ese día, quiero cambiar el día de la visita»
- BOT: «Hola Eduardo, ayer le esperábamos en Depot Tire Cumbayá. Sus llantas 31X10.5R15 siguen disponibles.»
- Qué pasó: la plantilla de «no vino» trató como incumplida una visita que el cliente había cancelado. El origen es anterior a la ventana: la visita quedó registrada para el 24.

### Guía de medida a quien ya dio la medida — conv 53894 — gravedad baja — ¿propio de Claude? no sé
- Hora: 26/11 13:01
- CLIENTE: «talvez 175/50 /15»
- BOT: guía de medida + «Lo que más necesito es el *aro* … Sin ese dato no le puedo asegurar que la llanta entre», y 11 s después las opciones
- Qué pasó: un turno de Sonnet contestó a los dos primeros mensajes sin ver el de la medida, y salió una re-pregunta pisada por el turno siguiente. El seguimiento de las 16:01 tiene una redacción torpe: «¿Cómo vio la opción (equivalente de su aro)? Es la equivalente que tengo para su aro».

### Cotizó sin que el cliente eligiera — conv 53982 — gravedad media — ¿propio de Claude? sí
- Hora: 26/11 14:45–14:46
- CLIENTE: «…225/45/RN17» + «Las cuatro llantas»
- BOT: las 3 opciones sin pregunta de elección y, 11 s después, «Cotización COT-MWXYQBOO enviada por $359.50» + «Puede pasar sin compromiso a verlas»
- Qué pasó: la segunda corrida de Sonnet (`exact_tool_reply`, `generar_cotizacion`) tomó «Las cuatro llantas» como si eligiera y cotizó la opción 1 (KR20) sin preguntar ni decir cuál cotizó. La cuenta sí cuadra: 2 × 128.39 + 2 × 51.36 = 359.50.

### Recordatorio promete llantas apartadas — conv 53069 — gravedad baja — ¿propio de Claude? no
- Hora: 26/11 17:09
- CLIENTE: (reacción 👍)
- BOT: «Ya tenemos listas sus llantas 205/60R16.»
- Qué pasó: el recordatorio de plantilla, sin corrida, afirma una reserva que no está registrada en ningún lado. Es la misma plantilla que en 45109 y 37363.

## Casi-errores contenidos
- conv 48631 — agenda equivocada: el borrador (gpt-5.4-mini) agendaba «hoy martes 24 de noviembre» con el día ya pasado; lo frenó el Guardián.
- conv 48631 — pregunta de más: el borrador preguntaba «¿Va hoy a Cumbayá?» y pedía la «medida del costado»; lo frenó el Guardián.
- conv 53842 — equivalencia inválida: el borrador gpt-5.5 ofrecía la KR33A 205/70R15 como «equivalente comercial» de 175R15C (30 mm más ancha); lo frenó el Guardián. También un mensaje idéntico al anterior que frenó el candado `guard_mensaje_duplicado`.
- conv 40668 — medida sin respaldo y promesa: el borrador gpt-5.5 recomendaba la Kenda KR20 215/40R17, que no salió en la búsqueda, y decía «ya dejé avisado al asesor» sin alerta; lo frenó el Guardián (aunque el 27/11 dejó pasar la KR20 en la lista).
- conv 53331 — producto supuesto: el borrador de Sonnet asumía que la «KR680» era la KR628, y el cliente terminó eligiendo la KR608; el Guardián lo cambió por las 3 opciones.
- conv 52431 — dato inventado: el borrador de Sonnet ponía «KR29 (6 lonas)» sin respaldo; lo quitó el Guardián.
- conv 39120 — exclusividad falsa: el borrador de Sonnet decía «Es la única que tengo» de la Falken A/T 4W, con otras A/T en stock; lo frenó el Guardián.
- conv 53069 — re-oferta de lo aceptado: el borrador gpt-5.4-mini volvía a ofrecer la visita del viernes ya confirmada; lo frenó el Guardián.
- conv 53432 — ahorro ambiguo: el borrador decía «$233.52 menos» sin aclarar que era el total; el Guardián lo precisó.
- conv 12098 — re-pregunta: el borrador gpt-5.4-mini preguntaba «¿Le queda bien ese local?» justo después de que el cliente dijo «Quito Sur», y otro borrador juntaba día y local en una sola pregunta; lo frenó el Guardián.
- conv 52673 — pregunta de más: el borrador pedía la «medida del costado» al dar el aro; lo quitó el Guardián (y el candado repuso el aviso, ver arriba).

## Cosas propias de Claude (buenas o malas)
- No vi texto de sistema escapado (system-reminder, etiquetas, JSON, nombres de herramientas), ni rechazos, ni respuestas vacías en este lote.
- El Guardián Haiku, al reescribir, a veces mete errores que el borrador no tenía: afirma stock por local, promete links que no salen y re-pregunta el local (48631); agrega «Se lo consulto y le confirmo» sin mecanismo (40668); junta dos preguntas (12098); dice «ya dejé anotado el viernes» cuando no era así (48631).
- El Guardián Haiku aprueba con hallazgos de gravedad alta sin corregir: el seguimiento con medidas equivocadas en 52431 y la fecha 1/12 en 48631 (13:38).
- El Guardián Haiku y el candado de «medidas distintas» se pisan: sale el aviso dos veces (53842, 52673).
- El Guardián se contradice entre turnos: el 26/11 quita la KR20 215/40R17 por no tener respaldo y el 27/11 la deja (40668). En 53894 (27/11) dice que 195/45R15 no cumple el 3 % de diámetro, cuando sí cumple (556 vs 556,5 mm); su texto final quedó bien.
- Sonnet resolvió bien una pregunta difícil en 53331 (modelo inexistente «KR680», con las 3 opciones reales de la medida) y fue honesto con las equivalentes en 53894 y 54010 («no tengo disponibilidad exacta… se confirma el calce al montar»; las cuentas de diámetro cuadran).
- Sonnet con dos corridas seguidas por dos mensajes del cliente produce turnos dobles: lista repetida en 52431, cotización sin elección en 53982 y guía de medida pisada en 53894.
- Latencia: una corrida de Sonnet de 74,8 s (48631, 25/11 09:37, `exact_tool_reply` con 3 herramientas); con todo, la respuesta salió a ~94 s del mensaje, bajo los 2 min.
- Respaldo gpt-5.5: en 53842 (12:29 y 12:33) leyó mal la segunda foto y dijo que el catálogo estaba caído mientras Sonnet mandaba opciones. En 40668 contestó todos los turnos del vendedor (`tool_chain_finalized`). No sé si fue por falla de Claude o porque la ruta va directo a gpt-5.5.
- Tono: el Guardián usa «Entiendo, don» y «Tiene razón en reclamar» en 48631; suena correcto pero largo. Los mensajes corregidos por el Guardián suelen salir más largos que el borrador.

## Embudo
| conv | nueva | paso máx | por qué murió (si <3) |
|---|---|---|---|
| 48631 | no | 4 | — |
| 53842 | sí | 2 | el bot falló: leyó mal la 2.ª foto y se contradijo (catálogo caído vs opciones); no eligió |
| 40668 | sí (ciclo nuevo) | 2 | pidió algo que no hay (aros/rines, no llantas) |
| 53331 | sí | 3 | — |
| 53069 | sí | 4 | — |
| 39120 | no (ciclo abierto 24/11 antes de la ventana) | 2 | confusión R/T vs A/T sin aclarar; se enfrió |
| 12098 | sí (ciclo nuevo) | 4 | — (sin cotización: quiere ver las llantas en el local) |
| 52431 | no | 2 | se enfrió tras opciones; el seguimiento previo mostró otra medida y precios más bajos |
| 53432 | sí | 3 | — |
| 52273 | no | 3 | — |
| 45109 | no | 4 | — |
| 37363 | no | 4 | — (visita cancelada por el cliente antes de la ventana) |
| 53894 | sí | 2 | no hay su medida exacta, solo una equivalente; sin respuesta |
| 8575 | sí (ciclo nuevo) | 2 | se enfrió tras opciones, sin respuesta |
| 52323 | no | 3 | — |
| 52040 | no | 4 | — |
| 52673 | sí | 2 | solo dio el aro; no eligió; se enfrió |
| 53982 | sí | 3 | — |
| 54010 | sí | 2 | sin medida exacta (equivalentes); se enfrió |
| 53544 | sí | 2 | se enfrió tras opciones |
| 53291 | sí | 2 | se enfrió tras opciones |
| 52711 | sí | 2 | se enfrió tras opciones |
| 53654 | sí | 0 | nunca dio medida tras el saludo |
| 54016 | sí | 0 | su mensaje no llega al sistema (encuesta/temporal); no hay respuesta registrada del bot |
