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

- [ ] Conseguir el **catálogo completo** (con todo el precio + stock), no solo la propuesta SUDINCO.
- [ ] Investigar factibilidad de **conexión con WhatsApp Business** (respuesta automática).
- [ ] Investigar **cuánto se cobra** por este tipo de trabajo (precio de mercado).
- [ ] Armar **plan por fases con estimación de horas** para el cliente.
- [ ] Construir **Fase 1** (buscar por medida + PDF). Demo estimado: **~1–2 semanas**.

## 10. Enlaces y recursos

- Repo: https://github.com/manuelmmontufarm-dev/AutoVenta
- Bot actual del cliente (Railway, del otro dev "Interbot"): https://interbot-production.up.railway.app/
- Catálogo recibido: `catalogo-pitstop-sudinco-mejorado.html` (propuesta flota SUDINCO)
