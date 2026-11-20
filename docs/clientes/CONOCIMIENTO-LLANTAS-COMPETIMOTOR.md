# Conocimiento de llantas — Competimotor / Mundillantas (Santo Domingo)

**Para qué sirve:** contestar cualquier pregunta de producto de un cliente de Competimotor: de dónde es la marca, para qué sirve el modelo, cuántas lonas tiene, qué incluye la compra.

**De dónde sale:**
- Inventario de Fénix del 6-nov-2026: 379 llantas y 45 marcas.
- Lo que confirmó Jenny el 6 y el 8-nov (qué incluye, garantía, pago).
- Investigación web del 17-nov-2026: fuentes al final.
- Las preguntas reales de clientes de Depot (ago–nov 2026). Competimotor aún no tiene chats propios, y los clientes de llantas preguntan lo mismo.

**El bot ya usa todo esto:** `app/assets/mundillantas/conocimiento-modelos.json`. Este documento es la versión para leer.

**Marcas:** ⚠️ = no confirmado o sin datos públicos. ❓ = falta que Competimotor lo confirme.

---

## 1. Respuestas rápidas (política de Competimotor)

### ¿De dónde son?
Cada llanta tiene su país escrito en el costado («MADE IN …»). Marcas: Falken japonesa (Sumitomo Rubber), Kenda TAIWANESA (nunca decir china), Maxxis taiwanesa, Winrun china; el resto según su ficha de MARCA. Si preguntan dónde se FABRICÓ una llanta concreta, el país exacto está en el costado y el asesor se lo confirma.

### ¿Cuántos km dura?
No hay una cifra de km garantizada por la tienda: el rendimiento depende del uso, la carga, la presión, la alineación y las vías (en Santo Domingo el calor y el lastre gastan más rápido). Para comparar duración entre modelos de una misma marca usa el treadwear (UTQG) de la ficha. PROHIBIDO inventar un número de km o prometer uno.

### ¿Qué incluye? ¿Alineación?
Comprando las 4 llantas incluye enllantaje, balanceo, nitrógeno y ALINEACIÓN. Con 1, 2 o 3 llantas incluye enllantaje, balanceo y nitrógeno (la alineación no). El aro no está incluido. Se vende cualquier número de llantas.

### ¿Qué garantía tiene?
Kenda, Falken, Winrun y Maxxis tienen garantía de fábrica contra defectos; el seguro contra impacto va incluido SOLO en Kenda y Falken (Carlos, 20-nov-2026); los plazos y condiciones los explica el asesor (no prometas meses ni años). En las demás marcas, la garantía de fábrica del fabricante; lo que cubre lo confirma el asesor. Una llanta ya dañada o un reclamo → notificar_vendedor.

### ¿De cuántas lonas es?
Lonas = rango de carga: C = 6 lonas, D = 8, E = 10, F = 12. Una llanta de auto normal (sin LT ni C) equivale a 4 lonas; XL = pasajero reforzada, no es LT. Las lonas de cada producto vienen en el campo «lonas» de la búsqueda; si no viene y la medida es LT/C, el asesor lo confirma — PROHIBIDO inventar un número o un rango («entre 6 y 10»).

### ¿Qué treadwear tiene?
UTQG (treadwear · tracción · temperatura) solo existe en llantas de pasajero; las LT no lo llevan. Sirve para comparar dentro de una misma marca, no entre marcas. Usar el dato del modelo si está en su ficha; si no está, decir que esa medida no lo trae publicado.

### ¿De qué año son? ¿Son nuevas?
El año está en el DOT del costado: los últimos 4 dígitos son semana y año (2325 = semana 23 de 2025). Todas las llantas son nuevas, no reencauchadas. Una llanta sin uso y bien guardada se considera nueva hasta 5 años desde su fabricación; la vida útil se cuenta desde que se monta. El DOT exacto del juego se le confirma (foto o en el local); no inventes un año.

### ¿Cuál agarra mejor en lluvia?
Para lluvia, la ficha del modelo dice su agarre en mojado cuando hay dato (etiqueta europea A/B/C o UTQG tracción AA/A/B). En Santo Domingo llueve mucho: priorizar llantas con buen mojado y cambiar antes de que se gaste la cocada (a ~3 mm). Una M/T siempre frena peor en asfalto mojado. No compares en lluvia modelos sin dato.

### ¿Es dura o suave? ¿Hace ruido?
H/T y turismo son las más suaves y silenciosas, A/T intermedias, R/T y M/T más duras y ruidosas. Una LT de 10 lonas se siente más dura que una P o XL. Una A/T como la A/T4W o la KR628 no zumba de forma molesta.

### ¿Sirve para lodo / lastre / montaña?
Tipo según uso: ciudad/carretera en auto → turismo; SUV solo asfalto → H/T; asfalto + lastre → A/T; piedra, finca, look agresivo → R/T; lodo y trocha → M/T; furgoneta y carga → comercial C/LT; camión → llanta de camión (direccional adelante, tracción atrás). PROHIBIDO recomendar una llanta de turismo para montaña, lastre o camioneta de uso mixto. Usa el tipo y uso de la ficha de cada modelo.

### ¿Puedo poner una más alta o más ancha?
Una medida distinta sirve si el diámetro total no cambia más de ±3 %: diámetro (mm) = aro × 25,4 + 2 × ancho × perfil / 100. Si cambia más, se descalibra el velocímetro y el ABS y puede rozar el guardafango. Índice de carga y velocidad igual o mayor que el original. Si cambia el ANCHO, además el ancho del aro debe estar en el rango de esa medida (lo revisa el técnico): PROHIBIDO decir «sin problema porque es el mismo aro». Más ancha no arregla que patine: pesan más el compuesto y la cocada.

### ¿Run-flat?
Run-flat no se instala: la llanta tiene que venir fabricada así. Si el carro trae inserto run-flat en el aro, un asesor revisa si va llanta normal.

### ¿Gasta más combustible?
Gastan menos las de baja resistencia: Falken ZE310R/ZE310/ZE914 Ecorun y Kenda KR203 Kenetica Eco. M/T y R/T gastan más. La presión baja también sube el consumo.

### ¿Qué presión? ¿Nitrógeno?
La presión es la de la etiqueta del marco de la puerta, en frío. La tienda infla con nitrógeno (va incluido): pierde presión un poco más lento que el aire; igual conviene revisar la presión cada mes, con el calor sube.

### ¿Son reencauchadas?
Todas las llantas son nuevas. El reencauche no se recomienda en auto ni camioneta.

### ¿Qué marcas manejan?
Kenda, Falken, Winrun y Maxxis (las de garantía de fábrica; seguro contra impacto solo Kenda y Falken) y además muchas otras según medida: Haida, Townhall, Durun, iLink, Tourador, Sumaxx, Wanda, Cooper, Continental, Nexen, Goodyear, Toyo, General, Michelin, BFGoodrich y otras. Lo que hay en su medida sale de la búsqueda.

### ¿Qué diferencia hay entre X e Y?
Para diferencias entre modelos usa las fichas de los modelos en mesa: tipo, uso y datos. Si un modelo no tiene ficha, compara solo lo que dice su medida (LT/C, índice de carga y velocidad) y su tipo, sin inventar.


---

## 2. Las marcas

Ordenadas por cuántas medidas hay en el inventario del 6-nov.

| Marca | Medidas | Unidades |
|---|---|---|
| KENDA | 103 | 481 |
| FALKEN | 44 | 194 |
| HAIDA | 39 | 386 |
| WINRUN | 33 | 152 |
| TOWNHALL | 23 | 440 |
| MAXXIS | 20 | 167 |
| DURUN | 17 | 170 |
| ILINK | 9 | 83 |
| TOURADOR | 9 | 132 |
| SUMAXX | 8 | 82 |
| WANDA | 6 | 47 |
| COOPER | 5 | 39 |
| XBRI | 5 | 40 |
| LANWOO | 5 | 48 |
| CONTINENTAL | 4 | 40 |
| KAPSEN | 4 | 38 |
| NEXEN | 3 | 24 |
| VIKRANT | 3 | 25 |
| GOODYEAR | 3 | 18 |
| BARUM | 2 | 14 |
| GENERAL | 2 | 18 |
| TRAZANO | 2 | 20 |
| TOYO | 2 | 13 |
| HAULMAX | 2 | 14 |
| MINERVA | 2 | 18 |
| MILEKING | 2 | 14 |
| CENTARA | 2 | 14 |
| STERPRISIN | 2 | 13 |
| TIANFU | 1 | 11 |
| JOYROAD | 1 | 6 |
| ROCKBLADE | 1 | 7 |
| TORNEL | 1 | 6 |
| ANNAITE | 1 | 7 |
| BFGOODRICH | 1 | 7 |
| POWERHUB | 1 | 9 |
| WIDEWAY | 1 | 7 |
| DOUBLE | 1 | 6 |
| HIFLY | 1 | 6 |
| FENIXWAY | 1 | 6 |
| ROADX | 1 | 7 |
| SPORTRAK | 1 | 6 |
| LINGLONG | 1 | 7 |
| MICHELIN | 1 | 6 |
| WNRUN | 1 | 13 |
| FULL | 1 | 6 |
| TRIANGLE | 1 | 6 |

### KENDA
Marca TAIWANESA (nunca decir china), fundada en 1962 en Yuanlin, con centro técnico en Akron (EE. UU.); ~29.º fabricante del mundo. Tiene plantas en Taiwán, China, Vietnam e Indonesia; el país exacto está en el costado.

### FALKEN
Marca japonesa del grupo Sumitomo Rubber (el mismo de Dunlop en Japón), 8.º fabricante de llantas del mundo (Tyrepress 2026). Fabrica en plantas propias de Japón, Tailandia, Turquía, Indonesia, China, Brasil y Sudáfrica; lo que llega a Ecuador suele venir de Japón o Tailandia según el lote y la medida — el país exacto está escrito en el costado («MADE IN …»).

### HAIDA
Marca china de Sichuan Haida Rubber Group (ex Sichuan Rubber Factory, fundada 1970, controlada por el Estado), fabricada en Sichuan, China (homologación ECE a nombre de Sichuan Tyre & Rubber Co., Jianyang). Mismo grupo que TIANFU y MILEKING. Nivel económico. Reputación: llanta barata y de amplio catálogo (pasajero, UHP, A/T, R/T, M/T); casi sin pruebas independientes publicadas; cumple para uso diario pero no compite en frenado mojado con marcas medias.

### WINRUN
Marca china (Guangzhou), la opción de entrada. Tiene homologación europea (marca E) y DOT de EE. UU.

### TOWNHALL
Marca china de fabricante NO confirmado públicamente (los códigos TH- se parecen a los de Qingdao Taihao Tyre, Shandong, pero no hay fuente que lo diga: no confirmado). Nivel económico. Se vende en México y Latinoamérica (Walmart MX, MercadoLibre) con A/T, H/T, M/T y pasajero. Reputación: marca de precio, sin pruebas independientes ni etiqueta UE encontrada.

### MAXXIS
Taiwán. Dueño: Cheng Shin Rubber Ind. Co. (CST), con sede en Changhua. Tiene fábricas en Taiwán, China (varias en Xiamen, además de Kunshan y Chongqing), Tailandia (Rayong), Vietnam (Dong Nai), Indonesia e India. No está confirmado qué planta abastece a Ecuador; las medidas de auto y camioneta para Latinoamérica suelen venir de China, Taiwán o Tailandia. Ranking: fuera del top 10 mundial. Históricamente estuvo cerca de los puestos 9 a 12, pero no confirmamos su posición en Tyrepress 2026 ni en Tire Business 2025. Nivel: medio, la marca de valor más seria de Asia. Reputación: duradera y bien construida por su precio, aunque en lluvia frena peor que las premium.

### DURUN
Marca china de Shandong Yongtai Chemical Group (Guangrao, Shandong, China); Durun International Trade es su filial exportadora. Nivel económico/entrada. No se encontró relación con Sentury (no confirmado). Reputación: llanta de precio con presencia en Europa, Nueva Zelanda y EE. UU.; desempeño básico, pocas pruebas independientes.

### ILINK
Marca china producida por Shandong Longyue Rubber Co. (Shandong); las fuentes discrepan si Longyue pertenece al grupo Zodo o a Yuelong Tire Group. Nivel económico (TyreReviews la clasifica 'budget'). Vendida en Reino Unido (Halfords, Blackcircles) y Oceanía. Reputación: económica, aceptable para uso normal; no destaca en mojado.

### TOURADOR
Marca china de Qingdao Otai Tire (en el mercado desde 2017), fabricada en China y también en Tailandia según minoristas europeos; registros UE vía Honch Husdow (Chipre). Nivel económico. Reputación: en una prueba de TyreReviews el X Wonder TH1 quedó último con diferencia grande y poco agarre en seco y mojado; TheTyreLab le da 4,5/10.

### SUMAXX
Marca china de Qingdao Sunforce Tyre Co. (Qingdao, Shandong), especializada en 4x4/todoterreno; registrada en la base de etiquetas UE (EPREL). Nivel económico. Reputación: enfocada en A/T para pickups; sin pruebas independientes publicadas.

### WANDA
Marca china de Tianjin Wanda Tyre Group (Tianjin, fundada 1988); también se vende como 'Journey' o 'WD' en algunos mercados. Nivel económico. Fuerte en llantas de remolque, van y especiales. Reputación: correcta para carga liviana; poca prueba independiente en pasajero.

### XBRI
Marca brasileña (XBRI Pneus, ligada al grupo chino Sunset Tires) fabricada en China, Camboya, Vietnam, Tailandia y Serbia; anunció planta en Paraná, Brasil, en sociedad con Linglong (fechas aún inciertas). Nivel económico-medio en Sudamérica. Reputación: muy difundida en Brasil, con opiniones de buen precio/rendimiento; pocas pruebas técnicas independientes.

### LANWOO
Marca china; la marca registrada pertenece a Shandong Kaixuan Tire Co. (registro de marca 2015; fabricante real no confirmado). Nivel económico. Fuera de Ecuador casi solo aparece en pasajero; sus modelos de camión (LWT52, LWD66, X5 PRO) no tienen fichas públicas. Reputación: sin datos públicos.

### COOPER
EE. UU., fundada en Findlay, Ohio. Desde 2021 pertenece a Goodyear, que es el n.º 3 mundial. Fábricas: Findlay (OH), Texarkana (AR), Tupelo (MS), Guadalajara (México), Kruševac (Serbia) y Kunshan (China). No está confirmado qué planta surte a Ecuador. Nivel: medio-alto, con fuerte presencia en camioneta y 4x4. Reputación: robusta y de buen rendimiento en kilometraje, con modelos clásicos como la Cobra de letras blancas y una buena línea off-road.

### KAPSEN
Marca china de Shandong Huasheng Rubber Co. (Guangrao, Shandong, fundada 1994), hermana de HABILEAD (los modelos se comparten: RS23, HD918). No se encontró vínculo con Sailun ni Shengtai (no confirmado). Nivel económico. Reputación: muy vendida en Europa como opción barata; desempeño básico.

### CONTINENTAL
Alemania (Hannover). Dueño: Continental AG. Es el n.º 4 mundial en Tyrepress 2026, con €13,80 mil millones en ventas de llantas en 2025, y también el 4.º en Tire Business 2025. En Ecuador tiene planta propia: Continental Tire Andina en Cuenca, la ex-ERCO fundada en 1955, que pasó a ser de Continental en 1987 al comprar General Tire y tiene mayoría Continental desde 2009. Esa planta fabrica Continental, General y Barum para auto, camioneta y camión, y exporta a la región andina. Nivel: premium. Reputación: frenado en mojado de primera. La PowerContact 2 que vendemos es fabricada en Cuenca.

### VIKRANT
Marca india del grupo JK Tyre (JK compró Vikrant Tyres de Mysore en 1997; dato de conocimiento general, no reverificado en esta búsqueda); fabricada en la India. Nivel económico-medio. Especialista en llantas convencionales (diagonales) de camión y carga liviana; JK la comercializa junto a JK y Tornel. Reputación: carcasas consideradas buenas para reencauche (según un minorista).

### NEXEN
Corea del Sur. Dueño: Nexen Tire Corp. (grupo Nexen). Fábricas: Yangsan y Changnyeong (Corea), Qingdao (China) y Žatec (República Checa, desde 2019); la planta en EE. UU. está en pausa. No está confirmado qué planta surte a Ecuador. Ranking: fuera del top 10, aproximadamente entre los puestos 18 y 22 (no confirmado). Nivel: medio, con buena relación precio-calidad. Equipa de fábrica a algunos autos europeos y coreanos. Reputación: cómoda y silenciosa para su precio; dura menos que las premium y casi no aparece en pruebas de revistas.

### GOODYEAR
EE. UU. (Akron, Ohio). Dueño: The Goodyear Tire & Rubber Co. Es el n.º 3 mundial en Tyrepress 2026, con €15,56 mil millones en 2025. En Sudamérica produce en Brasil, Perú, Chile y Colombia; la planta de Yumbo (Colombia) estuvo en huelga y con posible cierre en 2026. No está confirmado de qué planta viene lo que se vende en Ecuador. Nivel: premium. Reputación: marca muy conocida, con buen equilibrio y fuerte en camión y camioneta. Algunos modelos de Latinoamérica son distintos de los de EE. UU.

### MILEKING
Marca china del grupo Sichuan Haida / Sichuan Tyre & Rubber (homologación ECE compartida HAIDA/Mileking, Sichuan). Un minorista la ubica en el grupo 'Acmex' (no confirmado). Nivel económico. Varios de sus diseños son gemelos de Haida (MK837≈HD837, MK937≈HD937; inferido por la numeración, no confirmado). Reputación: económica, sin pruebas independientes.

### HAULMAX
Marca diseñada en Australia y fabricada en China (minorista australiano la atribuye a Harvest Tyres, fundada 2004); conocida sobre todo en llantas industriales/OTR y de remolque. Que las medidas convencionales 7.50-15 y 7.00-16 sean del mismo dueño no está confirmado. Nivel económico. Reputación: sin datos públicos para estas medidas.

### CENTARA
Marca china de entrada fabricada por Shandong Zhongyi Rubber Co. (Shandong), según minoristas. Nivel económico. Vendida en Reino Unido, Australia y EE. UU. Reputación: llanta de precio, adecuada para uso normal; sin pruebas independientes destacadas.

### STERPRISIN
Sin datos públicos sobre el fabricante ni la marca (no aparece en bases europeas ni de EE. UU.). Probablemente marca china de importador (no confirmado). Nivel económico. Reputación: sin datos públicos.

### TRAZANO
Marca de ZC Rubber / Zhongce Rubber Group (Hangzhou, China), el mayor fabricante de llantas de China (también hace Westlake y Goodride); en la UE la registra Zhongce Europe GmbH. Nivel económico. Reputación: respaldo de fabricante grande; calidad consistente para su precio.

### MINERVA
Marca belga de Deldo Autobanden N.V. (mayorista de Brasschaat, Bélgica, creada en 1992), fabricada en China (un minorista menciona a South China Tire & Rubber; no confirmado oficialmente; antiguamente parte se hacía en Rumania con Continental). Nivel económico. Reputación: marca de mayorista europeo con etiqueta UE completa; rendimiento correcto para su precio.

### BARUM
República Checa (Otrokovice). Es la marca económica de Continental AG desde 1993. Se fabrica en Otrokovice y también en la planta Continental de Cuenca, Ecuador, según El Mercurio (2023). Su ranking es el de Continental (n.º 4). Nivel: económico o de presupuesto, pero con ingeniería Continental. Reputación: gasta poco combustible y dura un poco más que el promedio. En las pruebas ADAC sale «satisfactorio», con frenado en seco y mojado por debajo de las premium.

### GENERAL
General Tire, fundada en Akron (EE. UU.) en 1915. Desde 1987 es marca de Continental AG, la n.º 4 mundial. En la región se fabrica en Cuenca, Ecuador (Continental Tire Andina, ex-ERCO): los catálogos colombianos indican país de origen Ecuador para la Altimax XP7 y la Grabber ATX 225/70R16. También tiene plantas en EE. UU. y México. Nivel: medio, la marca de valor de Continental. Reputación: llanta nacional confiable y fácil de reponer; la Grabber ATX tiene buena fama en camioneta.

### TOYO
Japón (Itami, Hyogo). Dueño: Toyo Tire Corporation. Fábricas: Japón (Sendai, Kuwana), EE. UU. (White, Georgia), Malasia, Serbia (Inđija) y China. No está confirmado qué planta surte a Ecuador. Ranking: fuera del top 10, alrededor de los puestos 12 a 15 (no confirmado). Nivel: medio-alto, casi premium en SUV, off-road y alto desempeño. Reputación: muy buena en pickups y SUV deportivas (líneas Proxes y Open Country) y es dueña de Nitto.

### TIANFU
Marca china del mismo grupo Sichuan Haida Rubber (Sichuan, China), hermana de HAIDA y MILEKING. Nivel económico, orientada a medidas comerciales y de carga liviana. Reputación: sin pruebas independientes publicadas; se vende por precio.

### JOYROAD
Marca china de volumen; las fuentes discrepan sobre el fabricante (Shandong Haohua Tire o Shandong Zhongyi Rubber). Registrada en la base de etiquetas UE. Nivel económico. Reputación: llanta de precio, vendida en Reino Unido y EE. UU.; sin pruebas destacadas.

### ROCKBLADE
Marca china del grupo Zodo Tire (fábricas en China); registros UE vía importador HJH China Supplies con correo de zodotire.cn. Nivel económico, gama 4x4 (H/T, A/T, R/T, M/T). Reputación: sin pruebas independientes publicadas.

### TORNEL
Marca mexicana (familia Tornel, primera llanta en 1933) comprada por JK Tyre de la India en 2008; hoy JK Tornel S.A. de C.V. la fabrica en sus plantas de México. Nivel económico-medio. Reputación: marca histórica en México, conocida por precio y llantas convencionales; calidad correcta sin destacar.

### ANNAITE
Marca china; las fuentes discrepan: Annaite Tyre Co. (Qingdao, Shandong, ligada al grupo Xingyuan) o Shandong Zhongyi Rubber. Nivel económico. Fuerte en camión y carga liviana; vendida en Sudáfrica y Latinoamérica. Reputación: llanta de precio, sin pruebas independientes.

### POWERHUB
Sin datos públicos sobre el fabricante (no aparece en bases internacionales). Probablemente marca china de importador (no confirmado). Nivel económico. Reputación: sin datos públicos.

### WIDEWAY
Marca china con base de producción en Shouguang (Weifang, Shandong), según un directorio comercial. Nivel económico, aunque se publicita como 'premium' (afirmación del vendedor, no verificada). Vendida en Reino Unido, Australia y Nueva Zelanda. Reputación: sin pruebas independientes.

### HIFLY
Marca china de Shandong Hengfeng Rubber & Plastic (Shandong, fundada 1995; cuatro plantas en Shandong según un minorista). NO es de Sailun: ninguna fuente la vincula. Nivel económico. Reputación: muy difundida en camión, van y pasajero barato; rendimiento básico.

### FENIXWAY
Sin datos públicos sobre la marca ni el fabricante (no aparece en ninguna base consultada). Probablemente marca china de importador (no confirmado). Reputación: sin datos públicos.

### ROADX
Marca vinculada a Sailun Group (Qingdao, China): en la base de etiquetas UE el proveedor de RoadX es Sailun Europe GmbH. Fabricada en China (planta exacta no confirmada; Sailun también produce en Vietnam y Camboya). Nivel económico-medio. Reputación: respaldada por un fabricante grande con buena fama en camión.

### SPORTRAK
Marca china de Sportrak Tire Group Ltd / Sportrak Tire Co. (Huangdao, Qingdao, Shandong), empresa comercializadora fundada en 2009; fabricante real no confirmado. Nivel económico. Reputación: sin datos públicos en camión.

### LINGLONG
Marca de Shandong Linglong Tire (Zhaoyuan, Shandong), de las mayores llanteras chinas y en el top 20 mundial; plantas en China, Tailandia y Serbia; proveedor de equipo original de varias marcas. Nivel medio. Reputación: la más sólida de las chinas en esta lista; tiene etiqueta UE y aparece en pruebas de AutoBild (frena peor en mojado que las líderes).

### TRIANGLE
Marca de Triangle Tyre Co. (Weihai, Shandong, China), fabricante estatal grande; fuerte en camión y OTR. Nivel medio-económico. Reputación: marca china de camión reconocida internacionalmente, con buena relación precio/duración.

### BFGOODRICH
EE. UU. Desde 1990 es marca de Michelin, la n.º 1 mundial. La All-Terrain T/A KO3 se fabrica en EE. UU., Brasil y Tailandia, según Discount Tire y un proveedor. Nivel: premium en todo terreno. Reputación: la All-Terrain es la referencia mundial de llanta A/T: dura, resiste cortes en lastre y piedra, y cuesta más.

### MICHELIN
Francia (Clermont-Ferrand). Dueño: Compagnie Générale des Établissements Michelin. Es el n.º 1 mundial en Tyrepress 2026, con €24,75 mil millones en 2025, y también en Tire Business 2025. Tiene plantas en todos los continentes; en Latinoamérica, en Brasil y México. No está confirmado de dónde viene lo que llega a Ecuador. Nivel: premium. Reputación: la que más dura y la más pareja en mojado; es la más cara, pero el costo por kilómetro suele ser bueno.

### DOUBLE COIN
Marca china del grupo estatal Shanghai Huayi (Double Coin Holdings, Shanghai); fabricada en China. Nivel medio-económico en camión, con presencia de décadas en EE. UU. y Europa. Reputación: una de las marcas chinas de camión más conocidas; carcasas consideradas reencauchables (dato de mercado, no prueba formal).

### FULL RUN
FULLRUN: marca de Qingdao Fullrun Tyre Tech Corp. (Qingdao, Shandong; registrado ante la NHTSA de EE. UU.), que también hace Antyre, Autogrip, Fullway, Highplus y Turnpike. Nivel económico. Reputación: muy vendida en camión en EE. UU. y Latinoamérica por precio.


---

## 3. Fichas por modelo

Agrupadas por marca. **Alias** = cómo lo reconoce el bot en lo que escribe el cliente.

### KENDA

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Kenda Emera A1 KR41** | Deportiva UHP (auto) | Sedán o auto deportivo, asfalto. La mejor Kenda de auto en lluvia. | Hecha en Taiwán. Compuesto de alta sílice, casi todas XL. Etiqueta europea mojado B. En pruebas de frenado en mojado frenó solo 1,9 % más largo que las premium. | Es la Kenda de auto que mejor agarra en lluvia: en pruebas frenó casi igual que las premium. |
| **Kenda Emera SUV KR605** | Turismo SUV (100 % asfalto) | SUV moderna con aro grande (17–22) que nunca sale del pavimento. NO para lastre frecuente. | XL en varias medidas. Etiqueta europea mojado C. Ej. 215/60R17 96H, tracción B, temperatura A. | Es la Kenda para SUV de ciudad con aro grande. |
| **Kenda KR12** | Camión liviano (costillas) | Camión liviano de carga (medidas tipo 7.00R15 y 7.00R16). | 10 a 12 lonas según medida (en el sistema: 7.00R15 de 12 lonas y 7.00R16 de 10 lonas). Dibujo de costillas. Pregunta clave: si su camión usa tubo. | Es la Kenda para camión liviano de carga. |
| **Kenda Kaiser KR20** | Turismo deportiva (auto) | Auto de pasajeros con look deportivo, 100 % asfalto. NO es para camioneta, piedra ni montaña. | Dibujo direccional en V (espina de pescado). Buen agarre en seco y buen precio. OJO: los dueños la califican floja en lluvia (4,6/10 en mojado); para quien maneja mucho con lluvia conviene KR41 o KR203. | Es la Kenda de auto con dibujo deportivo en V: buen agarre en seco a buen precio. |
| **Kenda Kenetica Eco KR203** | Turismo confort (auto) | Auto urbano, taxi, Uber, ciudad y carretera. NO para piedra ni camioneta. | Silenciosa (68 dB) y cómoda. Etiqueta europea: mojado C, consumo D. Sucesora de la KR23. | Es la Kenda de confort para ciudad: silenciosa y suave, pensada para el día a día. |
| **Kenda Klever A/T KR28** | A/T (1.ª generación) | Camioneta y 4x4 de uso mixto que prioriza confort en carretera. Es A/T (todo terreno mixta): asfalto con lluvia y lastre. | UTQG 660 A B. 4,5/5 con 99 reseñas de dueños. Sin sello 3PMSF. Es la A/T de 1.ª generación; la KR628 es la nueva. Las lonas dependen de la medida: confirmarlas en la descripción del sistema. | Es la Klever A/T de Kenda: todo terreno mixta con confort de carretera. |
| **Kenda Klever A/T KR608** | A/T robusta (medidas LT) | Camioneta de trabajo que hace lastre con piedra (D-Max, Hilux, BT-50, Great Wall). | Otro dibujo de Klever A/T, con bloques rígidos que resisten cortes y limpian el barro. Casi todo en medidas LT de 6, 8 y 10 lonas. | Es la Klever A/T más robusta de Kenda, en medidas LT para trabajo. |
| **Kenda Klever A/T2 KR628** | A/T (2.ª generación) | SUV, camioneta y 4x4 de uso mixto: lluvia, asfalto y lastre. La Kenda «para todo». | Diseñada en el centro técnico de Kenda en Akron (EE. UU.). Sello 3PMSF en todas las medidas (certificación de tracción en condiciones severas). UTQG 560 A B. 4,6/5 con 270 reseñas de dueños, 95 % la volvería a comprar. Silenciosa para ser A/T. Medidas P y LT de 10 lonas. | Es la all-terrain nueva de Kenda para lluvia, asfalto y lastre: silenciosa y con 4,6 de 5 en 270 reseñas de dueños. |
| **Kenda Klever H/P KR15** | H/T (SUV de carretera) | SUV o 4x4 de carretera con tierra ligera (Vitara, Grand Vitara, SUV clásica aro 15). | M+S. UTQG 400 A A (tracción A en mojado). Cómoda y silenciosa. Velocidad S/T. | Es la Kenda de carretera para SUV: cómoda, silenciosa y con tracción A en mojado. |
| **Kenda Klever H/T KR50** | H/T (SUV y camioneta de asfalto) | SUV y camioneta 100 % asfalto. Si el cliente hace lastre, mejor KR628. | Taco cerrado, silenciosa y cómoda. Treadwear 500 en 235/55R18. | Es la Kenda de carretera para SUV y camioneta: silenciosa y cómoda en asfalto. |
| **Kenda Klever M/T KR29** | M/T (barrosa) | Lodo, cantera, trocha pesada. NO es la opción equilibrada para quien pide A/T. | Crestas que expulsan piedras, laminillas hasta el fondo. Aro 16–17 grande: 10 lonas rango E; aro 15 y flotación (31x10.50, 32x11.50, 33x12.50R15): 6 lonas. Más ruidosa en asfalto. | Es la barrosa de Kenda para lodo y trocha. |
| **Kenda Klever M/T2 KR629** | M/T (2.ª generación) | Lodo y off-road extremo, camionetas levantadas. | 3 lonas en el costado, protector de aro, menos ruido que la KR29. Rango E (10 lonas); 35x12.50R20 de 12 lonas. 4,5/5 con 46 reseñas. | Es la barrosa nueva de Kenda para off-road extremo. |
| **Kenda Klever R/T KR601** | R/T (entre A/T y M/T) | 4x4 en tierra, piedra y lodo que igual rueda en carretera entre semana. | Costado de 3 lonas en todas las medidas (resiste cortes de piedra). M+S. En aro 15–16 son 6 lonas; en 17–18 grandes, 10 lonas rango E. 4,7/5 con 705 reseñas de dueños: la Kenda mejor calificada. Algo más pesada y ruidosa que una A/T. | Es la Kenda mejor calificada: 4,7 de 5 con más de 700 reseñas, con costado de 3 lonas que aguanta piedra. |
| **Kenda Komendo KR33** | Comercial C (van y furgoneta) | Furgoneta y van de reparto. | Estable con y sin carga. Lonas según medida (6–8). | Es la Kenda comercial para furgoneta y van. |
| **Kenda Komendo KR33A** | Comercial C (más carga) | Van y furgoneta con más carga. | La misma Komendo en medidas con índice de carga más alto: 8, 10 y 12 lonas según medida (225/70R15C = 8 lonas). | Es la Komendo reforzada para van con más carga. |
| **Kenda Komet Plus KR23** | Turismo básica (auto) | Auto pequeño, uso urbano. | Modelo básico; Kenda ya la reemplazó por la KR203. | Es la Kenda básica de auto pequeño. |

### FALKEN

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Falken Azenis FK520L** | Deportiva UHP | Auto deportivo o sedán de alta gama (aro 17–20), 100 % asfalto. | La deportiva tope de Falken (2023), sucesora de la FK510 (n.º 1 en desgaste en ADAC 2022). Más agarre y precisión; dura menos que una de turismo. | Es la deportiva tope de Falken, para autos de alta gama que piden agarre. |
| **Falken Wildpeak A/T Trail** | A/T para SUV y crossover | SUV y crossover de uso mixto: 80 % asfalto / 20 % tierra (Sportage, Tucson, RAV4, Vitara, Creta, X-Trail, Duster). Lastre, camino de tierra y lodo ligero; no es para roca ni lodo profundo. | Sello 3PMSF. UTQG aprox. 680 AA (varía por medida). Solo medidas P y XL, no LT. 4,7/5 con 129 reseñas de dueños. Más cómoda y silenciosa que una A/T de camioneta. | Es la all-terrain de Falken pensada para SUV: se siente como llanta de carretera en el asfalto y aguanta lastre cuando toca. |
| **Falken Wildpeak A/T3W** | A/T (camioneta y 4x4) | 4x4 y camioneta on/off road. Generación anterior a la A/T4W. | Sello 3PMSF. UTQG 660. Vino de fábrica en el Jeep Gladiator 2020. Su versión europea/asiática (A/T3WA, misma familia) quedó 2.ª de 8 en el test ADAC 2025. Frente a la BFG KO2: más silenciosa, frena mejor en mojado; la KO2 tiene costado más duro. | Es la all-terrain clásica de Falken, la que vino de fábrica en el Jeep Gladiator. |
| **Falken Wildpeak A/T4W** | A/T (camioneta y 4x4) | Camioneta y 4x4 de uso mixto real: 50 % asfalto / 50 % tierra (Hilux, D-Max, BT-50, Ranger, Fortuner, Wingle). No es solo para 4x4: va perfecta en 4x2. | Nueva generación (2024) de la A/T3W: banda más rígida, costado de 3 capas en medidas seleccionadas, laminillas hasta el fondo (agarra hasta el final), sello 3PMSF. N.º 1 en el comparativo all-terrain 2025 de Tyre Reviews. En la prueba de Tire Rack 2024 frenó ~8 % mejor en mojado que la BFGoodrich KO3 (la KO3 gana en nieve). Hay versión P/XL (más cómoda) y LT de 8–10 lonas (para carga). | Es la llanta mixta más premiada del momento: primera en el comparativo all-terrain 2025 de Tyre Reviews y en mojado frena mejor que la BFGoodrich KO3. |
| **Falken Wildpeak M/T** | M/T (barrosa) | Lodo, piedra, trocha, finca. NO para quien anda casi todo en asfalto mojado. | Costado DURASPEC de 3 capas, de las M/T más silenciosas del mercado. Velocidad Q (160 km/h). Como toda M/T frena peor en asfalto mojado, se gasta más rápido y consume más. Su versión de carrera ganó la clase Trophy Truck del NORRA 1000 en 2026. | Es la barrosa de Falken: costado de 3 capas y de las M/T más silenciosas, para lodo y trocha. |
| **Falken Wildpeak R/T01** | R/T (entre A/T y M/T) | 4x4 que hace tierra, lodo y piedra seguido sin perder confort en carretera; look agresivo. Es la opción off-road, NO la «equilibrada». | Lanzada en 2024, costado de 3 capas resistente a cortes, medidas LT. Mejor que la A/T4W en roca y lodo, algo más ruidosa. Sin sello 3PMSF: en asfalto mojado queda por debajo de la A/T4W. | Es la Falken para campo de verdad: costado de 3 capas que aguanta piedra, pero sigue siendo manejable en carretera. |
| **Falken Ziex CT60 A/S** | H/T para SUV (100 % asfalto) | SUV y crossover que NO sale del asfalto (Tucson, Sportage, RAV4, CX-5, Creta). | UTQG 600–740 AA según medida. Primera Falken diseñada para crossover (2017). Viene de fábrica en el Mazda CX-90. Buen agarre en seco y mojado, silenciosa, gasta menos que una A/T. | Es la Falken para SUV de asfalto: silenciosa, buena en lluvia y la que viene de fábrica en el Mazda CX-90. |
| **Falken Ziex ZE310R Ecorun** | Turismo (auto) | Auto de pasajeros, ciudad y carretera. NO es para montaña, piedra ni camioneta. | Frenado en mojado clase A en la etiqueta europea (la mejor nota). UTQG 320 B A. Ecorun = baja resistencia, ahorra combustible. Falken dice +30 % de vida frente a la ZE914. | Es la Falken de auto: japonesa, con la mejor nota posible en frenado sobre mojado de la etiqueta europea. |
| **Falken Ziex ZE914 Ecorun** | Turismo (auto) | Auto y crossover de asfalto. Generación anterior a la ZE310. | Llanta de verano de 2012, reemplazada por la ZE310. En pruebas de revista quedó a media tabla en mojado. | Es la Falken de auto de la generación anterior; si hay ZE310 en su medida, esa es la más nueva. |

### HAIDA

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Haida HD EX Comfort (no confirmado)** | turismo | Autos de uso urbano y carretera, enfoque confort. | sin datos públicos; el nombre comercial no aparece en bases internacionales. | Llanta de pasajero cómoda y silenciosa para uso diario. |
| **Haida HD665** | turismo | Autos sedán rin 16. | sin datos públicos | Llanta de pasajero económica para sedán rin 16. |
| **Haida HD667** | turismo | Autos pequeños y medianos. | sin datos públicos | Llanta de pasajero económica para uso diario. |
| **Haida HD668** | turismo / SUV ligera | Crossovers y sedanes rin 16. | sin datos públicos | Llanta económica para crossover de uso urbano. |
| **Haida HD737** | comercial C (van/LT) | Furgonetas y camionetas de carga. | Walmart EE. UU.: toda estación, 205/75R16C 110/108R; 4,2/5 con solo 5 reseñas. 10PR según Fénix. | Llanta de carga de 10 lonas para van o camioneta de trabajo. |
| **Haida HD818 A/T** | A/T (LT) | Pickups con uso mixto. | sin datos públicos; 235/75R15LT 10PR según Fénix. | All terrain de 10 lonas, aguanta peso y lastre. |
| **Haida HD828 A/T** | A/T (LT) | Pickups y SUV en asfalto, lastre, lodo leve y arena. | Minorista EE. UU.: A/T toda estación para LT/SUV; garantía de 55.000 millas en 285/70R17 (según el minorista). Reseñas mínimas (1 opinión). Sin etiqueta UE confirmada. | All terrain para pickup que va de la carretera al camino de lastre, con buen precio por lo que ofrece. |
| **Haida HD829 A/T** | A/T (LT) | Pickups grandes rin 18-20. | Listada como A/T por minorista EE. UU. 10PR según Fénix. | All terrain de 10 lonas para pickup grande. |
| **Haida HD837** | H/T (SUV) | SUV y crossovers en asfalto. | Gemela probable de Mileking MK837 (toda estación SUV, según minoristas; no confirmado que sean idénticas). | Llanta de carretera para SUV, cómoda y económica. |
| **Haida HD868 M/T** | M/T (LT) | Pickups 4x4 en lodo, piedra y trocha. | Minorista: banda profunda con bloques grandes y separados para evacuar lodo. 10PR LT según Fénix. | Llanta de lodo de 10 lonas para quien entra a finca o trocha en invierno. |
| **Haida HD878 R/T** | R/T (LT) | Pickups y Jeep con uso mixto pesado. | Minoristas EE. UU.: rugged terrain, banda autolimpiante y compuesto resistente a pinchazos (afirmación comercial). 10PR 121/118R en 285/70R17 según Fénix. | R/T de 10 lonas: más agarre que una A/T en lodo sin ser tan ruidosa como una de lodo. |
| **Haida HD921** | turismo (sport) | Autos con rin 15 a 16 de perfil bajo. | Minorista UE: llanta de verano para manejo diario, marca de enfoque económico. | Llanta deportiva de perfil bajo a precio económico. |
| **Haida HD927** | turismo UHP | Sedanes y SUV de rin 17 a 19 de perfil bajo. | sin datos públicos; 215/45R17 91W según Fénix. | Llanta deportiva de perfil bajo a precio económico. |
| **Haida HD937** | turismo UHP / SUV | Sedanes y SUV de rin 19-20. | Minoristas la listan como alto desempeño (verano o toda estación según la fuente). | Llanta de alto desempeño para rin grande a precio muy competitivo. |
| **Haida Runspirit (no confirmado)** | turismo | Autos sedán y hatchback. | sin datos públicos; 185/65R15 88H y 195/65R15 91V según Fénix. | Llanta de pasajero económica para sedán, buen precio para cambiar las cuatro. |

### WINRUN

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Winrun MT305** | M/T (barrosa) | Off-road, lodo y piedra al menor precio. | Medidas grandes LT (35x12.50R17 = 10 lonas; 33x12.50R20 = 6 lonas). Ruidosa en asfalto como toda M/T. | Es la barrosa económica. |
| **Winrun Maxclaw A/T** | A/T | Camioneta y SUV de uso mixto al menor precio. | All-terrain de entrada. | Es la all-terrain económica, para uso mixto. |
| **Winrun Maxclaw H/T2** | H/T (SUV y camioneta de asfalto) | SUV y camioneta 90 % carretera. | Compuesto all-season, huella plana para desgaste parejo. | Es la Winrun de carretera para SUV y camioneta. |
| **Winrun Maxclaw R/T** | R/T | 4x4 mixto con look agresivo. | Medidas LT (LT265/75R16 123/120R = 10 lonas, rango E). | Es la R/T económica, de look agresivo. |
| **Winrun R330** | Deportiva UHP (auto) | Auto y SUV deportivo con aro grande al menor precio. | UTQG 420 AA. Etiqueta europea mojado C (B en las medidas grandes nuevas). Algo de ruido a alta velocidad. | Es la Winrun deportiva para aro grande al menor precio. |
| **Winrun R380** | Turismo (auto) | Sedán, compacto y SUV pequeña de asfalto (Aveo, Sail, Spark, Rio, Picanto). | Etiqueta europea mojado B (mejor que varias de más precio), consumo D. UTQG 420 AA. Cómoda. | Es la Winrun de auto: económica y con nota B en frenado sobre mojado. |

### TOWNHALL

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Townhall TH-161** | turismo (pasajero) | Autos y crossovers pequeños de uso urbano y carretera. | sin datos públicos; se ofrece en rin 13 a 16 con índices H/V según Fénix (p. ej. 185/65R14 86H, 195/50R15 82V). | Llanta de pasajero económica para el día a día en ciudad y carretera. |
| **Townhall TH-30** | comercial C (carga liviana) | Camionetas de carga liviana rin 12. | sin datos públicos; 155R12 8PR según Fénix. | Llanta de 8 lonas para carga liviana rin 12, económica y resistente para el trabajo. |
| **Townhall TH-661** | turismo UHP | Autos y sedanes con rin 17 y perfil bajo. | sin datos públicos; 215/45R17 91W según Fénix. | Llanta deportiva de perfil bajo para rin 17 a precio económico. |
| **Townhall TH-AT802** | A/T | Pickups y SUV con uso mixto asfalto/lastre. | Minorista UE la clasifica como 4x4 económica 'all season'; diseño de bloques con ranuras abiertas en hombro (Walmart MX). Sin etiqueta UE ni UTQG confirmados. | All terrain económica para pickup: aguanta asfalto y lastre a buen precio. |
| **Townhall TH-HP802 (HP-802)** | H/T / SUV de alto desempeño | SUV y crossovers rin 18 a 20 en asfalto. | sin datos públicos | Llanta de carretera para SUV con rin grande, buen precio frente a marcas conocidas. |
| **Townhall TH-HT802** | H/T | SUV y camionetas que andan casi siempre en asfalto. | sin datos públicos | Llanta de carretera para SUV, silenciosa y económica para uso en asfalto. |
| **Townhall TH-MT802** | M/T | Pickups y 4x4 que entran a lodo y caminos de tierra. | sin datos públicos; 6PR según Fénix. | Llanta de lodo de bloque grande para quien entra seguido a finca o camino de tierra. |

### MAXXIS

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Maxxis AT-980 Bravo (en Europa: Wormdrive AT-980E)** | A/T | Camioneta 4x4 y pickup que entra a lastre, piedra y barro medio. | Llanta todo terreno agresiva: tacos profundos en zigzag y capa de nylon contra pinchazos. En Australia los usuarios le dan 81 % (Tyre Review AU, 148 reseñas) y 4,1/5 (ProductReview), con lo mejor en durabilidad y lo peor en ruido y mojado. Un usuario dice que fue descontinuada en Australia (no confirmado). UTQG: no confirmado (las LT no lo llevan). | La Maxxis AT-980 es una todo terreno de taco agresivo y lona reforzada, para la camioneta que entra a fincas y lastre. |
| **Maxxis Bravo Series AT-771** | A/T | Camioneta, SUV y pickup: asfalto más lastre y barro ligero. | Llanta todo terreno con marca M+S. UTQG 500 A A / 500 A B según la medida (Maxxis). Etiqueta EU de la gama, según tyrereviews: D en combustible, D en mojado y 71 dB. No confirmamos que tenga 3PMSF. En tyrereviews los usuarios le dan 8,9/10 en desgaste. Quejas: un poco ruidosa en carretera y floja en nieve, lo cual no importa en Santo Domingo. Garantía en EE. UU.: 50.000 mi en medidas no LT. La garantía de millaje de EE. UU. es solo referencia y no aplica en Ecuador. | La Maxxis Bravo AT-771 es todo terreno con treadwear 500, aguanta bien el lastre y es silenciosa para ser A/T. |
| **Maxxis MA-P1** | turismo | Auto pequeño de ciudad (aro 12-14), uso diario en asfalto. | Llanta de turismo. En la página de Maxxis EE. UU. aparece como DISCONTINUADA. Maxxis Taiwán publica UTQG 380 AA en la serie 55 y 440 AA en las series 60/65/70. En EE. UU. tenía garantía de 40.000 mi (serie 55) y 50.000 mi (series 60-70). La garantía de millaje de EE. UU. es solo referencia y no aplica en Ecuador. No hay pruebas de revistas. Fuerte: dura y es barata. Débil: es un diseño antiguo. | La Maxxis MA-P1 es una llanta económica y durable para auto pequeño, con buen agarre en asfalto (traction A en la norma de EE. UU.). |
| **Maxxis MA-P5 Mecotra** | turismo | Auto y sedán, uso diario, enfocada en lluvia y en ahorro. | Llanta de turismo registrada en el EPREL europeo (clase C1, por ejemplo en 185/70R13 y 165/80R13). Maxxis dice que tiene mejor agarre en mojado, menos resistencia a la rodadura y menos ruido. UTQG: no confirmado. Pruebas independientes: no confirmadas. | La Maxxis Mecotra MA-P5 es una llanta de auto pensada para frenar bien en lluvia y gastar menos combustible. |
| **Maxxis MA-S1 Marauder** | turismo/SUV de letras (H/T) | Pickup, SUV clásica o auto con aro 15-18 y estética de letras. | Llanta para pasajero y SUV. Las fuentes no coinciden en su categoría: unas la llaman all-season y otras de verano (performance). Construcción: doble cinturón de acero y capa de nylon en espiral; dibujo unidireccional. Viene en índices H y S. UTQG 360 A A. No tiene pruebas de revista relevantes. | La Maxxis Marauder MA-S1 es para camioneta o SUV que quiere buen agarre en asfalto, con traction A y temperatura A. |
| **Maxxis MA-T1 Escapade** | turismo (touring) | Sedán o minivan, carretera, máxima duración. | Llanta touring. Maxxis EE. UU. publica UTQG 700 AA en las medidas T y 560 AA en las V; Maxxis Taiwán, 720 AA (BSW). En EE. UU. aparece discontinuada. Garantía en EE. UU.: 100.000 mi en las T y 60.000 mi en las V. La garantía de millaje de EE. UU. es solo referencia y no aplica en Ecuador. Fuerte: kilometraje muy alto. Débil: no es deportiva. | La Maxxis Escapade MA-T1 tiene treadwear 700 a 720, de las más duraderas de su tipo, ideal para quien recorre muchos kilómetros. |
| **Maxxis MA-Z1 Victra** | H/T deportiva (UHP) | Auto deportivo o sedán con aro 15-16 que busca agarre. | Llanta deportiva de alto desempeño. UTQG 280 AA A, según tyrereviews (la fuente no es del fabricante). Compuesto blando: agarra mucho y dura menos. No tiene garantía de millaje en EE. UU. | La Maxxis Victra MA-Z1 es de compuesto deportivo con traction AA, para quien quiere agarre en curva y frenado. |
| **Maxxis MCV5 Vansmart** | comercial (furgoneta) | Furgoneta, van de carga o pasajeros: trabajo diario con peso. | Llanta comercial (C, 8PR) para furgonetas y utes. Según los distribuidores tiene buen costo por kilómetro, compuesto que se calienta poco y cinturón que reduce el esfuerzo. Es de verano y viene de aro 12 a 17. No lleva UTQG porque es comercial. | La Maxxis Vansmart MCV5 es de 8 lonas, hecha para furgoneta de trabajo que anda cargada todo el día. |
| **Maxxis Pragmatra MP10** | turismo | Sedán o hatchback compacto, ciudad y carretera. | Llanta de turismo de verano lanzada en 2016 y vendida sobre todo en Latinoamérica, Rusia y China. Viene en índices de velocidad H y V. UTQG y etiqueta EU: no confirmados. No hay pruebas de ADAC ni de Auto Bild. Los usuarios elogian el agarre en seco. Pensada para durar y para baja resistencia a la rodadura. | La Maxxis Pragmatra MP10 es una llanta de turismo pensada para durar y ahorrar combustible en el uso diario. |
| **Maxxis Pragmatra MP15 (SUV)** | H/T | SUV o crossover urbano en asfalto. | Llanta de verano para SUV y crossover, lanzada en 2017 para China. Tiene dibujo 3D para bajar el ruido y un flanco que reparte la carga. Hecha para asfalto (Rezulteo). UTQG y pruebas: no confirmados. | La Maxxis Pragmatra MP15 es para SUV de ciudad, silenciosa y cómoda en asfalto. |
| **Maxxis Victra MA-Z4S** | UHP | Auto deportivo o sedán con aro 18 de perfil bajo. | Llanta de ultra alto desempeño lanzada en 2007. UTQG 420 AA A, según tyrereviews (no del fabricante). No tiene garantía de millaje en EE. UU. | La Maxxis Victra MA-Z4S es deportiva de perfil bajo, con traction AA (lo más alto) para frenar y curvear seguro. |

### DURUN

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Durun C212** | comercial C (van) | Furgonetas y camionetas de carga. | Rezulteo: llanta de van económica de verano, rin 10 a 16. 235/65R16C 115/113R 8PR existe en UK. | Llanta de carga para van de reparto, reforzada y económica. |
| **Durun HG918** | H/T (SUV) | SUV y crossovers en asfalto. | Catálogo UE: llanta de verano (59 entradas). | Llanta de carretera para SUV, económica. |
| **Durun K334 M/T** | M/T (LT) | Pickups 4x4 en lodo. | sin datos públicos; 285/70R17LT 10PR según Fénix. | Llanta de lodo de 10 lonas para pickup que trabaja en finca. |
| **Durun M636** | turismo UHP | Autos con rin 17 de perfil bajo. | WhatTyre la lista como llanta de verano; sin especificaciones. | Llanta deportiva económica para rin 17. |
| **Durun RH01** | H/T (SUV) | SUV en asfalto. | sin datos públicos | Llanta de carretera para SUV rin 17. |
| **Durun RT02** | R/T (según nombre; no confirmado) | Pickups y SUV con uso mixto. | Catálogo UE la lista (73 medidas) como llanta de verano; categoría R/T inferida del nombre. | Llanta todo terreno con hombro agresivo, para pickup que sale a lastre. |
| **Durun RU05 (no confirmado; hay RU06)** | turismo UHP | Autos con rin 17 de perfil bajo. | sin datos públicos; 205/45R17 según Fénix. | Llanta deportiva de perfil bajo económica. |
| **Durun Terrain Grabber A/T K325** | A/T | Pickups y SUV con uso mixto, mucho fuera de vía. | Rezulteo: A/T para 4x4 que ruedan sobre todo fuera de carretera y buscan precio razonable. | All terrain de precio razonable para pickup que anda en lastre. |

### ILINK

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **iLink L-Max 9** | comercial C (van) | Furgonetas y camionetas de carga. | Listada en Blackcircles (UK) como llanta de van. 215R14C 112/110 según Fénix. | Llanta de carga para van rin 14, reforzada y económica. |
| **iLink Multimile A/S** | comercial C (van) | Furgonetas y camionetas de carga. | Blackcircles: llanta de van toda estación, rin 14 a 17. 235/65R16C 115/113 según Fénix. | Llanta de carga para van de reparto, pensada para rodar mucho. |
| **iLink R/T 'Penter' (nombre no confirmado)** | R/T (LT) | Pickups con uso mixto pesado. | sin datos públicos; 245/75R16LT 120/116 según Fénix. | R/T para pickup de trabajo: agarre extra en lodo y lastre. |
| **iLink Terramax LSR1 A/T** | A/T | SUV y pickups; 15 a 17 pulgadas. | Blackcircles: A/T de entrada con ranuras autolimpiantes y banda afinada para carretera (cómoda en asfalto). | All terrain económica que se siente cómoda en carretera y se defiende en lastre. |
| **iLink Wildwolf M/T** | M/T (LT) | Pickups 4x4 en lodo. | Blackcircles la lista como M/T en 10 medidas. | Llanta de lodo para pickup 4x4 que sale de la vía. |

### TOURADOR

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Tourador Comfort SUV (nombre exacto no confirmado)** | H/T | SUV en asfalto. | sin datos públicos | Llanta de carretera cómoda para SUV. |
| **Tourador X Force A/T II** | A/T | Pickups y SUV con uso mixto. | sin datos públicos; existe en catálogos UE como 'X Force ATII' (265/70R16, 265/65R17). | All terrain de buen precio para pickup que alterna asfalto y lastre. |
| **Tourador X Wonder TH1** | turismo | Autos sedán y hatchback. | Registrada en EPREL. Prueba TyreReviews: último lugar, poco agarre en seco y mojado. TheTyreLab: 4,5/10 'recomendada con condiciones'. | Llanta de pasajero de bajo precio para uso urbano tranquilo. |
| **Tourador X Wonder TH2** | turismo | Autos sedán. | sin datos públicos | Llanta de pasajero económica para uso diario. |

### SUMAXX

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Sumaxx All-Terrain A/T** | A/T | Pickups y SUV con uso mixto. | Registrada en EPREL (p. ej. LT285/70R17); la ficha del fabricante la describe como robusta fuera de vía. Grados de etiqueta no verificados. | All terrain de marca especializada en 4x4, robusta para lastre y carretera. |
| **Sumaxx Max Ranger R/T** | R/T (LT) | Pickups con uso mixto pesado. | Solo un minorista filipino la lista, como llanta para terreno variado. 10PR según Fénix. | R/T de 10 lonas para pickup que trabaja en lodo y piedra. |

### WANDA

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Wanda WR082** | comercial C | Furgonetas, carguitas y remolques. | Minoristas la describen como llanta de verano para utilitarios livianos, remolques y caravanas; también vendida como Journey. 155R12C 8PR 88/86N según Fénix. | Llanta reforzada de carga para camioneta pequeña o remolque, aguanta peso a buen precio. |
| **Wanda WR098** | comercial C | Vehículos utilitarios livianos (van). | Listada como llanta de van en 155/80R12 (rezulteo). Resto sin datos públicos. | Llanta de van reforzada de 8 lonas para carga liviana rin 12. |
| **Wanda WR9001 A/T** | A/T | SUV y pickups con uso mixto. | Minorista UE: A/T a precio atractivo para uso campo traviesa. Sin etiqueta UE detallada encontrada. | All terrain económica para camioneta que alterna asfalto y lastre. |
| **Wanda WR9006 M/T (Journey Terrapass M/T)** | M/T | Pickups 4x4 en lodo y trocha. | Aparece como Journey Terrapass M/T WR9006 (245/75R16 120/116Q). 10PR LT según Fénix. | Llanta de lodo de 10 lonas para pickup que trabaja en finca y camino de tierra. |

### XBRI

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **XBRI Brutus A/T (no confirmado)** | A/T (LT) | Pickups. | sin datos públicos; XBRI sí tiene Forza A/T y Forza M/T, pero 'Brutus' no aparece en fuentes. | All terrain para pickup grande rin 18. |
| **XBRI Ecology** | turismo (eco) | Autos de uso diario buscando ahorro de combustible. | Llanta 'verde' de baja resistencia al rodar para ahorro de combustible (reseña brasileña). Grados de etiqueta no verificados. | Llanta de pasajero que ayuda a ahorrar gasolina. |
| **XBRI Forza H/T 2** | H/T | SUV, 4x4 y crossovers mayormente en asfalto. | Rezulteo: llanta de verano para SUV/4x4/crossover, uso en carretera y caminos mejores; posicionada como opción de bajo costo. | Llanta de carretera para SUV de marca brasileña conocida, cómoda y de buen precio. |

### LANWOO

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Lanwoo LWD66** | camión (17.5) – tracción | Eje de tracción de camión mediano. | sin datos públicos; 215/75R17.5 18PR según Fénix. | Llanta de tracción de 18 lonas para camión mediano. |
| **Lanwoo LWT52** | camión (17.5) – direccional/arrastre (lisa) | Eje delantero o de arrastre de camión mediano. | sin datos públicos; 18PR lisa según Fénix. | Llanta lisa de 18 lonas para la dirección del camión mediano. |
| **Lanwoo X5 Pro** | camión (17.5) – mixta (todas las posiciones) | Camiones medianos con uso mixto carretera/lastre. | sin datos públicos; 18PR mixta según Fénix. | Llanta mixta de 18 lonas para camión que alterna carretera y lastre. |

### COOPER

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Cooper CS1** | turismo (touring) | Auto y sedán, uso diario. | Touring vendida en México, Centro y Sudamérica desde 2015. La 195/65R15 91T tiene UTQG 520 A B. Un catálogo dice que podría estar descontinuada o con distribución limitada. | La Cooper CS1 es touring americana para auto, con treadwear 520 para que dure. |
| **Cooper Cobra Radial G/T (letras blancas)** | turismo/clásica (letras blancas) | Camioneta o auto clásico y muscle car aro 15; estética de letras blancas (LB). | Llanta all-season con letras blancas en relieve. UTQG 440 A B (por ejemplo, 225/70R15 100T y en Canadá índice 96T). Garantía en EE. UU.: 40.000 mi. La garantía de millaje de EE. UU. es solo referencia y no aplica en Ecuador. Las letras vienen con una capa protectora azul que se lava. | La Cooper Cobra Radial G/T es la clásica de letras blancas para camioneta o auto clásico, con treadwear 440. |
| **Cooper Evolution M/T** | M/T | Pickup 4x4 de trabajo pesado: barro, finca, lastre suelto. | Llanta para barro LT, rango E (10PR), con 18/32 de profundidad. Los usuarios le dan 4,3/5 (SimpleTire) y 8,2/10 (Tiregrades), con lo más bajo en ruido. No lleva UTQG porque es LT. | La Cooper Evolution M/T es de 10 lonas, para barro y finca de verdad; aguanta lo que le pongas. |

### KAPSEN

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Kapsen AT02 (no confirmado)** | A/T (LT) | Pickups grandes (285/75R16). | sin datos públicos; el nombre de modelo no se pudo confirmar. | All terrain para pickup grande, pensada para trabajo y lastre. |
| **Kapsen HD918 (también Habilead)** | turismo | Autos de uso urbano y carretera. | Registrada en EPREL (p. ej. 195/50R15 82V); llanta de verano. Grados de etiqueta no verificados. | Llanta de pasajero económica, ideal para uso diario en ciudad. |
| **Kapsen/Habilead PracticalMax A/T RS23** | A/T (LT) | Pickups y SUV con uso mixto y carga. | Registrada en EPREL en medidas LT (p. ej. LT265/70R17). TyreReviews la lista como A/T para SUV/4x4; algunos minoristas la marcan como 'verano'. 8PR según Fénix. | All terrain de 8 lonas para pickup que carga y sale a lastre. |

### CONTINENTAL

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Continental PowerContact 2** | turismo (touring) | Auto y sedán, uso diario y carretera; hecha para las vías andinas. | Fabricada en Cuenca, Ecuador, por Continental Tire Andina. Según Continental Ecuador tiene treadwear 600 y 20 % más kilometraje que la versión anterior; trae ContiSafetySystem, ContiShield (resiste impactos) y ECOPlus (ahorro de combustible). OJO: Continental Ecuador tiene un programa voluntario de reemplazo gratuito por DOT para 175/65R14, 185/65R14 y 205/60R16. Hay que revisar el DOT de las 185/65R14 en stock. La fecha del aviso no está confirmada. | La Continental PowerContact 2 se fabrica aquí en Cuenca con tecnología alemana, frena muy bien en lluvia y tiene treadwear 600. |

### VIKRANT

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Vikrant convencional de tracción** | camión liviano, convencional diagonal con tubo – tracción | Eje de tracción de camiones livianos (7.50-16 16PR). | Diagonal con tubo, taco de tracción. Modelo exacto sin datos públicos. | Llanta de tracción convencional de 16 lonas para camión liviano, aguanta carga y lastre. |
| **Vikrant convencional lisa (pantanera/direccional)** | camión liviano, convencional diagonal con tubo – direccional (lisa) | Eje delantero de camiones livianos y buses pequeños (7.00-15 10PR, 8.25-16 16PR). | Diagonal (convencional) con tubo, diseño liso/rib para eje direccional. 'SET' = llanta+tubo+defensa (inferido). Modelo exacto sin datos públicos. | Llanta convencional lisa de la India (grupo JK) para la dirección del camión, muy resistente. |

### NEXEN

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Nexen N'Fera Primus V** | turismo (touring premium) | Auto y sedán, comodidad en carretera. | Es la versión V (velocidad hasta 240 km/h) de la N'Fera Primus, una touring de verano. Los usuarios elogian el agarre y la comodidad; uno reporta desgaste rápido. UTQG: no confirmado. | La Nexen N'Fera Primus V es cómoda y silenciosa, con buen agarre en carretera. |
| **Nexen N'Fera RU5** | H/T (SUV de alto desempeño) | SUV con aro 20, carretera. | Llanta all-season para SUV. La 255/45R20 105V XL tiene UTQG 500 A A. Hombro asimétrico para estabilidad. Garantía en EE. UU.: 65.000 mi. La garantía de millaje de EE. UU. es solo referencia y no aplica en Ecuador. Discount Tire la marca como descontinuada. | La Nexen N'Fera RU5 es para SUV de aro 20: cómoda, silenciosa y con treadwear 500. |
| **Nexen N2000** | turismo deportiva (HP) | Auto y sedán aro 15 que busca algo de desempeño. | Llanta de verano de alto desempeño. UTQG 380 A A. En tyrereviews no tiene pruebas de revistas; los usuarios le dan 7,9/10 (14 reseñas). Garantía en EE. UU.: 60.000 mi. La garantía de millaje de EE. UU. es solo referencia y no aplica en Ecuador. Es un modelo antiguo, de nivel económico. | La Nexen N2000 es deportiva a buen precio, con traction A y temperatura A. |

### GOODYEAR

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Goodyear 265/60R18 «Full Max» (modelo no identificado; ¿Assurance CS Fuel Max? no confirmado)** | H/T | SUV o pickup aro 18 en carretera. | No encontramos ningún modelo Goodyear llamado «Full Max». La coincidencia más cercana es la Assurance CS Fuel Max 265/60R18 110H, para SUV. No confirmado; hay que revisar el costado de la llanta. | La Goodyear 265/60R18 es para SUV o camioneta en carretera, de una marca americana premium. |
| **Goodyear Assurance WeatherReady** | turismo all-weather | Auto o crossover, mucha lluvia y carretera. | UTQG 700 A A. Tiene 3PMSF (Tire Rack). Garantía en EE. UU.: 60.000 mi. La garantía de millaje de EE. UU. es solo referencia y no aplica en Ecuador. Ya existe la sucesora, WeatherReady 2. Está diseñada para lluvia y nieve; en el calor de la Costa la nieve no aplica, pero la lluvia sí. | La Goodyear WeatherReady está hecha para lluvia fuerte, con treadwear 700 y traction A. |
| **Goodyear Regional RHS 17.5 (probable; la descripción de Fénix dice «RH LISA», no confirmado)** | comercial (camión liviano) | Camión liviano o bus: eje direccional y toda posición, carretera regional. | La Regional RHS 235/75R17.5 de 16 lonas es 132/130L. Se vende en México, Panamá y Colombia para eje direccional y toda posición. Que «RH LISA» sea la RHS no está confirmado. | La Goodyear 235/75R17.5 de 16 lonas es para camión liviano o bus, buena en dirección y en toda posición. |

### TRAZANO

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Trazano RP288 (posible variante del RP28 de ZC Rubber, no confirmado)** | turismo | Autos sedán. | sin datos públicos; 185/60R15 84H según Fénix. | Llanta de pasajero del grupo ZC Rubber, económica para uso diario. |
| **Trazano Radial H188** | comercial C (van/LT) | Furgonetas y camionetas de carga en vía pavimentada. | ZC Rubber: llanta de carga liviana para vías pavimentadas, carcasa de poliéster con cinturones de acero. Registrada en EPREL. 195R14C 8PR según Fénix. | Llanta de carga de 8 lonas hecha por el fabricante más grande de China. |

### HAULMAX

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Haulmax H-Lug** | camión liviano convencional – tracción | Eje de tracción de camión liviano (7.00-16). | sin datos públicos | Llanta de tracción de taco para camión liviano que entra a lastre. |
| **Haulmax H-Rib** | camión liviano convencional – direccional (lisa) | Eje delantero de camión liviano (7.50-15 14PR). | sin datos públicos | Llanta lisa de 14 lonas para la dirección de camión liviano. |

### CENTARA

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Centara Adventure A/T** | A/T (LT) | Pickups y SUV con uso mixto. | Minoristas: A/T toda estación para SUV y pickups. EPREL: LT285/70R17 121S clase C2. | All terrain de 10 lonas para pickup grande. |
| **Centara Commercial** | comercial C (van) | Furgonetas y camionetas de carga en carretera. | Minoristas: llanta de carretera para van y carga liviana (unos dicen verano, otros toda estación); 235/65R16C 115/113R existe en UK. 8PR según Fénix. | Llanta de carga de 8 lonas para van, económica. |

### MILEKING

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Mileking MK837** | H/T (SUV) | SUV y crossovers en asfalto. | Minoristas: toda estación, simétrica, para SUV/crossover/4x4. | Llanta de carretera para SUV, cómoda y económica. |
| **Mileking MK937** | turismo UHP | Sedanes y SUV de rin grande. | Minoristas: alto desempeño, banda asimétrica; medidas de 16 a 21 pulgadas. | Llanta de alto desempeño para rin 20 a precio económico. |

### MINERVA

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Minerva Ecospeed (variante SUV; 'AT' no confirmado)** | H/T (SUV) | SUV y crossovers en asfalto. | Probablemente Ecospeed2 SUV (verano, uso carretera); no confirmado que exista versión A/T. | Llanta de marca belga para SUV, de carretera. |
| **Minerva Ecospeed2 SUV** | H/T (SUV) | SUV y crossovers en asfalto. | Etiqueta UE reportada: combustible C, mojado C, ruido B 71 dB (varía por medida; aprox.). | Llanta de marca belga para SUV con etiqueta europea completa. |

### STERPRISIN

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Sterprisin 9.5R17.5 lisa (modelo no indicado)** | camión (17.5) – direccional (lisa) | Eje delantero de camión mediano. | sin datos públicos | Llanta lisa de 18 lonas para camión mediano, económica. |
| **Sterprisin SR516** | camión (17.5) – direccional (lisa) | Eje delantero de camión mediano. | sin datos públicos; 235/75R17.5 16 lonas lisa según Fénix. | Llanta lisa de 16 lonas, la opción más económica para la dirección del camión. |

### BARUM

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Barum Bravuris (versión exacta no confirmada, probablemente Bravuris 5HM o Bravuris 2)** | turismo | Auto pequeño, uso diario económico. | Modelo exacto no confirmado: la descripción de Fénix solo dice BRAVURIS. Es de Barum, la marca económica de Continental. Ver BRAVURIS 5HM para las pruebas. | La Barum Bravuris tiene ingeniería Continental a precio económico, ideal para auto de uso diario. |
| **Barum Bravuris 5HM** | turismo | Auto y sedán, ciudad y carretera. | Llanta de verano. ADAC 2023 (205/55R16): «satisfactorio», con frenado en seco apenas bueno y en mojado solo satisfactorio. ADAC 2022 (215/60R16, SUV): puesto 13 de 18. ADAC 2021: puesto 15 de 17. Fuertes: muy bajo consumo de combustible y desgaste algo mejor que el promedio. En Europa ya la reemplazó la Bravuris 6. | La Barum Bravuris 5HM es de la familia Continental: gasta poco combustible y dura bien, buena opción por precio. |

### GENERAL

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **General Grabber ATX** | A/T | Camioneta y SUV: asfalto más lastre, uso mixto. | Llanta todo terreno. La 225/70R16 103T aparece como fabricada en Ecuador y de «doble propósito». Varias medidas tienen 3PMSF, pero no está confirmado en 225/70R16. UTQG para esta medida: no confirmado. | La General Grabber ATX es todo terreno fabricada en Ecuador, buena para la camioneta que alterna asfalto y lastre. |
| **General Tire Altimax (probablemente Altimax XP7; no confirmado)** | turismo | Auto pequeño o sedán, uso diario. | En tiendas de Colombia (Alkosto) la 165/60R14 se vende como Altimax XP7 75T, con país de origen Ecuador. Continental Ecuador tuvo un reemplazo voluntario de la XP7 en 165/70R13 y 185/65R14; la 165/60R14 no estaba en la lista. UTQG y pruebas: no confirmados. | La General Altimax es de fabricación nacional (Continental en Cuenca), económica y fácil de reponer. |

### TOYO

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Toyo DRB (probable; modelo no confirmado)** | turismo (confort) | Sedán con aro 18, comodidad. | No pudimos confirmar el modelo. Si es la Toyo DRB, sería una llanta de confort del mercado japonés. UTQG y pruebas: no confirmados. | La Toyo 245/45R18 es japonesa, pensada para andar cómodo y silencioso. |
| **Toyo Proxes ST III** | H/T deportiva (SUV/pickup) | Pickup o SUV deportiva en asfalto, buscando agarre y estética. | Llanta all-season para SUV y camioneta deportiva. La mayoría de fuentes dan UTQG 500 A A; una dice 400. En las reseñas es excelente en seco y floja en nieve. Garantía en EE. UU.: 40.000 mi. | La Toyo Proxes ST III es japonesa y deportiva para camioneta, con agarre de auto en asfalto. |

### TIANFU

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Tianfu RD105B** | comercial C (camioneta de carga liviana) | Camionetas pequeñas de carga y furgonetas con rin 12 (155R12 8PR). | sin datos públicos; 155R12LT 8 lonas 88/86 (según la descripción de Fénix). | Llanta reforzada de 8 lonas para carguita pequeña rin 12, buena opción económica para trabajo diario. |

### JOYROAD

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Joyroad HP RX3** | turismo | Autos compactos y medianos. | Registrada en EPREL (UE); vendida como llanta de verano/toda estación para compactos. Grados de etiqueta no verificados. | Llanta de pasajero económica para autos pequeños rin 12. |

### ROCKBLADE

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Rockblade Rock 787 R/T** | R/T (LT) | Pickups y SUV con uso mixto pesado. | sin datos públicos para este modelo; 27x8.50R14LT 6PR letras blancas según Fénix. | R/T con letras blancas para pickup rin 14, agarre y look a buen precio. |

### TORNEL

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Tornel (diseño direccional, modelo no identificado)** | turismo | Autos sedán y hatchback. | sin datos públicos sobre un modelo 'Direccional'; 185/60R15 según Fénix (en catálogo mexicano Tornel tiene p. ej. 'Real'). | Llanta mexicana de JK Tornel para auto, económica y conocida. |

### ANNAITE

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Annaite AN906** | A/T (LT) | Pickups y SUV con uso mixto y carga. | Minoristas la listan como A/T; uno como llanta de verano. 225/75R15LT 6PR según Fénix. | All terrain económica para pickup de trabajo. |

### POWERHUB

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Powerhub PW593** | camión liviano radial (LT 7.00R15) – direccional (lisa) | Eje delantero de camiones livianos. | sin datos públicos; LT700R15 12PR lisa, sin tubo ('sola') según Fénix. | Llanta radial lisa de 12 lonas para la dirección del camioncito. |

### WIDEWAY

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Wideway Speedway** | H/T (SUV) | SUV en asfalto, manejo dinámico. | Listada como llanta de verano para SUV orientada a carretera. | Llanta de carretera para SUV con buen agarre en asfalto. |

### LINGLONG

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Linglong Green-Max All Season** | turismo / SUV toda estación | SUV y crossovers en asfalto. | 225/65R17 102H: etiqueta UE C / D / 72 dB (WhatTyre). Prueba AutoBild en esta medida (aprox.): frenado seco 42,9 m vs 39,5 m mejor; mojado 59,4 m vs 46,3 m mejor. 3PMSF no confirmado. | Llanta de Linglong, uno de los fabricantes chinos más grandes, para SUV en carretera. |

### HIFLY

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Hifly HH309** | camión (17.5) – tracción | Eje de tracción de camiones medianos. | Catálogo TBR de Hifly; distribuidor australiano la lista como llanta de tracción. 16PR según Fénix. | Llanta de tracción económica de 16 lonas para camión mediano. |

### FENIXWAY

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Fenixway 'Flama' 66 (nombre no confirmado)** | camión (17.5) – direccional (lisa) | Eje delantero de camión mediano (9.5R17.5). | sin datos públicos; 18 lonas lisa según Fénix. | Llanta lisa de 18 lonas para la dirección del camión mediano. |

### ROADX

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **RoadX RH621** | camión – direccional/regional (lisa) | Eje direccional en uso regional. | Minoristas EE. UU.: llanta regional para eje direccional, 5 nervios, 18PR (rango J). | Llanta lisa de 18 lonas del grupo Sailun para la dirección del camión. |

### SPORTRAK

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Sportrak SP929** | camión (17.5) – tracción | Eje de tracción de camión mediano. | sin datos públicos; 9.5R17.5 18 lonas según Fénix. | Llanta de tracción de 18 lonas para camión mediano. |

### TRIANGLE

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Triangle TR666** | camión (22.5) – mixta (todas las posiciones) | Camiones de servicio mixto carretera/fuera de vía, trayectos cortos. | Triangle la clasifica como todas las posiciones de servicio mixto; compuesto resistente a cortes y desgarros; 275/80R22.5 149/146M 16PR (BigTyres la lista en eje direccional). | Llanta mixta de Triangle para camión que entra a obra o lastre, resistente a cortes. |

### BFGOODRICH

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **BFGoodrich All-Terrain T/A (KO2 o KO3; versión no confirmada)** | A/T | Pickup o SUV 4x4 que entra a lastre, piedra y fincas. | La KO2 fue reemplazada por la KO3 en 2024. Ambas tienen 3PMSF. La KO3 se fabrica en EE. UU., Brasil y Tailandia, y su garantía en EE. UU. es de 50.000 mi. La garantía de millaje de EE. UU. es solo referencia y no aplica en Ecuador. Es LT, así que no lleva UTQG. La versión del stock (KO2 o KO3) no está confirmada; hay que revisar el costado. | La BFGoodrich All-Terrain es la referencia mundial en todo terreno: resiste cortes en lastre y piedra. |

### MICHELIN

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Michelin 245/70R17 H/T (probablemente Primacy LTX o Defender LTX M/S; no confirmado)** | H/T | Pickup o SUV en carretera, máxima duración. | El modelo exacto no está confirmado. Si es la Primacy LTX 245/70R17 110T, tiene 10/32 de profundidad y garantía en EE. UU. de 55.000 mi. La garantía de millaje de EE. UU. es solo referencia y no aplica en Ecuador. | La Michelin 245/70R17 de carretera es de las que más duran, para camioneta que anda en asfalto. |

### DOUBLE COIN

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Double Coin RLB490** | camión (17.5) – tracción | Eje de tracción de camiones medianos (235/75R17.5). | Minoristas: tracción de perfil bajo, nervios laterales contra roce de bordillo; 143/141J en 235/75R17.5 (16PR). | Llanta de tracción de Double Coin, marca de camión con décadas en el mercado. |

### FULL RUN

| Modelo | Tipo | Para qué | Datos | Frase para el cliente |
|---|---|---|---|---|
| **Fullrun TB906** | camión/bus (22.5) – direccional y arrastre (lisa) | Ejes direccional y de arrastre en carretera. | Minoristas EE. UU.: carretera, toda estación, para eje direccional y de remolque; 275/70R22.5 148/145M 16PR existe. | Llanta lisa para dirección o arrastre de camión y bus en carretera. |


---

## 4. Lo que falta que confirme Competimotor

- **Plazos de la garantía y del seguro contra impacto** (Kenda, Falken, Winrun, Maxxis): meses y años, qué cubre, cómo se reclama. Hoy el bot dice que existen y que el asesor explica las condiciones.
- **Garantía de las otras marcas** (Haida, Townhall, Durun, etc.): ¿hay seguro o solo la garantía del fabricante?
- **Envíos a otras ciudades:** ¿se hacen? ¿Costo y plazo?
- **Descuento en efectivo:** ¿existe?
- **Año (DOT) del stock:** con un rango como «todo nuestro stock es 2025–2026» el bot puede contestar sin mandar al local.
- **Winrun R330-i / R330-I:** ¿es la R330 normal? No se encontró ningún modelo con ese nombre.
- **Modelos sin ficha pública** (Haida HD EX CONFORT y RUNSPIRIT, Trazano RP288, iLink PENTER RT, Kapsen AT02, XBRI BRUTUS, Durun RU05, Tourador WONDER TH2 y COMFORT SUV, Minerva ECOSPEED AT, Goodyear «FULL MAX» y «RH LISA», Toyo «TYDRB», Michelin «HT»): pedirle a Jenny la ficha o el nombre comercial.
- **iLink Terramax:** ¿LSR1 o LSR2? **Vikrant:** ¿qué dibujo es?
- **Continental PowerContact 2 185/65R14 (7 en stock):** hay un programa de reemplazo voluntario de Continental por DOT. Revisar el DOT de esas llantas antes de venderlas.
- **Falken WILDPEAK AT4W 265/65R17:** Fénix marca stock **−4**. Revisar el inventario.

---

## 5. Fuentes

# comp_A: fuentes por marca (Competimotor, grupo A)

Investigado el 17-nov-2026. Las 155 líneas de items_A.txt coinciden con alguna clave o alias de `modelos` (83 modelos, 32 marcas).
**Regla usada:** lo que no se pudo verificar dice "sin datos públicos" o "no confirmado". Lo que está entre paréntesis como "según Fénix" sale de la descripción del inventario, no de la web.

## Puntos dudosos (revisar antes de que el bot lo diga)
- **Hifly NO es de Sailun.** Todas las fuentes dicen que es de Shandong Hengfeng Rubber & Plastic. La hipótesis "Hifly/Sailun/Shengtai/Kapsen/Habilead" del brief no se sostiene. Kapsen y Habilead son de **Shandong Huasheng Rubber**. No hay vínculo con Shengtai.
- **No se encontró que Durun tenga relación con Sentury.** Durun es de Shandong Yongtai.
- **El fabricante de Townhall es desconocido.** Que sea Qingdao Taihao es solo una sospecha por los códigos "TH".
- **Hay fuentes que se contradicen** sobre el fabricante de Joyroad (Haohua o Zhongyi), de Annaite (Annaite Tyre/Xingyuan o Zhongyi) y del grupo dueño de iLink (Zodo o Yuelong).
- **No hay nada público de Sterprisin, Fenixway ni Powerhub.** De Lanwoo solo existe el registro de la marca. Sportrak aparece solo como empresa comercializadora.
- **Haulmax:** la marca australiana conocida hace llantas OTR e industriales. No está confirmado que las convencionales 7.50-15 y 7.00-16 sean del mismo dueño.
- **Nombres de modelo que no aparecen en ninguna fuente:** Haida "HD EX CONFORT" y "RUNSPIRIT", Trazano "RP288" (podría ser el RP28 de ZC), iLink "PENTER RT", Kapsen "AT02", XBRI "BRUTUS AT", Durun "RU05" (sí existe RU06), Tornel "DIRECC", Tourador "WONDER TH2" y "COMFORT SUV", y Minerva "ECOSPEED AT" (sí existe Ecospeed2 SUV, que es de carretera).
- **Vikrant = JK Tyre (compra de 1997, planta en Mysore):** lo saqué de conocimiento general. Lo que sí está confirmado en la web es que se vende dentro del portafolio JK/Tornel.
- **Datos de etiqueta UE:** solo hay grados confirmados para Minerva Ecospeed2 SUV (C/C/71 dB B) y Linglong Green-Max AS 225/65R17 (C/D/72 dB). No encontré UTQG de ningún modelo.

## Fuentes por marca
- **HAIDA / TIANFU / MILEKING:** citexpo.com.cn/company/sichuan.php · oponeo.ie/tyre-model/haida-hd921 · prioritytire.com/by-brand/haida-tires/a-t-hd828 · mmkriepas.lv/en/tyres/haida/hd828-a-t/ · mmkriepas.lv/en/tyres/haida/hd868-m-t/ · simpletire.com/brands/haida-tires/hd878-r-t · walmart.com/c/kp/haida · storage.mtender.gov.md/get/8c389d0b-4e32-40f1-8a0f-f123eec594f8-1590136244896 (homologación ECE de Sichuan Tyre & Rubber) · tyres.rezulteo.co.uk/mileking/mk837 · tyres.rezulteo.co.uk/mileking/mk937
- **TOWNHALL:** tyres.rezulteo.co.uk/townhall/th-at802 · walmart.com.mx/ip/Llanta-245-65-R17/00695391312258 · mercadolibre.com.mx/blog/llantas · exhibitorsearch.messefrankfurt.com (PDF de Qingdao Taihao, solo como pista)
- **DURUN:** whattyre.com/brands/durun · grip500.co.uk/tyre/durun/ · tyres.rezulteo.co.uk/durun/k325 · tyres.rezulteo.co.uk/durun/c212 · arnoldclarkautoparts.com/products/durun-tyre-235-65-16-115r
- **ILINK:** blackcircles.com/brands/ilink (terramax-lsr1-at, wildwolf-mt, multimile-as, l-max-9) · tyrereviews.com/Tyre/i-Link/ · prioritytire.com/by-brand/ilink-tires · whattyre.com/brands/ilink
- **TOURADOR:** thetyrelab.com/tourador-wonder-th1 · tyrereviews.com/Tyre/Tourador/X-Wonder-TH1.htm · eprel.ec.europa.eu/fiches/tyres/Fiche_608791_EN.pdf · reifen.com/en-de/car/tyres/brands/quality-tyres/tourador · tradetyres.co.nz/brands/tourador
- **SUMAXX:** grip500.ie/tyre/sumaxx/ · tyres.rezulteo.co.uk/sumaxx/all-terrain-a-t · eprel.ec.europa.eu/informationsheet/Fiche_1220560_EN.pdf · n8caraccessories.ph/?p=47072 (Max Ranger)
- **WANDA:** tyres.rezulteo.co.uk/wanda/wr082 · tyres.rezulteo.co.uk/wanda/wr098 · tyres.rezulteo.co.uk/wanda/wr9001-a-t · bits4bikes.co.nz/pages/wanda · tyres-outlet.ie/product/Journey/16/R-533657 (WR9006)
- **XBRI:** tyrepress.com/2024/09/chinese-tyre-dealer-plans-to-build-factory-in-brazil-reports · autodata.com.br/noticias/2024/12/19/xbri-escolhe-campo-largo-para-abrigar-sua-primeira-fabrica-propria-de-pneus/82250/ · motoragora.com.br/?p=8821 · tyres.rezulteo.co.uk/xbri/forza-h-t-2
- **LANWOO:** trademark.justia.com/owners/shandong-kaixuan-tire-co-ltd-5462177 · whattyre.com/brands/lanwoo
- **KAPSEN:** grip500.ie/tyre/kapsen/ · tyreleader.co.uk/car-tyres/kapsen/hd918/ · tyrereviews.com/Tyre/Habilead/PracticalMax-A~s~T-RS23.htm · eprel.ec.europa.eu/qr/1400522
- **HAULMAX:** bigtyre.com.au/store/brands/40/haulmax · new.truck.net.au/tmc_exhibitors/haulmax-tyres/
- **CENTARA:** ttf.com.au/tyres/centara/centara-adventure-at · ttf.com.au/tyres/centara/centara-commercial · simpletire.com/brands/centara-tires/commercial · eprel.ec.europa.eu/informationsheet/Fiche_661172_ES.pdf
- **STERPRISIN / FENIXWAY / POWERHUB:** no apareció nada en las búsquedas (web general, EPREL, NHTSA).
- **JOYROAD:** tyres.rezulteo.co.uk/joyroad/hp-rx3 · grip500.co.uk/tyre/joyroad/ · arnoldclarkautoparts.com/products/joyroad-hp-rx3-175-70r12-80t-tyre · eprel.ec.europa.eu/informationsheet/Fiche_586005_EN.pdf
- **ROCKBLADE:** mytyres.co.uk/Rockblade_tyres.html · eprel.ec.europa.eu/fiches/tyres/Fiche_519007_EN.pdf
- **TORNEL:** portalautomotriz.com/print/noticias/proveedores/jk-tyre-en-busca-de-mas-mercado · tbcmexico.com/Content/catalogs/auto/AyC_Tornel.pdf · merca20.com/?p=732764
- **ANNAITE:** tyreleader.co.uk/car-tyres/annaite · sourceready.com/supplier/detail/annaite-tyre-co-ltd · tyres.rezulteo.co.uk/annaite/an906 · mantallanta.com/en/products/annaite-an906-245-70r16-107t
- **WIDEWAY:** whattyre.com/brands/wideway · directory.africa-business.com/business/86d73f4714/Wideway-Tire-Co- · tyroola.co.nz/tyre/wideway/speedway
- **DOUBLE COIN:** bigtyres.co.uk/235-75r17-5-double-coin-rlb490-143-141j.html · giga-tires.com/brands/double-coin-tires/s/rlb490. El vínculo con Shanghai Huayi sale de conocimiento general; esta búsqueda no lo verificó.
- **HIFLY:** reifen.com/en-at/car/tyres/brands/quality-tyres/hifly · canstarblue.com.au/vehicles/brands/hifly-tyres/ · tyrecomp.ie/hifly-tyres/ · tyrepowercampbelltownnsw.com.au/tyres/hifly/hh309
- **ROADX:** simpletire.com/brands/roadx-tires/rh621 · eprel.ec.europa.eu/informationsheet/Fiche_1427319_EN.pdf (proveedor Sailun Europe GmbH)
- **SPORTRAK:** importgenius.com/suppliers/sportrak-tire-group-limited · sourceready.com/supplier/detail/s-p-tyre-trade-ltd
- **LINGLONG:** whattyre.com/products/linglong-green-max-all-season/437546 · thetyrelab.com/linglong-green-max-all-season/225-65-R17 · eprel.ec.europa.eu/fiches/tyres/Fiche_428198_DE.pdf
- **TRIANGLE:** bigtyres.co.uk/tyres/brands/triangle/tr666 · neotires.com/triangle-tr666-tires · en.triangle.com.cn
- **TRAZANO:** eprel.ec.europa.eu/fiches/tyres/Fiche_459804_EN.pdf · zc-rubber.com/index.php/service/info/h188/235 · tyres.rezulteo.co.uk/trazano/h188
- **FULL RUN:** vpic.nhtsa.dot.gov/mid/manufacturer/details/11410 · simpletire.com/brands/fullrun-tires/tb906 · tyrepress.com/2010/01/fullrun-tyre-producer-and-exporter
- **MINERVA:** reifen.com/en-de/car/tyres/brands/quality-tyres/minerva · rubbex.com/en-be/car/tyres/brands/quality-tyres/minerva · arnoldclarkautoparts.com/products/minerva-tyre-265-65-17-112h
- **VIKRANT:** speedytire.com/tires/camso (portafolio JK/Vikrant/Tornel) · wardtires.com/commercial/tires-by-brand/vikrant/ · international.jktyre.com/tbb/liquid-gas-transportation

## Llantas de camión y convencionales en el inventario
- **Rin 17.5 (camión mediano):** 235/75R17.5, 215/75R17.5 y 9.5R17.5. En Fénix "LISA" = direccional (de nervios), "TRACC" = tracción y "MIXTA" = todas las posiciones.
- **Rin 22.5 (camión y bus):** Fullrun TB906 en 275/70R22.5 (lisa, para dirección o arrastre) y Triangle TR666 en 275/80R22.5 (mixta).
- **Convencionales diagonales con tubo:** Vikrant 7.00-15 lisa, 7.50-16 de tracción y 8.25-16 lisa; Haulmax 7.50-15 H-Rib (direccional) y 7.00-16 H-Lug (tracción).
- **Radial de camión liviano:** Powerhub LT7.00R15 PW593, lisa.
- **Interpretación sin confirmar:** "SET" probablemente quiere decir llanta + tubo + defensa, y "SOLA" quiere decir sin tubo.



# Fuentes: comp_B (lote B de marcas para Competimotor)

## Rankings
- Tyrepress 2026 (ventas de 2025): https://www.tyrepress.com/2026/06/leading-tyre-manufacturers-2026-michelin-leads-yokohama-climbs-chinas-tyre-majors-tighten-grip/ (Michelin €24,75 mil millones, Bridgestone €22,50 mil millones, Goodyear €15,56 mil millones, Continental €13,80 mil millones, Pirelli €6,78 mil millones; las posiciones del 7 al 20 son solo para suscriptores)
- Top 75 de Tire Business 2025 (resumen): https://mosautoshina.com/news/top-75-krupnejshih-shinnyh-proizvoditelej-mira-2025/ y ERJ: https://european-rubber-journal.com/article/2098437/global-tire-report-2025-staying-on-top-but-in-a-lower-gear
- NO CONFIRMADO: la posición exacta de Cheng Shin/Maxxis, Toyo y Nexen (no aparecen en las fuentes públicas que revisamos).

## Marcas
- MAXXIS: https://www.european-rubber-journal.com/2016/09/06/maxxis-targets ; https://www.maxxis.com/uk/news/maxxis-invests-500-million-in-plant-construction-and-expansion
- COOPER: es de Goodyear desde 2021 (dato conocido; plantas según el sitio corporativo de Cooper, no consultado en esta sesión). Ficha de la CS1: https://tiresvote.com/catalog/cooper/cs1/
- CONTINENTAL / GENERAL / BARUM (Cuenca): https://elmercurio.com.ec/principal/2023/06/12/continental-tire-andina-70-anos-de-innovacion-y-liderazgo-en-la-industria-de-neumaticos-en-ecuador/ ; https://www.european-rubber-journal.com/article/2081639/conti-raises-stake-in-ecuadorian-tyre-maker ; https://www.moderntiredealer.com/articles/24799-continental-strengthens-presence-in-latin-america
- NEXEN: https://www.slashgear.com/1808182/nexen-tires-who-makes-where-built/ ; https://www.tiretechnologyinternational.com/news/nexen-tire-inaugurates-czech-republic-plant.html
- GOODYEAR (Colombia/Yumbo 2026): https://www.bluradio.com/regiones/pacifico/cierra-planta-de-goodyear-en-yumbo-valle-esto-responden-desde-el-sindicato-de-la-empresa-pr30
- TOYO: https://www.performanceplustire.com/Blog/tires-not-made-in-usa (White, GA; Japón; Malasia; Serbia)
- BFGOODRICH (plantas de la KO3): https://www.discounttire.com/blog/BFGoodrich-All-Terrain-TA-KO-Tires ; https://bfgoodrich.ca/en/auto/tires/all-terrain-t-a-ko3
- MICHELIN: el ranking de Tyrepress citado arriba.

## Modelos
- MAP1: https://www.maxxis.com/us/tire/ma-p1/ ; https://www.maxxis.com/tw/tire/ma-p1/ ; https://carid.com/maxxis-tires/info/warranty.html
- MP10: https://tiresvote.com/catalog/maxxis/pragmatra-mp10/
- MAP5: https://www.tyrehub.co.nz/products/maxxis-ma-p5 ; https://eprel.ec.europa.eu/informationsheet/Fiche_876610_EN.pdf
- MAZ1 / MAZ4: https://www.tyrereviews.com/Tyre/Maxxis/MA-Z1-Victra.htm ; https://www.tyrereviews.com/Tyre/Maxxis/MA-Z4S-Victra.htm ; https://tyrepress.com/2007/07/maxxis-launches-new-victra-z4s-uhp-tyre
- MAT1 ESCAPADE: https://www.maxxis.com/us/tire/escapade-ma-t1/ ; https://www.maxxis.com/tw/tire/escapade-ma-t1/
- AT771: https://www.maxxis.com/us/tire/bravo-series-at-771/ ; https://www.tyrereviews.com/Tyre/Maxxis/Bravo-AT-771.htm ; https://simpletire.com/brands/maxxis-tires/at-771-bravo-series
- MAS1 MARAUDER: https://www.tire-reviews.com/Tire/Maxxis/MA-S1-Marauder.htm ; https://www.prioritytire.com/by-brand/maxxis-tires/marauder-ma-s1
- MCV5: https://www.tyrepower.com.au/tyres/maxxis/maxxis-mcv5 ; https://tyres.rezulteo.co.uk/maxxis/vansmart-mcv5
- AT980: https://tyrereview.com.au/maxxis-at980-bravo-reviews ; https://www.productreview.com.au/p/maxxis-bravo-980.html ; https://www.maxxis.com/uk/tyre/wormdrive-at-980e
- MP15: https://tiresvote.com/catalog/maxxis/mp-15-pragmatra/ ; https://tyres.rezulteo.co.uk/maxxis/pragmatra-suv-mp15/205-65-r15-94v
- BRAVURIS / BRAVURIS 5HM: https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/sommerreifen/205-55-r16/barum-bravuris-5hm-id-4713/ ; https://www.tyrereviews.com/Tyre/Barum/bravuris-5hm.htm/Test-Results
- POWERCONTACT 2: https://www.continental-tires.com/ec/es/b2c/tire-knowledge/nueva-powerContact-2-alta-calidad-y-tecnologia ; aviso de reemplazo voluntario: https://continentaltires.zendesk.com/hc/es-pe/article_attachments/30230911769747
- ALTIMAX: https://www.alkosto.com/llanta-general-tire-altimax-xp7-165-60-r14-75t-automovil/p/051342185443 ; aviso de reemplazo (el mismo de arriba)
- ATX: https://www.alkomprar.com/llanta-general-tire-grabber-atx-225-70-r16/p/4032344013923
- N2000: https://www.tyrereviews.com/Tyre/Nexen/N2000.htm ; https://www.tire-reviews.com/Tire/Nexen/N2000.htm
- NF PRIMUS V: https://tiresvote.com/catalog/nexen/nfera-primus-v/ ; https://www.tire-reviews.com/Tire/Nexen/N-Fera-Primus.htm
- NF RU5: https://tiresize.com/tires/Nexen/N-Fera-RU5-255-45R20.htm ; https://www.discounttire.com/buy-tires/nexen-nfera-ru5
- CS1: https://tiresvote.com/catalog/cooper/cs1/ ; https://www.prioritytire.com/by-brand/cooper-tires/cs1/195-65r15-91t-28652
- COBRA RADIAL GT: https://coopertire.ca/en_CA/tires/cobra-radial-gt/24483-16000602400000.html ; https://www.cokertire.com/tires/cooper-cobra-radial-gt-rwl-22570r14.html
- MT EVOLUTION: https://simpletire.com/brands/cooper-tires/evolution-m-t ; https://tiregrades.com/buying-guides/reviews/cooper-evolution-m-t-review
- RH LISA (probablemente Regional RHS): https://www.llantas.com.pa/llantas-goodyear/regional-rhs-(17.5)/ ; https://www.tires-easy.com/235-75-17.5/goodyear-tires/regional-rhs/tirecode/139824679
- WEATHERREADY: https://tirerack.com/tires/goodyear-assurance-weatherready ; https://www.tyrereviews.com/Tyre/Goodyear/Assurance-WeatherReady.htm
- FULL MAX: no se encontró el modelo. La coincidencia más cercana, Assurance CS Fuel Max 265/60R18, salió del resumen de una búsqueda sin URL directa. NO CONFIRMADO.
- PROXES ST3: https://www.tyrereviews.com/Tyre/Toyo/Proxes-ST-III.htm ; https://simpletire.com/brands/toyo-tires/proxes-st-iii
- TYDRB: no se encontró ninguna fuente. NO CONFIRMADO.
- ALL TERRAIN USA: https://www.thedrive.com/news/the-bfgoodrich-ko2-is-over-heres-how-the-ko3-compares ; https://bfgoodrich.ca/en/auto/tires/all-terrain-t-a-ko3
- HT (Michelin): https://tiresize.com/tires/Michelin/Primacy-LTX-245-70R17.htm ; https://stmtires.com/?p=358195
