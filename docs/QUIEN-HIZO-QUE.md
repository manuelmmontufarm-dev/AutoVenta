# ¿Quién hizo qué en el ticket N?

Cada acción del panel sobre un ticket (cerrar ganado/perdido, añadir factura, deshacer venta, reabrir,
tomar o devolver al bot, descuento, mover de etapa, mensaje) y de `/venta` (registrar, factura, corregir)
queda en `audit_events`: `actor` = usuario del panel («clave admin» si entraron con la clave sin usuario,
o el nombre que escribió el vendedor en `/venta`), `before_value` / `after_value` = etapa, estado, quién
atiende y ciclo antes y después, más el detalle (factura, monto, nota…). No se muestra en el panel.

Cambiá `1234` por el número del ticket:

```sql
select created_at at time zone 'America/Guayaquil' as cuando, actor as quien, action as que, before_value->>'etapa' as antes, after_value->>'etapa' as despues, after_value->>'ciclo' as ciclo, after_value - array['etapa','estado','atiende','ciclo'] as detalle from audit_events where entity_type = 'conversation' and entity_id = '1234' order by created_at;
```

**Límite:** lo que contestan desde el WhatsApp del teléfono (ecos de Meta, `messages.author_kind = 'owner'`
sin `metadata->>'autor'`) no dice quién fue: es un solo número. Solo se sabe si escriben desde el panel
(`messages.metadata->>'autor'`).

## ¿Quién prendió o apagó el bot?

```sql
select created_at at time zone 'America/Guayaquil' as hora, actor, action, after_value->>'motivo' as motivo from audit_events where entity_type = 'bot' order by created_at desc limit 20;
```
