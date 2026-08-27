# Bitácora AutoVenta

> **Qué es esto:** el registro cronológico de TODO lo que se hace en el proyecto.
> Cada commit tiene su entrada: qué cambió, **por qué**, y cuánto tiempo tomó.
> Sirve para que cualquier sesión de chat (o cualquier persona) lea esto primero
> y esté al día sin tener que reconstruir el contexto desde cero.

---

## 📌 Reglas (obligatorio)

1. **Cada commit añade una entrada nueva aquí**, arriba de todo (más reciente primero).
2. La entrada lleva: **fecha**, **qué se hizo**, **por qué se hizo**, y **horas estimadas**.
3. El "por qué" es lo más importante — el "qué" ya está en el diff; el "por qué" no.
4. Esto está **forzado por un git hook**: si intentas commitear sin tocar `BITACORA.md`,
   el commit se bloquea (ver más abajo cómo activarlo). Para saltarlo en un caso
   excepcional: `git commit --no-verify`.

### Cómo activar el hook (una sola vez por clon del repo)
```bash
git config core.hooksPath .githooks
```
Después de esto, cada `git commit` verifica que `BITACORA.md` esté en el commit.
Ya viene activado en este equipo.

---

## ⏱️ Resumen de horas (para las cuentas)

> Estimados de **tiempo humano invertido** (dirigir, revisar, probar, decidir) — no reloj de pared.
> Ajustables. Actualizar el total al añadir cada entrada.

| Fecha | Commit | Tema | Horas |
|---|---|---|---|
| 2026-08-27 | _(este mismo)_ | La cantidad en grande en la pieza, y ningún turno con cotización cierra sin pedir el local o el día | 1.5 |
| 2026-08-27 | _(este mismo)_ | «Deme solo 3»: cambiar la cantidad manda la pieza nueva, y las tres fallas que salieron con ella (el «2» del menú, «al de quito», la pregunta corta del local) | 2.5 |
| 2026-08-26 | _(este mismo)_ | Las preguntas de más se quitan con candado: pedírselo al guardián no alcanzó (marcó la falta y la repitió en su corrección) | 0.75 |
| 2026-08-26 | _(este mismo)_ | El cierre después de cotizar: dos mensajes en vez de uno, el monto del descuento a la vista, y no se ofrece ni se pregunta lo que no hace falta | 2.0 |
| 2026-08-26 | _(este mismo)_ | La cotización de otra medida: la compra de hace dos semanas dejó de firmar la de hoy, y la foto habla sola | 3.0 |
| 2026-08-26 | _(este mismo)_ | El «juebes» que costó una visita: los días se leen por sonido, el bot escribe lo que promete, y el seguimiento confirma en vez de repreguntar | 4.0 |
| 2026-08-26 | _(este mismo)_ | Cruce de facturación Contífico: llave nueva, segunda señal (SKU + día de visita) y las sucursales con nombre | 2.5 |
| 2026-08-26 | _(este mismo)_ | El aviso de stock corto deja de morirse en el turno en que nace: viaja pegado a la cotización por las tres puertas | 2.0 |
| 2026-08-26 | _(este mismo)_ | El simulador: un WhatsApp de mentira contra el bot de verdad, para reproducir un caso las veces que haga falta | 3.0 |
| 2026-08-26 | _(este mismo)_ | El cierre nuevo no promete «su medida» cuando las opciones son equivalentes (lo cazó el guardián el día del deploy) | 0.5 |
| 2026-08-26 | _(este mismo)_ | Candado: el «2» del menú de preferencia ya no se cotiza como 2 unidades — juego de 4 con aclaración horneada | 0.5 |
| 2026-08-26 | _(este mismo)_ | Prueba en vivo caza al guardián leyendo ciclos viejos («mañana por Quito Sur» que nadie dijo) + «una A/T» ya no es cantidad 1 | 0.5 |
| 2026-08-26 | _(este mismo)_ | El texto de cierre DE JOAQUÍN (menú 1/2/3) entra al bot, «Vlle de los chillos» resuelve a Quito Sur, y el beneficio 1 ya nombra alineación y balanceo | 0.75 |
| 2026-08-26 | _(este mismo)_ | Sprint final de la reunión del 25-ago: revisión de los 3 PRs (4 bloqueantes cazados), merges S1→S3→S2 verificados en vivo y cupón del 2 % encendido | 1.0 |
| 2026-08-25 | _(este mismo)_ | Revisión del sprint final: agotada en su medida ya no esconde las equivalentes vendibles | 0.25 |
| 2026-08-25 | _(este mismo)_ | Su medida le gana al aro (la A/T de otra medida teniendo la suya en stock) + cotizar más de lo que hay ahora avisa | 1.5 |
| 2026-08-25 | _(este mismo)_ | Revisión del sprint final: la IA del seguimiento ya no ve (ni puede mutilar) los links de Maps | 0.25 |
| 2026-08-25 | _(este mismo)_ | La ubicación deja de esperar el pin: los links van con la pregunta, el seguimiento los repite y «al sur» ya registra el local | 1.5 |
| 2026-08-25 | _(este mismo)_ | Revisión del sprint final: el INCLUYE tampoco se duplica en la cotización, y el motivo ya no cruza de llanta | 0.25 |
| 2026-08-25 | _(este mismo)_ | Cierre por preferencia (precio/equilibrada/premium), INCLUYE una sola vez y resaltado, beneficios como hechos, y las dos familias del guardián (S2 reunión Joaquín) | 3.0 |
| 2026-08-25 | _(este mismo)_ | «Les molesto» dejó de ser un cliente enojado: en Ecuador es cortesía para anunciar la visita, y el falso positivo pausaba el hilo para siempre | 0.5 |
| 2026-08-23 | _(este mismo)_ | Depot Tire caído desde el 20-ago: un ECONNRESET de Postgres en el panel mataba el proceso; salvavidas de unhandledRejection en HTTP y worker + redeploy | 0.5 |
| 2026-08-21 | _(este mismo)_ | Tour interactivo del hub para usuarios nuevos, filtrado por permisos | 1.5 |
| 2026-08-20 | 5b0ed4a | Clave propia obligatoria + email en el primer ingreso de usuarios nuevos; restablecer desde Ajustes | 2.0 |
| 2026-08-20 | ed7957d | Ajustes en pestañas + matriz de avisos por nivel + usuarios del panel editables (reunión Andrés) | 3.0 |
| 2026-08-20 | _(este mismo)_ | Línea base del guardián y seguimiento programado (medir, no adivinar) | 0.25 |
| 2026-08-20 | _(este mismo)_ | Las 170 correcciones del guardián, atacadas por familia en su causa raíz | 1.5 |
| 2026-08-20 | _(este mismo)_ | Caso Eulalia: cotizar deja de preguntar el nombre («¿cliente final?») y «ayúdeme» es un sí | 0.5 |
| 2026-08-18 | _(este mismo)_ | La ubicación se manda como link de Maps + el seguimiento deja de repreguntar la visita ya agendada | 1.5 |
| 2026-08-16 | _(este mismo)_ | El reporte deja de creerse el acuse de Meta (aceptar no es entregar) | 1.0 |
| 2026-08-16 | _(este mismo)_ | La pieza de opciones y la cotización dicen el precio del Interbot, las dos | 0.5 |
| 2026-08-16 | _(este mismo)_ | El sello de la equivalente advierte en ámbar, ya no rechaza en rojo | 0.75 |
| 2026-08-16 | _(este mismo)_ | Auditoría (2/2): el precio que se lee y el que se firma son el mismo | 2.0 |
| 2026-08-16 | _(este mismo)_ | Auditoría: ningún turno se queda sin respuesta, y el caché del prompt vuelve a servir | 3.0 |
| 2026-08-16 | _(este mismo)_ | Fuera los emojis de la interfaz: el panel deja de leerse como generado | 2.0 |
| 2026-08-16 | _(este mismo)_ | El botón de salir baja con los tabs, con icono y borde | 0.25 |
| 2026-08-16 | _(este mismo)_ | Entrar con usuario daba 401 en todo el panel: las 4 pantallas mandaban la clave vieja, no el token | 0.5 |
| 2026-08-15 | _(este mismo)_ | El código en todos los avisos de visita, verificar antes de canjear, y el botón de salir que faltaba | 1.0 |
| 2026-08-15 | _(este mismo)_ | Cupón DT-PUMA47 completo y apagado + el panel servido llevaba un día atrasado + número de venta roto | 2.5 |
| 2026-08-15 | _(este mismo)_ | Notas del guardián de raíz: formato único de plata, corrector de precios gratis y local sin re-pregunta | 1.5 |
| 2026-08-15 | _(este mismo)_ | Login con usuarios y clave + base de permisos, y el Cotizador deja de dibujar sus propias piezas | 2.5 |
| 2026-08-14 | _(este mismo)_ | Cuenta de tokens en el tab KPI: gasto día/semana/mes + IVA, vence el primer viernes, pagos con clave de dueño | 1.5 |
| 2026-08-14 | _(este mismo)_ | Sello de medida en las opciones: MEDIDA EXACTA en verde, equivalentes en rojo | 1.0 |
| 2026-08-14 | _(este mismo)_ | Búsqueda en escalera + 6 familias de SKUs que estaban SIN medida (invisibles) | 2.0 |
| 2026-08-14 | _(este mismo)_ | La medida se decodifica PRIMERO y manda como filtro en la búsqueda | 1.0 |
| 2026-08-14 | _(este mismo)_ | «at4» ya encuentra la A/T4W + el guardián ve las herramientas del turno | 1.5 |
| 2026-08-13 | _(este mismo)_ | El Ángel Guardián: revisión IA de cada respuesta antes de enviarla, con interruptor en Ajustes | 2.0 |
| 2026-08-13 | _(este mismo)_ | Candado de medida: el bot firmó una cotización de otra medida, $82,84 por debajo | 1.5 |
| 2026-08-13 | _(este mismo)_ | Revisión contextual diaria: skill + corrida del 13-ago (102 hallazgos, 8 chats mudos por handoff) | 2.5 |
| 2026-08-13 | _(este mismo)_ | Conocimiento del negocio al bot (marcas/vehículos/escalera) + «al sur» ya registra Quito Sur | 2.5 |
| 2026-08-13 | _(este mismo)_ | Garantías e INCLUIDO en grande en la cotización + paleta «Depot Tire rojo» | 1.0 |
| 2026-08-12 | _(este mismo)_ | El logo real de Depot Tire en todas las piezas + la paleta del sitio (fondo blanco) | 1.5 |
| 2026-08-12 | _(este mismo)_ | Precios: barrido semanal + botón «Actualizar ahora». Horarios: casos especiales por local | 2.5 |
| 2026-08-12 | _(este mismo)_ | El barrido del Interbot pasa a una sola pasada diaria a las 6 de la mañana | 0.5 |
| 2026-08-12 | _(este mismo)_ | El sync dejó de barrer el Interbot 15.000 veces al día; la cotización pregunta por medida | 1.5 |
| 2026-08-12 | _(este mismo)_ | Una sola pregunta de ubicación + los dos mapas al confirmar · y el cruce con Contífico da 0 de 61 | 2.0 |
| 2026-08-11 | _(este mismo)_ | El sync de precios del Interbot llevaba 4 días muerto por media cookie | 1.5 |
| 2026-08-10 | _(este mismo)_ | Reporte: botón «abrir chat» en toda fila + plata en juego arriba | 0.25 |
| 2026-08-10 | _(este mismo)_ | El reporte diario cuenta el día, no el arrastre histórico (medido contra la base de Depot) | 0.5 |
| 2026-08-10 | _(este mismo)_ | Reporte diario 20:00 a los asesores (PDF con links) + el tab de errores solo con errores | 3.0 |
| 2026-08-09 | _(este mismo)_ | El panel sobrevive a Railway degradado: reintentos, carga por partes y fases recordadas | 1.5 |
| 2026-08-09 | _(este mismo)_ | PWA instalable (sin barra de Safari) + composer pegado al teclado | 0.5 |
| 2026-08-09 | _(este mismo)_ | Chat de baraja calzado al teclado de iPhone + decidir desde el chat + kanban móvil por botón | 1.5 |
| 2026-08-09 | _(este mismo)_ | Chat de la baraja a pantalla completa + fix del zoom fantasma en móvil | 1.0 |
| 2026-08-09 | _(este mismo)_ | Oportunidades reorganizado: cuadrícula de cotizados, baraja swipe y "Para después" + 6 tabs en móvil | 3.0 |
| 2026-08-09 | _(este mismo)_ | Auditoría domingo: costo unitario baja, pero precio→cotización cae | 1.0 |
| 2026-08-09 | _(este mismo)_ | Cotización sin eco: INCLUYE una vez y texto reducido a modelo + total | 0.5 |
| 2026-08-09 | _(este mismo)_ | Primer saludo inteligente: medida primero, pero también vehículo, aro y uso | 0.5 |
| 2026-08-09 | _(este mismo)_ | La fecha se confirma una vez: sin repetir día, local ni descuento | 0.5 |
| 2026-08-09 | _(este mismo)_ | Hotfix GPT-5.5: tools requieren reasoning none en Chat Completions | 0.5 |
| 2026-08-09 | _(este mismo)_ | Modalidad eficiente: cumple piezas pedidas, recuerda visita y reduce llamadas sin bajar GPT-5.5 | 4.0 |
| 2026-08-08 | _(este mismo)_ | El primer mensaje siempre saluda + el eval deja de medir el bot degradado | 2.0 |
| 2026-08-08 | _(este mismo)_ | Seguimiento y cotización vuelven a poder mostrar llantas (ticket 2150) | 1.5 |
| 2026-08-08 | _(este mismo)_ | El aro manda: guía visual del costado, dos aros = invitación al local, y fecha+local como meta | 2.0 |
| 2026-08-08 | _(este mismo)_ | Los que confirman fecha salen en Oportunidades, en grupo propio | 0.5 |
| 2026-08-08 | _(este mismo)_ | El bot dejó de redactar lo que no puede enviar + el panel dice la verdad del envío | 1.5 |
| 2026-08-08 | _(este mismo)_ | Avisos al asesor: cuando el cliente da la fecha y la víspera de la visita | 1.0 |
| 2026-08-07 | _(este mismo)_ | Métrica de llegada a seguimiento + día de visita en el kanban + por qué faltan mensajes | 2.5 |
| 2026-08-07 | _(este mismo)_ | Escalera de modelos: gpt-5.5 gana midiendo (14 cotizaciones vs 5) + caché verificado | 1.5 |
| 2026-08-07 | _(este mismo)_ | El bot oye, ve, abre links y ya no se queda sin ofrecer + harness de evaluación | 5.0 |
| 2026-08-07 | _(este mismo)_ | Precios reales del Interbot (362 llantas cruzadas: no hay fórmula, se lee el precio) | 2.5 |
| 2026-08-07 | _(este mismo)_ | Lo que el asesor escribe desde WhatsApp ya entra al panel y al historial del bot | 2.0 |
| 2026-08-07 | _(este mismo)_ | El aro solo ya basta: se acabó el «no tengo medida verificada» sin ofrecer nada | 0.5 |
| 2026-08-07 | _(este mismo)_ | Aviso por WhatsApp al asesor cada vez que se prende o apaga el bot, con el motivo | 1.5 |
| 2026-08-06 | _(este mismo)_ | Si no es un NO es un SÍ + leer fotos + candados de opciones + watchdog de bot apagado | 4.0 |
| 2026-08-06 | _(este mismo)_ | Cadena más corta al mandar opciones + llantas grandes en la pieza + la KR50 deja de salir invisible | 1.5 |
| 2026-08-06 | _(este mismo)_ | Favicon como archivo para la tarjeta de Vercel | 0.25 |
| 2026-08-05 | _(este mismo)_ | Línea base publicada + archivado automático de auditorías | 1.0 |
| 2026-08-05 | _(este mismo)_ | Rescate del agente: causa raíz del «problema procesando» | 1.0 |
| 2026-08-05 | _(este mismo)_ | Candado anti-duplicado en generar_cotizacion + censo del historial | 0.5 |
| 2026-08-05 | _(este mismo)_ | Guardián de salida + la auditoría ve las fallas del día clarísimo | 1.5 |
| 2026-08-05 | _(este mismo)_ | VENTA PRIMERO en las 3 capas (tools+DB+prompt) y los casos de Joaquín como pruebas | 2.0 |
| 2026-08-05 | _(este mismo)_ | El bot deja de preguntar y empieza a vender + skill de auditoría | 3.0 |
| 2026-08-05 | _(este mismo)_ | Contador del final del tablero por día + fix del link del asesor | 1.5 |
| 2026-08-05 | _(este mismo)_ | Quitar la camiseta de la TRI de la siembra de beneficios (promo vencida) | 0.25 |
| 2026-08-05 | _(este mismo)_ | Medidas de flotación (venta perdida) + la imagen deja de ser opcional | 1.5 |
| 2026-08-05 | _(este mismo)_ | Tipos de llanta, 3 opciones, piezas en el chat y varios asesores | 2.5 |
| 2026-08-05 | _(este mismo)_ | Dos Kanban por ventana de 24 h, puesta al día del tablero y badge de versión | 2.0 |
| 2026-08-04 | _(este mismo)_ | Piezas nuevas del diseño + tab Ajustes con vista previa en vivo | 4.0 |
| 2026-08-04 | _(este mismo)_ | Tanda 0: la imagen es el mensaje — captions cortos, bloques, INCLUYE y contador de piezas | 3.0 |
| 2026-08-02 | _(este mismo)_ | Plan financiero alineado al acuerdo firmado ($300+$300+$60/mes) | 0.25 |
| 2026-08-02 | a36bb0a | Interruptor del bot: nace apagado, sin fugas y visible en todo el hub | 1.5 |
| 2026-07-31 | _(este mismo)_ | Toast cada 5 s + el diagnóstico ahora pregunta a Meta a dónde entrega | 0.5 |
| 2026-08-01 | _(este mismo)_ | Depot Tire EN VIVO: app propia en su portafolio + playbook de conexión + pendientes | 5.0 |
| 2026-07-31 | _(este mismo)_ | Diagnóstico del canal caído + worker de seguimientos embebido en el HTTP | 0.5 |
| 2026-07-27 | _(este mismo)_ | Calidad comercial, modelo lento, respaldos y latido del worker | 3.0 |
| 2026-07-27 | _(este mismo)_ | Prueba de carga 50 clientes + fix durabilidad del webhook | 4.0 |
| 2026-07-27 | _(este mismo)_ | Fix: botón «Generar» estaba en pantalla muerta (tree-shaken) | 0.5 |
| 2026-07-27 | _(este mismo)_ | Seguimientos perezosos: redactar solo cuando el mensaje va a salir | 1.0 |
| 2026-07-27 | _(este mismo)_ | Ajustes → WhatsApp: conexión guiada con verificación por paso | 1.5 |
| 2026-07-27 | _(este mismo)_ | Hub rediseñado: simple, oscuro, staging + Depot Tire al frente | 0.5 |
| 2026-07-26 | _(este mismo)_ | Gate de conexión: botón Conectar con diagnóstico de clave + chip de estado + token navy | 1.0 |
| 2026-07-20 | _(este mismo)_ | Piezas visuales en TODOS los flujos: opciones como imagen, fitment Prado, PDF con diseño nuevo, /cotizaciones/live.png | 2.0 |
| 2026-07-20 | _(este mismo)_ | Unificación: motor de imágenes sobre el catálogo Contífico (un solo entorno) | 2.0 |
| 2026-07-20 | _(este mismo)_ | Cotizador funcional con inventario Contífico, fotos, tres flujos y bot compartido | 6.0 |
| 2026-07-20 | _(este mismo)_ | Cotizaciones visuales nivel Grupo Inter: motor satori/resvg + comparar_llantas + envío endurecido | 4.0 |
| 2026-07-20 | _(este mismo)_ | Sistema Showroom GP documentado y aplicado a todo el hub | 2.0 |
| 2026-07-18 | _(este mismo)_ | Fix handoff: guardar mensajes del cliente con bot pausado + typing honesto | 0.5 |
| 2026-07-18 | _(este mismo)_ | Racing Heritage aplicado a todo el frontend + hub compacto | 1.0 |
| 2026-07-18 | _(este mismo)_ | Demo del Hub en 4 estilos: temas CSS (showroom/racing/neobrutalista) + deploy | 1.5 |
| 2026-07-18 | _(este mismo)_ | Herramientas de operación en línea: /mensajes, /configuracion/ia, /tester | 2.5 |
| 2026-07-18 | _(este mismo)_ | Deploy en Railway en vivo: root dir, dominio, fix EBUSY del build | 1.0 |
| 2026-07-18 | _(este mismo)_ | Migración del agente de Anthropic a OpenAI GPT | 1.5 |
| 2026-07-18 | _(este mismo)_ | Preparar deploy en Railway (schema al boot, catálogo opcional, railway.toml) | 1.0 |
| 2026-07-17 | _(este mismo)_ | Publicación del hub completo en Vercel | 0.5 |
| 2026-07-17 | _(este mismo)_ | Hub interno centralizado + demo visual + documentación navegable | 2.0 |
| 2026-07-16 | _(este mismo)_ | Respuesta del cliente (audio) + pivote a Contífico + transcripción | 1.0 |
| 2026-07-15 | _(pendiente)_ | Esqueleto Fase 1 del bot (app/) + investigación de reuso GitHub | 5.0 |
| 2026-07-15 | _(pendiente)_ | Webhook (recibir) + setup app Meta en vivo + ngrok + prueba e2e + investigación GitHub + bitácora | 4.0 |
| 2026-07-15 | 6feb1f5 | Simulador: reencuadre "lo que pierdes hoy" | 0.5 |
| 2026-07-15 | abcc2a7 | Empresa confirmada Depot Tire + propuesta en verde/horas | 1.5 |
| 2026-07-15 | c53a059 | Rework propuesta a 5 fases + simulador de ahorro | 2.5 |
| 2026-07-15 | 971c70c | Doc HTML de reunión (fuente del PDF al cliente) | 2.0 |
| 2026-07-15 | 21df44f | wa-tester: leer .env fresco por request | 0.5 |
| 2026-07-14 | e355591 | Herramienta wa-tester (enviar) + guía operativa WhatsApp | 3.0 |
| 2026-07-14 | ac09171 | Ubicaciones de locales + análisis de features del cliente | 1.5 |
| 2026-07-13 | feadf57 | Brief + plan de desarrollo + plan financiero + catálogo | 4.0 |
| 2026-07-13 | d997844 | Commit inicial (repo) | 0.25 |
| | | **TOTAL** | **~117.5 h** |

---

## Entradas (más reciente primero)

### 2026-08-27 · La cantidad se ve, y el cierre no se suelta · ⏱️ 1.5 h

**Qué:** la cantidad de llantas pasa a leerse de un vistazo en la pieza — una
píldora con el número en 32 px junto a la de disponibilidad («3 LLANTAS», antes
«3 unidades cotizadas» en 17 px grises) y la celda CANTIDAD del pie a 38 px,
destacada sobre subtotal e IVA. Y `domain/preguntaPendiente.ts` +
`services/insistirCierre.ts` (nuevos): con una cotización viva, ningún turno se
envía sin pedir lo que falta — primero el local, después el día con su monto de
descuento—, y si el turno ya lo pregunta no se toca. Corre al FINAL, después
del Ángel Guardián, y le hace sitio soltando el bloque más viejo si el turno
venía lleno (`splitBlocks` manda 4 mensajes como máximo y la pregunta se
perdería en silencio). De paso, la ruta de recotización dejó de decidir qué
preguntar: ahora ese dueño es uno solo. 13 pruebas nuevas; la suite queda en 1022.

**Por qué:** Manuel, sobre su chat de prueba: «pondría más grande el número de
llantas en el PDF para que se note más» —es el dato que cambia el total, y
quien pidió 3 tiene que ver 3 sin buscarlo— y «si hago preguntas se desvía la
conversación y no acaba con una pregunta; debería insistir con el local, o si ya
dijo eso, el día, molestando hasta que se respondan». Lo que lo destapó (conv 3
ciclo 8, 21:50): con el local ya dado, el cliente mandó dos preguntas seguidas,
se atendieron en dos turnos, y el segundo cerró con «…más apta que una de calle
para tierra y camino irregular. Si quiere, le dejo la visita en Depot Tire
Cumbayá y el asesor se la confirma en tienda». Sin pregunta: el bot contestó
bien y dejó de vender. El prompt YA lo pedía —«ningún turno posterior a la
cotización cierra sin esa pregunta»— y no alcanzó, que es la historia de toda la
semana; por eso es candado y por eso va después del guardián, que reescribe el
texto entero y puede comerse la pregunta al resumir.

**Probado:** conversación completa en el simulador. El candado se vio disparar
en vivo: en el turno de «solo quiero 3 llantas» el guardián aprobó exactamente
«Listo, se la ajusté a 3 👍» —sin pregunta— y salieron TRES mensajes, el tercero
«¿A cuál de los dos le queda mejor ir? 📍», que solo pudo agregar el candado.
La pieza de 3 llantas se revisó renderizada. En los otros 5 turnos el modelo
preguntó solo y el candado no tocó nada, que es exactamente lo que debe pasar.

### 2026-08-27 · «Deme solo 3» — cinco fallas de la misma familia · ⏱️ 2.5 h

**Qué:** `services/recotizar.ts` (nuevo): una ruta determinística que, cuando el
cliente dice una cantidad distinta a la que tiene cotizada, **genera la pieza
nueva** con la MISMA herramienta del agente (`generar_cotizacion`, no una copia)
y devuelve un acuse corto que no repite lo que la foto ya muestra. Corre antes
de la ruta de visita y antes del agente. Además: el «2» del menú de preferencia
dejó de guardarse como cantidad (`esRespuestaDelMenuDePreferencia`); «al de
quito» / «el de quito» / «quito» se reconocen como Quito Sur cuando acabamos de
preguntar el local; `preguntamosElLocal` reconoce la pregunta corta nueva
(`PREGUNTA_DE_LOCAL`, que ahora vive en el dominio y la usan el que pregunta y
el que reconoce); y contestar el menú de preferencia COTIZA en vez de ofrecer
cotizar. 18 pruebas nuevas; la suite queda en 1009.

**Por qué:** producción, conv 3 ciclo 7. El bot cotizó 4 × FALKEN ZE310R por
$637.96, el cliente escribió «deme solo 3» y el bot contestó «si quiere le
ajusto la cotización al toque»; dijo «dale» y el bot solo anotó «queda anotado
que necesita 3 unidades» y siguió con el local. Nunca salió una pieza por 3, y
cuando el cliente pidió ver lo cotizado le reenviaron la de 4. Manuel: «el
cliente ni sabe cuánto le va a salir con 3 llantas». En los DOS turnos el modelo
no llamó una sola herramienta (`ai_runs`: routine_stage, tools: []). El guardián
sí lo vio —`promesa_incumplible` en alta, la categoría estrenada el día
anterior— pero solo reescribe texto. Cuarta vez esta semana que la conclusión es
la misma: lo que tiene que pasar sí o sí no se le pide al modelo.

Tirando de ese hilo aparecieron cuatro más en la misma conversación, todas de la
familia «el sistema anota algo que el cliente nunca ve, o no anota lo que sí
dijo»: (1) el «2» con que contestó el menú de preferencia quedó guardado como
«quiere 2 llantas» —el candado de la cotización ya lo atajaba, pero el dato mal
anotado lo leen otras cosas, como el filtro de opciones vendibles—; (2) «al de
quito» no se reconocía como local, así que no se registró la sucursal, la
pregunta del día salió sin el monto del descuento y un turno después el bot le
volvió a preguntar a cuál local quería ir; (3) una REGRESIÓN propia del 26-ago:
al partir el cierre en dos mensajes, la pregunta corta dejó de nombrar los
locales y `preguntamosElLocal` —que exige verlos— se apagaba en cuanto algo se
enviaba detrás, porque la ventana son los últimos 3 salientes; (4) contestar el
menú con «2» hacía que el bot OFRECIERA cotizar en vez de cotizar, gastando un
turno para llegar a la misma respuesta.

**Probado:** la conversación entera repetida en el simulador con el stock
fijado. «deme solo 3» produce COT-… por 3 a $463.47 con su foto y el acuse
«Listo, se la ajusté a 3 👍» (ruta `recotizar_cantidad` en `funnel_events`, no
el modelo); «al de quito» registra *Depot Tire Quito Sur* y pide el día con
«*25 %* de descuento, *$154.47* menos» —el ahorro recalculado sobre la
cotización de 3, verificado contra sus `items`—; y las 5 revisiones del guardián
salieron `aprobar` con cero hallazgos, sin un solo `estado_desincronizado`.

### 2026-08-26 · Las preguntas de más, con candado y no con prompt · ⏱️ 0.75 h

**Qué:** `domain/preguntasProhibidas.ts` (nuevo) quita del texto ya revisado las
preguntas que le cuestan un turno a la venta y no cambian la respuesta:
«¿cuántas llantas necesita?», «¿se la cotizo por 4?», «¿a nombre de quién?»,
«¿cliente final?». Corre al final de la cadena —después del Ángel Guardián,
junto al aviso de stock y los números de cotización— y deja alerta
`pregunta_de_mas` cuando dispara, para poder medir cuántas veces pasa. Recorta
la ORACIÓN, no el mensaje, y si un bloque queda vacío desaparece.

**Por qué:** porque pedírselo al guardián NO alcanzó, y está medido. Con la
regla ya puesta en su rúbrica se le dieron sus propios borradores en el
simulador y el resultado fue: ante «¿Cuántas llantas necesita?» marcó la falta
en ALTA —«no se debe preguntar cuántas llantas necesita»— y su corrección
terminó con «¿Cuántas llantas desea llevar?»; ante «¿A nombre de quién…?» la
dejó entera. Dos de dos. El vendedor sí obedece (en las conversaciones
completas del simulador cotiza 4 de una), pero el guardián es la ÚLTIMA mano
que toca el texto y a esta familia no la respeta. Es la tercera vez en dos días
que el guardián resulta ser el autor del problema —los `COT-`, el ahorro
borrado, y ahora esto—: lo que tiene que ser cierto sí o sí no se le pide a un
modelo, se le pone un candado detrás.

**Probado:** las cuatro preguntas y sus cuatro negativos en pruebas puras, con
los textos que el guardián escribió de verdad; y end-to-end contra el guardián
real (simulador, gpt-5.5): dejó las dos preguntas intactas y el candado las
quitó dejando el mensaje coherente («Perfecto. La Falken Wildpeak A/T 4W en
255/70R16 está a $208.09 c/u.»). En la conversación completa, sin que el cliente
diga cantidad, el bot cotiza 4 de una y no dispara el candado. Suite en 991.

### 2026-08-26 · El cierre después de cotizar, como lo dictó Joaquín · ⏱️ 2.0 h

**Qué:** el turno de la cotización pasa a mandar DOS mensajes en vez de uno
(`buildStoreChoiceBlocks`): los dos links con un «sin compromiso», y aparte la
pregunta sola de a cuál local le queda mejor. El día ya no se pregunta ahí:
se pregunta cuando el cliente YA eligió local, y ahí va con la plata a la vista
—`domain/ahorro.ts` calcula el ahorro real de la cotización firmada
(`$277.44`, `25 %`) y `services/ahorroVigente.ts` lo lee una sola vez para los
dos que lo nombran—. `opcionesQueAlcanzan` saca de la vitrina lo que no llega a
un juego, con salida de emergencia si eso deja la pieza vacía. Prohibido
preguntar cuántas llantas quiere: sin cantidad dicha son 4 y se cotiza de una;
si después dice otra, se cotiza de nuevo con esa. El Ángel Guardián estrena
`pregunta_de_mas` y recibe el ahorro como hecho duro. 15 pruebas nuevas; la
suite queda en 986.

**Por qué:** Joaquín, sobre el chat de +593 98 634 5988: «el orden es foto,
mensaje corto con las dos ubicaciones que igual diga sin compromiso, y otro
mensaje diciendo a cuál de las dos le queda mejor ir. Después que le pregunte
qué día cree que va a poder ir… el 25 % mostrado en la cotización, que calcule
ese monto y lo muestre: es más probable que lo den si pueden ver el número de
plata». Metida dentro del bloque de los dos links, la pregunta se leía como pie
de página de dos URLs; sola, es una pregunta de dos opciones, la más fácil de
contestar que tiene el bot. Y lo de la cantidad: «que no pregunte cuántas
llantas quiere sino que solo cotice 4 — nos ahorramos un mensaje»; enseñar una
llanta de la que hay dos era además vender un problema, porque elegirla termina
en un aviso de stock corto que desdice la pieza que se acaba de ver.

**Probado:** el chat de la captura repetido en el simulador, con el stock de la
Falken fijado en 4. Sale la cotización por $832.36 —el mismo número— y detrás
los dos mensajes en el orden pedido; al contestar «Cumbaya» llega «¿Qué día
cree que puede pasar? … *25 %* de descuento, *$277.44* menos», con el guardián
en `aprobar` y cero hallazgos. Dos cosas las cazó el simulador y no los tests:
el guardián METIÓ «¿Cuántas llantas necesita?» en una corrección (su rúbrica no
lo prohibía) y después BORRÓ la cifra del descuento por no poder verificarla
—«esos datos no aparecen en los hechos registrados», y tenía razón con lo que
le dábamos—. Las dos cosas se arreglaron en su rúbrica y en sus hechos. También
verificado en vivo: la pieza de 195/65R15 salió con 2 opciones y dejó fuera la
de stock 2; «La Kenda» cotizó 4 sin preguntar; «en realidad quiero 2 nomás»
volvió a cotizar por 2.

### 2026-08-26 · La cotización de otra medida (conv 4732, Andrés Tamayo) · ⏱️ 3.0 h

**Qué:** `domain/medidaPedida.ts` estrena `mensajesDeLaVisitaActual`: los
mensajes se recorren del más nuevo al más viejo y se cortan en el primer
silencio de 12 h, porque lo de antes de ese silencio es otra compra.
`services/medidasDelPedido.ts` (nuevo) es ahora la ÚNICA respuesta a «¿qué
medidas se le pueden cotizar a este cliente?», y la usan los tres que la
necesitan: el candado de `generar_cotizacion`, el Ángel Guardián y los hechos
del vendedor. La pieza de opciones anota en su metadata las **equivalentes que
el bot declaró** (`equivalentes`), así que la 235/75R15 que el cliente vio y
aceptó se puede cotizar. Cuando el modelo manda un código cuya medida no está
pedida pero entre las opciones en pantalla hay UNA sola de ese mismo modelo en
una medida que sí lo está, se cotiza esa y queda alerta `medida_no_coincide`
para el asesor; si hay duda, se bloquea como siempre. Menos texto: con la foto
enviada el turno ya NO repite la cotización en palabras (`textoDeLaCotizacion`
reemplaza a `buildSingleQuoteCaption`), y los números `COT-…`/`AV-…` salen del
prompt, del playbook compacto, del cupón, de los seguimientos y del respaldo en
texto, con `domain/numerosDeCotizacion.ts` como candado final —después del
guardián, junto al aviso de stock—. El guardián estrena la categoría
`promesa_incumplible` y el hecho duro `COTIZACIÓN DESALINEADA`. 15 pruebas
nuevas; la suite queda en 971.

**Por qué:** Joaquín, sobre el chat de su papá: «pidió una medida que no había,
le dio la opción alterna correcta, pero cuando mandó la cotización le mandó de
otra medida completamente diferente, y luego nunca le mandó la cotización».
Leído en producción, el candado de medida había hecho exactamente lo CONTRARIO
de su trabajo: a las 15:55 bloqueó la 235/75R15, que era la correcta, y a las
17:10 dejó pasar una 265/65R17. La causa es que `medidasPermitidas` no tenía
noción del tiempo y el ciclo solo rota cuando la conversación se CIERRA — esta
llevaba 13 días abierta, así que la medida del carro que el cliente compró el
13-ago seguía contando como «pedida». La otra mitad —«nunca le mandó la
cotización»— es el mismo patrón de siempre: el bot le DIJO «le sirve la
equivalente en 235/75R15», el cliente aceptó, y esa declaración no quedó
anotada en ninguna parte, así que cotizar la equivalente se bloqueaba para
siempre. El Ángel Guardián sí vio el error —tres veces, `medida_incorrecta` en
alta— pero él solo reescribe texto y la foto ya había salido: por eso el bot
quedó tres turnos prometiendo una cotización que nada iba a generar, y esos son
los mensajes «sin foto» que Joaquín marcó. Lo del número de cotización es suyo
también: «le veo imposible que un cliente llegue y dé eso, se ve muy repetitivo
y puede hasta confundir; lo dejaría solo con el código de descuento del 2 %».
Va como candado y no como línea de prompt porque el texto al cliente lo
escriben tres manos y solo una obedece al prompt — en este mismo chat fue el
GUARDIÁN quien llenó cuatro mensajes de «COT-MTACN72K».

**Probado:** la conversación entera repetida en el simulador desde el estado
real del 13-ago (`--copiar-conv 4732`, rebobinada, stock fijado en 4). Antes:
cotización en 265/65R17, 4 correcciones del guardián y ninguna cotización
buena. Después: `COT-…` por la FALKEN WILDPEAK A/T 4W **235/75R15** en el
turno del «Me gusta la Falken» —uno antes que en producción—, las 3 revisiones
del guardián en `aprobar` con cero hallazgos, y el texto reducido a la pregunta
de día y local. El rescate se comprobó aparte con el código exacto que mandó el
modelo (`🔁 356398 → 356521`), y el guardián real, contra los tres borradores
que salieron mal ese día, los marca los tres en alta —incluido el nuevo
`promesa_incumplible`.

### 2026-08-26 · El «juebes» que costó una visita · ⏱️ 4.0 h

**Qué:** `domain/diasEnEspanol.ts` (nuevo): los días de la semana por CLAVE
FONÉTICA (b=v, s=z=c, j=g, h muda, ll=y, qu=k, dobles colapsadas) + distancia de
Damerau-Levenshtein con umbral corto, más las fechas de calendario («3 de
septiembre», «3/9», «setiembre») y la franja horaria («de 4 a 5» → `de 4 a 5
pm`, con la convención local: las 4 son la tarde). Tres candados contra el falso
positivo —lista de palabras que suenan a día y no lo son, umbral corto, y primera
letra igual si la distancia es 2— porque leer «¿cuándo vienes?» como viernes
agenda una visita que nadie prometió. Columna `visit_time_label` (migración 019)
y `registrarCompromisoDeVisita`, que junta la hora de un turno con el día del
siguiente. Herramienta `agendar_visita` para que el modelo ESCRIBA lo que
entiende. El portón `visita_agendada` deja de cancelar el seguimiento y le cambia
el libreto: confirmar y recordar, en «usted». El Ángel Guardián pasa a revisar
también los seguimientos, con rúbrica propia, y estrena la categoría
`estado_desincronizado`. 104 pruebas nuevas; la suite queda en 954.

**Por qué:** Joaquín trajo una captura: «aquí le hizo doble seguimiento cuando ya
confirmó». Conversación 9878, cotización COT-MT7H1534. El cliente escribió «X eso
el **juebes**», el bot entendió perfecto y contestó «Listo, jueves de 4 a 5 pm en
Depot Tire Quito Sur»… y `visit_date` quedó en NULL. La única vía al registro era
una regex que buscaba la cadena literal «jueves». Una letra cambiada, y para el
sistema esa visita no existió: **no hubo aviso al asesor** (Cesar viajaba desde
provincia y nadie lo esperaba), **no salió el cupón del 2 %**, y el portón
`visita_agendada` —que estaba bien hecho— dejó pasar los dos seguimientos porque
le llegó el estado vacío. El síntoma era el seguimiento; la causa, que el bot
podía prometer algo sin poder anotarlo.

Tres cosas que solo aparecieron probando en el simulador, y que valen más que el
arreglo original:

1. **Un hecho que miente es peor que un hecho que falta.** Al ensanchar la
   captura, un mensaje con solo la hora ya contaba como compromiso, y los HECHOS
   le imprimían al modelo «PROHIBIDO volver a preguntar qué día viene». Con la
   pregunta prohibida y sin el dato, el modelo rellenó el hueco: «Listo, jueves
   de 4 a 5 pm» a un cliente que nunca dijo jueves. Ahora la prohibición cuelga
   de la FECHA REGISTRADA, y sin fecha va la orden contraria: pedila y no
   inventes ningún día.
2. **El cupón sale como bloque aparte y tapaba la pregunta.** «Lo último que
   dijimos» era un solo mensaje, así que tras el bloque del cupón el cliente
   podía reagendar y su respuesta dejaba de leerse como respuesta. Un
   reagendamiento entero se perdió en silencio. `lastOutboundText` ahora devuelve
   el turno (últimos 3 salientes), no el último bloque.
3. **La ruta directa es la tercera puerta y se la estaba comiendo.** Con el
   compromiso ensanchado, `tryDirectSalesRoute` le quitaba el turno al agente y
   devolvía la frase cruda del cliente entre asteriscos como si fuera la fecha:
   «Perfecto: *X eso el juebes en Depot Tire Quito Sur*». Ahora esa ruta solo se
   queda con el turno cuando hay FECHA, y confirma la fecha interpretada.

**Probado en el simulador** (bot real, gpt-5.5, config de producción), repitiendo
la conversación de Cesar mensaje por mensaje: «de 4 a 5 … ese día paso» → confirma
la hora y pide el día sin inventar ninguno; «X eso el juebes» → `visit_date` =
jueves 27-ago 16:00, aviso al asesor con la hora que él dijo, cupón emitido;
«mejor el 3 de septiembre» → la fecha se mueve, el asesor se entera, y los dos
seguimientos se replanifican contra la fecha nueva. Cero hallazgos de
`estado_desincronizado` en la corrida final.

**El guardián, comprobado contra el modelo real** con los borradores exactos del
24-ago: al mensaje que confirma una visita no registrada le pone
`estado_desincronizado / alta` y **aprueba el texto** (el mensaje al cliente
estaba bien; lo que falla es el registro), y al seguimiento «¿te ayudo a dejar
lista la visita?» le pone `re-pregunta / alta` y lo reescribe como confirmación.
Un control con el seguimiento correcto pasa limpio, sin ruido.

**Nota de gasto:** el guardián sobre seguimientos es ~1 llamada extra por
seguimiento enviado (línea base 31/día). Se apaga desde Ajustes con el resto del
guardián. El techo del playbook compacto subió de 4.500 a 5.000 caracteres para
que entrara la regla de `agendar_visita`; sigue siendo ~1/4 del playbook largo.

---

### 2026-08-26 · El aviso de stock corto sobrevive al turno en que nace · ⏱️ 2.0 h

**Qué:** `domain/stockCorto.ts` (puro: el texto del aviso, cuándo un mensaje
está afirmando la cotización, si ya avisa) + `services/stockCorto.ts` (el
faltante de la cotización vigente contra el stock de HOY, y
`asegurarAvisoDeStock`). Enchufado en las tres puertas por las que sale la
misma cotización —el agente (`reenviar_cotizacion`), la ruta directa que NO
pasa por el agente (`directSalesRoutes`) y el envío (`index.ts`)—, más el
seguimiento automático. Al guardián se le da el faltante como HECHO duro y una
regla de rúbrica nueva (10. DISPONIBILIDAD) con su categoría `stock_prometido`.
22 pruebas puras + 9 de integración con los textos reales de la conv 11061.

**Por qué:** Manuel reportó una captura donde el bot promete «4 × KENDA KR203 …
total $262.60» con 3 en stock. El candado del 25-ago SÍ había funcionado —la
alerta se creó y a las 12:04:11 salió el ⚠️ con los dos números—, pero el aviso
era una variable local de `generar_cotizacion` que moría ahí. 35 s después el
reenvío de la pieza («4 unidades cotizadas») y 11 s más tarde el resumen
volvieron a prometer las 4 limpias. **El último mensaje que leyó el cliente lo
escribió el Ángel Guardián**, corrigiendo otra cosa: tenía el aviso en su
ventana de historial y no lo repitió, porque su rúbrica no hablaba de
disponibilidad y sus HECHOS no traían el stock.

**Las dos cosas que hacen que esto no vuelva:**

1. **El candado va DESPUÉS del que reescribe.** El orden del turno es
   `runAgent → applyOutboundGuard → revisarConGuardian → enviar`, así que un
   candado en `applyOutboundGuard` no protege de lo que el guardián escriba
   después — que es exactamente lo que pasó. `asegurarAvisoDeStock` corre al
   final, cuando ya nadie toca el texto. Hay una prueba que fija ese orden.
2. **Se cuenta contra el stock de HOY, no el de la firma.** Si en bodega
   repusieron, el aviso desaparece solo y la cotización no se toca.

**Probado en el simulador** (`npm run sim`, stock forzado a 3): la conversación
de Edison repetida entera. El mensaje que antes prometía las 4 ahora sale con
«⚠️ Recuerde que de esa llanta hoy hay *3* y la cotización es por *4*», el
reenvío también, y el cierre que solo pregunta el día sigue SIN aviso (repetirlo
en cada turno es ruido). Verificado el mecanismo, no solo el resultado: la marca
del candado en el log y la alerta `guard_stock_recordado` al asesor. Y el
guardián, con el borrador exacto de producción, ahora lo caza solo:
`stock_prometido`, severidad alta, y corrige insertando el aviso.

**Nota de coordinación:** `guardian.ts` va en este commit con cambios de otra
sesión que trabajaba en paralelo (la revisión de seguimientos y
`estado_desincronizado`); las dos numeramos una regla nueva como 11 y se
resolvió dejando la de estado como 12. `followUpProcessor.ts` queda SIN
commitear por lo mismo: su cambio de stock viaja con el trabajo de esa sesión.


### 2026-08-26 · El cruce con Contífico deja de ser una promesa · ⏱️ 2.5 h

**Qué:** con la API key de sincronización nueva (la anterior devolvía el padrón
recortado: 273 de 2 189 personas, y por eso el cruce del 12-ago dio 0 aciertos
de 61) se corrió el cruce real contra 4 424 documentos y 2 189 clientes.
Resultado: **9 ventas facturadas, $4 244,54**, cada una con número de factura
auditable en Contífico. Entra `senales.mjs`, que cuando el teléfono no
encuentra al cliente cruza por nombre, por código de producto seleccionado y
por día de visita prometido; y `poner-llave.sh`, que mete una credencial al
`.env` desde el portapapeles sin imprimirla nunca. El README queda con la tabla
de sucursales confirmada por Joaquín: `002-001` es Cumbayá y `001-001` es
Quito.

**Por qué:** hasta hoy «venta ganada» era lo que alguien marcaba a mano en el
Kanban, que dice 28 ventas cuando las facturas confirman 9 — el conteo manual
infla 5,6× aunque el monto quede cerca ($3 906 marcados contra $4 244
verificados). Sin esto no había forma de saber cuál de los dos números era el
bueno, ni de responderle a Joaquín si el servicio le sale rentable.

**Lo que el cruce NO ve, y hay que decirlo siempre:** de 1 205 personas que
escribieron al bot, solo **20 existen en el padrón de Contífico**. Dos de las 9
ventas facturaron a nombre de un tercero (una con el RUC de la empresa, otra a
nombre de otra persona), así que el teléfono se las pierde. El número es un
**piso**: la estimación por captura-recaptura da 12 a 18 ventas reales. Rutas
probadas y descartadas: `placa` (0 de 3 301 facturas la tiene), `adicional1`,
vendedor asignado, nombre de WhatsApp contra razón social (los perfiles son
apodos y emojis) y teléfono con tolerancia de un dígito.

**El hallazgo que sirve para el producto:** de los 4 clientes que llegaron a
elegir una llanta concreta, 3 compraron exactamente esa; de los 7 que
prometieron un día, 6 fueron ese mismo día y el séptimo al día siguiente. El
bot no pierde gente después del compromiso — la pierde antes: solo 50 de 1 205
conversaciones llegan a tener un día acordado. Ahí está la palanca.

**Rentabilidad para Depot:** Contífico no tiene costos cargados (0 de 1 104
productos con `costo_maximo`), así que su margen no es derivable. El número que
sí se puede afirmar es el punto de equilibrio: $3 690,90 sin IVA en 21 días
≈ $5 272/mes, contra $160/mes más el setup amortizado, **necesitan 4,0 % de
margen bruto para que el bot se pague**. Y el bot no canibaliza margen: cotiza
al 75 % del pvp1 mientras el mostrador cobra en promedio el 72,5 %.

---

### 2026-08-26 · El simulador: WhatsApp de mentira, bot de verdad · ⏱️ 3.0 h

**Qué:** `npm run sim` (scripts/sim) levanta el bot ENTERO —`dist/index.js`,
sin un mock adentro— contra una base local desechable, una Graph API de
mentira que guarda las piezas en vez de mandarlas, y una FOTO del catálogo de
Contífico con el stock editable desde la pantalla. La configuración se copia
de producción (settings, prompts por etapa, beneficios, marcas, asesores) y
las variables del servicio se leen de Railway, así que los modelos y los
interruptores del agente son los de Depot. La pantalla es un chat como el del
teléfono —con las piezas dibujadas, y 📎 para mandar una foto del costado o
una nota de voz que la visión y la transcripción leen de verdad— más un panel
de rayos X: herramientas del turno, veredicto del guardián con sus hallazgos,
alertas al asesor y la cotización vigente.

**Por qué:** probar un arreglo escribiéndole al número real tiene tres
problemas — le llega a un cliente si uno se equivoca de chat, no se puede
repetir el caso (el stock de Contífico cambia solo: la KR203 185/70R14 pasó de
3 a 2 unidades entre el reporte y la prueba) y no se ve nada de lo que pasó por
dentro. La primera corrida ya pagó el costo: reprodujo el error de stock de la
conv 11061 con el mismo mecanismo, incluido el guardián reescribiendo el
borrador en un «4 × … total $262.60» sin el aviso de que hay 3.

**Tres cosas que costaron descubrir:**

1. `OPENAI_BASE_URL` heredada del shell se borra siempre. El SDK de OpenAI la
   lee sola, y la primera corrida salió contra un proxy local: las respuestas
   no eran del modelo configurado. Un simulador que miente sobre quién
   contestó no sirve para nada.
2. Los modelos y los interruptores viven en Railway, no en `app/.env`, y se
   separan sin que nadie se entere: el `.env` decía `gpt-5.4` con producción en
   `gpt-5.5`, y `AI_COMPACT_PROMPT_ENABLED` —que reemplaza el prompt entero del
   vendedor— estaba prendido allá y apagado acá.
3. Si la copia de configuración falla, el simulador NO arranca. Pasó durante el
   desarrollo: la copia se rompió, el bot quedó en fase 1 sin guardián, y la
   prueba de humo igual daba casi todo verde. Un simulador degradado es peor
   que uno roto, porque se usa para decidir.

**Para que no se pudra:** `npm run sim:humo` levanta todo contra un doble local
de OpenAI (cero tokens, sin red) y verifica el turno completo con código de
salida; `test/simuladorFidelidad.test.ts` (11 pruebas estáticas) falla si
aparece una tabla de configuración o una variable de entorno que el simulador
no sabe copiar. Las dos quedan anotadas en `CLAUDE.md` para cualquier sesión.

**De paso, dos hallazgos sobre producción:** el canary del turno exacto barato
NO está encendido (`OPENAI_EXACT_TOOL_MODEL` no existe en `Depot_Tire`; lo que
se veía era una etapa rutinaria usando `OPENAI_ROUTINE_MODEL`), y Depot corre
en **fase 1** —sin fila `phase_config`, cae al default del entorno— o sea con
`fitment_vehiculo` y `enviar_comparacion` apagadas. Pendiente confirmar si es a
propósito.

**Costo:** la clave de OpenAI del simulador es propia (`app/.env.sim`, fuera de
git) y sin ella no arranca: los tokens del bot se le facturan a Depot, los de
nuestras pruebas no.


### 2026-08-26 · La promesa del cierre no puede desmentir al aviso de equivalentes · ⏱️ 0.5 h

**Qué:** `PREGUNTA_PREFERENCIA_EQUIVALENTES` — el mismo menú de Joaquín, pero
cerrando con «Con eso le digo cuál de estas le conviene más» en vez de «la
opción exacta para su medida». `buildCierreOpciones` la elige con el flag
`hayEquivalentes`, que `preparar_opciones` calcula del `fueraDeMedida` que ya
tenía.

**Por qué:** la vigilancia post-deploy del guardián lo cazó el mismo día
(casos 190/50R15 y 245/50R18): «el borrador cierra diciendo "la opción exacta
para su medida", pero la herramienta indica que no hay disponibilidad
exacta». Dos líneas más arriba el mensaje ya avisaba «en su medida no me
queda, estas son equivalentes» — y el cierre lo desmentía al pie. Era una
familia NUEVA nacida del texto nuevo, justo lo que el sprint final mandaba
vigilar. Balance del día: familia 2 (recomendación) en 0, familia 1 en 2.

### 2026-08-26 · El número del menú no es una cantidad · ⏱️ 0.5 h

**Qué:** candado determinístico en `generar_cotizacion`: si el mensaje del
cliente es el puro número del menú de preferencia («1»/«2»/«3», con el menú
como último saliente) y la cantidad pedida coincide con ese número, la
cantidad no fue dicha — se cotiza el juego de 4 con la aclaración horneada
(«si necesita otra cantidad, me avisa»). Tres tests de integración: el caso
del menú, el «2» sin menú (se respeta) y el «quiero 2 llantas» explícito
(jamás se pisa).

**Por qué:** la ronda 2 de la prueba en vivo lo mostró: «2» eligió bien la
llanta equilibrada… y cotizó DOS unidades. El prompt ya pedía juego de 4 sin
cantidad dicha, pero el turno exacto lo atiende el modelo barato del canary:
la regla de la casa manda hornear, no pedir. Nota: interbotSync.test tiene
un flake pre-existente los miércoles (fecha real en el test) — anotado como
tarea aparte, no lo toca este commit.

### 2026-08-26 · El guardián leía la vida entera del cliente, no el ciclo · ⏱️ 0.5 h

**Qué:** la prueba en vivo del sprint final (conv 3, ciclo recién reabierto)
cazó dos cosas: (1) `armarContexto` del guardián cargaba mensajes SIN filtrar
por ciclo — leyó el «al de quito sur / mañana» del ciclo 4 cerrado y
«corrigió» la pregunta de visita nueva (con sus dos links) por un «Como ya me
indicó, puede pasar mañana por Quito Sur» que el cliente jamás dijo; ahora la
query filtra `cycle` (test de integración con el caso). (2) El modelo leyó
«necesito UNA A/T» como cantidad 1 y cotizó una sola llanta de una: regla
afinada en prompt + compacto — el artículo nombra el TIPO, cantidad 1 solo
con «una sola»/«solo una». De paso el compacto vuelve a caber (<4.500).

**Por qué:** el guardián con memoria de ciclos muertos es peor que sin
guardián: deshace lo que el determinismo hornea bien. Y es exactamente la
familia «re-pregunta/datos rancios» que la vigilancia post-deploy debía
vigilar — cazada antes, en la primera conversación de prueba.

### 2026-08-26 · Las fotos de Joaquín, reproducidas y rematadas · ⏱️ 0.75 h

**Qué:** tres remates que salieron de reproducir las capturas de la reunión
contra el catálogo REAL de Contífico: (1) `PREGUNTA_PREFERENCIA` ahora es el
texto que Joaquín reenvió el 25-ago (menú numerado 1 Costo / 2 Equilibrio /
3 Premium) y `respuestaDePreferencia` entiende «1»/«2»/«3», «costo»,
«equilibrio» y «durabilidad» — con sus espejos en la `regla`, el prompt y el
playbook compacto; (2) `resolveSector` aprende «chillos»/«sangolqui» (la falta
real «Vlle de los chillos» del chat incluida) → Quito Sur; (3) en la base de
prod, el beneficio 1 pasa de «Todos los servicios de instalación y
beneficios» a «…, incluidos alineación y balanceo» (dato, no código).

**Por qué:** (1) el plan dejó la constante como único lugar justo para este
momento — el texto del cliente manda; el menú numerado invita a responder el
puro número y el detector tenía que saber leerlo (pero «costo» DENTRO de una
frase sigue siendo pedido de precio, no escalón — caso real del guardián).
(2) El cliente de la foto escribió «Vlle de los chillos» y el bot le pidió el
pin. (3) Era la causa raíz de la contradicción de la foto 2: el bot decía
«va aparte» mientras la pieza decía «todos los servicios» — Manuel lo
diagnosticó en la reunión (7:31): faltaba especificarlo en el documento.
Verificado además con el catálogo real: el caso Falken (265/65R18 + «una
A/T») ya devuelve SOLO la 356530 en su medida, con 18 en stock.

### 2026-08-26 · El plan de la reunión del 25-ago queda en producción · ⏱️ 1.0 h

**Qué:** sprint final del plan maestro. Tres revisiones independientes de los
PRs #7/#8/#9 contra la lista R-01…R-14 cazaron 4 bloqueantes (agotadas que
escondían equivalentes, INCLUYE mudándose a la cotización, motivo cruzado de
llanta, y los links de Maps al alcance de la pluma del modelo de copy); se
arreglaron en sus ramas, se mergeó por riesgo S1→S3→S2 con la suite completa
en verde tras cada merge (819 tests), y los dos entornos Railway quedaron en
`f963c40` con catálogo, worker y bot sanos. `coupon_config` se encendió en
producción ({activo: true, porcentaje: 2}) — Joaquín re-pidió el código en la
reunión; si la capacitación de cajeros sigue pendiente, se apaga desde Ajustes.

**Por qué:** el valor del sprint final es que nadie mergea su propio examen:
la lista maestra la verificó otro par de ojos por PR, y los 4 bloqueantes
eran exactamente del tipo que los tests de cada sprint no podían ver (bordes
entre zonas de PRs distintos). Pendiente: re-probar los casos de Joaquín en
el chat real (requiere el WhatsApp de Manuel) y vigilar las familias del
guardián 48 h (línea base: 31 correcciones el 25-ago; familia 1 debe caer
>50 %, familia 2 a ~0).

### 2026-08-25 · Agotada en su medida = como si no hubiera · ⏱️ 0.25 h

**Qué:** la revisión del sprint final encontró un borde en el candado nuevo de
`opcionesEnAro`: filtraba por EXISTENCIA del tipo en la medida confirmada, no
por stock. Ahora `enSuMedida` pasa por `conStock` antes de decidir.

**Por qué:** el requisito dice «si existe con stock». Si la única A/T de su
medida está en cero, quedarse en ella dejaba al cliente con UNA opción
incotizable (`generar_cotizacion` bloquea agotadas) y le escondía las
equivalentes vendibles del aro — peor que antes del arreglo. Agotado en su
medida ahora cae al aro completo y lo declara (`sin_tipo_en_su_medida`),
que es justo lo que el mensaje de equivalentes sabe explicar.

### 2026-08-25 · Su medida le gana al aro · y cotizar más de lo que hay ahora avisa · ⏱️ 1.5 h

**Qué:** dos bugs que Joaquín trajo a la reunión del 25-ago, atacados en su capa
determinística (SPRINT 1 del plan de la reunión).

1. **La búsqueda por aro ignoraba la medida confirmada.** El cliente tenía
   265/65R18 en la ficha, pidió «una A/T 4x4» y el bot le ofreció A/T de
   225/50R18 — otra medida del mismo aro — **teniendo la Falken Wildpeak A/T4W
   en su medida exacta con 4 unidades**. `opcionesEnAro` buscaba `R18` en todo
   el catálogo y filtraba por tipo; la medida vivía en `conversations.tire_size`
   y no llegaba nunca al filtro. Ahora entra: con algo de ese tipo en su medida,
   la selección sale SOLO de ahí. El aro se compara aparte y a propósito — si el
   cliente cambió de rines (caso que esta misma herramienta invita a atender) su
   medida vieja ya no aplica y filtrar por ella dejaría la búsqueda en cero.
2. **Cuando el tipo no existe en su medida, se dice.** La caída al aro completo
   sigue —enseñar equivalencias es válido y a veces es la única venta posible—
   pero deja de ser silenciosa: el resultado trae `sin_tipo_en_su_medida` y una
   `regla` que obliga a nombrarlas como equivalentes. El aviso al cliente ya lo
   hornea el candado 3 de `preparar_opciones`, que lee la misma `tire_size`.
3. **Cotizar 4 con 1 en stock.** «Hay una medida 195/55R15 con UNA unidad y el
   bot cotiza las 4 llantas de esa unidad». La cotización SÍ se genera y el
   mensaje dice cuántas hay hoy y que el resto lo confirma el asesor; además se
   abre una alerta `stock_insuficiente` con el stock real.

**Por qué así:** el aviso de stock **no bloquea**. Negarse a cotizar pierde la
venta justo cuando el snapshot de Contífico está viejo y en bodega sí están, que
es el caso más común — y el cero de verdad ya lo ataja el candado de `out`. El
texto va **horneado** en `mensaje_para_enviar` y no en la `regla`: este turno
sale verbatim por `exactToolReply` y ahí el modelo no tiene dónde agregar nada
(misma lección que el aviso de equivalentes del 20-ago). Y va pegado a la
cotización en lugar de como bloque aparte, porque el tope son 4 bloques y el
último —el que pide día y local— es el objetivo del turno.

**Pruebas:** 12 nuevas (780 en total, verde). El caso de Joaquín reproducido con
los códigos REALES de la base de tipos: la selección devolvía `351821`
(225/50R18) y ahora devuelve `356530` (265/65R18, stock 4). Las dos suites se
verificaron en rojo contra el código de antes.

**Queda fuera, a propósito:** el mismo aviso de stock en `preparar_opciones`
(R-03 lo pide «si la cantidad elegida ya se conoce») — esa función es zona
exclusiva del SPRINT 2 y se propone en el PR en vez de tocarla.
### 2026-08-25 · Los links de Maps, fuera del alcance de la pluma del modelo · ⏱️ 0.25 h

**Qué:** dos candados en `ensureFollowUpJobCopy`/`conMapasPegados`: el contexto
que se manda al modelo de copy va sin `storeLinks`, y cualquier URL que el
modelo escriba igual (copiada del historial) se quita antes de pegar SIEMPRE
el bloque canónico de `buildStoreLinksBlock`.

**Por qué:** la revisión del sprint final encontró que los links con URLs
reales entraban a los hechos del modelo, y la guarda vieja («si ya hay un
link, no pego nada») convertía un `maps.app.goo.gl` mutilado por el LLM en el
link que recibía el cliente — rompía el invariante «nadie escribe URLs a
mano» por la puerta de atrás. Test nuevo con el link mutilado forzado.

### 2026-08-25 · La ubicación deja de esperar el pin · ⏱️ 1.5 h

**Qué:** cuatro arreglos que salen de la reunión con Joaquín del 25-ago
(P-04, P-05, P-10) y que son el mismo defecto visto por cuatro lados.

1. **La pregunta por el local va con los mapas pegados.** `buildVisitPlanQuestion`
   —el cierre de toda cotización— ahora devuelve la pregunta y debajo los links:
   los dos si el cliente no ha elegido, solo el suyo si ya eligió.
2. **`local_mas_cercano` dejó de tener callejón sin salida.** Si no reconoce el
   sector ya no devuelve «no puedo ubicarlo, pide el pin»: manda la pregunta de
   siempre con los dos mapas y ofrece el pin como alternativa, no como requisito.
   Y «al sur» pasó a ser un sector de verdad (`resolveSector`), que resuelve al
   local de Quito Sur.
3. **El seguimiento en ventana repite los mapas.** Con cotización viva y sin
   local o sin día, el seguimiento sale con los links pegados. Determinístico:
   se pegan sobre el texto FINAL, así que también cuando lo redactó la IA.
4. **Los mapas y la pregunta viajan en UN solo mensaje.** En las dos tools de
   ubicación el mapa salía como bloque aparte, es decir como mensaje aparte.

**Por qué:** Joaquín lo dijo con sus palabras — «la gente se queda sin ubicación
porque el bot espera el pin; que cuando diga los lugares, mande los links de
una»— y «si a las ~3 horas no contesta, que el seguimiento mande las ubicaciones».
Le pasó al propio Manuel: recibió «¿qué día puede pasar y cuál local?» sin un
solo mapa. Esto **revierte a propósito** la regla del 18-ago («se mandan al
confirmar la ubicación, nunca al preguntarla: un link dentro de una pregunta es
ruido»). Aquella regla resolvía un problema real —las calles escritas y
repetidas— pero se pasó de largo: lo que era muro eran los parrafotes, no dos
líneas con un link. Preguntarle a alguien «¿Cumbayá o Quito Sur?» sin decirle
dónde queda cada uno es pedirle que elija a ciegas.

**Lo que no se veía, y es la causa del cuarto punto.** El pedido P-10 —«el
cliente puso "al sur por favor el viernes" y el seguimiento volvió a preguntar
el lugar»— NO era del seguimiento: el portón `visita_agendada` del 18-ago
funciona y sus pruebas lo demuestran. Fallaba antes, en los HECHOS. «Al sur»
solo cuenta como elección de local si nuestro último mensaje puso los dos
locales sobre la mesa (`preguntamosElLocal`), y «el viernes» solo cuenta como
fecha si ese mismo mensaje preguntó el día (`preguntamosElDia`). Las dos leen
`lastOutboundText`, o sea el ÚLTIMO mensaje enviado. Con el callejón del pin,
ese último mensaje era «¿de qué sector nos escribe?»: ni locales ni día, así que
los dos hechos se perdían y el seguimiento no tenía con qué callarse. Y con el
mapa saliendo como bloque aparte, el último mensaje era el mapa — mismo efecto.
Por eso la pregunta y los links van juntos y en ese orden, y por eso el arreglo
del callejón usa la pregunta de visita completa y no una inventada.

**Decisión sobre el candado.** `buildStoreLinksBlockOnce` («un mapa por
conversación») deja de usarse en `local_mas_cercano`: ahora que la pregunta de
visita manda mapas de rutina, el candado se gastaba ahí y dejaba sin link justo
al turno en el que el cliente acaba de decir dónde está. Sigue vivo para
`directSalesRoutes`. En el seguimiento la repetición es deliberada: si el
cliente no contestó, ese es el punto.

**Cadencia:** no se tocó nada en código. Producción ya tiene
`follow_up_policies.first_delay_minutes = 180` — las ~3 horas que pidió Joaquín.

**Pruebas:** 17 nuevas. En `ubicacionLocales.integration.test.ts` (6) el sector
irreconocible responde con los dos links sin exigir el pin, «al sur» resuelve a
Quito Sur, el pin y el local ya elegido mandan un solo mapa, y la cadena
completa del chat: sobre el mensaje que devuelve la herramienta,
`preguntamosElLocal` y `preguntamosElDia` dan true y «al sur por favor el
viernes» se convierte en local + fecha. En `followUpMessages.test.ts` (5) y
`followUpsLazy.integration.test.ts` (6) los mapas del seguimiento, incluido que
llegan aunque el texto lo haya escrito la IA, que el sticker no descarrila el
hilo y que con día y local no va ninguno. Diez de ellas fallan contra el código
de `main`. 785 tests, typecheck limpio.

**Pendiente (no es código):** los seguimientos siguen tuteando mientras el bot
habla de usted — sigue anotado desde el 18-ago y sigue sin tocarse.

---
### 2026-08-25 · Dos remaches de la revisión del sprint final · ⏱️ 0.25 h

**Qué:** (1) `generar_cotizacion` ahora condiciona su bloque INCLUYE de texto
con el mismo `debeLlevarIncluyeEnTexto` del turno de opciones; (2) cuando la
preferencia del cliente elige otra llanta que la recomendada del modelo, el
motivo del cierre sale del escalón, no del texto que el modelo escribió para
la suya.

**Por qué:** (1) quitar el INCLUYE del texto de opciones dejaba sin poner el
candado por contenido de `buildBenefitsBlockOnce`, y la duplicación que
Joaquín pidió quitar solo se MUDABA al turno de cotización (la pieza de la
cotización también trae la franja). (2) «Yo iría por la más barata: la mejor
duración de las tres» — el motivo describía a la equivocada, verbatim al
cliente.

### 2026-08-25 · El cierre por preferencia y el conocimiento del negocio (SPRINT 2, reunión Joaquín) · ⏱️ 3.0 h

**Qué:** (R-04…R-10 del plan de la reunión del 25-ago,
`docs/planning/PLAN-REUNION-25AGO-MASTER-PROMPT.md`)

1. **Cierre nuevo (R-04/R-05).** `PREGUNTA_RECOMENDACION` → `PREGUNTA_PREFERENCIA`
   («¿mejor precio, equilibrada o premium?», una sola constante para cuando
   Joaquín mande su texto). `respuestaDePreferencia` en `salesIntent.ts` lee la
   respuesta con las variantes reales («la más barata», «la del medio», «la mas
   varata»), `preparar_opciones` expone `escalones` (mapeados por PRECIO sobre
   lo que está en pantalla) y los guarda en la metadata de la pieza; los hechos
   del agente los recuperan al turno siguiente para entregar LA opción con su
   precio sin re-preguntar.
2. **R-06 (familia 2 del guardián).** «Describió su uso» (`describeUso`) también
   entrega la recomendación en el mismo turno — adiós «¿necesita recomendación?»
   con la recomendación ya preparada.
3. **R-07.** Con la imagen de opciones enviada, el bloque INCLUYE ya NO va en
   texto (`debeLlevarIncluyeEnTexto`): la franja de la pieza lo dice, ahora
   resaltada (`franjaIncluye`, misma jerarquía que el INCLUIDO de la cotización)
   y con los textos REALES de la tabla `benefits`, no el genérico.
4. **R-08 (P-03).** Los beneficios incondicionales vigentes entran a los bloques
   volátiles del agente como «INCLUIDO CON LA COMPRA (fuente determinística)»:
   el bot ya no puede decir «el balanceo es aparte» mientras su cotización
   imprime que está incluido.
5. **R-09.** Descuento en efectivo: «puede haber uno adicional; se lo confirman
   en la sucursal» — sin monto y sin negarlo (prompt + playbook compacto).
6. **R-10 (familia 1, ~20 casos).** Regla nueva nº1 del prompt: toda pregunta
   directa se contesta en la PRIMERA parte de la respuesta, con los
   contraejemplos reales del guardián citados.

**Por qué:** los pedidos textuales de Joaquín en la reunión del 25-ago (P-03,
P-06, P-07, P-08) más las dos familias grandes del Ángel Guardián (~30 casos
del 21–25 ago) atacadas en su causa raíz: el texto que ve el cliente se hornea
en la capa determinística (regla 5 de la casa) y las reglas viven en los DOS
prompts (regla 4: compacto encendido en prod desde el 25-ago).

**Nota de alcance:** `agent.ts` se tocó un pelo más allá de la excepción del
plan (además de los beneficios, los `escalones` de la última pieza entran a
`getAgentSalesFacts`/`salesFactsPrompt`): era la vía más simple para que la
respuesta de preferencia se pudiera entregar al turno siguiente, porque el
historial solo persiste texto y el JSON de la tool se pierde. Ni una línea del
loop ni de los modelos.

### 2026-08-25 · La revisión del 17-ago, corrida al fin — y la re-revisión del guardián · ⏱️ 1.0 h

**Qué:** se corrió contra producción la verificación que REVISION_17_AGO.md
dejó escrita (veredictos resumidos en ese mismo doc): caché 81–83 % (la mejora
real llegó el 11-ago con el plan de eficiencia, no con el reorden del 16);
`OPENAI_ROUTINE_MODEL=gpt-5.4-mini` en efecto con 0 errores y latencia a la
mitad; **doble IVA dormido** — 126/126 cotizaciones exactas en ×1,15, no hay
precios mal cobrados que avisar; `failed`=0 en 3 semanas; y el flood de
`window_closing` en cero (el worker zombi ya fue apagado).

**Re-revisión del Ángel Guardián (cita del 24-ago, línea base 24/día):**
76 correcciones del 21 al 25-ago = **15,2/día (−37 %)**, con los días 24 y 25
subiendo otra vez (21 y 22). Por familia:

1. **Pregunta directa del cliente ignorada (~20).** «¿Dónde están ubicados?»,
   dirección, tarjeta, crédito, formas de pago, enllantaje, garantía — el
   borrador responde el guion (medida/recomendación) en vez de la pregunta.
   La familia MÁS grande y la más ofensiva para el cliente.
2. **«¿Necesita alguna recomendación?» con la recomendación ya preparada (~10).**
   FAMILIA NUEVA post-c446123: la herramienta ya eligió (KR203, KR628, KR41,
   KR605, KR601, KR20…) y el borrador pregunta en vez de entregarla. Es la
   cola del arreglo de `buildCierreOpciones`: el cierre lleva el precio, pero
   el borrador que NO usa el cierre sigue preguntando.
3. **Re-preguntar lo ya dado (~15).** Medida, aro, cantidad («¿se la cotizo
   por 4?» ×2), local ya elegido ×3, foto ya enviada ×2. Era ~30 la semana
   anterior: bajó a la mitad pero sigue viva.
4. **Afirmaciones sin respaldo (~12).** «Ya quedó listo» sin cotización,
   alternativas inventadas (35X12.5R17), «desde aro 15» contradiciendo la
   herramienta, negar la WINRUN que sí se ofreció.
5. **Equivalentes/M-T sin aclarar (~6).** No dice que lo enviado es otra
   medida o que no hay M/T pura verificada.

`guard_mensaje_duplicado` bajó 33 → 20 → 6 por semana y `guard_precio_ajustado`
5 → 2: el error no se movió de capa, está bajando de verdad.

---

### 2026-08-25 · El turno exacto deja de pagar el cerebro grande: canary de OPENAI_EXACT_TOOL_MODEL · ⏱️ 1.5 h

**Qué:** variable nueva `OPENAI_EXACT_TOOL_MODEL` (+ `AI_EXACT_TOOL_ROLLOUT`,
0–100 por conversación, estable por id). Con ella puesta, las dos primeras
rondas de las etapas NO rutinarias van con el modelo barato, bajo una regla
dura: **el barato solo enruta**. Si contesta texto libre (prosa comercial:
territorio del principal) o llama una herramienta con efectos reales
(`generar_cotizacion`, `notificar_vendedor`), la ronda se repite con el
principal y lo del barato se descarta SIN ejecutarse — el marcador
`escalado_a_cerebro:<motivo>` queda en `tools` para medir la tasa de
escalación. Sin la variable, cero cambios (mismo patrón que
OPENAI_ROUTINE_MODEL y OPENAI_ESCALATION_MODEL).

**Por qué:** era «el ahorro grande» pendiente desde el informe del 10-ago
(42,4 % moviendo exact_tool_reply + routine_stage a mini; la variable de
routine solo cubría el 12,9 %). Medido hoy 25-ago contra producción:
`exact_tool_reply` es el **45 % de las corridas** (1.064 de 2.363 en 14 días)
y la mayor entrada viva (2,85 M de tokens no cacheados), con la MAYOR entrada
promedio (19 k por corrida). En esos turnos el texto que ve el cliente lo
compone la herramienta (`mensaje_para_enviar` verbatim) — el modelo solo
eligió cuál llamar: pagar GPT-5.5 por enrutar es el gasto más caro que
quedaba. El desglose por herramienta final dice que el 80 % termina en
`preparar_opciones`/`guia_medida`/`local_mas_cercano`/`reenviar_cotizacion`
(sin efectos: contenido determinístico) y el 20 % en `generar_cotizacion` —
por eso la lista negra: una cotización firmada con argumentos mal elegidos
no se corrige con retry, así que esa llamada jamás es del barato.

**Cómo se enciende (Railway, sin deploy):** `OPENAI_EXACT_TOOL_MODEL=gpt-5.4-mini`
y de arranque `AI_EXACT_TOOL_ROLLOUT=10` (canary chico). Subir a 50 y 100
cuando `ai_runs` muestre: (1) `route='exact_tool_reply' and model='gpt-5.4-mini'`
creciendo, (2) tasa de `escalado_a_cerebro:%` estable (cada escalación cuesta
una llamada mini extra, ~10 % del turno), (3) el guardián sin familias nuevas.
Revertir = borrar la variable.

**Pruebas:** 6 nuevas en `exactoBarato.integration.test.ts` con el stub HTTP
de escalacionModelos (se ve el `model` real de cada request): el barato cierra
un turno exacto solo y la auditoría lo registra a él; su texto NUNCA llega al
cliente (responde el principal); `generar_cotizacion` pedida por él no crea
ninguna fila en `quotes`; las etapas rutinarias no cambian; sin variable nada
cambia; rollout 0 no alcanza a nadie. 768 tests, typecheck limpio.

---

### 2026-08-25 · «Les molesto» no es un cliente molesto: es cortesía ecuatoriana · ⏱️ 0.5 h

**Qué:** el aviso `😠 CLIENTE MOLESTO` del ticket 10438 salió por el mensaje
«ya que me entreguen les molesto para visitarlos por favor». Ese cliente está
CONTENTO: avisa que va a pasar por el local. `detectNegativeSentiment` marcaba
negativo cualquier aparición de la palabra `molesto`, sin mirar cómo se usa.

**Por qué importa:** aquí un falso positivo no es una alerta de más. La misma
rama pone `bot_paused_until = 'infinity'`, asigna la conversación a un humano y
cancela la campaña de seguimiento: el bot se apaga para siempre en ese hilo por
un cliente que solo estaba siendo educado. Y en Ecuador «molestar» es LA fórmula
de cortesía para pedir algo o anunciar una visita, así que el caso no es raro.

**Arreglo:** la distinción es gramatical, no de vocabulario. Verbo con pronombre
de 2ª/3ª persona («les molesto», «molesto con una cotización», «si no le
molesta», «disculpe que le moleste») es cortesía; adjetivo de estado («estoy
molesto», «la clienta está molesta», «me tienen molesto», «me molesta que...»)
es enojo. `detectNegativeSentiment` busca PRIMERO la molestia de estado, que gana
siempre —«disculpe que le moleste, pero estoy molesto con el trato» sigue
disparando—, y solo si no aparece tacha los usos corteses para juzgar el resto.
Ojo con «me»: «me molesta» sí es queja, por eso no entra como clítico cortés,
pero «no me molesta» queda fuera. Trece casos nuevos en `followUps.test.ts`.
El prompt del agente aprende el mismo modismo, para que tampoco conteste como si
le estuvieran reclamando: a ese cliente hay que agradecerle y ayudarlo a
concretar la visita.

### 2026-08-23 · Depot Tire caído: ECONNRESET de Postgres mataba el proceso · ⏱️ 0.5 h

**Qué:** el servicio `AutoVenta` del entorno `Depot_Tire` en Railway llevaba
CRASHED desde el deploy del 20-ago ~23:17. No fue el build (salió SUCCESS):
horas después, una consulta de `listFollowUpBoard` (GET `/hub/follow-ups` del
panel) recibió un `read ECONNRESET` de Postgres, la promesa quedó sin capturar
y Node ≥15 mató el proceso. Railway no lo volvió a levantar. Staging nunca se
cayó, por eso pasó desapercibido.

**Por qué:** las rutas async de `admin.ts` no tienen try/catch y Express 4 no
captura promesas rechazadas de handlers async — el mismo modo de fallo ya
documentado y parchado en `/webhook` (webhook.ts), pero el panel quedó sin
proteger.

**Arreglo:** `process.on("unhandledRejection")` en los dos entrypoints
(`index.ts` y `worker.ts`): se loguea con 🧯 y el proceso sigue vivo; se pierde
la request afectada, no el bot. Además, redeploy inmediato del servicio caído
para restaurar Depot Tire antes del fix.

### 2026-08-20 · Línea base del guardián y seguimiento programado · ⏱️ 0.25 h

**Qué:** queda anotada la línea base ANTES del deploy `c446123` para medir el
efecto real y detectar tanto errores nuevos como regresiones.

**Correcciones del Ángel Guardián por día (hora de Guayaquil):**

| 13-ago | 14-ago | 15-ago | 17-ago | 18-ago | 19-ago | 20-ago |
|---|---|---|---|---|---|---|
| 1 | 15 | 24 | 18 | 32 | 48 | 32 |

Promedio de la semana: **~24/día** (170 en 7 días). El deploy `c446123` salió
el 20-ago ~22:55, así que **el primer día completo con los arreglos es el
21-ago**.

**Cómo se revisa (próxima sesión, ~lunes 24-ago):**

```sql
select left(exact_reason, 150), count(*)
from bot_alerts
where type='guardian_correccion' and created_at > '2026-08-21 05:00:00Z'
group by 1 order by 2 desc;
```

1. Si la tasa bajó pero quedan familias vivas → son las colas: arreglarlas con
   el mismo método (categoría → capa que la produce → prueba de regresión).
2. Si aparece una familia NUEVA que no estaba en el informe del 14–20 ago →
   puede ser efecto de los cambios (p. ej. el precio en el cierre de opciones o
   los imperativos de hechos produciendo textos raros): comparar contra las
   familias documentadas en la entrada anterior antes de tocar nada.
3. Vigilar también `guard_precio_ajustado`, `guard_mensaje_duplicado` y
   `conversationQuality` (repetitivas): si el guardián baja pero esos suben, el
   error solo se movió de capa.

**Contexto operativo del día:** Manuel ya le escribió al número del bot, así
que su ventana de avisos quedó reabierta (llevaba cerrada desde el martes 18,
17:08, con 153 avisos rebotados con Meta 131047 — entre ellos Edgar,
099 701 3296, compra confirmada el 20-ago 14:05, pendiente de atención humana).
El arreglo de fondo para avisos críticos sin depender de la ventana (plantilla
aprobada de Meta) sigue pendiente y NO se hizo aquí.

---

### 2026-08-20 · Las 170 correcciones del guardián, por familia y en su causa · ⏱️ 1.5 h

**Qué:** se bajó el informe completo del Ángel Guardián (170 correcciones en 7
días), se categorizó, y cada familia grande se arregló en la capa que la
producía — texto compuesto, hechos del prompt, detectores o playbook.

1. **Pidió precio, el turno no lo decía (23 casos).** `buildCierreOpciones`
   ahora entrega la recomendación CON su precio («Yo iría por la *KR628* —
   $163.40 c/u con IVA: …»). Además `pidePrecio` aprende las formas reales del
   informe: «costo», «por cuánto sale», «en cuánto queda», «de qué precio».
2. **Equivalentes sin aclarar (12 casos) — bug de diseño.** El aviso «di que
   son de otra medida» vivía en la `regla` para que el modelo lo agregara, pero
   `exactToolReply` manda `mensaje_para_enviar` VERBATIM: la orden existía y
   nadie podía cumplirla. La aclaración va ahora horneada en el mensaje.
3. **Re-preguntar lo ya dado (~30 casos).** Cada hecho confirmado lleva su
   prohibición pegada: medida → «PROHIBIDO volver a pedir medida, aro o foto»;
   cantidad → «PROHIBIDO preguntar ¿se la cotizo por N?»; local → «PROHIBIDO
   escribir el otro»; compromiso → «PROHIBIDO volver a preguntar qué día».
4. **Atribuirle a la cotización otra medida/marca (8 casos).** El hecho decía
   número y total; ahora dice el contenido («COT-MT06MIVA = 4 × KENDA KR50
   225/60R17») con la prohibición de atribuirle otra cosa.
5. **Inventos de ficha (10 casos).** Regla nueva en playbook y prompt: lonas,
   origen, años de garantía, financiamiento, tarjeta y convenios sin respaldo
   ni se afirman ni se niegan — «se lo confirma el asesor» y se sigue con el
   precio en la misma respuesta. Y se aclara que la regla dura prohíbe la
   LISTA de precios, no responder UN precio preguntado.
6. **Promesa vacía del descuento.** `buildVisitDayQuestion` ya no promete «su
   número de cotización» cuando no hay cotización (numero_venta null).
7. **Foto ya enviada.** Playbook: a quien mandó una foto ilegible se le dice
   «no alcanzo a ver la medida», no «¿prefiere mandar una foto?».

Las ~34 de «preguntó la ubicación y respondió el guion de medida» ya cayeron
con `ubicacion_locales` (deploy de esta tarde). **Pruebas:** 7 nuevas
(cierre con precio, promesa sin cotización, imperativos de hechos, detalle de
items con la forma real de `quotes.items`). 752 tests, typecheck limpio.

---

### 2026-08-20 · Ajustes en pestañas, avisos por nivel y usuarios del panel · ⏱️ 3.0 h

**Qué:** Tres pedidos de la reunión con Andrés Tamayo. (1) `Ajustes` se parte en
cinco pestañas —Bot, Negocio, Piezas, Avisos, Usuarios— porque la página única ya
no se podía navegar. (2) Los avisos de WhatsApp se enrutan por una **matriz
nivel × categoría** editable desde el panel (`aviso_matrix` en `settings`): seis
categorías (ventas, visitas, ventana, cliente, bot, técnico) × dos niveles; la
**ventana de 24 h queda apagada para todos** por defecto — eran demasiados
mensajes — y se re-enciende con una casilla, sin deploy. (3) Los usuarios del
hub salen del código y pasan a `settings` (`hub_users`, espejo síncrono en
memoria para el gate): el nivel más alto crea usuarios desde Ajustes → Usuarios,
elige el username del desplegable del login y reparte con interruptores qué
pestañas ve cada uno; el nav del hub obedece esos permisos.

**Por qué:** Andrés pidió controlar quién recibe qué aviso sin depender de
Manuel, y poder dar de alta gente al panel con accesos a la medida (esconder
cifras de venta, por ejemplo). Y el canal de avisos se estaba quemando: un
asesor que recibe ruido deja de leer el canal, y entonces tampoco lee la
cotización nueva.

---

### 2026-08-20 · Caso Eulalia: cotizar no pregunta el nombre · ⏱️ 0.5 h

**Qué:** `nombre_cliente` en `generar_cotizacion` pasa de obligatorio a opcional;
si el cliente no lo dijo, se usa el nombre del perfil de WhatsApp. El prompt
prohíbe explícitamente «¿a nombre de quién?» / «¿cliente final?», y la regla 4
suma «ayúdeme»/«hágale» —con faltas incluidas: «uyedeme porfa», «list»— a la
lista de confirmaciones.

**Por qué:** Joaquín lo cazó en el chat de Eulalia (conv 7832, 19-ago): «no te
parece que hace mucha pregunta para hacer una cotización?». La secuencia fue
«¿se la cotizo por 4?» → «Uyedeme porfa» → volvió a preguntar lo mismo →
«List» → «¿prefiere que la cotice a su nombre o como cliente final?» → recién
ahí cotizó. Tres confirmaciones y 1 h 48 min para una cotización que estaba
lista desde el primer sí.

La pregunta del nombre no era ocurrencia del modelo: el campo `nombre_cliente`
era OBLIGATORIO en el esquema de la herramienta, así que el modelo preguntaba
para poder llenarlo. El nombre ya viene gratis en `ctx.customerName` (perfil de
WhatsApp). La re-pregunta del «¿por 4?» sí era del modelo: «uyedeme porfa» no
estaba en la lista de confirmaciones de la regla 4, ahora está con ortografía
real de WhatsApp.

**Pruebas:** 2 nuevas en `ventaPrimero.test.ts` (el JSON Schema publicado ya no
exige `nombre_cliente`; el prompt contiene la prohibición y «uyedeme»). 749
tests, typecheck limpio.

---

### 2026-08-18 · La ubicación va como link, y el seguimiento no repregunta una visita ya agendada · ⏱️ 1.5 h

**Qué:** dos arreglos que salieron de dos capturas de WhatsApp de Manuel.

1. **La dirección deja de escribirse.** Las direcciones ya NO están en el system
   prompt (solo los nombres de los locales) y aparece una herramienta nueva,
   `ubicacion_locales`, que devuelve el link de Google Maps: una línea por local,
   nombre y link. `buildStoreLinksBlock` perdió la calle y el emoji de tienda;
   `local_mas_cercano` y `opciones_sin_medida` ya no reciben `direccion` en su
   JSON. Si el cliente ya eligió local va SOLO el link de ese, y si todavía no,
   van los dos con la pregunta por el día y el local pegada. La ruta directa de
   captura de visita adjunta el mapa del local elegido, una vez por conversación.

2. **El seguimiento mira la fecha de visita.** `visit_date` viaja ahora hasta
   `buildContextualFollowUpMessage`, y el worker cancela el envío con el motivo
   `visita_agendada` cuando hay día Y local confirmados y el día todavía no
   llega. Si falta el local, o si el día ya pasó, el seguimiento sí sale — pero
   con el texto correcto: «te esperábamos el viernes 21 de agosto y no pudimos
   atenderte, ¿te reagendo?».

**Por qué:** las dos capturas son del mismo día y muestran el mismo defecto —el
bot no se acuerda de lo que ya se habló, y lo tapa con párrafos.

En la primera, después de cotizar, el bot mandó *«Estamos en Quito Sur y Cumbayá.
Quito Sur: Galo Molina y Av. Alonso de Angulo. Cumbayá: C.C. La del Establo y Av.
Oswaldo Guayasamín»* como mensaje aparte de la pregunta por el día. En la
segunda, el cliente pidió literalmente *«ayúdeme con la ubicación por este
medio»* y recibió la calle escrita otra vez; esa misma noche un asesor tuvo que
mandarle el link de Maps a mano. Una dirección escrita no lleva a nadie a ninguna
parte —el link abre la ruta— y repetida en cada turno convierte el cierre en un
muro de texto. El modelo la escribía porque la tenía en el prompt: lo que no está
en el prompt no se puede copiar al chat.

La segunda captura tiene además el caso que Manuel pidió explicar: el cliente ya
había contestado «al sur» y «el viernes por favor», el bot lo confirmó
(«Perfecto: el viernes por favor en Depot Tire Quito Sur. Ya quedó registrado
para el asesor») y aun así le llegaron dos mensajes más citándole su propia frase
para volver a preguntarle el día. No era el modelo: era copy fijo de
`followUpMessages.ts`, que ante un `customer_commitment` guardado disparaba
«¿te ayudo a dejar lista la visita?» y «¿qué día te quedaría más cómodo?».
`visit_date` estaba en la base —el kanban y los avisos al asesor lo usan— pero
nunca llegaba a la redacción del seguimiento. Al asesor no se le deja de avisar:
`visitAlerts` sigue mandándole la víspera y el día mismo, y esos avisos no
dependen de este job.

**Pruebas:** 5 nuevas en `ubicacionLocales.integration.test.ts` (contra Postgres:
el mensaje no contiene ninguna calle, manda 1 o 2 links según haya local elegido,
y con día y local confirmados no pregunta nada), 3 en `followUpMessages.test.ts`
y 2 en `followUpsLazy.integration.test.ts` (el portón cancela con la visita
futura; con la visita pasada el mensaje sí sale). 745 tests, typecheck limpio.

**Pendiente (no es código):** los seguimientos tutean («¿te ayudo?») mientras el
bot habla de usted. Se ve en la misma captura y no se tocó aquí.

---

### 2026-08-16 · El reporte deja de creerse el acuse de Meta · ⏱️ 1.0 h

**Qué:** `enviarReporteDiario` ya no cuenta a un asesor como entregado por que la
Graph API haya aceptado el POST. Guarda el wamid del texto de cada uno y espera
el veredicto real en `message_status_events` (hasta 20 s, cortando apenas todos
tengan estado) antes de cerrar la cuenta. Los que Meta terminó rechazando se
descuentan.

**Por qué:** Meta responde el POST con **HTTP 200 y un wamid aunque la ventana de
24 h esté cerrada**, y manda el rechazo unos segundos después por el webhook de
estados. Hoy 16-ago el reporte de las 20:10 se anotó «enviado a 2/2 asesores»:
los dos mensajes a Manuel (texto y PDF) habían fallado con 131047 a las 20:10:11
y 20:10:14, y los de Joaquín sí llegaron. El log decía una cosa y el WhatsApp
otra.

Lo caro no era el log. `enviarReporteDiario` tiene una red de seguridad —si no lo
recibió NADIE, suelta el día y el bucle lo reintenta cada 15 min hasta
medianoche— y esa red **solo corre si `entregados === 0`**. Como el contador
mentía diciendo 2, no se activó nunca y el candado del día quedó puesto. Con este
arreglo, esta misma noche el reporte habría salido solo en cuanto Manuel le
escribió al número, sin que nadie lo reenviara a mano.

**Ojo, esto NO se prueba en memoria:** lo que se afirma es que la consulta a
`message_status_events` encuentra el veredicto, así que los 4 tests nuevos van en
`reporteCandado.integration.test.ts`, contra Postgres de verdad, igual que el
candado. Uno cubre el caso exacto de hoy: dos asesores, a uno le llegó y al otro
no, y la función distingue cuál. 733 tests, typecheck limpio.

**Pendiente hermano de este (NO es código):** el flood de `window_closing` —
451.433 filas en `bot_alerts`, 68.473 solo hoy sobre 650 claves distintas— no sale
de este repo. Lo produce el servicio Railway **«AutoVenta Follow-ups Worker»**,
que sigue desplegado desde el 8-ago con el commit `8fd3eb7a` de la rama
`codex/producto-real-depot-tire`. Ese código **inserta** la alerta cada vuelta;
`main` desde el 6-ago solo la **resuelve**. Como el índice único es parcial
(`where status in ('open','snoozed')`), resolverla libera la clave y el viejo la
vuelve a insertar: los dos procesos se pelean cada 5 segundos. El arreglo es
apagar ese servicio (el worker embebido en el web ya hace el trabajo, `/health`
lo confirma con `modo: "embebido"`) y después purgar las filas. Está en los dos
entornos, staging y Depot_Tire.

---

### 2026-08-16 · Se saca la consulta al Interbot de buscar_llanta (corrección de la entrada anterior) · ⏱️ 0.25 h

**Qué:** se revierte la mitad del cambio anterior. `preparar_opciones` sigue
confirmando el precio contra el Interbot —ahí es donde el cliente ve el número—
pero `buscar_llanta` vuelve a servir el catálogo.

**Por qué:** dos motivos, y el segundo corrige algo que la entrada anterior
exageró.

1. `buscar_llanta` es la herramienta más frecuente del bot. Meterle una ida y
   vuelta al Interbot (hasta 20 s en el peor caso, que es el timeout de
   `fetchJson`) en CADA búsqueda es cargar la ruta más caliente para un
   beneficio marginal: el cliente ve los precios en la pieza, y el playbook
   prohíbe listarlos en texto.

2. La entrada anterior presentó el desfase como «un hueco real» sin medir lo
   angosto que era, y eso fue una exageración. El catálogo NO se quedaba una
   semana atrás en la práctica: `loadCatalog` llama a `applyInterbotPrices` en
   CADA sync de Contífico (cada 5 min), y `generar_cotizacion` actualiza el mapa
   de precios al cotizar. O sea que en cuanto alguien cotizaba una medida, el
   precio fresco se propagaba al catálogo en menos de 5 minutos y la pieza ya
   salía bien. La ventana defectuosa era estrecha: una medida cuyo precio cambió
   Y que nadie hubiera cotizado desde el último barrido.

Lo que queda es la mejora sin el coste: la pieza confirma su precio, y el resto
sigue apoyándose en el lazo de auto-corrección que ya existía.

**Verificación:** 733 pruebas en verde y `tsc` limpio.

### 2026-08-16 · La pieza de opciones y la cotización dicen el precio del Interbot, las dos · ⏱️ 0.5 h

**Qué:** `preparar_opciones` y `buscar_llanta` confirman el precio contra el
Interbot antes de enseñarlo — una consulta por medida (`refreshPriceForSize`),
volcada sobre los productos con `applyInterbotPrices`.

**Por qué:** quedaba un hueco del arreglo anterior. La cotización ya preguntaba
el precio en el momento, pero la PIEZA DE OPCIONES dibujaba
`item.minimumPriceWithTax`, que es el catálogo en memoria, y a ese campo solo lo
reescribe el barrido COMPLETO — que desde el 12-ago corre una vez por semana
(miércoles 15:00). Si Depot cambiaba un precio un jueves, el cliente veía el
viejo en la imagen de opciones y el nuevo al cotizar. Interbot es la fuente del
precio de venta real, así que las dos piezas tienen que salir de ahí y del mismo
momento; ahora coinciden por construcción.

El coste en consultas al Interbot es el que se cuidó el 12-ago: son ~1–2 por
conversación (proporcional a clientes reales), no el barrido de ~156 ni las
15.000 diarias que reclamaron. La contrapartida es una ida y vuelta más en el
camino de respuesta; si la latencia molesta, el sitio para recortar es
`buscar_llanta` —la pieza es la que el cliente mira— y se quita sin tocar nada
más.

**Verificación:** 729 pruebas en verde y `tsc` limpio. La semántica de
`applyInterbotPrices` ya la cubren los 6 casos de `interbotPrices.test.ts`,
incluida la regresión del precio que reclamó Depot; lo añadido aquí es cableado.

### 2026-08-16 · El sello de la equivalente advierte en ámbar, ya no rechaza en rojo · ⏱️ 0.75 h

**Qué:** el sello de medida de la pieza de opciones (`selloDeMedida` en
`depotPosters.ts`) deja el rojo. Ahora es ámbar (`#fff3d6` con borde 2 px
`#dda017`), encabeza **`255/70R16 · LE MONTA`** y debajo, en dos renglones,
**«No es su medida exacta, / pero le entra: mismo aro 16»**. La nota al pie va
en el mismo ámbar y con el mismo texto.

**Por qué:** el sello gritaba «NO ES SU MEDIDA» en rojo con borde de 3 px, y
sobre la pieza el efecto era el contrario del buscado. Cuando el catálogo no
tiene la medida pedida —el chat 6363 de hoy pidió 255/65R16, que **no existe en
ninguna de las 385 SKUs**— las tres opciones que el bot ofrece son legítimas: mismo
aro, con stock, las únicas que el negocio puede vender ese día. Marcadas en rojo
se leían como tres errores, y el cliente se llevaba una imagen en la que todo
estaba tachado. El reparo se dice igual y con todas las letras; lo que bajó es el
volumen, no el contenido. Ámbar a propósito: el ámbar dice «mírame antes de
decidir», el rojo decía «esto está mal» — y tiene que saltar, porque una
equivalente que pase inadvertida es justo el fallo del 13-ago.

**Ojo (bug encontrado al verificar):** el reparo va en **dos renglones** y no en
uno porque la frase entera rompía la pieza. Los textos del sello van en `nowrap`
a propósito (una medida partida a la mitad es peor que nada), así que con tres
marcas en la fila —donde la tarjeta se angosta— el sello se salía de la tarjeta y
se cortaba justo en el aro; la tercera se iba fuera del póster. Partido, el
renglón más largo mide poco más que el título y entra en la columna más estrecha.
No se veía en los tests: hubo que renderizar los tres casos (sin exactas, mixto y
la fila apretada de tres marcas) y mirarlos.

**De paso, verificado:** el bot hizo lo correcto en ese chat. `255/65R16` da 0
resultados en el catálogo, y las tres que ofreció existen y tienen stock
(255/70R16 Falken ×24, 265/70R16 Falken ×78, 245/75R16 KR628 ×48). El candado del
13-ago funcionó — no firmó cotización en otra medida, la marcó.

Test nuevo en `selloDeMedida.test.ts`: blinda que el reparo no pueda suavizarse
hasta desaparecer y que «OJO»/«NO ES SU MEDIDA» no vuelvan por ninguna vía.
729 tests en 71 archivos, typecheck limpio.

---

### 2026-08-16 · Auditoría (2/2): el precio que se lee y el que se firma son el mismo · ⏱️ 2.0 h

**Qué:** segunda tanda de la auditoría, la que toca dinero y funnel.

*El chat y la cotización dejan de tener dos precios.* `generar_cotizacion`
confirma el precio contra el Interbot en el momento y con ese número arma la
cotización y la imagen — pero el texto de WhatsApp lo armaba
`buildSingleQuoteCaption`/`…Detallado` leyendo `product.minimumPriceWithTax`, la
foto del catálogo en memoria, que solo se refresca en el barrido completo. Ahora
los dos caminos reciben los mismos números (`PreciosFirmados`).

*Doble IVA.* La línea quitaba el IVA con `product.taxRate` y `buildQuote` lo
volvía a sumar con `business.taxRate`. `product.taxRate` vale **0** en toda la
ruta de Google Sheets y en cualquier producto que Contífico devuelva sin
`porcentaje_iva`: el unitario entraba con el IVA ya dentro y se le sumaba otro
15%. Unas llantas anunciadas a $480 se firmaban en $552. Se quita con la misma
tasa con la que se pone; donde ambas coinciden no cambia nada.

*El descuento se recalcula.* `getActiveDiscountOffer` devuelve la oferta del
CICLO, con un monto fijo calculado contra la cotización que existía cuando el
asesor lo autorizó. Reinyectarlo en otra cotización daba un descuento
desproporcionado y, cuando ya no cabía, `buildQuote` lanzaba y —sin captura en
ninguna capa— el cliente se quedaba sin respuesta. Ahora se recalcula con `kind`
+ `valueCents`; si aun así no cabe, se cotiza sin él en vez de tumbar el turno.

*El clasificador ya no retrocede el funnel.* Decidía comparando contra el objeto
`conversation` cargado al PRINCIPIO del turno, pero durante el turno las tools ya
habían movido la etapa en la base. Ahora relee la etapa antes de comparar.

*Otros.* El candado anti-reenvío de la pieza de opciones se autodesactivaba:
guardaba los códigos crudos del modelo (hasta 6, sin filtrar) y comparaba contra
los renderizados (capados a 3), así que casi nunca coincidían. Un rechazo no
capturado en `POST /webhook` mataba el proceso y con él el buffer de debounce y
la cola FIFO. `/cotizaciones/live.png` y `/diagnostico/piezas` colgaban de la app
raíz, fuera del gate: enseñaban el precio mínimo del catálogo real a cualquiera y
rasterizaban tres piezas por petición. El rescate corría con 2048 tokens
compartidos entre razonamiento y salida, así que podía volver vacío y entregar
justo la disculpa que existe para evitar. Y las reentregas de Meta se cortan
antes de gastar: para una foto, la reentrega ya había pagado descarga y visión
antes de descubrir que el mensaje estaba repetido.

**Por qué:** son los hallazgos que sobrevivieron a la verificación adversarial y
tocan lo que el cliente ve o lo que Depot cobra. El de doble IVA es el más caro
de los tres de precio, y el más silencioso: no rompe nada, solo cobra de más.

**Verificación:** 728 pruebas en verde y `tsc --noEmit` limpio. Se añade
`cotizacionCoherente.test.ts` con las dos invariantes de dinero (el IVA se quita
y se pone con la misma tasa; el texto usa los números firmados) y la del
descuento recalculado.

**Nota:** al cerrar esta tanda había otra sesión editando `depotPosters.ts`,
`quoteImage.ts` y `selloDeMedida.test.ts` (el sello de medida). Esos tres
archivos NO entran en este commit y se dejaron intactos en el árbol de trabajo.

### 2026-08-16 · Auditoría: ningún turno se queda sin respuesta, y el caché del prompt vuelve a servir · ⏱️ 3.0 h

**Qué:** auditoría del repo con agentes en paralelo (seis lentes de bugs, cuatro
de coste), cada hallazgo pasado por un verificador adversarial instruido para
refutar por defecto. De 30 hallazgos únicos verificados, 14 sobrevivieron y 2
fueron refutados. Esta tanda arregla lo que no necesita evaluación previa.

*Contención de errores.* `defineTool` no podía lanzar y lanzaba por dos sitios:
`schema.parse` pasa a `safeParse` y `run` va envuelto. El disparador realista no
es que el modelo se invente un aro fuera de rango, es que los argumentos lleguen
truncados por `max_completion_tokens`: ahí `parseArguments` devuelve `{}` y toda
tool con campos requeridos reventaba. La excepción subía hasta
`pipeline/inbound.ts`, que solo hace `console.error` — el cliente se quedaba sin
nada y el asesor sin aviso. `runAgent` tiene ahora red de seguridad con registro
en `ai_runs`, y un 429/500 de OpenAI sale del bucle al rescate en vez de tumbar
el turno. En `vision.ts`, el `logAiRun` del camino feliz era el único `await` del
archivo sin `.catch()`: un fallo de la base tiraba la lectura de la foto ya
pagada y el bot pedía la medida por escrito teniendo «225/65R17» en la mano.

*Fuerza bruta en el panel.* `/api/auth/login` no tenía ningún freno: 10.000
combinaciones de cuatro dígitos y dentro, con premio de teléfono y chat de todos
los clientes, envío de WhatsApp como Depot Tire y reescritura de las credenciales
del canal. La clave la decidió el cliente el 14-ago y no se toca — lo que faltaba
era el freno. Contador **por usuario**, no por IP: no hay `trust proxy` detrás de
Railway, así que `req.ip` es la misma para todos y un límite por IP bloquearía a
todos o a nadie. Espera exponencial desde el quinto fallo, tope de 15 minutos,
429 con `Retry-After`. Siete pruebas nuevas, que es justo lo que no estaba
cubierto: `auth.test.ts` probaba la cerradura, nunca el abuso.

*Precio de la entrada.* Medido contra la telemetría real del 10-ago: 14.620
tokens de entrada por llamada, de los cuales solo 10.086 se cacheaban. El prompt
de sistema mide 10.471 — o sea que el caché lo cubría y se cortaba justo ahí,
que es donde entraba `salesFactsPrompt` en el índice 1 con `hace N min` dentro,
un número distinto en cada turno. Los bloques volátiles pasan detrás del
historial. `buscar_llanta` devolvía 8+5 productos para que el modelo eligiera 3;
ahora 5+3 reservando primero un hueco por escalón, así que no puede perder un
nivel de la escalera — cosa que el `slice(0,8)` de antes sí podía. Del playbook
salen §10 (instructivo para el humano que edita prompts, que el modelo no puede
ejecutar) y §11 (checklist que repite reglas de `prompts.ts`); §8 describía nueve
herramientas y omitía cinco de las catorce reales.

*Otros.* Las campañas que autoriza un asesor no salían **nunca** cuando la
conversación estaba en manos humanas: el envío revalidaba la política como
`worker` y chocaba con el `pause_on_human_control` que el paso anterior
(`advisor_review`) acababa de activar. Un eco saliente sobre un chat cerrado lo
reabría y vaciaba la ficha. `reopenConversation` es idempotente. `renderPng` usa
`renderAsync`: rasterizar 2.880 px en síncrono congelaba el event loop por el que
pasan el ack del webhook y el healthcheck. `remotePhoto` ya no memoriza el fallo
para siempre —un timeout de 6 s dejaba esa llanta con la ilustración genérica
hasta el siguiente deploy— ni baja el cuerpo antes de mirar el tamaño. La
transcripción deduce la extensión del mime real: todo audio iba como `.ogg` y los
reenviados (`audio/mpeg`) fallaban siempre.

**Por qué:** Manuel pidió una auditoría de bugs y de consumo de tokens. El
hallazgo que reordena las prioridades es que **el 74,8 % de la factura es entrada
sin cachear**: el prompt de sistema, que es lo que el plan de ahorro del repo
quería recortar, ya viaja cacheado a un décimo de tarifa. Recortar 1.000 tokens
de ahí ahorra $0,025 al día; recortar 1.000 de los que no se cachean ahorra
$0,250. Por eso encender `COMPACT_PLAYBOOK` —que tira el 83 % del texto de las
reglas— vale un 5,7 % y recortar dos números en `buscar_llanta` vale un 7,9 %.
Lo que de verdad mueve la aguja sigue siendo el canary de modelo en
`exact_tool_reply` y `routine_stage` (42,4 %), que el informe del 10-ago ya había
concluido y sigue sin aplicarse.

**Verificación:** 720 pruebas en verde (713 antes, 7 nuevas sobre el freno de
login) y `tsc --noEmit` limpio. Lo que toca precio o comportamiento comercial
—deduplicar el playbook, bajar el historial, el playbook compacto, el canary de
modelo— NO entra aquí: necesita el replay previo, que es lo que cazó el fallo de
`max_tokens` con 461/461 turnos el 7-ago.

### 2026-08-16 · Fuera los emojis de la interfaz: el panel deja de leerse como generado · ⏱️ 2.0 h

**Qué:** barrido de diseño por todo el hub. Los 58 emojis que hacían de iconos
—`💰🙋⚠️🗓📍🛞🃏⭐🔧🏁🚗📅🔒👤🔴⏰📋📷⚖🔐👼🎟️✅⛔📏💵🏬★🏷️🤖📄🔊`, repartidos en
nueve archivos— salen y entran iconos de `icons.tsx`, que ya existía con 25 y no
se estaba usando. Doce iconos nuevos siguiendo la convención del archivo.
`CIERRE_META` pierde el campo `emoji` y aparece `CierreIcon`.

En Oportunidades, las tres tarjetas de icono+título+texto pasan al `Segmented`
que ya usaban Inbox y Pipeline, y ahora **sólo se pinta la alarma**: antes las
once tarjetas llevaban el mismo bloque relleno de fecha, así que el orden por
urgencia no se veía. Los contadores del segmentado dejan de ir todos en rojo.

Textos de 9 y 9.5 px suben a 11 px en nueve archivos. «espera ayer» y «espera 15
ago» pasan a «espera desde ayer» / «espera desde el 15 ago». «Revisar uno por
uno» se deshabilita con cero elementos.

Y un bug que estaba **en vivo**: `.pulse-dot::after` inyectaba la palabra «LIVE»
posicionada en absoluto a 12 px de un punto de 8 px, cayendo encima del texto
del propio chip («Conectado · Fase 4», «Bot en línea 24/7»). En todas las
pantallas.

`DESIGN.md` recoge las reglas: §2.3 emojis, §2.5 sólo se pinta lo que urge, §3.2
piso de 11 px, §5.7 sistema de iconos, más dos greps en el criterio de
aceptación para verificarlo sin abrir el navegador.

**Por qué:** Manuel probó el skill Impeccable sobre una pantalla, le gustó cómo
quedó y pidió llevarlo a todo el simulador. El hallazgo de fondo es que la mitad
del «olor a AI» no era falta de gusto sino **código que ignoraba las piezas del
propio proyecto**: el sistema de iconos y el `Segmented` estaban ahí, escritos y
funcionando, y las pantallas nuevas no los usaban.

Lo de la jerarquía es lo que más se nota: una cuadrícula donde todo lleva el
mismo relleno no tiene jerarquía, tiene relleno — el ojo no puede elegir dónde
empezar. La pantalla prometía «primero los que prometieron venir y no vinieron» y
esa promesa sólo vivía en el `sort`, no en el pixel.

Los emojis del **contenido** se quedan: lo que escribió el cliente por WhatsApp
se muestra tal cual llegó. Eso es el dato.

**Pendiente aparte:** `FeedItem.icono` sigue siendo un emoji en string porque lo
llena también el backend (`app/src`); migrarlo toca los dos lados y va en su
propio cambio.

### 2026-08-16 · El botón de salir baja con los tabs · ⏱️ 0.25 h

**Qué:** «Salir» sale del chip de arriba y pasa abajo, junto a la navegación:
pastilla con borde, icono de puerta y el texto, centrada encima de la tab bar en
el teléfono; en escritorio, solo el icono al pie del rail (64 px de ancho no dan
para texto). Arriba queda únicamente el nombre de quién está usando el panel.
Icono nuevo `IconSalir`.

**Por qué:** pedido de Manuel con la referencia visual delante. Y la esquina
superior derecha ya cargaba cuatro cosas —nombre, conexión, versión, modo—, que
son indicadores para saber DÓNDE estás, no acciones; la salida no se busca ahí,
se busca donde está la navegación. En el teléfono, además, es donde la mano ya
está. Va con borde y sin relleno a propósito: es una acción de salida y no puede
competir en peso con los tabs ni con «Apagar el bot». Fuera de la barra, no
dentro, porque con las 6 fases activas los tabs ya van justos de ancho.

---

### 2026-08-16 · Entrar con usuario dejaba el panel a medias: 401 en toda la pantalla · ⏱️ 0.5 h

**Qué:** Cuatro pantallas del hub armaban sus peticiones leyendo la clave cruda
del navegador (`getStoredAdminKey`) y **nunca mandaban el token de sesión**. Al
entrar con usuario —que es justo cuando no hay clave guardada— salían sin
credencial y el servidor respondía 401: «Clave de administración requerida» en
la franja de arriba, el Ángel Guardián y el cupón congelados en «Cargando…», la
vista previa con «Error 401» y el kanban sin poder mover nada. Las cuatro
(`Ajustes`, `Settings`, `whatsapp-setup`, `Pipeline`) pasan a usar
`authHeaders()`, que ya elegía bien: token si hay sesión, clave cruda de
respaldo. También la vista previa de las piezas, que llamaba a
`/api/pieces/preview.png` con la clave a mano.

**Por qué:** es la mitad que faltaba del login del Sprint 2. Se construyó la
puerta —servidor, token, pantalla de entrada— pero las pantallas que ya existían
siguieron pidiendo la llave vieja, así que entrar «bien» era peor que entrar con
la clave: el panel se abría y no funcionaba nada. Verificado en el navegador
interceptando las peticiones con una sesión de prueba: las 15 llamadas de
Ajustes ahora salen con `Authorization: Bearer`, incluida la de la vista previa.

---

### 2026-08-15 · El código viaja con el acuerdo, se verifica antes de canjear, y aparece el botón de salir · ⏱️ 1 h

**Qué:** Tres cosas que pidió Manuel mirando el circuito completo.

*El código en TODOS los avisos de visita.* `detallesDeVenta` —que alimenta los
tres avisos: «dijo cuándo viene», «viene mañana» y «viene hoy»— ahora lleva
también la línea del cupón. El asesor recibe el acuerdo entero en un solo
WhatsApp: «viene el lunes a Quito Sur, cotizó $555.57, código DT-PUMA47». Con
eso valida al cliente **leyendo su propio WhatsApp**, sin abrir el panel y sin
consultar la base. Era la costura que el Sprint 5 dejó anotada y sin cablear.

*Verificar y canjear son dos pasos.* En caja primero se comprueba el código
—existe, y de quién es— y recién cuando la venta se cierra se aplica el 2 %.
Nuevo `consultarCupon()` + `GET /api/cupones/consulta`, que NO quema el cupón y
devuelve con quién cotejarlo: nombre, teléfono, medida, total cotizado, local y
qué día dijo que venía. El panel muestra esa ficha y recién ahí ofrece el botón
de aplicar. `canjearCupon` pasó a apoyarse en la misma consulta, así que los dos
caminos rechazan por lo mismo y con el mismo texto.

*El botón de salir no existía para media casa.* El chip de usuario se mostraba
solo si habías entrado con login; quien entra con la clave administrativa —el
panel central, los scripts, y cualquiera que ya tuviera el hub abierto de antes—
se quedaba dentro sin ninguna forma de cerrar sesión. Ahora el chip sale
siempre que haya sesión y dice «Clave admin» cuando no hay usuario.

**Por qué:** El cupón solo sirve si el circuito cierra en los dos extremos. Del
lado del cliente ya cerraba; del lado de Depot faltaban las dos puntas: que el
asesor sepa qué código tiene ese cliente sin buscarlo, y que en caja se pueda
distinguir un código real de uno inventado **antes** de aplicar plata. Probado
de punta a punta contra la base real —código inexistente, palabra fuera de la
lista, código escrito «dt tigre 99», verificación que no quema, canje, y segundo
canje rechazado— con limpieza al final: cero cupones vivos. 713 tests en verde.

---

### 2026-08-15 · El cupón que sí se puede cobrar, y el panel que llevaba un día sin actualizarse · ⏱️ 2.5 h

**Qué:** Tres cosas, y la segunda explica por qué las otras dos parecían estar
hechas y no lo estaban.

*El cupón, completo y apagado.* El Sprint 4 dejó la tabla, unas funciones
sueltas y el ajuste — **nada cableado**: ni emisión, ni canje, ni endpoints, ni
interruptor. Ahora existe el circuito entero. Los códigos dejaron de ser
`DT-7K3M` (cuatro caracteres al azar) y pasaron a **`DT-PUMA47`**: una de 64
palabras cortas sin tildes ni ñ —animales, cosas del carro, lugares del país—
más dos dígitos. Se dicta por teléfono sin deletrear («de-te puma cuarenta y
siete»), se teclea de un tirón con cola en caja, y que la palabra venga de la
lista **es** la verificación: al barrer las descripciones de Contífico,
`DT-PUMA47` es nuestro y `DT-XKQZ13` no existe, sin consultar la base
(`extraerCupones`). El mensaje al cliente ya no informa, empuja: el código va
solo en su línea y cierra con «dígalo en caja antes de pagar; si no lo presenta,
no le pueden aplicar el 2 %». Emisión idempotente por conversación y ciclo,
canje con candado contra doble aplicación, y `redeemed_by` con el usuario del
login. **Nace y queda APAGADO**, con su interruptor y el porcentaje editables en
Ajustes.

*El panel servido estaba un día atrasado.* Lo que se sirve en `/admin` no es
`hub/src`: es `app/site/admin`, un bundle **ya compilado y commiteado**, y nada
lo reconstruye en el deploy. El Sprint 2 se mergeó a `main`, el deploy quedó
verde… y se siguió sirviendo el bundle del 14-ago. Por eso el Cotizador seguía
sacando las piezas viejas —el síntoma que reportó Manuel— y por eso el login no
aparecía por ningún lado. Reconstruido, y con candado nuevo en
`.githooks/pre-commit`: tocar `hub/src` sin recompilar bloquea el commit.

*El número de venta estaba roto.* `AV-` + los dígitos de un número base36 («COT-MSUX5R4W»)
daba entre cero y dos caracteres: 148 cotizaciones con 68 números distintos y 28
literalmente `AV-`, texto que salía en el aviso al asesor en cada cotización.
Ahora conserva el sufijo entero.

**Por qué:** Depot no puede saber qué vendió el bot. El cruce por teléfono dio
0 de 61 porque `quotes` no guarda teléfono y Contífico no conoce el número de
cotización — no hay ningún dato compartido entre los dos sistemas. El cupón lo
crea: el cliente tiene un motivo propio para identificarse (su 2 %) y el cajero
escribe el código donde ya está tecleando. **No escribimos en Contífico** — no
hace falta y no queremos ese permiso. Queda apagado a propósito: un código que
caja no sabe honrar es peor que no prometer nada, así que la luz verde es de
Andrés, no del código. Y lo del bundle es la lección cara del día: un deploy en
verde no prueba que lo que ve el usuario haya cambiado. 713 tests en verde.

---

### 2026-08-15 · Las notas del guardián, atacadas de raíz: precios y local sin re-pregunta, gratis · ⏱️ 1.5 h

**Qué:** Tres arreglos determinísticos sacados de los hallazgos REALES del
Ángel Guardián (324 revisiones, 63 correcciones en 2 días de producción), para
que esos errores no dependan de tener el guardián prendido gastando tokens:

*Un solo formato de plata.* `money()` de `quoteMessages` formateaba con locale
es-EC («$811,48») mientras la pieza renderizada, las herramientas y la base
dicen `$811.48` — el caption contradecía a su propia imagen, y el guardián lo
corrigió 4 veces como `precio_incorrecto` ALTA (convs 5657, 6129, 6347…).
Ahora todo el stack escribe `$xxx.xx`.

*Corrector de precios en el guardián de salida.* `corregirPrecios()` en
`outboundGuard.ts`: normaliza la coma decimal que escriba el modelo y, si una
cifra queda a ≤2 céntimos de un monto real de la cotización vigente sin ser
exacta, la reemplaza por el monto real (caso 6175: el modelo multiplicó
4 × $97.97 = $391.88 cuando la cotización registra $391.89 — el IVA redondea
por línea). Corre siempre, guardián prendido o apagado, a costo cero; deja
alerta `guard_precio_ajustado` (media, solo panel/admins) para ver el patrón.

*El local elegido no se re-pregunta.* `generar_cotizacion` preguntaba
«¿Cumbayá o Quito Sur?» con texto FIJO — en el candado anti-duplicado y en el
plan de visita — aunque `nearest_store` ya estuviera registrado: las 4
re-preguntas de las convs 6275 y 6375 salían de ahí, no del modelo. Con local
elegido se pregunta solo el día, nombrando el local, y la `regla` al modelo
se lo prohíbe explícitamente.

**Por qué:** El guardián existe para quitar errores mientras se les encuentra
la causa, no para pagarla en tokens para siempre. Su informe señaló qué parte
de los `precio_incorrecto` y `re-pregunta` era **del código, no del modelo**
(un formateador con otro locale, un template fijo): eso se arregla en la
fuente y queda arreglado con el guardián apagado. Lo que sí es juicio
(cifras inventadas sin cotización, promesas sin respaldo) sigue siendo
territorio del guardián — apagarlo ahora es decisión comercial de Depot, con
este piso determinístico ya puesto. 698 tests en verde, con los casos reales
del informe como fixtures.

---

### 2026-08-15 · Quién entra al hub, y una sola fábrica de piezas · ⏱️ 2.5 h

**Qué:** Dos cosas de la reunión del 14-ago con Andrés.

*Login.* El hub ya no se abre con una clave anónima: pide **usuario** (Manuel
Montufar · Andres Tamayo · Joaquin Tamayo · Asesor, lista que sirve el servidor
en `GET /api/auth/users`) y **clave — 1234 para todos por ahora**, decisión
explícita del cliente para esta fase. `POST /api/auth/login` devuelve un token
HMAC firmado con la `ADMIN_KEY` (sin tabla nueva, sin dependencias, 30 días de
vigencia) y el gate de `admin.ts` lo acepta **además** de la `x-admin-key` de
siempre. El nombre de quien entró sale en la barra del hub, con su botón
«Salir» — también en el teléfono, con el nombre de pila, porque el hub se usa
como PWA en iPhone y ahí el chip había quedado escondido. El servidor sabe en
cada petición quién pregunta (`req.usuario`) y con qué rol. Nuevo `app/src/server/auth.ts`; 23 pruebas entre `auth.test.ts` (la
cerradura: firmas torcidas, tokens caducados, otro secreto, usuario borrado) y
`loginHub.integration.test.ts` (el cableado HTTP).

*Permisos.* Existe el objeto (`verFinanzas`, `verErrores`, `usarCotizador`…),
viaja al hub y hay `usePermisos()` listo — **todo en `true` para todos los
roles**, y **nada se condiciona todavía**.

*Piezas.* El Cotizador dibujaba las imágenes con un canvas propio en
`hub/src/lib/quoteImage.ts`, y ese canvas se quedó en el diseño viejo mientras
el bot ya mandaba el nuevo. Se borró (490 líneas) y ahora el hub **descarga**
del servidor lo que dibuja el mismo renderizador del bot:
`POST /api/catalog/options-image`, `/compare-image` y `/quote-image`, con la
medida buscada viajando en la petición para que cada tarjeta salga sellada
igual que por WhatsApp.

**Por qué:** El login era pedido de la reunión — el panel se queda abierto en un
computador compartido de la tienda y «el sistema hizo tal cosa» tenía que poder
volverse «lo hizo tal persona»; la estructura de permisos queda montada porque
Andrés pidió poder esconder cosas (lo vendido total, por ejemplo) sin haber
decidido todavía qué ni a quién, y esto permite decidirlo después cambiando un
objeto en vez de reescribir el gate. La clave única y el `x-admin-key` que
sobrevive no son descuidos: la clave la eligió el cliente para esta fase, y la
puerta vieja sigue abierta porque el bot, los scripts y el panel central entran
por ahí y no saben nada de usuarios. Lo de las piezas es directamente lo que
Andrés vio en la demo (min 18:31, *«esto está en la antigua, tengo que
actualizarlo»*): dos renderizadores para la misma imagen garantizan que uno se
quede atrás, y la única forma de que no vuelva a pasar es que quede uno.

---

### 2026-08-14 · Reporte histórico del mes 1 para la reunión con Depot · ⏱️ 1.5 h

**Qué:** `docs/reportes-historicos/` — carpeta nueva para los reportes de periodo largo
(los de reunión), separada del reporte diario automático de las 20:00.

- **`2026-08-13-mes-1.html`**: una sola página, casi puro gráfico, con el formato y la
  paleta del reporte diario. KPIs del corte, dona de lo cotizado en la semana contra todo
  lo cotizado en la historia (95,5 %), movimiento del kanban, barras día por día, las cinco
  semanas desde el arranque, errores del censo del 5-ago, calidad antes/después del juez
  (12 → 0 fallos críticos), costo de IA (−69,4 % por conversación) y lo que sigue sin cerrar.
- **Calculadora interactiva** al final: modelo + perfil de consumo + conversaciones al mes
  → costo mensual, por conversación y por día, con la comparación GPT-5.5 vs GPT-5.4-mini.
  Las constantes salen de la auditoría de costos; con el perfil del 8-ago devuelve los
  $13,41 reales de ese día.
- **`README.md`** de la carpeta: reglas del formato, tabla de qué bloque sale de qué reporte
  guardado, las consultas SQL de la serie por semana y cómo actualizar la calculadora.

**Por qué:** la reunión con Andrés Tamayo necesitaba el acumulado, no un día suelto, y hasta
ahora eso se armaba a mano cada vez. Dejarlo versionado con su README convierte el reporte de
reunión en algo repetible: se copia el último, se cambia la fecha de corte y se reemplazan los
números desde las fuentes ya listadas.

**Estado / próximos pasos:**
- ⚠️ Las semanas 1 a 3 salen de la bitácora y no de la base: ese día el Postgres de Depot no
  se pudo alcanzar (timeout al puerto del proxy de Railway). El README deja las consultas
  listas para que el próximo reporte use la serie real por semana.

---

### 2026-08-14 · La cuenta de tokens en el tab KPI: cuánto va y cuándo se paga · ⏱️ 1.5 h

**Qué:** Sección «Tokens y cuenta del servicio» en el Dashboard (tab KPI):
gasto de IA de **hoy / últimos 7 días / mes en curso** en dólares (cada uno
con su valor + IVA 15% al lado), calculado desde `ai_runs` (tokens reales por
corrida × tarifa OpenAI por modelo, con descuento de caché). Debajo, la
**cuenta del mes**: tokens + IVA, el mantenimiento mensual ($80 + IVA, en
chico) y el **total a pagar** con su fecha — el **primer viernes del mes
siguiente**. Historial mensual con estado Pagado/Pendiente; **marcar pagado
exige OWNER_KEY** (clave de dueño, distinta de la ADMIN_KEY del cliente: solo
Manuel puede tocar pagos). Al marcar, el mes se congela en un snapshot
(`billing_months`) para que el historial no se mueva si cambian tarifas.
Agosto corre desde el **12-ago** (arranque del servicio; `BILLING_START`).
Backend: `services/billing.ts` + `GET /api/hub/billing` +
`POST /api/hub/billing/:period/pay`.

**Por qué:** Pedido de Manuel: que Depot vea solito cuánto lleva gastado y
cuánto va a deber el primer viernes, sin pedirle el corte a nadie — y que el
registro de pagos quede en un solo lugar, marcable solo por él. Nota: desde
este mes el mantenimiento es **$80/mes + IVA** (antes era otro esquema).

---

### 2026-08-14 · Cada opción dice si es su medida o una equivalente · ⏱️ 1.0 h

**Qué:** La pieza de opciones se llena hasta con tres llantas y, para
lograrlo, a veces entran equivalentes de otro perfil que sí le montan por el
aro. Eso está bien y vende — el problema era que **la tarjeta no mostraba la
medida por ningún lado**, así que tres medidas distintas se veían idénticas.
Ahora cada tarjeta lleva su sello: verde «265/70R17 · MEDIDA EXACTA» o rojo
«265/65R17 · NO ES SU MEDIDA — Le entra por el aro 17, pero es otra medida»,
arriba del precio. Si alguna es equivalente, el rótulo del encabezado deja de
prometer «TODO EN TU MEDIDA» (pasa a «OPCIONES QUE LE MONTAN») y al pie sale
una franja roja: «OJO — las marcadas en rojo NO son su medida exacta…».
La exactitud se calcula en `renderOptionsImage` (no en quien llama) para que
ninguna pieza pueda olvidarse de marcarla.

**Por qué:** Pedido de Manuel: «que salga una nota grande, un badge rojo al
lado, para no confundir nada». Es la última capa del mismo problema del
13-ago: el bot ya no puede COTIZAR otra medida (candado) ni BUSCAR mal
(escalera), y ahora tampoco puede MOSTRAR una equivalente sin decirlo.

---

### 2026-08-14 · Escalera de búsqueda + los SKUs invisibles · ⏱️ 2.0 h

**Qué:** (1) `buscarConEscalera` (domain/catalog.ts, pura y testeada; envuelta
en `searchWithLadder`): el catálogo ya no responde `[]` mudo. Da lo exacto y,
si no hay, QUÉ SÍ HAY — lo que existe en la medida pedida y en qué medidas
existe el modelo pedido. Con eso `buscar_catalogo` devuelve al agente datos
para una respuesta precisa **sin escalar al asesor**, y un «no lo manejamos»
pasa a ser una afirmación respaldada. Regla dura: si el cliente pidió una
medida, nada de otra medida entra como `resultados` (iba a repetir el 5499
cuando la medida pedida no existía en catálogo).

(2) **Seis familias de SKUs reales estaban SIN medida — invisibles a toda
búsqueda por medida aunque estuvieran en stock.** Medido sobre los 385 SKUs
que entregó Depot: `30*9.50R15` y `35*12.50R17/R20` (el catálogo usa `*` en
vez de `X`), `33X1250R20` (sin punto decimal) y las convencionales de camión
`7.00R15`, `6.50R16`, `7.00R16` (KR12, que no tenían parser). Arreglado en
tireSize.ts: separador `[xX*×]`, ancho de flotación sin punto («1250» → 12.50)
y `extractConventionalSizes`. Ahora **0 de 385 SKUs sin medida**.

(3) Prueba exhaustiva nueva (`medidasTodasLasFormas.test.ts`): las 153
medidas reales × todas las formas de escribirlas (14 por métrica, 9 por
flotación, 5 por convencional y comercial) verificando que encuentra Y que
jamás devuelve otra medida, más los tres desenlaces del negocio. Salieron de
ahí tres bugs más: la consulta que es SOLO medida se quedaba sin tokens y
caía a exigir palabras inexistentes; el prefijo `LT` no se reconocía como
parte de la medida; y las cortesías («por favor», «gracias») mataban la
búsqueda entera.

**Por qué:** Manuel: «si no hay no hay, mejor fuera que busque bien porque el
asesor va a responder mil mensajes de no tenemos». Tenía razón: la regla que
mandaba escalar al asesor trasladaba el problema en vez de resolverlo, y de
paso tapaba los bugs del buscador. La cura es que el catálogo conteste con
precisión; el guardián pasó a exigir que la negativa sea **específica y con
alternativa**, no a escalarla.

---

### 2026-08-14 · La medida se decodifica PRIMERO: filtro duro, no texto a adivinar · ⏱️ 1.0 h

**Qué:** Idea de Manuel tras el caso A/T4W: cuando la consulta trae una
medida, `searchCatalog` la DECODIFICA primero con el parser del dominio (que
entiende «265/70/16», «Rin17», «33x12.50r17») y la usa como FILTRO: si el
catálogo tiene esa medida, se busca solo dentro de ella y es imposible que
salga una llanta de otra medida; el texto restante («falken», «at4») solo
elige el modelo. Si en esa medida no hay nada, cae a la búsqueda ancha para
poder decir «en la suya no, pero existe en estas». De paso: los fragmentos de
la medida ya decodificada («265», «70r17», «rin17») dejan de ser tokens
obligatorios, y la flotación en la consulta se decodifica con
`extractFlotationSizes` (el regex local del catálogo era solo-mayúsculas y
«33x12.50r17» en minúscula no matcheaba).

**Por qué:** La búsqueda por texto trataba la medida como palabras sueltas, y
así fue como una consulta con medida terminó devolviendo llantas de tres
medidas distintas (chat 5499) y otra juró que no existía la Wildpeak. La
medida es un dato ESTRUCTURADO con parser propio: usarla como texto era
regalar precisión.

---

### 2026-08-14 · «at4» ya encuentra la A/T4W, y el guardián ve lo que el bot HIZO · ⏱️ 1.5 h

**Qué:** El bot volvió a jurar que la Wildpeak A/T4W 265/70R17 no existía
(conv 3, 12 y 14-ago) teniéndola en stock (código 356531). Dos agujeros en
`searchCatalog`: «at4» no aparece contiguo en el texto normalizado con
espacios («a t4w») — ahora cada token también se compara en forma COMPACTA —
y «tienen» era un token obligatorio que ningún producto contiene — ahora las
palabras de conversación (tienen, busco, precio, llanta…) se filtran del
query si queda algo con qué buscar. Verificado con la ficha real: los 4
estilos de escribirlo encuentran la A/T4W y «at4» no se confunde con la AT3W.

Además, el guardián ganó los ojos que le faltaron ese turno: `toolTrace` en
AgentContext (cada herramienta con argumentos y recorte del resultado, la
llena el loop del agente) entra al contexto del revisor como «LO QUE EL BOT
HIZO ESTE TURNO», con dos reglas nuevas: (8) el borrador debe ser consistente
con lo que las herramientas devolvieron, y (9) NUNCA se niega en seco un
modelo de las marcas de la casa (Falken/Kenda/Winrun) — una búsqueda vacía
casi siempre es la búsqueda fallando, no la llanta faltando; se reescribe a
«déjeme confirmarlo con el asesor» + opciones de la medida. Smoke real contra
gpt-5.5: niega Wildpeak → corrige (alta); niega Michelin (no la manejamos) →
aprueba.

**Por qué:** El guardián revisó ese turno y solo pudo suavizar el texto: sin
ver la herramienta ni conocer las marcas de la casa, «no aparece en catálogo»
era inverificable. La causa raíz era del buscador (el mismo patrón del
parser de medidas: el determinismo no entendía cómo escribe la gente), y la
regla 9 convierte el peor desenlace posible —negarle al cliente la llanta
estrella que sí tenemos— en una respuesta segura aunque todo lo demás falle.

---

### 2026-08-13 · El Ángel Guardián: la revisión que ve la conversación desde afuera · ⏱️ 2.0 h

**Qué:** `services/guardian.ts` + tabla `guardian_reviews` + interruptor en
Ajustes (👼 primera tarjeta) + endpoints `/api/guardian{,/informe}`. Antes de
enviar CADA respuesta del bot, un segundo modelo (el mismo nivel que el
vendedor — `OPENAI_GUARDIAN_MODEL`, default el `OPENAI_MODEL` del deploy)
recibe los hechos duros (medidas que el cliente pidió, cotización vigente con
sus números, historial) y el borrador, y decide: aprobar o corregir. Revisa
en orden de gravedad: precios/cotizaciones contra los datos reales, medida,
re-preguntas, contradicciones, ignorar la pregunta, repetición y tono. Nunca
bloquea (dejar al cliente sin respuesta es peor que cualquier error de
estilo) y FALLA ABIERTO con timeout de 12 s: si el revisor no contesta, el
borrador sale tal cual. Todo queda en `guardian_reviews` — aprobaciones
incluidas — y las correcciones con hallazgo alto además alertan al asesor
(tipo `guardian_correccion`, visible en Errores). El informe de la semana
(botón en la misma tarjeta) es la lista documentada de errores chicos y
grandes, por categoría y con link al chat, para atacar causas.

**Por qué:** Pedido por Depot el mismo día en que se encontró la cotización
firmada en otra medida: ahora que ellos pagan los tokens, quieren poder elegir
entre ahorro (apagado, el bot queda como antes) y cero errores (prendido).
Los candados determinísticos cazan patrones fijos; los errores del 13-ago
(precio que no cuadra, re-pregunta del local, «sí, esa es su medida») solo se
ven entendiendo la conversación — y eso es un modelo revisando, no un regex.

---

### 2026-08-13 · El bot firmó otra medida: candado en la cotización · ⏱️ 1.5 h

**Qué:** Tres arreglos encadenados a partir del chat 5499.
(1) **El parser no entendía «265/70/16»** — la forma con tres barras, la más
común en Ecuador. Faltaba la barra en el separador del aro. Sin eso, la medida
que escribe el cliente nunca se guardaba como hecho de la conversación: el
cliente pidió después «245/75/16» dos veces y `tire_size` se quedó en la
anterior. Auditando las cotizaciones apareció el mismo agujero con **«265/70
Rin17»** y «265 aro 16» (chat 1724): «rin» y «aro» tampoco se leían, así que
el separador ahora los acepta. Ese arreglo era obligatorio antes de soltar el
candado: sin él, el candado habría bloqueado cotizaciones legítimas.
(2) **Candado de medida en `generar_cotizacion`** (`domain/medidaPedida.ts`):
no se firma una medida que el cliente no haya pedido. Las permitidas salen de
sus propios mensajes del ciclo más la confirmada de la conversación — así el
camino legítimo (no hay stock → se le ofrece la equivalente → acepta → se
busca → se cotiza) sigue abierto, y el de derivar solo se cierra. Cada bloqueo
deja alerta `medida_no_coincide` para que se vea en la revisión del día.
(3) **`preparar_opciones` deja de mentir el rótulo**: si las opciones son de
varias medidas ya no se rotula la imagen con la de la primera, y el agente
recibe la orden explícita de decir que son equivalentes y nombrar la medida de
cada una.

**Por qué:** El cliente pidió 265/70R16, el modelo derivó a una búsqueda por
ARO cuando pidió «menor precio dispone» y presentó 215/60R16, 245/70R16 y
225/70R16 —ninguna la suya, rotuladas como si lo fueran—, cotizó la 225/70R16
en $499,04 y, cuando el cliente dijo «Esa medida», le confirmó que sí era la
suya. La correcta costaba $145,47 c/u contra $124,76: **$82,84 menos en el
juego, con número de cotización que el cliente puede presentar en el local.**
Cotizar es firmar un precio; por eso es un candado y no una línea de prompt.
Ataca también el patrón «confirma la medida y luego la niega» que la revisión
del día encontró en otros 3 chats.

**Y no era un caso suelto:** pasando el candado por las 117 cotizaciones
reales de los últimos 14 días salen **12 firmadas en una medida que el cliente
nunca pidió, todas vivas, $7.243,01 en juego** (COT-MSS17CZX, COT-MSRTTIJ6,
COT-MSRT2VCO, COT-MSQPARPI, COT-MSQIFG1W, COT-MSRML6QR, COT-MSPCZT60,
COT-MSP0J2E3 y otras). Hay que revisarlas a mano con el asesor: algunas serán
equivalencias que el cliente aceptó de palabra, pero cada una es un papel con
precio que puede presentar en el local.

---

### 2026-08-13 · Revisión contextual diaria: el error que ningún regex ve · ⏱️ 2.5 h

**Qué:** Nueva skill `revision-contextual` + `scripts/revision/` (extraer.mjs,
render.mjs, registro con historial día a día). Lee TODOS los chats del día
mensaje por mensaje (subagentes en paralelo con rúbrica de 8 categorías),
consolida hallazgos con evidencia citada, y genera un HTML con tendencia por
categoría contra el día anterior. Primera corrida (13-ago): 104 chats, 102
hallazgos (23 altas). El patrón dominante NO era del bot conversando: 8 chats
calientes mudos porque el handoff pausa al bot por horas y ningún humano
contestó (2 mensajes de asesor en todo el día). También: flood de ~1.400
alertas `window_closing` por chat, y el bot confirmando medidas que luego
niega.

**Por qué:** El error del 13-ago (re-preguntar la sucursal ya elegida) lo vio
Joaquín en su teléfono, no ningún detector — son errores que solo existen en
contexto. La auditoría determinística cuenta lo contable; esta revisión juzga
lo demás, y el registro permite ver si bajan día a día sin que Joaquín viva
pegado al teléfono.

---

### 2026-08-13 · El conocimiento del negocio entra al bot + «al sur» ya es Quito Sur · ⏱️ 2.5 h

**Qué:** Tres bases nuevas en `assets/` (entregadas por el negocio):
(1) `conocimiento-marcas.json` → módulo `respaldoMarcas` + herramienta
`respaldo_marcas`: origen, 5 años de fábrica, seguro «hasta X meses», km
aproximados y costo por km como argumento de nivel, con las reglas duras (no
detallar letra chica, escalar reclamos, GITI no se cotiza).
(2) `aplicaciones-vehiculos.json` (122 modelos) reemplaza la tablita inline de
`fitment.ts`: fichas con aros de fábrica, confianza por ficha (alta =
validada; media/baja = confirmar), alias compuestos (H1/Starex) y
`aroEsDeFabrica()` para detectar cambio de aro.
(3) `escalera-precio.json` → módulo `escalera`: el nivel por LÍNEA manda sobre
la marca (KR628 intermedia, KR203 económica) y `tresOpciones` arma la escalera
con eso; reglas de presentación (de más cara a más económica) al prompt.
Además: `extractExplicitStore` ahora entiende «al sur» cuando el bot acaba de
preguntar el local (caso real del chat 5165) — espeja `respondiendoAlDia`.

**Por qué:** Las preguntas de duración/origen/garantía son las que más
enfrían cierres (se vio en los chats del 12 y 13-ago) y el bot no tenía el
dato oficial. Y la re-pregunta de sucursal fue el error que Joaquín reportó
con captura: el extractor exigía «Quito Sur» literal y la ruta directa
preguntaba el local ya respondido.

---

### 2026-08-13 · Garantías e INCLUIDO en grande + paleta «Depot Tire rojo» · ⏱️ 1.0 h

**Qué:** En la pieza de cotización, los sellos de garantía pasan de 132 a
200 px con rótulo propio («GARANTÍAS QUE TE RESPALDAN») y la franja INCLUIDO
CON TU COMPRA sube a 25 px con chips más grandes, borde dorado y badge «SIN
COSTO». Paleta nueva `depotRojo` («Depot Tire rojo»): el rojo medido del logo
(#e52c2a) como color dominante, fondo blanco, sin beige; la paleta `depot`
pasa a llamarse «Depot Tire negro» en Ajustes.

**Por qué:** Pedido directo de Depot el 13-ago: las garantías y lo incluido
«venden un montón» y salían en letra de trámite; y el PDF rojo de la
competencia (Grupo Inter) usa el rojo de marca a lo grande — el nuestro usaba
un vino con crema que no es de la marca.

---

### 2026-08-12 · El logo real de Depot Tire, y la paleta del sitio · ⏱️ 1.5 h

**Qué:** dos pedidos de Manuel sobre la identidad de las piezas.

**1. El logo exacto, no una recreación.** Las piezas dibujaban «DEPOT» + «TIRE»
en Archivo Black itálica. Se parecía —por eso pasó tantos meses— pero el logo
verdadero de Depot lleva **el volante dentro de la O** y la bajada «SOLUCIONES
AUTOMOTRICES», y ninguna de las dos cosas se puede sacar de una tipografía. El
cliente que abre la cotización y después entra a tiredepotec.com nota la
diferencia, y lo que nota es que la cotización no es del todo de ellos.

Ahora va el archivo de la marca, bajado del sitio y recortado a su contenido
(el PNG de Wix viene en lienzo de 500×500 con el arte al centro; queda 422×132).
Se guardan las **dos** versiones que publica el negocio: la de color y la
blanca. Las piezas usan la blanca porque el encabezado es oscuro en las siete
paletas. Va en las cuatro piezas, en el PDF de cotización y en el del reporte
diario. Si algún día falta el archivo, cae al texto de antes en vez de dejar un
hueco en el encabezado.

De paso, la cotización tenía **su propio encabezado copiado a mano** —el mismo
bloque que `depotWordmark()`, duplicado— y por eso se le quedaba atrás cada vez
que la marca cambiaba algo. Ahora las cuatro piezas comparten uno solo.

**2. Una séptima paleta, la del sitio.** Las seis que había son propuestas de
estilo; esta no se eligió, **se midió**. El oscuro y el acento salen del pixel
del propio logotipo (`#1c1e1b` y `#e52c2a`) y no del tema del sitio: el rojo que
importa es el que va a quedar **al lado del logo** en la pieza, y ni el `#ed1c24`
del tema de Wix ni el `#ce2026` de sus adornos son ese. El dorado, el borde y
los grises sí son colores declarados del sitio.

El fondo es **blanco**, no el crema de las otras seis. Eso destapó cinco beiges
hardcodeados (`#ede5d0`, `#f3edde`, `#efe8d6`, `#f1ead9`) que cerraban los
degradados del héroe, los sellos y las tarjetas: puesto el fondo en blanco,
esos beiges reintroducían por detrás justo el color que se había quitado. Ahora
son dos campos de paleta —`wash`, el cierre de los degradados claros, y `paper`,
el claro sobre fondo oscuro—, así que la próxima paleta no vuelve a chocar con
ellos. Las seis viejas conservan su crema.

**Los botones de Ajustes llevan muestras de color**, servidas desde el mismo
`PALETTES` que renderiza las piezas para que el botón no pueda mentir sobre el
color que va a salir. Con siete paletas el nombre solo ya no alcanzaba para
saber cuál es cuál sin abrir la vista previa.

**Verificado a ojo, que es como se verifica esto:** las 4 piezas renderizadas en
`depot` y en `grafito` (para confirmar que las seis viejas no se movieron), más
los 2 PDFs. Se revisó un degradado de encabezado que termina en
`rgba(0,0,0,0.35)` sospechando que el fondo blanco lo aclararía de más: da
`#979797` en depot contra `#928F88` en grafito — es el comportamiento de siempre
y no se tocó. 547 tests pasan, typecheck limpio en backend y hub.

Queda `test/render-depot-check.ts`, el script con que se verificó: renderiza las
cuatro piezas en la paleta que se le pase, al estilo de `render-demo.ts`.

### 2026-08-12 · Barrido semanal con botón, y feriados por local · ⏱️ 2.5 h

**Qué:** dos pedidos de Depot en el mismo mensaje.

**1. El barrido pasa a semanal (miércoles 15:00) con botón manual.** Los precios
cambian rara vez *y el proveedor avisa cuando pasa*, así que no tiene sentido
barrer todos los días: se barre una vez por semana y quien se entera de un
cambio aprieta **«Actualizar ahora»** en Ajustes. `forceSyncNow()` corre el
barrido en el momento y —a diferencia del automático— **lanza si falla**, porque
el que apretó el botón tiene que ver el error y no un «listo» silencioso.

Queda una red de seguridad de 8 días: si el servicio estuvo caído justo el
miércoles, el barrido se dispara igual en vez de esperar a la semana siguiente.
Con esto la cuenta baja de ~15.000 consultas diarias a **~156 por semana**.

**2. Casos especiales de horario, por local.** Los feriados no se deducen del
horario semanal, y los dos locales no siempre coinciden: el mismo 15 de agosto
Cumbayá puede abrir media jornada y Quito Sur cerrar completo. Ahora cada local
tiene su lista de fechas puntuales (fecha, motivo, horario o cerrado) en Ajustes,
y `formatStoreHours()` las inyecta en el prompt marcando **HOY** cuando toca.

Detalles que importan: solo entran al prompt las de los próximos 21 días (un
feriado de Navidad en agosto es ruido), y al guardar se **podan las pasadas**
para que la lista no crezca sola.

**Bug encontrado verificando en el navegador:** el panel entero se caía con
«Cannot read properties of undefined (reading map)» cuando los horarios llegaban
sin `excepciones` — el caso de un backend viejo sirviendo el hub nuevo durante un
deploy. Se vio comparando el render contra la versión anterior de la pantalla.
Corregido con `data.excepciones ?? []`.

**Pruebas:** `horariosEspeciales.test.ts` (6: horarios distintos por local el
mismo feriado, el marcador HOY, la ventana de 21 días, validación de horas) y
4 nuevas en `interbotSync.test.ts` (que sin ser miércoles no barre, que el botón
sí, que el botón lanza si falla, y la red de 8 días). 547 en total, typecheck
limpio en backend y hub.

### 2026-08-12 · Un solo barrido, a las 6 de la mañana · ⏱️ 0.5 h

**Qué:** el arreglo anterior dejó el barrido cada 12 h. Depot pidió que sea
**una sola pasada diaria en la mañana**, y así queda: `tocaBarrer()` mide contra
la **fecha** del último barrido bueno en hora de Ecuador y solo deja pasar uno
por jornada, a partir de las 06:00 (`INTERBOT_SYNC_HOUR`).

Medir por fecha y no por intervalo arregla de paso algo que el cambio anterior
no cubría: **cada redeploy disparaba un barrido de arranque**. Como la fecha del
último sobrevive en la base, subir cinco versiones en un día ya no son cinco
barridos — el de la mañana ya corrió y no se repite.

El reintento tras fallo sube de 2 a 30 min: si el Interbot está caído,
insistirle cada dos minutos es justo lo que no hay que hacer.

**Por qué:** los precios no han cambiado ni una vez en cinco días. Refrescar la
vitrina una vez al día sobra, y el precio que firma una cotización ya no depende
de esto — se pregunta por medida en el momento de cotizar.

**Cuenta final:** de ~15.000 consultas diarias a **~156**, más una por cotización
emitida. 2 pruebas nuevas (redeploy del mismo día no barre; con fecha de ayer sí).
538 en total, typecheck limpio.

### 2026-08-12 · 10.099 consultas al Interbot en 16 horas · ⏱️ 1.5 h

**Qué:** Depot reclamó por audio que «en cada consulta está leyendo todos los
precios» y que llevaban **10.099 búsquedas** en el día. La cuenta calza exacta y
la causa fuimos nosotros: el sync que se arregló ayer barre **155 medidas cada
15 minutos**, y desde el deploy (19:30) hasta el reclamo (11:48) van 16,3 h ×
4 barridos × 155 = **10.106 consultas**. A ese ritmo son ~15.000 diarias.

El bug de la cookie tenía el sync muerto desde el 7-ago, así que el barrido
**nunca había corrido**: arreglarlo encendió una manguera que no existía. El
comentario del código decía que 15 min era prudente «para no castigar su
servidor»; nadie multiplicó por 96 barridos al día.

Tres cambios:

1. **La cotización pregunta por SU medida, no por todas.** `refreshPriceForSize()`
   hace **1 consulta** contra `/api/chat` justo antes de imprimir la cotización,
   que es el único momento donde el precio tiene que estar al día. Si el Interbot
   no contesta, queda el del último barrido y la cotización sale igual. Es
   literalmente lo que pidió el cliente en el audio.
2. **El barrido pasa de 15 min a 12 h** (default en código + variable en
   Railway): de ~15.000 consultas diarias a **310**. Los precios no cambiaron ni
   una vez en 4 días, así que la vitrina no necesita más.
3. **Sesión reutilizable** (30 min): antes cada barrido se logueaba de nuevo.

**Por qué:** el precio correcto importa en la cotización, no en el catálogo. El
barrido existe para que la vitrina no muestre un precio viejo; confundir las dos
cosas nos costó castigar el servidor de un tercero 15.000 veces al día para
refrescar datos que no cambian.

**Pruebas:** 3 nuevas en `interbotSync.test.ts` — que cotizar cueste 2 peticiones
y nunca toque `/api/medidas`, que la sesión no se re-loguee, y que un Interbot
caído no rompa la cotización. 536 en total, typecheck limpio.

### 2026-08-12 · Una sola pregunta de ubicación, y el cruce con Contífico da 0 de 61 · ⏱️ 2.0 h

**Qué (1 — la repetición después de cotizar):** el bot hacía **tres pasos para
una sola decisión**: enumeraba los locales, acto seguido preguntaba dónde vive el
cliente, y recién después mandaba el link del mapa.

La causa no eran los links sino **dos preguntas de ubicación en el mismo turno**.
`generar_cotizacion` compone en un solo `composeBlocks` la cotización detallada y
`buildVisitPlanQuestion` («¿Qué día puede pasar y a cuál local? ¿Cumbayá o Quito
Sur?»), y el pie de la cotización detallada cerraba con «📍 ¿En qué sector estás
o puedes compartir tu ubicación?». Se quitó ese pie: la pregunta de día y local
ya estaba ahí y es la que sirve.

Los mapas ahora salen **solo cuando la ubicación ya está resuelta**, en las dos
ramas de `local_mas_cercano` — la de sector/pin y la de local elegido
explícitamente, que hasta hoy **no mandaba ningún link** (y es el camino más
común, porque el cliente escribe «Cumbayá» y lo agarra `extractExplicitStore`).

Van **los dos locales**, con el elegido primero: el cliente puede cambiar de
opinión y pedir el otro link cuesta un turno entero. Para eso **Quito Sur estrena
`mapsUrl`** — el link existía solo en `PROYECTO.md`, así que si el local
recomendado era Quito Sur no salía mapa ninguno. El candado de «una sola vez» es
por conversación y mira los mensajes realmente enviados (mismo criterio que
`buildBenefitsBlockOnce`), así un envío fallido no consume el único disparo.

Los links no tenían **ni un test**; ahora sí.

**Qué (2 — el cruce con Contífico):** script nuevo en
`app/scripts/cruce-facturas/`. Baja los 5.804 documentos de cliente y el padrón
de 273 personas, y cruza contra los teléfonos que el bot cotizó. La llave es el
teléfono normalizado a los **últimos 9 dígitos**: la BD guarda el `wa_id` de Meta
(`593982801766`) y Contífico el número local (`0982801766`).

**El resultado es 0 de 61.** Ninguno de los 61 teléfonos cotizados por el bot
($42.643,74 cotizados) aparece en Contífico — ni facturado, ni con proforma, ni
siquiera creado en el padrón. No es un bug de normalización: se verificó
comparando las claves de los dos lados a mano.

El motivo se ve en los datos: ese Contífico es la operación **mayorista**. 1.267
facturas repartidas entre **69 clientes**, casi todos empresas (CENTRO
AUTOMOTRIZ 202, PITSTOP S.A.S. 179, ECUATIRE 104, JAPANTIRES 71). El bot atiende
consumidor final por WhatsApp, y ese mostrador **no factura en esta cuenta** —o
factura a consumidor final sin teléfono (325 de 1.267 facturas no traen ni el
teléfono del cliente).

**Por qué:** la repetición era lo que más se notaba leyendo los chats — tres
mensajes para pedir un dato ya dado. Y el cruce nació de querer medir la
conversión de verdad: hoy «venta ganada» es lo que alguien marcó a mano en el
Kanban (`sales_history`), sin contraste contra facturación. Ahora sabemos que ese
contraste **no se puede hacer con esta cuenta de Contífico**, y eso es el
hallazgo: antes de medir conversión hay que averiguar con Depot dónde se factura
el mostrador, o pedir que el asesor registre el teléfono al facturar. Sin una de
las dos, la conversión real del bot es inauditable.

**Notas de la API:** la v2 de Contífico **ignora** los filtros `tipo_documento` y
de fechas (devuelve el mismo total sin importar lo que se mande); el único que
respeta es `tipo_registro`. Por eso se baja todo y se filtra en local. La v1 de
`/documento/` cuelga hasta el timeout. Y `CONTIFICO_TOKEN` está en `app/.env`
pero **no lo lee nadie** en el código.

El volcado queda en `datos/`, **ignorado por git**: trae nombres, RUC, correos y
direcciones de clientes reales.

### 2026-08-11 · El sync de precios llevaba 4 días muerto por media cookie · ⏱️ 1.5 h

**Qué:** El sync en vivo del Interbot **nunca corrió**, ni siquiera con las
credenciales puestas en Railway: el log repetía `fuente snapshot,
2026-08-07` y, al ponerle usuario y clave, `Sync de precios Interbot falló
(Interbot devolvió 0 medidas)`.

La causa es que el Interbot usa **sesión firmada (Koa)** y el login deja **dos**
cookies, `interbot.sid` y `interbot.sid.sig`. El código hacía
`headers.get("set-cookie").split(";")[0]` y se quedaba con la primera; sin la
firma, el Interbot responde `{"error":"No autenticado"}` a todo. Verificado
contra la API real: una cookie → `No autenticado`; las dos → 200 y 155 medidas.
Ahora se recogen todas con `getSetCookie()`.

Cuatro mejoras más, todas de cosas que se vieron leyendo el caso:

1. **El barrido ya no bloquea al cliente.** `ensureInterbotPricesFresh()`
   esperaba el barrido completo, y lo llama `ensureCatalogReady()` desde la tool
   de cotizar: el primer mensaje tras 15 min de calma pagaba la espera entera
   antes de recibir respuesta. Ahora solo se espera si no hay NINGÚN precio en
   memoria; teniendo snapshot, el refresco corre en segundo plano.
2. **Barrido en paralelo** (5 a la vez): de ~30 s secuenciales a **3,7 s
   medidos** contra el Interbot real, 373 productos de 155 medidas.
3. **El último sync bueno se guarda en `settings.interbot_precios`** y se
   rescata al arrancar. Sin esto, cada redeploy volvía a los precios del 7-ago
   aunque el sync llevara semanas corriendo bien.
4. **Reintento a los 2 min tras un fallo**, no a los 15. Un fallo marcaba
   `lastLiveSyncAt` como si hubiera funcionado, así que una caída de un minuto
   dejaba los precios viejos un cuarto de hora.

Y el error de sesión ahora se distingue de «no hay medidas», que es lo que hizo
que esto tardara: el síntoma apuntaba al Interbot y la culpa era nuestra.

**Por qué:** hoy Joaquín reclamó que el bot «dio mal los precios» (KR23:
vendedor $55,64, bot $64,82). **El bot tenía razón** —el cliente pidió 165/60R14
(K257B475, $64,82) y el vendedor miró la 165/65R14 (K246B404, $55,64): dos SKU
distintos del mismo modelo—, pero al revisarlo salió que los precios llevaban
desde el 7-ago congelados. No se notó porque en esos días el Interbot no cambió
ningún precio: el barrido nuevo reporta «sin cambios de precio» contra el
snapshot. Era una bomba de tiempo, no un problema visible.

**Pruebas:** `test/interbotSync.test.ts` con un Interbot de mentira que solo
responde con las dos cookies — cubre el bug, el barrido bueno, el mensaje de
sesión rechazada y el guardia del 50%. 4 nuevas, 529 en total, typecheck limpio.

### 2026-08-10 · Botón en toda fila + la plata en juego arriba · ⏱️ 0.25 h

**Qué:** Dos pedidos de Manuel viendo el primer reporte real. (1) El **«abrir
chat →»** ya no es exclusivo de la sección de errores: va en todas las filas.
El nombre siempre fue un enlace, pero en un PDF nada indica que un texto se
pueda tocar y el asesor no iba a descubrirlo — el PDF pasó de 25 a 40
anotaciones de enlace. (2) Sexta tarjeta arriba: **«EN JUEGO SIN CERRAR»**, la
suma de TODOS los cotizados pendientes (no los del día), con el filo y el número
en el acento de la marca. Se calcula sobre el total, no sobre las doce que se
listan: recortar la lista es una decisión de lectura y no puede achicar la plata
que hay sobre la mesa. Va sin centavos, que en esa cifra no deciden nada. La
tarjeta se **invierte** (fondo oscuro, cifra en oro) en vez de teñirse con el
acento: en la paleta «rojo» —la que Depot tiene puesta— el acento es casi negro
(#191919) y la destacada quedaba más apagada que las otras cinco. `dark` y
`gold` sí contrastan en las seis.

**Por qué:** las otras cinco cifras miran hacia atrás (qué pasó ayer). Esta mira
hacia adelante y es la que justifica abrir el panel un domingo.

**De paso:** `montoCorto` quedó blindado contra no-números. El tipo garantiza un
`number`, pero se vio un `$NaN` renderizando con un fixture viejo, y un NaN en
una cifra de dinero es de las pocas cosas que destruyen la confianza en un
reporte de un vistazo — ese PDF termina en el teléfono de un asesor.

---

### 2026-08-10 · El reporte cuenta el día, no el arrastre · ⏱️ 0.5 h

**Qué:** Al pedir el reporte contra la base REAL de Depot (antes de mandárselo a
nadie) salió: `piden asesor 202 · errores 74 · técnicos 108`. Inservible. Dos
correcciones, las dos medidas contra producción:

1. **Las alertas del reporte se acotan a la ventana.** Eran todas las abiertas
   desde siempre (897 vivas hoy). El tab del panel sigue mostrándolas todas —ahí
   es una bandeja de tareas— pero el reporte es un parte diario. Con el corte:
   197 alertas nacidas en la ventana → **1 error de conversación + 10 técnicos**,
   porque la taxonomía descarta 113 `advisor_follow_up`, 40 `recommend_close_lost`,
   30 `two_follow_ups_no_reply` y 5 `window_closing`.
2. **«Piden asesor» pasa a ser «está esperando respuesta».** El criterio viejo
   era `assigned_to='human'`, y eso no significa lo que parece: un envío manual
   desde el panel voltea el chat a humano y **nunca lo devuelve al bot**, así que
   202 de 368 conversaciones abiertas figuran como humanas — más de la mitad del
   censo, casi todas ya atendidas. Ahora entra quien tiene alerta
   `human_requested` abierta (5) o está en manos humanas **con el último mensaje
   del cliente**, o sea nadie le contestó (23). Total: **26** accionables.

También se probó un corte por antigüedad (14 días sin hablar) y **no servía**:
los 202 tenían actividad reciente. El problema no era que fueran viejos, era el
criterio. Queda igual como red de seguridad.

**Por qué:** el reporte se iba a enviar con "74 errores" en la cabecera — la
misma enfermedad que fuimos a curar al tab de errores. Un número que nadie puede
accionar entrena al asesor a ignorar el mensaje entero.

**⚠️ Divergencia conocida:** el tab Oportunidades del panel sigue con el criterio
viejo de "Piden asesor" (`atiende=humano`), así que ahí siguen apareciendo ~202.
El reporte y el tab dejaron de coincidir en esa sección. Alinearlo es el
siguiente paso; se dejó fuera para no cambiar la UI sin verla.

**Dato suelto que salió de paso:** 10 `send_error` en un solo día en Depot —
mensajes que el bot no logró entregar. Vale la pena mirarlo aparte.

---

### 2026-08-10 · Reporte diario 20:00 + el tab de errores solo con errores · ⏱️ 3.0 h

**Qué:** Dos cosas que iban juntas — el reporte de la noche necesitaba una lista
de errores en la que se pudiera confiar, y el tab no la daba.

**1. Qué es un error y qué no** (`services/alertTaxonomy.ts`). `bot_alerts`
mezclaba tres cosas y el tab las mostraba todas, así que el contador marcaba
decenas todo el día y el asesor dejó de mirarlo. Ahora se clasifican:
`conversacion` (el bot se rompió DENTRO del chat: se repitió, se atascó, saludó
a mitad de hilo, el cliente se molestó — lo único que es un error),
`tecnico` (no salió un envío, falta plantilla, el aviso no se entregó → se
muestra SOLO con el número, agrupado: es del desarrollador, no una tarea
comercial) y `operativo` (ventana de 24 h, seguimientos, visitas, "pide asesor"
— no son errores y ya se ven en Cotizados, Piden asesor y el pipeline). Un tipo
desconocido cae en `conversacion`: equivocarse hacia "visible" se nota y se
corrige; hacia "oculto", no. Mismo filtro en el tab Oportunidades y en el badge
"Alertas del bot" del Inbox, que contaba lo mismo.

La **ventana de 24 h cerrándose además deja de generarse**: es el reloj de Meta
corriendo, no un fallo del bot, y se creaba una alerta por CADA conversación que
el cliente dejaba enfriar. `reconcileFollowUpAlerts` resuelve las que quedaron
abiertas, así que la base se limpia sola en el primer arranque.

**2. El reporte del día.** Sale a las 20:00 de Ecuador y cubre desde las 20:00
del día anterior. Mismas divisiones que el tab Oportunidades — no es un informe
aparte, es el tab en el bolsillo del asesor cuando cierra la tienda. PDF con
links de verdad a cada conversación (por eso pdfmake y no una imagen de satori:
una imagen no se puede tocar) y un texto que lo acompaña con los números, para
que algo llegue aunque Meta rechace el adjunto. El diseño sale de `depotDesign`:
barra de carreras, líneas de velocidad, y la paleta y la fuente de precio que el
negocio ya eligió en Ajustes — cambiar el color de las cotizaciones cambia el
reporte. Rutas para verlo antes de las ocho: `/api/hub/reporte-diario{,.html,.pdf}`
y `.../enviar` para forzarlo.

**Verificado de verdad**, no por lectura: 525 tests (25 nuevos), el candado del
día contra un Postgres real (4 procesos simultáneos → UN reporte), las seis
paletas renderizadas y revisadas una por una, y el PDF generado desde `dist/`
COMPILADO para confirmar que las fuentes resuelven como lo hará Railway. De
paso salieron tres bugs de maquetación que sólo se ven mirando el PDF: las
tarjetas de métricas se salían de la página (el filo dorado era un `canvas` de
ancho fijo e imponía ese mínimo a la columna), el rótulo de la derecha quedaba
cortado (pdfmake ignora `width` con `absolutePosition`) y en las paletas cuyo
acento ya es rojo (navy, carbon) la barra de "no vino" no se distinguía.

**Por qué:** el asesor cierra la tienda a las seis y no vuelve a abrir el panel;
lo que no le llegue al teléfono no existe. Y el tab de errores había dejado de
servir por exceso: cuando todo es una alerta, nada lo es.

**Ojo con la ventana de 24 h de los asesores.** El envío es texto libre, así que
Meta lo rechaza (131047) si el asesor no le ha escrito al número del negocio en
las últimas 24 h — el mismo motivo por el que Joaquín no recibió ningún aviso el
8-ago. Por eso el candado del día se SUELTA cuando no lo recibió nadie: el bucle
reintenta cada cuarto de hora y el reporte entra en cuanto el asesor escribe.
Pasada la medianoche se deja de intentar (a nadie le sirve el reporte de ayer a
media mañana). Si un día no llega, la causa casi segura es esa, y la solución es
que el asesor mande cualquier mensaje al número.

---

### 2026-08-09 · El panel sobrevive a Railway degradado · ⏱️ 1.5 h

**Qué:** Noche de 502 y cuelgues intermitentes (~30 % de las peticiones no
respondían nunca; le pasaba igual a Jardín Express, otro proyecto Railway → la
plataforma, no el código). El panel no estaba preparado: **una** petición
perdida lo dejaba roto y sin avisar. Cuatro cambios:

1. **Reintentos con corte** (`realSource.request`): las lecturas (GET) cortan a
   los 9 s y se reintentan hasta 3 veces con espera creciente; escribir NO se
   reintenta (reenviar un POST podría mandarle dos mensajes al mismo cliente) y
   una clave inválida nunca reintenta.
2. **Carga por partes** (`store.refrescar`): era un `Promise.all` de ocho — si
   una fallaba se perdían las ocho y el panel se declaraba sin conexión. Ahora
   los tickets se pintan apenas llegan, phases/power van por su lado, y lo
   secundario (feed, métricas, seguimientos, alertas) rellena después. Solo se
   muestra el portón de "sin conexión" si NO llegó nada.
3. **Fases recordadas** en `localStorage`: deciden qué pestañas existen, así que
   perder `/api/phases` borraba Oportunidades, Cotizador y Métricas de la barra.
   Ahora arranca con lo último que se supo y corrige cuando el servidor conteste.
4. **Tipografías no bloqueantes** en `index.html` (`media="print"` + `onload`):
   las 7 familias de Google ya no retrasan el primer dibujado.

**Verificado de verdad**, no por lectura: servidor de prueba que sirve el panel
COMPILADO en modo real con `/api/phases` colgado las 2 primeras veces. Antes:
3 pestañas y skeleton gris. Después: panel completo con sus 6 pestañas y los
tickets en ~1 s, mientras la petición seguía colgada. Medido de paso: el
catálogo tiene 372 conversaciones, `listHubTickets` tarda ~760 ms y pesa 427 KB
de JSON (49 KB comprimido — Railway ya comprime en el edge, no hace falta el
middleware `compression`).

**Por qué:** un panel que se rompe entero porque una de ocho peticiones se
perdió es frágil de más para el celular de un asesor en la calle. Y el modo de
falla era el peor posible: silencioso, con media aplicación desaparecida.

---

### 2026-08-09 · PWA instalable + composer pegado al teclado · ⏱️ 0.5 h

**Qué:** El hub ahora es instalable: `manifest.webmanifest` (standalone,
íconos DT 192/512 generados con Chrome headless desde el SVG) + metas de
Apple (`apple-touch-icon` 180, `apple-mobile-web-app-capable`). "Añadir a
pantalla de inicio" abre el panel a pantalla completa, sin barra de Safari.
Además, con el teclado abierto el composer del chat suelta el padding de
safe-area (la barra del home queda detrás del teclado y ese padding era una
franja blanca muerta entre el input y el teclado).

**Por qué:** la píldora del URL de Safari se colaba visualmente entre el chat
y el teclado y rompía la sensación de app — Manuel: "que se sienta como una
sola, como si fuera WhatsApp". Esa píldora es chrome de Safari: no se puede
pintar encima desde la página; instalada como app desaparece de verdad. Ojo:
la app instalada tiene su propio localStorage → pide la ADMIN_KEY una vez.

---

### 2026-08-09 · Chat calzado al teclado de iPhone + decidir desde el chat + kanban móvil · ⏱️ 1.5 h

**Qué:** Tres arreglos sobre el iPhone real de Manuel. (1) El chat de la baraja
ahora se calza EXACTAMENTE sobre el área visible: sigue `offsetTop` del
`visualViewport` (Safari con teclado abierto deja arrastrar la página entera y
se veía la tarjeta vieja asomarse debajo del chat) escuchando `resize` Y
`scroll`, y mientras se escribe la baraja de atrás se oculta — aunque Safari
panee, atrás no hay nada que confunda. (2) Decidir sin salir del chat: botones
✕ (perdida) y ✓ (ganada / para después) en la cabecera del chat; cierran el
chat y abren la confirmación de siempre. (3) Kanban móvil: se acabó el drag &
drop con el dedo — las tarjetas son de solo-lectura (scroll libre) y cada una
lleva "⇄ Mover de etapa", que abre una hoja con las 5 etapas (la actual
marcada) + cerrar ticket ganado/perdido. En desktop el arrastre sigue igual.

**Por qué:** en el teléfono el teclado rompía la pantalla de responder (se
podía scrollear a la vista anterior) y el kanban táctil confundía arrastrar
con scrollear: mover un ticket era una lotería. Ver es scroll; mover es un
toque explícito.

---

### 2026-08-09 · Chat de la baraja a pantalla completa + fix del zoom fantasma · ⏱️ 1.0 h

**Qué:** Responder desde la baraja ya no se hace dentro de la tarjeta: tocar
"Responder a …" abre un chat a pantalla completa (slide-up estilo app de
mensajes) con cabecera compacta (volver · cliente · monto · medida · chip
bot/ustedes), la conversación a todo el alto y el composer siempre visible
encima del teclado. El alto sigue a `visualViewport` (en iOS el teclado no
encoge `dvh`) y en Android el meta `interactive-widget=resizes-content` hace
que el teclado achique el viewport en vez de taparlo; el input usa 16px en
móvil para que iOS no haga zoom al enfocar, `enterKeyHint="send"`, autofocus y
se re-enfoca tras enviar para encadenar mensajes. Al enviar, el chat pasa a
"ustedes" y el bot se pausa (handoff del backend); un toque lo devuelve al bot.
Además: `overflow-x: clip` en `html`/`body` — las tarjetas que salían volando
a ±420px expandían el layout viewport del celular y TODO el panel quedaba
"zoomeado" hasta recargar.

**Por qué:** escribir dentro de una tarjeta arrastrable, con el teclado encima
y tres franjas de UI compitiendo, era ilegible — Manuel: "se abre y medio que
es difícil leer y se siente raro". La tarjeta es para decidir; escribir merece
su propia pantalla, como en Tinder o WhatsApp.

---

### 2026-08-09 · Oportunidades reorganizado: cuadrícula, baraja swipe y "Para después" · ⏱️ 3.0 h

**Qué:** El tab Oportunidades se reorganizó en tres vistas por botones grandes:
**Cotizados** (cotización enviada en adelante — cuadrícula densa donde cada
tarjeta muestra la fecha en que el cliente dijo que viene, el monto cotizado,
la ubicación, la medida y la llanta), **Piden asesor** (pidieron humano, van a
llamar o preguntaron algo que el bot no alcanza) y **Errores** (alertas del
bot: conversación repetitiva, fallos). Dentro de cada vista, **"Revisar uno por
uno"**: una baraja estilo swipe (móvil y desktop, con drag, botones y flechas
del teclado) — izquierda = perdida, derecha = ganada o **"para después"** — con
el chat completo adentro, composer para responder como vendedor y el toggle de
si sigue el bot o toma el equipo. Los "para después" persisten en la base
(`conversations.review_later_at`, endpoint nuevo) y se pintan como banda
prioritaria arriba del tab hasta cerrarse. De paso: la tab bar del celular
ahora reparte el ancho entre las 6 pestañas (Métricas y Ajustes quedaban fuera
de la pantalla) y "Saltar" en la baraja ya no anima como si fuera ganada.

**Por qué:** Cotización enviada es donde el bot más o menos acaba y el asesor
se tiene que poner las pilas: esa vista tiene que mostrar muchos clientes a la
vez con lo que hay en juego, no una lista de seguimientos técnicos. Y revisar
chats uno por uno con una decisión obligada por chat (perdida / ganada /
después) convierte "revisar el panel" en una tarea con final, también desde el
teléfono.

---

### 2026-08-09 · Menos tokens sí; menos ventas no puede ser el precio · ⏱️ 1.0 h

**Qué:** Se auditó el domingo contra el sábado por costo total, conversación,
mensaje, corrida y resultado comercial, excluyendo las pruebas de los asesores.
Se reconciliaron los ~$15 observados el sábado con el cache no registrado por el
logger anterior, se revisaron siete chats completos y se archivaron datos,
análisis y un reporte HTML bajo `2026-08-09-2124-costos`.

**Por qué:** El domingo tuvo menor demanda, así que mirar solo el total podía
atribuir al ahorro lo que en realidad era menos tráfico. El costo normalizado sí
mejoró, pero intención de precio → cotización cayó de 88,9% a 9,1%; el próximo
cambio debe recuperar ese cierre sin deshacer la eficiencia conseguida.

---

### 2026-08-09 · La foto habla; el texto deja de repetirla · ⏱️ 0.5 h

**Qué:** El bloque *INCLUYE* ahora aparece únicamente con la primera pieza del
ciclo y solo se habilita otra vez si el cliente pregunta por beneficios o
garantías. Después de una cotización visual, el texto queda reducido a cantidad,
modelo y total. El número, precio unitario, IVA e instrucciones de tienda ya no
se duplican: el código queda una sola vez, dentro de la pieza. Al reenviar, el
bot solo confirma que volvió a mandar la cotización.

**Por qué:** La imagen ya contiene toda la ficha y el número de cotización. El
texto anterior repetía esa misma información hasta tres veces y convertía cada
avance en una cadena larga. El resumen corto conserva el dato decisivo —el total—
sin obligar al cliente a leer dos versiones de la misma cotización.

---

### 2026-08-09 · El bot muestra desde el saludo que sí sabe asesorar · ⏱️ 0.5 h

**Qué:** El saludo genérico ahora es determinístico y presenta la medida o la
foto como la vía más rápida, pero ofrece también empezar por marca, modelo y año
del vehículo, aro o uso, y comparar opciones. Las consultas que ya traen datos
concretos conservan el agente completo. El contrato compacto y el largo quedaron
alineados con la misma regla.

**Por qué:** El mensaje anterior empujaba bien a mandar la medida, pero sonaba
como un formulario que solo aceptaba medida o foto. Eso escondía la capacidad
real del bot y podía frenar a quien solo conoce su vehículo. Resolver el saludo
sin IA además reduce tokens sin sacrificar efectividad.

---

### 2026-08-09 · «Martes 10 am» se registra, no se vuelve a preguntar · ⏱️ 0.5 h

**Qué:** La ruta determinística de visita ahora usa la existencia de una
cotización aunque el Kanban vaya atrasado. `local_mas_cercano` detecta fecha o
compromiso ya guardados y devuelve una confirmación corta, sin repetir dirección,
local, descuento ni la pregunta por el día.

**Por qué:** En un chat real el bot preguntó cuándo vendría a Cumbayá, el cliente
respondió «Martes 10 am» y la siguiente respuesta volvió a preguntar el día con
el mismo argumento del descuento. El dato sí estaba en la base; la salida fija
de la tool lo ignoraba.

---

### 2026-08-09 · Hotfix: GPT-5.5 vuelve a responder con herramientas · ⏱️ 0.5 h

**Qué:** Las llamadas del agente con function tools ahora mandan
`reasoning_effort: none`; las llamadas sin tools conservan `low` y el rescate
`medium`. Se añadió una prueba de regresión con la matriz exacta aceptada.

**Por qué:** GPT-5.5 en Chat Completions rechaza tools junto con reasoning `low`
con HTTP 400. El health seguía verde porque el proceso, catálogo y WhatsApp
estaban sanos, pero los turnos morían al llegar a OpenAI. Los tickets 2693 y
2700 permitieron identificar el contrato real de la API.

---

### 2026-08-09 · Menos tokens sin quitarle el cerebro que sí vende · ⏱️ 4.0 h

**Qué:** Se implementó el plan de eficiencia para la prueba del 10-ago: rutas
determinísticas para reenviar la cotización y capturar local/fecha, nueva tool de
reenvío, comparación disponible después de cotizar, memoria completa de visita,
prompt compacto, historial configurable, tres rondas más rescate, reasoning bajo,
candado de tools repetidas, visión con caption/presupuesto suficiente y telemetría
de caché/razonamiento/ruta. Quedó preparado `OPENAI_ROUTINE_MODEL`, pero mañana
empieza en GPT-5.5. Se documentó diseño, medición, rollout y rollback en
`docs/PLAN_REDUCCION_COSTOS_IA.md`.

**Por qué:** GPT-5.5 multiplicó las cotizaciones y el modelo anterior perdió
ventas; bajar todo para ahorrar era destruir la mejora. El gasto evitable estaba
en llamadas exactas, 30 mensajes de contexto y loops de ocho rondas. Además el
bot guardaba local/fecha sin recordarlos y el anti-duplicado impedía entregar la
misma imagen cuando el cliente sí la pedía. El nuevo orden ahorra primero donde
el riesgo es mínimo y deja el downgrade por etapa condicionado a datos reales.

---

### 2026-08-08 · El primer mensaje siempre saluda, y el eval deja de medir un bot degradado · ⏱️ 2.0 h

**De dónde sale:** Manuel, sobre el eval de calidad — «arréglalo» — y una pedida nueva: «asegúrate que siempre
que manda un primer mensaje a un cliente salude primero».

**1. El saludo dejó de depender del modelo.** El prompt ya lo pedía en «El mensaje de entrada», pero un prompt
es una intención, no una garantía: basta que el modelo arranque directo con la pregunta por el aro para que la
primera frase de una llantera con 30 años sea un interrogatorio. Ahora `sendCustomerText` —el embudo por donde
pasa todo lo que va al cliente— revisa si es el primer TEXTO de la conversación y, si le falta saludo, se lo
antepone. Lógica pura en `domain/saludo.ts` para probarla sin levantar base. Detalles que importan: el dueño
escribiendo a mano NUNCA se toca; si el modelo ya saludó no se duplica; y los pushnames de WhatsApp se filtran,
porque saludar «¡Hola, angelbarreiro1986!» se lee peor que no saludar (`nombreSaludable`). Se mira solo el
historial de texto, así que si una pieza salió antes, el saludo igual le toca al primer mensaje escrito. Ante
cualquier error de base devuelve el texto tal cual: un saludo no vale romper un envío. Verificado en el eval —
las 8 conversaciones de cliente saludan; el asesor, que va por otra función, no.

**2. El eval estaba midiendo al bot en su peor versión, y nadie lo sabía.** Tres fallas encadenadas:

- **El stub de Graph rompía TODAS las imágenes.** `uploadMedia` sube el PNG a `/{phoneId}/media` y espera `{id}`;
  el stub respondía el shape de un MENSAJE, sin `id` arriba. Resultado: cada pieza fallaba, `preparar_opciones`
  caía a su fallback de texto largo —que existe justamente para que el cliente nunca se quede sin opciones— y el
  eval calificaba ese camino degradado como si fuera el normal. De ahí salían `inventa_precio`, `demasiado_largo`
  y `exceso_emojis` en cascada: no era el bot siendo verboso, era el bot compensando una imagen que nunca salió.
- **La rúbrica leía solo el ÚLTIMO mensaje del turno.** El bot contesta en varios bloques separados por `---`, así
  que se calificaba la coletilla («¿Necesita alguna recomendación?») en vez de la respuesta. Varios turnos salían
  «sin fallos» por mirar un fragmento inofensivo. Ahora se lee todo lo que salió en el turno.
- **La espera era fija (9 s).** Un turno que renderiza y manda una pieza tarda más, así que el eval leía antes de
  que el bot hablara y anotaba `vacio`. Ahora espera a que diga algo y después a que se calle.

**3. Dos reglas de la rúbrica contradecían lo que el bot hace hoy.** `pide_foto` (regla de Joaquín, 5-ago:
«que no pida fotos hasta que no pueda leer») reprobaba en CRÍTICO cualquier mención a una foto — pero desde
`services/vision.ts` sí las lee, y la migración 012 repuso esa vía a propósito el 8-ago. Se reemplaza por
`pide_sin_ofrecer`, que atrapa el error de verdad, el del ticket 2150: pedir el dato y no dejarle nada al
cliente en la misma respuesta. Y `no_pide_medida` solo reconocía la palabra «medida», no «aro» ni «rin», así
que reprobaba justo la conducta que shipeó `28ed12e`. Ojo con la negación: la primera versión de
`pide_sin_ofrecer` daba por buena la frase «**no tengo** una medida verificada» porque contenía «tengo» — la
que el dueño mandó eliminar. Hay lookbehind y test para eso.

**4. Un caso nuevo que reproduce el 2150:** cliente que pide cotización sin medida, sin aro y sin vehículo, y
vuelve a pedir sin darlo. Es el único que ejercita `opciones_sin_medida`, y sin él el eval daba verde sin haber
probado nada del arreglo anterior.

**Resultado:** de ❌ ROJO con 12 fallos críticos a ✅ **VERDE, 0 críticos y 0 altos**, con el juez subiendo de
~3.4 a 4.24/4.18/4.59/4.41. Y quedó probado en vivo lo que faltaba del commit anterior: el modelo SÍ llama
`opciones_sin_medida`, los dos pasos disparan, y salen 9 imágenes reales donde antes salían 0.

---

### 2026-08-08 · Joaquín llevaba 62 avisos sin recibir, y la tabla decía «enviado» · ⏱️ 1.5 h

**De dónde sale:** Manuel, mirando su WhatsApp: «no le está notificando a Joaquín Tamayo como
asesor también». Los avisos figuraban como enviados desde el día que se lo agregó.

**Eran dos fallos encadenados, y ninguno se veía.**

1. El número estaba tecleado **+32** (Bélgica) en vez de **+34**. La Graph API acepta cualquier
   número con formato válido, devuelve un wamid, y recién por webhook rechaza con el 131026. En la
   base de Depot: 62 avisos en estado `sent`, cero errores, cero entregas.

2. Corregido el número, **seguía sin llegar**: error 131047. WhatsApp solo permite texto libre a
   quien le escribió al número del negocio en las últimas 24 h. Manuel nunca lo notó porque él le
   escribe al bot todo el día — su ventana está siempre abierta. Joaquín no le había escrito nunca,
   así que ni con el número bueno podía recibir nada.

**Por qué la tabla mentía:** `recordMessageStatus` reconciliaba `messages` y `follow_up_attempts`
por `provider_message_id`, y saltaba justo `advisor_notifications`. El estado se ponía en `sent` al
recibir el wamid — aceptar no es entregar. Meta sí avisaba del fallo; el aviso se guardaba en
`message_status_events` y nadie lo leía.

**Qué se decidió.** La salida oficial para el 131047 son plantillas aprobadas: cuestan (~$15-40 al
mes al ritmo de hoy) y hay que hacerlas aprobar. Manuel prefirió lo otro: que el sistema avise antes
de que la ventana se cierre y él le pide al asesor que mande un mensaje. Es más barato y no depende
de una aprobación de Meta; a cambio, depende de que alguien haga caso al recordatorio.

**Lo que quedó:**
- `advisors.ventana_hasta`, que se refresca con cada mensaje entrante del asesor. No lo saca del
  pipeline a propósito: un asesor probando el bot tiene que ver que le contesta.
- Recordatorio 3 h antes de que venza, o de una si nunca escribió. Uno por asesor por día.
- El texto dice a quién escribirle, qué pedirle y a qué número — con test de que **no** menciona
  «131047» ni «ventana de 24 h», que a quien lo lee no le dicen nada.
- Un rechazo de Meta ahora deja el aviso en `failed` con el código y levanta UNA alerta por número
  (no una por aviso rebotado) que distingue los dos casos y dice qué hacer con cada uno.
- En la base de Depot: el +32 quedó **inactivo**, no borrado, y el +34 renombrado a «Joaquín Tamayo».

**Por qué importa:** un aviso que no llega es peor que uno que no se intentó — el que lo mandó cree
que hay alguien atendiendo. Ese es el mismo agujero del cliente de Yantzaza de esta mañana, visto
desde el otro lado.

---

### 2026-08-08 · Seguimiento y cotización vuelven a poder mostrar llantas · ⏱️ 1.5 h

**De dónde sale:** el ticket 2150, mirándolo en vivo. El cliente escribió *«xfavor ya le envío y q
me ayude con una cotización»* y el bot contestó, por tercera vez seguida, que le mandara la foto de
la medida. Manuel terminó mandando las opciones de rin 13 a mano. Su pedido: «si piden opciones que
las manden al cliente, hay que darle lo que pide».

**La causa no era el prompt.** El prompt ya prohibía cerrar un turno con una limitación y una
pregunta sin ofrecer nada (regla 3), y ya mandaba mostrar opciones con solo el aro (paso 1c). El
problema estaba dos capas más abajo: la conversación estaba en etapa `seguimiento_venta`, y esa
etapa tenía exactamente tres herramientas —`fitment_vehiculo`, `local_mas_cercano`,
`notificar_vendedor`—. Ni `buscar_llanta`, ni `buscar_por_aro_y_tipo`, ni `preparar_opciones`, ni
`guia_medida`. Y `agent.ts` filtra por `allowed_tools` **antes** de ofrecerle nada al modelo
(`allowed.has(tool.function.name)`), así que el bot no se negó a mostrar opciones: no tenía con qué
mostrar una sola llanta. Lo único que sabía hacer ahí era repetir la pregunta.

`cotizacion_enviada` tenía el mismo hueco: una vez cotizado, tampoco podía volver a mostrar nada.
Las dos etapas se escribieron desde el objetivo del vendedor —conseguir fecha y local, cerrar—,
pero el cliente no sabe en qué etapa está: pide opciones cuando se le ocurre, y cuando pide, hay
que dársela.

**Las dos etapas de cierre recuperan las herramientas de venta**, y seguimiento además
`generar_cotizacion` — un «¿a cómo las 4?» en seguimiento es exactamente el mismo bug.

**`opciones_sin_medida`, la salida del callejón sin salida.** Cuando no hay medida NI aro NI
vehículo no existía una sola tool que el modelo pudiera llamar: con las manos vacías lo único que
le queda es preguntar, y pregunta para siempre. La tool decide por él en dos pasos, y los dos pasos
van en código porque son criterio de negocio, no juicio del modelo: la primera vez devuelve los
aros que hay en stock para pedir el aro ofreciendo algo concreto («¿qué aro usa? tenemos del 13 al
22»); si el cliente vuelve a pedir sin darlo, devuelve muestra real del stock y obliga a mandarla
con `preparar_opciones` explicando por qué el aro manda e invitando a medirlo en el local. El
rastro determinista de «ya se le pidió una vez» es que la pieza de `guia_medida` ya salió.

**La foto nunca fue el problema.** `preparar_opciones` ya renderiza y envía la imagen, y su
`sizeLabel` es opcional — la pieza sabe salir sin medida. No había que construirla: había que poder
llegar hasta ella.

**Migración `014`, por lo mismo que la 012.** `ensureDefaultStagePrompts` inserta la versión 1 con
`on conflict (stage, version) do nothing`, así que cambiar el default del código **no le llega** a
staging ni a Depot, que llevan semanas con su fila sembrada. La migración une, nunca quita, y sin
condicionar al texto del prompt: darle con qué vender a un negocio no le cambia lo que dice, y
negárselo porque editó su prompt lo dejaría justo en el problema que la migración viene a arreglar.
Hay test de integración que lo prueba sobre una base **ya sembrada con las listas viejas**, que es
el caso real de Depot.

**Corrección de coordinación:** el commit anterior (`28ed12e`) se llevó por delante este trabajo a
medias — dejó `opciones_sin_medida` definida y nombrada en el prompt, pero fuera del `allowed_tools`
de toda etapa. Producción quedó una hora con el modelo recibiendo la orden de llamar una tool que el
gate le escondía. Esto lo cierra.

**De paso:** el panel mostraba una lista de herramientas vieja (le faltaban `buscar_por_aro_y_tipo`,
`tipos_de_llanta` y `guia_medida`), así que el dueño no podía ver ni encender cosas que su bot sí
tenía. Y `rangoDeAros` salió a `domain/aros.ts` para poder probarla sin levantar base, mismo
criterio que `opcionesCandados`.

**Verificado:** typecheck de app y hub, 454 tests en verde (10 nuevos), y contra el catálogo vivo de
Contífico — el bot diría «tenemos del 13 al 22» y es cierto: aros 13 a 22 con stock y sin huecos.
Lo que **no** se pudo verificar es que el modelo de verdad elija llamar la tool nueva: no hay
`OPENAI_API_KEY` local, así que falta correr `npm run test:calidad` con la key de Railway.

---

### 2026-08-08 · El aro manda, y después de cotizar solo importan fecha y local · ⏱️ 2.0 h

**De dónde sale:** Manuel, con el diagrama del costado de una llanta en la mano: «el RIN es clave,
sin el rin no se puede cotizar una llanta con 100% de certeza». Y en el mismo hilo: «la nueva meta
después de mandar la cotización es conseguir que nos diga una fecha que quiere ir y a qué local».

**1. El aro deja de pedirse en seco.** Pedir «¿qué medida necesita?» le pone al cliente seis
números impresos delante sin decirle cuál mirar. Ahora hay una pieza —`guia_medida`, dibujada con
el mismo motor satori de las otras tres— que despieza `195/55R16 87V` segmento por segmento con el
aro en naranja y una franja que dice por qué: **el ancho, el perfil y el índice de carga admiten un
equivalente; el aro no admite ninguno.** La pieza cierra ofreciendo la foto («mándenos una foto del
costado: nosotros la leemos»), que desde vision.ts es una vía real y para mucha gente la más fácil.
Se manda **una sola vez por conversación**, con el mismo candado que la pieza de opciones.

**2. Dos aros posibles = invitación al local, no un interrogatorio.** Un X-Trail 2017 sale de
fábrica en aro 15 o 17 según la versión. Preguntar «¿qué versión tiene?» termina en «no sé» y ahí
se muere el chat — nadie compró su carro por la ficha técnica. Ahora `fitment_vehiculo` cuenta
**aros distintos** (no medidas distintas: cuatro medidas del mismo aro son una sola decisión) y,
si hay stock en los dos, devuelve la frase armada: *tenemos para los dos, pase y le medimos el
aro*. Con stock en uno solo NO hay invitación — sería prometer lo que no hay.

**3. Después de la cotización el objetivo son dos datos, no «confirmar interés».** Una fecha sin
local no se le puede avisar a nadie y un local sin fecha no entra en ninguna agenda, así que van
juntos y en la misma pregunta, y ningún turno posterior a la cotización cierra sin ella.

**4. El motivo que se le da al cliente ahora es el descuento — y es verdad.** Hasta hoy, sin
oferta autorizada viva el bot decía «le dejo avisado al asesor» y el test exigía que NO apareciera
la palabra descuento. Pero la cotización sale con precio rebajado y su número es justo lo que la
tienda exige para respetarlo: avisarle al asesor es literalmente lo que hace que se lo apliquen.
Lo que sigue prohibido —y con test— es nombrar un descuento **extra** que nadie autorizó.

**5. El mensaje de entrada muestra el alcance del bot y admite preguntas.** Tres bloques: qué
resuelve en concreto, que puede preguntar lo que sea *y mandar foto*, y la pregunta por el aro. Con
dos frenos: no prometer lo que no hace (no reserva, no cobra) y nada de hablar de «IA» o «sistema».
Si el primer mensaje ya trae medida o vehículo, se salta la presentación y va directo a opciones.

**Migración `012`, porque cambiar el default no alcanza.** Las bases de staging y Depot ya tienen
sembrados los prompts por etapa, así que el criterio nuevo se siembra igual que en la 011: se pisan
SOLO las filas publicadas cuyo texto es byte-idéntico al del sistema —la prueba de que nadie las
editó— y las herramientas se unen, nunca se quitan. De paso corrige el prompt de `nuevo`, que
todavía decía «pedida siempre ESCRITA (nunca foto)»: se escribió cuando el bot no leía imágenes y
desde entonces prohibía la vía más fácil para el que no ubica la medida.

**Nota de coordinación:** este commit arrastra también el escalamiento sin ubicación
(`notificar_vendedor` con `motivo`, el caso de Yantzaza) que se estaba escribiendo en paralelo en
otra sesión sobre el mismo árbol. No se puede separar: comparte `tools.ts` y `prompts.ts` con lo de
arriba, y dejarlo fuera rompería el build. Va entero y en verde; su bitácora la escribe esa sesión.

---

### 2026-08-08 · El que dice qué día viene ya tiene dónde aparecer · ⏱️ 0.5 h

**De dónde sale:** «una vez que confirman la fecha deberían salir en un tab oportunidades».

El agujero era peor de lo que parecía: la consulta de Oportunidades solo admitía tres clases de
conversación —etapa `seguimiento_venta`, pidió-asesor, o ventana cerrada—, así que un cliente que
decía «voy el lunes» estando todavía en *cotización enviada* **no salía en ninguna pantalla**. El
dato más accionable del sistema no tenía dónde mirarse.

- Entra a Oportunidades cualquiera con fecha o compromiso, sin importar su etapa.
- Grupo propio y primero: **«Dijeron qué día vienen»**. Solo lo desplaza que el cliente haya
  pedido un asesor, que es más urgente.
- Ordenado por fecha ascendente: **el que prometió y no apareció va arriba** —esa es la tarjeta
  que más urge— y el chip se pinta en rojo con «no apareció». Los que dieron un tramo sin día
  («este fin de semana») van al final: no tienen plazo encima y no pueden desplazar a alguien
  que viene mañana.
- El demo dejó de mostrar Oportunidades vacío: ahora deriva las tarjetas de los tickets con
  compromiso, así la pantalla cuenta la misma historia que el kanban.

**Encontrado de paso (no arreglado):** `FollowUpsView` en `Pipeline.tsx` agrupa por siete buckets
(`attention_now`, `today`, `commitments`…) que el backend no devuelve nunca — solo emite
`needs_human`, `closing` y ahora `visita_confirmada`. El componente además no se renderiza desde
ninguna vista. Es código muerto que mostraría siete grupos vacíos si alguien lo conectara.

---

### 2026-08-08 · «Sale como si responde pero en vida real no» · ⏱️ 1.5 h

**De dónde sale:** Manuel, mirando el ticket 3: el panel mostraba las respuestas del bot con
doble check y el cliente no había recibido nada. Su propio diagnóstico dio en el clavo — «estaba
como si el vendedor lo atiende, no el bot… pero entonces por qué sale que mandamos cosas. No
debería tratar de mandar cosas si no puede mandarlas, es un desperdicio de tokens».

**La cadena completa, que resultó ser un error de verdad:**
1. Un asesor toma el chat → `assigned_to='human'` (pegajoso) + pausa de `BOT_PAUSE_HOURS` (6 h,
   temporal).
2. Pasan las 6 h. La pausa vence; `assigned_to` **no**, porque nadie lo devuelve.
3. Desde ahí, cada mensaje del cliente pasaba `isBotPaused` (ya no hay pausa) y disparaba un
   turno COMPLETO del modelo: herramientas, catálogo, a veces visión.
4. Recién al enviar, la política lo bloqueaba con `human_control`. La respuesta se guardaba como
   `failed` y el cliente no recibía nada.
5. Y el panel **pintaba un doble check fijo en todo mensaje saliente, sin mirar el estado**. En
   cola, aceptado, entregado y fallido se veían idénticos.

Tres arreglos:
- **Preguntar antes de escribir.** El camino de entrada ahora comprueba la política ANTES de
  llamar al modelo. La comprobación ya existía en `resumeBotIfUnanswered`; faltaba justo en el
  camino por el que entra el 100% de los mensajes.
- **El chat vuelve al bot al vencer el plazo.** Decisión de Manuel entre tres opciones: un chat
  olvidado que se queda mudo cuesta más que un bot que retoma de más, y el asesor siempre puede
  volver a tomarlo. Las filas viejas con `assigned_to='human'` y sin plazo también se rescatan.
- **El panel dice la verdad del envío.** Un check = WhatsApp lo aceptó; dos = entregado; dos en
  lima = leído; y el fallido sale en rojo con «No le llegó al cliente» y el motivo que devolvió
  Meta. El backend siempre supo la diferencia; el panel no la miraba.

**Por qué importa:** era la peor clase de fallo — invisible desde el panel, caro en tokens, y
mentía justo en el dato que se usa para confiar en el sistema.

---

### 2026-08-08 · La fecha de visita ahora despierta a alguien · ⏱️ 1.0 h

**De dónde sale:** «que alerte a los asesores cuando dan una fecha de ir para que puedan estar
pilas de la conversación, y también el día antes de que vayan para empujarles».

El bot ya preguntaba el día y el kanban ya lo mostraba, pero una fecha que nadie mira no vende
nada. Ahora salen dos avisos por WhatsApp al asesor (y a *Alertas del bot* del panel), que son
dos momentos distintos de verdad:

1. **Cuando el cliente da la fecha** — es el instante en que el chat pasa de "interesado" a
   "viene", y es cuando hay que empezar a mirarlo. Si dio un tramo en vez de un día («el
   finde»), el aviso lo dice y pide el día concreto: sin fecha no hay recordatorio posible.
2. **El día antes** — una promesa de hace cinco días se enfría sola. El aviso va al **asesor**,
   no al cliente: escribirle automáticamente a un cliente es otra decisión (plantillas, ventana
   de 24 h, opt-out) y no se toma de contrabando dentro de esta.

**Detalles que deciden si el asesor lo lee o lo silencia:**
- El recordatorio de la víspera solo sale entre 8:00 y 18:00 de Guayaquil. La condición «la
  visita es mañana» se cumple desde las 00:00, y el bucle corre cada cuarto de hora: sin la
  ventana, el asesor recibía un WhatsApp a medianoche.
- «Voy mañana» es de las respuestas más comunes. Si el cliente lo prometió HOY, la víspera se
  salta — si no, eran dos mensajes iguales con quince minutos de diferencia.
- La clave de deduplicación lleva el día dentro: repetir «voy el sábado» no vuelve a avisar,
  pero cambiar de sábado a lunes sí, porque para el asesor eso es información nueva.
- Los dos avisos salen **aunque el bot esté apagado**. Apagado no significa que el negocio pare:
  significa que contesta una persona, y esa persona es justo la que necesita enterarse.

**Por qué importa:** cerraba el circuito que quedó abierto ayer. Preguntar el día servía para
llenar una tarjeta; avisarlo sirve para que alguien esté esperando al cliente.

---

### 2026-08-07 · Hasta dónde llega el bot: la métrica, el día de la visita y por qué faltaban mensajes · ⏱️ 2.5 h

**De dónde sale:** cuatro cosas de la misma sesión — «una estadística que sea tickets que
llegan a seguimiento hasta venta, porque como no podemos medir qué llega a ser venta hay que
mostrar eso», «hay cotizaciones en seguimiento que no sale el monto ni la conversación y no sé
por qué», «el bot debería preguntar qué día puede ir… y que en el kanban salga el día como sale
la medida», y —mirando el ticket 1848— «¿no podemos ver los mensajes que mandamos nosotros?».

**1. La métrica que sí se puede medir.** La venta se cierra en el local y no vuelve al sistema.
`getHubMetrics` ahora devuelve `reachedFinal`: cuántos ciclos llegaron a *Seguimiento hasta
venta*, cuántos este mes, qué porcentaje de los cotizados, cuántos siguen abiertos y cuánto
valían. Se lee de `stage_transitions`, no de la etapa actual — el ticket que llegó al final y
después se cerró desaparece del kanban, y contarlo por etapa lo perdía justo en los casos que
más importan. El Dashboard estrena tile («Llegan a seguimiento») y una sección que dice en voz
alta qué se mide y qué no, para que nadie lea «conversión» como «ventas».

**2. Por qué faltaban el monto y la conversación.** Dos causas distintas, las dos ahora visibles:
· **Sin monto** = no hay cotización en ese ciclo. Pasa de verdad: a la última columna se llega
  también compartiendo ubicación o pidiendo un asesor, sin que nadie haya cotizado; y si el
  asesor cotizó desde su WhatsApp, ese precio nunca existió para el sistema. La tarjeta ya no
  deja el hueco en blanco: dice **«sin cotización»**, que es el dato.
· **Sin conversación** = el listado corta en 500 tickets y los enlaces del feed y del panel
  «Llegaron al final» apuntan más atrás; al abrirlos salía *Ticket no encontrado* con la
  conversación intacta en la base. Nuevo `GET /api/hub/tickets/:id` y el detalle lo trae de a uno.

**3. El día de la visita.** El bot pregunta **qué día puede pasar** en los dos momentos en que
el cliente ya tiene todo para decidir: al mandar la cotización y al confirmar el local. El motivo
que le da tiene que ser verdad — nombra el descuento solo si hay una oferta autorizada viva; si
no, ofrece dejarle avisado al asesor con su número de cotización. La respuesta se captura aunque
venga seca («el sábado»), leyendo antes lo que preguntamos nosotros, y el kanban muestra el día
como un chip del mismo tamaño que la medida: *Mañana*, *Sábado*, *Fin de semana*.

**4. El monólogo del ticket 1848.** Cinco mensajes del cliente, uno preguntando «221 cada una ?»
—alguien le había dado un precio— y cero respuestas nuestras en el panel. Una conversación donde
solo se ve al cliente y una donde nadie contestó se veían **exactamente igual**. Ahora el detalle
lo explica con el dato real de cada motivo: el bot está apagado, la conversación es de un asesor,
o los ecos de WhatsApp no están llegando. Ese último es el único que es un error, y para poder
distinguirlo se registra la salud de los ecos (`echoHealth`): cuántos entraron, cuántos se
descartaron y por qué — antes morían en un `console.error` que no lee nadie.

**Por qué importa:** las cuatro son la misma queja — el panel mostraba huecos sin explicación, y
un hueco sin explicación se lee como un error del sistema aunque sea una decisión del negocio.

**Hallazgo al desplegar:** `docs/OPERACION.md` decía «`main` deploya solo a staging». Es falso —
staging y Depot Tire arrancaron con el mismo commit y 4 segundos de diferencia. Un push a `main`
toca al cliente real. Corregido en el doc, porque esa línea es justo la que alguien lee antes de
decidir si empuja.

---

### 2026-08-07 · Se elige el modelo midiendo, y se enciende en producción · ⏱️ 1.5 h

**De dónde sale:** «subamos el nivel del bot, empecemos por el caro y vamos bajando desde ahí».

**Escalera de modelos.** Se le pasaron las MISMAS 70 conversaciones reales (195 turnos) a
tres modelos, uno tras otro. Costó ~$6 de API y decidió la arquitectura:

| | gpt-5.5 | gpt-5.4 |
|---|---|---|
| **Cotizaciones generadas** | **14** | 5 |
| Ofreció algo (opciones o cotización) | 79 | 65 |
| Errores | 0 | 7 |
| Notificó al vendedor | 12 | 0 |
| Demora (mediana) | 7,3 s | 3,4 s |

Casi el triple de cotizaciones sobre el mismo tráfico. La recomendación inicial era gpt-5.4
(más barato y 2× más rápido) y **los datos la voltearon**: a $66/mes de diferencia, una sola
venta extra la paga. Queda `OPENAI_MODEL=gpt-5.5` en Railway (`Depot_Tire`), con
`RESEARCH`/`VISION`/`ESCALATION`=gpt-5.5, `CLASSIFIER`=gpt-5.4-mini,
`TRANSCRIBE`=gpt-4o-transcribe. Retroceder es cambiar una variable, no hay código que revertir.

**Caché verificado contra la API real** con el prompt del bot (26.592 caracteres):
la 2ª llamada cachea el **90%** del prompt. Es automático de OpenAI y el prompt ya estaba
escrito para aprovecharlo (sin fechas ni datos por-request). Eso baja gpt-5.5 de ~$140 a
**~$77/mes** con 300 conversaciones/semana. Los clientes de Depot ayudan: contestan en
0,8 min de mediana, así que el 91% de los turnos cae dentro de la ventana de 30 min.

**Por qué NO se migra a Anthropic** (se evaluó): su ventaja de TTL de 1 h son solo 3 puntos
(94% vs 91%) porque los huecos aquí son cortos; tras el 31-ago Sonnet 5 sale más caro que
gpt-5.4; y habría que quedarse con OpenAI igual para los audios (Anthropic no transcribe voz).
Migrar costaría 1-2 días para terminar con dos proveedores y pagando más.

**Aclaración del informe anterior:** los «140 casos con medida sin cotizar» se desglosaron —
90 son el bot mandando opciones y el cliente que no vuelve a escribir, 4 son pedidos fuera de
catálogo (aros), y **solo 24 son falla real**. Los 90 marcan el punto exacto donde muere el
embudo: vale preguntarle a Joaquín si conviene cotizar directo la más probable en vez de
mostrar opciones y esperar.

**Pendientes de recorte** (meta del cliente: ~$15/mes): adelgazar el playbook (6.500 palabras
en CADA llamada, la palanca grande y sin riesgo de calidad), arreglar el clasificador de etapa
—falla seguido y rompe el embudo del panel—, y recién ahí evaluar gpt-5.4-mini (~$12/mes con
el caché medido). El escalón de 5.4-mini quedó a medias cuando se cortó la sesión.

### 2026-08-07 · El bot oye, ve, abre links y ya no se queda sin ofrecer · ⏱️ 5.0 h

**De dónde sale:** «hace demasiados errores importantes… necesitamos un bot más inteligente».
Dos quejas concretas de Joaquín el mismo día: el precio equivocado (entrada anterior) y el
Creta rin 19 al que el bot contestó «no tengo una medida verificada» sin ofrecer nada.

**Arquitectura nueva: modelos superiores donde rinden, no en todas partes.** El loop común
sigue barato; los ANÁLISIS (visión, investigación, rescate) tienen su propio knob y pueden
usar un modelo grande porque son pocas llamadas. Modelos validados contra la API real antes
de fijarlos —tools, visión y web probados uno por uno— porque un ID mal escrito tumba el bot.

**Qué se hizo.**
- **Audios** (`services/transcripcion.ts`): Whisper con sesgo de vocabulario de llantas. Antes
  el webhook contestaba «no puedes escucharlo»; en Ecuador la gente manda notas de voz.
- **Links** (`services/linkPreview.ts`): abre la página, la resume y pasa su `og:image` por
  visión, así el bot «ve» la llanta del anuncio. Con defensa anti-SSRF (rechaza IPs privadas).
- **Fotos**: modelo superior + el caption orienta la lectura. Se jubila «no puedes leer fotos»
  del playbook, `prompts.ts`, las descripciones de tools y del **guardián de salida** — que
  censuraba la petición de foto y le mandaba una alerta falsa al asesor por hacer lo correcto.
- **Fitment**: el aro llega a la investigación y el prompt deja de autocensurarse. Medido:
  gpt-5.5 SÍ encontraba `235/45R19` y la devolvía en `sizes: []` porque el prompt decía «no
  adivines / prioriza el manual del fabricante». Subir el modelo solo no arreglaba nada.
  Además candado de catálogo: con stock, `fitment_vehiculo` nunca devuelve cero opciones.
- **Escalación**: iteración ≥4 y el rescate usan `escalationModel`. Antes el rescate
  reintentaba con el mismo modelo que acababa de atascarse ocho veces.
- **`max_completion_tokens`** en las 5 llamadas: la familia GPT-5 rechaza `max_tokens` con 400.

**Lo que encontró la evaluación (scripts/eval, 273 conversaciones reales, 461 turnos).**
El replay cazó el bug de `max_tokens` — 461/461 turnos fallaron con gpt-5.4 — **antes** de que
tocara producción. Ya corregido, contra la línea base del 5-ago:

| | antes | ahora |
|---|---|---|
| «Tuve un problema procesando» | 12 | **0** |
| El cliente escribió y no hubo respuesta | 185 | **63** |
| Dijo no tener ficha verificada | 8 | **1** |
| Repitió la misma pregunta | 23 | **10** |
| Mensaje duplicado / disculpas / saludo repetido / doble cotización | 18 | **0** |
| Conversaciones afectadas | 243 | **191** |

«Preguntó teniendo ya la medida» sube en absoluto (176→211) pero **baja por respuesta
emitida (63.8% → 53.0%)**: el bot viejo ganaba esa métrica quedándose callado, y el nuevo
responde 122 veces más. Queda como el pendiente #1.

**Pendiente:** créditos de OpenAI agotados a mitad de la corrida (5M tokens en 353 turnos) —
faltan 108 turnos y el juez LLM. Usuario propio del Interbot para el sync de precios en vivo.

### 2026-08-07 · Los precios ahora son los del Interbot, no una fórmula · ⏱️ 2.5 h

**De dónde sale:** Joaquín mandó captura: la RT01 315/70R17 salía **$502.16** en la cotización
del bot y **$489.14** en el Interbot. «Está dando mal los precios, le voy a poner pausa.»

**Qué se encontró.** Contífico solo trae el **costo** (`pvp1=327.50`; pvp2-4 en cero) — el PVP
que ve la vendedora en pantalla ($653.33) NO sale por la API. Por eso el bot reconstruía el
precio con divisores «observados» (×1.15 ÷0.75 = margen 33%). Se cruzaron las **362 llantas**
presentes en ambos sistemas (barrido del Interbot vía `/api/medidas` + `/api/chat`): el Interbot
lee el mismo costo de Contífico (ratio 1.0000, IVA 15% — la teoría del IVA 12% quedó descartada)
pero el precio de venta se pone **producto por producto**: 32 grupos de factores entre ×1.0 y
×1.7. La regla del 33% solo cubre 96/362 (27%). La RT01 del reclamo está en el grupo ×1.2987.
Conclusión: ninguna fórmula reproduce eso — hay que **leer** el precio, no calcularlo.

**Qué se hizo.**
- `services/interbotPrices.ts`: login + barrido del Interbot con credenciales propias
  (`INTERBOT_USERNAME/PASSWORD`, cada 15 min), snapshot de fábrica en
  `assets/precios-interbot.json` (373 productos, capturado hoy) como respaldo, y candado
  contra barridos parciales (si trae <50% de lo conocido, se descarta).
- `catalog.ts`: `applyInterbotPrices()` tras cada sync — precio hoy = `pvpMinConIva` del
  Interbot (o la promo si está vigente), tachado = `pvpFullConIva` solo si es mayor.
  Los códigos que el Interbot no tenga conservan la fórmula como último recurso.
- 6 pruebas en `test/interbotPrices.test.ts`, incluida la regresión exacta del reclamo
  (502.16 → 489.14) y el caso promo.

**Pendiente:** usuario propio del Interbot para el bot (hoy el snapshot cubre; el sync en vivo
se activa al poner las credenciales en Railway). El «PVP con ecovalor» de Contífico ($653.33)
sigue sin salir por API — si algún día lo cargan en pvp2, se lee directo y esto se simplifica.

### 2026-08-07 · Lo que el asesor escribe desde WhatsApp entra al panel · ⏱️ 2.0 h

**De dónde sale:** Manuel reportó que «no salen los mensajes que mandamos nosotros en los chats»,
con el ticket 1286 (Rodrigo Villamarín) a la vista.

**Qué se encontró.** El panel pinta bien: 15 burbujas salientes, estilo visible, tema `showroom-gp`
correcto. El problema no era de render sino de datos. En ese ticket el cliente mandó **20 mensajes
seguidos** (16:18 → 16:29 UTC) sin una sola respuesta guardada, pero sus propios mensajes delataban
que alguien le estaba contestando: «Ok muchísimas gracias» justo después de pedir las ubicaciones,
«Es una camioneta Rely R8» después de que alguien preguntara el vehículo, «Ok mi nombre es Rodrigo
Villamarín» después de que alguien le pidiera el nombre. El asesor le respondía **desde WhatsApp**,
no desde el panel, y para el sistema esa conversación estaba muda.

**Causa raíz:** `whatsapp-api-js` solo despacha `field === "messages"` y `"calls"` (ver `post()` en
`lib/index.js`). Los campos `message_echoes` y `smb_message_echoes` —la copia que Meta manda de lo
que el negocio envía por fuera de nuestra API— se descartaban en silencio. Costaba tres cosas:

1. El panel mostraba conversaciones que parecían abandonadas (y la auditoría las contaba como
   `sin_respuesta_del_bot`, inflando la métrica con falsos positivos).
2. **El agente no veía lo que el humano ya había dicho**, así que al retomar repetía preguntas y
   reenviaba cotizaciones — la misma familia de fallas que reportó Joaquín esta mañana.
3. Nadie podía auditar lo que se le prometió al cliente a mano.

**El arreglo:**

- `domain/echoPayload.ts` (puro, probable sin base): reconoce el payload, valida la firma
  `x-hub-signature-256` con el app secret, extrae los ecos y traduce tipo y contenido. Un eco sin
  texto se guarda como «[el asesor envió una imagen]» y no en blanco: en blanco el agente cree que
  ahí no pasó nada y vuelve a preguntar.
- `wa/echoes.ts` + gancho en `server/webhook.ts` **antes** de `handle_post`: guarda el eco como
  saliente de `owner` (el panel lo pinta como «Vendedor») y pasa la conversación a control humano
  para que el bot no hable encima del asesor.
- `wa/outboundRegistry.ts`: registra los `wamid` que este proceso mandó, en cuanto la Graph API
  devuelve el id. Sin esto, el eco de nuestra propia respuesta llegaría antes de que termine su
  `appendMessage` y pausaría el bot por su propio mensaje. Cableado en `graphSend` y en
  `sendTextDetailed`. La deduplicación definitiva sigue siendo el `unique` de `wa_message_id`.
- `channelDiagnostics.ts`: chequeo nuevo **«Respuestas del asesor desde WhatsApp»**, porque lo único
  que no se puede arreglar desde el código es la casilla en Meta.

**Verificación:** `tsc` limpio; **270 tests en verde** (23 nuevos), incluidos 9 de cableado contra
Postgres real que confirman que el mensaje del asesor sale por `getHubMessages` como `rol:vendedor`
(lo que el panel dibuja), que entra a `getHistory` (lo que lee el agente), que una reentrega de Meta
no duplica la burbuja, que una firma inválida no escribe nada, y que el eco propio no provoca
handoff. En producción se comprobó además que el render ya funcionaba, con datos reales del 1286.

**Falta un paso que no es código:** en Meta → la app → WhatsApp → Configuración → Webhook →
«Administrar» hay que marcar `message_echoes` (y `smb_message_echoes` si el número también se usa
desde la app de WhatsApp Business). Sin esa casilla Meta no manda la copia y no hay nada que
guardar. El chequeo nuevo del panel dice en rojo si falta.

### 2026-08-07 · El aro solo ya basta para mostrar opciones · ⏱️ 0.5 h

**Qué:** falla cazada EN VIVO a los 40 minutos de encender el bot (conversación 1704, 08:50). El
cliente escribió «Para rin 19 / Marca hyundai / Modelo creta 2027» y el bot respondió *«No tengo una
medida verificada para la Hyundai Creta 2027. ¿Me escribe la medida…?»* — o sea, con el aro en la
mano no le ofreció nada. Es el detector `sin_ficha_verificada`: prudencia que cuesta plata.

**Causa:** no era la herramienta. `buscar_por_aro_y_tipo` ya acepta `tipo: null` y con solo el aro
devuelve todo lo que existe en ese aro. Era el texto que enrutaba: el paso 1c decía «Si pide un ARO
con un TIPO», que se lee como que hacen falta los dos, y el 2b mandaba al vehículo. Con aro Y
vehículo en el mismo mensaje el modelo eligió el vehículo, fitment no tenía ficha de una Creta 2027,
y ahí se detuvo.

**Arreglo:** el aro sube al mismo rango que la medida (**el aro le gana al vehículo**: es un dato
duro del cliente que no depende de ninguna ficha); `fitment_vehiculo` baja a último recurso, solo
cuando no hay medida NI aro; y regla dura nueva en las cuatro que mandan: **prohibido terminar un
turno con una limitación propia y una pregunta, sin ofrecer nada** — «no tengo una medida
verificada» jamás puede ser el mensaje completo. Se alinearon también las `description` y las
`regla` de `buscar_por_aro_y_tipo` y `fitment_vehiculo` (incluida la rama `not_found`, que es el
punto exacto donde el modelo se frenó): el prompt y las herramientas tenían que decir lo mismo.

**Verificación:** 247 tests en verde (3 nuevos que fijan las tres reglas con regex resistentes a
reescrituras de estilo pero que fallan si alguien las revierte).

### 2026-08-07 · El interruptor del bot avisa por WhatsApp, con el motivo · ⏱️ 1.5 h

**Qué:** mover el interruptor global (prender o apagar) ahora le manda un WhatsApp a todos los
asesores activos con el motivo que se escribió en el panel. Antes no avisaba nada: el 6-ago el bot
quedó apagado a las 13:16 y a las 19 horas seguían entrando mensajes al vacío.

- `advisorNotifications.ts`: `mensajeCambioDeBot()` (pura, testeable con hora fija) arma el texto —
  qué pasó, qué implica, el motivo o «sin motivo anotado», cuánto duró el apagón al encender, y la
  hora de Guayaquil. `avisarAsesoresGlobal()` lo manda a cada asesor sin exigir conversación:
  `notifyAdvisor` no servía porque `advisor_notifications.conversation_id` es `not null`, y un
  evento global no tiene conversación a la que colgarse (queda `console.log` como rastro).
- `admin.ts` (`PUT /bot-power`): lee el estado anterior, guarda, y solo si `activo` cambió de verdad
  dispara el aviso en segundo plano — un WhatsApp caído no puede frenar un apagado de emergencia.
- **Bug latente encontrado y corregido:** `setBotPower` usaba `BotPowerSchema.partial()`, y en zod 4
  `.partial()` NO desactiva los `.default()`. Un `PUT {motivo:"x"}` volvía con `activo:true` de
  contrabando y **encendía el bot**. Ahora hay un `BotPowerInputSchema` con opcionales de verdad.
- **Segundo bug, en el hub:** `realSource.setBotPower` mandaba `motivo: activo ? "" : motivo`,
  o sea borraba el motivo justo al encender — el aviso habría salido mudo la mitad de las veces.
- El motivo pasa a describir el estado ACTUAL (ya no se borra al encender) y el panel lo muestra
  también con el bot trabajando. Encender ahora pide motivo igual que apagar, en verde y con otro
  tono, y ambos bloques avisan que lo escrito se le manda a los asesores por WhatsApp.
- El watchdog del apagón también incluye ahora el motivo en su recordatorio horario.

**Verificación:** 244 tests en verde (19 nuevos), `tsc` limpio, hub reconstruido y copiado a
`app/site/admin`. El test del endpoint se validó por mutación (romper la comparación de estado o la
marca de `apagadoAt` lo hace fallar), y los dos flujos del panel se probaron en el navegador.

**Dato de producción:** el watchdog desplegado anoche lleva 10 alertas enviadas, una por hora, y la
última reporta el bot apagado 19 h con 33 clientes sin respuesta — 9 de ellos con la medida ya
confirmada. La pieza funciona; falta que alguien prenda el bot.

### 2026-08-06 · Si no es un NO es un SÍ + leer fotos + candados de opciones + watchdog · ⏱️ 4.0 h

**Qué:** la auditoría contra la base real de Depot (239 conversaciones, 14 días) mostró que las
fallas del 5-ago están extinguidas pero el bot sigue sin cerrar: pedía confirmar cantidades ya
dichas (Rodrigo: 4 confirmaciones por 5 llantas; J.F.R.C escribió «4» dos veces y recibió la misma
pieza por tercera vez), reenviaba opciones ante «Presio por favor», ignoraba «juego de llantas»
(18 mensajes en 15 chats), mandó M/T cuando pidieron A/T, tiró 33 fotos de clientes a la basura y
estuvo apagado sin que nadie se enterara (188 mensajes sin respuesta el 6-ago). Seis arreglos:

1. **Si no es un NO, es un SÍ** (`salesIntent.ts` + gate de `generar_cotizacion` en `tools.ts`):
   la cotización solo se frena por comparación en curso o negativa explícita
   (`isNegativeResponse`). Cantidad nueva: «juego»=4, «las/los N», «cambiar las 5», número suelto
   al borde del mensaje agrupado, y la cantidad guardada en la conversación vale siempre; 4 es el
   default comercial. Las horas («paso a las 3») se excluyen — bug cazado por el test de cableado.
2. **Candados de opciones** (`domain/opcionesCandados.ts` + `preparar_opciones`): prohibido
   reenviar la pieza de la misma medida en 120 min (salvo que el cliente la pida de nuevo); el
   tipo pedido (A/T, M/T…, con sinónimos quiteños «todo terreno», «lodo») filtra las opciones.
3. **Leer fotos** (`wa/client.ts` `downloadMedia` + `services/vision.ts` + case image):
   la foto se transcribe con la visión de gpt-4o-mini y entra como texto normal — la medida de la
   etiqueta cae sola en los hechos comerciales. El caption del cliente ya no se pierde.
4. **Tope global del pipeline** (`pipeline/inbound.ts`): máximo `PIPELINE_MAX_CONCURRENT` (6)
   agentes en vuelo; bajo carga los excedentes esperan en vez de reventar contra el rate limit.
5. **Watchdog de bot apagado** (`embeddedFollowUpWorker.ts`): cada 5 min, si el bot está apagado
   y hay clientes con el último mensaje sin responder → alerta ALTA + WhatsApp al asesor, un
   recordatorio por hora. El 6-ago el bot pasó apagado desde las 13:16 y nadie lo supo.
6. **Prompt nuevo** (`prompts.ts`): cuarta regla «Si no es un NO, es un SÍ», sección de cantidad,
   «precio se responde con un precio», ubicación ya dicha no se repregunta, y las fotos ahora se
   leen. Detectores nuevos en la auditoría: `sin_respuesta_del_bot`, `pide_confirmar_cantidad`,
   `opciones_reenviadas` (+ fix del detector de cotización duplicada que comparaba «$638.59» de la
   imagen contra «$638,60» del texto y daba 0 con el caso KLEVER en la base).

**Verificación:** `tsc` limpio; **225 tests en verde** (34 nuevos), incluido un test de cableado
del guardián contra Postgres real que confirma que `applyOutboundGuard` bloquea e inserta alertas
— los cero `guard_*` de producción son porque el modelo ya no intenta la falla, no un cable roto.

**Por qué:** de 239 conversaciones salieron 4 cotizaciones y 1 venta — y esa venta la cerró un
humano en un chat que el bot nunca tocó. La meta de mañana: `pide_confirmar_cantidad`,
`opciones_reenviadas` y `pide_foto` en <1% de chats, y `tasaMedidaACotizacion` subiendo desde 4,2%.

### 2026-08-05 · Línea base publicada y archivado automático de auditorías · ⏱️ 1.0 h

**Qué:** las auditorías dejan de ser fotos sueltas.

- **Línea base con fecha** (`registro/LINEA-BASE-2026-08-05.md`): los 7 errores del censo
  (30 pedidos de foto, 12 errores de procesamiento, 6 re-saludos, 5 disculpas seguidas,
  5 mensajes calcados, 2 cotizaciones dobles, 2 preguntas con la medida en mano), los 25
  chats afectados de 164, los **5 commits** que arreglaron cada uno, y una tabla de qué
  métrica debe moverse en la próxima corrida. Archivada como corrida `2026-08-05-censo`
  en el historial, marcada `esLineaBase` y con `fuente: censo-panel` + nota de
  comparabilidad — no se puede confundir con una corrida del extractor.
- **Archivado automático:** `render.mjs` ya no depende de `--salida`. Cada corrida guarda
  `reporte.html` + `datos.json` + `analisis.json` bajo `registro/reportes/<sello>/`. Los
  datos crudos permiten recalcular una métrica nueva sobre una corrida vieja; el análisis
  conserva POR QUÉ se propuso cada cambio.
- **Historial enriquecido:** cada entrada trae `sello`, `fuente`, `commitBot`,
  `hallazgosPorDetector`, `resumen`, la ruta del reporte y los `cambiosAplicados`
  completos (con el detector que atacan y la métrica prometida). Orden cronológico
  garantizado, y re-renderizar la misma extracción ya no duplica la corrida.
- **`extraer.mjs --commit`** graba qué versión del bot produjo las conversaciones: sin
  eso, un «mejoró» no se puede atribuir a ningún cambio.
- **El SKILL exige el ciclo completo:** leer la corrida anterior ANTES de analizar, dar
  veredicto sobre cada cambio previo (funcionó / no se movió / no medible), y commitear
  el registro — si no entra al repo, la próxima corrida no lo ve.

**Por qué:** el 5-ago se descubrieron las fallas por capturas, no por el análisis. Con la
línea base publicada y el archivado automático, la próxima auditoría arranca sabiendo qué
se prometió arreglar y tiene la obligación de decir si se cumplió.

---

### 2026-08-06 · Las opciones: cadena más corta, llantas grandes y la KR50 visible · ⏱️ 1.5 h

**De dónde sale:** Joaquín revisó un chat real de hoy (245/65R17) y mandó tres cosas.

**1. «Este mensaje le quitaría».** Antes de la imagen el bot mandaba un bloque
«Le mando las opciones en 245/65R17 👆 / Yo iría por la *FALKEN WILDPEAK A/T TRAIL*: … /
Los precios son por unidad, con IVA incluido», y cerraba con «¿Cuál le llama más la
atención?». Con la imagen y el INCLUYE en medio, eso son cuatro mensajes seguidos:
_«se vuelve una cadena muy larga y los mijines ya no leen»_. Se eliminó
`buildOptionsCaption`. El turno queda en **imagen + INCLUYE + «¿Necesita alguna
recomendación?»**. La recomendación no desaparece: se OFRECE. `preparar_opciones`
sigue eligiéndola y ahora devuelve `recomendacion` y `motivo_recomendacion` para que
el agente la dé en UNA frase cuando el cliente diga que sí — con el cliente ya
mirando la pieza, que es cuando pesa.

Se cambió en las **cuatro capas** donde vivía la regla vieja, no solo en el código
que arma el texto: `quoteMessages.ts`, la descripción y la `regla` de
`preparar_opciones`, el prompt del sistema (`prompts.ts`) y `BOT_PLAYBOOK.md` —
incluido su ejemplo, que enseñaba justo la cadena que Joaquín mandó a quitar.
(El playbook se compila dentro del bundle del panel, así que el hub se rebuildeó.)

**2. «¿Hay chance de hacer las llantas más grandes?».** La tarjeta de opciones tenía
la foto fija en 140 px sin importar el ancho disponible. En el caso normal —
`tresOpciones()` deja una marca por escalón, o sea **una tarjeta sola por fila, de
~1.100 px** — la llanta ocupaba el 13 % del ancho y se veía perdida. Ahora la tarjeta
crece con el sitio que tiene: escala foto/texto según cuántas van en la fila, y la
tarjeta que va sola se **acuesta** (llanta grande a la izquierda, datos a la derecha)
en vez de apilar y dejar media tarjeta vacía. Mismo diseño, mismos elementos, mismo
orden de lectura. De paso la pieza quedó más corta: 3.342 px de alto contra los
4.554 que daba solo agrandando la foto en vertical.

**3. La Kenda KR50 salía en blanco.** En la propia captura de Joaquín la tarjeta de la
KR50 es un hueco con la sombra dibujada y nada encima. El archivo estaba y pesaba
1,1 MB: es un **JPEG guardado como `.png`**. El motor deducía el MIME de la extensión,
resvg recibía `data:image/png` con bytes de JPEG y no dibujaba nada. Ahora
`sniffImageMime()` lee los bytes mágicos y el nombre del archivo ya no manda —ni el
`content-type` del servidor en las fotos remotas—; lo que no tenga firma reconocible
cae a la ilustración genérica en vez de dejar el hueco. `kenda-kr100.png` estaba igual.

**Pruebas:** suite en **185 en verde** (3 nuevas). `fotosCatalogo.test.ts` recorre las
fotos del manifiesto y exige que existan Y que decodifiquen. `piezas.test.ts` suma la
variante *una-por-marca*, que desde hoy es la más alta y pesada de la pieza (1,73 MB
contra los 4,5 de margen). Las tres formas reales de la pieza —3 marcas × 1, 2+1, y
3 tarjetas en fila— se revisaron renderizadas a ojo.

**Pendiente conocido:** que el modelo no adelante la recomendación es instrucción en
las cuatro capas, no un candado como el guardián de salida. Si la auditoría lo ve
reaparecer, ahí sí toca detectarlo determinísticamente.

---

### 2026-08-06 · El favicon deja de ser data-URI para que Vercel lo muestre · ⏱️ 0.25 h

**Qué:** el sitio declaraba su favicon embebido en un `data:image/svg+xml,...`. El
navegador lo pinta bien, pero el rastreador de Vercel no lee data-URIs, así que la
tarjeta del proyecto en el tablero salía con el logo genérico en vez del de AutoVenta.
El mismo diseño (AV rojo sobre fondo oscuro) ahora vive en `app/site/icon.svg` y las dos
páginas —landing y panel— lo referencian por ruta.

**Por qué:** con varios proyectos en la cuenta, distinguirlos de un vistazo en el tablero
importa; y de paso el panel usaba un diseño distinto (rojo pleno) al de la landing, así
que quedaron unificados.

---

### 2026-08-05 · Rescate del agente: el «tuve un problema procesando» ataca su causa raíz · ⏱️ 1.0 h

**Qué:** los 7 errores de procesamiento de producción salían de un solo lugar: el agente
tiene 8 rondas de herramientas y, si las quema en bucle (una tool que falla y el modelo
la reintenta — en el chat de KLEVER, `generar_cotizacion` devolviendo «bloqueada» una y
otra vez), se rendía con la disculpa. Ahora, al agotar las rondas, hay una llamada de
RESCATE sin herramientas que obliga al modelo a responder con lo que ya averiguó (con
prohibición explícita de disculparse o pedir que repita). La disculpa queda solo para
cuando hasta el rescate falla — y si eso se repite, el guardián bloquea la segunda y
alerta al asesor. `ai_runs.error` distingue `max_iterations_salvaged` de la rendición
real, y la auditoría reporta `rescatados` aparte de `errores`.

**Prueba:** stub de OpenAI que SIEMPRE pide otra herramienta (el bucle reproducido):
8 rondas + 1 rescate, el cliente recibe respuesta útil, cero disculpas, y el run queda
registrado como rescatado. Suite: 182 en verde.

---

### 2026-08-05 · Candado anti-duplicado dentro de generar_cotizacion · ⏱️ 0.5 h

**Qué:** si ya existe una cotización de hace <30 min por el MISMO producto y cantidad, la
herramienta no genera otra: devuelve el número vigente («Su cotización COT-X sigue
vigente…») y empuja al cierre. El prompt ya lo prohibía, pero el prompt es una petición;
esto es un candado. Probado con el caso KLEVER reproducido (la segunda llamada no crea
fila en `quotes`). Censo del historial completo de Depot vía panel: 164 conversaciones,
25 con errores graves (30 pedidos de foto, 7 errores de procesamiento, 5 disculpas
seguidas, 5 mensajes calcados, 6 re-saludos, 1 cotización duplicada). Suite: 181 en verde.

**Por qué:** con esto, TODAS las clases de error del 5-ago tienen defensa determinística
o candado, no solo instrucciones: foto/duplicado/disculpa/saludo → guardián de salida;
cotización doble → candado en la tool; preguntar teniendo la medida → instrucción en las
3 capas + detector que lo mide en cada auditoría.

---

### 2026-08-05 · Guardián de salida: las fallas de hoy ya no PUEDEN llegar al cliente · ⏱️ 1.5 h

**Qué pasó:** el bot viejo estuvo vivo todo el día y Joaquín lo apagó a mano a las 16:02
tras verlo fallar en vivo. Escaneo de los chats reales del día (66 conversaciones):
**18 pedidos de foto**, 12 «tuve un problema procesando» (Ricardo Nitro recibió TRES
seguidos, dos calcados), 5 mensajes duplicados idénticos, re-saludos a mitad de hilo
(Jordian recibió doble respuesta, la segunda con «¡Buenas tardes!») y la cotización
doble de KLEVER. Todo ANTERIOR al deploy de venta-primero (16:34): el bot arreglado
aún no ha hablado. Y nada de esto estuvo en la auditoría anterior porque corrió sobre
una base de demostración, no producción.

**Qué se hizo:**

1. **`outboundGuard.ts` — guardián determinístico en el envío.** Corre sobre CADA
   respuesta antes de mandarla, en los dos caminos (webhook y resumeBot):
   - dos disculpas seguidas → NO se envía la segunda + alerta ALTA al asesor
     («bot atascado: el cliente quedó sin respuesta»);
   - mensaje calcado al anterior → no se envía;
   - oración que pide foto → se elimina (el resto del mensaje se salva); si el
     mensaje queda sin pregunta, se pide la medida escrita;
   - saludo de apertura a mitad de conversación → se recorta.
   Cada bloqueo queda como alerta `guard_*` en el panel. El guardián nunca rompe el
   envío: ante error interno propio, deja pasar el texto original.
2. **La auditoría ahora VE estas fallas, clarísimo.** Detectores nuevos:
   `mensaje_duplicado`, `disculpas_seguidas`, `saludo_repetido`; `pide_foto` ampliado.
   Métrica nueva `intentosBloqueadosPorGuardian` (lee las alertas `guard_*`): dice
   cuántas veces el modelo INTENTÓ la falla aunque el cliente no la viera — si el
   prompt mejora de verdad, baja; si solo el guardián tapa, se queda alta. El SKILL
   ahora exige leer COMPLETO cada chat con hallazgos y documenta los 5 casos del
   5-ago como referencia obligada.
3. **Pruebas con los textos reales de producción** (`outboundGuard.test.ts`, 12):
   los mensajes exactos de Ricardo, Jordian y Orlando se bloquean/corrigen; los
   buenos pasan intactos. Detectores verificados contra una base sembrada con los
   casos del día. **Suite: 180 en verde.**

**Por qué:** el prompt es una petición al modelo; el guardián es una garantía. Con
GPT-4o-mini el modelo va a fallar de vez en cuando — lo que no puede pasar es que esa
falla llegue al cliente, ni que nadie se entere.

---

### 2026-08-05 · VENTA PRIMERO en las tres capas + los casos de Joaquín como pruebas · ⏱️ 2.0 h

**Qué:** los arreglos del prompt (entrada anterior) no bastaban: la instrucción de pedir
fotos y de confirmar el vehículo vivía en TRES capas, y dos seguían intactas.

1. **Herramientas** — `fitment_vehiculo` le devolvía al modelo «pide versión/origen o
   foto de la etiqueta» en su descripción, en su rama not_found y en su regla; y
   `vehicleFitmentResearch` redactaba `nextQuestion` pidiendo foto en 4 salidas (incluida
   la investigación web, que podía redactar la suya). De ahí salió literalmente el
   «¿Podrías enviarme una foto de la etiqueta?» del caso Orlando. Ahora todas las salidas
   piden la medida ESCRITA (`sinPedirFoto()` sanea incluso lo que redacte la web) y el
   límite se dice en una línea sin frenar la venta.
2. **Prompts por etapa (base de datos)** — el default sembrado de `nuevo` decía «si da
   vehículo, confirma la medida antes de hablar de precios»: la regla exacta que congeló
   la venta. **Migración `011_venta_primero`**: reescribe los prompts sembrados por el
   sistema a venta-primero y habilita `generar_cotizacion`, `buscar_por_aro_y_tipo` y
   `tipos_de_llanta` en las etapas tempranas (medida+cantidad en el primer mensaje ahora
   puede cotizar sin esperar cambio de etapa). Solo toca filas v1 `created_by='system'`
   con el texto original: lo editado desde el panel no se pisa (probado).
3. **Verificación** — los mensajes REALES de las capturas son ahora pruebas:
   - `rubrica.mjs` (el criterio único de calidad) suma 2 reglas de Joaquín:
     `pide_foto` (crítica) y `pregunta_vehiculo_con_medida` (alta).
   - `test/ventaPrimero.test.ts` (15 pruebas): las respuestas reales de Orlando y KLEVER
     reprueban; las conductas nuevas aprueban; el anti-duplicado expone `COT-…` con
     minutos y bloquea <30 min; fitment nunca vuelve a pedir foto; la migración respeta
     ediciones del dueño.
   - La eval de calidad comercial suma los casos `medida_manda_sobre_vehiculo` y
     `tipo_es_lo_que_busca`; cableado verificado en `--stub` (14 turnos por el bot real).

**Por qué:** el prompt es la capa con menos autoridad: lo que devuelve una herramienta el
modelo lo repite casi textual, y el prompt de etapa publicado en la base pisa al default
del código. Arreglar solo el prompt era dejar la falla viva en las dos capas que más pesan.

**Suite: 167 en verde.** Pendiente de correr con API real: `OPENAI_API_KEY=… node
scripts/eval/run.mjs` (~$0,30) — los casos de Joaquín quedan medidos contra el modelo real.

**Corrección post-deploy (mismo día):** al verificar en la base de Depot, los prompts
publicados eran **v4/v6** (republicados por migraciones anteriores con ajustes de
herramientas) y conservaban el texto dañino byte-idéntico — la migración anclada en v1 no
los tocó, como estaba diseñada. Se re-ancló en el **texto exacto** (la prueba de que nadie
lo editó) sin importar la versión, y las herramientas ahora se UNEN en vez de reemplazarse
(no se quita ninguna que el deploy ya tuviera). Prueba nueva que reproduce el estado real
de Depot (v4 publicada + texto viejo + tools propias). Suite: 168 en verde.

---

### 2026-08-05 · El bot deja de preguntar y empieza a vender + skill de auditoría · ⏱️ 3.0 h

**Qué:**

Skill nuevo `.claude/skills/auditoria-ventas/` que audita cómo está vendiendo el bot:
extrae todas las conversaciones, corre **detectores determinísticos** de fallas, y genera
un HTML con el embudo, la fricción, las fallas ordenadas por impacto y los chats donde se
ven. Cada corrida queda en `registro/historial.jsonl`, así que el reporte compara contra la
anterior y muestra qué cambios se aplicaron en medio — sin eso, cada auditoría es una foto
suelta y no hay forma de saber si una mejora sirvió.

Detectores: `error_procesamiento`, `pide_foto_que_no_puede_leer`, `pregunta_teniendo_medida`,
`pregunta_repetida`, `cotizacion_duplicada`, `con_medida_sin_cotizar`, `sin_ficha_verificada`,
`pieza_fallida`, `abandono_tras_pregunta`.

Arreglos del bot, todos sacados de chats reales (Chevrolet Orlando y KLEVER):

- **El objetivo del bot ahora es VENDER**, explícito y arriba de todo, con tres reglas que
  mandan: dar precio en cuanto se pueda, nunca preguntar lo ya dicho, y ser prudente sin
  frenar (cotizar igual y aclarar el límite en la misma frase).
- **La medida manda sobre el vehículo.** Si el cliente dio medida, se cotiza con esa medida:
  nada de fitment, versión, año ni etiqueta. Antes el prompt decía "CONFIRMA versión/etiqueta
  antes de cotizar" y eso mataba la venta del Orlando, que había dado `225/65 R17` y su carro.
- **Prohibido pedir fotos.** El bot no lee imágenes; pedirlas era mandar al cliente a un
  callejón sin salida. El prompt se contradecía: una regla mandaba pedir foto de la etiqueta
  y la siguiente decía que no puede leerlas.
- **No cotizar dos veces lo mismo.** `getAgentSalesFacts` ahora trae la última cotización del
  ciclo con su número y hace cuántos minutos salió; si es de hace menos de 30 min, el prompt
  prohíbe generar otra y manda remitir al número existente.
- **El tipo de llanta que pide el cliente es lo que BUSCA, no algo que verificar.** "Son todo
  terreno" ahora dispara `buscar_por_aro_y_tipo`, no un "no tengo ficha técnica verificada".

**Por qué:**

Las capturas mostraron el mismo patrón tres veces: el bot tenía todo para cotizar y en vez de
eso preguntaba. Joaquín lo dijo en dos frases — *«no debería confirmar con el vehículo sino ya
con la medida que tiene cotizar de una»* y *«hay que decirle al mijin del bot que no pida fotos
hasta que no pueda leer»*. Ninguna de esas fallas era del modelo: las tres estaban escritas
como regla en el prompt, y el modelo obedecía.

El skill existe para que esto no dependa de que alguien revise chats a mano y se acuerde.

**Verificación:** typecheck y 150 pruebas en verde. Los scripts se corrieron contra una base
sembrada con los chats reales de las capturas: los 6 detectores esperados dispararon, y una
segunda corrida simulada confirmó que las flechas de tendencia leen bien la dirección (menos
preguntas = verde aunque el número baje).

---

### 2026-08-05 · Contador del final del tablero + el link del asesor apuntaba a staging · ⏱️ 1.5 h

**Qué:**

- **Contador «Llegaron al final»** al final del kanban, después de «Cerrar ticket». Se
  despliega y muestra los tickets agrupados por día, con el estado de cada uno (Ganado /
  Perdido / Sigue abierto), la medida y el monto. Cada fila abre el chat.
- Sale de `stage_transitions`, no del estado actual: cuenta a quien tocó
  `seguimiento_venta` alguna vez, **incluidos los que ya se cerraron** y por lo tanto
  desaparecieron del tablero. Cuenta también a los que saltaron directo a `ganado`.
- Los días se cortan en **hora de Guayaquil**, no UTC. En UTC todo lo que pasa después de
  las 19:00 caería al día siguiente y las fechas no serían las que vivió el negocio.
- Un ticket que rebota (entra al final, sale y vuelve) cuenta **una vez**, con la fecha de
  la primera llegada. Un cliente que vuelve a comprar cuenta una vez **por ciclo**.
- Endpoint nuevo `GET /api/hub/final-stage`; 4 pruebas de integración contra Postgres
  cubren cerrados, zona horaria, rebotes y ciclos. Suite: 150 en verde.
- **Fix: `HUB_PUBLIC_URL` tenía de default la URL de staging.** El link que el bot le manda
  al asesor por WhatsApp salía apuntando al panel de staging aunque el mensaje viniera del
  deploy de Depot: el ticket existe, pero en otra base de datos, así que el link abría en
  vacío y no se podía atender. Ahora el default sale de `RAILWAY_PUBLIC_DOMAIN` — cada
  deploy se apunta a sí mismo sin configurar nada.

**Por qué:**

- El kanban solo dice dónde está cada ticket **hoy**. El que llegaba al final y se cerraba
  se esfumaba del tablero, así que no había forma de saber cuánta gente recorrió el embudo
  completo — justo el número que hace falta ahora, con el embudo cayendo de 112 nuevos a 0
  ganados. El historial ya estaba en la base; solo no se estaba leyendo.
- El fix del link es de operación diaria: sin él, cada vez que el bot escala al asesor, el
  asesor recibe un link que no abre nada. Y un default con URL fija volvería a romperse con
  el tercer cliente del `PLAN_CARGA_50_CLIENTES.md`.

**Pendiente al desplegar:** nada manual. `RAILWAY_PUBLIC_DOMAIN` lo pone Railway solo; si
algún deploy ya tenía `HUB_PUBLIC_URL` puesta a mano, esa sigue mandando.

---

### 2026-08-05 · Fuera la camiseta de la TRI: la promo ya venció · ⏱️ 0.25 h

**Qué:** se quitó `"Camiseta de la TRI🇪🇨"` de la lista que siembra la migración
`008_benefits.ts`, y la misma línea del fixture de `test/tanda0-evidencia.ts` para que la
prueba siga reflejando lo que la migración siembra de verdad. Queda un comentario en la
migración explicando que la promoción venció en agosto de 2026, para que nadie la
reponga por creer que fue un borrado accidental.

**Por qué:** la promoción ya se desactivó a mano en producción desde Ajustes →
Promociones y beneficios, así que el bot ya no la ofrece a nadie hoy. Pero los beneficios
son datos sembrados, no código: cualquier base de datos nueva (un entorno de staging
levantado desde cero, el primer deploy de otro cliente) volvería a nacer ofreciendo una
camiseta que ya no existe. Esto es solo limpieza — no corrige nada en la producción
actual, evita que el problema vuelva a nacer solo.

### 2026-08-05 · Medidas en pulgadas: la venta que se perdió por un cero · ⏱️ 1.5 h

**Qué:** un cliente pidió `30x9.5r15`, el bot dijo que no había, y sí había. Dos fallos
encadenados:

1. **El parser no reconocía ninguna medida de flotación.** 30x9.5R15, 31x10.5R15,
   33x12.50R15 — todas devolvían vacío. Son las de camioneta y 4x4, muy comunes en Ecuador.
2. **El catálogo trae la MISMA llanta escrita de dos formas:** `30X9.5R15LT` (Kenda, stock 0)
   y `30X9.50R15LT` (Falken, **stock 20**). Sin canonizar quedaban como medidas distintas,
   así que el bot encontró solo la agotada. Joaquín lo intuyó: *«capaz porque se escriben
   diferente no les cacho»*.

Ahora las etiquetas se canonizan sin ceros de más y ambas colapsan en `30X9.5R15`.

**La imagen deja de ser opcional.** Las capturas mostraron al bot escribiendo la lista de
precios en texto y sin mandar pieza — tanto que el cliente tuvo que pedirla («¿No me vas a
mandar una foto de las opciones?»). El prompt ya lo pedía y el modelo lo ignoraba, así que
la prohibición pasó a las respuestas de las herramientas: cada búsqueda devuelve
`siguiente_paso` prohibiendo listar en texto y exigiendo `preparar_opciones`.

**De paso:** el chat de prueba de Manuel (593993728763) no recibía respuesta porque estaba
en `atiende: humano` desde las pruebas viejas — el bot calla a propósito cuando un humano
tomó el chat. Devuelto al bot.

### 2026-08-05 · Tipos de llanta, 3 opciones y las piezas visibles en el chat · ⏱️ 2.5 h

**Qué:** el cliente entregó `base_llantas_tipos.json` — 385 códigos clasificados en H/T, A/T,
R/T, M/T, turismo y comercial, 35 líneas con su uso y 8 tipos con cuándo ofrecerlos y cuándo
no. Con eso:

- **`buscar_por_aro_y_tipo`** resuelve el caso que Joaquín señaló como el más frecuente:
  *«un pichaso de gente dice quiero una R17 A/T»*. Antes era imposible — Contífico no dice
  el tipo por ningún lado.
- **`tipos_de_llanta`** explica las diferencias cuando el cliente no sabe qué necesita.
- **Tres opciones y no seis**, una por escalón de marca (Falken → Kenda → Giti → Winrun),
  priorizando lo que tiene stock: *«así ni le confundimos tanto al mijin»*.
- El tipo **solo** se afirma si viene de la base; nunca se deduce del nombre del modelo.
- **Las piezas se ven en el chat del panel.** El PNG no se guarda (se sube a Meta y se
  descarta), así que se vuelve a dibujar desde los códigos del mensaje. Usa precios de hoy:
  sirve para comprobar que se ve bien, no como copia exacta. El estado del envío sale del
  mensaje, no de que la imagen cargue.
- **Varios asesores** (tabla `advisors`): antes había uno solo fijado por entorno y sumar a
  alguien exigía redeploy. El índice de dedupe pasó a `(dedupe_key, recipient_phone)` — sin
  eso el segundo asesor chocaba con el unique del primero y nunca recibía nada. Cada asesor
  se cobra aparte: que a uno le falle no deja sin aviso a los demás.

**Arreglado:** el bot escribía `**negrita**` de Markdown cada tantos mensajes y WhatsApp lo
muestra con los asteriscos a la vista (1 de 29 mensajes en producción). Se normaliza al
enviar en vez de pedirlo por prompt: una regla determinista no falla el 3 % de las veces.

### 2026-08-05 · Dos tableros por ventana de 24 h + puesta al día tras el apagón · ⏱️ 2.0 h

**Qué:** el bot de Depot llevaba dos días apagado y el Inbox tenía 104 conversaciones,
**286 mensajes sin leer en 91 de ellas** y 95 tarjetas atascadas en «nuevo». Con el bot
apagado el pipeline sí guarda los mensajes y extrae medida y compromisos, pero
`classifyStage` nunca corre: por eso una clienta que había escrito «Voy el sábado», con
19 sin leer, seguía figurando como nueva.

- **Pipeline partido en dos tableros** por la ventana de 24 h de WhatsApp: arriba lo que
  el bot todavía puede contestar, abajo lo que ya solo puede contestar una persona. Cada
  columna lleva su grupo en el id de drop para que dnd-kit no confunda los dos tableros.
- **`POST /api/hub/tickets/reorganizar`** — recalcula etapas con datos ya extraídos, nunca
  con el modelo. Una etapa mal puesta por una corazonada es peor que una desactualizada.
- **`POST /api/hub/tickets/atender-pendientes`** — el bot contesta lo que quedó huérfano,
  solo dentro de la ventana. Reusa `resumeBotIfUnanswered`, que revalida ventana e
  interruptor por conversación.
- Ambas simulan primero (`?simular=1`) y el panel pide confirmación mostrando el plan:
  mueven tarjetas reales y la segunda manda mensajes a clientes reales.
- **Badge de versión** en el topbar con el commit compilado; al tocarlo se ve qué trajo
  cada actualización. Si el commit del servidor no coincide, avisa: un despliegue a medias
  dejaba de ser invisible. Antes la única forma de saber si un cambio había entrado era
  comparar el SHA-256 del bundle a mano.

**Arreglado de paso:** el switch de pantallas usaba `AnimatePresence`, cuya animación de
salida no terminaba nunca — las pantallas se acumulaban hasta 4 y la anterior quedaba
dibujada encima. Se quitó: cambiar la `key` desmonta al instante y la animación de entrada,
que es la única que se nota, se conserva. (`mode="wait"` se probó y se descartó: trababa la
navegación entera.)

### 2026-08-04 · Fix: Ajustes no dejaba bajar · ⏱️ 0.25 h

**Qué:** la pantalla de Ajustes no scrolleaba. Le faltaba el `h-full overflow-y-auto`
que sí tienen Dashboard, Settings, Pipeline y Cotizador, así que el contenido (3.688 px)
se pasaba del alto de `<main>` y no había forma de llegar a promociones ni a marcas.

**Por qué se coló:** la verifiqué con el panel del navegador oculto, donde los screenshots
salen en blanco, y me quedé con la comprobación por DOM — que decía que las secciones
existían y estaban visibles, porque lo estaban: simplemente eran inalcanzables.

**Nota:** en el mismo intento se probó `AnimatePresence mode="wait"` para arreglar que las
pantallas salientes se acumulen en el DOM, y se revirtió: con "wait" la navegación se traba
del todo (la pantalla que sale nunca termina su animación, la nueva no se monta nunca). La
acumulación con "popLayout" sigue pendiente como fallo aparte.

### 2026-08-04 · Piezas del diseño aprobado + Ajustes separados de lo técnico · ⏱️ 4.0 h

**Qué:** las tres piezas visuales (cotización, comparativa, opciones) se reemplazaron por
el diseño del proyecto de Claude Design, portado a satori. Y nace el tab **Ajustes**, que
es todo lo que Depot Tire puede cambiar solo:

- **Colores y tipografía**: 6 paletas y 7 fuentes de precio, con **vista previa en vivo** —
  la pieza se re-renderiza al tocar cada opción y solo llega al cliente al «Aplicar».
- **Promociones**: alta, baja y condiciones (marca, cantidad mínima, vigencia). Entran a la
  vista previa mientras se escriben.
- **Qué decir de cada marca** (tabla `brand_profiles`): la etiqueta y la frase que salen
  dibujadas, más las notas que son lo único que el bot puede afirmar de esa marca.
- El logo DT pasa a **«Configuración técnica»** y los avisos de «bot apagado» ahora llevan
  a Ajustes, que es donde se enciende.

**Por qué:** el motor se quedó en satori y no se metió Chromium porque un spike mostró que
satori aguanta todo lo que usa el diseño (skew, gradientes anidados, brillos, sombras,
tachados). Chromium habría sumado ~300 MB y empeorado justo el riesgo de memoria que la
Tanda 0.0 señalaba como sospechoso de los fallos de envío. El render sigue en 340–970 ms.

La separación por audiencia y no por tema es el §20 del PDF: el token de Meta no puede estar
a dos clics del tono de voz del bot, y el dueño no debería entrar por la misma puerta para
cambiar una promoción.

**Defectos corregidos mirando el render, no adivinando:** el ✓ y el 🇪🇨 salían como cuadritos
(satori solo dibuja glifos de fuentes registradas) — el ✓ pasó a SVG y el emoji se cae solo
en la imagen, no en el texto de WhatsApp; calcular el alto a mano dejaba una banda muerta
abajo, ahora lo mide satori; las sombras de las tarjetas quedaban corridas.

**Fallo preexistente encontrado de paso:** `AnimatePresence mode="popLayout"` nunca
desmontaba la pantalla que salía y se acumulaban hasta 4 en el DOM — entre ellas el
formulario técnico con sus campos de token. Con `mode="wait"` queda una sola.

**Pendiente que no es de código:** las fotos del catálogo tienen fondo blanco y el diseño
asume recortes con transparencia.

### 2026-08-04 · Tanda 0: la imagen es el mensaje, no un adjunto · ⏱️ 3.0 h

**Qué:** el bot deja de mandar muros de texto. Cuando envía una pieza visual (cotización,
comparativa u opciones), el texto que la acompaña baja a 3–4 líneas y se parte en varios
mensajes cortos separados por `---`, como escribe un vendedor. Los muros viejos siguen
existiendo bajo `…Detallado` y son el respaldo automático cuando la imagen no sale.

- **Recomendación obligatoria.** `preparar_opciones` ahora exige `recomendado` y `motivo`
  en su schema: el modelo no puede mostrar opciones sin decir cuál elegiría y por qué.
- **Bloque `*INCLUYE*` desde tabla** (migración `008_benefits`), con condiciones por marca,
  cantidad mínima, sucursal y vigencia. Sembrado con el texto literal de los chats que
  mandó el cliente.
- **Contador de piezas en Métricas:** enviadas vs fallidas por tipo, últimos 7 días, con
  los errores de render aparte.
- **Ajuste `formato`** (`imagen_primero` / `texto_completo`) para revertir desde el panel
  sin tocar código, y migración que devuelve `emojis` a «pocos».

**Por qué:** el cliente lo dijo con todas las letras — *"está mandando dms texto y la people
ni siquiera lee"*. La imagen ya lleva marca, diseño, medida, precio tachado, precio de hoy,
índice de carga, disponibilidad y garantías; repetir todo eso debajo en texto no agrega nada
y es justo lo que nadie abre. Con 3 productos eran 21 líneas en un solo mensaje; ahora son
10 repartidas en 3.

El `*INCLUYE*` va en tabla y no en el prompt porque el §8 del PDF de especificaciones exige
que una promoción se pueda cambiar o dar de baja sin desarrollador. Y el ajuste `formato`
cambia el comportamiento real de las tres tools, no solo el prompt: un panel que dice una
cosa mientras el bot hace otra es peor que no tener el interruptor.

**Evidencia:** `test/tanda0-evidencia.ts` genera el antes/después de los tres flujos con las
piezas renderizadas por el mismo motor de producción. 135/135 pruebas, migración verificada
idempotente contra base limpia, y el contador revisado en el panel.

### 2026-08-02 · Plan financiero: queda escrito lo acordado ($300 + $300 + $60/mes) · ⏱️ 0.25 h

**Qué:** `PLAN_FINANCIERO.md` incorpora la **opción A′**, que es la que está en el acuerdo firmado
con Depot Tire: $600 cerrados en dos transferencias de $300 (firma y entrega) y $60/mes que
empiezan a correr recién con la Fase 1 entregada. Se recalculó el margen por escenario y la
proyección del año 1 ($1.200 de ingreso, ≈$960 neto), y los argumentos de negociación quedaron
alineados al precio real.

**Por qué:** el documento seguía recomendando la opción A ($600 por fases + $40/mes), que **no** es
lo que se acordó. Un plan financiero que contradice el contrato firmado se convierte en la fuente de
un error de cobro. Con $40 el escenario de régimen quedaba casi en cero; los $60 acordados son los
que sostienen el servicio.

### 2026-08-02 · Interruptor del bot: nace apagado y se enciende desde el panel · ⏱️ 1.5 h

**Qué:** el interruptor global (Ajustes → *Estado del bot*) se terminó y se cerraron sus tres
huecos:

- **`BOT_POWER_DEFAULT=off`** decide con qué estado nace una instalación. Sin fila en `settings`
  mandaba siempre «encendido», así que el deploy de un cliente recién conectado empezaba a
  contestar en cuanto Meta enrutaba el número. Con la DB caída también se devuelve ese default, no
  un «sí» fijo: en un cliente que nace apagado, un error de lectura no puede ser la forma en que el
  bot se enciende solo.
- **Fuga en `resumeBot`**: devolver una conversación al bot desde el panel llamaba al agente y
  enviaba, sin mirar el interruptor. Era la única vía que se saltaba el apagado.
- **El estado se ve en todo el hub**: chip rojo en la cabecera, punto del rail (que antes decía
  «Bot en línea» siempre) y el vacío del Inbox, que afirmaba «el bot está atento» estando apagado.

Documentado en el playbook de conexión (`BOT_POWER_DEFAULT=off` **antes** de apuntar el webhook) y
en la tabla de entornos de `entrega-fases-depot.md`.

**Por qué:** el interruptor estaba escrito pero sin terminar ni desplegar, y su default hacía justo
lo contrario de lo que hace falta al conectar un cliente: en cuanto Meta enruta el número entran
mensajes de clientes **reales**, y eso pasa días antes de que el catálogo, el prompt y las pruebas
estén listos. Depot Tire ya está conectado y su bot no debe hablar hasta que se decida. Un
interruptor con fugas es peor que no tenerlo: el panel dice «apagado» y el cliente recibe mensajes
igual.

**Pruebas:** 4 nuevas en `app/test/botPower.integration.test.ts` (nace apagado, no inventa fecha de
apagado, encender manda sobre el default, y `resumeBot` no responde con el bot apagado). Suite
completa: 124 en verde. Verificado además en el navegador contra una DB local: apagar → encender →
apagar, con el aviso siguiendo por todas las pantallas.

### 2026-08-01 · Depot Tire EN VIVO: app propia en su portafolio + playbook de conexión · ⏱️ 5.0 h

**Qué:** el canal de WhatsApp de Depot Tire quedó **conectado y verificado de punta a punta** — los
siete pasos del diagnóstico en verde, incluido «Mensajes entrando» con un mensaje real. Se creó la
app **AutoVenta Depot Tire** (`1351729383802913`) **dentro del portafolio del cliente**, publicada,
con token permanente del system user `AutoVentas Bot`, suscrita a la WABA y con el webhook apuntando
al deploy de Depot. La app vieja (`AutoVenta`, portafolio Acesso) quedó desuscrita de esa WABA.

Documentación nueva:
- `docs/CONECTAR_WHATSAPP_CLIENTE.md` — playbook de 11 pasos para conectar cualquier cliente, con la
  regla de oro, las trampas y los comandos de diagnóstico.
- `docs/PENDIENTES.md` — lo que queda abierto, con dueño: rotar los tokens expuestos, sacar a Kommo
  de la WABA, devolver el webhook de staging, y el camino a acceso avanzado antes del tercer cliente.

Se borraron `docs/conexion-depot-waba.md` y `docs/prompt-token-meta-depot.md`: describían el modelo
equivocado (la app en nuestro portafolio) y habrían hecho repetir el error.

**Por qué:** el canal llevaba horas «todo verde y sin recibir nada». La causa resultó ser
estructural, no de configuración: **una app en TU portafolio con la WABA en el del cliente es
*agency sharing***, y Meta lo capa de dos formas que no se ven desde el diagnóstico — no deja dar
control total de la app al usuario del sistema (*«Manage task is disabled for agency sharing
scenarios»*) y mantiene los permisos en *«Ready for testing»*, así que **nunca enruta mensajes
reales**. El webhook de prueba del dashboard sí llegaba; los de clientes de verdad, no. Esa
distinción es la que costó el día y es lo que el playbook existe para que nadie vuelva a pagar.

Decisión de producto: **no se importa historial**. Meter conversaciones con fecha vieja en `messages`
haría que el worker de seguimientos las tomara por leads sin atender y le escribiera a clientes ya
atendidos. Agregar historial después es fácil; deshacer seguimientos ya enviados, no.

---

### 2026-07-31 · «Nueva alerta del bot» cada 5 s, y el punto ciego del diagnóstico · ⏱️ 0.5 h

**Qué:** dos arreglos que salieron de encender el worker.

- **El toast incesante.** `reconcileFollowUpAlerts` termina con
  `emitLiveEvent("alert")`, y corre en cada vuelta del worker. Sus inserts son
  idempotentes (`dedupe_key` + `on conflict do nothing`), así que casi siempre
  no crea nada — pero avisaba igual. Con el worker apagado no se notaba; al
  encenderlo, el hub gritaba «Nueva alerta del bot» cada 5 segundos por alertas
  de hace días. Ahora el aviso va condicionado a que algún insert haya contado
  filas, con prueba de regresión contra Postgres (cinco vueltas seguidas = cero
  avisos).
- **El diagnóstico daba «Conectado» con el canal mudo.** Los pasos de webhook y
  firma solo miraban hacia adentro (¿hay verify token?, ¿hay app secret?, ¿se
  montó el handler?). Ninguno preguntaba a Meta si existe una suscripción viva
  apuntando a esta URL. Se añadió el paso **«Meta entregando aquí»**, que
  consulta `GET /{app_id}/subscriptions` con el app access token y distingue
  los tres fallos reales: no hay suscripción, apunta a otra URL, o le falta el
  campo `messages`. De rebote valida que el app secret sea el de la app del
  token — si estuviera cruzado, la firma de cada evento fallaría.
- **La firma se verifica contra Meta, no contra sí misma.** «Hay app secret»
  no comprobaba nada: un secret de otra app se ve igual de lleno. Ahora se
  manda un `appsecret_proof` (HMAC del token con el secret) y es Meta quien
  dice si corresponde. No hace falta el App ID, que con un token de usuario del
  sistema no se puede deducir — y por eso el paso de la suscripción, cuando
  Meta rechaza la credencial y la firma sí es válida, se declara indeterminado
  en vez de acusar al secret.
- **El App ID se deduce con `debug_token`.** `/me` con token de usuario del
  sistema devuelve el usuario (122103177789404114), no la app
  (1053180323906811), y con ese id la consulta de suscripción no podía
  funcionar. `debug_token` da los dos datos que faltaban: a qué app pertenece
  el token y cuándo caduca — el paso del token ahora avisa en ámbar si es
  temporal, en vez de dejar que el canal se muera solo una semana después.
- **«Mensajes entrando» ya no da ✅ con un inbound de hace 7 días**: pasadas
  48 h se pone en ámbar. Un mensaje viejo no prueba que el canal esté vivo hoy,
  que es justo lo que se estaba mirando mientras nada llegaba.
- Y `listo` (el titular «Conectado») ahora exige que ningún paso esté en
  `error`, no solo que los tres críticos estén en verde.

**Por qué:** los dos fallos son la misma familia que el worker sin latido —el
sistema se ve sano desde afuera mientras está roto— y el diagnóstico existe
precisamente para no tener que adivinar. Un chequeo que solo se pregunta a sí
mismo no sirve: tiene que preguntarle a Meta.

### 2026-07-31 · El canal llevaba días caído y nadie lo sabía · ⏱️ 0.5 h

**Qué:** el bot dejó de responder en WhatsApp desde el 24-jul. El diagnóstico
del canal (`/api/channel/diagnose`) responde `token: error` — Meta lo rechaza
con el código 190: **el token temporal de 24 h caducó**. Webhook y firma siguen
bien. El arreglo es generar el token permanente de System User y pegarlo en
Ajustes → WhatsApp; no hay nada que cambiar en el código para eso.

Al revisar `/health` salió un segundo fallo, este sí de código: el worker de
seguimientos nunca había latido (`worker.ok=false`, `lastBeatAt=null`) porque el
servicio dedicado de Railway no existe. Ahora el proceso HTTP lo levanta él
mismo, con un supervisor que lo relanza si el bucle se cae, y `/health` reporta
en `worker.modo` de dónde debería venir el latido.

**Por qué:** los dos fallos comparten la misma forma —el sistema queda mudo y
sigue viéndose sano desde afuera—. El latido que se añadió el 27-jul hizo su
trabajo: delató al worker apagado. Lo que faltaba era que no dependiera de que
alguien se acordara de crear un segundo servicio en Railway; la configuración
por omisión ahora es la que funciona, y separar los procesos pasa a ser una
decisión explícita (`FOLLOW_UP_WORKER=externo`) para cuando crezca el volumen.

**Ojo:** mientras el token siga caducado el worker tampoco puede enviar. Los
seguimientos vencidos de estos días no se van a mandar como si nada — están
fuera de la ventana de 24 h y quedan como alertas para revisión humana, que es
el comportamiento correcto.

### 2026-07-27 · Calidad comercial, modelo lento, respaldos y latido del worker · ⏱️ 3.0 h

**Qué:** cerrar los cuatro huecos que el reporte de carga dejó abiertos, más
pruebas funcionales de los seguimientos perezosos.

- **Evaluador de calidad comercial** (`npm run test:calidad`): 10 reglas duras
  determinísticas —precio, descuento, stock, plazo inventados; no pedir la
  medida; largo; sin pregunta; saludo repetido— más un juez LLM solo para lo
  que las reglas no pueden ver. Un fallo crítico reprueba aunque el juez ponga
  5. Las reglas tienen 12 pruebas propias contra respuestas que **deben**
  fallar: sin eso, "0 fallos" es indistinguible de un evaluador roto.
- **12 pruebas funcionales de seguimientos** (`followUpsLazy.integration`) que
  espían `generateFollowUpCopy` y cuentan llamadas: programar cuesta 0, el
  worker redacta exactamente 1 vez, «Generar» del asesor evita que el worker
  vuelva a pedirlo, el texto escrito a mano sobrevive, y los seis portones
  (cliente respondió, opt-out, cambio de etapa, fuera de horario, plantilla,
  carrera del worker) cancelan **antes** de gastar redacción.
- **Corrida con modelo lento (2 s) y 10 % de errores de Meta**: 13/13 en verde.
  55 rechazos inyectados (30× 429, 25× 503) absorbidos por los reintentos, sin
  un solo duplicado. El ACK se quedó en 72 ms: la ruta de acuse está bien
  desacoplada del modelo.
- **Respaldo probado** (`npm run ops:backup`): dump → restaurar en base limpia →
  comparar las 11 tablas que importan. Falla si alguna difiere. Verificado.
- **Latido del worker** + `/health` lo reporta. Era el agujero más silencioso:
  el worker corre en otro proceso sin healthcheck, y si moría los seguimientos
  se detenían mientras el bot seguía contestando y el panel seguía abriendo.
- **`docs/OPERACION.md`**: respaldos, alertas con umbrales, rollback y los
  pasos del token permanente de WhatsApp.
- **Modo `--real-model`** en la prueba de carga y `--latency`/`--chaos`.

**Por qué:** el reporte anterior terminaba con cuatro salvedades honestas y
quedarse ahí las convertía en deuda. Tres se cerraron. La cuarta —correr contra
la API real de OpenAI— quedó **bloqueada por falta de `OPENAI_API_KEY`** en el
entorno; la maquinaria está lista y es un comando. El token permanente de
WhatsApp exige Meta Business Manager y es tuyo.


### 2026-07-27 · Prueba de carga de 50 clientes + fix de durabilidad del webhook · ⏱️ 4.0 h

**Qué:** banco de pruebas de carga completo en `app/scripts/loadtest/`
(`npm run test:carga`) y el arreglo del bug que destapó.

- **Banco nuevo:** base efímera, stub de la Graph API, stub de OpenAI, bot y
  worker como procesos hijos, cinco escenarios y 13 criterios de aceptación.
  Capturas del panel con Playwright, cada una con su aserción. Nada sale a Meta.
- **`GRAPH_BASE_URL`** (nuevo, default = el host real de Meta) para poder
  apuntar la salida a un stub. Si no apunta a Meta, lo avisa al arrancar.
- **Bug encontrado y corregido — el webhook respondía 200 antes de guardar.**
  El mensaje quedaba en un buffer en memoria mientras se le decía 200 a Meta.
  Un reinicio lo borraba y Meta **nunca lo reenvía**, porque para Meta ya fue
  entregado. El escenario E lo reproducía: 20 de 20 mensajes perdidos.
  Ahora `recibirMensaje()` persiste antes de encolar; el escenario E pasó a
  0 de 20 perdidos.
- **Efecto secundario del mismo arreglo:** cada mensaje guarda su propio
  `wa_message_id` (antes, al agrupar, solo se guardaba el del primero: 60 de
  340 quedaban sin registrar). Ahora la deduplicación definitiva es el unique
  de la base y no un `Map` que muere con el proceso.

**Por qué:** antes de ofrecerle el bot a Depot con volumen real hacía falta
saber si aguanta, y "aguanta" tenía que significar algo medible y no una
impresión. El hallazgo importante no fue de rendimiento —el pool de 5
conexiones ni se despeinó, el ACK quedó en 98 ms sobre un presupuesto de
3 000— sino de correctitud: se perdían mensajes de clientes en cada reinicio,
en silencio y sin manera de enterarse.

Veredicto final: **13/13 criterios en verde** con 50 clientes, 340 mensajes,
564 llamadas al modelo. Reporte y capturas en `reports/<timestamp>/`.
Detalle del diseño en `PLAN_CARGA_50_CLIENTES.md`.

### 2026-07-27 · Fix: el botón «Generar» estaba en una pantalla muerta · ⏱️ 0.5 h

**Qué:** al verificar el deploy anterior, los strings del botón nuevo no
aparecían en el bundle publicado. La causa: `FollowUpsView` y
`FollowUpCardView` (en `hub/src/screens/Pipeline.tsx`) **no se usan en ningún
lado** — Vite los elimina por tree-shaking. Ahí vivían también «Enviar ahora»,
«Editar» y «Cancelar» de seguimientos, así que ninguna de esas acciones existía
en el panel publicado, solo sus endpoints.

- Se revirtió el cambio sobre el código muerto.
- Las acciones por seguimiento —«Generar con IA», «Editar», «Enviar ahora»—
  se movieron a `hub/src/screens/Opportunities.tsx`, que es la pantalla que el
  asesor usa de verdad.
- La tarjeta pasó de ser un `<button>` que envolvía todo a un `<div>` con el
  área de navegación como botón, porque anidar botones es HTML inválido.
- «Enviar ahora» pide confirmación: manda un WhatsApp a un cliente real.

**Por qué:** el ahorro de tokens (Fase A) ya funcionaba sin UI —el worker
redacta al enviar—, pero el control del asesor (Fase B) era inalcanzable: el
endpoint existía y nada lo llamaba. Verificar el bundle desplegado, y no solo
que compilara, es lo que lo destapó.

Pendiente aparte: borrar `FollowUpsView`/`FollowUpCardView`, que además filtran
por el bucket `human_review` que el backend ya no emite (hoy son
`needs_human`/`closing`).

### 2026-07-27 · Seguimientos perezosos: redactar el mensaje solo cuando va a salir · ⏱️ 1.0 h

**Qué:** el texto del seguimiento deja de generarse por adelantado.

- **Al programar ya no se llama al modelo** (`scheduleConversationFollowUps`).
  Se inserta la cita —cuándo, a quién, contexto— con un borrador
  determinístico (el fallback que ya existía, costo cero) marcado
  `aiPending: true` en el payload.
- **El worker redacta en el último momento** (`followUpProcessor.ts`), después
  de todos los portones y justo antes de enviar. Además genera **un** mensaje
  por llamada en vez de los dos de golpe.
- **Portón nuevo:** si el cliente escribió después de programarse el
  seguimiento, se cancela con `customer_replied`. El inbound ya lo cancelaba,
  pero esto cubre la carrera entre el mensaje entrante y el worker.
- **Botón «Generar»** en el panel (`POST /api/hub/follow-ups/:id/generate`):
  el asesor redacta y edita bajo demanda; queda `aiPending: false` y el worker
  lo respeta sin regenerar.
- **Bug corregido de paso:** el `PATCH` de edición guardaba el texto del asesor
  pero no apagaba ninguna bandera. Con el esquema perezoso el worker habría
  **sobrescrito la edición manual**. Ahora marca `copySource: 'advisor'`.
- **Métricas** `generations_avoided` / `generations_used` para ver el ahorro.

**Por qué:** se pagaba por adelantado por mensajes que muchas veces se
descartan —el cliente respondió, compró, o el asesor cerró el ticket antes de
la hora de envío. El ahorro en tokens es de centavos (mini es baratísimo); lo
que importa es que la misma regla —*no generar ni mandar nada que pueda no
usarse*— es la que después evita mandar templates de Meta a ~$0,074 c/u, que
es el gasto que sí duele cuando Depot escale. Plan completo en
`PLAN_SEGUIMIENTOS_LAZY.md`.

Retrocompatible: los jobs viejos sin `aiPending` se envían tal cual, y no hizo
falta migración porque el `payload` ya era `jsonb`.

### 2026-07-27 · Ajustes → WhatsApp: conectar el canal con verificación paso a paso · ⏱️ 1.5 h

**Qué:** Enlazar el WhatsApp del negocio deja de ser un trámite a ciegas.

- **Pestaña nueva «WhatsApp»** en Ajustes, y es la que abre por defecto
  (`hub/src/components/whatsapp-setup.tsx`). Reúne los cinco campos que pide
  Meta —token, Phone Number ID, verify token, app secret y WhatsApp del
  vendedor— en un solo formulario, cada uno con la ruta exacta donde
  encontrarlo en Meta.
- **`GET /api/channel/diagnose`** (servicio nuevo `channelDiagnostics.ts`):
  seis chequeos con evidencia real, no un booleano.
  1. *Token* — `GET /me` contra la Graph API; distingue caducado (code 190)
     de mal copiado.
  2. *Número* — `GET /{phoneId}` y devuelve **el número y el nombre
     verificado que Meta tiene registrados**, más la calidad. Es la prueba de
     que el token y el número son de la misma cuenta.
  3. *Webhook* — si está montado, y qué campo falta si no.
  4. *Firma* — si hay app secret para validar los eventos entrantes.
  5. *Entrando* — hace cuánto llegó el último mensaje inbound. Única prueba
     de que Meta está entregando de verdad en este servidor.
  6. *Vendedor* — si las alertas de handoff tienen destinatario.
- **`POST /api/channel/test`**: manda un texto real al número que escribas y
  traduce el rechazo de Meta (ventana de 24 h, token inválido) a español.
- Botón **Revisar conexión** que reejecuta todo, y un bloque que muestra la
  **URL del webhook y el verify token listos para copiar** — con el recordatorio
  de suscribir el campo `messages`, que es lo que más se olvida.
- Guardar no borra: los campos vacíos conservan lo guardado, y el token y el
  app secret nunca vuelven del servidor (se marcan «ya guardado»).

**Por qué:** el canal solo se podía tocar desde `/panel`, que es un formulario
plano sin verificación: guardabas el token y no sabías si servía hasta que un
cliente escribía y no pasaba nada. Los errores de Meta son crípticos (code 190,
131047) y el fallo más común —no suscribir `messages`— no produce ningún error,
solo silencio. Ahora cada paso dice qué se comprobó, contra qué, y qué hacer.

**Verificación:** `npm test` (85 ✓) y typecheck de app y hub. La pantalla se
probó en el navegador contra un backend simulado: guardar, generar verify token,
marcas de «ya guardado», copiar URL, y el error de ventana de 24 h. Los chequeos
contra la Graph API real **no se han ejercitado todavía** con credenciales de
Meta — eso se valida al abrir la pestaña en staging.

---

### 2026-07-27 · Hub rediseñado: simple, oscuro y con los dos entornos al frente · ⏱️ 0.5 h

**Qué:** `app/site/index.html` se reescribió de cero.

- **Dos tarjetas de entorno** arriba de todo: **Staging** (azul, tu laboratorio)
  y **Depot Tire** (rojo, el cliente en vivo), cada una con su URL visible y
  atajos directos a Inbox · Pipeline · Cotizador · Métricas · Ajustes.
- El **panel de fases** queda como única banda destacada debajo.
- Todo lo demás colapsó en dos rejillas compactas: *Accesos* (demo,
  cotizaciones, presentación, config IA, tester, mensajes) y *Documentación*.
- Un chip marca **en cuál de los dos entornos estás** leyendo el hostname
  (`staging` / `depottire`), así el hub sirve igual desde ambos deploys.
- La página es **autocontenida**: ya no importa `showroom-gp-global.css/js`, así
  que no arrastra la franja de cuadros, el auto ambiental ni los sonidos. El
  resto del sitio conserva el sistema Showroom GP intacto.
- Se eliminaron las secciones "Cómo se conecta todo" y "Planes y documentación"
  como bloques largos: decían lo mismo que las tarjetas, con otras palabras.

**Por qué:** Manuel pidió un hub "más simple y más moderno", con los links
importantes a la vista y acceso directo tanto a staging como a la versión de
Depot Tire — inspirado en el hub de Mesita (`/accesos`). El hub anterior tenía
cinco secciones y repetía los mismos destinos hasta tres veces; entrar al
producto del cliente exigía leer un párrafo de arquitectura primero. Ahora la
decisión es una sola: **¿a qué entorno entro?**

---

### 2026-07-26 · Gate de conexión: el hub dice si la clave sirve · ⏱️ 1.0 h

**Qué:** El hub ya no falla en silencio cuando la clave administrativa está mal.

- `probarClaveAdmin()` valida la clave contra `/api/status` + `/api/phases` **sin
  guardarla**, y distingue 401 (clave rechazada) de fallo de red (servidor caído).
- `AdminKeyForm` (componente nuevo, `components/admin-key.tsx`): campo + botón
  **Conectar** que responde en la misma pantalla — verde con la fase activa y las
  pantallas que desbloquea, rojo si la clave está mal, ámbar si no hay servidor.
  Se usa en dos sitios: el gate y Ajustes → Conexión.
- `ConnectionGate`: pantalla completa cuando el hub no puede leer datos.
- `ConnectionChip` en el topbar con el estado real. Antes ese espacio decía
  "Bot en línea 24/7" fijo, incluso desconectado.
- `AdminKeyError` + estado `conexion` en el store; el 401 del SSE ya no se queda
  en un toast que se desvanece.
- **Bug preexistente:** faltaba el token `--color-navy`, así que `bg-navy` no
  pintaba nada y los 5 botones de Ajustes salían con texto blanco sobre fondo
  transparente (invisibles). Definido en la paleta base y en los 4 temas.
- **Bug de render:** la animación de entrada del gate se quedaba congelada en
  `opacity: 0.26`; se quitó — esta pantalla no puede depender de que termine.
- Verificado en navegador con el server real: sin clave sale el gate; clave mala
  → rojo; clave buena → verde y aparecen los 5 iconos con "Fase 4"; apagar y
  encender fases por API cambia la nav **sin recargar**; el demo sigue intacto.

**Por qué:** Manuel reportó que "se perdieron muchas cosas" y que "al activar las
fases en el panel no se activa nada en la página". No era pérdida de datos: con
el sistema de fases todos los endpoints quedaron detrás de `ADMIN_KEY`, y un hub
sin clave se ve **idéntico** a un negocio sin conversaciones — misma pantalla
vacía, nav recortada, cero avisos. El diagnóstico tenía que ser visible.

---

### 2026-07-23 · Panel controla staging + refresh en vivo + tarjetas clickables · ⏱️ 0.4 h

**Qué:** Tres arreglos tras el merge:
- El panel ahora trae **Staging Y Depot Tire** precargados (antes solo Depot).
  Cada entorno tiene sus propias fases; así se pueden encender las de staging.
- `PUT /api/phases` emite `emitLiveEvent("sync")` → los hubs abiertos refrescan
  la navegación **en vivo** al togglear (antes había que recargar a mano).
- Las 3 tarjetas de "Cómo se conecta todo" en el landing ahora son **links**
  (Staging→/admin, Cliente→/admin, Panel→/panel).

**Por qué:** "toggleo y siguen saliendo 2 tabs" = estaba mirando staging pero el
panel solo controlaba Depot; y el hub no se refrescaba solo. Nada se borró: el
merge conservó todo; encender las 4 fases da el producto completo.

---

### 2026-07-23 · MERGE: fases/panel + Oportunidades (codex) unificados · ⏱️ 4.0 h

**Qué:** Fusión de las dos ramas que habían divergido desde `130eef4`:
`main` (fases + panel central + canal en runtime) y `codex/producto-real-depot-tire`
(Oportunidades/seguimientos, worker, descuentos, política de conversación,
alertas al asesor). Base = codex; re-aplicadas encima las 4 piezas de main.
- Conflictos resueltos en 10 archivos core (agent.ts, index.ts, admin.ts,
  wa/client.ts, config.ts, App.tsx, store.ts, source.ts, package.json).
- `wa/client.ts`: las funciones de codex (sendCustomerText con gate de política,
  sendAdvisorText, sendApprovedTemplate) reimplementadas sobre mi envío Graph
  API + canal en runtime; se conserva initWa/getWa/reloadWa/setWaHandlers.
- **Fase 4 = Oportunidades**: nav gateado en App.tsx, `phase_config.fase4`,
  agendado de seguimientos gateado por fase4 en index.ts, toggle en el panel.
  Gating de tools seguro (solo bloquea tools gateadas; el resto pasa).
- Verificado: backend typecheck+build+**85 tests** verdes; hub typecheck+build;
  demo muestra Oportunidades; landing con sección "Cómo se conecta todo".
- El worker de seguimientos es proceso aparte (`start:worker`); solo hace falta
  cuando la Fase 4 está encendida.

**Por qué:** el cliente quería Oportunidades ("botón con estrella") además del
sistema de fases. Estaban en ramas/carpetas distintas; unificarlas evita perder
features y deja una sola base de código para staging y clientes.

---

### 2026-07-23 · Panel: clientes precargados, solo pide admin key · ⏱️ 0.5 h

**Qué:** El panel `/panel` ya trae a **Depot Tire precargado** (nombre + URL en
`KNOWN_CLIENTS` del código); el usuario solo pega el **admin key** y conecta.
Antes había que escribir nombre + URL + clave cada vez. Storage nuevo
(`autoventa_admin_v2`): las URLs conocidas vienen del código, las claves viven
solo en el navegador. Botón "+ Agregar otro cliente" para clientes futuros.

**Por qué:** fricción tonta — Manuel solo necesita pegar la clave, no reescribir
datos que ya sabemos. Verificado en navegador (tarjeta Depot con "falta admin
key" + input de clave + Conectar).

---

### 2026-07-23 · Canal editable desde el panel + webhook en caliente · ⏱️ 1.0 h

**Qué:** El canal de WhatsApp de cada cliente se llena desde el **panel central**
(`/panel` → tarjeta → Canal de WhatsApp), no desde variables de Railway.
- `wa/client.ts`: `initWa()` ahora devuelve null si faltan credenciales (el bot
  arranca igual, webhook inactivo); `setWaHandlers()` registra los handlers una
  vez y se re-aplican al reconstruir; `reloadWa()` reconstruye el webhook tras
  guardar el canal → el token nuevo entra **en caliente, sin redeploy**.
- `PUT /api/channel` llama `reloadWa()` y devuelve `activo`. `webhook.ts` responde
  200 (no reintento) / 503 si el canal aún no está.
- Panel: editor de canal por cliente (token/phoneId/appSecret/verify/vendedor),
  guarda parcial (blanco = mantener), secretos nunca se muestran.

**Por qué:** Depot manda sus datos de WhatsApp Business después; el env de su
deploy queda en blanco y Manuel llena el canal desde el panel cuando lleguen,
sin tocar Railway ni redeployar.

---

### 2026-07-23 · Fases por cliente + panel central de admin + canal en runtime · ⏱️ 4.0 h

**Qué:** Sistema de entrega por fases sobre una sola base de código.
- `services/phases.ts`: `settings.phase_config` (fase2/fase3; fase1 núcleo siempre).
  El backend trae todo; el frontend (nav del hub) y las tools del agente se
  gatean por fase. `PHASES_DEFAULT` como fallback (staging="all", Depot="1").
- Panel central `app/site/panel/`: superficie **aparte** que enciende fases de
  cada cliente llamando a su `/api/phases` (CORS + `x-admin-key`, registro de
  clientes en localStorage). El hub del cliente ya no tiene controles de fase.
- `services/channel.ts` + rewrite de `wa/client.ts`: credenciales de WhatsApp
  resueltas en runtime (DB > entorno), envío por Graph API con reintentos.
  `WHATSAPP_*` ahora opcionales → el bot arranca sin ellas.
- Auth del panel **fail-closed** con `NODE_ENV=production`. Respuestas que Meta
  rechaza se guardan como `failed` (no se pierden en silencio).
- `npm run seed:depot` (base limpia) + guía `docs/entrega-fases-depot.md`.
- Landing enlaza las 3 superficies (staging · cliente · panel). Production viejo
  queda fuera (se borra desde Railway; el repo usa links relativos).

**Por qué:** entregar Fase 1–2 a Depot hoy y encender el resto por botón, sin
forkear el código ni perder features. Staging (deploy desde `main`) es la fuente
de verdad; cada cliente es el mismo repo con su entorno, base y clave propios.

---

### 2026-07-20 · Piezas visuales en todos los flujos + verificación en vivo · ⏱️ 2.0 h

**Qué:** Al probar en staging quedó claro que el flujo que más se usa (opciones tras
confirmar la medida) seguía siendo solo texto, el fitment no conocía al Prado 2002 y el
PDF de cotización mantenía el diseño viejo. Fixes: (1) `preparar_opciones` ahora envía la
pieza de catálogo agrupada por marca (estilo pieza 3 de Grupo Inter) además del texto;
(2) tabla de fitment ampliada con Prado/Land Cruiser, RAV4, 4Runner, Montero, L200,
Outlander, Tracker, Captiva, Wingle y JAC T8; (3) el PDF de `generar_cotizacion` incrusta
el PNG del diseño nuevo (pdfmake queda de último recurso); (4) endpoint
`/cotizaciones/live.png?medida=205/55R16` que renderiza la comparativa con el catálogo
real EN el servidor — prueba en vivo de que satori/resvg/fuentes/fotos funcionan en Railway.

**Por qué:** El cliente probó el bot y reportó que "no se implementó ningún cambio": las
piezas existían pero no estaban conectadas al flujo que él recorrió. Ahora todos los
caminos (opciones → comparación → cotización) mandan imagen, y hay una URL para verificar
el motor en producción sin tener que chatear.

**Cómo se probó:** 41 tests + typecheck + build; fitment de Prado 2002 verificado por
script; pieza de opciones renderizada con productos reales (fotos del manifiesto) y
revisada a ojo; tras el deploy, `/cotizaciones/live.png` verificado por HTTP en staging.

---

### 2026-07-20 · Unificación de entornos: imágenes de cotización sobre el catálogo real · ⏱️ 2.0 h

**Qué:** Existían dos entornos con código distinto — producción (`main`) con el motor de
imágenes y staging (`codex/producto-real-depot-tire`) con el catálogo real de Contífico.
Se fusionaron en una sola línea: el renderer (`src/render/`) ahora consume el `CatalogItem`
de Contífico (precio hoy y precio lista ya con IVA, disponibilidad de 3 estados, foto real
del manifiesto, índice de carga y garantía por marca desde `quoteMessages`). `enviar_comparacion`
y `generar_cotizacion` mandan **imagen** como pieza principal y caen al PDF de staging si
el render o el envío fallan; `incluir_pdf` lo adjunta cuando el cliente lo pide. Se eliminó
`domain/loadSpeed.ts` (duplicaba `domain/tireSpecs.ts`) y `wa/client.ts` quedó con el envío
endurecido (reintento de upload + verificación de la respuesta de Meta) conservando el id
de mensaje que usa el panel. Los logos de banco pierden su rectángulo blanco de fondo.

**Por qué:** Dos entornos divergentes significan dos productos que mantener y demos que no
coinciden con lo que ve el cliente. Staging queda como el único entorno vivo; ambos quedan
con el mismo código mientras se retira producción.

**Cómo se probó:** 41 tests, typecheck y build limpios; las 3 piezas regeneradas con
productos reales del catálogo (KR608 $239.44 vs lista $319.25 = −25%, idéntico a la
referencia de Grupo Inter) y revisadas a ojo con fotos reales y estado "Sin stock".

---

### 2026-07-20 · Cotizador funcional conectado a Contífico · ⏱️ 6.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Se agregó el tab `Cotizador` al Hub con búsqueda por medida, código, marca o diseño y filtros independientes por marca y disponibilidad.
- Contífico es ahora la fuente primaria del catálogo: los productos se normalizan, cachean y conservan en memoria ante una falla de sincronización. Google Sheets queda como fallback.
- Se centralizaron las reglas de búsqueda, precio y disponibilidad para que las usen tanto el Hub como las herramientas del bot.
- Se separaron explícitamente tres salidas comerciales: **opciones filtradas** (todas las tarjetas visibles, agrupadas por marca), **comparación** (2–3 alternativas, sin cantidad ni total conjunto) y **cotización final** (un solo modelo decidido, con cantidad y total).
- Opciones filtradas genera mensaje distribuidor, mensaje cliente final e imagen para WhatsApp. Comparación y cotización final generan cada una su propio mensaje, imagen y PDF.
- Se añadió un manifiesto local de fotos limpias por marca + diseño, con los 38 diseños y 375 productos cubiertos desde fabricantes y distribuidores identificados, además de su registro de procedencia.
- Se incorporaron índice de carga/velocidad, garantía de fábrica, cobertura contra golpes, precio lista, precio hoy y descuento en tarjetas, mensajes e impresos.
- Se añadieron endpoints protegibles por `ADMIN_KEY`, configuración sin secretos, pruebas unitarias y el build actualizado del demo Showroom GP.

**Checks:** catálogo real de 375 llantas cotizables; búsqueda real por `205/55R16`;
36 tests; typecheck de backend y frontend; ambos builds; 100% de cobertura visual; filtros, mensajes,
comparación y cotización probados desde la interfaz; ambos PDF renderizados a
PNG y revisados visualmente sin recortes ni desbordes.

**Por qué:** Permite demostrar desde ahora el flujo comercial central de Interbot
con datos propios de Depot Tire, sin depender de su aplicación ni copiar su base
privada. El mismo dato y la misma regla alimentan al vendedor y al bot, evitando
precios o stock diferentes entre canales.

---

### 2026-07-20 · Cotizaciones visuales nivel Grupo Inter + comparativa + envío endurecido · ⏱️ 4.0 h

**Qué:** Motor de imágenes de cotización (`src/render/`): satori + resvg (HTML→SVG→PNG,
sin Chromium — cabe en los 512MB de Railway). Tres cambios visibles para el cliente:
(1) `generar_cotizacion` ahora manda una **imagen** de cotización estilo Racing Heritage
(logo de marca en vez del nombre, foto, PVP tachado + % de ahorro, medallas de garantía,
índice de carga traducido a kg/km-h, stock real como Disponible/Consultar) y el PDF solo
si lo piden (mismo diseño: el PNG incrustado vía pdf-lib); (2) tool nueva `comparar_llantas`
(2–3 opciones lado a lado); (3) `sendPdf`/`sendImage` verifican upload y respuesta de Meta
con 1 reintento — el fallo del demo del 20-jul era silencioso. Catálogo acepta columnas
opcionales `pvp` y `foto`; garantías por marca en config. Si el render o el envío fallan,
la cotización NO se cae: fallback a PDF clásico y el agente la da completa en texto.

**Por qué:** En la reunión del 20-jul el cliente pidió explícitamente cotización como
imagen (no "texto grandote"), al nivel de las piezas de Grupo Inter que nos mostró, con
el logo de la marca — y en el demo los PDFs fallaron en vivo. La cotización visual es la
cara del producto; el número COT-XXXX visible prepara la fase de incentivos/redención.

**Cómo se probó:** `test/render-demo.ts` genera las 3 piezas (héroe, multi, comparativa)
revisadas a ojo; 26 tests unitarios (nuevo parser de índice de carga); typecheck y build ok.
E2e real con `test/send-image-e2e.ts`: render (531 KB) y upload a Meta OK; el send de prueba
requiere agregar el número al allowed list de la app de Meta (sigue en modo dev).
Fix posterior: `incluir_pdf` opcional en el schema (si el modelo lo omitía, Zod tumbaba al agente).
Galería `/cotizaciones` en el hub con las 3 piezas renderizadas, enlazada desde Operación.

---

### 2026-07-20 · Sistema Showroom GP en todo el hub · ⏱️ 2.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Se creó `DESIGN.md` como fuente de verdad de Showroom GP: principios, paleta, tipografía, componentes, lenguaje racing, sonido, movimiento, responsive, accesibilidad y criterios de aceptación.
- La capa global del hub ahora agrega de forma consistente telemetría, carros, llantas, circuito, líneas de velocidad y placas técnicas, siempre fuera del contenido y con opacidad baja.
- Se unificaron tarjetas, campos, botones, estados, modales, documentos y el catálogo Pitstop con el showroom claro; se eliminó visualmente el patrón cuadriculado de las áreas de contenido.
- El sonido global cubre todos los enlaces y botones, conserva la preferencia entre páginas y mantiene un control visible para apagarlo.
- Showroom GP pasó a ser el tema por defecto y todos los accesos operativos apuntan al demo oficial; Racing Heritage y las otras direcciones quedan como referencias históricas comparables.
- `DESIGN.md` también se renderiza dentro del hub como documento navegable.

**Por qué:**
- La dirección híbrida ya fue aprobada por el usuario: la simplicidad del showroom facilita entender el producto y los detalles de carreras generan la emoción que sus clientes buscan. Documentarlo y convertirlo en una capa compartida evita que nuevas pantallas vuelvan a verse como productos distintos.

---

### 2026-07-18 · Fix handoff: mensajes con bot pausado + typing honesto · ⏱️ 0.5 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- **Bug:** con el bot pausado (handoff tras envío manual desde /mensajes), los mensajes del cliente se descartaban ANTES de guardarse — no aparecían en el panel, justo cuando el dueño más necesita leerlos. Además `received("text")` mostraba "escribiendo…" en cada mensaje entrante, aunque el bot estuviera pausado y nunca fuera a contestar.
- **Fix en `app/src/index.ts`:** el pipeline ahora guarda el mensaje (con idempotencia) y actualiza funnel/etapa ANTES del check de pausa; si está pausado, calla pero todo queda en el panel. El typing se movió a después del check: `showTyping()` (nuevo helper en `wa/client.ts` = markAsRead + indicador) solo cuando el bot sí va a responder. El handler de webhook ahora solo marca leído (`received()` sin argumento).
- Typecheck limpio y los 21 tests pasan.

**Por qué:**
- Prueba real del dueño: escribió al número, el mensaje no salía en el panel, y WhatsApp mostraba "escribiendo…" sin respuesta — parecía bot roto cuando en realidad estaba pausado por los envíos manuales de prueba. Ahora el panel es la fuente de verdad del chat y el typing no miente.

---

### 2026-07-18 · Racing Heritage en todo el frontend + hub compacto · ⏱️ 1.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Decisión tomada: **Racing Heritage (estilo 04) es el elegido**. Se aplicó a todas las superficies: hub (`/`), mensajes de WhatsApp, configuración de IA, WA tester, galería de estilos y el demo React (`/demo/` ahora arranca en racing por defecto; `?theme=aurora` conserva el tema anterior).
- El hub se reorganizó para ser más compacto: documentación, negocio y plataformas pasaron de cards grandes a filas densas de una línea; la demo destacada es una card navy con franja de pit lane y los 4 estilos como pills (racing marcado 🏆); operación queda en 4 cards compactas.
- Las herramientas (mensajes/config/tester) solo cambiaron de `<style>` — el JS y el HTML quedaron intactos, así que la lógica de Codex (API, gate ADMIN_KEY, polling) no se tocó.
- La galería `/estilos/` quedó en crema racing con la card 04 marcada "🏆 elegido" y la botonera reordenada.

**Por qué:**
- Feedback directo: "el Racing Heritage ux y color pallet ganó". Un solo lenguaje visual en todo el proyecto — de la landing al tester — para que se sienta producto y no colcha de retazos.

---

### 2026-07-18 · Demo del Hub en 4 estilos · ⏱️ 1.5 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- El demo del Hub ahora existe en 4 estilos completos, hosteados en Railway: `/demo/` (Claude × Aurora, el actual), `/demo-showroom/` (estilo 03), `/demo-racing/` (estilo 04) y `/demo-neobrutalista/` (estilo 05). La galería `/estilos/` tiene la botonera para abrirlos.
- Cómo: el hub se retematizó por design tokens. Los ~60 colores hardcodeados de los componentes pasaron a tokens/`color-mix` sobre `--color-paper` (se invierten solos en temas claros); etapas del funnel, cierres, avatares y confetti ahora son variables CSS con gama propia por tema. El documento de cotización quedó "papel literal" (un PDF es blanco en cualquier tema).
- 3 hojas de tema en `hub/src/design/themes/` activadas por `<html data-theme>`, que se deduce de la URL (`/demo-racing/` → racing). Un solo build de Vite (base `./`) copiado a las 4 rutas.
- Fidelidad a las páginas de estilos: neobrutalista con bordes 3px negros, sombras duras y chips negro/amarillo; racing con navy, Archivo Black y placa de box; showroom blanco con sombras suaves y rojo con cuentagotas.
- Verificado en dev server pantalla por pantalla (inbox, kanban, chat, dashboard) en los 4 temas; el tema por defecto quedó idéntico.

**Por qué:**
- Para la decisión de estilo con Joaquín: comparar mockups estáticos no es lo mismo que usar la app real en cada dirección visual. Ahora los 4 se pueden abrir lado a lado desde el hub.

---

### 2026-07-18 · Herramientas de operación en línea · ⏱️ 2.5 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Las 3 tarjetas del hub que decían "requiere dashboard local" (localhost:3001/3000) ahora funcionan en la URL de Railway: `/mensajes`, `/configuracion/ia` y `/tester`.
- API nueva `/api/*` en el bot: listar conversaciones y mensajes reales de Postgres, envío manual (pausa el bot en ese chat, mismo handoff que responder desde el celular), pausar/reactivar bot, configuración de IA, y envío directo del tester.
- Tabla `settings` (key/value jsonb): guarda personalidad, tono, emojis, longitud y cierre 🤝. `runAgent` los inyecta al system prompt en cada respuesta (cache 30 s).
- Protección con `ADMIN_KEY` opcional: si la variable existe en Railway, el navegador pide la clave una vez. Los errores de Meta se responden como 502 para no confundirlos con el 401 del login.
- Probado en local con Postgres temporal: lista, chat, pausa, guardado de config y errores del tester.

**Por qué:**
- Esas herramientas solo servían con un dashboard local que ni siquiera existe en el repo — el dueño necesita ver los chats y probar el bot desde cualquier lado. El tester local (tools/wa-tester) queda como respaldo de desarrollo; la versión en línea usa el token que ya vive en Railway.

---

### 2026-07-18 · Hub completo servido desde Railway · ⏱️ 0.5 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- `site/` se movió a `app/site/` — Railway solo incluye el Root Directory (`app/`) en el build, así que el hub tenía que vivir adentro.
- El servidor Express del bot ahora sirve el hub estático completo (`express.static` con `extensions: ["html"]`, que replica las cleanUrls de Vercel): raíz, `/estilos/` con las 9 paletas, `/docs/` y `/demo/`.
- `vercel.json` actualizado a `outputDirectory: "app/site"` para que el deploy de Vercel siga funcionando mientras exista.
- Smoke test local: las 9 paletas responden 200 con y sin `.html`, igual que docs, PDF y assets del demo.

**Por qué:**
- Centralizar todo en Railway: las paletas de estilos daban 404 en `autoventa-production.up.railway.app` porque ese servicio solo corría el bot. Ahora la misma URL sirve bot + hub.

---

### 2026-07-18 · Deploy en Railway en vivo · ⏱️ 1.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Proyecto Railway `cheerful-solace`: Postgres online + servicio AutoVenta desde GitHub.
- Se aplicaron las 7 variables que estaban en borrador (el "Apply changes" nunca se había pulsado).
- **Root Directory `/app` configurado** — era la causa del primer "Build failed" (Railway buildeaba la raíz del repo, sin package.json).
- Dominio público generado: `autoventa-production.up.railway.app` (puerto 3000).
- **Fix del segundo build fallido**: quitar `buildCommand` custom del `railway.toml`. Nixpacks monta un cache Docker en `node_modules/.cache` y nuestro `npm ci` no podía borrarlo (`EBUSY`). Nixpacks ya corre install+build solo.
- Token de WhatsApp verificado contra la Graph API (responde el test number ✅).

**Por qué:**
- Decisión de centralizar todo en Railway ($5/mes) sin Vercel. El deploy estaba "configurado" pero nunca aplicado ni con root directory — el bot no había corrido nunca. Pendientes detectados: `SELLER_PHONE=593` incompleto, y el token de WhatsApp es el mismo del wa-tester (posible 24h — funciona hoy, generar permanente).

---

### 2026-07-18 · Migración del agente a OpenAI GPT · ⏱️ 1.5 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Se reemplazó `@anthropic-ai/sdk` por el SDK oficial `openai`.
- El agente ahora usa `OPENAI_API_KEY`, GPT-4o mini por defecto y function
  calling para las cinco herramientas de ventas.
- El clasificador de funnel ahora usa la misma API de OpenAI con salida JSON.
- Se actualizaron `app/.env.example`, README, plan técnico e investigación para
  que Railway ya no solicite `ANTHROPIC_API_KEY`.
- Typecheck y las 21 pruebas existentes pasan correctamente.

**Por qué:**
- La cuenta y el saldo disponibles para este piloto son de OpenAI, no de
  Anthropic. Mantener el SDK anterior habría dejado el deploy de Railway
  configurado con el proveedor equivocado aunque el webhook estuviera listo.

**Railway:**
- Reemplazar `ANTHROPIC_API_KEY` por `OPENAI_API_KEY`.
- Opcionalmente fijar `OPENAI_MODEL=gpt-4o-mini`; ese es el valor por defecto.

---

### 2026-07-18 · Preparar deploy del bot en Railway · ⏱️ 1.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- `railway.toml` en `app/`: build `npm ci && npm run build`, start `npm start`, healthcheck `/health`.
- `db/schema.ts`: esquema inline + `ensureSchema()` que corre **al arrancar** (idempotente) → deploy de un clic, sin paso manual de migración. `migrate.ts` queda como opción manual.
- `db/client.ts`: SSL configurable (`PGSSL=require`) — Railway Postgres (red interna) no usa SSL; Supabase sí.
- Catálogo **opcional**: si faltan las credenciales de Sheets, el bot igual arranca y levanta el webhook (solo no cotiza con precios hasta conectarlo). Permite desplegar ya, con el catálogo pendiente (bloqueo #1 / Contífico).
- Root route `/` simple (evita 404 al abrir la URL; ahí irá el landing).
- Boot verificado: parsea config, importa todo y aplica schema; typecheck + 21 tests ✅.

**Por qué:**
- Decisión de centralizar TODO en Railway (una sola plataforma, $5/mes) en vez de Vercel+Railway. El bot es un proceso always-on (webhooks, sync, estado en memoria) → serverless no sirve. Hacer el catálogo opcional y el schema automático deja el deploy a "conectar repo + pegar variables", sin bloquear el despliegue por el catálogo que aún no está.

---

### 2026-07-17 · Hub publicado en Vercel · ⏱️ 0.5 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Se vinculó el repositorio local al proyecto existente `acesso-aefa4bef/auto-venta`.
- Se desplegó `site/` completo a producción: portada, demo, paletas, planes,
  documentos, catálogo y propuestas.
- Se verificaron por HTTP las rutas principales y el PDF publicado.
- Se añadió `.gitignore` para excluir `.vercel` y cualquier `.env*` local.

**Por qué:**
- El hub necesitaba una URL estable, accesible sin levantar servidores locales.
  La vinculación explícita evita crear proyectos duplicados y la exclusión de
  archivos de entorno protege tokens y metadatos locales de Vercel.

---

### 2026-07-17 · Hub interno centralizado de AutoVenta · ⏱️ 2.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Nuevo centro de recursos estático en `site/`, listo para abrir localmente o
  publicar con Vercel.
- Accesos centralizados al demo de producto, inbox, pipeline, métricas, dashboard
  real de WhatsApp, configuración de IA y tester técnico.
- Galería con las 9 direcciones de diseño, catálogo de referencia, planes por
  fases, documentación técnica, bitácoras y propuestas comerciales.
- Enlaces directos a GitHub, Meta for Developers, Business Settings y OpenAI,
  claramente diferenciados de los recursos locales y las demos simuladas.
- Generador de documentos Markdown → HTML y build verificado del frontend React.

**Por qué:**
- El proyecto ya acumulaba demos, planes, propuestas y herramientas en rutas
  diferentes. Una portada interna —siguiendo el patrón del hub de Mesita— reduce
  el tiempo de búsqueda y evita confundir una demo simulada con una herramienta
  conectada a producción. El hub solo guarda enlaces y documentos; nunca secretos.

---

### 2026-07-16 · Respuesta del cliente + pivote a Contífico · ⏱️ 1.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- Transcripción del audio de respuesta de Joaquín (whisper local, `docs/respuesta-cliente-16jul.txt`).
- `PROYECTO.md §12`: análisis de la respuesta (le encantó, quiere pagar completo no por fases, inventario en Contífico) + implicaciones y nuevo pendiente #1.
- `PLAN_DESARROLLO.md §5`: fuente del catálogo cambia de Google Sheets → **API de Contífico** (Sheets queda como plan B).
- Guardado en `docs/` la propuesta enviada (`propuesta-autoventa.pdf`) y la transcripción.

**Por qué:**
- La respuesta del cliente cambia dos decisiones de fondo: (1) modelo de pago (completo con hitos, no fase por fase) y (2) la fuente de datos del inventario (Contífico en vez de Excel/Sheets). Contífico da stock en tiempo real real —lo que él pidió desde el inicio— y Manu ya lo integró en Mesita/Jardín Express, así que es ventaja, no riesgo. Registrar esto ahora evita reconstruir el contexto y marca el pendiente real (acceso al Contífico, no el Excel).

---

### 2026-07-15 · Esqueleto Fase 1 del bot (app/) · ⏱️ 5.0 h
**Commit:** _(este mismo)_

**Qué se hizo:**
- **`app/`**: proyecto TypeScript por capas — el bot real de Fase 1.
  - `wa/`, `server/`: webhook Meta Cloud API con firma verificada (whatsapp-api-js).
  - `pipeline/inbound.ts`: anti-caos propio (idempotencia + debounce 5s + FIFO por chat).
  - `agent/`: agente Claude con 5 tools (tool runner oficial + Zod) + clasificador de funnel con Haiku.
  - `domain/`: parser de medidas propio (21 tests ✅), fitment ~30 vehículos Ecuador (sin validar), haversine locales.
  - `services/`: catálogo Google Sheets→cache, cotización PDF (pdfmake, probado ✅), Postgres.
  - `db/schema.sql`: conversaciones/mensajes/cotizaciones/funnel + flag de handoff.
- **`docs/INVESTIGACION_GITHUB.md`**: barrido de ~55 repos reusables (qué reusar vs construir, licencias).

**Por qué:**
- Antes de escribir desde cero, investigar qué ya existía → nadie tiene el paquete completo, pero las piezas de fontanería (webhook, loop del agente, PDF, Sheets) son librerías MIT probadas. Reusarlas baja riesgo (firma del webhook, idempotencia) y ahorra semanas; el valor propio queda en parser de medidas, fitment y el ensamblaje.
- Config del negocio aislada en `config.ts` para poder revender el bot a otra llantera sin tocar código.

---

### 2026-07-15 · Webhook para recibir mensajes + setup de la app Meta en vivo · ⏱️ 4.0 h
**Commit:** _(pendiente — este mismo)_

**Qué se hizo:**
- **`tools/webhook/`**: servidor Express que **recibe** mensajes de la Cloud API.
  Hace el handshake de verificación (`GET /webhook` con verify token), valida la
  firma HMAC-SHA256 (`X-Hub-Signature-256`) con el App Secret, y loguea cada
  mensaje entrante (texto, imagen, ubicación, documento) y los estados de entrega.
  Lee `.env` fresco por request, mismo patrón que el wa-tester.
- Setup completo de la app de Meta en el dashboard **en vivo**: app creada
  (`AutoVenta`, App ID `1053180323906811`), test number `+1 555 169-8138`
  reclamado, token permanente generado, webhook conectado vía **ngrok**
  (`https://overdraft-client-stark.ngrok-free.dev`), campo `messages` suscrito.
- **Prueba end-to-end exitosa**: el botón "Test" de Meta disparó un POST real que
  llegó, pasó la validación de firma y se parseó correctamente. Toda la tubería
  (Meta → ngrok → webhook → parseo) funciona.
- **`docs/INVESTIGACION_GITHUB.md`**: barrido de ~55 repos open source similares
  (de otra sesión) — conclusión: nadie tiene el paquete completo; hay piezas MIT
  reusables (whatsapp-api-js, BuilderBot). Se conserva como referencia de build.
- **`BITACORA.md`** (este archivo) + git hook que la vuelve obligatoria.
- **Seguridad**: se blindó `tools/wa-tester/.gitignore` para que los backups de
  `.env` (que contienen tokens) nunca lleguen a git.

**Por qué:**
- El wa-tester solo **enviaba**; un bot necesita **escuchar** al cliente. El webhook
  es la pieza que faltaba para poder responder automáticamente (siguiente paso: Claude).
- Se hizo el setup en vivo para **validar que la Cloud API funciona de verdad**
  antes de invertir en la lógica del bot — de-risking temprano.
- **Hallazgo clave**: los mensajes reales desde el celular NO llegan mientras la app
  esté sin publicar (modo desarrollo). El botón "Test" y payloads simulados sí
  sirven para construir toda la Fase 1. Publicar se pospone a Fase 3 (junto con la
  verificación de negocio de Depot Tire), porque publicar ahora exige política de
  privacidad y no desbloquea nada del desarrollo.

**Estado / próximos pasos:**
- ⏭️ Conectar el webhook con Claude (que el bot **responda** solo, no solo loguee).
- ⏭️ Catálogo mock (Google Sheet de prueba) para programar `buscar_llanta` sin
  esperar el Excel real del cliente (**bloqueo #1**).
- ⚠️ Regenerar el token permanente (se vio parcialmente en un screenshot).
- ⚠️ ngrok da URL nueva cada vez que reinicia → en producción se reemplaza por
  Railway con URL fija.

---

### 2026-07-15 · Simulador: reencuadre "lo que pierdes hoy" · ⏱️ 0.5 h
**Commit:** `6feb1f5`

**Qué:** El simulador de la propuesta ahora dice explícito que es el **costo actual
del tiempo del dueño** (no el precio del bot). Slider de valor/hora bajó de máx 15 a 10;
se quitó el escenario de 8 horas.

**Por qué:** Feedback del cliente — se malinterpretaba como si fuera el precio del
servicio. El reencuadre hace la cuenta más honesta y menos confusa.

---

### 2026-07-15 · Empresa confirmada: Depot Tire + propuesta en verde/horas · ⏱️ 1.5 h
**Commit:** `abcc2a7`

**Qué:** `PROYECTO.md` con el perfil completo de **Depot Tire** (tiredepotec.com):
2 locales en Quito con direcciones, teléfono, horario L–S 8:30–17:30, marcas
Kenda/Sunoco/Eurolub, 30+ años, promo 10% primer servicio, sin catálogo/precios
en su web. Propuesta: paleta de rojo → **verde** WhatsApp; montos por fase
reemplazados por **horas de esfuerzo**; cobro reformulado como por-fase + mensualidad.

**Por qué:** El cliente confirmó el nombre real del negocio — resuelve el misterio
"Depot Tire vs Pit Stop" de los mapas. Cambiar a horas evita anclar un precio
cerrado antes de conocer el volumen real de chats. Confirma que la fuente de datos
será el Excel del dueño (su web no tiene catálogo).

---

### 2026-07-15 · Rework propuesta: 5 fases + simulador de ahorro · ⏱️ 2.5 h
**Commit:** `c53a059`

**Qué:** Nueva estructura de fases según lo conversado con el cliente:
(1) bot IA que responde + ubicación + alerta simple, (2) cotizaciones PDF + avisa
cuando no entiende, (3) fotos + comprensión total, (4) dashboard KPIs, (5) "no
vuelves a abrir WhatsApp". Cada fase con chip de precio y entregable "Te llevas".
Caja de mantenimiento mensual. Simulador de ahorro interactivo.

**Por qué:** La estructura de 3 fases anterior mezclaba entregables. Separar en 5
deja que el cliente **apruebe y pague por fase viendo cada una funcionar** —
reduce su riesgo percibido y hace el "sí" más fácil.

---

### 2026-07-15 · Doc HTML de reunión (fuente del PDF al cliente) · ⏱️ 2.0 h
**Commit:** `971c70c`

**Qué:** One-pager editorial espejando el formato de Jardín Express: hero oscuro
con motivo de llanta + acento verde WhatsApp, resumen de situación, preguntas
abiertas, y el plan por fases con comparaciones HOY vs CON. Renderiza a PDF.

**Por qué:** El cliente necesita algo tangible y bien presentado para decidir con
su papá. Un PDF profesional comunica seriedad mejor que un chat.

---

### 2026-07-15 · wa-tester: leer .env fresco por request · ⏱️ 0.5 h
**Commit:** `21df44f`

**Qué:** El server cargaba el token una vez al arrancar; ahora re-lee `.env` en cada
`/send` y `/config`. Guardas el archivo y funciona al instante, sin reiniciar.

**Por qué:** Los tokens de prueba expiran cada 24 h; reiniciar el server cada vez
que se pega uno nuevo era fricción innecesaria durante las pruebas.

---

### 2026-07-14 · Herramienta wa-tester (enviar) + guía operativa · ⏱️ 3.0 h
**Commit:** `e355591`

**Qué:** `tools/wa-tester/`: mini app Express con interfaz web para **enviar**
mensajes por la Cloud API (test number). El token vive en `.env` local (gitignored),
nunca en el browser ni el repo. Muestra en español claro los errores de ventana de
24 h y token expirado. `WHATSAPP_BUSINESS.md`: guía paso a paso del setup de la API.

**Por qué:** Antes de construir el bot, había que **probar que se puede mandar un
mensaje real** por la API. Esta herramienta valida credenciales end-to-end y sirve
de sandbox manual. La guía destila la doc de Meta a lo que realmente usamos.

---

### 2026-07-14 · Ubicaciones de locales + análisis de features del cliente · ⏱️ 1.5 h
**Commit:** `ac09171`

**Qué:** `PROYECTO.md`: 2 ubicaciones de los locales (con la discrepancia de nombre
Depot Tire vs Pit Stop marcada). `PLAN_DESARROLLO.md`: análisis feature-por-feature
del pedido del cliente contra las fases; campañas de recuperación/seguimiento
marcadas como Fase 4 nueva (cambia el modelo de costo — templates de marketing + opt-in).

**Por qué:** El cliente mandó una lista de funcionalidades deseadas; había que cruzarlas
con el plan para saber qué ya estaba cubierto, qué era nuevo, y qué cambiaba el precio.

---

### 2026-07-13 · Brief + plan de desarrollo + plan financiero + catálogo · ⏱️ 4.0 h
**Commit:** `feadf57`

**Qué:** `PROYECTO.md` (brief: contexto, flujo, fases), `PLAN_DESARROLLO.md` (plan
técnico con research verificado), `PLAN_FINANCIERO.md` (costos de operación y precio),
`docs/` (catálogo HTML recibido del cliente — propuesta SUDINCO).

**Por qué:** Fundación del proyecto. Investigar factibilidad técnica (WhatsApp Cloud
API directo vs BSP, stack, costos reales) y de precio antes de comprometerse con el
cliente. Todo el research está verificado contra fuentes oficiales.

---

### 2026-07-13 · Commit inicial · ⏱️ 0.25 h
**Commit:** `d997844`

**Qué:** Repo creado con README.

**Por qué:** Arranque del control de versiones.
