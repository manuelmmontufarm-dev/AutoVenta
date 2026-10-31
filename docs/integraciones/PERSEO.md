# Perseo: integración por API

Investigado el 27-oct-2026. Fuente: colección Postman oficial «API 1 Perseo Software»
(https://documenter.getpostman.com/view/11467225/U16dQoKs) y sitios perseo.ec / megaconta.net.

**Veredicto: luz verde.** La API cubre todo lo que AutoVenta usa de Contífico: productos con stock y
listas de precios, y facturas con teléfono del cliente y detalle por línea.

## Versiones

| | Perseo PC | Perseo Web |
|---|---|---|
| Dónde corre | Instalado en una PC/servidor del cliente | Nube de Perseo |
| URL de la API | `https://ip_publica_servidor:puerto/api/<procedimiento>` | `https://url_servidor/api/<procedimiento>` (ej. `https://perseo-data-c1.app/api/…`) |
| Requisito de red | Su técnico abre un puerto a internet; la PC debe estar prendida para que el sync traiga datos nuevos | Ninguno |
| Dónde se genera la clave | Administración → Administrador de Integraciones → Nuevo → API Key → Generar | Administración → Integraciones → Nuevo → API Key → Generar |

Si la PC está apagada, el bot sigue con el último catálogo bueno (`syncCatalog` no lo borra) y las
facturas se ponen al día cuando vuelve a prender (pedimos «últimos N días»). Pendiente: guardar una
copia del último catálogo en disco/DB para sobrevivir un reinicio nuestro con su PC apagada.

Comprobado el 27-oct: `https://perseo-data-c1.app/api/productos_consulta` responde (con clave falsa
devuelve un `fault` de MariaDB, o sea el servidor está vivo).

## Autenticación

Todo es `POST` con JSON y la clave va **dentro del cuerpo**, no en un header:

```json
{ "api_key": "…", "dias": 3 }
```

Los errores vienen como `{ "fault": { "faultcode": "client|servidor", "faultstring": "…", "detail": "…" } }`.
Regla de las consultas: **enviar solo un parámetro de búsqueda**; con dos devuelve
`"Se ha enviado mas de un parámetro."`.

## Endpoints que usaríamos

### `productos_consulta` → catálogo (reemplaza `GET /producto/`)

Devuelve **solo** productos con estado activo **y** ecommerce «Visible». Sin parámetro de búsqueda
devuelve todos. Parámetros opcionales: `mostrarubicaciones: true` (existencias por ubicación),
filtros `lineasid`, `categoriasid`, `subcategoriasid`, `subgruposid` (ids separados por `;`, OR).

Campos útiles de cada producto:

| Campo | Para qué |
|---|---|
| `productosid`, `productocodigo`, `barras` | id / código |
| `descripcion`, `descripcioncorta` | nombre → de aquí salen marca y medida (no hay campo marca) |
| `existenciastotales` | stock total |
| `porcentajeiva` | IVA |
| `estado`, `venta`, `servicio` | filtrar: activo, vendible, no servicio |
| `tarifas[]` → `tarifasid`, `tarifadescripcion` («Precio 1», «Precio 2»…), `precio`, `precioiva` | equivalen a pvp1–pvp4; `precio` es sin IVA |
| `costoactual` | margen (no lo da Contífico) |
| `productos_lineasid`, `productos_categoriasid` | posible marca por línea/categoría |
| `imagenes[]` (vía `productos_imagenes_consulta`) | base64, no hace falta |

Equivalencia con `CONTIFICO_CUSTOMER_PVP`: elegir qué `tarifasid` es el precio cliente.

### `existencia_producto` → stock por almacén

`{ "api_key", "productosid": 3 }` o sin id para todos. Devuelve
`[{ productosid, almacenesid, existencias }]`. Nombres de almacén en `almacenes_consulta`.

### `facturas_consulta` → ventas (reemplaza `GET /documento/`)

Filtros excluyentes: `facturaid` **o** `dias` (días hacia atrás). Opcionales: `generarpdf`, `control`.
Devuelve facturas, notas de crédito y notas de venta.

| Campo | Para qué |
|---|---|
| `facturasid`, `establecimiento`, `puntoemision`, `secuencial` | número de documento |
| `sri_documentoscodigo` | `01` factura, `04` nota de crédito → descontar devoluciones |
| `emision` (`YYYYMMDD`), `fechacreacion` (ISO con hora) | día y hora de la venta |
| `concepto` | «DOCUMENTO ANULADO» cuando está anulada (total 0) |
| `subtotal`, `total_iva`, `total`, `total_descuento` | montos |
| `almacenesid`, `vendedoresid`, `facturadoresid` | local y vendedor |
| `clientesid`, `razonsocial`, `identificacion`, `telefono1`, `email`, `direccion` | cliente; **`telefono1` es el cruce con el chat** |
| `numeroautorizacion`, `autorizacionfecha`, `de_enviado`, `mensajeerror` | estado SRI |
| `facturasd.detalles[]` → `productosid`, `cantidad`, `precio`, `precioiva`, `descuento`, `costo`, `almacenesid` | líneas; **no trae nombre del producto**, hay que resolverlo contra el catálogo por `productosid` |

Consecuencia: para reconocer «llanta vendida» y su medida necesitamos el producto en el catálogo,
y el catálogo solo trae los «Visible». **Hay que marcar Visible todas las llantas, incluidas las sin
stock**, o las ventas de esas quedan sin medida.

No documenta paginación ni límite de `dias`. Para el día a día basta `dias: 2–3` cada 10 min. Para el
histórico (estadísticas desde el día uno) probar con la clave real si aguanta 365 días o pedir por tramos.

### Consultas auxiliares

`tarifas_consulta` (nombres de las listas de precio), `almacenes_consulta`, `clientes_consulta`
(por `clienteid` / `clientescodigo` / `identificacion` / `contenido`, uno solo),
`facturadores_consulta` (vendedores).

## Lo que NO necesitamos pero existe

Crear facturas (`facturas_crear`), clientes, proformas, pedidos, cobros, inventario (ingresos,
salidas, transferencias, tomas físicas), guías de remisión, promociones, contabilidad. Útil a futuro
para «el bot deja la proforma hecha en Perseo» (`proformas_crear`).

## Pasos para instalar a un cliente con Perseo

1. **Preguntar PC o Web** y, si es PC, pedir a su técnico IP pública + puerto abierto (HTTPS).
2. **Perseo activa la API** («solo lo realiza el personal del sistema contable»). Preguntar costo
   y tiempo; no está publicado.
3. El cliente genera la **API Key** (ruta arriba) y nos la pasa por un canal seguro. Va a Railway
   como variable, nunca al Hub.
4. El cliente marca **Visible** todas las llantas y confirma qué **tarifa** es el precio al público.
5. Nosotros: conector `perseo.ts` (catálogo + facturas), normalización a `CatalogItem`
   (marca y medida desde `descripcion`), mapear `tarifasid` → tier. Estimado 2–3 días.
6. Probar con la clave real: volumen de `productos_consulta` sin filtro, `facturas_consulta` con
   `dias` grande, y que `telefono1` venga cargado en las facturas (disciplina del local).
7. Cargar el histórico de facturas para las estadísticas.

## Precios de Perseo (MegaConta, actualizados 8-oct-2026, + IVA)

| Versión | Plan | Mensual | Anual / licencia única |
|---|---|---|---|
| Web | Facturación | $27,80 | $278/año |
| Web | Servicios | $36,60 | $366/año |
| Web | Comercial (tienda online enlazada) | $46,70 | $480/año |
| PC | Facturación (2 licencias) | $36,70 | $777,80 licencia |
| PC | Control (3, multibodega) | $70,00 | $1.555,60 licencia |
| PC | Comercial (4, nómina + contabilidad) | $92,20 | $2.500 licencia |
| — | Aplicativo móvil | $13,30 | $133/año |
| — | Activar API | no publicado | — |

El sistema ya lo paga el cliente; lo único que podría costar de más es la activación de la API.
