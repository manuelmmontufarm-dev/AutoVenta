# Inventario funcional del Hub — lo que el rediseño NO puede perder

Esto es un **contrato**, no una descripción. Cada línea es algo que hoy funciona
en `hub/`. Lo que está marcado **SE VA** o **SE MUEVE** son decisiones del
24-sep-2026 (ver `DESIGN.md` Parte II, §17). **Todo lo demás tiene que seguir
funcionando igual.** Si algo no marcado desaparece o cambia de comportamiento,
el rediseño está mal, por lindo que se vea.

Regla de lectura: fuera de lo marcado, el rediseño cambia **cómo se ve y cómo se
recorre**. No cambia qué hace, qué datos muestra, ni de dónde salen.

---

## 0. Armazón (`App.tsx`, `router.ts`, `store.ts`)

- Ruteo por hash: `#/inbox`, `#/opportunities`, `#/pipeline`, `#/cotizador`,
  `#/dashboard`, `#/ajustes`, `#/settings`, `#/ticket/:id`. **Las URLs no cambian.**
- Navegación: **SE REDUCE** a 4 entradas (Inbox, Pipeline, Cotizador, Métricas)
  más Ajustes como engranaje. La ruta `#/opportunities` **SE VA**.
- **Fases**: Cotizador y Métricas sólo existen con `fase3`. Inbox, Pipeline y
  Ajustes son núcleo y están siempre. `fase4` queda sin pantalla.
- **Permisos por usuario** (`verInbox`, `verOportunidades`, `verKanban`,
  `usarCotizador`, `verMetricas`, `verAjustes`): quien no lo tiene no ve la
  pestaña **ni entra por URL**. Las dos puertas, no una.
- **Modo demo / real** (`dataMode`, `toggleDemo`): el demo usa fixtures y no
  pide clave. El real exige clave y puede caer en `clave-invalida` o
  `sin-conexion` → `ConnectionGate` bloquea la app.
- Estado del bot (`power`): encendido/apagado visible y accionable desde el armazón.
- Chip de conexión, chip de usuario, botón de salir, `VersionBadge`.
- **Sonido**: interruptor visible, persistido en `localStorage`
  (`autoventa_sound_enabled`), compartido entre pantallas.
- **Tour**: **SE RECORTA** a la primera conexión únicamente. `TourButton` **SE VA**.
- Toasts y confeti (`overlays.tsx`).

## 1. Inbox (`Inbox.tsx`)

- Buscador por nombre, medida o vehículo.
- Filtros Abiertos / Cerrados / Todos: **SE VAN**. Filtro "Alertas del bot": **SE VA**.
  Queda una sola lista, ordenada por lo que exige acción primero.
- Lista de conversaciones con avatar, etapa, cierre, quién atiende (bot/humano),
  medida y último mensaje.
- Estado vacío: uno solo, verdadero (sin conversaciones / sin resultados de búsqueda).

## 2. Conversación (`TicketDetail.tsx`, `chat.tsx`)

- Hilo completo de WhatsApp con burbujas entrante/saliente, hora, doble check,
  notas internas, PDFs adjuntos y burbuja de "escribiendo".
- **Tomar el chat / devolvérselo al bot** en un toque, con el estado siempre legible.
- Ventana de 24 h: más allá, "histórico, solo tú puedes responder".
- Compositor con envío por Enter.
- Notas internas.
- **Ofrecer descuento**: campo, condición, confirmar, ajustar, y el aviso de que
  requiere plantilla. Los errores (`No se pudo crear la oferta.`) son parte del flujo.
- Cierre del ticket con motivo: vino y compró / no compró (con razón) / se enfrió.
- Modal de cotización, ver PDF.
- Ficha lateral: vehículo, medida, comparación registrada, compromiso registrado.

## 3. Pipeline (`Pipeline.tsx`)

- **CAMBIA DE FORMA**: la barra de etapas (embudo) es la cabecera; debajo de cada
  etapa se ven 3–4 tarjetas sin hacer clic, y si hay más se desplaza dentro de la
  caja. El arrastre (`@dnd-kit`) se conserva. Ya no son dos vistas separadas.
- Etapas: nuevo, medidas, cotizado, ubicación, visita. Cierres: ganado, perdido,
  sin respuesta.
- Mover de etapa por arrastre y por menú.
- Filtro por mes, con el aviso explícito de que el filtro está escondiendo
  abiertos ("siguen abiertos").
- Bloques operativos: "Atención ahora", "Programados para hoy", "Próximos envíos
  en orden de tiempo", "Clientes que dijeron cuándo irían", "Casos que necesitan
  revisión técnica", "Cancelados o fallidos".
- "Poner tarjetas al día", copiar mensaje, editar mensaje, enviar.
- Estados vacíos que afirman algo ("Todo al día"), no que se disculpan.

## 4. Oportunidades (`Opportunities.tsx`) — **SE VA ENTERA**

Incluida la baraja `SwipeReview` («Revisar uno por uno»). Se borran la pantalla,
el componente, la ruta y la entrada de navegación. Lo que ordenaba ya vive en
Inbox y Pipeline.

## 5. Cotizador (`Cotizador.tsx`)

Es la pantalla más cargada y la que más fácil se rompe. Todo esto sigue:

- Búsqueda por medida, código, marca o diseño, contra Contífico real.
- Disponibilidad real: Disponible / Agotada.
- Comparación de **hasta tres** modelos, con el aviso al pasarse.
- Salidas: copiar cotización, copiar comparativa, copiar mensaje para cliente
  final, copiar mensaje para distribuidor.
- Descargas: PDF de cotización, PDF comparativo, imagen de cotización, imagen
  comparativa, imagen de opciones filtradas, guardar imagen para WhatsApp.
- Nombre de cliente opcional en la cotización.
- Exige clave de administración (`AdminKeyRequired`).
- **Las imágenes y PDFs generados son piezas de marca que salen al cliente por
  WhatsApp.** Si el rediseño cambia la identidad, estas piezas se rediseñan con
  ella; no pueden quedar con el estilo viejo.

## 6. Métricas (`Dashboard.tsx`, `charts.tsx`)

- Conversaciones abiertas, en juego (pipeline abierto), conversión, promedio
  hasta respuesta.
- Cotizaciones: enviadas, con descuento, con fotografía, conversión con descuento,
  confirmadas como venta, cotizado → seguimiento.
- Plantillas: en cola, enviados, entregados, leídos, fallidos, programados,
  cancelados por respuesta, opt-outs.
- Productos: disponibles, agotados, cobertura visual.
- Clientes molestos, errores del bot.
- Gráficos: los datos se conservan todos. **La forma cambia** (DESIGN.md §17):
  «Conversaciones por día» y «¿A qué hora contestan más?» con ejes X/Y rotulados
  y valor exacto al pasar el cursor; **cada sección** con al menos un gráfico así.
  `Sparkline`, `DonutChart` y `useCountUp` **SE VAN**.

## 7. Ajustes (`Ajustes.tsx`) y Configuración técnica (`Settings.tsx`)

- Ajustes: negocio, sucursales (Cumbayá…), horario, avisos, alertas del bot,
  usuarios y permisos (crear, editar, borrar), roles Administrador/Asesor,
  selector de tema y de tipografía, cifras de venta.
- Ajustes **RECIBE** desde Settings: Negocio (sucursales, horario), Horarios de
  seguimiento (zona horaria, inicio, fin, días) y los tiempos de seguimiento
  (primer retraso, antes del cierre, separación mínima, días con plantilla, hora
  diaria, recomendar cierre, habilitado por etapa).
- Settings **QUEDA CON**: conexión de WhatsApp (`WhatsAppSetup`), encender/apagar
  el bot, y «Manual base del bot». **SE VA** «IA por etapa». **SE MUEVEN**
  Seguimientos y Negocio. **SE DESCARTA** todo lo demás de esa pantalla.
- Cada guardado tiene su estado de error propio y dicho en cristiano
  ("No se pudo guardar", "No se pudo publicar"). **No se sustituyen por un toast genérico.**
- `BillingSection`, `WhatsAppSetup`, `AdminKeyForm`, `LoginForm`.

---

## Lo que sí puede morir

Para que quede claro qué es funcionalidad y qué es decoración heredada:

- `RacingDetails` (autos, llantas y circuitos de fondo) es decoración. Puede irse entero.
- El `useCountUp` de las cifras es decoración y además es un tell de IA. Puede irse.
- El confeti es decoración. Se discute; no es funcionalidad.
- Los cuatro temas alternativos (`racing`, `showroom`, `showroom-gp`, `neobrutalista`)
  son deuda: el rediseño deja **un** mundo visual. El selector de tema en Ajustes
  se decide aparte (ver la pregunta abierta en el prompt).
- `Opportunities.tsx`, `swipe-review.tsx`, `TourButton`, `Sparkline`, `DonutChart`,
  `useCountUp`, la pestaña «IA por etapa»: se borran, con sus pruebas.

## Lo que se decidió al construir (25-sep-2026)

- `FollowUpsView` y sus grupos («Atención ahora», «Programados para hoy»…) eran
  código muerto dentro de `Pipeline.tsx`: estaban definidos pero ninguna vista los
  dibujaba. Se borraron con Oportunidades.
- La vista «Embudo» del Pipeline se fue porque Métricas ya dibuja el mismo embudo
  del servidor; no se perdió el dato.
- Configuración técnica conserva un cuarto bloque chico, «Conexión del panel»
  (la clave administrativa): es adonde lleva el chip de conexión del rail y la
  única salida cuando el login de usuarios no está disponible.
- Los permisos «Oportunidades» y «Alertas del bot» dejaron de mostrarse en
  Ajustes → Usuarios (las pantallas no existen); las llaves siguen en el dato.
- El selector de «tema» que había en Ajustes → Piezas es de las piezas que salen
  por WhatsApp (paleta, fuente, plantilla), no del Hub. Se queda tal cual.
- El confeti al ganar una venta se queda (pregunta 2 del prompt, sin respuesta).
