# Mundillantas / Competimotor — lista de arranque (prueba de 2 semanas)

> Qué hay que aprender del cliente en las 2 semanas y **dónde va cada respuesta**. Cada fila es una
> perilla con lugar fijo (ver [MULTICLIENTE.md §3.2](../MULTICLIENTE.md)). Cuando llega la
> respuesta, se cambia ese lugar y nada más. Estado: ⬜ sin respuesta · 🟨 respuesta parcial ·
> ✅ cargado y probado en el simulador.
>
> Contexto: [pitch del 4-nov](../reuniones/2026-11-04-mundillantas-competimotor.md) ·
> [ficha del cliente](mundillantas.md) · [Fénix](../integraciones/FENIX.md).

## Lo que ya sabemos (4-nov)

- Dos marcas: **Mundillantas** (2 locales, nombre sin patentar) y **Competimotor** (1 local, patentado). Responden como las dos.
- Fénix en **servidor local**, sin API. Ella propone exportar el inventario a Excel cada día o cada dos días.
- Vendedores **solo a comisión**. Horario lunes a sábado 8:00–18:00 (8–12:30 y 12:30–18). Domingo cerrado [SUPUESTO].
- Pauta ~$80/mes, ~100 mensajes. Diciembre es su mejor mes.
- Alcance: llantas y aros; lo demás pasa al asesor.
- Personas: Jenny Paz Álvarez, Angie (cuñada), Carlos. Falta: contacto designado y quién decide.

## Perillas por llenar

| # | Pregunta al cliente | Perilla (dónde se carga) | Quién responde | Estado |
|---|---|---|---|---|
| 1 | Contacto del proyecto y quién decide | `docs/clientes/mundillantas.md` | Jenny | ⬜ |
| 2 | Número de WhatsApp de ventas; ¿uno solo para las dos marcas? | Canal en Ajustes; `presentacion` en `negocios/mundillantas.ts` | Jenny | 🟨 6-nov: dio dos celulares (de asesores), los dos con WhatsApp Business. 7-nov: se conecta **uno solo** por coexistencia (el que más escriben los clientes); el otro sigue a mano. Falta que Jenny diga cuál |
| 3 | Por cada local: nombre como lo dicen los clientes, dirección, pin de Maps, link corto, teléfono, marca (Mundillantas/Competimotor) | `locales[]` e `identidades[]` en `negocios/mundillantas.ts` | Jenny | 🟨 6-nov: los 3 con dirección; pin de Falken y Competimotor; falta el pin de Kenda (7-nov: el mapa que pasaron como «Kenda» es otra vez `-0.261770,-79.186684` = Falken; se le vuelve a pedir) |
| 4 | Horario de cada local, feriados, cierres de mediodía | Ajustes → Horarios (arranque en `horarioPorDefecto`) | Jenny | 🟨 no contestó el horario por local; sigue L–S 8–18 del pitch |
| 5 | Zonas de Santo Domingo por las que la gente dice dónde vive, y a qué local queda cada una | `sectores[]` (vacío = el bot pide el pin, que está bien) | Asesores | ⬜ |
| 6 | Captura del Excel de inventario de Fénix: columnas, ¿stock por local?, ¿precio con IVA?, qué lista es la del público, ¿hay precio de lista y precio mínimo (para mostrar descuento)? | Ajustes → Catálogo (`catalogo_mapeo`) | Contacto designado | ✅ 6-nov (ver la nota de abajo); falta que Jenny diga si hay precio mínimo |
| 7 | Cómo distinguir un aro de una llanta en ese Excel, y qué datos del aro hay (diámetro, pernos, offset, acabado, foto) | `catalogo_mapeo.filasDeAros` | Contacto | ⬜ |
| 8 | Marcas que venden y cuál es premium / equilibrio / económica | `app/assets/mundillantas/escalera-precio.json` | Jenny | 🟨 6-nov: Kenda, Falken, Winrun, Maxxis (en `marcas`); falta el escalón |
| 9 | Garantía de fábrica y seguro por marca | `garantias` en el perfil | Jenny | 🟨 6-nov: «fábrica + seguro contra impacto» en las 4 marcas, SIN meses ni años |
| 10 | Datos de cada marca para argumentar (origen, rendimiento) | `app/assets/mundillantas/conocimiento-marcas.json` | Jenny / nosotros | ⬜ |
| 11 | Formas de pago, cuotas sin intereses, descuento por efectivo | `politicas/mundillantas.ts` (`formasDePago`, `cuotasSinIntereses`, `descuentoEnEfectivo`) | Jenny | 🟨 6-nov: efectivo, transferencia, tarjeta 6 m sin intereses / 12 m con intereses; falta descuento en efectivo y si la tarjeta cuesta igual |
| 12 | Qué incluye la compra (alineación, balanceo, válvulas, nitrógeno) y si aplica con una sola llanta | Ajustes → Promociones (`benefits`) + `piezas.todasIncluyen` | Jenny | 🟨 6-nov: respuesta ambigua (ver abajo); NO cargado |
| 13 | ¿Envían a otras ciudades? ¿Cómo cobran el envío? | `politica.vendeADistancia` |
| 13b | ¿Venden de a 4 o también de a 1–2? ¿Qué productos pasan directo al asesor? | `politica.juegoCompleto`, `politica.productosQueDerivaAlAsesor` | Jenny | ⬜ |
| 14 | ¿Llanta de camión? | Fuera del plan actual (ver MULTICLIENTE §5.9) | Jenny | ⬜ |
| 15 | Asesores: nombre, teléfono, local; quién recibe cotizaciones, visitas, pedidos de asesor | Ajustes → Asesores + `asesores_por_local` | Jenny | 🟨 6-nov: Carlos André Pazmiño (Competimotor) y Moroni Pazmiño (Mundillantas); falta cuál de los 2 locales Mundillantas y cargarlos en el panel |
| 16 | Nombre del vendedor del bot | `vendedor.nombre` | Jenny | ⬜ |
| 17 | Texto al pie de las piezas: condiciones, medios de pago, «todas incluyen» | `piezas` en el perfil | Jenny | 🟨 6-nov: condiciones y medios de pago cargados; falta «todas incluyen» |
| 18 | Logos de las dos marcas (PNG con fondo transparente) | `app/assets/mundillantas/logo-*.png` | Jenny | 🟨 6-nov: Competimotor ✅; Mundillantas solo en captura de 270 px |
| 19 | ¿Pueden exportar facturas de Fénix con el teléfono del cliente? | Ajustes → Ventas (importar facturas) | Contacto | ⬜ |
| 20 | ¿Quién cobra la comisión de una venta que trajo el bot? | Acuerdo comercial (no es código; ver la reunión con Andrés) | Jenny | ⬜ |
| 21 | Razón social, RUC y correo para facturar | `facturacion` en el perfil | Jenny | ⬜ |
| 22 | Acceso de administrador al portafolio de Meta | `docs/CONECTAR_WHATSAPP_CLIENTE.md` | Jenny | 🟨 6-nov: «aquí tengo los teléfonos»; no confirmó acceso al Business Manager |

## Orden sugerido para las 2 semanas

- **Días 1–2:** filas 1, 2, 3, 6, 22. Sin número, locales y catálogo no hay bot. Crear el servicio
  en Railway con `BOT_POWER_DEFAULT=off` (ver `docs/clientes/ALTA-DE-CLIENTE.md`).
- **Días 3–5:** filas 4, 7, 8, 11, 12, 15, 16. Cargar todo y correr el simulador con
  `--perfil mundillantas` (ver ALTA-DE-CLIENTE) hasta que conteste bien 20 chats reales de ellos.
- **Días 6–7:** encender el bot en su número con un horario corto (fuera de horario primero, donde
  no pisa a nadie). Revisar cada chat el mismo día.
- **Semana 2:** filas 9, 10, 13, 17, 18, 19. Ajustar con lo que se vea en los chats; subir facturas
  para medir. Al final: informe con gráfico de control y la decisión de pagar la instalación.

## Qué NO se cambia por cliente

Cómo se lee una medida, cuándo un «sí» autoriza, el guardián, los seguimientos, las tres opciones,
el cierre de local y día. Si un chat de Mundillantas muestra un error del bot, se arregla **en el
código común** y sale para los dos clientes (con su prueba en rojo, como siempre).

## Nota del Sprint Final (4-nov-2026): el mapeo del catálogo es un SUPUESTO

El mapeo por defecto del catálogo y de las facturas (`catalogo_mapeo` /
`facturas_mapeo`) usa columnas **estilo Fénix supuestas** (`codigo`,
`descripcion`, `marca`, `modelo`, `medida`, `linea`, `pvp`, `pvp lista`,
`stock`, precios sin IVA) y **sin `precioMinimo`** (sin él no se muestra
descuento: precio de venta = precio de lista). Cuando llegue el Excel real de
Jenny (filas 6–7 de la lista), el mapeo se ajusta desde Ajustes → Catálogo,
sin deploy.

## 6-nov-2026: llegó el Excel real y es el mapeo por defecto

Jenny mandó `INVENTARIO_06NOV_fenix.xls` (solo llantas, por la prueba). Es el
reporte «Inventario de Articulos» de Fénix tal cual: `.xls` viejo, 15 filas de
membrete, filas «Categoria: LLANTAS RIN 16 CAMIONETA» / «Subcategoria: …» y
filas de totales. Columnas: `Código`, `Alterno`, `Articulo` (marca + medida +
diseño en un solo texto), `Precio A`–`Precio D`, `Existencia` y el stock de
`Principal` (vacía), `Compe`, `Matriz`, `Tsachila`, `La Feria`.

El cargador ya lo lee sin convertirlo, y ese es ahora el mapeo por defecto:

| Qué | Decisión | Por qué |
|---|---|---|
| Precio al público | `Precio A`, **ya con IVA** | Los precios son enteros × 1,15 (41 × 1,15 = 47,15) o terminan en ,99 |
| Descuento visible | Ninguno (sin `precioMinimo`) | Falta que Jenny diga cuál lista es su piso. Se pone en Ajustes → Catálogo |
| Control de tipeo | `Precio D` (`precioControl`) | Si A sale menor que D, la fila se descarta con su motivo |
| Stock | `Existencia` (el total), negativo = 0 | La suma de los locales no cuadra: Principal viene vacía |
| Marca / diseño | Salen de `Articulo` | Primera palabra = marca; el diseño, sin marca ni medida |
| Aros | Filas cuya `categoria` empieza con «aro» o «rin» | Este Excel no trae aros |

Resultado del 6-nov: **482 de 501 llantas al bot**. Fuera quedan 17 de camión con
aro 17.5 / 22.5 (se leían como aro 17 / 22 y se le podían ofrecer a una camioneta),
la AOQISHI LT245/75R16 (cód. 008760, Precio A $17,80 con Precio D $138) y la RADAR
235/50R19 (cód. 2006, todos los precios en 0). También hay que avisarle a Jenny:
la CARLEO 215/75R17.5 tiene Precio B $1.177,99 y la FALKEN 265/65R17 WILDPEAK AT4W
tiene existencia −4.

## 6-nov-2026: respuestas de Jenny a las 6 preguntas (WhatsApp, 5:34–6:01 PM)

Manuel le mandó 6 preguntas a las 5:16 PM (número del bot, locales, asesores, qué incluye la
compra, formas de pago, garantías) y pidió logo/paleta para el PDF. Lo que contestó, **palabra
por palabra**, y dónde quedó:

| # | Lo que dijo Jenny | Dónde quedó | Qué falta |
|---|---|---|---|
| 1 | (No contestó cuál número usa el bot. A «¿tienen acceso a las cuentas de Meta?» dijo «Aquí tengo los teléfono».) | `telefono` sigue `[PENDIENTE]` | Número del bot y acceso de administrador al Business Manager |
| 2 | «Vía Quevedo km 1 1/2 y Juan León Mera #834 en competimotor» · «Sucursal 1 de mundillantas es vía Quevedo km 2 y Manuel Borrero margen derecho falken mundillantas» · «sucursal 2 vía Quevedo km 1 1/2 a una cuadra del Banco Pichincha margen derecho mundillantas kenda» + fotos y pines | `locales[]`: `matriz` = **Mundillantas Falken**, `local2` = **Mundillantas Kenda**, `competimotor` | Pin de Kenda (reenvió el de Falken); horario por local |
| 3 | «Competimotor es 0985487924 Carlos Andre Pazmiño · Mundillantas 0969837513 es Moroni Pazmiño» | Este documento (Ajustes → Asesores se carga desde el panel) | ¿Moroni atiende los dos Mundillantas? ¿Alguno de estos es el número del bot? |
| 4 | «Por la compra de las 4 llantas incluye todos el servicio y mantenimiento cada 10 mil kilómetros por las dos llantas todo menos alineación» | `piezas.todasIncluyen` sigue `[PENDIENTE]` (no se interpreta) | Qué es «todo el servicio» (¿montaje, balanceo, válvulas?), qué es el mantenimiento cada 10.000 km (¿rotación + balanceo?), por cuánto tiempo, y qué pasa si compran 1–2 |
| 5 | «Formas de pago efectivo, transferencia, tarjetas de crédito todas hasta 6 meses sin intereses. Y 1 año con intereses» | `politica.formasDePago`, `cuotasSinIntereses`; pie de piezas | ¿Hay descuento en efectivo? ¿La tarjeta cuesta igual que el efectivo? (sin eso el bot NO dice «no sube con tarjeta») |
| 6 | «Garantía normal de fábrica y seguro contra impacto las marcas kenda, falken, winrun y Maxxis» | `marcas` = las 4; `garantias` sigue en 0 | Meses del seguro contra impacto, años de fábrica, condiciones; ¿y las otras marcas (Toyo, BFGoodrich, Aeolus de los letreros)? |
| — | Logos: mandó Competimotor rojo y blanco (1080×1080). Mundillantas: una captura chica | `app/assets/mundillantas/` (ver su LEEME) | Archivo original del logo de Mundillantas |

**Pines.** Falken = `-0.261770, -79.186684` (a 6 m del Plus Code que usábamos como «matriz»:
era este local). Competimotor = `-0.259614, -79.183052` (~470 m hacia el centro, coherente con
km 1½). El mapa que reenvió para Kenda es el mismo de Falken, así que Kenda queda con ese pin
hasta tener el real (`PENDIENTES_NUMERICOS`).

**Cómo elige local el bot.** Los tres están sobre la Vía Quevedo: «quevedo» ya no elige la
matriz. «falken» y «kenda» solos tampoco eligen local (son marcas que el cliente pide); sí
«mundi kenda», «banco pichincha», «manuel borrero», «km 2», «juan león mera».

**Lo que se ve en los letreros.** Falken: Llantas, Aros, Lubricantes, Mecánica (Falken, Kenda,
Winrun, Toyo, BFGoodrich, Aeolus). Kenda: Baterías, Lubricantes, Frenos, Mecánica, Alineación y
Balanceo (Kenda, Falken, Winrun, grupoInter). Competimotor: Maxxis, alineadora. Cargado en
`politica.serviciosQueOfrece` (el bot los nombra y los pasa al asesor; no los cotiza).

**Presentación.** Desde el 6-nov el bot dice «Competimotor y Mundillantas» (Manuel lo pidió con
Competimotor primero) y todas las piezas y PDF llevan las dos marcas. Prefijo de cupón: `CM-`
(antes `MC-`; ningún cupón salió porque el bot sigue apagado).

**Pendiente de saber del Excel de Fénix.** Trae stock en `Compe`, `Matriz`, `Tsachila`,
`La Feria` y `Principal`: son 5 columnas para 3 locales. Hay que saber cuál columna es cuál local
para poder decir «hay 4 en Competimotor» en vez del total.

## 7-nov-2026: un solo número, por coexistencia, con el celular de un asesor

Manuel prefiere que el bot use **uno de los dos celulares de los asesores** y no un número nuevo:
con coexistencia la app verde de WhatsApp Business sigue en el celular, así que el asesor puede
contestar **pasadas las 24 h**, cosa que el panel no puede (fuera de la ventana la API solo manda
plantillas). Los dos números ya tienen WhatsApp Business.

- **Uno solo en la prueba.** El bot hoy maneja un `WHATSAPP_PHONE_ID` por servicio; dos números
  piden un segundo servicio o cambiar el código. El otro número sigue atendido a mano.
- **Cuál:** el que más escriben los clientes (el de los anuncios). Tiene que ser solo de ventas:
  el bot le contesta a todo el que escriba.
- **Al conectar:** nunca aceptar *migrar* ni *eliminar el número de la app* (ver
  `docs/CONECTAR_WHATSAPP_CLIENTE.md`).

**Las 7 preguntas que bloquean prender el bot** (mensaje a Jenny del 7-nov): cuál de los dos
celulares conectar · acceso de administrador a Meta Business · qué incluye la compra y si aplica
con 1 llanta · si venden de a 1–2 o solo juegos de 4 · horario de los 3 locales y domingo · en qué
local está Moroni y a quién van las cotizaciones · el pin real de Kenda (km 1½, Banco Pichincha).

## 8-nov-2026: Jenny contestó (WhatsApp, 5:25 PM)

| Pregunta | Lo que dijo Jenny | Dónde quedó |
|---|---|---|
| Número del bot | «El número que usaría sería el de Competimotor que le pasé: +593 99-124-4698» | `telefono` = `+593 99 124 4698`. OJO: no es el celular de Carlos que dio el 6-nov (0985487924) |
| Acceso a Meta Business | (Dejó el «2.» en blanco) | Sigue pendiente: sin esto no se conecta el número |
| Qué incluye la compra | «Comprando las 4 llantas incluye alineación, balanceo, nitrógeno y enllantaje, y si llevan una sola llanta incluye solo balanceo, nitrógeno y enllantaje; alineación no porque solo se da cuando lleva las 4 llantas» | `beneficiosDeArranque` (tabla `benefits`, migración 032) + `piezas.todasIncluyen` |
| ¿Venden de a 1–2? | «Se vende cualquier número de llantas» | Sin cambio de código: el bot cotiza la cantidad que piden |
| Horario de los 3 locales | «Sí los tres atienden. Lo mismo, pero el horario es de lunes a viernes de 8am hasta las 6pm y los sábados de 8am hasta las 4pm» | `horasPorDia` (sábado 16:00). Producción: hay que cambiar `store_hours` (Ajustes → Horarios) |
| Moroni | «Y Moroni atiende Mundillantas» | Asesores: Carlos → `competimotor`, Moroni → `matriz` y `local2` (Ajustes → Asesores) |
| Pin de Kenda | «La ubicación de Google Maps ya le paso de los 3 locales» | Pendiente |

El mantenimiento cada 10.000 km que nombró el 6-nov no lo repitió: no se promete.

## 9-nov-2026: Jenny mandó los links de Google Maps de la matriz y de Competimotor

Dos links cortos por WhatsApp. Se siguieron las redirecciones hasta la ficha de cada local en
Google Maps y se sacó el pin de la ficha (no del centro del mapa):

| Local | Link de Jenny | Ficha en Maps | Pin anterior (6-nov) | Pin nuevo (9-nov) | Distancia |
|---|---|---|---|---|---|
| `matriz` (Mundillantas Falken) | https://maps.app.goo.gl/swNHGotRKPLJn3LZA | «Mundillantas Matriz», PRQ7+887, Av. Quevedo | `-0.261770, -79.186684` | `-0.2617224, -79.186715` | 6 m |
| `competimotor` | https://maps.app.goo.gl/QTFCzK2KDRXULRwz7 | «COMPETIMOTOR SA», Av. Quevedo y Juan León Mera, km 1½ (PRR8+5R) | `-0.259614, -79.183052` | `-0.2595733, -79.1829972` | 8 m |

Los dos pines del 6-nov ya eran estos locales (a menos de 10 m): lo que cambia es el pin exacto
de la ficha y que el bot ahora manda **el link de Jenny** (`maps.app.goo.gl/…`, abre la ficha con
nombre, fotos y horario) en vez de `maps.google.com/?q=lat,lng` (un alfiler suelto). El link de
Competimotor se guarda sin el `?g_st=aw` de compartir: abre la misma ficha.

**Direcciones: sin cambio.** Maps no dice nada más preciso que lo que dio Jenny el 6-nov
(«Vía Quevedo km 2 y Manuel Borrero» / «km 1½ y Juan León Mera #834»).

**Producción: no hace falta migración.** Los locales salen solo de
`app/src/negocio/negocios/mundillantas.ts`; se revisaron las 34 tablas de Postgres-Mundillantas
(solo lectura) y ninguna guarda coordenadas ni links de Maps. Queda vivo con el próximo deploy
de `main`.

**Kenda (`local2`) sigue sin pin propio.** Ninguno de estos dos links es el de Kenda. Sigue con
el pin de Falken (ahora el nuevo, 6 m más allá) y **sin link** de Maps: el bot no manda el link de
otro local. Pendiente en `PENDIENTES_NUMERICOS`.

**Probado en el simulador** (`--perfil mundillantas`, bot encendido a mano): a «¿dónde quedan sus
locales? me pasa la ubicación» contestó con
`📍 *Mundillantas Falken*: https://maps.app.goo.gl/swNHGotRKPLJn3LZA` y
`📍 *Competimotor*: https://maps.app.goo.gl/QTFCzK2KDRXULRwz7`; a «¿la dirección exacta de
Competimotor?», solo el de Competimotor.
