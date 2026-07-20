# AutoVenta — Bot de ventas por WhatsApp para llantas

> Estado: **descubrimiento / planeación** · Última actualización: 2026-07-13

Bot que automatiza la venta de llantas por WhatsApp para el negocio **Pit Stop**
(cliente/amigo, Ecuador), construido de forma genérica para poder venderse después
a otras empresas de llantas.

---

## 1. Contexto del cliente

- Negocio de **llantas** en Ecuador (marca **Pit Stop**, marcas que venden: Falken, Kenda).
- **2 locales** (pronto 3) + venta a nivel Ecuador.
- Son **2 empresas**:
  - Una vende a **distribuidores / revendedores**.
  - Otra vende **directo al cliente final** → **esta es la que compra por WhatsApp** (el foco del bot).
- Decisión de presupuesto: el amigo lo consulta con **su papá**.

## 2. Situación actual (cómo venden hoy)

- Venden por WhatsApp usando **Claude + una extensión de browser**, disparada **a mano** cada día.
  Es un prompt manual, **no un agente automático** → pesado y poco fiable.
- Ya tienen una **web estática (HTML)** con catálogo: fotos, precios y **stock ("disponible")**
  que jala de un **Excel / base de datos**.
- ⚠️ **El código de la web NO es de ellos.** Lo hizo otro dev ("Interbot", el que les hace
  las páginas). No van a soltar el GitHub. Solo tenemos el **archivo HTML + link**.
- Nota: el HTML recibido (`catalogo-pitstop-sudinco-mejorado.html`) es una **propuesta
  específica para la flota de SUDINCO** (catálogo Falken/Kenda + simulador de escenarios),
  **no** el catálogo general con todo el stock. → Falta conseguir el catálogo completo.

## 3. Flujo de venta a automatizar

1. Cliente escribe al WhatsApp → **mensaje automático de approach**.
2. Cliente responde con la **medida de la llanta** (parámetros) **o no manda nada**.
3. Si **da la medida** → **cotiza de una** y manda **PDF**.
4. Si **no da medida** → pregunta **"¿qué medida necesitas?"** / **"¿qué vehículo tienes?"**.
5. Cliente manda **ubicación** → bot responde con el **local más cercano**.
6. Bot **alerta al vendedor** cuando el cliente llega al paso final.

## 4. Fases del proyecto

| Fase | Alcance |
|------|---------|
| **Fase 1** | Bot busca la llanta **por medida** y manda el **PDF** de cotización. |
| **Fase 2** | Maneja el caso **sin datos**: lee mensajes, pregunta medida/vehículo, **OCR de fotos**, sugiere **alternativas por fitment** (vehículo → medida). |
| **Fase 3** | Producto completo: reacción **más humana**, entiende más contexto. Incluye el **hub/dashboard** de métricas. |

**El cliente quiere MÁS el agente que el hub** → el dashboard se hace simple para no perder tiempo.

## 5. Hub / Dashboard (centralizado)

- Métricas: cuántos escribieron, cuántos respondieron 1er/2do mensaje, cuántos en etapa **alerta/final**.
- Conectado a WhatsApp; **avisa al vendedor por WhatsApp** cuando alguien llega al paso final.

## 6. Retos técnicos a resolver

- **WhatsApp Business API** — vivir dentro de WhatsApp, monitoreo constante.
- **OCR de imágenes** — clientes mandan fotos (cotizaciones de la competencia, datos del vehículo).
- **Parseo de medidas mal escritas** — ej. "185 R14", "185/14", "175 R 14" → normalizar/interpolar.
  Formato de medida = **ancho / perfil R-rin** (ej. 195/15R…, donde 175 = ancho).
- **Stock y alternativas** — cuando no hay una medida, sugerir llanta **alternativa que le quede
  al vehículo** → requiere data de **fitment (vehículo → medida)**.
- **AI para fitment** (opcional) — consume tokens API, costo bajo (~< $5), transaccional.
- Posible: **recrear la base de datos** de productos a partir del HTML (no tenemos su Excel).

## 7. Modelo de negocio / precio

- Inclinación: **precio fijo por implementación** (no por venta — mucha gente dice que va y no va → difícil medir).
- Referencia de mercado: el dev de la competencia **cobra mensualidad** a otras empresas de llantas.
- El amigo consulta el **presupuesto con su papá**; nosotros mandamos la **estructura del plan por fases**.

## 8. Enfoque de construcción

- Orden habitual: **frontend → backend → base de datos** → luego conectar todo.
- Genérico y reutilizable para vender a otras empresas de llantas más adelante.

## 9. Próximos pasos

- [ ] Conseguir el **catálogo completo** (con todo el precio + stock), no solo la propuesta SUDINCO. **Bloqueo #1.**
- [x] Investigar factibilidad de **conexión con WhatsApp Business** → ver [PLAN_DESARROLLO.md](PLAN_DESARROLLO.md).
- [x] Investigar **cuánto se cobra** por este tipo de trabajo → ver [PLAN_FINANCIERO.md](PLAN_FINANCIERO.md).
- [x] Armar **plan por fases con estimación de horas** para el cliente.
- [~] Construir **Fase 1** (buscar por medida + PDF). Demo estimado: **~1–2 semanas**.
  - ✅ Esqueleto completo en [`app/`](app/) (15-jul): webhook con firma verificada + pipeline anti-caos + agente Claude con 5 tools + parser de medidas (21 tests ✅) + PDF de cotización (probado ✅) + Sheets→cache + Postgres + clasificador de funnel. Ver [app/README.md](app/README.md).
  - Falta para el demo: credenciales (Meta, Supabase, Sheets service account) + el catálogo real del dueño + validar tabla de fitment.
- [x] Ubicaciones de los 2 locales (ver §11) — ⚠️ **confirmar con el cliente**, Maps los muestra como "Depot Tire", no "Pit Stop".
- [ ] Aclarar con el cliente las funcionalidades nuevas que pidió el 14-jul (ver [PLAN_DESARROLLO.md §12](PLAN_DESARROLLO.md#12-funcionalidades-pedidas-por-el-cliente-14-jul-2026--análisis)): si tienen un sistema de inventario real aparte del Excel, y si quieren campañas de recuperación/seguimiento (cambia el modelo de costo — requiere opt-in y templates de marketing pagados).
- [x] Implementar el cotizador compartido Hub + bot con inventario real de Contífico, comparación, mensajes, PDF, imagen para WhatsApp y catálogo de fotos siguiendo los gates de [PLAN_COTIZADOR_CONTIFICO.md](PLAN_COTIZADOR_CONTIFICO.md).

## 11. La empresa: Depot Tire (confirmado 15-jul-2026)

**Sitio oficial: https://www.tiredepotec.com/** — el cliente confirmó que esta es la empresa. ✅ Misterio resuelto: los locales de Maps decían "Depot Tire" porque **ese es el nombre real del negocio** (la referencia anterior a "Pit Stop" venía del HTML de la propuesta SUDINCO — aclarar con el cliente qué relación tienen los dos nombres).

| Dato | Valor |
|---|---|
| Nombre | **Depot Tire** |
| Ciudad | Quito, Ecuador |
| Local 1 (Cumbayá) | C.C. La del Establo y Av. Oswaldo Guayasamín — "DEPOT TIRE CUMBAYÁ" en Maps, Plus code RH24+QV |
| Local 2 (Sur) | Galo Molina y Av. Alonso de Angulo — "Depot Tire Quito Sur" en Maps, lat/lng -0.2487128, -78.5296804 |
| Teléfono | +593 98 280 1766 |
| Horario | Lunes a sábado, 8:30–17:30 |
| Marcas | Kenda, Sunoco, Eurolub (el HTML de SUDINCO también mencionaba Falken) |
| Trayectoria | Más de 30 años de experiencia |
| Servicios | Llantas + mantenimiento preventivo automotriz, atención personalizada |
| Promo vigente | 10% de descuento en el primer servicio al agendar cita |
| Web | Reserva de citas online, secciones: Beneficios VIP, Servicios, Sobre Nosotros, Contacto. **Sin catálogo con precios ni stock visible; sin link a WhatsApp** |
| Estilo de marca | Oscuro (negro/gris) con blanco y acentos azules, minimalista |
| Redes | Facebook, Instagram, YouTube, Twitter, Pinterest |

**Implicaciones para el bot:**
- Los datos de "local más cercano" ya están completos (direcciones + coordenadas + teléfono + horario).
- El horario (L–S 8:30–17:30) sirve para que el bot responda distinto fuera de horario ("te atendemos mañana desde las 8:30, pero ya te dejo la cotización").
- La web NO tiene catálogo con precios → confirma que la fuente de datos será el Excel del dueño, no el sitio.
- La promo del 10% primer servicio puede usarla el bot como gancho en el approach.
- El bot debería presentarse como **Depot Tire** (confirmar con el cliente).

## 12. Respuesta del cliente a la propuesta (16-jul-2026)

Joaquín respondió por audio a la propuesta enviada (versión con precios: Fases $200/$125/$125/$100/$50, ~$600 "socio fundador" + $40/mes). Reacción **muy positiva** — está comprado, no regateó. Puntos clave:

1. **Le encantó** ("me parece de putas"). Señal de compra fuerte: dijo que si el papá no entra, lo hace él por su lado.
2. **Quiere pagar por el producto completo, no por fases.**
   - Recomendación: aceptar con **precio cerrado (~$600) + pagos por hito** (ej. 40% anticipo / 30% Fase 1–2 / 30% final). Mantener las fases **internamente para la entrega** — mostrar Fase 1 funcionando en semana 1, no cargar todo el riesgo de una.
3. 🔑 **El inventario se maneja en Contífico** (no solo Excel). Pregunta si conviene conectar el bot directo ahí.
   - **Responde la pregunta abierta** "¿sistema aparte del Excel?" → **SÍ, Contífico.**
   - **Cambia la fuente de datos del catálogo:** de Google Sheets/Excel → **API de Contífico** (stock y precios en tiempo real — justo lo que pidió desde el inicio). Ver PLAN_DESARROLLO §5.
   - **Ventaja:** Manu ya integró Contífico en [[project-mesita]] y [[project-jardin-express]] (prefacturas, cobros, API). Sabe que tiene API y cómo pegarle.
   - **Alcance:** integración con API de Contífico > leer un Excel. Suma horas a la Fase 1 / va como pieza propia; requiere plan Contífico con API (Contable Plus o superior). Es lo que hace el bot "en tiempo real" — no regalarlo.
4. El presupuesto/inventario lo termina de cuadrar con el papá.

**Nuevo pendiente #1** (reemplaza al "mándame el Excel"): acceso y detalles del **Contífico** de Depot Tire — qué plan tienen (¿incluye API?) y confirmar que el inventario está bien cargado ahí.

**Propuesta enviada:** `docs/propuesta-autoventa.pdf` (Descargas) — versión compacta de una página con precios. Distinta a `reunion-autoventa.html` (versión larga por fases). Transcripción del audio: `docs/respuesta-cliente-16jul.txt`.

## 13. Enlaces y recursos

- Repo: https://github.com/manuelmmontufarm-dev/AutoVenta
- Bot actual del cliente (Railway, del otro dev "Interbot"): https://interbot-production.up.railway.app/
- Catálogo recibido: `catalogo-pitstop-sudinco-mejorado.html` (propuesta flota SUDINCO)
- Local 1 (Maps): https://maps.app.goo.gl/QnMBPXKc1o8igbsp8
- Local 2 (Maps): https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7
