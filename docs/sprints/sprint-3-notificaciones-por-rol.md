# Sprint 3 · Notificaciones por rol de asesor + aviso «viene hoy» + estilos por tipo

**Modelo recomendado:** Opus · razonamiento medio. El riesgo es de enrutamiento (que a un
asesor le llegue lo que no debe, o que a Joaquín deje de llegarle algo): hay que razonar
sobre todos los emisores de avisos. El código en sí es mediano.

**Archivos que toca:**
- `app/src/services/advisorNotifications.ts` — roles, filtro por evento, formato del mensaje
- `app/src/services/visitAlerts.ts` — nuevo barrido «visita_hoy»
- `app/src/db/migrations/017_advisor_roles.ts` — columna `rol` en `advisors`
- `app/src/services/dailyReportDelivery.ts` — solo admins
- `app/src/server/admin.ts` — CRUD de asesores expone el rol
- `hub/src/screens/Ajustes.tsx` — selector de rol en «Quién recibe los avisos»
- `app/src/workers/` — registrar el barrido de visita_hoy donde corre el de mañana

**Independencia (este sprint corre EN PARALELO con 1, 2 y 4 — no asumir nada de ellos):**
- La rama parte de `main`, sin el código del login (S2). El rol de WhatsApp vive SOLO en
  la tabla `advisors` (columna `rol`) — no leer ni esperar `req.user` del login.
- Migración: usar exactamente `017_advisor_roles` (S4 usa la 018; así no chocan).
- No añadir el código del cupón a los `details` de los avisos (eso lo cablea el Sprint 5);
  dejar los `details` como una función fácil de extender.
- `admin.ts` y `Ajustes.tsx` los tocan también S2/S4: mantener los cambios propios
  compactos y localizados para que el conflicto de merge sea trivial.

---

## Requerimiento (Manuel + reunión del 14-ago)

Joaquín y Manuel siguen recibiendo **todo** (como hoy). Se crea un segundo nivel para los
asesores de local (Jocelyn y Jimmy — action item de la reunión), a quienes les llega
**únicamente**:

1. Las alertas para **escribir al chat y que no se cierre la ventana de 24 h**.
2. **Nueva cotización** creada.
3. Cliente **dijo la fecha** en la que va a ir **o la cambió**.
4. **El día antes** de la visita.
5. **El día de** la visita.

Nada de reportes diarios, errores del bot, guardián, conversación repetitiva, sentimiento,
opt-out ni fallas técnicas. Andrés lo pidió como «chat general»: a TODOS los asesores les
llegan estos 5, para que cualquiera del local pueda cubrir el seguimiento.

## Tareas

### 1. Rol en la tabla `advisors`

Migración: `alter table advisors add column rol text not null default 'admin'`.
Valores: `admin` (todo, como hoy — Manuel, Joaquín, «Asesor principal») y `asesor`
(solo los 5 eventos). El default `admin` garantiza que nadie pierda avisos al migrar.
En Ajustes → «Quién recibe los avisos»: selector Rol al añadir/editar; añadir ahí a
Jocelyn y Jimmy cuando Depot pase sus números (no inventarlos).

### 2. Filtro por evento en `notifyAdvisor`

Allowlist del rol `asesor` (los demás eventos solo van a `admin`):

```ts
const EVENTOS_ASESOR = new Set<AdvisorEventType>([
  "quote_created",          // 2
  "visita_comprometida",    // 3 — se emite también cuando la fecha CAMBIA (verificar
                            //     que visitAlerts re-alerte con dedupe por fecha nueva: ya
                            //     incluye el día en la clave, confirmar con test)
  "visita_manana",          // 4
  "visita_hoy",             // 5 — nuevo, tarea 3
  "ventana_por_cerrar",     // 1 — ver nota abajo
]);
```

**Nota sobre (1) la ventana de 24 h:** hoy `window_closing` está degradado a operativo y
NO genera aviso de WhatsApp (decisión del 6-ago: era ruido para Manuel). Para los asesores
de local sí es su trabajo: reintroducirlo como evento `ventana_por_cerrar` que se envía
**solo al rol `asesor`**, una vez por conversación/ventana, únicamente si la conversación
está en etapa comercial viva (cotización enviada o seguimiento) — no por cada chat viejo.
Emisor: el mismo lugar donde `reconcileFollowUpAlerts` detecta la ventana por cerrar.

### 3. Nuevo barrido `visita_hoy` (`visitAlerts.ts`)

Igual al de `revisarVisitasDeManana` pero para el día corriente, a primera hora hábil
(usar el mismo `esHoraDeRecordar`/horario de tienda): «🎯 Hoy viene {cliente}» con los
mismos `detallesDeVenta` (medida, cotizado, local). Dedupe `visita_hoy:<día>`. Registrar
en el worker junto al de mañana. Añadir `visita_hoy` a `AdvisorEventType` y a la lista
`OPERATIVOS` de `alertTaxonomy.ts` (no es un error).

### 4. Reporte diario solo a admins

`dailyReportDelivery.ts`: filtrar destinatarios por rol `admin`. (Pedido explícito:
«nada de daily reports» para asesores.)

### 5. Estilo visual por tipo de aviso (`buildAdvisorMessage`)

Hoy todos los avisos empiezan con `🚨` y se ven idénticos. Cambiar a una cabecera por
familia, para distinguirlos en un segundo en WhatsApp:

| Familia | Cabecera | Eventos |
|---|---|---|
| Venta | `💰 *NUEVA COTIZACIÓN*` | quote_created, customer_ready_to_buy |
| Visita | `📅 *CONFIRMÓ VISITA*` / `⏰ *VIENE MAÑANA*` / `🎯 *VIENE HOY*` | visita_comprometida, visita_manana, visita_hoy |
| Ventana | `⏳ *VENTANA POR CERRAR*` | ventana_por_cerrar |
| Cliente | `🙋 *PIDE ASESOR*` / `😠 *CLIENTE MOLESTO*` | human_requested, negative_sentiment, customer_opt_out |
| Bot | `🤖 *EL BOT NECESITA AYUDA*` | repetitive_conversation, guard_*, caso_sin_resolver, envio_fuera_de_cobertura |
| Técnico | `⚙️ *FALLA TÉCNICA*` | send_error, advisor_notification_* |

Regla: cabecera + segunda línea con el dato que decide («$483,28 · 4× Kenda KR33A»,
«El lunes · Quito Sur») antes del nombre y el link. Mantener el link al ticket al final.
Definir el mapa en un solo lugar (`advisorNotifications.ts`) con test de que ningún
`AdvisorEventType` queda sin cabecera.

## Criterios de aceptación

- Un asesor rol `asesor` recibe SOLO los 5 eventos; Manuel y Joaquín reciben todo igual
  que hoy (test de enrutamiento por cada evento del union type).
- El día de una visita comprometida sale el aviso «viene hoy» una sola vez.
- El reporte diario de las 20:00 no llega a rol `asesor`.
- Cada tipo de aviso se distingue por su primera línea; test del mapa completo.
- Cambiar la fecha de visita re-alerta con la fecha nueva.

## Qué NO hacer

- No tocar el detector de repetición ni el guardián (Sprint 1).
- No inventar los teléfonos de Jocelyn/Jimmy; dejar el alta lista en Ajustes.
- No convertir esto en el sistema de permisos del hub (eso es la base del Sprint 2;
  aquí solo se enruta WhatsApp).
