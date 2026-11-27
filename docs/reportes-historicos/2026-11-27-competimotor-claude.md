# Competimotor con Claude: prueba y auditoría (27-nov-2026)

Competimotor pasó a Claude hoy a las 11:52 de Quito (16:52:37Z): vendedor `claude-sonnet-5-5` y Guardián `claude-haiku-5-5`, sobre `main` 019a7d5, que trae los 5 sprints de la auditoría del 26-nov. No se había probado en el simulador con su perfil. Aquí está esa prueba.

## La respuesta corta

**Sí: Claude cumple las reglas de Competimotor tan bien como gpt-5.5, y cuesta unas 3 veces menos por conversación.** Los jueces a ciegas dieron 3 casos a Claude, 2 a gpt-5.5 y 7 empates. En los 12 casos, por 3 vueltas con Claude, **ningún precio salió en P1 y nunca se nombró el stock**.

Encontré **dos fallas con causa clara que pasaban 2 de cada 3 veces con Claude**, y también con gpt-5.5, porque no dependen del modelo sino de dos candados del código. Las arreglé, solo para Competimotor (Depot no cambia), y quedaron probadas 3 de 3 en el simulador. PR sin merge: ver abajo.

En producción, desde las 16:52Z Claude solo mandó **3 seguimientos** (ningún cliente escribió todavía). Uno salió mal: el chat 1855, falla F-C1.

## Qué estás viendo

Usé el simulador con el perfil `mundillantas`, la configuración y los modelos copiados de producción (Railway `Competimotors`), el Excel de inventario de los sprints (480 llantas) y conversaciones armadas con los chats reales que usaron los sprints (1331, 1063/1437, 1321/1303, 463/1790, 469, 1258/1142, CM28, 1273/1011, 40). Hice 12 casos y cada caso prueba una regla.

- **Claude**: 3 vueltas de los 12 casos (36 conversaciones).
- **gpt-5.5** (vendedor y Guardián): 1 vuelta de los 12 casos, para comparar.
- **Jueces**: 2 subagentes de Claude Code leyeron cada par como «Bot A / Bot B», en orden al azar, con las reglas y la tabla de precios P1/P2/P3 del Excel.

Ojo con un detalle del simulador: **las conversaciones con id 1 a 9 no usan a Sonnet**. Con `AI_EXACT_TOOL_ROLLOUT=10`, el turno «exacto» lo atiende gpt-5.4-mini cuando `id % 100 < 10`. Las primeras corridas cayeron ahí; las repetí con ids desde 1021, que es como le toca al 90 % de los chats reales.

No hay gráfico de control: con 1 a 3 corridas por caso no hay puntos suficientes para fijar límites. Lo que sigue son conteos.

## Las reglas de los sprints, con Claude (3 vueltas)

| Regla | Claude | gpt-5.5 (1 vuelta) | Nota |
|---|---|---|---|
| Nunca P1; cotiza en P2 (tarjeta) | 36/36 | 12/12 | Las cotizaciones guardan P2 sin IVA (WINRUN 77.05 → 67) |
| Dos precios (tarjeta y efectivo) en la lista | 3/3 en todos los casos con lista | 1/1 | |
| Dos precios cuando el cliente dice el uso («todo terreno») | **1/3** | 0/1 | F-C3: sale «Yo iría por la KENDA KR28 — $152.95 c/u» sin el efectivo |
| Stock ≥ 1 se vende y no se nombra el stock | 3/3 | 1/1 | KENDA KR28 con stock 2 se ofrece |
| Apertura corta desde anuncio y «rin 16» sin 3 medidas | 3/3 | 1/1 | |
| «Están caras» → efectivo + la más barata + lo incluido | 3/3 | 1/1 | Los dos repiten la lista entera en efectivo (los jueces lo marcan PARCIAL) |
| «Sí» a «¿Puede acercarse hoy o qué día le agendo la cita?» pregunta el día | **0/3** | 0/1 | F-C4: contesta «Perfecto, lo esperamos» o repite la cotización |
| «Mañana en la tarde» registra la visita | 4/4 | 1/1 | Sáb 28-nov |
| «Viernes negro» no es un día; aro 14 sin Black Friday | 3/3 | 1/1 | |
| Black Friday solo en el cuadro rojo (225/60R18: $75 / $115 / $169, hasta el sáb 5-dic) | 3/3 | 1/1 | |
| Seguro contra impacto solo Kenda/Falken | 3/3 | 1/1 | F-C5: ofrece buscar Kenda/Falken en 205/60R15, donde no hay |
| Pantanera = M/T | 3/3 | 1/1 | gpt-5.5 escondió la M/T barata (TOWNHALL MT802) |
| Otra ciudad: Laar/Bemaut, lo paga el cliente | 3/3 | 1/1 | |
| «no gracias» = otra opción | 3/3 | 1/1 | Manda 2 más baratas |
| Pide tiempo («sin fondos»): no insiste, sin seguimientos automáticos | 3/3 | 1/1 | Solo queda la revisión del asesor |
| «¿En efectivo hay descuento?» → precio C | 3/3 | 1/1 | |
| Sin aviso falso de «no hay» al asesor | **1/3** (antes del arreglo) → **3/3** | 0/1 | F-C2, arreglada |
| La pregunta del día queda tras la cotización de una sola llanta | **1/3** (antes) → **3/3** | 0/1 | F-C1b, arreglada |

## Fallas encontradas

**F-C2 — aviso falso «Un asesor también lo está revisando para conseguírsela» (ARREGLADA).** Caso C05: la TOWNHALL 185/65R14 tiene 81 llantas y el cliente pregunta «X viernes negro hay más descuento». Claude (o su Guardián) escribe «en esta llanta no tengo una promo adicional confirmada». El candado «nunca no hay» (`domain/sinNoHay.ts`) leía «llanta … no tengo» como si no hubiera stock: le pegaba al cliente «Un asesor también lo está revisando para conseguírsela» y le abría al asesor el aviso «pedido sin stock». Pasó 2 de 3 veces con Claude y 1 de 1 con gpt-5.5. **Por qué importa:** el cliente entiende que no hay la llanta, y el asesor corre a conseguir algo que ya está. **Arreglo:** si lo que se niega es una promoción («no tengo una promo», «no hay descuento», «no tenemos promoción de Black Friday»), ya no cuenta como «no hay». Lo que niega el stock sigue cayendo («no tengo stock, pero hay promoción», «no tenemos esa llanta en promoción»).

**F-C1b — el Guardián borraba «¿Puede acercarse hoy o qué día le agendo la cita?» (ARREGLADA).** Cuando hay una sola opción, el bot cotiza directo y cierra con el local y la pregunta del día. El Guardián Haiku la quitaba porque su regla 16 decía «el día se pregunta recién cuando el cliente eligió local», y los hechos decían «Local ya elegido: (ninguno)». Competimotor tiene **un solo local**, y la cotización quedaba sin pregunta. **Arreglo:** con un solo local, la regla 16 dice que la pregunta del día sí va y no se quita. Con dos o más locales (Depot) el texto es exactamente el de antes (prueba propia).

**F-C1 — chat 1855 en producción, el Guardián Haiku se contradice (sin arreglo; 1 caso).** Es un cliente de moto (Tundra 150) que ya mandó las medidas en foto: 110/90-16 y 2.75-18. El seguimiento automático decía «Solo me falta la medida de la llanta». Haiku lo vio y lo escribió en su hallazgo («el cliente ya envió medidas… la pregunta ignora ese contexto»), pero su corrección igual volvió a pedir la medida: «¿me puede compartir la medida que trae impresa el costado de la llanta?». Ayer, gpt-5.5 había corregido bien el mismo chat («Ya quedó anotado que busca las 2 llantas…»). La causa de fondo es otra: con medidas de moto `tire_size` queda vacío y el seguimiento elige la plantilla que pide la medida. No lo arreglé porque es 1 caso, de moto (que no venden), y el arreglo tocaría la plantilla de seguimientos que también usa Depot.

**F-C3 — un solo precio cuando el cliente dice el uso (sin arreglo; pasa igual con gpt-5.5).** «4 llantas todo terreno 235/60R16» saca la recomendación única «Yo iría por la KENDA KR28 — $152.95 c/u con IVA. ¿Se la cotizo?», sin el efectivo ($139.15) ni el total por 4. El camino de recomendación (`buildCierreOpciones`, `precioDicho`) no lleva el segundo precio del sprint 2. Pasó 2 de 3 veces con Claude y 1 de 1 con gpt-5.5; la tercera, el Guardián lo cambió por la lista con dos precios.

**F-C4 — «sí» a «¿Puede acercarse hoy o qué día le agendo la cita?» no pregunta el día (sin arreglo; pasa igual con gpt-5.5).** El arreglo del 27-nov (669c852) cubre el «sí» al 2.º seguimiento («¿Le agendo una cita?», con el hecho `ofrece_cita`). Esta otra pregunta, la que sigue a la cotización, no lleva ese hecho. Si el cliente da el día después, la visita sí se registra bien.

**F-C5 — ofrece Kenda/Falken en una medida donde no hay (menor; pasa igual con gpt-5.5).** Al decir que Winrun y Maxxis no llevan seguro, ofrece «¿le busco opciones en Kenda o Falken en 205/60R15?», y en esa medida no hay ninguna de las dos.

**F-C6 — «la próxima semana voy, sin fondos» le abre al asesor el aviso «visita comprometida» sin día (menor; pasa igual con gpt-5.5).**

Revisé y no es falla: Claude dijo «la Maxxis rinde hasta unos 60.000 km y la Winrun hasta unos 50.000 km». Esos datos están en `assets/mundillantas/conocimiento-marcas.json`.

## Claude contra gpt-5.5 (jueces a ciegas, 1 vuelta cada uno)

| Caso | Mejor | Por qué |
|---|---|---|
| C01 uso «todo terreno» | Claude (por poco) | Usa el seguro de Kenda como argumento real; los dos sin efectivo |
| C04 «sí» a la cita | gpt-5.5 | Al «sí» da el horario y empuja a elegir día; Claude dice «lo esperamos» sin día |
| C05 viernes negro | Claude | gpt-5.5 metió el «asesor la está consiguiendo» falso (F-C2); en las vueltas 2 y 3 Claude también |
| C08 pantanera | Claude | gpt-5.5 dejó solo la M/T cara y escondió la TOWNHALL MT802 ($280 menos por 4) |
| C09 otra ciudad | gpt-5.5 (por poco) | Claude afirma «aceptamos tarjeta» para una venta a distancia, que no está confirmado |
| C02, C03, C06, C07, C10, C11, C12 | Empate | Mismo texto en lo que importa (la mayoría lo arma el código, no el modelo) |

## Costo

| | Conversaciones | Anthropic | OpenAI |
|---|---|---|---|
| Claude (3 vueltas + prueba del arreglo) | 43 | $0.84 | $0.08 (clasificador gpt-5.4-mini) |
| gpt-5.5 (comparación) | 12 | — | $0.87 |

A eso se suman unos $0.05 de corridas iniciales que repetí. **Total gastado en la API de Anthropic: unos $0.90 de los $5 de tope.** Con Claude, la conversación promedio del lote costó unos $0.02; con gpt-5.5, unos $0.07. Las tarifas son las de `services/billing.ts`, con caché incluido.

## Pruebas del arreglo

- `test/competimotorSinNoHay.test.ts` (caso nuevo) y `test/guardianDiaLocalUnico.test.ts`: fallan en `main` y pasan con el arreglo. `test/guardianDiaLocalUnico.depot.test.ts`: la regla 16 de Depot sale idéntica (pasa en las dos versiones).
- Suite completa: 5049 pasan y 2 fallan, en 4 archivos (bitácora del panel, buscar por aro, hashes de Depot, unidad en la cantidad). Fallan igual en `origin/main` limpio.
- Simulador con el arreglo: C05 3 de 3 conserva la pregunta del día, sin aviso falso ni «asesor la está consiguiendo». C01, C04, C07 y C12 salen como antes.
- `sim:humo` mundillantas: pasa. Depot: no copia la configuración de producción porque `app/.env` no tiene `DATABASE_URL`, y eso es del entorno, no del cambio. Con `--sin-prod` todo pasa menos «el guardián revisó», porque viene apagado en la semilla.

## Qué mirar en producción

- Que ningún cliente con stock reciba «Un asesor también lo está revisando para conseguírsela» y que no lleguen avisos «pedido sin stock» de llantas que sí hay.
- Que la cotización directa (una sola opción) cierre con «¿Puede acercarse hoy o qué día le agendo la cita?».
- Las correcciones del Guardián Haiku en seguimientos (`guardian_reviews` con `verdict='corregir'`): F-C1 muestra que a veces detecta el problema y no lo corrige.
