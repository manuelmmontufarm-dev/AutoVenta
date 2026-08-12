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
