# AutoVenta — Plan para convertir el demo en producto real

> Fecha: 20 de julio de 2026
> Alcance: un solo frontend Showroom GP con modo demo y modo real; WhatsApp,
> Contífico, Postgres, pipeline, analítica, PDFs y configuración de IA por etapa.

## 1. Hallazgo de la auditoría

El proyecto no parte de cero.

Ya existe y se debe conservar:

- Webhook firmado de WhatsApp Cloud API.
- Pipeline con debounce, FIFO por teléfono e idempotencia básica.
- PostgreSQL con conversaciones, mensajes, cotizaciones, eventos y ajustes.
- Envío manual, pausa/reactivación del bot y handoff al vendedor.
- Agente con herramientas deterministas, Contífico y generación de PDF.
- Cotizador real con opciones, comparación y cotización final.
- Frontend completo de Inbox, Kanban, chat, métricas y cotizador.
- Contrato `DataSource` preparado para reemplazar `MockSource` por `RealSource`.

Lo que todavía es demostración:

- Inbox, Kanban, chat y feed consumen únicamente `MockSource`.
- Las etapas del frontend no coinciden con las del backend.
- La serie de 14 días y el tiempo de respuesta son valores simulados.
- No existe autenticación real de usuarios; `ADMIN_KEY` es una clave compartida.
- No se registran estados `sent`, `delivered`, `read` y `failed` de Meta.
- No hay prompts, herramientas ni políticas versionadas por etapa.
- Los envíos no pasan por una cola durable ni por un outbox idempotente.
- Solo nueve diseños tienen fotografía verificada.

## 2. Decisión de arquitectura

Se mantiene un monolito modular:

```text
WhatsApp Cloud API
        ↓
Webhook: validar, persistir y responder rápido
        ↓
Postgres + cola durable
        ↓
Agente + herramientas deterministas
        ↓
Outbox: texto / opciones / comparación / PDF
        ↓
WhatsApp Cloud API + estados de entrega
        ↓
Postgres + eventos SSE
        ↓
React Showroom GP
   ├── MockSource: demo
   └── RealSource: producto real
```

No se crean microservicios ni un segundo frontend. Express sirve API y React
desde el mismo origen. El diseño, componentes y rutas son compartidos; solo
cambia la fuente de datos y la autorización.

## 3. Pipeline comercial propuesto

1. `nuevo`
2. `medida_confirmada`
3. `seleccionando`
4. `cotizacion_enviada`
5. `handoff_visita`
6. `ganado`
7. `perdido`

Reglas invariantes:

- Opciones usa todos los productos visibles/elegibles para la medida.
- Comparación exige 2–3 modelos diferentes y no suma alternativas.
- Cotización exige un modelo decidido y una cantidad de 1–8.
- Cada transición registra etapa anterior, nueva etapa, actor y motivo.
- Las reglas de precio, stock, IVA y herramientas no son editables mediante
  prompts.
- Un cambio de etapa toma el prompt publicado de esa etapa desde el siguiente
  turno.

## 4. Fases y gates

### Fase 0 — Limpiar el Hub y congelar el baseline

Duración estimada: 0,5–1 día.

Trabajo:

- Dejar Showroom GP como el único demo visible en el Hub.
- Retirar enlaces a los cuatro builds visuales anteriores y a la galería de
  nueve estilos.
- Mantener una sola entrada “Demo” y preparar una entrada “Producto real”.
- Conservar los builds históricos únicamente en Git hasta confirmar su borrado.
- Registrar baseline de tests, builds, esquema y endpoints.
- Definir configuración explícita `demo | real`; eliminar el botón que mezcla
  datos simulados dentro del producto real.

Gate:

- El Hub no ofrece frontends obsoletos.
- El demo actual sigue funcionando completo.
- El modo real no puede cargar fixtures por accidente.

### Fase 1 — Catálogo visual con cobertura total

Duración estimada: 2–5 días, dependiendo del número de diseños únicos.

Trabajo:

- Extraer de Contífico todos los pares únicos `marca + diseño`.
- Crear `product_media` con fuente, archivo, derechos, hash y estado de revisión.
- Reutilizar una fotografía por diseño para todas sus medidas.
- Buscar primero en fabricante oficial, después en distribuidor autorizado y
  usar buscadores solo para descubrir la fuente original.
- Descargar, optimizar y guardar las imágenes en almacenamiento propio.
- Rechazar matches aproximados: una KR20 nunca puede mostrar una KR203.
- Crear una pantalla de revisión de medios y un reporte de faltantes.

Gate:

- 100% de los diseños activos tiene fotografía verificada.
- Ningún PDF o imagen de WhatsApp depende de hotlinks.
- Cada archivo conserva URL de origen y estado de derechos.
- La aplicación nunca sustituye una llanta por la foto de otro modelo.

### Fase 2 — Esquema de datos y migraciones formales

Duración estimada: 1–2 días.

Tablas nuevas o ampliadas:

- `businesses`, aunque al inicio exista solo Depot Tire.
- `users`, `sessions` y roles `owner | manager | seller`.
- `pipeline_stages` y `stage_transitions`.
- `stage_prompt_versions`.
- `conversation_notes`, asignación y cierre.
- Extensión de `messages` con dirección, tipo, autor, JSON del proveedor,
  estado y timestamps de entrega.
- `message_status_events`.
- `ai_runs` para etapa, prompt, modelo, latencia, tokens, herramientas y error.
- `quote_artifacts` para opciones, comparación y cotización.
- `audit_events`.

Gate:

- Migración reversible probada sobre una copia/snapshot.
- Las conversaciones existentes quedan legibles.
- Frontend y backend importan el mismo conjunto canónico de etapas.
- Todas las tablas sensibles quedan asociadas a `business_id`.

### Fase 3 — Autenticación y Account Settings

Duración estimada: 1,5–2,5 días.

Trabajo:

- Reemplazar `ADMIN_KEY` por login, cookie `HttpOnly`, sesiones revocables y
  protección CSRF.
- Al pulsar el logo `DT`, abrir Account Settings.
- Secciones recomendadas:
  - Perfil, negocio, locales, horario y alertas.
  - Usuarios, roles y sesiones activas.
  - WhatsApp: estado de conexión y número, sin mostrar secretos.
  - Pipeline y automatizaciones.
  - IA global y configuración por etapa.
  - Catálogo, reglas de stock, precios e IVA.
  - Seguridad, auditoría y exportación.

Gate:

- Un vendedor no puede editar prompts, precios o usuarios.
- Ningún token llega al navegador.
- Cerrar una sesión la invalida inmediatamente.
- Cambios críticos quedan auditados.

### Fase 4 — Backend operativo y tiempo real

Duración estimada: 2–3 días.

Trabajo:

- Implementar endpoints reales para tickets, mensajes, notas, lectura,
  asignación, etapas, cierre y reapertura.
- Implementar `RealSource` en React.
- Añadir SSE con cursor/reconexión para tickets, mensajes, estados y feed.
- Añadir `LISTEN/NOTIFY` para soportar más de una instancia.
- Mantener polling de reconciliación como red de seguridad.
- Dejar `MockSource` exclusivamente para `/demo`.

Gate:

- Dos navegadores ven el mismo movimiento del Kanban sin refrescar.
- Abrir un ticket marca leído de forma real.
- Un mensaje recibido aparece en Inbox y chat.
- Notas, asignaciones y cierres sobreviven recargas.

### Fase 5 — Webhook durable, outbox y estados de Meta

Duración estimada: 2–4 días.

Trabajo:

- Persistir el webhook y responder a Meta antes de llamar al modelo.
- Procesar mensajes mediante una cola Postgres.
- Crear outbox idempotente para texto, documento y media.
- Consumir webhooks de status: enviado, entregado, leído y fallido.
- Registrar reintentos, errores sanitizados y correlación extremo a extremo.
- Preparar templates aprobados para conversaciones fuera de la ventana
  permitida por WhatsApp.
- Añadir logs estructurados con redacción de teléfonos y secretos.

Gate:

- Un webhook duplicado no genera dos respuestas.
- Reiniciar el proceso no pierde el mensaje pendiente.
- Un PDF queda visible como mensaje documental con su estado.
- Un error de Meta es visible y reintentable desde el Hub.

### Fase 6 — Motor de etapas y configuración IA

Duración estimada: 2–3 días.

Por cada etapa se configura:

- Objetivo y prompt editable.
- Condiciones para avanzar.
- Herramientas permitidas.
- Acciones automáticas al entrar.
- Necesidad de aprobación humana.
- Modelo, estilo y longitud.
- Fallback y condiciones de handoff.
- Tiempo sin respuesta y seguimiento.

El prompt se construye por capas:

```text
reglas invariantes
+ configuración global
+ prompt publicado de la etapa
+ datos actuales del ticket
+ historial reciente
+ políticas de herramientas
```

Versionado:

- `borrador → probar → evaluar → publicar`.
- Restauración de una versión anterior.
- Historial de autor y cambios.
- Simulador con conversaciones anonimizadas.

Gate:

- Editar un prompt no puede cambiar precios ni el contrato de las tools.
- Una versión no se publica si falla los casos mínimos de regresión.
- Cada respuesta registra etapa y versión del prompt.
- Restaurar una versión reproduce el comportamiento anterior.

### Fase 7 — Flujo comercial del bot y PDFs

Duración estimada: 2–3 días.

Automatización recomendada:

- Al confirmar medida: enviar opciones reales y mover a `seleccionando`.
- Si el cliente reduce la elección a 2–3 modelos: permanecer en
  `seleccionando` y generar la comparación dentro de esa misma sección de la
  conversación.
- Solo después de confirmar un modelo y cantidad: enviar PDF final y mover a
  `cotizacion_enviada`.
- Si confirma visita/compra o pide humano: handoff y alerta.

Trabajo adicional:

- Guardar cada artefacto y productos incluidos.
- Ver opciones, comparación y cotización desde la ficha del ticket.
- Reenviar o descargar desde el Hub.
- Permitir que un vendedor prepare el artefacto desde el cotizador y lo adjunte
  a una conversación.

Gate:

- El bot nunca cotiza tres alternativas como una compra.
- El Hub y el bot producen el mismo precio, stock y PDF.
- Cada artefacto queda relacionado con conversación, etapa y mensaje de Meta.

### Fase 8 — Métricas reales

Duración estimada: 1–2 días.

Métricas calculadas desde SQL/eventos:

- Conversaciones nuevas por día.
- Mediana y p90 de primera respuesta.
- Tiempo por etapa.
- Opciones → comparación → cotización → visita → ganado.
- Valor cotizado, ganado y en pipeline.
- Mensajes enviados, entregados, leídos y fallidos.
- Handoffs y reactivaciones.
- Medidas, marcas y modelos más solicitados.
- PDFs y comparaciones enviados.
- Latencia, tokens, errores y coste del agente.
- Conversión por versión de prompt.

Gate:

- No queda ninguna serie ni KPI hardcodeado.
- Las métricas coinciden con consultas SQL de control.
- Filtros de fecha, etapa y vendedor dan resultados reproducibles.

### Fase 9 — Evals y optimización de prompts

Duración estimada: 1,5–3 días para el sistema inicial.

Trabajo:

- Crear casos anonimizados para medida, opciones, comparación, cotización,
  stock agotado, handoff y seguridad.
- Guardar aprobación/corrección humana desde el Hub.
- Comparar versiones de prompts contra los mismos casos.
- Mostrar score, fallos y diferencia antes de publicar.
- Exportar un dataset limpio para entrenamiento solo si en el futuro existe
  suficiente evidencia.

Decisión vigente:

- En esta etapa “fine tune” significa optimizar prompts con datos y evals.
- No se entrenará un modelo por cada etapa.
- Fine-tuning de pesos se reconsidera únicamente con un dataset etiquetado,
  holdout y mejora demostrable frente al modelo base.

Gate:

- Cada prompt publicado tiene un resultado de evaluación.
- Fallos críticos bloquean publicación.
- Los datasets no contienen teléfonos ni datos personales sin anonimizar.

### Fase 10 — QA real y salida a producción

Duración estimada: 2–3 días.

Matriz mínima con varios teléfonos aprobados:

- Cliente nuevo sin medida.
- Medida exacta con y sin stock.
- Opciones y filtros por marca.
- Comparación de dos y tres modelos.
- Cotización final con cantidad.
- PDF enviado, entregado y leído.
- Handoff bot → vendedor → bot.
- Movimiento manual y automático de etapas.
- Reinicio del servidor con mensajes pendientes.
- Error de Contífico, OpenAI y Meta.
- Ventana de WhatsApp cerrada.
- Sesiones y roles de administración.

Gate final:

- Tests, typecheck y builds verdes.
- Backup/snapshot realizado.
- Pruebas reales desde al menos tres teléfonos.
- Cero secretos en Git, logs o frontend.
- Rollback documentado.
- Métricas y auditoría activas.

## 5. Entregas

### Beta operativa

Fases 0, 2, 3, 4, 6, 7 y métricas esenciales de la Fase 8.

Estimación: 8–12 días laborables después de resolver accesos y decisiones.

### Producción endurecida

Fases 1, 5, 8 completa, 9 y 10.

Estimación total: 14–24 días laborables, condicionada por fotografías,
templates de Meta, datos existentes y pruebas con números aprobados.

## 6. Dependencias externas

- Variables válidas en Railway para Meta, OpenAI, Contífico y Postgres.
- Token permanente y Phone Number ID correctos.
- Números de prueba autorizados o número comercial migrado.
- Acceso de migración y backup a la base de producción.
- Templates aprobados si se harán seguimientos fuera de la ventana permitida.
- Confirmación de permiso comercial para las fotografías.
