# AutoVenta — Plan del cotizador con inventario real

> Objetivo: recrear la funcionalidad útil de Interbot con código propio, usando
> Contífico como fuente de verdad y compartiendo una sola lógica entre el Hub,
> el bot de WhatsApp y la generación de cotizaciones.
>
> Estado inicial: plan aprobado para implementación por fases. Ninguna fase se
> considera terminada hasta pasar su gate de verificación.

## Estado del demo — 2026-07-20

El MVP funcional ya está integrado en el demo oficial:

- [x] Inventario, precio y stock real de Contífico.
- [x] Búsqueda por medida, código, marca y diseño.
- [x] Filtros independientes por marca y disponibilidad; toda salida de
  “opciones” refleja exactamente las tarjetas visibles.
- [x] Mensajes separados para distribuidor y cliente final, más imagen de todas
  las opciones filtradas agrupadas por marca.
- [x] Comparación manual de 2–3 alternativas con mensaje, imagen y PDF, sin
  cantidad ni total conjunto.
- [x] Cotización final de un solo modelo con cantidad, total, mensaje, imagen y PDF.
- [x] Nueve fotos limpias relacionadas por marca + diseño, guardadas localmente
  con registro de procedencia y fallback consistente.
- [x] Índice de carga/velocidad, garantías, precio lista, precio hoy y descuento.
- [x] Misma búsqueda y generación de PDF disponibles para el bot.
- [x] Cache de último catálogo válido y Google Sheets como fallback.
- [x] 28 tests, typecheck, builds, smoke test del demo y revisión visual de los
  PDF renderizados.
- [ ] Catálogo completo de fotos reales relacionado por producto.
- [ ] Confirmación final del dueño sobre PVP/divisores comerciales.
- [ ] Prueba conversacional end-to-end desde el número productivo de WhatsApp.
- [ ] Stock separado por bodega si el negocio decide mostrarlo.

## 1. Resultado esperado

AutoVenta tendrá un nuevo tab **Cotizador** dentro del Hub que permitirá:

- Buscar llantas por medida, código, marca o diseño.
- Consultar precios y stock reales de Contífico.
- Filtrar por marca, disponibilidad y precio.
- Activar o desactivar cada marca y estado desde la columna izquierda.
- Copiar mensajes de distribuidor y cliente final usando todas las opciones que
  siguen visibles después de aplicar esos filtros.
- Guardar una imagen de opciones para WhatsApp, agrupada por marca.
- Seleccionar aparte 2–3 productos para compararlos por unidad, sin tratarlos
  como una compra conjunta.
- Elegir después un solo producto y su cantidad para generar la cotización final.
- Generar mensajes, imágenes y PDF específicos para comparación y cotización.
- Mostrar una foto real cuando exista y un placeholder consistente cuando no.
- Usar exactamente el mismo catálogo y las mismas reglas desde el bot.
- Detectar una medida enviada por WhatsApp, buscar automáticamente y responder
  con opciones reales sin inventar precios ni disponibilidad.
- Generar y enviar el PDF automáticamente cuando el producto y la cantidad
  estén suficientemente confirmados.

No se copiará el código ni la base privada de Interbot. Se recreará su flujo
funcional con Contífico y servicios propios de AutoVenta.

### 1.1 Contrato de los tres flujos

| Flujo | Selección | Cantidad/total | Salidas |
|---|---|---|---|
| Opciones filtradas | Todas las tarjetas visibles según filtros izquierdos | No | Mensaje distribuidor, mensaje cliente final, imagen WhatsApp |
| Comparación | 2–3 modelos elegidos manualmente | No | Mensaje comparativo, imagen comparativa, PDF comparativo |
| Cotización final | 1 modelo decidido | Sí, 1–8 unidades | Mensaje de cotización, imagen de cotización, PDF de cotización |

Los tres estados son independientes: cambiar filtros modifica las opciones
filtradas, no la comparación; comparar nunca suma alternativas; cotizar nunca
acepta varios modelos.

## 2. Principios de arquitectura

### 2.1 Una sola lógica de negocio

El Hub y el bot no deben implementar búsquedas o precios por separado:

```text
Contífico
   ↓
ContificoCatalogSource
   ↓
Catálogo normalizado y cacheado
   ↓
CatalogSearchService
   ├── API del Hub
   ├── tools del bot
   ├── mensajes de cotización
   ├── PDF
   └── imagen para WhatsApp
```

### 2.2 El modelo decide intención; el código decide datos

El modelo puede interpretar el mensaje del cliente y elegir una herramienta,
pero nunca debe:

- Inventar productos, precios, stock, garantías o fotos.
- Calcular precios comerciales por su cuenta.
- Elegir arbitrariamente entre `pvp1`, `pvp2`, `pvp3` y `pvp4`.
- Ofrecer como compatible una medida alternativa sin una regla validada.

La búsqueda, selección de precio, disponibilidad, totales e IVA deben ser
deterministas y testeables.

### 2.3 Contífico es la fuente de verdad

- Productos, códigos, marca, precios y stock vienen de Contífico.
- Las fotos y garantías viven en una capa de enriquecimiento local.
- El catálogo se cachea para no consultar Contífico en cada mensaje.
- Una caída temporal de Contífico no debe borrar el último catálogo válido.
- Las credenciales solo viven en variables de entorno, nunca en Git.

## 3. Decisiones que deben quedar configurables

Antes del pase a producción se deben confirmar estos valores con el dueño:

- Qué PVP corresponde al cliente final.
- Qué PVP corresponde a distribuidor, si esa vista entra en alcance.
- Si los valores de Contífico incluyen o no IVA.
- Qué bodegas se consideran vendibles.
- Si el stock se suma entre bodegas o se muestra separado.
- Umbral de disponibilidad:
  - `disponible`: cantidad suficiente para cotizar.
  - `consultar`: cantidad positiva pero insuficiente o en bodega no principal.
  - `agotada`: cantidad igual o menor a cero.
- Cantidad predeterminada al cotizar: una, dos o cuatro llantas.
- Cuándo el bot debe producir el PDF:
  - solo después de confirmar producto y cantidad; recomendado;
  - automáticamente si existe una sola opción inequívoca.

Estas decisiones deberán vivir en configuración y no dispersas en componentes.

## 4. Modelo de datos objetivo

El catálogo normalizado debe exponer, como mínimo:

```ts
interface TireCatalogItem {
  id: string;
  contificoId: string;
  code: string;
  name: string;
  brand: string;
  design: string;
  rawSize: string;
  size: TireSize | FlotationTireSize | null;
  sizeLabel: string | null;
  prices: {
    pvp1: number | null;
    pvp2: number | null;
    pvp3: number | null;
    pvp4: number | null;
    customer: number;
  };
  taxRate: number;
  stockTotal: number;
  stockByWarehouse: Array<{
    warehouseId: string;
    warehouseName: string;
    quantity: number;
  }>;
  availability: "available" | "check" | "out";
  imageUrl: string | null;
  imageSource: string | null;
  warrantyFactory: string | null;
  warrantyRoadHazard: string | null;
  active: boolean;
  updatedAt: string;
}
```

La persistencia de fotos debe ser independiente:

```text
product_media
  id
  contifico_product_id nullable
  brand
  design
  source_url
  storage_url
  source_type
  rights_status
  verified_at
  updated_at
```

El match de foto debe seguir este orden:

1. `contifico_product_id`
2. código exacto
3. marca + diseño normalizados
4. placeholder por marca
5. placeholder genérico

## 5. Fases de implementación

---

## Fase 0 — Baseline, seguridad y contrato de datos

**Duración estimada:** 0,5–1 día.

### Trabajo

- [ ] Crear una rama de implementación con prefijo `codex/`.
- [ ] Registrar el estado inicial de tests, typecheck y builds.
- [ ] Documentar las variables nuevas sin escribir sus valores:
  - `CONTIFICO_API_KEY`
  - `CONTIFICO_BASE_URL`
  - `CONTIFICO_CATALOG_SYNC_INTERVAL_MS`
  - selección del PVP
  - lista de bodegas vendibles
- [ ] Confirmar que `.env`, logs, fixtures y respuestas de error no filtren
  credenciales.
- [ ] Crear fixtures sanitizados de respuestas de producto, bodega y stock.
- [ ] Congelar el contrato mínimo de Contífico que usará AutoVenta.
- [ ] Definir la política de precios y disponibilidad como configuración.
- [ ] Registrar un baseline de cantidad de productos activos sin almacenar el
  catálogo real dentro del repositorio.

### Gate 0

No avanzar hasta que:

- [ ] `npm test` pase en `app/`.
- [ ] `npm run typecheck` pase en `app/`.
- [ ] `npm run build` pase en `hub/`.
- [ ] `git grep` confirme que no hay API keys ni tokens reales.
- [ ] Los fixtures contienen datos ficticios o anonimizados.
- [ ] La política de PVP y bodegas esté explícita, aunque inicialmente use un
  valor temporal marcado como pendiente.

---

## Fase 1 — Adaptador de catálogo Contífico

**Duración estimada:** 1–2 días.

### Trabajo

- [ ] Crear `ContificoCatalogSource`.
- [ ] Autenticar con el header `Authorization` usando la API Key cruda.
- [ ] Implementar paginación de `/producto/`.
- [ ] Filtrar productos activos y de tipo producto.
- [ ] Parsear defensivamente números que puedan llegar como string.
- [ ] Mapear `pvp1`–`pvp4`, IVA, código, marca, nombre e imagen.
- [ ] Consultar bodegas una vez y mantener el mapa de IDs.
- [ ] Consultar stock detallado por producto cuando sea necesario.
- [ ] Evitar una explosión de requests:
  - carga inicial paginada;
  - stock total desde el listado;
  - stock por bodega bajo demanda o sincronización limitada;
  - concurrencia acotada;
  - timeout y retry solo para lecturas idempotentes.
- [ ] Mantener el último catálogo válido si falla una sincronización.
- [ ] Exponer estado de sincronización:
  - última sincronización exitosa;
  - número de productos;
  - errores parciales;
  - duración;
  - catálogo desactualizado.
- [ ] Sustituir Google Sheets mediante una interfaz de fuente de catálogo, sin
  romper la posibilidad de usar fixtures en tests.

### Pruebas

- [ ] Paginación con una, dos y varias páginas.
- [ ] Respuestas como array o envelope.
- [ ] Precios y cantidades como string o número.
- [ ] Producto sin marca, sin precio, sin medida o sin imagen.
- [ ] Timeout, `401`, `429` y `500`.
- [ ] Una sincronización fallida conserva el catálogo anterior.
- [ ] No aparecen secretos en errores ni logs.

### Gate 1

No avanzar hasta que:

- [ ] Tests unitarios del adaptador pasen con fixtures.
- [ ] Una prueba real de solo lectura devuelva productos.
- [ ] El conteo real sea razonable y se documenten los descartes.
- [ ] El catálogo pueda arrancar desde caché si Contífico está temporalmente
  inaccesible.
- [ ] El endpoint `/health` reporte el estado del catálogo sin datos sensibles.

---

## Fase 2 — Normalización y búsqueda estilo Interbot

**Duración estimada:** 1–2 días.

### Trabajo

- [ ] Extraer medida, marca y diseño del nombre del producto.
- [ ] Ampliar el parser para medidas métricas y medidas de flotación:
  - `205/55R16`
  - `205 55 16`
  - `LT265/70R17`
  - `31X10.50R15`
- [ ] Normalizar mayúsculas, tildes, espacios, guiones y variantes como
  `R16`, `R 16` y `ZR16`.
- [ ] Crear un índice en memoria por:
  - medida exacta;
  - código;
  - marca;
  - diseño/referencia;
  - tokens del nombre.
- [ ] Implementar ranking:
  1. código exacto;
  2. medida exacta + marca;
  3. medida exacta;
  4. diseño exacto;
  5. coincidencia parcial.
- [ ] Ordenar resultados por disponibilidad, política comercial, marca y
  precio.
- [ ] Aplicar disponibilidad desde la configuración de bodegas.
- [ ] Separar resultados agotados, pero permitir mostrarlos como informativos.
- [ ] No sugerir medidas alternativas como compatibles sin validación. Las
  alternativas se etiquetan como “consultar con asesor”.
- [ ] Crear mensajes de error útiles para medida incompleta o ambigua.

### Pruebas

- [ ] Búsquedas por medida en al menos diez formatos.
- [ ] Búsqueda por marca + medida.
- [ ] Búsqueda por código y por referencia.
- [ ] Variantes de mayúsculas, tildes y espacios.
- [ ] Medida inexistente.
- [ ] Producto agotado y producto disponible.
- [ ] Ranking estable y reproducible.
- [ ] Ningún resultado cambia de precio por intervención del modelo.

### Gate 2

No avanzar hasta que un conjunto congelado de consultas produzca resultados
esperados:

- [ ] `205/55R16`
- [ ] `205/55 R16 Falken`
- [ ] una referencia como `KR203`
- [ ] una medida de flotación
- [ ] una medida sin stock
- [ ] texto sin ninguna medida ni referencia

El gate exige tests del parser, del ranking y de la política de disponibilidad.

---

## Fase 3 — Tab Cotizador con inventario real y placeholders

**Duración estimada:** 2–4 días acumulados desde el inicio.

### Trabajo backend

- [ ] Crear endpoints de solo lectura para:
  - buscar productos;
  - obtener filtros disponibles;
  - consultar estado de sincronización;
  - obtener un producto por ID.
- [ ] Protegerlos con el mismo mecanismo de administración del Hub.
- [ ] Limitar tamaño de resultados y validar todos los parámetros.

### Trabajo frontend

- [ ] Agregar la ruta y navegación `Cotizador`.
- [ ] Crear pantalla responsive con:
  - buscador;
  - chips de medidas frecuentes;
  - resumen de resultados;
  - filtros por marca y disponibilidad;
  - orden por precio;
  - tarjetas de producto;
  - estado de carga, vacío, error y catálogo desactualizado.
- [ ] Mostrar:
  - marca;
  - diseño;
  - medida;
  - precio configurado;
  - disponibilidad;
  - stock exacto solo para roles autorizados;
  - foto o placeholder.
- [ ] Mantener los filtros en el cliente sobre la última búsqueda, como
  Interbot.
- [ ] No mostrar costo ni niveles de precio privados a usuarios no autorizados.
- [ ] Mantener intactas Inbox, Pipeline y Métricas.

### Gate 3

- [ ] Build de Hub y typecheck sin errores.
- [ ] Pruebas de API con parámetros válidos e inválidos.
- [ ] Verificación visual desktop y móvil.
- [ ] Búsqueda real contra Contífico desde el tab.
- [ ] Ninguna imagen rota: siempre debe aparecer foto o placeholder.
- [ ] Un usuario sin permiso no puede ver stock exacto ni otros PVP.
- [ ] Las otras pantallas del Hub no presentan regresiones.

**Entregable de demo 1:** catálogo real navegable y buscable.

---

## Fase 4 — Selección, comparación y formatos de mensaje

**Duración estimada:** 1 día adicional.

### Trabajo

- [ ] Permitir seleccionar máximo tres productos.
- [ ] Mostrar comparación consistente de:
  - marca;
  - diseño;
  - medida;
  - precio;
  - disponibilidad;
  - garantía;
  - foto.
- [ ] Crear un servicio compartido de plantillas, no texto pegado en React.
- [ ] Plantilla cliente final:
  - opciones;
  - precio con IVA;
  - disponibilidad;
  - garantía;
  - vigencia;
  - llamada a la acción.
- [ ] Plantilla distribuidor, solo si el rol y el PVP están definidos.
- [ ] Botones para copiar y confirmación visual de copiado.
- [ ] Sanitizar texto para que ningún campo del catálogo inserte HTML.
- [ ] Registrar el evento de comparar/copiar sin registrar secretos.

### Gate 4

- [ ] No es posible seleccionar más de tres productos.
- [ ] Los totales y precios del mensaje coinciden con el catálogo.
- [ ] Los mensajes no contienen `undefined`, valores vacíos ni HTML.
- [ ] Snapshot tests de mensajes para uno, dos y tres productos.
- [ ] Comparación usable en móvil y desktop.

---

## Fase 5 — PDF e imagen para WhatsApp

**Duración estimada:** 1–2 días adicionales.

### PDF

- [ ] Extender el generador actual, no crear un segundo motor.
- [ ] Incluir logo, cliente, vigencia, productos, cantidades, precios, IVA,
  total, disponibilidad y locales.
- [ ] Incluir fotos si están disponibles; usar placeholder si no.
- [ ] Evitar que una foto caída impida generar el documento.
- [ ] Persistir la cotización y sus líneas con precios congelados.
- [ ] No recalcular una cotización histórica con precios nuevos.

### Imagen para WhatsApp

- [ ] Crear una composición vertical legible en móvil.
- [ ] Soportar de uno a tres productos.
- [ ] Exportar PNG/JPG sin depender de imágenes externas con CORS inestable.
- [ ] Usar las imágenes guardadas en almacenamiento propio.
- [ ] Incluir una nota breve de vigencia y disponibilidad.

### Gate 5

- [ ] Tests de cálculo de subtotal, IVA y total.
- [ ] PDF renderizado y revisado visualmente.
- [ ] PDF de varias páginas cuando sea necesario.
- [ ] Imagen revisada en dimensiones de WhatsApp.
- [ ] Productos sin foto generan ambos formatos correctamente.
- [ ] Los precios del PDF, imagen, mensaje y pantalla son idénticos.
- [ ] La cotización queda registrada en Postgres.

**Entregable de demo 2:** cotizador completo para operación manual.

---

## Fase 6 — Bot con cotización automática

**Duración estimada:** 1–2 días adicionales.

### Flujo objetivo

1. El cliente envía una medida, código, marca o diseño.
2. El bot llama siempre a la búsqueda determinista.
3. Si hay varias opciones, devuelve hasta tres opciones útiles.
4. Si falta cantidad, pregunta cuántas necesita.
5. Si hay una opción inequívoca y una cantidad confirmada, genera el PDF.
6. Envía el PDF y un resumen corto.
7. Si no hay stock, ofrece resultados informativos y deriva al asesor.
8. Si el cliente confirma compra, notifica al vendedor.

### Trabajo

- [ ] Cambiar la tool `buscar_llanta` para usar `CatalogSearchService`.
- [ ] Permitir buscar también por texto/referencia, no solo por números
  separados.
- [ ] Hacer que la tool devuelva IDs estables para cotizar.
- [ ] Actualizar `generar_cotizacion` para usar el producto normalizado.
- [ ] Congelar precio y stock al crear la cotización.
- [ ] Agregar modo configurable:
  - `confirm`: PDF solo con producto y cantidad confirmados;
  - `single_match`: PDF automático cuando solo existe una opción inequívoca.
- [ ] Incluir en el prompt reglas claras para no generar PDFs prematuros.
- [ ] Reutilizar las mismas plantillas de mensaje del Hub.
- [ ] Manejar catálogo caído o desactualizado sin inventar una respuesta.
- [ ] Registrar eventos de búsqueda, cotización y derivación.

### Pruebas de conversación

- [ ] “Necesito 205/55R16”.
- [ ] “Dame cuatro KR203”.
- [ ] “Quiero Falken 265/70R17”.
- [ ] “Necesito dos de la segunda opción”.
- [ ] Medida existente sin stock.
- [ ] Medida ambigua.
- [ ] Cliente cambia de medida a mitad de la conversación.
- [ ] Precio cambia después de mostrar opciones pero antes de confirmar.
- [ ] Contífico o el catálogo no está disponible.
- [ ] El modelo intenta usar un código inexistente.

### Gate 6

- [ ] Tests end-to-end con WhatsApp simulado.
- [ ] El bot nunca menciona un precio fuera del resultado de catálogo.
- [ ] El bot nunca cotiza un código inexistente.
- [ ] El PDF solo se genera según el modo configurado.
- [ ] El mensaje y PDF coinciden exactamente.
- [ ] Las conversaciones existentes y el handoff humano no presentan
  regresiones.

**Entregable de demo 3:** búsqueda y cotización automática por WhatsApp.

---

## Fase 7 — Catálogo completo de fotos

**Duración estimada:** 2–5 días según material.

### Trabajo

- [ ] Crear inventario de combinaciones únicas marca + diseño.
- [ ] Generar reporte de cobertura:
  - productos totales;
  - productos con foto;
  - diseños únicos sin foto;
  - coincidencias dudosas.
- [ ] Recibir fotos autorizadas del cliente o usar catálogos oficiales con
  permiso de uso.
- [ ] No copiar ni hotlinkear masivamente imágenes privadas de Interbot.
- [ ] Descargar y almacenar versiones propias optimizadas.
- [ ] Generar thumbnail y versión para PDF/WhatsApp.
- [ ] Relacionar por producto, código o marca + diseño.
- [ ] Añadir interfaz administrativa mínima para corregir matches dudosos, si
  el volumen lo justifica.
- [ ] Mantener placeholders permanentes como fallback.

### Gate 7

- [ ] Cobertura medida y documentada.
- [ ] Cero URLs rotas en una verificación automática.
- [ ] Cero matches de baja confianza publicados sin revisión.
- [ ] Las imágenes tienen fuente y estado de derechos registrado.
- [ ] PDF e imagen funcionan con fotos reales y placeholders.
- [ ] El tiempo de carga del tab continúa siendo aceptable.

**Entregable final:** catálogo enriquecido y estable.

---

## Fase 8 — Estabilización y despliegue

**Duración estimada:** 0,5–1 día.

### Trabajo

- [ ] Ejecutar suite completa.
- [ ] Revisar logs y manejo de datos sensibles.
- [ ] Verificar límites y timeout de Contífico.
- [ ] Confirmar caché y comportamiento con Contífico caído.
- [ ] Verificar desktop, móvil, PDF y WhatsApp.
- [ ] Ejecutar migraciones idempotentes.
- [ ] Configurar variables privadas en Railway.
- [ ] Desplegar y ejecutar smoke test de solo lectura.
- [ ] Habilitar cotización automática primero en modo `confirm`.
- [ ] Documentar rollback y operación.

### Gate 8

- [ ] Healthcheck saludable.
- [ ] Sin errores nuevos en logs.
- [ ] Búsqueda real exitosa.
- [ ] PDF real generado y enviado a un número de prueba autorizado.
- [ ] Handoff a vendedor confirmado.
- [ ] Rollback documentado y probado.
- [ ] Credenciales rotadas si fueron compartidas durante desarrollo.

## 6. Estimación consolidada

| Entregable | Estimación |
|---|---:|
| Adaptador, normalización y búsqueda | 2–3 días |
| Tab funcional con inventario y placeholders | 2–4 días acumulados |
| Comparación, mensajes, PDF e imagen | 2–3 días adicionales |
| Bot con búsqueda y cotización automática | 1–2 días adicionales |
| Catálogo completo de fotos | 2–5 días |
| Estabilización y despliegue | 0,5–1 día |

**MVP demostrable:** aproximadamente 4–6 días laborables.

**Flujo completo con bot y formatos:** aproximadamente 7–10 días.

**Fotos completas y producción estabilizada:** aproximadamente 9–15 días,
dependiendo de la disponibilidad y calidad del material fotográfico.

## 7. Fuera de alcance inicial

- Copiar el código, usuarios o base privada de Interbot.
- Automatizar el navegador de Interbot.
- Crear movimientos de inventario en Contífico.
- Cobros o facturación electrónica.
- Compatibilidad automática de medidas alternativas no validada.
- OCR de fotos de llantas.
- Recomendaciones por vehículo sin validar la tabla de fitment.

Estas funciones pueden agregarse después sin bloquear el cotizador.

## 8. Definición de terminado

La funcionalidad está terminada cuando:

- El Hub y el bot usan la misma búsqueda.
- Contífico es la fuente de precio y stock.
- Los cuatro formatos —pantalla, mensaje, PDF e imagen— coinciden.
- Los precios históricos quedan congelados en cada cotización.
- Una caída de Contífico no provoca precios inventados ni pérdida del caché.
- Las fotos tienen fallback y procedencia registrada.
- Todos los gates están marcados y tienen evidencia de pruebas.

## 9. Prompt maestro para Sol High

Copiar el siguiente prompt en una tarea nueva desde la raíz de `AutoVenta`:

```text
Implementa el plan completo descrito en PLAN_COTIZADOR_CONTIFICO.md.

Trabaja de forma autónoma por fases, en el orden Fase 0 → Fase 8. No omitas
fases y no marques una fase como terminada hasta ejecutar y aprobar su Gate.
Después de cada fase:

1. Ejecuta las pruebas y builds exigidos por el Gate.
2. Corrige todos los fallos causados por tus cambios.
3. Actualiza los checkboxes del plan únicamente con evidencia real.
4. Escribe una entrada breve de progreso en BITACORA.md con:
   - cambios;
   - pruebas ejecutadas;
   - resultado;
   - riesgos o decisiones pendientes.
5. Revisa git diff para no incluir cambios ajenos.

Reglas obligatorias:

- Contífico es la fuente de productos, precios y stock.
- Reutiliza del proyecto Mesita únicamente patrones y código compatible con su
  licencia y arquitectura: autenticación, base URL, timeouts, parseo defensivo,
  sanitización de errores y paginación. El adaptador de catálogo de AutoVenta
  debe vivir dentro de AutoVenta.
- No copies código, datos, usuarios ni imágenes privadas de Interbot.
- No automatices la interfaz de Interbot.
- Nunca escribas API keys, tokens, catálogos reales ni respuestas sensibles en
  el repositorio, fixtures, logs, snapshots o mensajes de error.
- Usa variables de entorno para credenciales.
- El modelo interpreta intención; servicios deterministas controlan búsqueda,
  precios, stock, disponibilidad, IVA y totales.
- Hub y bot deben compartir CatalogSearchService, plantillas y motor de
  cotización.
- Conserva el último catálogo válido cuando falle una sincronización.
- Implementa fotos mediante product_media y placeholders. No hotlinkees
  imágenes de terceros sin autorización.
- No escribas movimientos, pedidos, cobros ni documentos en Contífico durante
  el desarrollo de este plan. Las verificaciones reales deben ser de solo
  lectura, salvo una prueba final explícitamente autorizada.
- Respeta cambios existentes del usuario y utiliza apply_patch para editar.

Decisiones temporales:

- Si todavía no está confirmado qué PVP usar, implementa la selección como
  configuración obligatoria y usa un valor de desarrollo claramente marcado;
  no escondas la decisión dentro del código.
- Empieza el bot en modo de cotización automática "confirm": busca y muestra
  opciones automáticamente, pero genera PDF solo cuando producto y cantidad
  estén confirmados.
- El stock exacto solo se muestra a roles administrativos.

Calidad requerida:

- Tests unitarios para adaptador, parser, ranking, precios, disponibilidad,
  mensajes y totales.
- Tests de integración para API del Hub y tools del bot.
- Render y verificación visual del PDF y la imagen.
- Build limpio de app y hub.
- Pruebas responsive del nuevo tab sin regresiones en Inbox, Pipeline,
  Métricas y detalle de conversación.

No te detengas después de redactar código si todavía quedan Gates verificables.
Si una fase depende de una decisión comercial no disponible, implementa la
configuración y los fixtures necesarios, marca solamente ese punto como
pendiente y continúa con todo el trabajo que no dependa de esa decisión.

Al finalizar entrega:

- resumen por fase;
- archivos principales modificados;
- pruebas y builds ejecutados;
- cobertura de fotos;
- configuración requerida en Railway;
- decisiones comerciales todavía pendientes;
- riesgos conocidos y procedimiento de rollback.
```
