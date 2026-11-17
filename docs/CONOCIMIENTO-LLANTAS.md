# Conocimiento de llantas — Depot Tire

**Para qué sirve:** contestar con seguridad cualquier pregunta de producto que hace un cliente de Depot: de dónde es, para qué sirve, cuánto dura, cuántas lonas tiene, si es mejor que una BFGoodrich, si le sirve a su carro.

**De dónde sale:**
1. **Lo que Depot ya dice:** `app/assets/conocimiento-marcas.json` (13-ago-2026), el perfil `src/negocio/negocios/depot.ts` y las garantías que viajan en cada cotización.
2. **Catálogo:** `app/assets/base_llantas_tipos.json`, inventario del 4-ago-2026 con 35 modelos y 385 medidas.
3. **Preguntas reales:** las conversaciones del bot en producción, ago–nov 2026, con ~3.800 mensajes de clientes sobre producto. Ahí se ve qué se preguntó, cuántas veces y qué se contestó.
4. **Investigación web del 17-nov-2026:** fichas de fábrica, catálogos Kenda EE. UU./Europa, Tyre Reviews, Tire Rack, ADAC, fichas EPREL de la UE, Tyrepress y Tire Business. Cada dato lleva su fuente en la sección 13.

**Cómo leer las marcas:**
- ✅ = dato confirmado con fuente.
- ⚠️ = no confirmado o con fuentes que no coinciden. Se puede decir con «aproximadamente» o «según el fabricante», o mejor no decirlo.
- 🏪 = dato propio de Depot. Manda sobre cualquier fuente externa.
- ❓ = falta que Depot lo confirme (lista completa en la sección 12).

---

## Índice

1. [Respuestas rápidas (lo que más preguntan)](#1-respuestas-rápidas)
2. [Las marcas: origen, dueño, fábricas, reputación](#2-las-marcas)
3. [Tabla maestra de los 35 modelos](#3-tabla-maestra-de-modelos)
4. [Fichas por modelo](#4-fichas-por-modelo)
5. [¿Cuál le recomiendo? Por uso y por vehículo](#5-cuál-le-recomiendo)
6. [Contra las marcas que no vendemos](#6-contra-las-marcas-que-no-vendemos)
7. [Lonas, carga y velocidad](#7-lonas-carga-y-velocidad)
8. [DOT, año de fabricación y «¿son nuevas?»](#8-dot-año-de-fabricación-y-son-nuevas)
9. [Medidas equivalentes, aros y calce](#9-medidas-equivalentes-aros-y-calce)
10. [Garantía, seguro, qué incluye, promociones y pago](#10-garantía-seguro-qué-incluye-promociones-y-pago)
11. [Cuidado de la llanta en Quito](#11-cuidado-de-la-llanta-en-quito)
12. [Lo que todavía falta confirmar con Depot](#12-lo-que-todavía-falta-confirmar-con-depot)
13. [Errores del bot que no hay que repetir](#13-errores-del-bot-que-no-hay-que-repetir)
14. [Fuentes](#14-fuentes)
- [Anexo A — Lonas y rango de carga por medida](#anexo-a--lonas-y-rango-de-carga-por-medida)
- [Anexo B — Medidas de fábrica de los vehículos más pedidos](#anexo-b--medidas-de-fábrica-de-los-vehículos-más-pedidos)
- [Anexo C — Todas las medidas por modelo](#anexo-c--todas-las-medidas-por-modelo)

---

## 1. Respuestas rápidas

Las preguntas aparecen en el orden de cuántas veces las hicieron los clientes reales (conversaciones aproximadas, ago–nov 2026). Cada respuesta se puede copiar tal cual.

### 1.1 «¿De dónde son?» / «¿Son chinas?» (~80 conversaciones; tres clientes no fueron a comprar por no recibir respuesta)

> **Falken es una marca japonesa** (Sumitomo Rubber, la misma empresa de Dunlop en Japón). **Kenda es taiwanesa**, con más de 60 años fabricando llantas. **Winrun es china.** Las tres traen 5 años de garantía de fábrica.

Si el cliente pregunta dónde **se fabricó** la llanta, que no es lo mismo que de dónde es la marca:
> La marca es japonesa, pero Falken fabrica en varias plantas propias. Las que llegan a Ecuador suelen venir de **Japón o Tailandia**, según el lote y la medida. El país exacto viene escrito en el costado («MADE IN …») y se lo mostramos en la llanta física.

- 🏪 Un asesor ya lo contestó así: «Disponemos de Japón y Tailandia, todo depende del lote y el modelo».
- ✅ La planta de Tailandia (Amata City) es la más grande de Sumitomo para exportación. Desde nov-2024 también hace lo que antes salía de la planta de EE. UU.
- Kenda fabrica en **Taiwán, China, Vietnam e Indonesia**. ✅ La Emera A1 (KR41) es «made in Taiwan» según el catálogo europeo de Kenda. ❓ El país de las demás Kenda del inventario hay que leerlo en el costado.
- **Nunca decir que Kenda es china.** El bot lo dijo una vez (c7900) y es falso: la marca es taiwanesa, aunque tenga plantas en China.
- ⚠️ **Dejar de decir que Winrun tiene «ingeniería alemana».** No hay ninguna prueba de un centro técnico alemán ni de diseño alemán. Lo único alemán es su importador para Europa (Reifen Hinghaus). Mejor decir: «Winrun es china, con homologación europea y DOT de EE. UU.: cumple las normas para venderse en Europa y en Estados Unidos».
- Si el cliente dice «no quiero chinas»: ofrecer Falken (japonesa) o Kenda (taiwanesa) y no discutir.

### 1.2 «¿Cuántos km dura?» / «¿Qué treadwear tiene?» (~60 conversaciones; el bot contestó distinto cada vez)

**Regla única:** dar siempre el número, siempre como aproximado y siempre con la condición.

> Son promedios aproximados: **Falken unos 86.500 km, Kenda unos 68.500 y Winrun unos 58.000.** Dependen del uso, de la presión y del mantenimiento. Por eso el mantenimiento y la rotación cada 10.000 km van incluidos sin costo.

- 🏪 Esas cifras son de Depot (conocimiento-marcas.json). No hay que inventar otras.
- Para obra, cantera, carga pesada o M/T, decir **antes** que el rendimiento baja.
- **Treadwear (UTQG)** = el número de desgaste del costado. Solo existe en llantas de pasajero para EE. UU., las LT no lo llevan. Sirve para comparar llantas **de la misma marca**, no entre marcas. Valores confirmados:

| Modelo | UTQG (desgaste · tracción · temperatura) |
|---|---|
| Falken Wildpeak A/T Trail | 680 AA (otras fuentes 540 AB según medida) ⚠️ |
| Falken Wildpeak A/T3W | 660 A/B · B (según medida) ✅ |
| Falken Ziex CT60 A/S | 600 – 740 AA según medida ✅ |
| Falken ZE310R Ecorun | 320 B A (🏪 ficha que mandó el asesor; la versión EE. UU. ZE310A sale igual) |
| Falken Azenis RT615K+ | 200 AA ✅ (de pista: dura poco) |
| Kenda KR28 Klever A/T | 660 A B ✅ (medidas P) |
| Kenda KR628 Klever A/T2 | 560 A B ✅ |
| Kenda KR15 Klever H/P | 400 A A ✅ |
| Kenda KR20 Kaiser | 300 AA (tiendas de EE. UU.) ⚠️ |
| Kenda KR50 235/55R18 | 500 (🏪 lo dijo el bot, c38722) |
| Kenda KR605 215/60R17 | tracción B, temperatura A (🏪 c40720) |
| Winrun R330 / R380 | 420 AA ✅ |
| LT (A/T4W LT, R/T, M/T, KR601, KR29, KR629, MT305, Maxclaw R/T) | **No llevan UTQG**: no se exige a las LT |

### 1.3 «¿De cuántas lonas es?» (~82 conversaciones; el mayor vacío del bot)

> Esa medida es **LT de 10 lonas (rango de carga E)**: es para camioneta de trabajo y carga.

- Las lonas ya están en el sistema para casi todas las LT y comerciales. Ver el **Anexo A**, medida por medida.
- Atajo: rango **C = 6 lonas, D = 8, E = 10, F = 12**.
- Una llanta de auto normal (sin LT ni C) equivale a 4 lonas. Una **XL** es reforzada (más carga a más presión), pero no es LT.
- Confirmados: **Kenda KR29 y KR601 en 16"–17" grandes = 10 lonas, rango E** (🏪 lo dijo el asesor y coincide con el sistema). KR33A 225/70R15C = 8 lonas. KR12 7.00R15 = 12 lonas.
- Las de 15" «chicas» (LT215/75R15, LT235/75R15 en KR29/KR601, 31x10.50R15) son de **6 lonas**. Si el cliente pide una camioneta de 10 lonas en aro 15, solo la **Falken A/T4W LT235/75R15 116/113** llega a 10 (E). En comercial de aro 15 hay KR33/KR100 de 8 lonas y la KR12 7.00R15 de 12 lonas.
- Detalle completo en la sección 7.

### 1.4 «¿Incluye alineación y balanceo?» (~40 conversaciones; en agosto y septiembre el bot dijo que NO, y era falso)

> **Sí.** El precio incluye instalación completa (enllantaje), **alineación y balanceo**, revisión del vehículo y el mantenimiento con rotación cada 10.000 km sin costo. Además lleva seguro contra golpes y cortes.

- 🏪 Fuente: `depot.ts` («Instalación completa · seguro contra golpes y cortes · mantenimiento cada 10.000 km · revisión del vehículo») y los asesores.
- ❓ Válvulas, nitrógeno y en qué consiste exactamente el mantenimiento de 10.000 km: sección 12.

### 1.5 «¿Qué garantía tiene?» / «¿Qué es eso del seguro?» (~35 conversaciones)

> Hay **dos respaldos distintos**:
> 1. **Garantía de fábrica de 5 años** contra defectos de fabricación, en las tres marcas.
> 2. **Seguro Depot contra golpes y estalladuras**: **hasta 18 meses en Falken, 12 en Kenda y 6 en Winrun.** Si la llanta se daña por un golpe cubierto, le entregamos una nueva sin costo.

- 🏪 Así sale en cada cotización (`warrantyRoadHazard`: «18/12/6 meses contra golpes y estalladuras»).
- Decir siempre «**hasta** X meses».
- No explicar letra chica, exclusiones ni el trámite. Si el cliente ya tiene una llanta dañada o pregunta si aplica a su caso, pasarlo a un asesor.
- ⚠️ La póliza Kenda «Garantía Total / Rueda Segura» (grupoInter), según la foto de un cliente, dice «**no aplica para llantas Rin 13**». ❓ Confirmar con Depot.
- Las garantías de kilometraje de EE. UU. (Falken 55.000–65.000 millas, Kenda A/T2 60.000 millas) **no aplican en Ecuador**. No prometerlas.

### 1.6 «¿Qué tal es la marca?» / «¿Cuál me recomienda?» (~90 conversaciones)

> **Winrun** es la opción económica. **Kenda** es la del medio, muy buena relación precio-calidad, sobre todo en 4x4. **Falken** es la premium: japonesa, la que más dura (~86.500 km) y la que más seguro trae (18 meses).

- La escalera Económica → Equilibrio → Premium se arma **por marca** (Winrun → Kenda → Falken), no solo por precio. El bot llamó «premium» a una Kenda y «equilibrada» a una Falken R/T de $487 (ver sección 13).
- Argumento para subir de nivel:
  - La Falken rinde ~28.500 km más que la Winrun y trae el triple de seguro (18 contra 6 meses).
  - Dividir el precio para los km: muchas veces la premium sale **más barata por kilómetro**.
- Datos de reputación para respaldarlo:
  - ✅ La **Falken Wildpeak A/T4W fue n.º 1** en el comparativo all-terrain 2025 de Tyre Reviews. En la prueba de Tire Rack 2024 frenó ~8 % mejor en mojado que la BFGoodrich KO3.
  - ✅ La **Kenda Klever R/T (KR601)** tiene 4,7/5 con 705 reseñas de dueños en EE. UU., y la Klever A/T2 (KR628) 4,6/5 con 270.
  - ✅ En el ranking mundial de fabricantes 2026 (Tyrepress), **Sumitomo (Falken) es el n.º 8 del mundo**, por delante de Toyo, Kumho y Maxxis. Kenda está cerca del puesto 29. Winrun no entra en el top 75.

### 1.7 «¿Tienen Michelin / BFGoodrich / Maxxis / Continental…?» (~160 conversaciones)

> No trabajamos esa marca. En su medida le puedo ofrecer [opciones]. Si quiere, se las comparo con la que tiene.

Comparativas listas en la sección 6.

### 1.8 «¿Cuál es la diferencia entre la X y la Y?» (~35 conversaciones)

Fichas en la sección 4 y tabla en la sección 3. Las confusiones más comunes:
- **A/T4W vs A/T Trail (Falken):**
  - La **A/T Trail** es para SUV y crossover (Tucson, Sportage, RAV4, Vitara): ~80 % asfalto, más cómoda y silenciosa.
  - La **A/T4W** es para camioneta y 4x4 (Hilux, D-Max, Fortuner): ~50/50, más robusta, con versiones LT de 10 lonas.
- **A/T4W vs A/T3W:** la A/T4W es la nueva (2024). Tiene banda más rígida, costado de 3 capas en medidas seleccionadas y laminillas hasta el fondo, así que agarra hasta el final de la vida. El dibujo es casi igual. Las dos tienen 3PMSF.
- **KR28 vs KR628 vs KR608 (las tres «Klever A/T» de Kenda):**
  - **KR28:** A/T de 1.ª generación, prioriza confort en carretera.
  - **KR628 (Klever A/T2):** la generación nueva, 3PMSF en todas las medidas, más silenciosa. Es la «para todo».
  - **KR608:** otro dibujo, más robusto y orientado a medidas LT. La más dura de las tres para lastre con piedra.
- **KR50 vs KR28:** la KR50 es **H/T** (solo asfalto, silenciosa). La KR28 es **A/T** (mixta).
- **KR601 (R/T) vs KR29 (M/T):** la R/T es mitad carretera y mitad campo, con 3 lonas en el costado. La M/T es barrosa: lodo y trocha pesada, más ruidosa en asfalto.
- **CT60 A/S vs A/T Trail:** la CT60 es 100 % asfalto (H/T de SUV). La Trail sale al lastre.

### 1.9 «¿Esta sirve para lodo / montaña / lastre?» (~60 conversaciones)

| Uso del cliente | Tipo | Falken | Kenda | Winrun |
|---|---|---|---|---|
| 100 % ciudad y carretera, auto | Turismo | ZE310R | KR203 (confort), KR41 (lluvia/deportivo) | R380, R330 |
| 100 % asfalto, SUV | H/T / Turismo SUV | Ziex CT60 A/S | KR50, KR605, KR15 | Maxclaw H/T2 |
| Ciudad + lastre los fines de semana, SUV | A/T suave | Wildpeak A/T Trail | KR628 | Maxclaw A/T |
| Camioneta mixta (Hilux, D-Max, BT-50) | A/T | Wildpeak A/T4W | KR628 / KR608 / KR28 | Maxclaw A/T |
| Lastre con piedra, finca, look agresivo | R/T | Wildpeak R/T01 | KR601 Klever R/T | Maxclaw R/T |
| Lodo, trocha, cantera | M/T | Wildpeak M/T | KR29, KR629 | MT305 |
| Furgoneta, van, carga | Comercial C | — | KR33, KR33A, KR100 | — |
| Camión liviano 7.00R15/16 | Comercial | — | KR12 | — |

**Nunca** recomendar una llanta de turismo (ZE310R, KR20, KR203) para montaña, piedra o una camioneta de uso mixto. Pasó en c3, c18504 y c40755.

### 1.10 «¿Cuál agarra mejor en lluvia?» (~19 conversaciones)

- **Auto:**
  - ✅ **Falken ZE310R:** frenado en mojado clase **A** en la etiqueta europea, la mejor nota posible.
  - ✅ **Kenda KR41 Emera A1:** mojado **B**; en pruebas de Auto Bild frenó apenas 1,9 % más largo que las premium.
  - ✅ **Winrun R380:** mojado **B**.
  - ✅ **Kenda KR203 y Winrun R330:** mojado **C**.
  - ⚠️ **Kenda KR20 Kaiser:** **mala fama en lluvia**. Los dueños le dan 4,6/10 en mojado y quedó 41.ª de 50 en un frenado de Auto Bild 2012. Si el cliente maneja mucho con lluvia, ofrecer KR41 o KR203 en vez de KR20.
- **Camioneta:**
  - ✅ **Falken A/T4W:** frenó ~8 % mejor en mojado que la BFG KO3 (Tire Rack 2024).
  - ✅ **Kenda KR601:** 4,6/5 en lluvia según dueños.
  - Regla general: una M/T siempre frena peor en asfalto mojado que una A/T.

### 1.11 «¿De qué año son?» / «¿Me pasa el DOT?» (~20 conversaciones; nunca se respondió)

> El año viene en el costado: los últimos 4 números del DOT son semana y año. Por ejemplo, **2325 = semana 23 de 2025**. Una llanta sin uso y bien guardada se considera nueva hasta 5 años desde su fabricación. Le confirmo el DOT exacto de su juego antes de que venga.

❓ Pedirle a Depot el rango de DOT del stock («todo nuestro stock es 2025–2026»). Con eso el bot puede responder sin mandar al cliente a la tienda. Ver sección 8.

### 1.12 «¿Puedo poner una más alta / más ancha?» (~60 conversaciones)

> Sí, si el diámetro total no cambia más de ±3 % respecto a la original. Si cambia más, se altera el velocímetro y el ABS, y puede rozar el guardafango.

Fórmula, ejemplos y reglas del ancho de aro en la sección 9.

### 1.13 Otras rápidas

| Pregunta | Respuesta |
|---|---|
| «¿La Falken Wildpeak es solo para 4x4?» | No. La A/T4W va en camionetas 4x2 y 4x4. La A/T Trail está hecha para SUV y crossover. |
| «¿Viene con aro?» | No. La cotización es de las llantas. El aro no está incluido. |
| «¿Se puede poner run-flat en estas?» | Run-flat no se «instala»: la llanta tiene que venir fabricada así. Si el carro trae sistema run-flat en el aro (inserto), un asesor revisa si puede usar llanta normal. |
| «¿Son tubeless?» | Sí, todas las de auto y camioneta. Algunas de camión (7.00R16) pueden ir con tubo. |
| «¿Son reencauchadas?» | No, todas son nuevas. El reencauche no se recomienda en auto ni camioneta. |
| «¿Cuál gasta menos combustible?» | Las de baja resistencia: Falken ZE310R/ZE914 Ecorun («Ecorun» = ahorro), Kenda KR203 Kenetica **Eco**. Las M/T y R/T gastan más. |
| «¿Es dura o suave?» | H/T y turismo son suaves y silenciosas. A/T intermedias. R/T y M/T más duras y ruidosas. Una LT de 10 lonas se siente más dura que una XL o una P. |
| «¿La A/T suena?» | Poco. 🏪 Un asesor: «Si fuera la Falken R/T o la M/T claro que sonaría, pero al ser A/T no va a tener problema». |
| «¿Qué presión?» | La de la etiqueta del marco de la puerta, en frío. En Quito no hay que corregir por altura (sección 11). |
| «¿Nitrógeno?» | ❓ Confirmar si Depot lo da. Técnicamente la ventaja es pequeña: pierde presión un poco más lento. |
| «¿Qué marcas manejan?» | Llantas **Falken, Kenda y Winrun**. Sunoco y Eurolub son **lubricantes**, no llantas. |
| «¿Reparan aros?» | Lo revisa el técnico según el golpe; no se promete por chat. |
| «¿Con qué aceite es la promo?» | Sunoco. |
| «¿Ustedes son de dónde?» | Depot Tire, Quito, desde 1996. Locales en Cumbayá y Quito Sur. |

---

## 2. Las marcas

### 2.1 Resumen

| | **Falken** | **Kenda** | **Winrun** | **Giti** |
|---|---|---|---|---|
| Nivel en Depot | 🏪 Premium | 🏪 Intermedia | 🏪 Económica | 🏪 Intermedia (aún no se cotiza) |
| País de la marca | Japón | Taiwán | China | Singapur (origen indonesio) |
| Dueño | Sumitomo Rubber Industries (Kobe) | Kenda Rubber Industrial Co. (Yuanlin) | Winrun Tyre / Yingrun Tire (Guangzhou) | Giti Tire (familia Lim) |
| Fundada | 1983 (Ohtsu); Sumitomo desde 2003 | 1962 | ⚠️ ~1992 (no confirmado) | 1951 (Gajah Tunggal, Indonesia) |
| Ranking mundial 2026 (Tyrepress) | **#8** (Sumitomo) | ~#29 | fuera del top 75 | #14 |
| Fábricas | Japón (4), Tailandia, Turquía, Indonesia, China, Brasil, Sudáfrica | Taiwán, China, Vietnam, Indonesia | China (plantas no publicadas) | China, Indonesia, EE. UU. |
| Garantía fábrica en Depot | 🏪 5 años | 🏪 5 años | 🏪 5 años | ❓ |
| Seguro Depot | 🏪 hasta 18 meses | 🏪 hasta 12 meses | 🏪 hasta 6 meses | ❓ |
| Km promedio Depot | 🏪 ~86.500 | 🏪 ~68.500 | 🏪 ~58.000 | ❓ |
| Frase de venta | «Japonesa: tecnología y control de calidad japonés» | «Taiwanesa, más de 60 años fabricando llantas, presencia mundial» | «La de entrada, con 5 años de garantía de fábrica» | — |

### 2.2 Falken

- **Historia:** nació en **1983** como marca de alto rendimiento de Ohtsu Tire & Rubber (Japón). **Sumitomo Rubber Industries** se alió con Ohtsu en 1981 y la absorbió en **2003**. Sumitomo es la misma empresa que fabrica **Dunlop** en Japón y Asia.
- **Tamaño:** Sumitomo es el **8.º fabricante de llantas del mundo** (Tyrepress 2026), con ~€5.700 millones en ventas de llantas. En el ranking de Tire Business 2025 es 6.º.
- **Fábricas:**
  - Japón: Shirakawa, Nagoya, Izumiohtsu y Miyazaki.
  - **Tailandia** (Amata City): la más grande para exportación.
  - Turquía (Çankırı), Indonesia, China, Brasil y Sudáfrica.
  - La planta de EE. UU. (Tonawanda) **cerró en nov-2024** y su producción pasó a Tailandia.
  - La planta se asigna **por medida, no por línea**: un mismo modelo puede venir de dos países.
  - Los dueños en EE. UU. reportan las Wildpeak A/T3W mayormente de Tailandia y algunas de Japón.
- **De fábrica en autos (OE):**
  - Jeep Gladiator 2020: Wildpeak A/T3W.
  - Mazda CX-90: Ziex CT60 A/S.
  - Falken lista además el Ford Bronco Sport y el Porsche Macan.
  - ⚠️ Según un retailer, también en algunos Toyota 4Runner, Tacoma y Tundra y en el RAM 1500.
- **Competición:**
  - Corre las 24 Horas de Nürburgring desde 1999; podio (3.º) en 2015.
  - En 2026 ganó la clase Trophy Truck del NORRA 1000 (Baja) con una Wildpeak M/T de carrera.
- **Qué decir:**
  > Falken es japonesa, del grupo Sumitomo, el octavo fabricante de llantas del mundo. Su Wildpeak A/T4W salió primera en el comparativo all-terrain 2025 de Tyre Reviews.
- **Cuidado:** algunas líneas tienen versión regional distinta (A/T3W de EE. UU. vs A/T3WA de Europa/Asia; ZE310R de Asia vs ZE310 europeo). Antes de citar una prueba, confirmar que es la misma versión.

### 2.3 Kenda

- **Historia:** fundada en **1962 en Yuanlin, Taiwán**. Empezó con llantas de bicicleta, siguió con moto (1970) y radiales de auto desde 2001. Cotiza en la bolsa de Taiwán. Tiene más de 13.000 empleados y ventas de más de US$1.000 millones.
- **Tamaño:** ~29.º en Tyrepress 2026 y 31.º en Tire Business 2025. Es grande en bicicleta, moto, ATV y remolque, y mediana en auto.
- **Fábricas:** Taiwán (Yuanlin, Yunlin), China (Shenzhen, Tianjin, Kunshan/Shanghai), Vietnam (Đồng Nai, dos plantas) e Indonesia (West Java). ❓ No se confirmó cuál hace cada modelo de auto: leerlo en el costado.
- **Centros técnicos:** **Akron, Ohio (EE. UU.)** desde 2014, donde se diseñan las líneas nuevas para América (la Klever A/T2 se diseñó ahí), y un centro técnico en Europa desde 2016.
- **Competición:** Formula Drift desde 2023 y World Racing League. Las Klever R/T y M/T llevan el sello «Podium2Pavement».
- **Reputación honesta:**
  - **En 4x4 es fuerte:** Klever R/T 4,7/5 (705 reseñas), A/T2 4,6/5 (270), M/T2 4,5/5 (46).
  - **En auto de pasajero está al nivel de las buenas chinas**, por debajo de Hankook o las japonesas. La Kaiser KR20 y la Komet KR23 tienen mala fama en lluvia.
- **Qué decir:**
  > Kenda es taiwanesa, con más de 60 años fabricando llantas y centro técnico en Estados Unidos. En camioneta es de las mejores en relación precio-calidad: la Klever R/T tiene 4,7 de 5 con más de 700 reseñas.

### 2.4 Winrun

- **Quién es:** empresa china con sede en **Guangzhou** (Cantón), que también es dueña de la marca **Roadclaw**. En EE. UU. la importa Winrun International (California).
- **Fábricas:** no publicadas. ⚠️ Probablemente fabrica en una o varias plantas chinas por contrato.
- **«Ingeniería alemana»:** ⚠️ **no está respaldado.** No hay centro técnico, diseño ni certificación alemana. El dato sale de que su importador para la UE es una empresa alemana. Lo que sí es real:
  - **Homologación europea (marca E)** y **etiqueta UE** registrada.
  - Datos de la etiqueta UE: R330 consumo D / mojado C (las medidas grandes nuevas B/B); R380 D / **B**; 70–72 dB.
- **Reputación:** marca de entrada (tier 3). Sin pruebas de revista independientes. ~3,9/5 con pocas reseñas de dueños. R330 y R380 tienen **UTQG 420 AA**, un dato decente para su precio.
- **Qué decir:**
  > Winrun es china, la opción de entrada. Tiene homologación europea, 5 años de garantía de fábrica y 6 meses de seguro Depot. Es para quien quiere gastar lo mínimo con respaldo.
- ❓ **Tarea fácil:** leer el código DOT de 2–3 Winrun del stock y buscarlo en NHTSA vPIC. Así se sabe la fábrica exacta y se puede responder «¿dónde la hacen?» con un dato propio.

### 2.5 Giti (aparece en el orden de marcas pero no se cotiza)

- 🏪 `conocimiento-marcas.json`: «Marca en ingreso como importación directa. **NO cotizar ni prometer condiciones** hasta tener los datos oficiales».
- **Lo que hay que saber si alguien pregunta:**
  - Sede en **Singapur**, origen indonesio (Gajah Tunggal, 1951).
  - Fábricas en China, Indonesia y EE. UU. (Carolina del Sur, 2017). Centro de I+D real en Hannover, Alemania.
  - **14.º fabricante del mundo** (Tyrepress 2026).
  - Equipo original de VW (T-Roc, T-Cross, ID. Buzz, Crafter), BYD, Chery y Jetour.
  - Marca media (tier 2), por encima de las chinas económicas.
- **Líneas en Latinoamérica:** GitiComfort, GitiSynergy, GitiControl, GitiSport, Giti4×4 (HT152, AT70, AT71, AT100), GitiVan.

---

## 3. Tabla maestra de modelos

**Notas de la tabla:**
- **Aros** = los que hay en el catálogo de Depot (ago-2026).
- **% asfalto** = estimado según el tipo, salvo donde Depot o el fabricante lo dicen.
- **3PMSF** = sello de nieve probado (montaña con copo).
- **Rival** = la llanta de otra marca más parecida.

| Marca | Código | Nombre comercial | Tipo | Para qué | % asfalto | Aros | 3PMSF | UTQG | Rival parecido |
|---|---|---|---|---|---|---|---|---|---|
| Falken | ZE310R | Ziex ZE310R Ecorun | Turismo | Auto, uso diario | 100 | 16–18 | No | 320 B A | Michelin Primacy, Bridgestone Turanza |
| Falken | ZE914 | Ziex ZE914 Ecorun | Turismo | Auto/crossover (generación anterior) | 100 | 16 | No | — | — |
| Falken | AZENIS FK520L | Azenis FK520L | UHP | Deportivo / sedán alta gama | 100 | 17–20 | No | — | Michelin Pilot Sport, Conti SportContact |
| Falken | AZENIS RT615K+ | Azenis RT615K+ | Pista | Track day | 100 | 17 | No | 200 AA | Bridgestone RE-71RS, Toyo R888R |
| Falken | ZIEX CT60 A/S | Ziex CT60 A/S | H/T SUV | SUV y crossover 100 % asfalto | 100 | 16–20 | No (M+S) | 600–740 AA | Michelin CrossClimate 2, Conti CrossContact LX25 |
| Falken | WILDPEAK A/T TRAIL | Wildpeak A/T Trail | A/T crossover | SUV ciudad + lastre | 🏪 80 | 16–20 | **Sí** | 680 AA ⚠️ | BFG Trail-Terrain, Toyo Open Country A/T III |
| Falken | WILDPEAK AT3W | Wildpeak A/T3W | A/T | 4x4 y camioneta on/off | ~60 | 17 | **Sí** | 660 A/B B | BFG KO2, General Grabber A/TX |
| Falken | WILDPEAK A/T4W | Wildpeak A/T4W | A/T | Camioneta y 4x4, on/off real | 🏪 50 | 15–20 | **Sí** | — (LT sin UTQG) | BFG KO3, Toyo Open Country A/T III |
| Falken | WILDPEAK R/T01 | Wildpeak R/T01 | R/T | 4x4: tierra, lodo, piedra con confort | ~45 | 16–20 | No | — (LT) | Toyo Open Country R/T, Nitto Ridge Grappler |
| Falken | WILDPEAK M/T | Wildpeak M/T | M/T | Lodo, piedra, trocha pesada | ~30 | 15–20 | No | — (LT) | BFG KM3, Toyo Open Country M/T |
| Kenda | KR20 | Kaiser | Turismo deportiva | Auto, look deportivo | 100 | 13–20 | No | 300 AA ⚠️ | Federal 595, Nankang NS-2 |
| Kenda | KR203 | Kenetica Eco | Turismo confort | Auto urbano, taxi/Uber | 100 | 13–16 | No | — | Hankook Kinergy Eco, Kumho Ecowing |
| Kenda | KR23 | Komet Plus | Turismo básica | Auto pequeño (descontinuada en Europa) | 100 | 14–15 | No | — | Hankook Optimo |
| Kenda | KR26 | Vezda AST ⚠️ | Turismo HP | Auto de pasajeros | 100 | 15, 17 | No | — | Nankang NS-20 |
| Kenda | KR41 | Emera A1 | UHP | Deportivo/sedán, **la mejor Kenda en lluvia** | 100 | 16–18 | No | — | Hankook Ventus Prime, Nexen N'Fera |
| Kenda | KR32 | Kuavela SL | Turismo HP confort | Sedán aro grande, la más silenciosa (67 dB) | 100 | 17, 19 | No | — | Maxxis Premitra HP5 |
| Kenda | KR605 | Emera SUV | Turismo SUV | SUV moderna 100 % asfalto | 100 | 17–22 | No | trac. B, temp. A | Nexen N'Fera RU1 |
| Kenda | KR15 | Klever H/P | H/T | SUV/4x4 carretera, tierra ligera | 95 | 15 | M+S | 400 A A | Maxxis HP-600 Bravo |
| Kenda | KR50 | Klever H/T | H/T | SUV y camioneta 100 % asfalto | 90 | 16–19 | — | 500 (235/55R18) | Hankook Dynapro HT, General Grabber HTS |
| Kenda | KR28 | Klever A/T | A/T (1.ª gen.) | Camioneta/4x4 mixto, prioriza confort | 70 | 15–17 | No | 660 A B | Maxxis Bravo AT-771, General Grabber AT2 |
| Kenda | KR628 | Klever A/T2 | A/T (2.ª gen.) | SUV, camioneta, 4x4 — **la «para todo»** | 65 | 15–20 | **Sí** | 560 A B | General Grabber A/TX, Hankook Dynapro AT2 |
| Kenda | KR608 | Klever A/T (KR608) | A/T robusta | Camioneta, medidas LT reforzadas | 60 | 16–19 | — | — (LT) | Maxxis AT-980E |
| Kenda | KR601 | Klever R/T | R/T | 4x4 tierra/piedra/lodo + carretera | 50 | 15–18 | No (M+S) | — (LT) | Nitto Ridge Grappler, Toyo R/T |
| Kenda | KR29 | Klever M/T | M/T | Lodo, cantera, trocha | 30 | 15–17 | No | — (LT) | Maxxis Bighorn MT-762 |
| Kenda | KR629 | Klever M/T2 | M/T (2.ª gen.) | Lodo y off-road extremo | 30 | 17, 20 | No | — (LT) | Maxxis Razr MT, BFG KM3 |
| Kenda | KR33 | Komendo | Comercial C | Furgoneta y van de reparto | 95 | 13–15 | No | — | Hankook Vantra LT |
| Kenda | KR33A | Komendo (carga alta) | Comercial C | Van con más carga | 95 | 14–16 | No | — | Maxxis Vansmart |
| Kenda | KR100 | Komendo 2 | Comercial C | Furgoneta y van | 95 | 14–16 | No | — | Hankook RA08, Kumho 857 |
| Kenda | KR12 | (sin nombre comercial) ⚠️ | Camión liviano, costillas | Camión liviano / carga | 90 | 15–16 | No | — | Bridgestone R202 |
| Winrun | R380 | R380 | Turismo | Sedán, compacto, SUV pequeña | 100 | 13–18 | No | 420 AA | — |
| Winrun | R330 | R330 | UHP | Auto/SUV deportivo, aros grandes | 100 | 13–20 | No | 420 AA | — |
| Winrun | MAXCLAW H/T2 | Maxclaw H/T2 | H/T | SUV y camioneta de carretera | 90 | 16–20 | No | — | — |
| Winrun | MAXCLAW A/T | Maxclaw A/T | A/T | Camioneta y SUV mixto | 65 | 14–20 | ⚠️ | — | — |
| Winrun | MAXCLAW R/T | Maxclaw R/T | R/T | 4x4 mixto, look agresivo | 50 | 16–17 | No | — (LT) | — |
| Winrun | MT305 | MT305 | M/T | Off-road, lodo, piedra | 30 | 17, 20 | No | — (LT) | — |

**Nombres comerciales que usan los clientes:**
- «Kenda Klever» = toda la familia 4x4 de Kenda (KR15, KR50, KR28, KR608, KR628, KR601, KR29, KR629). 🏪 Un asesor cotizó «Klever AT» y «Klever RT» como KR628/KR601.
- «Kinetica» o «Kenetica» = **KR203** (Kenetica Eco).
- «Kenda Cross» ❓ no es un nombre oficial de Kenda. Probablemente se refiere a una Klever A/T.
- «Wildpeak» = toda la familia 4x4 de Falken.
- «Ziex» = turismo y SUV de asfalto de Falken.
- «Azenis» = deportivas de Falken.
- «Maxclaw» = familia 4x4 de Winrun.
- **«A/T3WA»** = versión europea y asiática de la A/T3W. Es la misma familia, y Depot tiene la A/T3W.

---

## 4. Fichas por modelo

Formato de cada ficha:
- **Es:** qué llanta es.
- **Bueno:** fortalezas.
- **Ojo:** debilidades o advertencias.
- **A quién:** a qué cliente ofrecerla.
- **Frase:** lista para mandar al cliente.

### 4.1 Auto de pasajeros (turismo)

#### Falken Ziex ZE310R Ecorun — turismo premium
- **Es:** llanta de verano para auto y SUV pequeña, sucesora de la ZE914. «Ecorun» = baja resistencia a la rodadura (ahorra combustible).
- **Tecnología:** compuesto 4D Nano Design y ACP (presión de contacto pareja). Falken dice **+30 % de vida** frente a la ZE914.
- **Bueno:** ✅ **frenado en mojado clase A** en la etiqueta europea (la mejor nota). Cómoda y silenciosa. UTQG 320 B A (🏪 ficha que mandó el asesor).
- **Ojo:** consumo C–E en la etiqueta UE. En la prueba de Auto Express fue segura, pero no de las de más agarre. **No es para montaña, piedra ni camioneta.**
- **A quién:** auto mediano que quiere marca japonesa y buen agarre en lluvia (Corolla, Sentra, Mazda 3, Elantra, Cerato).
- **Frase:**
  > Es la Falken de auto: japonesa, con la mejor nota posible en frenado sobre mojado en la etiqueta europea y unos 86.500 km de rendimiento promedio.

#### Falken Ziex ZE914 Ecorun — generación anterior
- **Es:** touring de verano (~2012), reemplazada por la ZE310.
- **Ojo:** en pruebas de revista quedó a media tabla, con frenado en mojado «moderado». Si hay ZE310R al mismo precio, es mejor la ZE310R.
- **A quién:** solo si es la única en la medida.

#### Kenda KR203 Kenetica Eco — turismo confort
- **Es:** turismo para uso urbano, sucesora de la KR23. Dibujo asimétrico con 4 canales.
- **Etiqueta UE:** consumo D, **mojado C**, **68 dB** (silenciosa).
- **Bueno:** cómoda, silenciosa, buena para taxi, Uber y ciudad. Medidas de auto chico (Aveo, Sail, Spark, Rio, Accent).
- **Ojo:** casi no hay pruebas independientes.
- **A quién:** el cliente que quiere algo cómodo y económico para ciudad.
- **Frase:**
  > Es la Kenda de confort para ciudad: silenciosa y suave, pensada para el día a día.

#### Kenda KR20 Kaiser — turismo deportiva
- **Es:** deportiva de verano con dibujo direccional en «V» (los clientes la llaman «espina de pescado»). Aros 13 a 20.
- **Bueno:** precio, look deportivo, buen agarre en seco, dura bastante. UTQG ~300 AA ⚠️.
- **Ojo:** ⚠️ **mala fama en lluvia**: los dueños le dan 4,6/10 en mojado y quedó 41.ª de 50 en un frenado de Auto Bild 2012. Es la Kenda más cotizada por el bot, pero no es la mejor para Quito con lluvia. **No es para camioneta ni piedra** (c18504, c40755).
- **A quién:** el que busca estética deportiva barata. A quien maneja mucho con lluvia, ofrecerle **KR41** o **KR203**.

#### Kenda KR41 Emera A1 — UHP, la mejor Kenda en lluvia
- **Es:** deportiva de verano, asimétrica, compuesto de alta sílice, casi todas XL. Hecha en Taiwán.
- **Bueno:** ✅ **mojado B** en la etiqueta UE. En pruebas frenó 1,9 % más largo que las premium y 10 % más corto que las económicas.
- **Ojo:** 70 dB, algo ruidosa.
- **A quién:** sedán o auto deportivo que quiere agarre a precio Kenda.

#### Kenda KR32 Kuavela SL — confort silenciosa
- **Es:** turismo de confort, **67 dB**: la más silenciosa del catálogo Kenda. Mojado C, consumo D.

#### Kenda KR23 Komet Plus — básica (descontinuada en Europa)
- **Es:** turismo básica de auto chico. Kenda Europa la reemplazó por la KR203.
- **Ojo:** reseñas flojas (el 43 % de los dueños la volvería a comprar). Vender lo que quede y migrar a la KR203. ⚠️ No prometer reposición.

#### Kenda KR26 Vezda AST ⚠️
- **Es:** turismo de verano «high performance», modelo viejo (~2011). Nombre confirmado solo con fuentes europeas.
- ❓ Confirmar con el importador si sigue en producción.

#### Winrun R380 — turismo de entrada
- **Es:** touring con sílice para sedán y compacto, aros 13–18.
- **Bueno:** ✅ **mojado B** en la etiqueta UE (mejor que varias de más precio). UTQG 420 AA. Cómoda.
- **Ojo:** consumo D; pocas reseñas.
- **A quién:** el cliente de precio que igual quiere agarre en lluvia (Aveo, Sail, Spark, Picanto, Rio).

#### Winrun R330 — UHP de entrada
- **Es:** deportiva para auto y SUV con aro grande. Hay versión run-flat.
- **Datos:** UTQG 420 AA. Etiqueta UE D/C en medidas viejas y **B/B** en medidas grandes nuevas.
- **Ojo:** ruido a alta velocidad.
- **A quién:** aro 17–20 al menor precio.

### 4.2 Deportivas

#### Falken Azenis FK520L — UHP insignia
- **Es:** la deportiva de verano tope de Falken (2023), sucesora de la FK510 (n.º 1 en desgaste en el ADAC 2022). Aros 17–20, ZR. ⚠️ Según Falken Asia, hecha en Japón.
- **Pruebas** (de la FK520, hermana de la L): Auto Bild 2023, 8.ª de 21.
- **A quién:** BMW, Audi, Mercedes o sedán de alta gama.

#### Falken Azenis RT615K+ — de pista
- **Es:** semi-slick homologada para la calle. **UTQG 200 AA**: dura poco (~30.000 km ⚠️) y es floja en mojado.
- **A quién:** solo para entusiastas de track day. **No recomendarla para uso diario en Quito.**

### 4.3 SUV de asfalto (H/T y turismo SUV)

#### Falken Ziex CT60 A/S — SUV 100 % asfalto
- **Es:** all-season para crossover y SUV. Fue la primera Falken diseñada específicamente para crossover (2017). Es equipo original del **Mazda CX-90**.
- **Datos:** UTQG **600–740 AA**. En EE. UU. tiene garantía de 65.000 millas (no aplica aquí).
- **Bueno:** buen agarre en seco y mojado, resiste el aquaplaning. Más silenciosa y eficiente que cualquier A/T.
- **A quién:** Tucson, Sportage, RAV4, CX-5 o Creta que **no** sale del asfalto. Si sale al lastre, la A/T Trail.

#### Kenda KR50 Klever H/T — SUV y camioneta de carretera
- **Es:** 4 canales anchos y muchas laminillas. En otros mercados la reemplazan la KR605 (Europa) y la KR600 H/T2 (EE. UU.).
- **Dato:** 🏪 treadwear 500 en 235/55R18.
- **A quién:** Hilux, D-Max o BT-50 que andan **solo en asfalto**. Si hacen lastre, la KR628.

#### Kenda KR605 Emera SUV — SUV moderna de asfalto
- **Es:** turismo para SUV con aros 17–22, XL en varias medidas. Etiqueta UE C–D / mojado C / 70 dB.
- **Dato:** 🏪 215/60R17 = 96H, tracción B, temperatura A.
- **Ojo:** **no es para lastre frecuente.**
- **A quién:** SUV urbana con aro grande (Tucson, Sportage, CX-5, Jetour, Tiggo).

#### Kenda KR15 Klever H/P
- **Es:** SUV de carretera, **M+S**, UTQG **400 A A** (tracción A en mojado). Cómoda y silenciosa.
- **Ojo:** velocidad S/T, solo aro 15. Modelo viejo.
- **A quién:** Vitara, Grand Vitara o SUV clásica con aro 15.

#### Winrun Maxclaw H/T2
- **Es:** H/T simétrica con compuesto all-season, para uso 90 % carretera. Sin reseñas independientes.
- **A quién:** SUV o camioneta de asfalto al menor precio.

### 4.4 Uso mixto (A/T)

#### Falken Wildpeak A/T Trail — A/T para SUV y crossover
- **Es:** la primera A/T de Falken para crossover (2019), construida sobre base de llanta de carretera. 🏪 Uso **80 % asfalto / 20 % tierra**.
- **Tecnología:** laminillas 3D Canyon. ✅ **3PMSF** (pasó la prueba de nieve). Solo en medidas P y XL (no LT).
- **Datos:** UTQG 680 AA ⚠️ (varía por medida). 4,7/5 con 129 reseñas en SimpleTire.
- **Bueno:** cómoda y silenciosa para ser A/T. Lastre, camino de tierra, lodo ligero.
- **Ojo:** no es para roca ni lodo profundo. Baja un poco el rendimiento de combustible.
- **A quién:** **Sportage, Tucson, RAV4, Grand Vitara, Creta, X-Trail, Duster** que salen al lastre o a la finca los fines de semana.
- **Frase:**
  > Es la all-terrain de Falken pensada para SUV: se siente como llanta de carretera en la ciudad, pero aguanta lastre y tierra el fin de semana.

#### Falken Wildpeak A/T4W — la A/T de camioneta (estrella)
- **Es:** la all-terrain nueva de Falken (ene-2024), sucesora de la A/T3W. 🏪 Uso **50 % asfalto / 50 % tierra**. 96 medidas de 15" a 22", en P, XL y LT.
- **Qué cambió frente a la A/T3W:**
  1. Banda más rígida: mejor para remolcar y en seco.
  2. **Costado DURASPEC de 3 capas** en medidas seleccionadas.
  3. Laminillas a profundidad completa: agarra hasta el final.
  4. Heat Diffuser actualizado (disipa calor con carga).
  5. Más medidas LT.
  6. El dibujo es casi igual.
- **Pruebas:**
  - ✅ **N.º 1 en el comparativo all-terrain 2025 de Tyre Reviews.**
  - ✅ Tire Rack 2024: frenó **~8 % mejor en mojado** y también mejor en seco que la **BFGoodrich KO3**. La KO3 le gana en nieve, que en Quito no importa.
  - 🏪 Comparativa que mandó un asesor: Falken A/T4W 9,5/10 contra Cooper Discoverer Road+Trail 8,8/10.
- **Ojo:** la versión LT es más dura y más pesada que la P/XL.
- **A quién:**
  - Hilux, D-Max, BT-50, Ranger, Fortuner, Wingle, F-150.
  - Que **carga peso**: medida **LT (rango E, 10 lonas)**.
  - Fortuner o SUV sin carga pesada: **P/XL**, más cómoda.
- **Frases:**
  > Es la llanta mixta más premiada del momento: salió primera en el comparativo all-terrain 2025 de Tyre Reviews y en mojado frena mejor que la BFGoodrich KO3.

  Al que pregunta si es solo para 4x4:
  > No, va perfecta en camioneta 4x2 también.

#### Falken Wildpeak A/T3W — generación anterior de la A/T4W
- **Es:** la A/T «de culto» de Falken (2016). Equipo original del **Jeep Gladiator 2020**.
- **Datos:** 3PMSF. UTQG 660. Su versión europea (A/T3WA) quedó **2.ª de 8 en el test ADAC 2025**.
- **Frente a la BFG KO2:** más silenciosa, frena mejor en mojado, más barata. La KO2 tiene costado más duro y va mejor en roca.
- 🏪 En el inventario solo en aro 17. Si hay las dos, la A/T4W es la nueva.

#### Kenda KR628 Klever A/T2 — la A/T «para todo» de Kenda
- **Es:** A/T de 2.ª generación diseñada en **Akron (EE. UU.)**, con bloques optimizados contra el ruido.
- **Datos:**
  - ✅ **3PMSF en todas las medidas.** UTQG 560 A B.
  - Medidas P y LT de rango E (10 lonas).
  - En EE. UU. tiene garantía de 60.000 millas (no aplica aquí).
  - Reseñas: **4,6/5 con 270 reseñas**; el 95 % la volvería a comprar.
- **Bueno:** lluvia, asfalto y lastre; silenciosa para ser A/T. La mejor Kenda «para todo» en Quito.
- **Ojo:** algunos dueños reportan desgaste más rápido de lo esperado. En medida P el costado es de 2 capas.
- **A quién:** camioneta o SUV mixta que quiere algo muy cercano a la Falken por menos plata.

#### Kenda KR28 Klever A/T — A/T de 1.ª generación
- **Es:** A/T que prioriza el confort en carretera.
- **Datos:** UTQG 660 A B (medidas P). **No tiene 3PMSF.** 4,5/5 (99 reseñas); el ruido es lo peor calificado (3,9/5).
- **A quién:** el que quiere una A/T cómoda. 🏪 En el inventario hay medidas P (P245/75R16, P235/65R17, P265/65R17).
- **Ojo:** el bot dijo una vez que «no existe» (c36592). Sí existe.

#### Kenda KR608 Klever A/T (KR608) — A/T robusta
- **Es:** otro dibujo de A/T, con bloques en «K» en el costado. Resiste cortes y limpia el barro. Casi todo en medidas **LT de 6, 8 y 10 lonas** (ver Anexo A).
- **A quién:** camioneta de trabajo que hace lastre con piedra (D-Max, Hilux, BT-50, Great Wall).

#### Winrun Maxclaw A/T
- **Es:** A/T de entrada para camioneta y SUV. Sin ficha técnica ni pruebas independientes.
- **A quién:** el cliente de precio con uso mixto.

### 4.5 Campo fuerte (R/T y M/T)

#### Falken Wildpeak R/T01 — rugged terrain
- **Es:** híbrida entre A/T y M/T (2024), el «buque insignia» off-road de Falken. Centro más cerrado (menos ruido) y hombros abiertos (lodo y roca). **Costado de 3 capas** resistente a cortes. Medidas LT de rango C a F.
- **Prueba de Trail4Runner** (sobre 10): asfalto 8,5; off-road 9,0 (mejor que la A/T4W en roca y lodo); ruido 8,0 (más ruidosa que la A/T4W); durabilidad 9,0.
- **Ojo:** **sin 3PMSF**. En asfalto mojado queda por debajo de la A/T4W.
- **A quién:** el que va seguido a lastre con piedra suelta o fincas con lodo y quiere el look agresivo.
- 🏪 **No llamarla «equilibrada»**: es la opción off-road y de las más caras.

#### Kenda KR601 Klever R/T — la Kenda mejor calificada
- **Es:** rugged terrain con **costado de 3 lonas («Triple Threat») en todas las medidas**. M+S, acepta clavos.
- **Datos:**
  - Medidas LT: las 15"–16" de 6 lonas, las 17"–18" grandes de **10 lonas, rango E** (🏪 confirmado por el asesor).
  - **4,7/5 con 705 reseñas**; el 92 % la volvería a comprar. Lluvia 4,6/5.
- **Bueno:** muy resistente a cortes (lastre con piedra) y buena en lluvia para su tipo.
- **Ojo:** pesada; gasta más combustible y hace algo más de ruido que una A/T. Algunos reportan que cuesta balancearla.
- **A quién:** el 4x4 que hace campo de verdad, pero rueda en asfalto entre semana.
- **Frase:**
  > La Klever R/T es la Kenda mejor calificada: 4,7 de 5 con más de 700 reseñas. Tiene costado de 3 lonas, así que aguanta piedra.

#### Winrun Maxclaw R/T
- **Es:** R/T de entrada en medidas LT (p. ej. LT265/75R16 123/120R = rango E). Sin reseñas.

#### Falken Wildpeak M/T — barrosa
- **Es:** la primera M/T de Falken (2016). Costado DURASPEC de 3 capas, dibujo de 3 pasos para reducir ruido, Heat Diffuser. Velocidad Q (160 km/h).
- **Bueno:** de las M/T más silenciosas del mercado y con costado muy resistente. En versión de carrera ganó el NORRA 1000 en 2026.
- **Ojo:** como toda M/T, frena peor en asfalto mojado, se gasta más rápido y consume más.
- **A quién:** solo para lodo, trocha o finca. **No para el que va todos los días por la Simón Bolívar mojada.**

#### Kenda KR29 Klever M/T
- **Es:** M/T de 1.ª generación. Crestas que expulsan piedras y laminillas a profundidad completa.
- **Datos:** 🏪 en aro 16–17 grande, **10 lonas, rango E**. En aro 15 y flotación (31x10.50, 32x11.50, 33x12.50R15), **6 lonas**.
- **A quién:** lodo, cantera, trocha.
- 🏪 **Ojo:** el bot la ofreció como «equilibrio» a quien pidió A/T (c1286). Es M/T.

#### Kenda KR629 Klever M/T2
- **Es:** M/T de 2.ª generación con bloques entrelazados, 3 lonas, protector de aro y menos ruido que la KR29.
- **Datos:**
  - **4,5/5 (46 reseñas)**: seco 4,9, lluvia 4,7, ruido 3,7.
  - Rango E (10 lonas); 🏪 en 35x12.50R20 son **12 lonas**.
- **A quién:** off-road extremo, camionetas levantadas.

#### Winrun MT305
- **Es:** M/T de entrada en medidas grandes (35x12.50R17, 33x12.50R20). Una sola reseña.
- **A quién:** el que quiere look barroso al menor precio.

### 4.6 Comercial y carga

#### Kenda KR33 / KR33A Komendo — van y furgoneta
- **Es:** llanta comercial «C» de verano, estable con y sin carga.
- **Datos:**
  - Etiqueta UE: KR33 consumo D / mojado C / 69 dB; KR33A D / C / 70 dB.
  - **KR33A** = la misma Komendo en medidas con **índice de carga más alto** (p. ej. 235/65R16C 121/119R, 225/75R16C de 12 lonas).
  - 🏪 225/70R15C KR33A = 8 lonas.
- **A quién:** H1, H100, JAC, Foton, Chevrolet N300 / N400, furgoneta escolar.

#### Kenda KR100 Komendo 2
- **Es:** van de uso urbano y autopista. Perfil plano y hombros grandes para más carga y desgaste parejo. 🏪 8 o 10 lonas según la medida (Anexo A).

#### Kenda KR12 — camión liviano ⚠️
- **Es:** de costillas (rib), en 7.00R15 (12 lonas), 6.50R16 (12 lonas) y 7.00R16 (10 lonas).
- ⚠️ Sin nombre comercial confirmado. ❓ Pedir la ficha al importador.
- **A quién:** camión liviano de carga (Isuzu NLR/NPR, Hino pequeño). Pregunta clave: ¿con tubo o sin tubo?

---

## 5. ¿Cuál le recomiendo?

### 5.1 Las 3 preguntas antes de recomendar
1. **¿Qué vehículo?** Si no tiene la medida, pedir **foto del costado** o de la etiqueta de la puerta.
2. **¿Por dónde anda?** Ciudad, carretera, lastre, lodo, ¿carga peso?
3. **¿Qué prioriza?** Precio, duración o agarre en lluvia.

### 5.2 Por vehículo (los más nombrados por los clientes)

| Vehículo | Uso típico | Económica | Equilibrio | Premium |
|---|---|---|---|---|
| Suzuki Vitara / Grand Vitara / SZ (~90 menciones) | Ciudad + lastre | Maxclaw A/T | KR628 / KR15 (aro 15) | Wildpeak A/T Trail (asfalto: CT60) |
| Chevrolet D-Max (31) | Trabajo + lastre | Maxclaw A/T | KR628 / KR608 LT | Wildpeak A/T4W (LT si carga) |
| Chevrolet Aveo / Aveo Family (31) | Ciudad | R380 | KR203 | ZE310R (si hay medida) |
| JAC T8 / Great Wall Wingle-Poer (42) | Trabajo | Maxclaw A/T | KR628 / KR608 | A/T4W |
| Hyundai Tucson / Kia Sportage (36) | Ciudad (+ lastre) | R380 / Maxclaw H/T2 | KR605 / KR628 | CT60 A/S (asfalto) · A/T Trail (lastre) |
| Chevrolet Sail / Kia Soluto / Rio (40) | Ciudad, taxi | R380 | KR203 | ZE310R |
| Toyota Hilux (11) / Fortuner (9) | Mixto / carga | Maxclaw A/T | KR628 | A/T4W (LT en Hilux de trabajo) |
| Renault Duster / Chery Tiggo / Creta (32) | Ciudad + lastre | R380 | KR628 / KR605 | A/T Trail / CT60 |
| Ford Ranger / Mazda BT-50 (20) | Mixto | Maxclaw A/T | KR628 | A/T4W |
| Hilux, Wrangler o 4x4 de campo serio | Lodo o piedra | Maxclaw R/T / MT305 | KR601 / KR29 | R/T01 / Wildpeak M/T |
| Furgoneta (H1, Foton, JAC van) | Carga | — | KR33A / KR100 | — |

Medidas de fábrica en el **Anexo B**. ⚠️ Esa tabla no está verificada versión por versión: si hay duda, pedir foto del costado.

### 5.3 Casos reales de clientes y qué contestar

- **«Hilux 2019 4x2, más grandes en M/T o R/T con el mismo aro 16, que no tope»:** subir de 265/70R16 a 265/75R16 es +3,6 % de diámetro. Ya se sale del ±3 %: avisar que el velocímetro marcará ~3–4 % menos y revisar el roce en el taller. Opciones R/T: KR601 o Falken R/T01 LT265/75R16 (rango E).
- **«D-Max 245/75R16, quiero la más alta, 245/80R16»:** 245/75R16 = 774 mm y 245/80R16 = 798 mm, o sea **+3,2 %**. Está en el límite: avisar del velocímetro y revisar el guardafango.
- **«Glory 560 aro 17, ¿se puede más ancha? Las originales me patinan»:** subir ~10 mm de ancho manteniendo el diámetro está bien si el aro lo permite. Pero que patine suele ser **compuesto o desgaste**, no ancho: ofrecer una llanta con mejor mojado (KR41, ZE310R).
- **«Tucson Hybrid 2026, ¿algún inconveniente con Kenda?»:** ninguno, siempre que el índice de carga y velocidad sea **igual o mayor** que el de fábrica (las híbridas pesan más: cuidar el índice de carga, a veces XL).
- **«Jeep Cherokee WK con sistema run-flat»:** 🏪 lo vio el asesor: el inserto está en el aro, así que se puede usar llanta normal. Revisarlo en el taller.
- **«Mazda CX-5 225/65R17 102V: ¿japonesa o tailandesa?»:** Falken es marca japonesa. Esa medida puede venir de Japón o de Tailandia según el lote, y se confirma en el costado.
- **«Hago topografía y viajo todo el país, ¿qué tal en durabilidad?»:** A/T4W o KR628, con las cifras de km de Depot y el mantenimiento cada 10.000 km incluido.
- **«Busco durabilidad, las que tengo las cambio a los 80.000»:** Falken ~86.500 km promedio. Decir que es aproximado y depende del uso.

---

## 6. Contra las marcas que no vendemos

Reglas:
1. **No hablar mal** de la otra marca.
2. Dar el dato concreto que favorece a la nuestra.
3. Si la otra es mejor en algo, reconocerlo.

**¿De dónde es cada una?**

| Marca | País / dueño | Nivel | En una línea |
|---|---|---|---|
| Michelin | Francia | Premium | La referencia en duración y agarre; la más cara |
| BFGoodrich | EE. UU. (Michelin) | Premium 4x4 | El ícono A/T (KO2/KO3) y M/T (KM3) |
| Bridgestone | Japón | Premium | Calidad pareja; fuerte de fábrica |
| Firestone | EE. UU. (Bridgestone) | Media | Segunda marca de Bridgestone |
| Goodyear / Cooper | EE. UU. | Premium | Wrangler; Cooper es de Goodyear desde 2021 |
| Continental | Alemania | Premium | Líder en frenado en mojado; la que de verdad es «ingeniería alemana» |
| General Tire | EE. UU. (Continental) | Media | Grabber A/T muy bien valorada; ⚠️ un cliente dijo «Made in Ecuador» (Continental tuvo planta en Cuenca) |
| Pirelli | Italia | Premium | Deportiva / UHP |
| Yokohama | Japón | Premium-media | Geolandar en 4x4 |
| Toyo | Japón | Premium-media | Open Country muy respetada |
| Hankook | Corea | Media-alta | De fábrica en marcas alemanas |
| Kumho / Nexen | Corea | Media | Correctas |
| Maxxis | Taiwán (Cheng Shin) | Media | La «prima» de Kenda: también taiwanesa, fuerte en moto y 4x4 |
| Linglong / Triangle / Sailun / Westlake | China | Económica | Chinas grandes; Sailun y Linglong están subiendo |
| Hifly, Sunfull, Habilead, Milanza, Fireland… | China | Económica | Chinas de bajo precio |

**Comparativas listas:**

- **«¿BFGoodrich KO2/KO3 o Falken?»**
  > La Falken Wildpeak A/T4W salió primera en el comparativo all-terrain 2025 de Tyre Reviews. En la prueba de Tire Rack 2024 frenó cerca de 8 % mejor en mojado que la KO3, y es más silenciosa y cómoda. La BFG es más dura de costado y gana en roca y nieve, pero para Quito, con lluvia, la Falken rinde mejor, y cuesta menos.

  🏪 Un asesor ya mandó la reseña «BFGoodrich KO3 vs Falken AT4W».
- **«Las BFG KO2 son muy duras, quiero algo más suave»:** A/T4W en P/XL o la A/T Trail. Las dos son más cómodas que la KO2.
- **«¿Maxxis o Kenda?»**
  > Las dos son taiwanesas y de nivel parecido. En camioneta, la Kenda Klever R/T tiene 4,7 de 5 con más de 700 reseñas y la Klever A/T2 tiene sello de nieve 3PMSF en todas sus medidas.

  El bot dejó a un cliente sin respuesta en c7595.
- **«¿Falken es mejor que Toyo?»:** las dos son japonesas y de nivel parecido. La A/T4W compite de frente con la Toyo Open Country A/T III, y la Falken suele ser más económica.
- **«Cooper Discoverer»:** 🏪 comparativa que mandó el asesor: A/T4W 9,5/10 contra Cooper Road+Trail 8,8/10.
- **«General Grabber AT2 agarra mejor en mojado que la BF»** (c3536): es cierto que la Grabber tiene buena fama en mojado. Nuestra alternativa equivalente es la KR628 (3PMSF) o la A/T4W.
- **«Michelin me dura 100.000 km»:** Michelin es la referencia en duración, es cierto. Falken da ~86.500 km promedio por bastante menos plata y con 18 meses de seguro contra golpes que Michelin no trae.
- **«La Continental me sale a $100–130»:** comparar lo que incluye. Aquí el precio lleva instalación, alineación, balanceo, seguro de 18/12/6 meses y mantenimiento cada 10.000 km. Preguntar si el otro precio incluye eso.
- **«Hankook»:** Hankook es buena, coreana, de fábrica en varias marcas. En auto, la Falken ZE310R tiene la nota A en mojado de la etiqueta europea.
- **«No quiero chinas»:** Falken (japonesa) o Kenda (taiwanesa).

---

## 7. Lonas, carga y velocidad

### 7.1 Cómo leer la medida

**`205/55R16 91V`**
- 205 = ancho en mm.
- 55 = alto del costado (55 % del ancho = 113 mm).
- R = radial.
- 16 = aro en pulgadas.
- 91 = índice de carga (615 kg por llanta).
- V = 240 km/h.

**`LT265/75R16 123/120S`**
- LT = camioneta de trabajo (Light Truck).
- 123 = 1.550 kg montada simple; 120 = 1.400 kg montada doble (gemelas).
- S = 180 km/h.
- Normalmente es **rango E, 10 lonas**.

**`225/70R15C 106/103Q`**
- C = comercial (van, furgoneta).

**`7.00R16 10PR`**
- Medida antigua de camión liviano: 7 pulgadas de ancho, aro 16, 10 lonas.

**`31X10.50R15LT`**
- Medida «de flotación»: 31 pulgadas de diámetro total, 10,5 de ancho, aro 15.

**`XL` (Extra Load)**
- Llanta de pasajero reforzada: más carga con más presión. No es LT.

### 7.2 Lonas = rango de carga

| Rango | Lonas | Presión máx. típica | Para qué |
|---|---|---|---|
| (P / SL) | 4 | 35–44 psi | Auto y SUV normal |
| XL | ≈ refuerzo de pasajero | 41–50 psi | SUV pesada, híbridas, aros grandes |
| **C** | **6** | 50 psi | Camioneta liviana, furgoneta |
| **D** | **8** | 65 psi | Camioneta con carga media |
| **E** | **10** | 80 psi | Camioneta de trabajo, remolque, carga |
| F | 12 | 95 psi | Carga pesada |

- Hoy «10 lonas» es una **equivalencia de resistencia**, no 10 capas reales.
- Una LT de 10 lonas solo da toda su carga inflada a la presión alta. A 35 psi carga menos.
- Una LT es más dura y más pesada que una P. Para una Fortuner o SUV sin carga, la P/XL es más cómoda.
- Si se pone llanta P en una camioneta de carga, su capacidad se divide para 1,1 (regla TRA). Para carga, siempre LT.

**Resumen por modelo** (detalle por medida en el Anexo A):

| Modelo | Lonas en el inventario |
|---|---|
| Falken Wildpeak A/T4W | P/XL en varias medidas; LT de 8 (D) y 10 lonas (E) |
| Falken Wildpeak A/T Trail | Solo P/XL (no LT) |
| Falken Wildpeak R/T01 | LT casi todo rango E (10); 33x12.50R20 rango C |
| Falken Wildpeak M/T | LT rango E (10); 30x9.50R15 rango C (6) |
| Kenda KR628 | Flotación R15 de 6 lonas; LT 16–18" de 10 lonas; 265/50R20 XL |
| Kenda KR608 | LT de 6, 8 y 10 lonas según la medida |
| Kenda KR28 | Medidas P (4 lonas) |
| Kenda KR601 | Aro 15–16 de 6 lonas; 17–18 de 10 lonas |
| Kenda KR29 | Aro 15 y flotación de 6 lonas; 16–17 de 10 lonas |
| Kenda KR629 | 10 lonas; 35x12.50R20 de 12 lonas |
| Kenda KR33 / KR33A / KR100 | 6, 8, 10 y 12 lonas según la medida (C) |
| Kenda KR12 | 10–12 lonas |
| Winrun Maxclaw A/T | LT215/75R14 rango D (8); demás P/XL |
| Winrun Maxclaw R/T / MT305 | LT rango E (10); 33x12.50R20 rango C |

### 7.3 Índice de carga (kg por llanta)

| IC | kg | IC | kg | IC | kg | IC | kg |
|---|---|---|---|---|---|---|---|
| 75 | 387 | 88 | 560 | 101 | 825 | 114 | 1180 |
| 76 | 400 | 89 | 580 | 102 | 850 | 115 | 1215 |
| 77 | 412 | 90 | 600 | 103 | 875 | 116 | 1250 |
| 78 | 425 | 91 | 615 | 104 | 900 | 117 | 1285 |
| 79 | 437 | 92 | 630 | 105 | 925 | 118 | 1320 |
| 80 | 450 | 93 | 650 | 106 | 950 | 119 | 1360 |
| 81 | 462 | 94 | 670 | 107 | 975 | 120 | 1400 |
| 82 | 475 | 95 | 690 | 108 | 1000 | 121 | 1450 |
| 83 | 487 | 96 | 710 | 109 | 1030 | 122 | 1500 |
| 84 | 500 | 97 | 730 | 110 | 1060 | 123 | 1550 |
| 85 | 515 | 98 | 750 | 111 | 1090 | 124 | 1600 |
| 86 | 530 | 99 | 775 | 112 | 1120 | 125 | 1650 |
| 87 | 545 | 100 | 800 | 113 | 1150 | 126 | 1700 |

**Regla:** nunca un índice de carga **menor** que el original; uno mayor sí se puede. Lo mismo con la velocidad.

### 7.4 Índice de velocidad

| Letra | km/h | Letra | km/h |
|---|---|---|---|
| L | 120 | S | 180 |
| M | 130 | T | 190 |
| N | 140 | H | 210 |
| P | 150 | V | 240 |
| Q | 160 | W | 270 |
| R | 170 | Y | 300 |

«ZR» en la medida = más de 240 km/h. Las M/T y R/T suelen ser Q o R (160–170 km/h), algo normal para su tipo.

### 7.5 Sellos del costado

- **M+S:** el dibujo sirve para barro y nieve. La pone el fabricante, sin prueba.
- **3PMSF** (montaña con copo): **pasó una prueba** de nieve. En Ecuador casi no hay nieve, pero indica buen compuesto para frío y mojado. La tienen la Wildpeak A/T Trail, la A/T3W, la A/T4W y la Kenda KR628.
- **UTQG** (solo pasajero, EE. UU.):
  - Desgaste (número; mayor dura más, pero solo sirve dentro de la misma marca).
  - Tracción en mojado (AA > A > B > C).
  - Temperatura (A > B > C).
- **Etiqueta UE:** consumo A–E, frenado en mojado A–E y ruido en dB. Cualquier llanta se busca en eprel.ec.europa.eu.
- **Marca E** (círculo con E y un número): homologación europea. El número es el país que homologó, **no** dónde se fabricó.
- **DOT:** cumple la norma de EE. UU.
- **INEN:** en Ecuador rige el reglamento técnico **RTE INEN 011 «Neumáticos»** (calidad y rotulado de llantas nacionales e importadas). Toda llanta que vende Depot entra legalmente al país bajo ese reglamento. ⚠️ No se confirmó qué revisión está vigente en 2026.

---

## 8. DOT, año de fabricación y «¿son nuevas?»

- **Dónde está:** en el costado, después de las letras «DOT». Los **últimos 4 dígitos = semana y año**: `1726` = semana 17 de 2026; `5116` = semana 51 de 2016.
- **Los 2–3 primeros caracteres** = la **planta**. Se buscan gratis en NHTSA vPIC y dicen la fábrica exacta.
- **El DOT completo puede estar solo en un lado.** Si no se ve la fecha, mirar el otro costado.
- **¿Cuántos años puede tener una llanta nueva?**
  - Una llanta **sin uso y bien guardada se considera nueva hasta ~5 años** (Continental, ETRTO).
  - Los fabricantes recomiendan revisión anual desde los 5 años de uso y **cambiarla a los 10 años** aunque tenga cocada. Varios fabricantes de autos dicen 6 años.
  - No hay vencimiento legal: «fecha de caducidad» no existe como tal.
- **Respuesta al cliente:**
  > Todas nuestras llantas son nuevas, no reencauchadas. El año viene en el DOT del costado. Una llanta guardada correctamente envejece muy poco: de 1 a 2 años sigue siendo nueva para todos los efectos, y la vida útil se cuenta desde que se monta.
- 🏪 El asesor sí mandó una foto con el DOT («1726») en c28447. Hacerlo **antes** de que el cliente viaje a la tienda evita perder la venta (c21106 lo pidió dos veces).
- ❓ **Pedir a Depot:** el rango de años del stock por marca, para que el bot pueda decir «todo nuestro stock Falken es 2025–2026».

---

## 9. Medidas equivalentes, aros y calce

- **Diámetro (mm) = aro × 25,4 + 2 × ancho × perfil / 100.**
- **Regla:** la nueva medida debe quedar a **±3 % del diámetro original** (ideal ±2 %, máximo aceptable 3,5 %).
- **Si se sale:**
  - El velocímetro se descalibra: una llanta 3 % más grande hace que el auto vaya a 103 cuando marca 100.
  - Afecta el ABS y el control de tracción.
  - En 4x4/AWD puede forzar la transmisión.
  - Puede rozar el guardafango.

| Original → nueva | Diámetros | Cambio | ¿Va? |
|---|---|---|---|
| 205/55R16 → 225/45R17 | 632 → 634 mm | +0,4 % | Sí (subir 1" de aro) |
| 245/75R16 → 245/80R16 | 774 → 798 mm | +3,2 % | Al límite: avisar del velocímetro |
| 265/70R16 → 265/75R16 | 777 → 804 mm | +3,4 % | Al límite: revisar roce |
| 235/70R16 → 235/75R16 | 735 → 759 mm | +3,2 % | Al límite (🏪 explicado bien en c31718) |
| 205/55R16 → 205/45R16 | 632 → 591 mm | −6,5 % | **No** (🏪 el bot no lo recomendó en c10280) |

- **Perfil:** «la que dice 65 y la que dice 60» = el alto del costado. Un número más alto da más altura, más confort y protege el aro. Un número más bajo da más precisión y es más duro. 🏪 «El 60 no hace que el aro salga más».
- **Ancho de aro:** cambiar el ancho de la llanta exige que el **ancho del aro** quede en el rango permitido para esa medida. No basta con que sea «el mismo aro 16».
  - ❌ c33834: el bot dijo «sí, sin problema» sin saber el ancho del aro.
  - Respuesta correcta:
    > Si mantiene el aro, va, siempre que el ancho del aro esté dentro del rango de esa medida. Lo revisa el técnico al montar.
- **Subir 1" de aro** (plus 1): +10–20 mm de ancho, −5 a −10 de perfil, mismo diámetro, índice de carga igual o mayor.
- **Más ancha «porque patina»:** el ancho ayuda poco. Lo que más pesa es el **compuesto y la cocada**. Si las originales están gastadas o son de mojado C, el cambio a una llanta mejor en lluvia resuelve más.
- **Cambiar solo 2 llantas:** las nuevas **van atrás** siempre, incluso en tracción delantera, para que el carro no se vaya de cola en mojado.
- **AWD y 4x4 permanente** (RAV4 AWD, Subaru, X-Trail 4WD, Tucson AWD): cambiar **las 4**, o que la diferencia de cocada sea mínima, porque si no se fuerza el diferencial.
- **No mezclar en el mismo eje** marcas, modelos o tipos (no M/T adelante y H/T atrás).
- 🏪 El sistema de Depot ya calcula equivalencias (`aplicaciones-vehiculos.json`, motor de equivalencia con tolerancia de 3 %).

---

## 10. Garantía, seguro, qué incluye, promociones y pago

### 10.1 Qué incluye el precio 🏪

- IVA y Ecovalor incluidos. Precio por unidad.
- **Instalación completa** (enllantaje), **alineación y balanceo**.
- **Seguro contra golpes y cortes/estalladuras** (hasta 18/12/6 meses).
- **Mantenimiento cada 10.000 km**, con rotación incluida.
- **Revisión del vehículo.**
- El aro **no** está incluido.

### 10.2 Garantía de fábrica vs seguro Depot 🏪

| | Garantía de fábrica | Seguro Depot |
|---|---|---|
| Qué cubre | Defectos de fabricación | Daños: golpes, cortes, estalladuras |
| Plazo | 5 años, las tres marcas | **Hasta** 18 meses Falken · 12 Kenda · 6 Winrun |
| Qué recibe el cliente | Evaluación del fabricante | Llanta nueva sin costo por la dañada |
| Quién lo evalúa | Siempre el asesor o la tienda, nunca el bot | Siempre el asesor o la tienda, nunca el bot |

❓ Exclusiones del seguro (¿rin 13?, ¿uso comercial?), requisitos (¿factura?, ¿DOT?) y si la reposición es total o prorrateada: sección 12.

### 10.3 Promociones 🏪

- **Black Friday (1–30 nov 2026):**
  - **Falken y Kenda:** −60 % en la **2.ª y 4.ª llanta**, sobre precio de lista. La 1.ª y la 3.ª van a precio de lista. Ejemplo: lista $100 → $280 por las 4. Reemplaza el −25 % habitual; si con la promo sale más caro que el −25 %, se aplica el −25 %.
  - **Winrun:** −25 %.
  - **Servicios:** −50 % en alineación, balanceo, ABC de frenos y enllantaje. Solo servicios en SUV/camioneta: alineación $30 (normal $60) y balanceo $5 c/u (normal $10).
  - **Cambio de aceite:** −40 % (Sunoco).
  - **Revisión de 7 puntos** gratis.
  - El precio que da el bot **ya tiene la promo aplicada**: no se descuenta otra vez.
- **Promo 3x4** (anuncios de octubre): ❓ el bot no la reconocía. Confirmar si sigue o terminó, con fechas.
- **Fuera de promoción:** el bot cotiza con −25 % sobre la lista.

### 10.4 Pago 🏪
- Efectivo, tarjeta y transferencia.
- Con tarjeta de crédito, **mismo precio** y diferido a **3 y 6 meses sin intereses**.
- En efectivo puede haber descuento adicional ❓ (el monto lo confirma la tienda).

### 10.5 Locales y horario 🏪
- **Cumbayá:** C.C. La del Establo y Av. Oswaldo Guayasamín. Lun–vie 8:30–17:30, sáb 8:30–14:30.
- **Quito Sur:** Galo Molina y Av. Alonso de Angulo. Lun–vie 8:30–17:30. Cerrado el fin de semana.
- Teléfono +593 98 280 1766. Depot Tire existe desde 1996.

---

## 11. Cuidado de la llanta en Quito

- **Presión:** la de la etiqueta del marco de la puerta, **en frío, donde esté**.
  - En Quito no hay que «corregir por altura».
  - Una llanta inflada en la Costa marca ~1–2 psi más al subir a Quito; al bajar, revisar de nuevo.
- **Nitrógeno:** el aire ya tiene 78 % de nitrógeno. En la prueba de Consumer Reports, con nitrógeno las llantas perdieron 2,2 psi en un año contra 3,5 psi con aire. Es una ventaja pequeña y **no tiene nada que ver con la altura**. Lo importante es revisar la presión cada mes.
- **Rotación:** cada **10.000 km** (🏪 incluida).
- **Alineación:** al montar llantas nuevas, después de un golpe fuerte en un bache, o si el carro se va de lado. En Quito, con baches y adoquín, mínimo una vez al año.
- **Balanceo:** al montar, y si el volante vibra a 80–100 km/h.
- **Cuándo cambiar:**
  - En el **testigo de desgaste (1,6 mm)**. Con lluvia es mejor a ~3 mm.
  - Por edad: revisión anual desde los 5 años y cambio a los 6–10 años.
  - ⚠️ No se confirmó el mínimo legal de cocada en la revisión técnica de Ecuador.
- **Duración típica por tipo** (rango general del sector):
  - Turismo / H/T: 50.000–80.000 km.
  - Deportiva UHP: 25.000–45.000 km.
  - A/T: 50.000–70.000 km.
  - M/T: 30.000–50.000 km.
- **Lluvia y asfalto pulido de Quito:** lo que más pesa es el agarre en mojado. Por eso, para el día a día, una A/T con buen mojado (A/T4W, KR628) va mejor que una M/T.
- **Subidas al páramo, Cotopaxi o Papallacta:** el sello 3PMSF (A/T4W, A/T Trail, KR628) suma en frío y granizo.

---

## 12. Lo que todavía falta confirmar con Depot

Son las preguntas que los clientes hicieron y que hoy nadie puede contestar con certeza. Ordenadas por impacto:

1. **País de fabricación por modelo y lote.** Mirar el «MADE IN» y el código DOT de 1–2 llantas de cada modelo del stock, sobre todo Falken (¿Japón o Tailandia?) y Winrun. Hubo clientes que no compraron por esto.
2. **Rango de años (DOT) del stock por marca.** Una frase como «todo nuestro stock es 2025–2026» basta.
3. **Seguro:** exclusiones (¿rin 13?, ¿uso comercial o taxi?), requisitos (¿factura?, ¿cuánto tiempo para reclamar?), si es reposición total y si hay un documento por escrito para el cliente. 🏪 Un cliente preguntó «¿Las garantías son por escrito?».
4. **¿Las válvulas van incluidas? ¿Inflan con nitrógeno?**
5. **Qué incluye exactamente el «mantenimiento cada 10.000 km»** (¿rotación + alineación + balanceo?), por cuánto tiempo o cuántas veces, y en qué consisten «los 7 puntos / 12 puntos» de la revisión.
6. **Promo 3x4 de octubre:** ¿sigue o terminó? ¿Con qué fechas y marcas?
7. **Descuento en efectivo:** ¿hay una regla (porcentaje) o es caso por caso?
8. **Envíos a provincia:** costo y plazo típicos (~140 conversaciones lo preguntan). 🏪 Un asesor dijo «hacemos envíos todo el tiempo».
9. **Retoma de llantas usadas como parte de pago** y convenios (Zurich Seguros, Cooperativa Isidro Ayora).
10. **Kenda KR12:** nombre comercial y ficha. **KR26:** ¿sigue en producción?
11. **Giti:** datos oficiales de seguro, km y origen antes de cotizarla.
12. **Winrun «ingeniería alemana»:** decidir si se deja de decir (recomendado).

---

## 13. Errores del bot que no hay que repetir

Pasaron en conversaciones reales (ago–nov 2026). El número `c…` es la conversación.

| Error | Lo correcto |
|---|---|
| «Kenda… sí, son de origen chino» (c7900) | Kenda es **taiwanesa**. |
| «La alineación y balanceo son servicios adicionales / van aparte» (c11, c8590) | **Están incluidos.** |
| «No le puedo prometer un kilometraje» (a unos sí y a otros no) | Dar siempre ~86.500 / 68.500 / 58.000 km como aproximado. |
| «No tengo verificado el número de lonas» (~82 conv.) | Está en el sistema: Anexo A. |
| «Generalmente entre 6 y 10 lonas» (c1288, inventado) | Dar el dato de la medida o pasar a un asesor. |
| «El DOT se verifica en la tienda, no por chat» | Explicar cómo se lee y dar el rango del stock (❓ sección 12). |
| Recomendó ZE310R (turismo) para montaña (c3) | Montaña o lastre: A/T Trail o A/T4W. |
| Recomendó KR20 para Hilux de uso mixto (c18504) y dijo que «va bien para piedra» (c40755) | KR20 es de auto deportivo; camioneta mixta: KR628. |
| Ofreció KR29 (M/T) como «equilibrio» a quien pidió A/T (c1286) | KR628 / KR28 / KR608. |
| Llamó «premium» a la KR628 y «equilibrada» a una Falken R/T de $487 | La escalera va por marca: Winrun → Kenda → Falken. |
| «¿Cuál tiene más adherencia en lluvia?» → «Perfecto, la 2.» (c36413) | Responder la pregunta (sección 1.10). |
| «Sí, sin problema porque mantienen el mismo aro» (c33834) | Depende del ancho del aro; lo revisa el técnico. |
| «La KR28 no me sale como una que exista» (c36592) | Existe: Klever A/T (P245/75R16, P235/65R17, P265/65R17). |
| No reconoció la «Wildpeak A/T3WA» (c11047) | Es la versión europea/asiática de la A/T3W, que Depot tiene en aro 17. |
| «Modelo que veo: Falken ZE310» al pedir todas las Falken (c4734) | Falken: ZE310R, ZE914, CT60, A/T Trail, A/T3W, A/T4W, R/T01, M/T, FK520L, RT615K+. |
| «Trabajamos Kenda, Falken, Sunoco y Eurolub» | Llantas Falken, Kenda y Winrun; Sunoco y Eurolub son lubricantes. |
| «¿Maxxis o Kenda?» → «Le consulto con un asesor», y nunca volvió (c7595) | Sección 6. |
| «Listo, se la ajusté a 103» (c16982, descuento inventado) | Nunca cambiar un precio sin regla. |
| «La garantía cubre cuánto tiempo…» → respondió el origen (c42424) | 5 años de fábrica + seguro hasta 18/12/6 meses. |
| Leyó una BFG LT285/70R17 como «175/65R18» (c44370) | Si la foto no es clara, pedir otra o la medida escrita. |

---

## 14. Fuentes

**De Depot (mandan sobre todo lo demás):**
- `app/assets/conocimiento-marcas.json` — origen, garantía, seguro y km por marca (13-ago-2026).
- `app/assets/base_llantas_tipos.json` — tipos, líneas y 385 medidas con descripción del sistema (inventario 4-ago-2026).
- `app/assets/aplicaciones-vehiculos.json` — medidas de fábrica por vehículo y motor de equivalencia.
- `app/src/negocio/negocios/depot.ts` — garantías, qué incluye, pago, locales.
- Conversaciones de producción ago–nov 2026 (respuestas de bot y asesores).

**Falken:**
- falkentire.com (A/T4W, A/T3W, OE)
- Modern Tire Dealer (lanzamientos A/T3W 2016, A/T4W 2024, M/T 2016, CT60 2017)
- Tire Review (A/T Trail 2019)
- Tyrepress (R/T01 2023, M/T Europa 2018, ZE310 2017, 40 años de Falken)
- Tyre Reviews (comparativo A/T 2025, KO3 vs A/T4W, A/T3WA en ADAC 2025)
- Tire Rack (test 337, 2024; test 282)
- Trail4Runner (R/T01)
- Expedition Portal (M/T)
- tiregrades (UTQG)
- WhichCar / Falken AU (ZE310R)
- EPREL (etiqueta UE ZE310)
- Manufacturing Dive / Tyrepress (cierre de Tonawanda 2024)
- European Rubber Journal (plantas de Tailandia y Turquía)
- SRI CSR 2017 (plantas)
- Tire Technology International (Jeep Gladiator OE)
- falken.tires (CX-90 OE)

**Kenda:**
- Kenda USA PC/LT Databook 2020 (UTQG, garantías, tecnología)
- Kenda Europe Catalogue 2024 (etiqueta UE, nombres, descontinuadas)
- automotive.kendatire.com (Kaiser, recall con ejemplo de DOT)
- llantas.com.ec (catálogo Ecuador)
- SimpleTire (reseñas Klever A/T, A/T2, R/T, M/T2)
- Tyre Reviews / rezulteo (Kaiser, Emera A1, Vezda AST, Komet Plus)
- Expedition Portal (Klever R/T)
- showdaily.net y Wikipedia (historia, tamaño)

**Winrun:**
- EPREL (27 fichas de etiqueta UE)
- wrtyre.com
- SimpleTire, TireAdvise, Priority Tire, Grip500

**Giti:**
- lam.giti.com
- giti.com (OE VW / BYD)
- Wikipedia
- S&P Global

**Rankings:**
- Tyrepress «World's Leading Tyremakers 2026»
- Tire Business «Global Tire Report 2025»
- Brand Finance 2026

**Técnico:**
- 49 CFR 575.104 (UTQG)
- Reglamento UE 2020/740 (etiqueta)
- Continental (edad de la llanta)
- Tire Rack (altitud, plus sizing, dónde poner las nuevas)
- Consumer Reports (nitrógeno)
- Michelin (mezclar llantas)
- INEN (RTE INEN 011)

Los enlaces exactos están en las notas de investigación del 17-nov-2026. Si hace falta citar algo al cliente, buscar la página original.

---

## Anexo A — Lonas y rango de carga por medida

Sale de cómo aparece cada medida en el sistema de Depot (inventario 4-ago-2026). «Dice el sistema» = la descripción trae el número de lonas (PR). «Deducido» = sale del índice de carga LT según las tablas de rango de carga TRA. Antes de prometerlo, conviene confirmarlo mirando el costado. Las medidas P o normales, sin LT, C ni XL, equivalen a 4 lonas y no aparecen en esta tabla.

| Marca | Modelo | Medida | Cómo aparece en el sistema | Lonas / rango de carga |
|---|---|---|---|---|
| FALKEN | AZENIS FK520L | 215/45R17 | 215/45ZR17 AZENIS FK520L 91Y XL FALKEN | XL (reforzada, no LT) |
| FALKEN | AZENIS FK520L | 225/40R18 | 225/40ZR18 AZENIS FK520L 92Y XL FALKEN | XL (reforzada, no LT) |
| FALKEN | AZENIS FK520L | 225/45R17 | 225/45ZR17 AZENIS FK520L 94Y XL FALKEN | XL (reforzada, no LT) |
| FALKEN | AZENIS FK520L | 225/45R18 | 225/45ZR18 AZENIS FK520L 95Y XL FALKEN | XL (reforzada, no LT) |
| FALKEN | AZENIS FK520L | 225/45R19 | 225/45ZR19 AZENIS FK520L 96Y XL FALKEN | XL (reforzada, no LT) |
| FALKEN | AZENIS FK520L | 225/50R18 | 225/50ZR18 AZENIS FK520L 99W XL FALKEN | XL (reforzada, no LT) |
| FALKEN | AZENIS FK520L | 225/55R18 | 225/55ZR18 AZENIS FK520L 102W XL FALKEN | XL (reforzada, no LT) |
| FALKEN | AZENIS FK520L | 235/50R19 | 235/50ZR19 AZENIS FK520L 103W XL FALKEN | XL (reforzada, no LT) |
| FALKEN | AZENIS FK520L | 235/55R18 | 235/55ZR18 AZENIS FK520L 104Y XL FALKEN | XL (reforzada, no LT) |
| FALKEN | AZENIS FK520L | 245/40R19 | 245/40ZR19 AZENIS FK520L 98Y XL FALKEN | XL (reforzada, no LT) |
| FALKEN | AZENIS FK520L | 245/45R19 | 245/45ZR19 AZENIS FK520L 102Y XL FALKEN | XL (reforzada, no LT) |
| FALKEN | AZENIS FK520L | 255/40R20 | 255/40ZR20 AZENIS FK520L 101Y XL FALKEN | XL (reforzada, no LT) |
| FALKEN | AZENIS FK520L | 255/45R20 | 255/45ZR20 AZENIS FK520L 105Y XL FALKEN | XL (reforzada, no LT) |
| FALKEN | AZENIS FK520L | 255/50R20 | 255/50ZR20 AZENIS FK520L 109Y XL FALKEN | XL (reforzada, no LT) |
| FALKEN | AZENIS FK520L | 275/40R20 | 275/40ZR20 AZENIS FK520L 106Y XL FALKEN | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T TRAIL | 215/65R16 | 215/65R16 XL 102H WILDPEAK A/T TRAIL FALKEN | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T TRAIL | 225/55R17 | 225/55R17 XL 101V WILDPEAK A/T TRAIL | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T TRAIL | 235/60R18 | 235/60R18 XL 107H WILDPEAK A/T TRAIL FALKEN | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T TRAIL | 245/45R19 | 245/45R19 XL WILDPEAK A/T TRAIL 102V FALKEN | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T TRAIL | 255/50R19 | 255/50R19 XL 107V WILDPEAK A/T TRAIL | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T TRAIL | 255/50R20 | 255/50R20 XL 109V WILDPEAK A/T TRAIL | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T TRAIL | 255/55R18 | 255/55R18 XL 109V WILDPEAK A/T TRAIL | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T TRAIL | 265/50R20 | 265/50R20 XL 111V WILDPEAK A/T TRAIL | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T4W | 215/75R15 | LT215/75R15 106/103R WILDPEAK A/T 4W FALKEN | D · 8 lonas (deducido) |
| FALKEN | WILDPEAK A/T4W | 235/70R16 | 235/70R16 109 XLT WILDPEAK A/T 4W FALKEN | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T4W | 235/75R15 | 235/75R15 109 XLT WILDPEAK A/T 4W FALKEN | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T4W | 235/75R15 | LT235/75R15 116/113R WILDPEAK A/T 4W FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK A/T4W | 245/75R16 | 245/75R16 WILDPEAK A/T 4W 115T XL FALKEN | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T4W | 255/70R16 | 255/70R16 115 XLT WILDPEAK A/T 4W FALKEN | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T4W | 265/60R18 | 265/60R18 114T WILDPEAK A/T4W XL FALKEN | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T4W | 265/65R17 | 265/65R17 116T WILDPEAK A/T4W XL FALKEN | XL (reforzada, no LT) |
| FALKEN | WILDPEAK A/T4W | 265/65R18 | LT265/65R18 122/119R WILDPEAK A/T 4W FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK A/T4W | 265/70R17 | LT265/70R17 123S WILDPEAK A/T 4W FALKEN | E · 10 lonas (deducido, verificar) |
| FALKEN | WILDPEAK A/T4W | 265/70R18 | LT265/70R18 124/121S WILDPEAK A/T 4W FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK A/T4W | 265/75R16 | LT265/75R16 123/120S WILDPEAK A/T 4W FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK A/T4W | 275/55R20 | LT275/55R20 WILDPEAK A/T 4W 115S FALKEN | C · 6 lonas (deducido, verificar) |
| FALKEN | WILDPEAK A/T4W | 275/65R18 | LT275/65R18 123S WILDPEAK A/T4W FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK A/T4W | 285/55R20 | LT285/55R20 WILDPEAK A/T 4W 122/119T FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK A/T4W | 285/70R17 | LT285/70R17 116R WILDPEAK A/T 4W FALKEN | C · 6 lonas (deducido) |
| FALKEN | WILDPEAK M/T | 245/75R16 | LT245/75R16 120/116Q WILDPEAK M/T FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK M/T | 265/70R17 | LT265/70R17 121/118Q WILDPEAK M/T FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK M/T | 265/75R16 | LT265/75R16 123/120Q WILDPEAK M/T FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK M/T | 285/70R17 | LT285/70R17 121/118Q WILDPEAK M/T FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK M/T | 305/55R20 | LT305/55R20 121/118Q WILDPEAK M/T FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK M/T | 30X9.50R15 | 30X9.50R15LT 104Q WILDPEAK M/T FALKEN | C · 6 lonas (deducido) |
| FALKEN | WILDPEAK R/T01 | 265/70R17 | LT265/70R17 121/118R WILDPEAK R/T01 FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK R/T01 | 265/75R16 | LT265/75R16 123/120R WILDPEAK R/T01 FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK R/T01 | 275/55R20 | LT275/55R20 120/117R WILDPEAK R/T01 FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK R/T01 | 275/65R18 | LT275/65R18 123/120R WILDPEAK R/T01 FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK R/T01 | 275/70R18 | LT275/70R18 125/122R WILDPEAK R/T01 FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK R/T01 | 285/70R17 | LT285/70R17 121/118R WILDPEAK R/T01 FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK R/T01 | 315/70R17 | LT315/70R17 121/118R WILDPEAK R/T01 FALKEN | D · 8 lonas (deducido) |
| FALKEN | WILDPEAK R/T01 | 33X12.50R17 | 33X12.50R17LT 120R WILDPEAK R/T01 FALKEN | E · 10 lonas (deducido) |
| FALKEN | WILDPEAK R/T01 | 33X12.50R20 | 33X12.50R20LT 114R WILDPEAK R/T01 FALKEN | C · 6 lonas (deducido) |
| FALKEN | WILDPEAK R/T01 | 35X11.50R20 | 35X11.50R20LT 120R WPRT01 FALKEN | verificar en ficha |
| FALKEN | ZE310R | 205/40R17 | 205/40R17 84W ZE310R XL FALKEN | XL (reforzada, no LT) |
| FALKEN | ZE310R | 205/45R17 | 205/45R17 ZE310R XL 88W FALKEN | XL (reforzada, no LT) |
| FALKEN | ZE310R | 205/50R17 | 205/50R17 93 XLW ZE310 R FALKEN | XL (reforzada, no LT) |
| FALKEN | ZE310R | 205/55R17 | 205/55R17 95W ZE310R XL FALKEN | XL (reforzada, no LT) |
| FALKEN | ZE310R | 205/60R16 | 205/60R16 96V ZE310R XL FALKEN | XL (reforzada, no LT) |
| FALKEN | ZE310R | 215/40R17 | 215/40R17 87 XLW ZE310 R FALKEN | XL (reforzada, no LT) |
| FALKEN | ZE310R | 215/45R17 | 215/45R17 91 XLW ZE310 R FALKEN | XL (reforzada, no LT) |
| FALKEN | ZE310R | 215/60R16 | 215/60R16 99 XLH ZE310 R FALKEN | XL (reforzada, no LT) |
| FALKEN | ZE310R | 225/40R18 | 225/40R18 92 XLW ZE310 R FALKEN | XL (reforzada, no LT) |
| FALKEN | ZE310R | 225/45R17 | 225/45R17 94 XLW ZE310 R FALKEN | XL (reforzada, no LT) |
| FALKEN | ZE310R | 225/45R18 | 225/45R18 95 XLW ZE310 R FALKEN | XL (reforzada, no LT) |
| FALKEN | ZE310R | 225/55R17 | 225/55R17 101W ZE310R XL FALKEN | XL (reforzada, no LT) |
| FALKEN | ZE310R | 235/50R18 | 235/50R18 101W ZE310R XL FALKEN | XL (reforzada, no LT) |
| FALKEN | ZE310R | 245/45R18 | 245/45R18 100 XLW ZE310 R FALKEN | XL (reforzada, no LT) |
| FALKEN | ZIEX CT60 A/S | 215/65R16 | 215/65R16 102 XLV ZIEX CT60 A/S FALKEN | XL (reforzada, no LT) |
| FALKEN | ZIEX CT60 A/S | 235/55R19 | 235/55R19 105V CT60AS XL FALKEN | XL (reforzada, no LT) |
| FALKEN | ZIEX CT60 A/S | 255/50R19 | 255/50R19 107V CT60AS XL FALKEN | XL (reforzada, no LT) |
| FALKEN | ZIEX CT60 A/S | 265/50R20 | 265/50R20 111VXL ZIEX CT60A/S FALKEN | XL (reforzada, no LT) |
| FALKEN | ZIEX CT60 A/S | 275/55R20 | 275/55R20 117H XL ZIEX CT60 A/S FALKEN | XL (reforzada, no LT) |
| KENDA | KR100 | 175/70R14 | 175/70R14C KR100 8P 93/90S TL KENDA | 8 lonas (dice el sistema) |
| KENDA | KR100 | 215/75R16 | 215/75R16C 10PR 112/109 S - KR100 TL KENDA | 10 lonas (dice el sistema) |
| KENDA | KR100 | 225/70R15 | 225/70R15C 107/103 R - KR100 TL KENDA | C comercial (lonas no indicadas: ver costado) |
| KENDA | KR100 | 5R14 | 195R14C 8PR 105/103 R - KR100 TL KENDA | 8 lonas (dice el sistema) |
| KENDA | KR100 | 5R14 | 165R14C KR100 8P 96/95S TL KENDA | 8 lonas (dice el sistema) |
| KENDA | KR100 | 5R15 | 195R15C 8PR 106/104 R - KR100 TL KENDA | 8 lonas (dice el sistema) |
| KENDA | KR12 | 6.50R16 | 6.50R16 KR12 12P TL 111/109L E4 KENDA | 12 lonas (dice el sistema) |
| KENDA | KR12 | 7.00R15 | 7.00R15 KR12 12P TL 114/112L KENDA | 12 lonas (dice el sistema) |
| KENDA | KR12 | 7.00R16 | 7.00 R16 KR12 10PR TL 113/111L KENDA | 10 lonas (dice el sistema) |
| KENDA | KR29 | 215/75R15 | LT215/75R15 6PR 100/97R - KR29 TL | 6 lonas (dice el sistema) |
| KENDA | KR29 | 235/75R15 | LT235/75 R15 104Q KR29 6PR TL 104/101Q KENDA | 6 lonas (dice el sistema) |
| KENDA | KR29 | 245/70R17 | LT245/70 R17 119Q KR29 10PR TL 119/116Q KENDA | 10 lonas (dice el sistema) |
| KENDA | KR29 | 245/75R16 | LT245/75 R16 120Q KR29 10PR TL 120/116Q KENDA | 10 lonas (dice el sistema) |
| KENDA | KR29 | 265/65R17 | LT265/65R17 120/117Q KR29 TL OWL KENDA | E · 10 lonas (deducido) |
| KENDA | KR29 | 265/70R17 | LT265/70 R17 121/118Q KR29 10P TL KENDA | 10 lonas (dice el sistema) |
| KENDA | KR29 | 265/70R17 | LT265/70 R17 112Q KR29 6PR TL 112/109Q KENDA | 6 lonas (dice el sistema) |
| KENDA | KR29 | 265/70R17 | LT265/70R17 KR29 | LT: ver costado / ficha |
| KENDA | KR29 | 265/75R16 | LT265/75R16 10PR 123/120Q - KR29 TL | 10 lonas (dice el sistema) |
| KENDA | KR29 | 285/70R17 | LT285/70R17 121/118Q KR29 TL OWL KENDA | E · 10 lonas (deducido) |
| KENDA | KR29 | 285/75R16 | LT285/75 R16 126Q KR29 10PR TL 126/123Q KENDA | 10 lonas (dice el sistema) |
| KENDA | KR29 | 31X10.50R15 | 31X10.50 R15 LT 109Q KR29 6PR TL KENDA | 6 lonas (dice el sistema) |
| KENDA | KR29 | 32X11.50R15 | 32X11.50 R15 LT 113Q KR29 6PR TL KENDA | 6 lonas (dice el sistema) |
| KENDA | KR29 | 33X12.50R15 | 33X12.50R15LT 108Q KR29 6P TL OWL KENDA | 6 lonas (dice el sistema) |
| KENDA | KR33 | 175/70R14 | LT175/70R14C 95/93S KR33 6PR TL KENDA | 6 lonas (dice el sistema) |
| KENDA | KR33 | 5R13 | 155R13C 91/89N KR33 8PR TL | 8 lonas (dice el sistema) |
| KENDA | KR33 | 5R15 | 195R15C 8PR 106/104R - KR33 TL KENDA | 8 lonas (dice el sistema) |
| KENDA | KR33 | 5R15 | 195 R15C 106R KR33 8PR TL 106/104R KENDA | 8 lonas (dice el sistema) |
| KENDA | KR33A | 205/70R15 | 205/70R15C 106/104S KR33A 8PR TL KENDA | 8 lonas (dice el sistema) |
| KENDA | KR33A | 215/65R16 | 215/65R16C 109/107T KR33A TL KENDA | C comercial (lonas no indicadas: ver costado) |
| KENDA | KR33A | 215/75R14 | 215/75R14C 104/101Q KR33A 8PR TL KENDA | 8 lonas (dice el sistema) |
| KENDA | KR33A | 215/75R16 | 215/75R16C 10PR 113/111R - KR33A KENDA | 10 lonas (dice el sistema) |
| KENDA | KR33A | 225/70R15 | 225/70R15C 8PR 106/103Q - KR33A TL KENDA | 8 lonas (dice el sistema) |
| KENDA | KR33A | 225/75R16 | 225/75R16C 120/116Q KR33A 12P TL KENDA | 12 lonas (dice el sistema) |
| KENDA | KR33A | 235/65R16 | 235/65R16C 121/119R KR33A 10P KENDA | 10 lonas (dice el sistema) |
| KENDA | KR601 | 215/75R15 | LT215/75R15 6PR 100/97Q - KR601 TL KENDA | 6 lonas (dice el sistema) |
| KENDA | KR601 | 225/75R15 | LT225/75R15 102/99 Q - KR601 TL | C · 6 lonas (deducido) |
| KENDA | KR601 | 235/70R16 | LT235/70R16 6PR 104/101 Q - KR601 TL | 6 lonas (dice el sistema) |
| KENDA | KR601 | 235/75R15 | LT235/75R15 6PR 104/101 Q - KR601 TL | 6 lonas (dice el sistema) |
| KENDA | KR601 | 245/70R16 | LT245/70R16 6PR 106/103 Q - KR601 TL | 6 lonas (dice el sistema) |
| KENDA | KR601 | 265/65R17 | LT265/65R17 10PR 120/117Q - KR601 TL | 10 lonas (dice el sistema) |
| KENDA | KR601 | 265/70R16 | LT265/70R16 6PR 110/107 Q - KR601 TL | 6 lonas (dice el sistema) |
| KENDA | KR601 | 285/60R18 | LT285/60R18 122/119Q KR601 10PR TL KENDA | 10 lonas (dice el sistema) |
| KENDA | KR601 | 31X10.50R15 | 31X10.50R15LT 109Q KR601 6PR KENDA | 6 lonas (dice el sistema) |
| KENDA | KR605 | 225/45R19 | 225/45ZR19 96W - KR605 TL XL | XL (reforzada, no LT) |
| KENDA | KR605 | 225/55R18 | 225/55R18 102V KR605 TL XL | XL (reforzada, no LT) |
| KENDA | KR605 | 235/50R18 | 235/50ZR18 101W - KR605 TL XL | XL (reforzada, no LT) |
| KENDA | KR605 | 235/60R18 | 235/60R18 107V KR605 TL XL KENDA | XL (reforzada, no LT) |
| KENDA | KR605 | 245/45R20 | 245/45ZR20 103W KR605 TL XL | XL (reforzada, no LT) |
| KENDA | KR605 | 275/40R22 | 275/40ZR22 107W KR605 TL XL | XL (reforzada, no LT) |
| KENDA | KR605 | 275/45R20 | 275/45ZR20 110W - KR605 TL XL | XL (reforzada, no LT) |
| KENDA | KR605 | 275/45R21 | 275/45ZR21 110W KR605 TL XL | XL (reforzada, no LT) |
| KENDA | KR605 | 275/50R21 | 275/50R21 113V KR605 TL XL KENDA | XL (reforzada, no LT) |
| KENDA | KR608 | 235/55R19 | LT235/55R19 10PR 111/108T - KR608 TL | 10 lonas (dice el sistema) |
| KENDA | KR608 | 235/70R16 | LT235/70R16 6PR 104/101 S - KR608 TL KENDA | 6 lonas (dice el sistema) |
| KENDA | KR608 | 245/70R16 | LT245/70R16 8PR 113/110S - KR608 TL KENDA | 8 lonas (dice el sistema) |
| KENDA | KR608 | 255/55R19 | LT255/55R19 10PR 115/112R - KR608 TL | 10 lonas (dice el sistema) |
| KENDA | KR608 | 255/60R18 | LT255/60R18 10PR 117/114R - KR608 TL | 10 lonas (dice el sistema) |
| KENDA | KR608 | 255/70R16 | LT255/70R16 8PR 115/112S - KR608 TL | 8 lonas (dice el sistema) |
| KENDA | KR608 | 265/60R18 | LT265/60 R18 114/110S KR608 8PR TL KENDA | 8 lonas (dice el sistema) |
| KENDA | KR608 | 265/65R17 | LT265/65 R17 120/117R KR608 10PR TL KENDA | 10 lonas (dice el sistema) |
| KENDA | KR608 | 265/65R17 | LT265/65R17 10PR 120/117R - KR608 TL KENDA | 10 lonas (dice el sistema) |
| KENDA | KR608 | 265/70R16 | LT265/70R16 8PR 117/114 S - KR608 TL KENDA | 8 lonas (dice el sistema) |
| KENDA | KR608 | 265/70R17 | LT265/70R17 8PR 118/115S - KR608 TL | 8 lonas (dice el sistema) |
| KENDA | KR608 | 275/70R17 | LT275/70R17 10PR 121/118R - KR608 TL | 10 lonas (dice el sistema) |
| KENDA | KR608 | 315/70R17 | LT315/70R17 10PR 121/118R - KR608 TL KENDA | 10 lonas (dice el sistema) |
| KENDA | KR628 | 225/75R16 | LT225/75R16 115/112S KR628 10PR KENDA | 10 lonas (dice el sistema) |
| KENDA | KR628 | 265/50R20 | 265/50R20 111H KR628 TL XL KENDA | XL (reforzada, no LT) |
| KENDA | KR628 | 265/70R17 | LT265/70R17 10PR 121/118S - KR628 | 10 lonas (dice el sistema) |
| KENDA | KR628 | 265/75R16 | LT265/75R16 10PR 123/120S - KR628 KENDA | 10 lonas (dice el sistema) |
| KENDA | KR628 | 275/70R18 | LT275/70R18 10PR 125/122S - KR628 | 10 lonas (dice el sistema) |
| KENDA | KR628 | 285/70R17 | LT285/70R17 10PR 121/118S - KR628 KENDA | 10 lonas (dice el sistema) |
| KENDA | KR628 | 31X10.50R15 | 31X10.50R15LT 109Q KR628 6PR KENDA | 6 lonas (dice el sistema) |
| KENDA | KR628 | 5R15 | 30X9.5R15LT 104Q KR628 6PR TL | 6 lonas (dice el sistema) |
| KENDA | KR628 | 9.50R15 | 30*9.50R15LT 104Q KR628 6PR TL OWL KENDA | 6 lonas (dice el sistema) |
| KENDA | KR629 | 2.50R17 | 35*12.50R17LT 121Q KR629 10PR KENDA | 10 lonas (dice el sistema) |
| KENDA | KR629 | 2.50R20 | 35*12.50R20LT 125Q KR629 12PR KENDA | 12 lonas (dice el sistema) |
| KENDA | KR629 | 265/70R17 | LT265/70R17 121/118Q KR629 10PR TL KENDA | 10 lonas (dice el sistema) |
| KENDA | KR629 | 285/70R17 | LT285/70R17 121/118Q KR629 10P TL KENDA | 10 lonas (dice el sistema) |
| WINRUN | MAXCLAW A/T | 175/70R14 | 175/70R14 88H XL MAXCLAW A/T WINRUN | XL (reforzada, no LT) |
| WINRUN | MAXCLAW A/T | 215/75R14 | LT215/75R14 D 104/101S MAXCLAW A/T WINRUN | D · 8 lonas (dice el sistema) |
| WINRUN | MAXCLAW A/T | 255/55R19 | 255/55R19 111V XL MAXCLAW A/T WINRUN | XL (reforzada, no LT) |
| WINRUN | MAXCLAW A/T | 265/50R20 | 265/50 R20 111V XL MAXCLAW A/T WINRUN | XL (reforzada, no LT) |
| WINRUN | MAXCLAW R/T | 265/75R16 | LT265/75 R16 123/120R MAXCLAW R/T WINRUN | E · 10 lonas (deducido) |
| WINRUN | MT305 | 33X12.50R20 | 33X12.50 R20LT 114Q MT305 WINRUN | C · 6 lonas (deducido) |
| WINRUN | MT305 | 35X12.50R17 | 35X12.50R17LT 121Q MT305 WINRUN | E · 10 lonas (deducido) |
| WINRUN | R330 | 205/45R16 | 205/45 ZR16 87W XL R330 WINRUN | XL (reforzada, no LT) |
| WINRUN | R330 | 205/45R17 | 205/45ZR17 88W XL R330 WINRUN | XL (reforzada, no LT) |
| WINRUN | R330 | 215/45R17 | 215/45 ZR17 91W XL R330 WINRUN | XL (reforzada, no LT) |
| WINRUN | R330 | 215/55R16 | 215/55R16 97W XL R330 WINRUN | XL (reforzada, no LT) |
| WINRUN | R330 | 225/50R17 | 225/50 ZR17 98W XL R330 WINRUN | XL (reforzada, no LT) |
| WINRUN | R330 | 235/50R17 | 235/50ZR17 100W XL R330 WINRUN | XL (reforzada, no LT) |
| WINRUN | R330 | 235/50R18 | 235/50 ZR18 101W XL R330 WINRUN | XL (reforzada, no LT) |
| WINRUN | R330 | 235/50R19 | 235/50ZR19 103W XL R330 WINRUN | XL (reforzada, no LT) |
| WINRUN | R330 | 235/55R18 | 235/55 R18 104V XL R330 WINRUN | XL (reforzada, no LT) |
| WINRUN | R330 | 255/45R20 | 255/45 ZR20 105W XL R330 WINRUN | XL (reforzada, no LT) |
| WINRUN | R330 | 255/55R19 | 255/55ZR19 111W XL R330 WINRUN | XL (reforzada, no LT) |
| WINRUN | R330 | 275/45R20 | 275/45 ZR20 110W XL R330 | XL (reforzada, no LT) |
| WINRUN | R380 | 225/60R18 | 225/60 R18 104V XL R380 WINRUN | XL (reforzada, no LT) |
| WINRUN | R380 | 235/60R18 | 235/60R18 107V XL R380 WINRUN | XL (reforzada, no LT) |

## Anexo B — Medidas de fábrica de los vehículos más pedidos

Sacado de `app/assets/aplicaciones-vehiculos.json`. ⚠️ **No está verificado versión por versión**: lo que entra a Ecuador cambia según el año, la versión y el lote. Si hay duda, pedir foto del costado o de la etiqueta de la puerta.

| Vehículo | Años | Medidas de fábrica | Confianza |
|---|---|---|---|
| Changan Alsvin | 2020-2027 | 185/60R15, 195/55R16 | baja |
| Changan CS15 / CS35 / CS55 | 2019-2027 | 205/60R16, 215/55R17, 225/60R18 | baja |
| Changan Hunter | 2022-2027 | 245/70R16, 265/65R17 | baja |
| Chery Tiggo 2 / 4 / 7 / 8 | 2020-2027 | 205/60R16, 215/60R17, 225/60R17, 235/50R18 | media |
| Chevrolet Aveo Family | 2010-2022 | 185/60R14, 185/65R14, 195/55R15 | media |
| Chevrolet Beat | 2018-2027 | 175/70R14, 185/65R15 | media |
| Chevrolet Captiva | 2019-2027 | 215/60R17, 225/55R18, 235/50R19 | media |
| Chevrolet D-Max | 2013-2027 | 255/65R17, 245/70R16, 255/70R16, 265/60R18 | alta |
| Chevrolet D-Max | 2003-2012 | 245/70R16, 225/75R16 | media |
| Chevrolet Onix / Onix Turbo | 2020-2027 | 185/65R15, 195/55R16, 205/55R16 | media |
| Chevrolet Sail | 2015-2027 | 185/65R15, 185/60R14 | alta |
| Chevrolet Spark GT | 2015-2027 | 185/55R15 | alta |
| Chevrolet Tracker | 2020-2027 | 215/60R17, 215/55R18 | media |
| Ford F-150 | 2015-2027 | 265/70R17, 275/65R18, 275/60R20 | media |
| Ford Ranger | 2016-2027 | 265/65R17, 265/60R18, 255/70R16, 255/65R17 | alta |
| Great Wall (GWM) Poer / Wingle | 2019-2027 | 245/70R16, 265/65R17, 255/60R18 | media |
| Great Wall (GWM) Tank 300 | 2022-2027 | 265/65R17, 265/60R18 | baja |
| Hyundai Accent | 2018-2027 | 185/65R15, 195/55R16, 205/45R17 | alta |
| Hyundai Creta | 2020-2027 | 205/65R16, 215/60R17, 225/55R17, 215/55R18, 225/50R18 | alta |
| Hyundai Tucson | 2019-2027 | 235/65R17, 235/60R18, 235/55R19 | alta |
| JAC JS3 / JS4 / JS8 | 2020-2027 | 205/60R16, 215/55R17, 225/60R18 | baja |
| JAC T6 / T8 | 2019-2027 | 245/65R17, 235/65R17, 265/65R17 | media |
| JAC X200 / camion liviano | 2015-2027 | 195R15C, 215/75R15C, 7.00R16 | media |
| Kia K2500 / Frontier | 2010-2027 | 195R15C, 205/75R14C | media |
| Kia Picanto | 2018-2027 | 165/65R14, 175/50R15, 195/45R16 | media |
| Kia Picanto | 2011-2017 | 165/60R14, 175/50R15 | media |
| Kia Picanto | 2004-2010 | 155/70R13, 165/60R14 | media |
| Kia Rio | 2018-2027 | 185/65R15, 195/55R16, 205/45R17 | alta |
| Kia Soluto | 2020-2027 | 175/70R14, 185/65R15 | media |
| Kia Sportage | 2022-2027 | 235/65R17, 235/60R18, 235/55R19 | alta |
| Kia Sportage | 2016-2021 | 225/60R17, 245/45R19, 215/70R16 | media |
| Mazda BT-50 | 2013-2027 | 265/65R17, 255/70R16, 265/60R18 | media |
| Mazda BT-50 | 2007-2012 | 245/70R16, 235/75R15 | media |
| Mazda CX-5 | 2018-2027 | 225/65R17, 225/55R19 | alta |
| Mazda CX-50 / CX-60 | 2022-2027 | 235/65R17, 235/55R19, 235/50R20 | baja |
| Nissan Frontier / NP300 (D22) | 1998-2015 | 235/75R15, 255/70R15 | media |
| Nissan Frontier / Navara / NP300 | 2016-2027 | 255/65R17, 255/60R18, 255/70R16 | alta |
| Nissan Qashqai | 2019-2027 | 215/65R16, 215/60R17, 215/55R18 | media |
| Nissan X-Trail | 2014-2027 | 225/65R17, 225/60R18, 235/55R19 | alta |
| Nissan X-Trail | 2007-2013 | 215/65R16, 225/60R17 | media |
| Renault Duster | 2016-2027 | 215/65R16, 215/60R17 | alta |
| Suzuki Grand Vitara SZ | 2010-2027 | 225/65R17, 225/70R16 | media |
| Suzuki Swift | 2018-2027 | 185/55R16, 175/65R15 | media |
| Suzuki Vitara Live | 2000-2018 | 215/65R16, 235/60R16 | media |
| Toyota Corolla | 2019-2027 | 205/55R16, 225/40R18 | alta |
| Toyota Corolla Cross | 2022-2027 | 215/60R17, 225/50R18 | media |
| Toyota Fortuner | 2016-2027 | 265/65R17, 265/60R18 | alta |
| Toyota Fortuner | 2005-2015 | 265/65R17 | media |
| Toyota Hilux | 2016-2027 | 265/65R17, 265/60R18, 205R16C, 255/70R15 | alta |
| Toyota Hilux | 2005-2015 | 265/65R17, 225/70R17 | media |
| Toyota RAV4 | 2019-2027 | 225/65R17, 235/55R19 | alta |
| Toyota Yaris Cross | 2021-2027 | 205/65R16, 215/55R17 | media |
| Toyota Yaris sedan | 2006-2017 | 185/60R15, 175/65R14 | media |
| Toyota Yaris sedan / hatchback | 2018-2027 | 175/65R15, 185/60R15, 195/50R16 | media |


## Anexo C — Todas las medidas por modelo

Inventario del 4-ago-2026 (`base_llantas_tipos.json`). El stock cambia todos los días; esto sirve para saber **en qué medidas existe** cada modelo. La disponibilidad real sale de Contífico al cotizar.

#### Falken Wildpeak A/T Trail (A/T) — 16 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 205/60R16 | 16 | 205/60R16 92H WILDPEAK A/T TRAIL FALKEN | 652.4 |
| 215/60R16 | 16 | 215/60R16 95H WILDPEAK A/T TRAIL FALKEN | 664.4 |
| 215/65R16 | 16 | 215/65R16 XL 102H WILDPEAK A/T TRAIL FALKEN | 685.9 |
| 265/70R16 | 16 | 265/70R16 112S WILDPEAK A/T TRAIL | 777.4 |
| 215/60R17 | 17 | 215/60R17 96H WILDPEAK A/T TRAIL | 689.8 |
| 225/55R17 | 17 | 225/55R17 XL 101V WILDPEAK A/T TRAIL | 679.3 |
| 245/65R17 | 17 | 245/65R17 107H WILDPEAK A/T TRAIL | 750.3 |
| 225/50R18 | 18 | 225/50R18 WILDPEAK A/T TRAIL 95V FALKEN | 682.2 |
| 235/50R18 | 18 | 235/50R18 97V WILDPEAK A/T TRAIL | 692.2 |
| 235/60R18 | 18 | 235/60R18 XL 107H WILDPEAK A/T TRAIL FALKEN | 739.2 |
| 245/60R18 | 18 | 245/60R18 105H WILDPEAK A/T TRAIL | 751.2 |
| 255/55R18 | 18 | 255/55R18 XL 109V WILDPEAK A/T TRAIL | 737.7 |
| 245/45R19 | 19 | 245/45R19 XL WILDPEAK A/T TRAIL 102V FALKEN | 703.1 |
| 255/50R19 | 19 | 255/50R19 XL 107V WILDPEAK A/T TRAIL | 737.6 |
| 255/50R20 | 20 | 255/50R20 XL 109V WILDPEAK A/T TRAIL | 763.0 |
| 265/50R20 | 20 | 265/50R20 XL 111V WILDPEAK A/T TRAIL | 773.0 |

#### Falken Wildpeak A/T3W (A/T) — 1 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 235/65R17 | 17 | 235/65R17 104H WILDPEAK A/T AT3W BL FALKEN | 737.3 |

#### Falken Wildpeak A/T4W (A/T) — 22 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 215/75R15 | 15 | LT215/75R15 106/103R WILDPEAK A/T 4W FALKEN | 703.5 |
| 235/75R15 | 15 | 235/75R15 109 XLT WILDPEAK A/T 4W FALKEN | 733.5 |
| 235/75R15 | 15 | LT235/75R15 116/113R WILDPEAK A/T 4W FALKEN | 733.5 |
| 235/70R16 | 16 | 235/70R16 109 XLT WILDPEAK A/T 4W FALKEN | 735.4 |
| 245/75R16 | 16 | 245/75R16 WILDPEAK A/T 4W 115T XL FALKEN | 773.9 |
| 255/70R16 | 16 | 255/70R16 115 XLT WILDPEAK A/T 4W FALKEN | 763.4 |
| 265/70R16 | 16 | 265/70R16 112T WILDPEAK A/T 4W FALKEN | 777.4 |
| 265/75R16 | 16 | LT265/75R16 123/120S WILDPEAK A/T 4W FALKEN | 803.9 |
| 265/75R16 | 16 | 265/75R16 WILDPEAK A/T 4W 116T FALKEN | 803.9 |
| 215/65R17 | 17 | 215/65R17 WILDPEAK A/T 4W 99T FALKEN | 711.3 |
| 225/65R17 | 17 | 225/65R17 WILDPEAK A/T 4W 106T FALKEN | 724.3 |
| 235/65R17 | 17 | 235/65R17 104H WILDPEAK A/T4W FALKEN | 737.3 |
| 265/65R17 | 17 | 265/65R17 116T WILDPEAK A/T4W XL FALKEN | 776.3 |
| 265/70R17 | 17 | LT265/70R17 123S WILDPEAK A/T 4W FALKEN | 802.8 |
| 285/70R17 | 17 | LT285/70R17 116R WILDPEAK A/T 4W FALKEN | 830.8 |
| 265/60R18 | 18 | 265/60R18 114T WILDPEAK A/T4W XL FALKEN | 775.2 |
| 265/65R18 | 18 | LT265/65R18 122/119R WILDPEAK A/T 4W FALKEN | 801.7 |
| 265/70R18 | 18 | LT265/70R18 124/121S WILDPEAK A/T 4W FALKEN | 828.2 |
| 275/65R18 | 18 | LT275/65R18 123S WILDPEAK A/T4W FALKEN | 814.7 |
| 275/55R20 | 20 | LT275/55R20 WILDPEAK A/T 4W 115S FALKEN | 810.5 |
| 285/55R20 | 20 | LT285/55R20 WILDPEAK A/T 4W 122/119T FALKEN | 821.5 |
| 285/55R20 | 20 | 285/55R20 WILDPEAK A/T 4W 114T FALKEN | 821.5 |

#### Falken Ziex CT60 A/S (H/T) — 17 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 215/65R16 | 16 | 215/65R16 102 XLV ZIEX CT60 A/S FALKEN | 685.9 |
| 235/60R17 | 17 | 235/60R17 102H ZIEX CT60 A/S FALKEN | 713.8 |
| 225/60R18 | 18 | 225/60R18 100H ZIEX CT60 A/S FALKEN | 727.2 |
| 235/55R18 | 18 | 235/55R18 100V CT60AS FALKEN | 715.7 |
| 235/65R18 | 18 | 235/65R18 ZIEX CT60 A/S 106V FALKEN | 762.7 |
| 245/60R18 | 18 | 245/60R18 105V ZIEX CT60 A/S FALKEN | 751.2 |
| 265/65R18 | 18 | 265/65R18 114H CT60AS FALKEN | 801.7 |
| 225/55R19 | 19 | 225/55R19 99V ZIEX CT60 A/S FALKEN | 730.1 |
| 235/50R19 | 19 | 235/50R19 99V CT60AS FALKEN | 717.6 |
| 235/55R19 | 19 | 235/55R19 105V CT60AS XL FALKEN | 741.1 |
| 245/55R19 | 19 | 245/55R19 103V CT60AS FALKEN | 752.1 |
| 255/50R19 | 19 | 255/50R19 107V CT60AS XL FALKEN | 737.6 |
| 255/55R19 | 19 | 255/55R19 111V CT60AS FALKEN | 763.1 |
| 245/50R20 | 20 | 245/50R20 102V CT60AS FALKEN | 753.0 |
| 265/50R20 | 20 | 265/50R20 111VXL ZIEX CT60A/S FALKEN | 773.0 |
| 275/55R20 | 20 | 275/55R20 117H XL ZIEX CT60 A/S FALKEN | 810.5 |
| 285/50R20 | 20 | 285/50R20 112V ZIEX CT60 A/S FALKEN | 793.0 |

#### Falken Wildpeak M/T (M/T) — 7 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 30X9.50R15 | 15 | 30X9.50R15LT 104Q WILDPEAK M/T FALKEN | 762.0 |
| 245/75R16 | 16 | LT245/75R16 120/116Q WILDPEAK M/T FALKEN | 773.9 |
| 265/75R16 | 16 | LT265/75R16 123/120Q WILDPEAK M/T FALKEN | 803.9 |
| 265/70R17 | 17 | LT265/70R17 121/118Q WILDPEAK M/T FALKEN | 802.8 |
| 285/70R17 | 17 | LT285/70R17 121/118Q WILDPEAK M/T FALKEN | 830.8 |
| 0R20 | 20 | 33X1250R20 WILDPEAK M/T MT01 114Q FALKEN | None |
| 305/55R20 | 20 | LT305/55R20 121/118Q WILDPEAK M/T FALKEN | 843.5 |

#### Falken Wildpeak R/T01 (R/T) — 10 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 265/75R16 | 16 | LT265/75R16 123/120R WILDPEAK R/T01 FALKEN | 803.9 |
| 265/70R17 | 17 | LT265/70R17 121/118R WILDPEAK R/T01 FALKEN | 802.8 |
| 285/70R17 | 17 | LT285/70R17 121/118R WILDPEAK R/T01 FALKEN | 830.8 |
| 315/70R17 | 17 | LT315/70R17 121/118R WILDPEAK R/T01 FALKEN | 872.8 |
| 33X12.50R17 | 17 | 33X12.50R17LT 120R WILDPEAK R/T01 FALKEN | 838.2 |
| 275/65R18 | 18 | LT275/65R18 123/120R WILDPEAK R/T01 FALKEN | 814.7 |
| 275/70R18 | 18 | LT275/70R18 125/122R WILDPEAK R/T01 FALKEN | 842.2 |
| 275/55R20 | 20 | LT275/55R20 120/117R WILDPEAK R/T01 FALKEN | 810.5 |
| 33X12.50R20 | 20 | 33X12.50R20LT 114R WILDPEAK R/T01 FALKEN | 838.2 |
| 35X11.50R20 | 20 | 35X11.50R20LT 120R WPRT01 FALKEN | 889.0 |

#### Falken Ziex ZE310R Ecorun (TURISMO) — 23 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 205/55R16 | 16 | 205/55R16 91V ZE310R FALKEN | 631.9 |
| 205/60R16 | 16 | 205/60R16 96V ZE310R XL FALKEN | 652.4 |
| 215/60R16 | 16 | 215/60R16 95H ZE310 R FALKEN | 664.4 |
| 215/60R16 | 16 | 215/60R16 99 XLH ZE310 R FALKEN | 664.4 |
| 235/60R16 | 16 | 235/60R16 100W ZE310R FALKEN | 688.4 |
| 205/40R17 | 17 | 205/40R17 84W ZE310R XL FALKEN | 595.8 |
| 205/45R17 | 17 | 205/45R17 ZE310R XL 88W FALKEN | 616.3 |
| 205/50R17 | 17 | 205/50R17 93 XLW ZE310 R FALKEN | 636.8 |
| 205/55R17 | 17 | 205/55R17 95W ZE310R XL FALKEN | 657.3 |
| 215/40R17 | 17 | 215/40R17 87 XLW ZE310 R FALKEN | 603.8 |
| 215/45R17 | 17 | 215/45R17 91 XLW ZE310 R FALKEN | 625.3 |
| 215/55R17 | 17 | 215/55R17 94V ZE310R FALKEN | 668.3 |
| 215/60R17 | 17 | 215/60R17 96H ZE310R FALKEN | 689.8 |
| 225/45R17 | 17 | 225/45R17 94 XLW ZE310 R FALKEN | 634.3 |
| 225/55R17 | 17 | 225/55R17 101W ZE310R XL FALKEN | 679.3 |
| 225/60R17 | 17 | 225/60R17 99V ZE310R FALKEN | 701.8 |
| 225/65R17 | 17 | 225/65R17 102V ZE310R FALKEN | 724.3 |
| 225/40R18 | 18 | 225/40R18 92 XLW ZE310 R FALKEN | 637.2 |
| 225/45R18 | 18 | 225/45R18 95 XLW ZE310 R FALKEN | 659.7 |
| 225/55R18 | 18 | 225/55R18 98V ZE310R FALKEN | 704.7 |
| 235/50R18 | 18 | 235/50R18 101W ZE310R XL FALKEN | 692.2 |
| 245/45R18 | 18 | 245/45R18 100 XLW ZE310 R FALKEN | 677.7 |
| 265/60R18 | 18 | 265/60R18 110V ZE310R FALKEN | 775.2 |

#### Falken Ziex ZE914 Ecorun (TURISMO) — 1 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 235/60R16 | 16 | 235/60R16 100W ZE914ER FALKEN | 688.4 |

#### Falken Azenis FK520L (TURISMO UHP) — 17 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 215/45R17 | 17 | 215/45ZR17 AZENIS FK520L 91Y XL FALKEN | 625.3 |
| 225/45R17 | 17 | 225/45ZR17 AZENIS FK520L 94Y XL FALKEN | 634.3 |
| 215/50R18 | 18 | 215/50ZR18 AZENIS FK520L 92W FALKEN | 672.2 |
| 225/40R18 | 18 | 225/40ZR18 AZENIS FK520L 92Y XL FALKEN | 637.2 |
| 225/45R18 | 18 | 225/45ZR18 AZENIS FK520L 95Y XL FALKEN | 659.7 |
| 225/50R18 | 18 | 225/50ZR18 AZENIS FK520L 99W XL FALKEN | 682.2 |
| 225/55R18 | 18 | 225/55ZR18 AZENIS FK520L 102W XL FALKEN | 704.7 |
| 235/55R18 | 18 | 235/55ZR18 AZENIS FK520L 104Y XL FALKEN | 715.7 |
| 225/45R19 | 19 | 225/45ZR19 AZENIS FK520L 96Y XL FALKEN | 685.1 |
| 225/55R19 | 19 | 225/55ZR19 AZENIS FK520L 99W FALKEN | 730.1 |
| 235/50R19 | 19 | 235/50ZR19 AZENIS FK520L 103W XL FALKEN | 717.6 |
| 245/40R19 | 19 | 245/40ZR19 AZENIS FK520L 98Y XL FALKEN | 678.6 |
| 245/45R19 | 19 | 245/45ZR19 AZENIS FK520L 102Y XL FALKEN | 703.1 |
| 255/40R20 | 20 | 255/40ZR20 AZENIS FK520L 101Y XL FALKEN | 712.0 |
| 255/45R20 | 20 | 255/45ZR20 AZENIS FK520L 105Y XL FALKEN | 737.5 |
| 255/50R20 | 20 | 255/50ZR20 AZENIS FK520L 109Y XL FALKEN | 763.0 |
| 275/40R20 | 20 | 275/40ZR20 AZENIS FK520L 106Y XL FALKEN | 728.0 |

#### Falken Azenis RT615K+ (TURISMO UHP) — 2 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 215/45R17 | 17 | 215/45R17 AZENIS RT615K+ 87W FALKEN | 625.3 |
| 225/45R17 | 17 | 225/45R17 AZENIS RT615K+ 94W RF FALKEN | 634.3 |

#### Kenda Klever A/T (A/T) — 24 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 215/75R15 | 15 | P215/75R15 100S - KR28 TL | 703.5 |
| 235/60R16 | 16 | P235/60R16 104T -  KR28 TL | 688.4 |
| 235/70R16 | 16 | LT235/70R16 6PR 104/101 S - KR608 TL KENDA | 735.4 |
| 245/70R16 | 16 | LT245/70R16 8PR 113/110S - KR608 TL KENDA | 749.4 |
| 245/75R16 | 16 | P245/75 R16 111S KR28 TL KENDA | 773.9 |
| 245/75R16 | 16 | P245/75R16 KR28 | 773.9 |
| 255/70R16 | 16 | LT255/70R16 8PR 115/112S - KR608 TL | 763.4 |
| 255/70R16 | 16 | P255/70R16 111S KR28 TL KENDA | 763.4 |
| 265/70R16 | 16 | LT265/70R16 8PR 117/114 S - KR608 TL KENDA | 777.4 |
| 275/70R16 | 16 | P275/70R16 114T - KR28 TL | 791.4 |
| 225/65R17 | 17 | P225/65R17 102T - KR28 TL | 724.3 |
| 235/65R17 | 17 | P235/65 R17 104S KR28 TL KENDA | 737.3 |
| 265/65R17 | 17 | P265/65 R17 112S KR28 TL KENDA | 776.3 |
| 265/65R17 | 17 | LT265/65 R17 120/117R KR608 10PR TL KENDA | 776.3 |
| 265/65R17 | 17 | LT265/65R17 10PR 120/117R - KR608 TL KENDA | 776.3 |
| 265/70R17 | 17 | LT265/70R17 8PR 118/115S - KR608 TL | 802.8 |
| 275/70R17 | 17 | LT275/70R17 10PR 121/118R - KR608 TL | 816.8 |
| 285/65R17 | 17 | P285/65R17 116T - KR28 TL | 802.3 |
| 315/70R17 | 17 | LT315/70R17 10PR 121/118R - KR608 TL KENDA | 872.8 |
| 255/60R18 | 18 | LT255/60R18 10PR 117/114R - KR608 TL | 763.2 |
| 265/60R18 | 18 | LT265/60 R18 114/110S KR608 8PR TL KENDA | 775.2 |
| 235/55R19 | 19 | LT235/55R19 10PR 111/108T - KR608 TL | 741.1 |
| 245/55R19 | 19 | 245/55R19 107R KR608 - TL | 752.1 |
| 255/55R19 | 19 | LT255/55R19 10PR 115/112R - KR608 TL | 763.1 |

#### Kenda Klever A/T2 (A/T) — 23 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 235/75R15 | 15 | 235/75R15 109T - KR628 TL | 733.5 |
| 31X10.50R15 | 15 | 31X10.50R15LT 109Q KR628 6PR KENDA | 787.4 |
| 5R15 | 15 | 30X9.5R15LT 104Q KR628 6PR TL | None |
| 9.50R15 | 15 | 30*9.50R15LT 104Q KR628 6PR TL OWL KENDA | None |
| 225/75R16 | 16 | LT225/75R16 115/112S KR628 10PR KENDA | 743.9 |
| 235/70R16 | 16 | 235/70R16 109T - KR628 TL | 735.4 |
| 245/70R16 | 16 | 245/70R16 107T - KR628 TL | 749.4 |
| 245/75R16 | 16 | 245/75R16 111T KR628 TL KENDA | 773.9 |
| 255/70R16 | 16 | 255/70R16 115T - KR628 TL | 763.4 |
| 265/70R16 | 16 | 265/70R16 112T - KR628 TL | 777.4 |
| 265/75R16 | 16 | LT265/75R16 10PR 123/120S - KR628 KENDA | 803.9 |
| 235/65R17 | 17 | P235/65R17 104S - KR628 TL | 737.3 |
| 265/65R17 | 17 | 265/65R17 116T - KR628 TL | 776.3 |
| 265/70R17 | 17 | LT265/70R17 10PR 121/118S - KR628 | 802.8 |
| 265/70R17 | 17 | 265/70R17 115T KR628 TL | 802.8 |
| 285/70R17 | 17 | LT285/70R17 10PR 121/118S - KR628 KENDA | 830.8 |
| 285/70R17 | 17 | P285/70R17 117T-  KR628 TL | 830.8 |
| 265/60R18 | 18 | 265/60R18 114T - KR628 TL | 775.2 |
| 275/65R18 | 18 | 275/65R18 116T - KR628 TL | 814.7 |
| 275/70R18 | 18 | LT275/70R18 10PR 125/122S - KR628 | 842.2 |
| 265/50R20 | 20 | 265/50R20 111H KR628 TL XL KENDA | 773.0 |
| 275/55R20 | 20 | 275/55R20 117T - KR628 TL | 810.5 |
| 285/50R20 | 20 | 285/50R20 116H - KR628 TL | 793.0 |

#### Kenda KR12 (COMERCIAL) — 3 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 7.00R15 | 15 | 7.00R15 KR12 12P TL 114/112L KENDA | None |
| 6.50R16 | 16 | 6.50R16 KR12 12P TL 111/109L E4 KENDA | None |
| 7.00R16 | 16 | 7.00 R16 KR12 10PR TL 113/111L KENDA | None |

#### Kenda Komendo (COMERCIAL) — 17 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 5R13 | 13 | 155R13C 91/89N KR33 8PR TL | None |
| 175/70R14 | 14 | LT175/70R14C 95/93S KR33 6PR TL KENDA | 600.6 |
| 175/70R14 | 14 | 175/70R14C KR100 8P 93/90S TL KENDA | 600.6 |
| 215/75R14 | 14 | 215/75R14C 104/101Q KR33A 8PR TL KENDA | 678.1 |
| 5R14 | 14 | 195R14C 8PR 105/103 R - KR100 TL KENDA | None |
| 5R14 | 14 | 165R14C KR100 8P 96/95S TL KENDA | None |
| 205/70R15 | 15 | 205/70R15C 106/104S KR33A 8PR TL KENDA | 668.0 |
| 225/70R15 | 15 | 225/70R15C 8PR 106/103Q - KR33A TL KENDA | 696.0 |
| 225/70R15 | 15 | 225/70R15C 107/103 R - KR100 TL KENDA | 696.0 |
| 5R15 | 15 | 195R15C 8PR 106/104R - KR33 TL KENDA | None |
| 5R15 | 15 | 195R15C 8PR 106/104 R - KR100 TL KENDA | None |
| 5R15 | 15 | 195 R15C 106R KR33 8PR TL 106/104R KENDA | None |
| 215/65R16 | 16 | 215/65R16C 109/107T KR33A TL KENDA | 685.9 |
| 215/75R16 | 16 | 215/75R16C 10PR 112/109 S - KR100 TL KENDA | 728.9 |
| 215/75R16 | 16 | 215/75R16C 10PR 113/111R - KR33A KENDA | 728.9 |
| 225/75R16 | 16 | 225/75R16C 120/116Q KR33A 12P TL KENDA | 743.9 |
| 235/65R16 | 16 | 235/65R16C 121/119R KR33A 10P KENDA | 711.9 |

#### Kenda Klever H/P (H/T) — 3 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 205/70R15 | 15 | P205/70R15 KR15 96S TL KENDA | 668.0 |
| 225/70R15 | 15 | P225/70R15 100S KR15 TL | 696.0 |
| 235/60R15 | 15 | P235/60R15 98H - KR15 TL | 663.0 |

#### Kenda Klever H/T (H/T) — 17 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 215/65R16 | 16 | P215/65R16 102H - KR50 | 685.9 |
| 215/70R16 | 16 | P215/70R16 100H - KR50 TL | 707.4 |
| 225/70R16 | 16 | P225/70R16 103H - KR50 TL | 721.4 |
| 235/60R16 | 16 | P235/60R16 100H - KR50 TL | 688.4 |
| 225/60R17 | 17 | P225/60R17 99H - KR50 TL | 701.8 |
| 235/55R17 | 17 | P235/55R17 103H KR50 TL KENDA | 690.3 |
| 235/65R17 | 17 | P235/65R17 104H - KR50 TL | 737.3 |
| 245/65R17 | 17 | P245/65R17 111H - KR50 TL | 750.3 |
| 265/65R17 | 17 | P265/65R17 112H KR50 TL KENDA | 776.3 |
| 215/55R18 | 18 | P215/55 R18 99H KR50 KENDA | 693.7 |
| 235/55R18 | 18 | P235/55R18 100H - KR50 TL | 715.7 |
| 245/60R18 | 18 | P245/60R18 105H - KR50 TL | 751.2 |
| 255/55R18 | 18 | P255/55R18 109H KR50 TL KENDA | 737.7 |
| 265/60R18 | 18 | P265/60R18 110 H KR50 TL KENDA | 775.2 |
| 265/65R18 | 18 | P265/65R18 114 H KR50 TL KENDA | 801.7 |
| 235/50R19 | 19 | P235/50R19 99V KR50 KENDA | 717.6 |
| 255/55R19 | 19 | P255/55R19 111 H KR50 KENDA | 763.1 |

#### Kenda Klever M/T (M/T) — 14 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 215/75R15 | 15 | LT215/75R15 6PR 100/97R - KR29 TL | 703.5 |
| 235/75R15 | 15 | LT235/75 R15 104Q KR29 6PR TL 104/101Q KENDA | 733.5 |
| 31X10.50R15 | 15 | 31X10.50 R15 LT 109Q KR29 6PR TL KENDA | 787.4 |
| 32X11.50R15 | 15 | 32X11.50 R15 LT 113Q KR29 6PR TL KENDA | 812.8 |
| 33X12.50R15 | 15 | 33X12.50R15LT 108Q KR29 6P TL OWL KENDA | 838.2 |
| 245/75R16 | 16 | LT245/75 R16 120Q KR29 10PR TL 120/116Q KENDA | 773.9 |
| 265/75R16 | 16 | LT265/75R16 10PR 123/120Q - KR29 TL | 803.9 |
| 285/75R16 | 16 | LT285/75 R16 126Q KR29 10PR TL 126/123Q KENDA | 833.9 |
| 245/70R17 | 17 | LT245/70 R17 119Q KR29 10PR TL 119/116Q KENDA | 774.8 |
| 265/65R17 | 17 | LT265/65R17 120/117Q KR29 TL OWL KENDA | 776.3 |
| 265/70R17 | 17 | LT265/70 R17 121/118Q KR29 10P TL KENDA | 802.8 |
| 265/70R17 | 17 | LT265/70 R17 112Q KR29 6PR TL 112/109Q KENDA | 802.8 |
| 265/70R17 | 17 | LT265/70R17 KR29 | 802.8 |
| 285/70R17 | 17 | LT285/70R17 121/118Q KR29 TL OWL KENDA | 830.8 |

#### Kenda Klever M/T2 (M/T) — 4 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 2.50R17 | 17 | 35*12.50R17LT 121Q KR629 10PR KENDA | None |
| 265/70R17 | 17 | LT265/70R17 121/118Q KR629 10PR TL KENDA | 802.8 |
| 285/70R17 | 17 | LT285/70R17 121/118Q KR629 10P TL KENDA | 830.8 |
| 2.50R20 | 20 | 35*12.50R20LT 125Q KR629 12PR KENDA | None |

#### Kenda Klever R/T (R/T) — 9 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 215/75R15 | 15 | LT215/75R15 6PR 100/97Q - KR601 TL KENDA | 703.5 |
| 225/75R15 | 15 | LT225/75R15 102/99 Q - KR601 TL | 718.5 |
| 235/75R15 | 15 | LT235/75R15 6PR 104/101 Q - KR601 TL | 733.5 |
| 31X10.50R15 | 15 | 31X10.50R15LT 109Q KR601 6PR KENDA | 787.4 |
| 235/70R16 | 16 | LT235/70R16 6PR 104/101 Q - KR601 TL | 735.4 |
| 245/70R16 | 16 | LT245/70R16 6PR 106/103 Q - KR601 TL | 749.4 |
| 265/70R16 | 16 | LT265/70R16 6PR 110/107 Q - KR601 TL | 777.4 |
| 265/65R17 | 17 | LT265/65R17 10PR 120/117Q - KR601 TL | 776.3 |
| 285/60R18 | 18 | LT285/60R18 122/119Q KR601 10PR TL KENDA | 799.2 |

#### Kenda KR26 (TURISMO) — 2 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 195/60R15 | 15 | 195/60 R15 88V KR26 TL KENDA | 615.0 |
| 215/50R17 | 17 | 215/50 ZR17 95W KR26 TL KENDA | 646.8 |

#### Kenda Kaiser KR20 (TURISMO) — 41 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 175/60R13 | 13 | 175/60R13 77H - KR20 TL | 540.2 |
| 185/60R13 | 13 | 185/60R13 80H  - KR20 TL | 552.2 |
| 185/60R14 | 14 | 185/60R14 82H  - KR20 TL | 577.6 |
| 195/60R14 | 14 | 195/60R14 86H KR20 TL KENDA | 589.6 |
| 205/60R14 | 14 | 205/60R14 88 V KR20 TL E4 KENDA | 601.6 |
| 185/55R15 | 15 | 185/55R15 82H - KR20 TL | 584.5 |
| 185/65R15 | 15 | 185/65R15 88H - KR20 TL | 621.5 |
| 195/45R15 | 15 | 195/45R15 78 V KR20 TL E4 KENDA | 556.5 |
| 195/50R15 | 15 | 195/50R15 82V - KR20 TL | 576.0 |
| 195/55R15 | 15 | 195/55R15 85V - KR20 TL | 595.5 |
| 195/60R15 | 15 | 195/60R15 88H  - KR20 TL | 615.0 |
| 195/45R16 | 16 | 195/45R16 84 V KR20 TL E4 KENDA | 581.9 |
| 205/45R16 | 16 | 205/45 ZR16 87W KR20 TL KENDA | 590.9 |
| 205/50R16 | 16 | 205/50 R16 87V KR20 TL KENDA | 611.4 |
| 205/50R16 | 16 | 205/50R16 KR20 87V TL | 611.4 |
| 205/50R16 | 16 | 205/50ZR16 87W KR20 KENDA | 611.4 |
| 205/50R16 | 16 | 205/50 R16 87V KR20 TL KENDA | 611.4 |
| 205/50R16 | 16 | 205/50 R16 91V KR20 TL KENDA | 611.4 |
| 205/55R16 | 16 | 205/55R16  91V - KR20 TL | 631.9 |
| 215/55R16 | 16 | 215/55ZR16 97W - KR20 TL | 642.9 |
| 205/45R17 | 17 | 205/45ZR17 88W - KR20 TL | 616.3 |
| 205/50R17 | 17 | 205/50ZR17 93 W KR20 TL | 636.8 |
| 215/40R17 | 17 | 215/40R17 KR20 83H TL KENDA | 603.8 |
| 215/45R17 | 17 | 215/45 R17 91H KR20 TL KENDA | 625.3 |
| 215/50R17 | 17 | 215/50R17 91V - KR20 TL | 646.8 |
| 225/45R17 | 17 | 225/45R17 94H - KR20 TL | 634.3 |
| 225/45R17 | 17 | 225/45 R17 94H KR20 TL KENDA | 634.3 |
| 225/45R17 | 17 | 225/45 ZR17 91W KR20 TL KENDA | 634.3 |
| 225/50R17 | 17 | 225/50ZR17 98W - KR20 TL | 656.8 |
| 235/45R17 | 17 | 235/45R17 94 H KR20 TL E4 KENDA | 643.3 |
| 235/55R17 | 17 | 235/55ZR17 99 W KR20 TL KENDA | 690.3 |
| 245/40R17 | 17 | 245/40ZR17 KR20 91W TL KENDA | 627.8 |
| 245/45R17 | 17 | 245/45ZR17 KR20 95W TL | 652.3 |
| 225/40R18 | 18 | 225/40ZR18 92W - KR20 TL | 637.2 |
| 225/45R18 | 18 | 225/45ZR18 91W - KR20 TL | 659.7 |
| 245/45R18 | 18 | 245/45ZR18 96W - KR20 TL KENDA | 677.7 |
| 215/35R19 | 19 | 215/35ZR19 KR20 85W TL KENDA | 633.1 |
| 225/35R19 | 19 | 225/35ZR19 88 W KR20 TL E4 KENDA | 640.1 |
| 245/45R19 | 19 | 245/45R19 KR20 P8V TL | 703.1 |
| 245/35R20 | 20 | 245/35ZR20 95 W KR20 TL E4 KENDA | 679.5 |
| 255/35R20 | 20 | 255/35 ZR20 97W KR20 KENDA | 686.5 |

#### Kenda Kenetica Eco (TURISMO) — 21 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 165/65R13 | 13 | 165/65R13 77H - KR203 TL | 544.7 |
| 175/70R13 | 13 | 175/70R13 82H - KR203  TL | 575.2 |
| 185/70R13 | 13 | 185/70R13 86H - KR203  TL | 589.2 |
| 165/65R14 | 14 | 165/65R14 79H - KR203 TL | 570.1 |
| 175/65R14 | 14 | 175/65R14 82H - KR203 TL | 583.1 |
| 175/70R14 | 14 | 175/70R14 84H - KR203 TL | 600.6 |
| 185/60R14 | 14 | 185/60R14 82H  - KR203 TL | 577.6 |
| 185/65R14 | 14 | 185/65R14 86H - KR203 TL | 596.1 |
| 185/70R14 | 14 | 185/70R14 88H - KR203 TL | 614.6 |
| 185/55R15 | 15 | 185/55R15 82 V KR203 TL KENDA | 584.5 |
| 185/60R15 | 15 | 185/60R15 84H - KR203 TL | 603.0 |
| 185/65R15 | 15 | 185/65R15 88H - KR203 TL | 621.5 |
| 195/50R15 | 15 | 195/50R15 82 H KR203 TL KENDA | 576.0 |
| 195/55R15 | 15 | 195/55R15 85 H KR203 TL KENDA | 595.5 |
| 195/60R15 | 15 | 195/60R15 88H  - KR203 TL | 615.0 |
| 195/65R15 | 15 | 195/65R15 91H - KR203 TL | 634.5 |
| 205/65R15 | 15 | 205/65R15 94H - KR203 TL | 647.5 |
| 205/55R16 | 16 | 205/55R16 91 V KR203 TL KENDA | 631.9 |
| 205/60R16 | 16 | 205/60R16 92V  - KR203 TL | 652.4 |
| 215/65R16 | 16 | 215/65R16 98H KR203 KENDA | 685.9 |
| 215/65R16 | 16 | 215/65 R16 98V KR203 TL KENDA | 685.9 |

#### Kenda Komet (TURISMO) — 4 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 165/60R14 | 14 | 165/60R14 75H - KR23 TL | 553.6 |
| 165/65R14 | 14 | 165/65 R14 79H KR23 TL KENDA | 570.1 |
| 185/60R15 | 15 | 185/60R15 84H - KR23 | 603.0 |
| 205/65R15 | 15 | 205/65 R15 94H KR23 TL KENDA | 647.5 |

#### Kenda Emera SUV XL (TURISMO SUV) — 17 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 215/60R17 | 17 | 215/60R17 100V KR605 KENDA | 689.8 |
| 225/55R18 | 18 | 225/55R18 102V KR605 TL XL | 704.7 |
| 225/60R18 | 18 | 225/60R18 100V - KR605 TL | 727.2 |
| 235/50R18 | 18 | 235/50ZR18 101W - KR605 TL XL | 692.2 |
| 235/60R18 | 18 | 235/60R18 107V KR605 TL XL KENDA | 739.2 |
| 225/45R19 | 19 | 225/45ZR19 96W - KR605 TL XL | 685.1 |
| 225/55R19 | 19 | 225/55ZR19 99W - KR605 TL | 730.1 |
| 235/55R19 | 19 | 235/55ZR19 101 W KR605 TL | 741.1 |
| 245/55R19 | 19 | 245/55R19 103V - KR605 TL | 752.1 |
| 245/45R20 | 20 | 245/45ZR20 103W KR605 TL XL | 728.5 |
| 255/45R20 | 20 | 255/45ZR20 105W KR605 KENDA | 737.5 |
| 275/40R20 | 20 | 275/40ZR20 106W KR605 KENDA | 728.0 |
| 275/45R20 | 20 | 275/45ZR20 110W - KR605 TL XL | 755.5 |
| 265/45R21 | 21 | 265/45ZR21 104W KR605 TL | 771.9 |
| 275/45R21 | 21 | 275/45ZR21 110W KR605 TL XL | 780.9 |
| 275/50R21 | 21 | 275/50R21 113V KR605 TL XL KENDA | 808.4 |
| 275/40R22 | 22 | 275/40ZR22 107W KR605 TL XL | 778.8 |

#### Kenda Emera A1 (TURISMO UHP) — 8 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 205/55R16 | 16 | 205/55 ZR16 94W KR41 TL KENDA | 631.9 |
| 205/45R17 | 17 | 205/45ZR17 88W - KR41 TL | 616.3 |
| 215/55R17 | 17 | 215/55ZR17 98 W KR41 KENDA | 668.3 |
| 235/55R17 | 17 | 235/55 ZR17 103W KR41 TL KENDA | 690.3 |
| 235/50R18 | 18 | 235/50 R18 97V KR41 TL KENDA | 692.2 |
| 235/50R18 | 18 | 235/50 ZR18 101Y KR41 TL KENDA | 692.2 |
| 245/45R18 | 18 | 245/45 ZR18 100W KR41 TL KENDA | 677.7 |
| 245/45R18 | 18 | 245/45 ZR18 100W KR41 TL KENDA | 677.7 |

#### Kenda KR32 (TURISMO UHP) — 3 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 205/50R17 | 17 | 205/50 R17 89V KR32 TL KENDA | 636.8 |
| 205/50R17 | 17 | 205/50R17 KR32 89V TL | 636.8 |
| 225/45R19 | 19 | 225/45 ZR19 96W KR32 TL KENDA | 685.1 |

#### Winrun Maxclaw A/T (A/T) — 13 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 175/70R14 | 14 | 175/70R14 88H XL MAXCLAW A/T WINRUN | 600.6 |
| 215/75R14 | 14 | LT215/75R14 D 104/101S MAXCLAW A/T WINRUN | 678.1 |
| 225/70R16 | 16 | 225/70R16 MAXCLAW A/T | 721.4 |
| 235/70R16 | 16 | 235/70R16 106T MAXCLAW A/T | 735.4 |
| 255/70R16 | 16 | 255/70R16 111T MAXCLAW A/T | 763.4 |
| 265/70R16 | 16 | 265/70R16 112T MAXCLAW A/T WINRUN | 777.4 |
| 225/65R17 | 17 | 225/65R17 102T MAXCLAW A/T WINRUN | 724.3 |
| 265/65R17 | 17 | 265/65R17 112T MAXCLAW A/T | 776.3 |
| 265/70R17 | 17 | 265/70R17 115T MAXCLAW A/T WINRUN | 802.8 |
| 275/65R17 | 17 | 275/65R17 115T MAXCLAW A/T WINRUN | 789.3 |
| 265/60R18 | 18 | 265/60R18 110H MAXCLAW A/T | 775.2 |
| 255/55R19 | 19 | 255/55R19 111V XL MAXCLAW A/T WINRUN | 763.1 |
| 265/50R20 | 20 | 265/50 R20 111V XL MAXCLAW A/T WINRUN | 773.0 |

#### Winrun Maxclaw H/T2 (H/T) — 4 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 235/60R16 | 16 | 235/60R16 MAXCLAW H/T2 | 688.4 |
| 225/65R17 | 17 | 225/65 R17 102T MAXCLAW H/T2 WINRUN | 724.3 |
| 235/65R18 | 18 | 235/65 R18 106H MAXCLAW H/T2 WINRUN | 762.7 |
| 235/55R20 | 20 | 235/55 R20 102V MAXCLAW H/T2 WINRUN | 766.5 |

#### Winrun MT305 (M/T) — 2 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 35X12.50R17 | 17 | 35X12.50R17LT 121Q MT305 WINRUN | 889.0 |
| 33X12.50R20 | 20 | 33X12.50 R20LT 114Q MT305 WINRUN | 838.2 |

#### Winrun Maxclaw R/T (R/T) — 3 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 215/65R16 | 16 | 215/65R16 MAXCLAW R/T | 685.9 |
| 265/75R16 | 16 | LT265/75 R16 123/120R MAXCLAW R/T WINRUN | 803.9 |
| 265/65R17 | 17 | 265/65R17 112T MAXCLAW R/T WINRUN | 776.3 |

#### Winrun R330 (TURISMO) — 28 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 175/70R13 | 13 | 175/70R13 82T R330 | 575.2 |
| 185/55R15 | 15 | 185/55 R15 82V R330 WINRUN | 584.5 |
| 185/60R15 | 15 | 185/60 R15 84H R330 WINRUN | 603.0 |
| 195/50R15 | 15 | 195/50R15 82V R330 WINRUN | 576.0 |
| 195/55R15 | 15 | 195/55R15 85V R330 | 595.5 |
| 195/60R15 | 15 | 195/60R15 88V R330 | 615.0 |
| 195/65R15 | 15 | 195/65R15 91V R330 WINRUN | 634.5 |
| 195/65R15 | 15 | 195/65R15 91V R330-e WINRUN | 634.5 |
| 205/65R15 | 15 | 205/65R15 94V R330 WINRUN | 647.5 |
| 205/45R16 | 16 | 205/45 ZR16 87W XL R330 WINRUN | 590.9 |
| 205/55R16 | 16 | 205/55R16 91V R330 | 631.9 |
| 205/60R16 | 16 | 205/60R16 92H R330 WINRUN | 652.4 |
| 205/60R16 | 16 | 205/60R16 92H R330-e WINRUN | 652.4 |
| 215/55R16 | 16 | 215/55R16 97W XL R330 WINRUN | 642.9 |
| 215/60R16 | 16 | 215/60R16 R330 | 664.4 |
| 205/45R17 | 17 | 205/45ZR17 88W XL R330 WINRUN | 616.3 |
| 215/45R17 | 17 | 215/45 ZR17 91W XL R330 WINRUN | 625.3 |
| 225/50R17 | 17 | 225/50 ZR17 98W XL R330 WINRUN | 656.8 |
| 235/50R17 | 17 | 235/50ZR17 100W XL R330 WINRUN | 666.8 |
| 215/55R18 | 18 | 215/55R18 95V R330 WINRUN | 693.7 |
| 225/55R18 | 18 | 225/55 R18 98V R330 | 704.7 |
| 235/50R18 | 18 | 235/50 ZR18 101W XL R330 WINRUN | 692.2 |
| 235/55R18 | 18 | 235/55 R18 104V XL R330 WINRUN | 715.7 |
| 235/50R19 | 19 | 235/50ZR19 103W XL R330 WINRUN | 717.6 |
| 235/55R19 | 19 | 235/55ZR19 101W R330 WINRUN | 741.1 |
| 255/55R19 | 19 | 255/55ZR19 111W XL R330 WINRUN | 763.1 |
| 255/45R20 | 20 | 255/45 ZR20 105W XL R330 WINRUN | 737.5 |
| 275/45R20 | 20 | 275/45 ZR20 110W XL R330 | 755.5 |

#### Winrun R380 (TURISMO SUV) — 9 medidas

| Medida | Aro | Descripción en sistema (índices) | Diámetro mm |
|---|---|---|---|
| 165/65R13 | 13 | 165/65R13 77T R380 | 544.7 |
| 185/60R14 | 14 | 185/60R14 82H R380 | 577.6 |
| 185/70R14 | 14 | 185/70R14 88T R380 | 614.6 |
| 205/60R15 | 15 | 205/60R15 91V R380 WINRUN | 627.0 |
| 215/65R16 | 16 | 215/65R16 98H R380 WINRUN | 685.9 |
| 225/60R17 | 17 | 225/60R17 99V R380 | 701.8 |
| 235/60R17 | 17 | 235/60R17 102H R380 WINRUN | 713.8 |
| 225/60R18 | 18 | 225/60 R18 104V XL R380 WINRUN | 727.2 |
| 235/60R18 | 18 | 235/60R18 107V XL R380 WINRUN | 739.2 |
