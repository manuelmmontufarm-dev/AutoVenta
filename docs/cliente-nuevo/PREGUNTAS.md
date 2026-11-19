# Preguntas para un cliente nuevo

> Parte de la [guía de cliente nuevo](README.md) (paso 2).
> Lista viva: cada pregunta que haya que hacerle a un cliente y no esté aquí, se agrega.
> Origen: lo que se le preguntó a Depot Tire y a Competimotor / Mundillantas (4 al 18-nov-2026).

## Cómo preguntar

- **Todo en el día 1, en un solo envío.** Los bloques A, B y C juntos.
- **Tablas en Excel con celdas amarillas** («llene solo lo amarillo; si no aplica, escriba no»).
  Modelos ya hechos: [Preguntas-Competimotor-Mundillantas.xlsx](../clientes/Preguntas-Competimotor-Mundillantas.xlsx)
  y [Preguntas-operativas-Competimotor-Mundillantas.xlsx](../clientes/Preguntas-operativas-Competimotor-Mundillantas.xlsx).
- **Preguntas cerradas y con ejemplo.** «Con 1 sola llanta, incluye alineación? sí / no» funciona.
  «Qué incluye la compra?» trae una respuesta que no se puede cargar.
- **Una sola persona responde.** Pedir el contacto del proyecto antes de preguntar nada.
- Los mensajes de WhatsApp van cortos y sin «¿» ni «¡» de apertura.
- Cada respuesta se anota **palabra por palabra** en `docs/clientes/<id>-arranque.md`, junto al
  lugar donde se cargó. Si la respuesta es ambigua, no se interpreta: se vuelve a preguntar.

La columna «Bloquea» dice si sin esa respuesta el bot no se puede encender.

---

## Bloque A — Meta y WhatsApp (día 1; es la espera más larga)

| # | Pregunta | Bloquea | Notas |
|---|---|---|---|
| A1 | Me agregan como **administrador** de su Business de Facebook? (business.facebook.com → Configuración → Personas → Agregar → mi correo → Acceso total) | Sí | El correo es el del Facebook de Manuel |
| A2 | Me mandan el **certificado del RUC** en PDF? | Sí | Da la razón social exacta y la dirección |
| A3 | Me mandan una **foto con el celular** del documento de identidad **vigente** de un socio que salga en el RUC? Los dos lados, sin reflejo | Sí | Vencido o escaneado = Meta lo rechaza |
| A4 | **Qué número** de WhatsApp va a usar el bot? Es el mismo al que mandan los anuncios? | Sí | Tiene que ser solo de ventas: el bot le contesta a todo el que escriba |
| A5 | Ese número usa la app **WhatsApp Business** (la verde con la B)? Desde cuándo? | Sí | Meta pide un número en uso activo |
| A6 | **Quién tiene ese celular en la mano** y cuándo puede hacer una videollamada de 15 minutos? | Sí | Para escanear el código |
| A7 | Usan o usaron algún CRM o bot conectado al WhatsApp (Kommo, otro)? | No | Si ya hay cuenta de API, el paso de Kommo se salta |
| A8 | Tienen página web? Si no, cuál es su página de Facebook o Instagram? | Sí | Meta pide una dirección que abra con https |
| A9 | Quién va a poner la **tarjeta** en la cuenta de WhatsApp para lo que cobra Meta? | No | Hace falta para las plantillas |
| A10 | Cuántos números quieren con bot? Una marca por número? | Sí | Cada número es otro servicio y otra mensualidad |

Mensaje modelo para A1–A3:

> Para conectar el WhatsApp al bot Meta pide verificar la empresa, es normal con todos. Necesito:
> el certificado del RUC, una foto con el celular de la cédula vigente de quien sale como socio
> (los dos lados, sin reflejo), y que me agreguen como administrador en su Business de Facebook.
> Con eso yo hago el resto.

## Bloque B — Inventario y sistema (día 1)

| # | Pregunta | Bloquea | Dónde se carga |
|---|---|---|---|
| B1 | Qué sistema contable usan? Está en una computadora del local o se abre desde una página web? | Sí | `docs/clientes/<id>.md` |
| B2 | Me mandan el **Excel de inventario tal como sale del sistema**, sin arreglarlo? | Sí | Panel → Inventario |
| B3 | El Excel trae varios precios. **Cuál es cada uno** (normal, tarjeta, efectivo, mayorista)? Cuál da el bot? | Sí | Mapeo del catálogo |
| B4 | Los precios ya **incluyen IVA**? | Sí | Mapeo del catálogo |
| B5 | Hay algún precio que **nunca** se le debe decir al cliente? | Sí | Mapeo del catálogo |
| B6 | El stock: usamos el **total** o por local? Si es por local, qué columna es cada local? | Sí | Mapeo del catálogo |
| B7 | **Quién sube el Excel cada día y a qué hora?** | Sí | Ficha del cliente |
| B8 | Pueden exportar las **facturas con el teléfono del cliente** (un Excel por semana)? | No | Panel → Ventas. Sin esto no se puede probar qué vendió el bot |
| B9 | Venden **aros**? Vienen en el mismo Excel? Qué datos traen? | No | Mapeo del catálogo |
| B10 | Venden llanta de **camión**? | No | Hoy queda fuera del bot |
| B11 | Hay un precio mínimo o el bot no da descuentos? | No | Mapeo del catálogo |

## Bloque C — El negocio (día 1, en Excel)

| # | Pregunta | Bloquea | Dónde se carga |
|---|---|---|---|
| C1 | Contacto del proyecto y **quién decide** | Sí | Ficha del cliente |
| C2 | Por cada local: nombre como lo dicen los clientes, dirección, **link de Google Maps** y teléfono | Sí | `locales[]` en el perfil |
| C3 | Horario de cada local: lunes a viernes, **sábado**, domingo, mediodía, feriados | Sí | Ajustes → Horarios |
| C4 | **Asesores**: nombre, celular, en qué local atiende cada uno, quién recibe las cotizaciones | Sí | Ajustes → Avisos |
| C5 | Quién recibe el **reporte diario** (dueño o gerente)? | No | Ajustes → Avisos, Nivel 1 |
| C6 | **Formas de pago**: efectivo, transferencia, tarjeta. Cuántos meses sin intereses? | Sí | `politicas/<id>.ts` |
| C7 | El precio **cambia según cómo paga**? Con tarjeta cuesta igual que en efectivo? Y la transferencia? | Sí | `politicas/<id>.ts` y mapeo |
| C8 | Comprando **4 llantas**, qué incluye? (alineación, balanceo, nitrógeno, enllantaje, válvulas: sí / no cada uno) | Sí | Ajustes → Promociones |
| C9 | Comprando **1 o 2 llantas**, qué incluye? | Sí | Ajustes → Promociones |
| C10 | Venden cualquier cantidad o solo juegos de 4? | No | `politica.juegoCompleto` |
| C11 | Por marca: meses del **seguro contra impacto**, años de **garantía de fábrica**, país de origen, kilómetros aproximados, tecnología | Sí | Hoja «Garantías» → perfil y `conocimiento-marcas.json` |
| C12 | Qué cubre el seguro y qué necesita el cliente para usarlo (factura, etc.)? | No | Perfil |
| C13 | Qué **marcas recomienda primero** el bot? Cuál es premium, cuál media y cuál económica? | Sí | `escalera-precio.json` |
| C14 | Hay **mantenimiento** incluido (cada cuántos km)? Qué incluye exactamente y por cuánto tiempo? | No | Si no queda claro, el bot no lo promete |
| C15 | Hacen **envíos** a otras ciudades? Con qué empresa? **Quién paga** el envío? | No | `politica.vendeADistancia` |
| C16 | Reciben llantas o aros usados como **parte de pago**? | No | Política |
| C17 | Cuánto demora la instalación? Con **cita** o por orden de llegada? | No | Política |
| C18 | Qué otros productos y servicios tienen (baterías, aceites, mecánica)? El bot los pasa al asesor | No | `politica.serviciosQueOfrece` |
| C19 | Zonas o barrios por los que la gente dice dónde vive, y qué local le queda más cerca | No | `sectores[]` (vacío = el bot pide la ubicación) |
| C20 | **Promociones** vigentes: cuál es, desde y hasta qué fecha | No | Ajustes → Promociones |
| C21 | Cómo se llama el **vendedor** del bot? | No | `vendedor.nombre` |
| C22 | **Logos** originales (PNG con fondo transparente o el archivo del diseñador) y colores | No | `app/assets/<id>/` |
| C23 | Con qué **marca** se presenta el bot y qué va en el encabezado de la cotización? | Sí | `presentacion` en el perfil |
| C24 | Razón social, RUC y correo para **facturarles** | No | `facturacion` en el perfil |

## Bloque D — Anuncios (si van a pautar)

| # | Pregunta | Notas |
|---|---|---|
| D1 | Están pautando hoy? Cuánto al mes y cuántos mensajes les llegan? | Línea de base para medir |
| D2 | A qué número mandan los anuncios? | Tiene que ser el del bot |
| D3 | Quién maneja la pauta? Tienen diseñador o agencia? | Para coordinar el arranque |
| D4 | Me dan acceso a la cuenta publicitaria? | Si es de un perfil personal, solo se puede dar a amigos de Facebook de ese perfil |
| D5 | A qué ciudades o provincias quieren llegar? | |
| D6 | Qué día sale el próximo anuncio? | El bot tiene que estar abierto antes |

## Bloque E — Operación (antes de encender)

| # | Pregunta | Notas |
|---|---|---|
| E1 | Los asesores saben que les va a llegar un aviso por WhatsApp y qué hacer con él? | Tienen que contestarle al número del bot una vez, o Meta bloquea los avisos (error 131047) |
| E2 | Quién contesta un chat pasadas las 24 horas? | Desde el celular con WhatsApp Business |
| E3 | Quién cobra la comisión de una venta que trajo el bot? | Va en el acuerdo, no en el código |
| E4 | Quién de ustedes va a entrar al panel? | Un usuario por persona |
| E5 | Quién nos avisa si el bot contesta algo mal? | Un solo canal: el grupo de WhatsApp |

---

## Respuestas que sirven de referencia

Para saber cómo se ve una respuesta completa:

- Competimotor, 18-nov-2026: [respuestas del negocio](../clientes/Preguntas-Competimotor-Mundillantas-respondido-18nov.xlsx)
  y [operativas](../clientes/Preguntas-operativas-Competimotor-Mundillantas-respondido-18nov.xlsx).
- El historial completo de preguntas y respuestas, día por día:
  [mundillantas-arranque.md](../clientes/mundillantas-arranque.md).

## Preguntas que hubo que repetir

Si una de estas vuelve sin respuesta clara, insistir el mismo día:

| Pregunta | Qué pasó con Competimotor |
|---|---|
| Qué número usa el bot (A4) | Cambió tres veces: 098 548 7924 → 099 124 4698 → 098 548 7924 |
| Acceso a Meta (A1) | La dejaron en blanco dos veces. Se resolvió con una videollamada |
| Qué incluye la compra (C8, C9) | La primera respuesta era ambigua. Se resolvió preguntando por 4 llantas y por 1 llanta por separado |
| Garantías por marca (C11) | Primero «garantía de fábrica y seguro», sin meses. Se resolvió con la hoja de Excel |
| Link de Maps de cada local (C2) | Mandaron dos veces el mismo link para dos locales distintos |
| Logo original (C22) | Llegó una captura de 270 px |
| Quién paga el envío (C15) | Respondieron la empresa de transporte, no quién paga |
