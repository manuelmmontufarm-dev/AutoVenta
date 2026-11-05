# Integraciones con sistemas contables

Investigación del 27-oct-2026 a raíz de los dos clientes referidos por Andrés (Depot Tire): uno usa
**Perseo** y el otro **FÉNIX**. La pregunta era si con ellos se puede hacer lo mismo que hoy hace
AutoVenta con Contífico.

## Qué hace AutoVenta con Contífico (lo que hay que replicar)

| Qué | Endpoint Contífico | Cada cuánto | Código |
|---|---|---|---|
| Catálogo: productos con stock y precios pvp1–pvp4 | `GET /producto/` | 5 min (`CONTIFICO_CATALOG_SYNC_INTERVAL_MS`) | `app/src/services/catalog.ts` → `syncContificoCatalog` |
| Facturas con teléfono del cliente → Métricas comprobables / Para cerrar | `GET /documento/` | 10 min | `app/src/services/ventasConfirmadas.ts` |
| Normalización producto → `CatalogItem` (marca, medida, precio por tier) | — | — | `app/src/domain/catalog.ts` → `normalizeContificoProduct` |

Cruce chat ↔ factura: por los últimos 9 dígitos del teléfono (`tel9`). Una «llanta» facturada
se reconoce por la medida en el nombre (regex `LLANTA`) y precio ≥ $25.

Respaldo sin API que ya existe: catálogo desde Google Sheets (`CATALOG_SHEET_ID`). Da precios y
stock a la última exportación, pero **sin facturas no hay Métricas comprobables**.

## Veredicto por sistema

| Sistema | API | Inventario + precios | Facturas con teléfono | Estado |
|---|---|---|---|---|
| Contífico | Sí, REST | ✅ | ✅ | En producción (Depot) |
| [Perseo](PERSEO.md) PC o Web | Sí, REST pública | ✅ | ✅ | **Luz verde**; la activa el personal de Perseo |
| [FENIX ERP](FENIX.md) (navegador, Odoo 17) | Sí, la estándar de Odoo | ✅ | ✅ | Luz verde si el cliente tiene esta versión |
| [FENIX Comercial Contable](FENIX.md) (Windows) | **No pública** | ? | ? | **Bloqueado** hasta que conteste Fenixcorp |

Orden recomendado: instalar primero al cliente de Perseo; mientras tanto conseguir el acceso de
FÉNIX. Andrés pidió ~8 días entre un cliente y otro.

## Preguntas abiertas (28-oct-2026)

- A Andrés (enviadas 27-oct): qué versión usa cada cliente (Perseo PC/Web; FENIX Comercial
  Contable/ERP).
- A Fenixcorp (+593 98 465 8116, enviado 27-oct): si Comercial Contable tiene API de productos,
  precios y facturas, costo y tiempo.
- A Perseo: costo y tiempo de activar la API para el cliente.
- Cuántas marcas maneja cada cliente (uno es multimarca, ~10 marcas). El bot de Depot está armado
  para Falken y Kenda; con muchas marcas revisar `brandProfiles.ts` antes de prometer fechas.

## Cómo encaja en el código: un «proveedor de catálogo» por sistema

Hoy `syncCatalog()` elige entre Contífico y Sheets con `if (config.contifico) … else if (config.catalog)`.
Para Perseo y FÉNIX la forma limpia es la misma: un módulo por sistema que devuelva `CatalogItem[]`
y otro que devuelva `FacturaContifico[]` (renombrar a `FacturaVenta` cuando haya dos fuentes), y que
`config.ts` elija por variables de entorno (`PERSEO_API_KEY`, `FENIX_…`). Lo demás (cruce, métricas,
PDF, cotizador) no cambia.

Estimaciones mías, sin cotizar con nadie:

| Conector | Tiempo | Por qué |
|---|---|---|
| Perseo | 2–3 días | Calco de Contífico; dos consultas y una normalización |
| FENIX ERP (Odoo) | 3–4 días | API genérica de Odoo (XML-RPC/JSON-RPC), hay que mapear modelos |
| FENIX Comercial Contable con API de Fenixcorp | desconocido | Depende de lo que entreguen |
| FENIX Comercial Contable con conector propio a su base | ~1 semana la primera vez, ~1 día por cliente | Programa en la PC del cliente que lee su base y nos la manda; se rompe si Fenix cambia tablas |

## Archivos

- [PERSEO.md](PERSEO.md): endpoints, campos, condiciones y pasos de instalación.
- [FENIX.md](FENIX.md): los dos productos, qué se comprobó, precios, pasos.
- `fenix-erp-swagger.json`: la documentación de API que publica Fenixcorp (solo bodega), bajada el 27-oct-2026.
- Colección Postman de Perseo: https://documenter.getpostman.com/view/11467225/U16dQoKs (2,3 MB; no se guardó en el repo).
