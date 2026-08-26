# Cruce cotizaciones ↔ facturas de Contífico

Responde una sola pregunta: **de todo lo que el bot cotizó, ¿cuánto terminó
facturado de verdad?** Hoy "venta ganada" es lo que alguien marcó a mano en el
Kanban (`sales_history`), sin que nadie lo contraste contra facturación real.

```bash
node scripts/cruce-facturas/extraer.mjs   # baja documentos + padrón (~4 min)
node scripts/cruce-facturas/cruce.mjs     # cruza y reporta
```

`extraer.mjs` cachea en `datos/`; usa `--refrescar` para volver a bajar.

## La llave es el teléfono, y hay que normalizarlo

`quotes` no guarda teléfono: se llega por `conversation_id → conversations.phone`.
Y Contífico no conoce el número de cotización del bot, así que el teléfono es el
único punto de contacto entre los dos sistemas.

Los formatos no coinciden:

| Origen | Formato | Ejemplo |
|---|---|---|
| `conversations.phone` | `wa_id` de Meta, sin `+` | `593982801766` |
| `cliente.telefonos` de Contífico | local, con 0 | `0982801766` |

Se comparan los **últimos 9 dígitos**, que es lo único que ambos comparten. Un
cliente en Contífico puede tener varios teléfonos en el mismo campo, así que se
parte por cualquier separador.

## Qué cuenta como venta

- Solo `tipo_documento === "FAC"` y `anulado === false`. `PRE` es proforma, `CUO`
  es cuota y `NCT` nota de crédito: ninguna es una venta facturada.
- Solo cuenta la factura emitida **el día de la cotización o después**. Una
  factura anterior es un cliente que ya compraba, no algo que trajo el bot.

## Límites de la API

La v2 de Contífico ignora los filtros `tipo_documento` y de fechas: devuelve el
mismo total sin importar lo que se le mande. El único que respeta es
`tipo_registro`. Por eso se baja todo y se filtra en local. La v1 de `/documento/`
no responde (cuelga hasta el timeout).

## Puntos de emisión = sucursales

Confirmado por Joaquín el 26-ago-2026:

| Prefijo de factura | Sucursal | Facturas | Equipo |
|---|---|---|---|
| `002-001` | **Cumbayá** | 588 | Cristina Lojano, Alisson Cornejo |
| `001-001` | **Quito (Sur)** | 2 713 | Eugenia Nenger, Almacén Alonso |

Contífico NO trae el nombre del local en ningún campo, así que esta tabla es la
única forma de saber dónde se facturó algo. OJO: los vendedores llamados
«Almacen Cumbaya» aparecen sobre todo en `001-001`, que es Quito — el nombre del
vendedor NO indica la sucursal, probablemente es una bodega. Usa el prefijo.

El `pos` UUID de cada uno: `001-001` = `4ea527a0-2888-4ba2-9494-fbe98841b213`,
`002-001` = `9c6d5bb8-b5fc-4767-82fa-46cc54246871`. El `CONTIFICO_TOKEN` del
`.env` (`e7099ea2…`) es un tercer punto, el de las proformas, y no lo usa ningún
código: solo sirve para emitir y nosotros solo leemos.

## Credenciales

`CONTIFICO_API_KEY` es la **API key de sincronización**, la única que hace falta.
Se pone sin pasarla por el chat:

```bash
# copia la llave al portapapeles y luego:
./poner-llave.sh CONTIFICO_API_KEY
```

Nunca imprime el valor, verifica que parezca una llave y respalda el `.env`
anterior con marca de tiempo.

La key vieja (previa al 26-ago) devolvía el padrón recortado —273 de 2 189
personas— y por eso el primer cruce dio 0 aciertos de 61. Si el cruce vuelve a
dar cero, sospecha de la llave antes que del método.

## Segunda llave: `senales.mjs`

`cruce.mjs` solo cruza por teléfono. `senales.mjs` agrega tres señales más:
nombre, código de producto seleccionado y día de visita prometido.

```bash
node scripts/cruce-facturas/senales.mjs
```

Rendimiento medido el 26-ago sobre 1 205 conversaciones:

- **teléfono** — 8 ventas. Es la llave que sostiene todo.
- **SKU + día de visita** — 3 aciertos, de los cuales 1 nuevo (Francisco Rosero,
  que facturó a nombre de un tercero). Por azar se esperarían 0,76, así que la
  señal es real pero apretada. Solo alcanza al 3 % de las conversaciones.
- **nombre de WhatsApp vs razón social** — 0. Los perfiles son apodos y emojis.
- **medida sin SKU + día** — ruido (1 acierto, 0,32 esperados por azar).

Rutas descartadas por inservibles: `placa` (0 de 3 301 facturas la tienen),
`adicional1`, vendedor asignado, y teléfono con tolerancia de un dígito.

### El SKU no viene legible en las facturas

`codigo_bien` llega **vacío** en todas las líneas. Hay que bajar `/producto/` y
armar el mapa `codigo → id` para poder cruzar; eso hace `senales.mjs` con
`datos/productos.json`.

## Lo que el cruce NO puede ver

De 1 205 personas que escribieron al bot, solo **20 existen en el padrón de
Contífico**. Ese es el techo real del método, no la conversión del bot. Las dos
fugas confirmadas:

1. **La factura sale a nombre de otro.** De 9 ventas, 2 facturaron a nombre
   distinto (uno con el RUC de su empresa, otro a nombre de otra persona).
2. **El comprador no queda registrado** con el celular con que escribió.

Por eso el número que sale de aquí siempre es un **piso**. Estimación por
captura-recaptura al 26-ago: 12 a 18 ventas reales contra 9 verificadas.

Lo que sí queda comprobado es la fidelidad del compromiso: de los 4 que
eligieron una llanta concreta, 3 compraron exactamente esa; de los 7 que
prometieron día, 6 fueron ese día. El bot no pierde gente después del
compromiso, la pierde antes: solo 50 de 1 205 llegan a decir un día.
