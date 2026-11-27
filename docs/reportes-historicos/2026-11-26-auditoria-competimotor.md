# Auditoría Competimotor — 26-nov-2026

Ventana: 17-nov a 26-nov-2026. 165 chats reales leídos completos (se excluyó el chat 1, pruebas de Manuel).
Servicio: Railway `Competimotors` (entorno `Depot_Tire`), https://mundillantas.up.railway.app, commit vivo `4e53288` = `origin/main`.
Perfil del negocio en código: `mundillantas` (`app/src/negocio/politicas/mundillantas.ts`).

**Meta de negocio (Manuel, 26-nov):** concretar mínimo una venta más antes del 1-dic. Todo se ordena por eso.

## Embudo (165 chats)

| Paso | Chats |
|---|---|
| Vieron opciones con precio | 128 (77 %) |
| Recibieron cotización | 36 (21 %) |
| Dieron día de visita / compromiso | 7 (4 %) |
| Venta registrada | 1 ($437, chat 469; la cerró el asesor después de que el bot dijo «no hay») |

El paso donde más se pierde: después de la lámina, en «¿Le cotizo la 1, la 2 o la 3?» (~35 chats callan ahí), y después de la cotización, en «¿Qué día cree que puede ir?».

## Cómo leer los chats y la base (solo lectura)

- Transcripción legible de cada chat: `/private/tmp/claude-502/-Users-manue/2aef749f-72af-43a8-af61-3ae866d6ae8f/scratchpad/chats/<id>.txt` (hora de Ecuador).
- SQL de solo lectura contra la base de Competimotor: `/private/tmp/claude-502/-Users-manue/2aef749f-72af-43a8-af61-3ae866d6ae8f/scratchpad/q.sh "select ..."` (la sesión ya abre en solo lectura; no imprimas la URL).
- La `DATABASE_URL` de `app/.env` es la de DEPOT, no la de Competimotor. No la uses para esto.
- Catálogo vivo (solo GET): `GET https://mundillantas.up.railway.app/api/catalog/search?q=<medida>` con cabecera `x-admin-key` = `ADMIN_KEY` del servicio (`railway variables --kv -e Depot_Tire -s Competimotors`, sin imprimirla).

## Regla que vale para TODOS los sprints: Depot no cambia

`main` deploya a Depot Tire Y a Competimotor a la vez. Todo cambio de comportamiento va detrás de la política del negocio (`app/src/negocio/politica.ts` + `politicas/mundillantas.ts`) o de un dato que solo Competimotor tiene. Cada sprint agrega una prueba de que con el perfil `depot` la salida es idéntica a la de antes. Si un arreglo también le conviene a Depot, se anota en el cuadro para que Manuel decida; no se activa.

Reglas comerciales vigentes de Competimotor (Carlos Romero y Jenny Paz):
- Precio: P2 (B) = tarjeta; P3 (C) = efectivo o transferencia. P1/A NUNCA se le da al cliente.
- Black Friday: solo el «cuadro rojo» (aro 18–20), en la tabla `promociones`, hasta el 5-dic.
- Stock: un solo stock total; los locales se pasan llantas. Al cliente NO se le nombra el stock.
- Seguro contra impacto: solo Kenda y Falken. «Pantanera» = M/T (y R/T sirve).
- Envío a otras ciudades: Laar Courier o Transportes Bemaut; lo paga el cliente.
- Un solo local: Vía Quevedo km 1½ y Juan León Mera, Santo Domingo. Sábado 8–16.
- Incluido comprando 2 o 4: instalación, alineación (solo con 4), balanceo, nitrógeno, revisión de 20 puntos; mantenimiento cada 10.000 km.
- «No gracias» a secas = no quiero esa opción; NO es venta perdida.
- No recuperar estado parseando el texto del bot: se guarda como hecho (metadata, ficha) y se lee de ahí.

## Familias

### F-01 — Dice «no hay» cuando sí hay (stock corto) — COMPROBADA
Chats: 1331, 1344, 1555, 1588, 560, 659, 469 (venta que casi se pierde), 720.
- 1331 (23-nov 16:24) Cliente: «4 llantas todo terreno 235/60 R 16». Bot: «No me sale en stock en este momento en 235/60R16 todo terreno, pero un asesor ya le está revisando cómo conseguírsela.» + «¿Le busco una medida equivalente…?». 13 min después el asesor: «Si tenemos en la medida 235/60R16» y manda KENDA KR28 y WANDA WR9001 AT.
- 1344 (24-nov 16:02) Cliente: «205 60 R15». Bot: «Claro, ya tengo su medida *205/60R15*. Un asesor ya se la está revisando para ayudarle.» El asesor ofrece la WINRUN R380 en esa medida.
- 1588 (24-nov 18:51) «235/60/16.AT» → «Claro, con gusto.» y nada más.
- 560: tres vueltas de «¿Le busco una medida equivalente?» → «Listo» → no la busca; además dice «no hay stock suficiente».
- 469 (20-nov 11:35) «Llantas 23575r15 / Tipo pantaneras» → «no me aparece stock disponible»; el asesor vendió 4 KR601 R/T en esa medida.
Causa (chat + catálogo + código): `opcionesQueAlcanzan` (`app/src/domain/opcionesCandados.ts`) filtra todo producto con `stock < cantidad` (cantidad por defecto 4). Catálogo vivo hoy: 235/60R16 KENDA KR28 stock 2, WANDA WR9001 AT stock 1; 205/60R15 WINRUN R380 stock 2, MAXXIS stock 1; 235/75R15 KENDA KR601 stock 2. La regla viene de Depot (Joaquín, 26-ago). En Competimotor los asesores venden igual esas llantas (stock único, se pasan llantas entre locales). Segundo componente: cuando no queda nada, sale la frase de `domain/sinNoHay.ts` / `services/sinStockAlAsesor.ts` («un asesor ya se la está revisando», «ya le estoy revisando el valor promocional con el que me llegó esa mercadería») sin dar precio ni opción, y los seguimientos la repiten.
Caso sano: 1011 (medida con stock → 3 opciones con total del juego en segundos).

### F-02 — Precio más caro que el asesor, sin gancho, y sin respuesta al «está caro» — COMPROBADA en chats; causa = diseño
Chats: 1321, 1303, 1004, 1762, 697, 258, 617, 1456, 40, 463, 385.
- 1321: bot FALKEN ZE310R 225/60R17 «$180.55 c/u»; cliente «No gracias están muy caras»; asesor: «Ese valor es sin la promoción… $164.50».
- 1303 (24-nov 13:22) «Disculpe están muy caras» → repite la opción 1 y «¿Cuál le cotizo, la 1 o la 2?».
- 1762 (25-nov 15:34) «El precio esta elevado» → «la opción más económica equivalente es…» + «¿Le cotizo la 1, la 2 o la 3?», sin precio en efectivo.
- 40 (17-nov 21:25) tres veces «en efectivo hay descuento?» → tres veces «Se acepta efectivo, transferencia y tarjeta de crédito».
- 463 «No hay descuentos o promociones en esa medida» → sin respuesta. 385 «cuál es viernes negro» → definición genérica.
Lo que funcionó: 302 (tabla tarjeta $722 / efectivo $657 → acordó visita), 1734 y 1790 (mostraron tarjeta y efectivo). Los asesores mandan precio «sin descuento / con descuento» por unidad + bloque «🎉 Promoción por la compra de 2 o 4 llantas… Incluye sin costo: instalación (alineación, balanceo e inflado con nitrógeno), revisión de 20 puntos» + pregunta «Desea que le agende una cita o el día de hoy puede acercarse?» (469: «Quiero 4» en 6 minutos).
Causa: la lista de opciones (`domain/listaDeOpciones.ts`) muestra solo P2 «c/u · 4 = total» y cierra con «¿Le cotizo la 1, la 2 o la 3?»; el precio en efectivo (`domain/preciosPorPago.ts`) solo sale si el cliente pregunta por forma de pago; una objeción de precio no dispara nada.

### F-03 — Texto de dinero roto o falso — COMPROBADA en chats; causa por confirmar en el sprint
- 1403 (24-nov 19:07) dos veces: «le dejan lista su cotización con *13 %* de descuento ya aplicado, *$67.96* menos»; la cotización registrada es $436 sin descuento.
- 639 (20-nov 19:53) «*24 %* de descuento ya aplicado, *$69.50* menos» pegado antes del mapa; y «Estos son los precios según cómo pague: *2 llantas KENDA KR33A* 🖤 🖤 Black Friday hasta el lunes 30-nov…» SIN ningún precio. 964 igual. 1040, 1147, 1295, 1307: «con *20 %* de descuento ya aplicado, *$56.00* menos».
- 1790 (26-nov 04:55) «Su cotización ya queda con el precio promocional vigente de Black Friday» para una TOWNHALL TH-161 185/65R14 (el Black Friday solo cubre aro 18–20: verificar contra la tabla `promociones`).
Archivos de origen: `domain/ahorro.ts`, `domain/promocion.ts`, `domain/preciosPorPago.ts`.

### F-04 — Apertura que frena y lámina sin medida — COMPROBADA en chats
- A «¡Hola! Quiero más información» (anuncio) el bot manda 4 mensajes: saludo, imagen guía, «Lo que más necesito es el *aro*… Sin ese dato no le puedo asegurar que la llanta entre.», y la pregunta. ~20 chats murieron ahí: 290, 399, 367, 989, 1091, 1120, 1125, 612, 707, 1439, 1443, 1481, 1612, 1630, 1712.
- Manda la guía aunque el cliente ya dio la medida: 659 («195 50 rin 16»), 999 («Llantas 185/65R14»), 1456, 1433, 1724, 412 (ya había mandado foto).
- 902: primer mensaje «En Sto dgo. Donde las consigo gracias» → guía de medida; nunca dio la dirección.
- Con solo «rin 16» / «Precio» manda 3 llantas de 3 medidas distintas con «⚠️ Ojo: estas opciones son de *medidas distintas*» y «¿Le cotizo la 1, la 2 o la 3?» (~25 chats: 1051, 1063, 1096, 1112, 1152, 1239, 1251, 1283, 1348, 1437, 1594, 1614, 556, 794, 956, 40, 249, 381). Los botones salen «1 · KENDA KR601 / 2 · KENDA KR601 / 3 · KENDA KR601» (1437, 639, 794). Frase falsa «Estas son las que más se usan en su vehículo» sin que el cliente dijera vehículo (1063, 1112, 1283, 1437).
- 794: eligió una de la lámina del anuncio y el bot no pudo cotizarla.
Origen: herramientas `opciones_sin_medida` y `guia_medida` en `agent/tools.ts`; frase en `agent/agent.ts` y `services/quoteMessages.ts`; `domain/avisoDeMedidas.ts`.
Casos sanos: 1331/1011 (apertura corta «¿Qué medida usa? Ej: 225/65R17» → el cliente da la medida al minuto).

### F-05 — Seguimientos y recordatorios fuera de lugar o con datos falsos — COMPROBADA en chats
- 1273 (24-nov 17:01) Cliente (audio): «Ahí yo le escribo mi pana, porque cuando ya… reúno los billetes yo ahí le escribo». Bot: «Claro, quedo pendiente de su confirmación 👍». Al día siguiente 06:00 y 15:01: «Claro, quedo pendiente de su mensaje cuando pueda retomarlo 👍» ×2.
- 1011: avisó «la próxima semana… me quedé sin fondos» y esa tarde: «¿Qué día de la próxima semana…?».
- 1790 (26-nov 04:55) Cliente: «X viernes negro hay más descuento» (pregunta). Bot: «Perfecto, registré su visita para viernes 27 de noviembre.» Visita inventada (origen: `services/directSalesRoutes.ts`).
- 1456 (25-nov 17:11) recordatorio «Ya tenemos listas sus llantas 305/50R20»; se le cotizó 285/55R20 y la 305/50R20 no hay. 302: «Ya tenemos listas sus llantas 285/50R20», se cotizó 275/55R20.
- 1375: con visita registrada, «Me quedé pendiente de lo que me comentó: "Para el viernes". ¿Qué día le quedaría más cómodo?».
- 138 chats recibieron seguimiento, casi siempre dos con la lista entera repetida («Estas son las opciones… que le mostré» y «Sigo pendiente de las opciones…»); solo 31 respondieron. Lo que sí revivió: pregunta de sí/no («si le sirve, ¿se la cotizo?» → 605, 636) y pedir la medida (633, 845, 884).
- 469 (21-nov 09:39) cliente que ya compró pregunta al asesor «Me confirma amigo si consiguió las llantas» → bot: «Todavía no tengo una medida confirmada…» + guía.
- Retomada con «---» visible en el texto: 1331, 1344, 108, 427.
Origen: `domain/followUpMessages.ts`, `services/followUpProcessor.ts`, `domain/cierreTurno.ts`, recordatorios de visita (`recordatorios_visita`), `services/directSalesRoutes.ts`, `services/resumeBot.ts`.

### F-06 — Casos sueltos
- Otra ciudad (1142 Quito, 1258 Guayaquil, 1202, 1614 Manta, 710): manda mapa y «¿Qué día puede ir?» en vez de explicar el envío. 1258: «Soy de GYE» → «Le puedo enviar la ubicación por mapa».
- Llanta de carga: 1717 («195R15C» → ofrece 195/45R15, 195/50R15, 195/55R15), 1632 («225/65/R16LT… furgoneta escolar» → equivalentes de pasajero), 1652.
- Pide asesor y el bot sigue el guion: 720 («Sí» / «Asesor» → «¿Cuál le cotizo, la 1 o la 2?»). 469: tras pedir asesor, «Que tiempo demora» → responde el tiempo de instalación.
- 697 «Si acepta cheques» → «¿Le cotizo la FALKEN…?». 538 pide fotos de las dos llantas → repite precios.
- Doble botón → dos cotizaciones cruzadas: 1085, 1295.
- Tipo equivocado: 227 pidió M/T y se cotizó 2 A/T; 293 pidió A/T y la «equilibrada» es ILINK WILDWOLF MT.

## Ya resuelto (no tocar)
- Auto-respuesta de WhatsApp Business encima del bot (63 chats, hasta el 22-nov).
- Precios en P1 del 20-nov.

## Lo que no se pudo comprobar
- Ventas reales: no hay facturas cargadas. Si un asesor contestó por fuera de lo registrado.
