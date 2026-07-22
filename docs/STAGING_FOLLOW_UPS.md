# Seguimientos de ventas — operación exclusiva en staging

Este procedimiento aplica únicamente a `https://autoventa-staging.up.railway.app/`. No usar el proyecto, servicio, base de datos ni número comercial de producción.

## Servicios Railway

Usar dos servicios conectados a la misma base PostgreSQL y al mismo commit:

- HTTP: directorio `app`, build `npm ci && npm run build`, start `npm start`, healthcheck `/health`.
- Worker: directorio `app`, config `app/railway.worker.toml`, start `npm run start:worker`. No exponer dominio público; usar referencias a las variables del servicio `AutoVenta`.

PostgreSQL es la fuente de verdad. El worker reclama jobs con `FOR UPDATE SKIP LOCKED`; un reinicio no elimina los jobs y los leases abandonados se recuperan.

## Variables

Variables compartidas por HTTP y worker:

- `DATABASE_URL`
- `ADMIN_KEY`
- `OPENAI_API_KEY`
- `OPENAI_RESEARCH_MODEL` (opcional; por defecto usa `OPENAI_MODEL`)
- `WHEELSIZE_API_KEY` (opcional; habilita consulta determinística de fitment para región Latinoamérica/Ecuador)
- `SELLER_PHONE` (número internacional de Manuel Montúfar, sin `+`)
- `SELLER_NAME=Manuel Montúfar`
- `HUB_PUBLIC_URL=https://autoventa-staging.up.railway.app/admin`
- `META_ACCESS_TOKEN`
- `META_PHONE_NUMBER_ID`
- `META_BUSINESS_ACCOUNT_ID` (necesario para sincronizar/confirmar plantillas desde Meta cuando se habilite esa integración)
- `META_VERIFY_TOKEN`
- variables actuales de Contífico y catálogo
- `NODE_ENV=production` (describe el runtime compilado, no autoriza un ambiente comercial)

Variables locales para el smoke, nunca persistidas en el repositorio:

- `STAGING_BASE_URL=https://autoventa-staging.up.railway.app`
- `ADMIN_KEY`
- `E2E_AUTHORIZED_PHONE`, sólo un número autorizado en Meta
- `E2E_ALLOW_META_SEND=true`, sólo durante la prueba explícita de WhatsApp

Las tres plantillas se crean desactivadas y sin nombre Meta: `seguimiento_cotizacion_v1`, `recordatorio_visita_v1` y `seguimiento_opciones_v1`. No marcar `configured` ni `approved` hasta confirmar los nombres y aprobación reales en Meta. El botón “Continuar seguimiento con plantilla” autoriza explícitamente el plan mostrado (máximo 8 días); no habilita texto libre.

## Backup y migración

1. Confirmar que Railway CLI está autenticado contra el proyecto de staging.
2. Obtener la URL de PostgreSQL de staging sin imprimirla ni copiarla a documentación.
3. Crear un backup fechado con `pg_dump --format=custom --no-owner --file=<ruta-segura>.dump "$DATABASE_URL"`.
4. Verificar el backup con `pg_restore --list <ruta-segura>.dump`.
5. Ejecutar `npm run db:migrate` desde el servicio HTTP o un job one-off de staging.
6. Ejecutar nuevamente la migración: debe terminar sin duplicados ni pérdida histórica.

La migración conserva ids, ciclos, transiciones, métricas y eventos al convertir `handoff_visita` en `seguimiento_venta`.

## Checks antes de enviar por WhatsApp

```sh
cd app
npm ci
npm run typecheck
npm test
npm run build
STAGING_BASE_URL=https://autoventa-staging.up.railway.app npm run test:staging
```

Para el E2E autorizado:

1. Cambiar temporalmente el primer retraso de 180 a 3 minutos desde Ajustes.
2. Escribir desde `E2E_AUTHORIZED_PHONE` y dejar una conversación abierta esperando respuesta.
3. Confirmar que sólo se crea un job equivalente por conversación/ciclo.
4. Responder antes del vencimiento y confirmar cancelación del job pendiente.
5. Tomar control humano y comprobar que el bot y el worker quedan pausados.
6. Devolver al bot y comprobar reprogramación pertinente.
7. Cerrar como Ganado y Perdido; confirmar cancelación. Reabrir y confirmar ciclo nuevo.
8. Cerrar la ventana simulada o usar un registro de prueba vencido: sin plantilla aprobada debe quedar bloqueado y crear alerta, sin texto libre.
9. Restaurar inmediatamente el retraso a 180 minutos.

No se debe ejecutar un envío si el teléfono no está autorizado por Meta.

## Verificación posterior al deploy

- `/health` responde 200.
- Logs HTTP sin errores de migración o webhook.
- Logs del worker muestran polling y no un loop de fallos.
- El rail incluye `Oportunidades` debajo de Inbox; Pipeline mantiene `Kanban | Embudo`.
- Oportunidades contiene únicamente revisión humana post-24 h y la recta final de `seguimiento_venta`.
- El ticket muestra los días, la plantilla y la hora antes de autorizar un plan post-24 h.
- Inbox muestra Alertas del bot.
- Cotizador muestra inventario numérico por llanta.
- KPIs cargan seguimiento y estados de entrega sin datos inventados.
- KPIs muestran la distribución de respuestas por hora de Guayaquil de los últimos 90 días.
- Fitment muestra fuente y distingue claramente entre medida verificada, referencia y caso ambiguo.
- Pedir “asesor” crea alerta web, mueve el ticket inmediatamente a Revisión humana y avisa por WhatsApp a `SELLER_PHONE` una sola vez por ciclo.
- Cada nueva cotización y evento comercial crítico registra y envía una alerta idempotente al asesor; los rechazos de Meta quedan visibles como alerta de entrega fallida.
- Un manual fuera de 24 horas es rechazado.
- Una plantilla no configurada crea tarea humana y nunca cae a texto libre.

## Rollback

1. Detener el worker de staging para impedir nuevas reclamaciones.
2. Revertir HTTP y worker al commit anterior desde Railway.
3. Si la migración debe deshacerse, crear primero un segundo backup del estado fallido.
4. Restaurar el dump con `pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" <ruta-segura>.dump` únicamente después de validar que `DATABASE_URL` pertenece a staging.
5. Levantar HTTP, verificar `/health`, luego levantar el worker.
6. Documentar el commit, hora, motivo y evidencia. Nunca reutilizar este procedimiento contra producción.
