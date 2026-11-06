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
| 2 | Número de WhatsApp de ventas; ¿uno solo para las dos marcas? | Canal en Ajustes; `presentacion` en `negocios/mundillantas.ts` | Jenny | ⬜ |
| 3 | Por cada local: nombre como lo dicen los clientes, dirección, pin de Maps, link corto, teléfono, marca (Mundillantas/Competimotor) | `locales[]` e `identidades[]` en `negocios/mundillantas.ts` | Jenny | 🟨 (solo la matriz, Av. Quevedo km 1) |
| 4 | Horario de cada local, feriados, cierres de mediodía | Ajustes → Horarios (arranque en `horarioPorDefecto`) | Jenny | 🟨 |
| 5 | Zonas de Santo Domingo por las que la gente dice dónde vive, y a qué local queda cada una | `sectores[]` (vacío = el bot pide el pin, que está bien) | Asesores | ⬜ |
| 6 | Captura del Excel de inventario de Fénix: columnas, ¿stock por local?, ¿precio con IVA?, qué lista es la del público, ¿hay precio de lista y precio mínimo (para mostrar descuento)? | Ajustes → Catálogo (`catalogo_mapeo`) | Contacto designado | ✅ 6-nov (ver la nota de abajo); falta que Jenny diga si hay precio mínimo |
| 7 | Cómo distinguir un aro de una llanta en ese Excel, y qué datos del aro hay (diámetro, pernos, offset, acabado, foto) | `catalogo_mapeo.filasDeAros` | Contacto | ⬜ |
| 8 | Marcas que venden y cuál es premium / equilibrio / económica | `app/assets/mundillantas/escalera-precio.json` | Jenny | ⬜ |
| 9 | Garantía de fábrica y seguro por marca | `garantias` en el perfil | Jenny | ⬜ |
| 10 | Datos de cada marca para argumentar (origen, rendimiento) | `app/assets/mundillantas/conocimiento-marcas.json` | Jenny / nosotros | ⬜ |
| 11 | Formas de pago, cuotas sin intereses, descuento por efectivo | `politicas/mundillantas.ts` (`formasDePago`, `cuotasSinIntereses`, `descuentoEnEfectivo`) | Jenny | ⬜ |
| 12 | Qué incluye la compra (alineación, balanceo, válvulas, nitrógeno) y si aplica con una sola llanta | Ajustes → Promociones (`benefits`) | Jenny | ⬜ |
| 13 | ¿Envían a otras ciudades? ¿Cómo cobran el envío? | `politica.vendeADistancia` |
| 13b | ¿Venden de a 4 o también de a 1–2? ¿Qué productos pasan directo al asesor? | `politica.juegoCompleto`, `politica.productosQueDerivaAlAsesor` | Jenny | ⬜ |
| 14 | ¿Llanta de camión? | Fuera del plan actual (ver MULTICLIENTE §5.9) | Jenny | ⬜ |
| 15 | Asesores: nombre, teléfono, local; quién recibe cotizaciones, visitas, pedidos de asesor | Ajustes → Asesores + `asesores_por_local` | Jenny | ⬜ |
| 16 | Nombre del vendedor del bot | `vendedor.nombre` | Jenny | ⬜ |
| 17 | Texto al pie de las piezas: condiciones, medios de pago, «todas incluyen» | `piezas` en el perfil | Jenny | ⬜ |
| 18 | Logos de las dos marcas (PNG con fondo transparente) | `app/assets/mundillantas/logo-*.png` | Jenny | ⬜ |
| 19 | ¿Pueden exportar facturas de Fénix con el teléfono del cliente? | Ajustes → Ventas (importar facturas) | Contacto | ⬜ |
| 20 | ¿Quién cobra la comisión de una venta que trajo el bot? | Acuerdo comercial (no es código; ver la reunión con Andrés) | Jenny | ⬜ |
| 21 | Razón social, RUC y correo para facturar | `facturacion` en el perfil | Jenny | ⬜ |
| 22 | Acceso de administrador al portafolio de Meta | `docs/CONECTAR_WHATSAPP_CLIENTE.md` | Jenny | ⬜ |

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
