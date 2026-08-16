# Sprint 4 · Cupón de confirmación: cerrar el ciclo cotización → venta

**Modelo recomendado:** Opus · razonamiento alto. Feature nueva que cruza todas las capas
(migración, dominio, herramienta del bot, mensajes de WhatsApp, hub, métricas) y toca
dinero (descuento). Es el sprint más grande.

**Archivos que toca:**
- `app/src/db/migrations/018_confirmation_coupons.ts` — **nueva** tabla
- `app/src/domain/coupons.ts` — **nuevo**: generación y validación del código
- `app/src/services/coupons.ts` — **nuevo**: emisión, canje, métricas
- El punto donde se registra el compromiso de visita (`customerCommitment`/`conversationState`) — emisión
- `app/src/server/admin.ts` — endpoints de canje y métricas
- `hub/src/screens/` — canje en TicketDetail/Opportunities + widget en Dashboard
- `docs/OPERACION.md` — guion para los operadores

**Independencia (este sprint corre EN PARALELO con 1, 2 y 3 — no asumir nada de ellos):**
- **NO tocar `visitAlerts.ts`** (es del S3). La emisión se engancha donde se registra el
  compromiso (`customerCommitment`/`conversationState`), no en las alertas. Exponer
  `getCouponForConversation(conversationId, cycle)` en `services/coupons.ts`; el Sprint 5
  cablea el código dentro de los avisos de visita del S3.
- `redeemed_by`: por ahora un string libre que manda el hub (nombre escrito o fijo
  «hub»); el Sprint 5 lo conecta al usuario del login del S2.
- Migración: usar exactamente `018_confirmation_coupons` (S3 usa la 017).
- `admin.ts` y `Ajustes.tsx` los tocan también S2/S3: cambios compactos y localizados
  para que el conflicto de merge sea trivial.

---

## Requerimiento (reunión del 14-ago, action item de Andrés)

El problema: hoy solo hay 15 «ganados» marcados y nadie sabe cuántas de las 152
cotizaciones pendientes terminaron en venta. Andrés no confía en pedir el teléfono en
caja («te doy el de mi oficina»); su propuesta: cuando el cliente dice que va a ir, el
bot **emite un código válido por un descuento adicional (~2 %)**. El cliente lo presenta
en el local para reclamar su descuento — y al canjearlo, Depot sabe exactamente qué
cotización del bot se convirtió en venta. El incentivo lo trae el propio cliente:
«yo sí te voy a exigir mi 2 %».

## Diseño

### 1. Tabla `confirmation_coupons`

```
id · code (único, p.ej. DT-7K3M) · conversation_id · cycle · quote_id nullable ·
extra_pct numeric default 2 · status (emitido | canjeado | anulado) ·
issued_at · redeemed_at · redeemed_by (nombre del usuario del hub) · notes
```

Código corto legible por teléfono: `DT-` + 4 caracteres sin ambiguos (sin 0/O/1/I).
Único por conversación+ciclo: si el cliente cambia la fecha, se **reusa** el mismo código
(no emitir dos descuentos al mismo cliente).

### 2. Emisión

Disparador: el mismo punto donde se registra `customer_commitment`/`visit_date` (donde hoy
nace la alerta `visita_comprometida`). Al confirmarse fecha (y habiendo cotización):

1. Se crea el cupón.
2. El bot envía el mensaje (dentro de la ventana de 24 h, texto normal):
   > 🎟️ Por confirmar su visita le regalamos un *2 % adicional* sobre su cotización
   > *COT-XXXX*. Presente este código en el local: *DT-7K3M*.
3. (Lo cablea el Sprint 5, no este): el código en los `details` de los avisos de visita
   del S3. Este sprint solo deja `getCouponForConversation()` listo para eso.

Configurable en Ajustes: activo sí/no y porcentaje (default 2 %). Si está apagado, nada
se emite. **Empezar apagado y prenderlo cuando Depot capacite a los operadores**
(la capacitación quedó agendada en la reunión).

QR: fase 2 — el código de texto ya cierra el ciclo; generar QR (el renderer de piezas
puede dibujarlo) solo si en el local les resulta más cómodo escanearlo.

### 3. Canje (hub)

- En **TicketDetail** y en la baraja de **Opportunities**: chip visible con el código y
  su estado; botón **«Canjear»** → marca `canjeado`, guarda quién (por ahora el string
  del stub de Independencia; el S5 lo conecta al login) y **ofrece marcar la conversación
  como Ganada** en el mismo gesto (ese es el objetivo de todo esto).
- Búsqueda directa: campo «canjear código» en el Dashboard u Opportunities — el operador
  del local le dicta el código a quien tenga el hub, o el asesor lo escribe él mismo.
- Endpoints: `POST /api/coupons/:code/redeem`, `GET /api/coupons?status=…`.

### 4. Métricas (el porqué del feature)

En el Dashboard/KPIs: **emitidos · canjeados · % de conversión · $ vendido con cupón**
(total de la cotización ligada). Incluir la línea en el reporte diario (solo admins).
Esto responde la pregunta de Andrés: «cuántas de estas cotizaciones fueron ventas reales».

### 5. Guion operativo (`docs/OPERACION.md`)

Media página para la capacitación: qué es el código, cómo aplicar el 2 % en caja, cómo
canjearlo en el hub, y qué hacer si el código no existe o ya fue canjeado (avisar a
Joaquín — puede ser un cliente repitiendo el descuento).

## Criterios de aceptación

- Cliente confirma fecha teniendo cotización → recibe UN código; cambiar la fecha no
  genera otro.
- Canjear desde el hub marca quién y cuándo, y el flujo «marcar Ganada» funciona.
- Canje doble rechazado con mensaje claro.
- KPIs muestran emitidos/canjeados/conversión.
- Con el toggle apagado no se emite nada (estado inicial de producción).
- El descuento NUNCA lo aplica el bot sobre precios (solo lo anuncia): caja lo aplica.
  El guardián y los candados de precio no deben ver números nuevos inventados.

## Qué NO hacer

- No aplicar el 2 % dentro de las cotizaciones del bot ni recalcular totales.
- No emitir cupones retroactivos a los 152 pendientes sin que Depot lo pida.
- No mandar el cupón por plantilla fuera de la ventana de 24 h en esta fase.
