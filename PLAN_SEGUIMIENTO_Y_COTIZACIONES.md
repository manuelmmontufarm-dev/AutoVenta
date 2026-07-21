# Plan: Seguimiento + Cotizaciones visuales (post-reunión 20-jul)

> **Principio rector (del cliente):** «La venta está en el seguimiento, no en el principio.»
> La intención de compra aparece al mensaje 8–9; hoy el seguimiento queda a voluntad
> de cada vendedor y no hay registro. Ahí es donde hay que ponerse las pilas.

Decisiones de la reunión que ya quedaron fijas:
- ✅ Emojis **se quedan** — al cliente le gustaron.
- ✅ Handoff a humano ya está hecho (`9eed25e`).
- La cotización **siempre va texto + imagen** (nunca imagen sola). PDF además cuando aplique.
- KPIs que importan: **producto** (qué llanta se busca/cotiza/vende más) y **redención**
  (% de los que dijeron que iban que de verdad fueron) — no por vendedor/sucursal.

---

## Fase A — Cotizaciones visuales nivel Grupo Inter (P0)

Referencia: las 3 piezas de Grupo Inter/interbot (cotización individual, comparativa de 3,
catálogo multi-marca). Objetivo: **igual o mejor**, con estilo propio Depot Tire
(Racing Heritage), copiando la estructura que funciona:

- Banda de cabecera con logo, título, fecha y sello «IVA y Ecovalor · Válida 3 días».
- **Logo de la marca** de la llanta (Kenda, Winrun, Falken, Maxxis…) en vez del nombre en texto.
- Foto del producto, modelo + medida grande.
- Precio hoy en grande, PVP tachado, badge verde «Ahorras $X · −Y%».
- Badges de garantía tipo medalla: golpes (meses) + fábrica (años).
- Índice de carga/velocidad traducido («112T = 1120 kg máx · 190 km/h máx»).
- Estado de stock visible: «✓ Disponible» / «Consultar» — **leído de Contífico al momento
  de generar**, nunca inventado.

### A1. Motor de render de imágenes (sin Chromium)
Railway tiene 512 MB — Chromium no cabe (por eso hoy es pdfmake). Usar **satori +
@resvg/resvg-js**: JSX/HTML-like → SVG → PNG. Liviano, tipografías propias, imágenes
embebidas como data URI. Nuevo `app/src/services/quoteImage.ts` con 3 plantillas:

1. `cotizacionImage(quote)` — 1 producto (como la pieza 2 de Grupo Inter).
2. `comparativaImage(products[])` — 2–3 productos lado a lado (pieza 1).
3. `catalogoImage(productsByBrand)` — agrupado por marca (pieza 3).

Assets nuevos en `app/assets/`: logos SVG/PNG de marcas del catálogo, logo Depot Tire,
badges de garantía, fuente (Inter/Archivo). Fotos de producto: las que ya se
consiguieron + fallback a silueta genérica si falta foto.

### A2. Envío confiable por WhatsApp (crítico — falló en el demo)
- `sendImage()` en `app/src/wa/client.ts` (hoy solo hay `sendPdf`): subir media → mandar `type: image`.
- `generar_cotizacion` en `tools.ts` pasa a: **(1)** mensaje de texto con el resumen
  (como hoy), **(2)** imagen de cotización, **(3)** PDF solo si el cliente lo pide o
  son 2+ productos. Texto SIEMPRE sale aunque falle la imagen (try/catch con log +
  alerta interna) — la cotización nunca se cae completa como en el demo.
- Nueva tool `comparar_llantas(codes[])` que manda la comparativa como imagen.
- Reintento 1 vez en upload de media; verificar respuesta de la Graph API (el fallo
  del demo fue silencioso).
- Test e2e con wa-tester: generar y mandar los 3 tipos de imagen antes de dar por hecha la fase.

### A3. PDF alineado
El PDF actual (pdfmake, estilo factura azul) se re-estila con la misma identidad
(banda roja/racing, logos de marca, badges). Alternativa simple: incrustar el PNG de
satori en un PDF con `pdf-lib` — un solo diseño que mantener.

**Estimado Fase A: 6–8 h.**

---

## Fase B — Motor de seguimiento (P0 — «ahí está la venta»)

### B1. Datos
- Tabla `followups`: conversation_id, tipo (sin_respuesta / visita_prometida /
  post_cotización), programado_para, estado, mensaje_sugerido.
- Columnas en `conversations`: `last_inbound_at` (para calcular la ventana de 24 h),
  `visita_prometida_fecha`, `followup_count`, `optout` (si dice «no me interesa», no más).
- Nueva tool del agente `registrar_visita_prometida(fecha, nota)` — cuando el cliente
  dice «voy el sábado», el bot lo registra solo.

### B2. Scheduler (cron en el mismo proceso de Railway)
Corre cada hora y por cada lead activo decide según la **ventana de 24 h de Meta**
(verificada 20-jul: se renueva con cada mensaje del cliente; dentro = libre y gratis;
fuera = solo template aprobado, marketing ≈ $0.07–0.09/msj a Ecuador, límite ~2
marketing/día por usuario entre todas las empresas, error 131049 si está saturado):

| Situación | Acción |
|---|---|
| Dentro de ventana, sin respuesta hace 4–20 h | Bot manda seguimiento libre automático (máx 1/día), tono natural según etapa |
| Fuera de ventana | Genera el **mensaje listo para copiar/pegar** y alerta a la ejecutiva (lo acordado en la reunión: «el ticket te da el mensaje») |
| Visita prometida para hoy/mañana | Recordatorio al cliente (si hay ventana) + alerta a la ejecutiva del local |
| 2 seguimientos sin respuesta | Marcar `sin_respuesta` en el pipeline y parar (protege el quality rating) |

### B3. UI en el hub
- En cada ticket del inbox: botón «copiar mensaje de seguimiento», fecha de visita
  prometida, contador de seguimientos, estado de la ventana (verde = abierta, con cuenta regresiva).
- Cola del día para la ejecutiva: «hoy toca seguir a estos N».

Futuro (Fase B2'): automatizar los fuera-de-ventana con templates de marketing
aprobados (~$0.08/toque) una vez que el flujo manual pruebe funcionar.

**Estimado Fase B: 8–10 h.**

---

## Fase C — Incentivos con número de cotización = KPI de verdad (P1)

Diseñar bien antes de codear (pedido explícito):

1. El descuento **no es automático ni obligatorio**. La IA detecta señales («está caro»,
   comparando, se enfría) y usa una tool `solicitar_incentivo(contexto)` → notifica al
   asesor por WhatsApp con resumen + total.
2. El asesor responde el % autorizado (por WhatsApp o desde el hub) → el bot comunica:
   «te conseguí un X% presentando tu cotización **COT-XXXX** en el local, válido hasta _fecha_».
3. **El número de cotización es la llave de redención.** En el local, la ejecutiva marca
   la COT como redimida (vista simple en el hub, buscar por número).
4. KPIs que salen solos: % cotizaciones redimidas, % visitas prometidas cumplidas,
   efectividad del incentivo (con vs. sin), tiempo cotización→visita.

Incentivos temporales («5% esta semana») como config en el panel, no hardcodeados.

**Estimado Fase C: 5–7 h** (después de validar el flujo con el cliente).

---

## Fase D — Analytics de producto (P1)

No por vendedor/sucursal — por **producto**:
- Loggear cada `buscar_llanta` (medida, resultados, con/sin stock) y cada línea cotizada/vendida.
- Panel: llanta más buscada, más cotizada, más vendida, conversión búsqueda→cotización→venta
  por modelo, y **medidas buscadas sin stock** (= compras perdidas, oro para reposición).

**Estimado Fase D: 3–4 h.**

---

## Orden de ejecución

1. **A** (cotización visual + envío confiable) — es la cara del producto y lo que falló en el demo.
2. **B** (seguimiento) — el valor de verdad del sistema.
3. **C** (incentivos/redención) — diseñar con el cliente, luego codear.
4. **D** (analytics de producto).

Total estimado: ~22–29 h.
