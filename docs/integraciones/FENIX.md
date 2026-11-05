# FÉNIX: integración por API

Investigado el 27-oct-2026. Fenixcorp / ADS Software (Latacunga + Quito; +2.500 clientes). Sitio:
https://fenixcorp.fenixerp.com. Distribuidor con precios públicos: CIADE, https://fenixcontable.net.

**Veredicto: depende de cuál de los dos productos tenga el cliente.** Ni Fenixcorp ni CIADE separan
bien los nombres, así que hay que confirmarlo con el cliente.

## Los dos productos

| | FENIX Comercial Contable | FENIX ERP |
|---|---|---|
| Qué es | El sistema típico de PYMES | ERP en la nube, construido sobre **Odoo 17** |
| Cómo se ve | Programa de **Windows** (en su PC o en la nube de Fenix por escritorio remoto; CIADE dice «Windows, Web») | Página en el **navegador**, dirección `*.fenixerp.com`, estilo Odoo |
| App móvil | Zeus Mobile «se sincroniza con FENIX Comercial Contable»: lee stock en tiempo real, lista de precios y clientes; escribe pedidos y cobros | — |
| API pública | **No.** Ninguna página la menciona | Sí: la estándar de Odoo + un swagger propio (solo bodega) |
| Para AutoVenta | **Bloqueado** hasta que Fenixcorp dé acceso, o conector propio | Luz verde |

Cómo distinguirlos con el cliente: preguntar «Comercial Contable (programa de Windows) o FENIX ERP
(se abre en el navegador)» y, si hay duda, pedir una captura con el sistema abierto.

## Lo comprobado el 27-oct-2026

- `https://fenixcorp.fenixerp.com/api/documentation` → Swagger «FenixERP Integration Documentation
  v1.0.0», descripción textual: *«Integration API with Odoo for inventory, picking, products and
  locations management»*, contacto Sodicorp. Copia en `fenix-erp-swagger.json`.
  Endpoints: `GET /login` (JWT Bearer), `stock_location`, `stock_picking` (+ `assign`/`confirm`/
  `validate`), `product_template/{id}` (detalle con stock por `locationId`), `physical_inventory`
  (`scan`/`setscan`/`unscan`). **No hay lista de productos con precios ni facturas**: es para bodega.
- `POST https://fenixcorp.fenixerp.com/jsonrpc` (`common.version`) y `/xmlrpc/2/common` responden
  `server_version: 17.0`. O sea, la API estándar de Odoo está expuesta; con usuario + API key de Odoo
  se leen `product.product` / `product.template` (precios, `qty_available`), `product.pricelist`,
  `account.move` (facturas, con `partner_id.phone`/`mobile`) y `stock.quant`.
- Página de e-commerce de Fenix: «API de integración con el software contable o ERP de tu preferencia»,
  sin decir cuál producto ni cómo.
- Comercial Contable: importa compras y ventas desde Excel/XML; stock por bodega/sucursal; lista de
  precios en la ficha del cliente. Nada de API, web service, ODBC ni SQL en su documentación.

## Si es FENIX ERP (Odoo): pasos

1. Pedir a Fenixcorp un usuario de solo lectura y su **API key de Odoo** (Preferencias → Seguridad
   de la cuenta → Nueva API key), más el nombre de la base de datos.
2. Conector `fenixOdoo.ts` con JSON-RPC: `common.authenticate` → `object.execute_kw` sobre
   `product.product` (`search_read` con `qty_available`, `list_price`, `name`, `default_code`,
   `product_brand` si existe) y `account.move` (`move_type = out_invoice`, `invoice_date`,
   `partner_id`, `invoice_line_ids`).
3. Confirmar qué lista de precios es la del público (`product.pricelist`).
4. Estimado 3–4 días.

## Si es FENIX Comercial Contable: tres caminos

1. **Pedírselo a Fenixcorp (preferido).** Zeus Mobile ya lee stock, precios y clientes y escribe
   pedidos, así que el servicio interno existe. Mensaje enviado el 27-oct-2026 al +593 98 465 8116
   (atención nacional); alternativa comercial CIADE +593 98 801 5382, comercialciade@fenixcorp.net,
   Víctor Hugo victorhugo@adsecuador.com / +593 99 854 7841. Precio y tiempo: desconocidos.
2. **Conector propio a su base.** Programa chico en la PC del cliente que lee la base de FÉNIX
   (motor no confirmado) y manda stock, precios y facturas a AutoVenta cada 5–10 min. Igual de bueno
   que Contífico mientras la PC esté prendida. Riesgo: una actualización de Fenix que cambie tablas lo
   rompe. ~1 semana la primera vez, ~1 día por cliente siguiente. Requiere permiso del cliente.
3. **Plan B sin integración.** Exportar inventario a Excel → Google Sheets (`CATALOG_SHEET_ID`,
   ya funciona). Stock al día solo hasta la última exportación y **sin facturas**: no hay Métricas
   comprobables ni estadísticas. No es «igual que Depot».

## Precios de FÉNIX (CIADE, sin IVA, vistos 27-oct-2026)

| Módulo | Mensual | Anual |
|---|---|---|
| FENIX Comercial Contable | desde $89 | $854,40 |
| Zeus Mobile | $20 | $192 |
| Terminal Punto de Venta | $67 (anual $57/mes) | $547,20 |
| Producción | $59 (anual $47/mes) | $451,20 |
| Nómina | $30–37 | $355,22 |
| API / integración | no publicado | — |

Modalidades: on-premise (licencia «indefinida»), nube de Fenix, acceso web; sin precios publicados.
Otras fuentes dicen «bajo cotización».

## Ojo con los homónimos

«Fenix Empresarial» de Apolo Ingeniería (Colombia) y «Fenix ERP» de TecnoService (España, SQL Server)
son otros productos. No confundir al buscar documentación.
