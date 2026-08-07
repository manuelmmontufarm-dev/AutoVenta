# Línea base · 5 de agosto de 2026

Estado del bot **antes** de las correcciones de ese día. Es el punto cero contra
el que se miden todas las auditorías siguientes.

**Cómo se midió:** censo manual de las conversaciones de Depot Tire leídas por la
API del panel (`/api/hub/tickets` + `/messages`), con los mismos patrones que los
detectores de `extraer.mjs`. **No** salió del extractor: ese día todavía no había
`DATABASE_URL` de producción disponible.

> ⚠️ **Comparabilidad.** Los números de abajo y los de una corrida del extractor
> se parecen pero no son la misma vara: el censo miró todo el historial
> (164 conversaciones), el extractor mira una ventana de días y cuenta chats
> afectados además de incidencias. Para comparar «antes vs después» de forma
> limpia, usa la **primera corrida del extractor posterior al 5-ago** como
> referencia de arranque y esta página como contexto de por qué se hicieron los
> cambios.

---

## Los errores encontrados

164 conversaciones revisadas · **25 con errores graves (15%)**

| Error | Incidencias | Chats | Qué le pasaba al cliente |
|---|---:|---:|---|
| Pidió una foto que no puede leer | **30** | 22 | El bot no procesa imágenes: la conversación moría esperando algo que nunca iba a poder usar |
| «Tuve un problema procesando tu mensaje» | 12 | 8 | El agente agotaba sus 8 rondas de herramientas y se rendía |
| Volvió a saludar a mitad de conversación | 6 | 4 | «¡Hola!» en medio del hilo: delata al bot y confunde |
| Disculpa tras disculpa (bot atascado) | 5 | 4 | El cliente quedaba abandonado sin que nadie se enterara |
| Mensaje idéntico repetido | 5 | 4 | Spam puro |
| Dos cotizaciones para la misma compra | 2 | 1 | El cliente no sabía cuál número presentar en la tienda |
| Preguntó vehículo/versión teniendo ya la medida | 2 | 2 | Fricción pura: podía cotizar y en vez de eso preguntó |

### Los casos que lo originaron

| Ticket | Cliente | Qué pasó |
|---|---|---|
| #972 | Ricardo Nitro | Tres «tuve un problema» seguidos, dos calcados. Preguntó «¿incluye alineación?» y quedó sin respuesta. |
| #943 | KLEVER | Dos cotizaciones (`COT-MSGJQPAK` + `COT-MSGJR010`) por la misma compra, cada una ×3. Dijo «son todo terreno» y el bot pidió la versión del auto. |
| #982 | Jordian | Doble respuesta al mismo mensaje con 30 s de diferencia; la segunda abría con «¡Buenas tardes!». |
| #980 | Orlando Vaca | Dio `225/65R17` **y** su carro; el bot pidió una foto de la etiqueta de la puerta. |

Las 25 conversaciones completas: `reportes/2026-08-05-censo/`.

---

## Los cambios desplegados ese día

Todos en producción (staging y Depot) el 5-ago-2026.

| Commit | Qué cambió | Ataca |
|---|---|---|
| `1613a18` | **VENTA PRIMERO en las 3 capas.** Objetivo del bot = vender; la medida manda sobre el vehículo; prohibido pedir fotos; el tipo que pide el cliente dispara búsqueda. Se limpiaron las 7 instrucciones que ordenaban pedir foto (prompt, `fitment_vehiculo`, `vehicleFitmentResearch`). Migración `011_venta_primero` reescribe los prompts por etapa en la base. | `pide_foto`, `pregunta_teniendo_medida` |
| `3021e97` | La migración se ancla en el **texto exacto** en vez de la versión: en Depot los prompts publicados eran v4/v6 con el texto dañino intacto y la v1 no existía. | `pregunta_teniendo_medida` |
| `f3c2a42` | **Guardián de salida** (`outboundGuard.ts`): filtro determinístico sobre cada respuesta antes de enviarla. Bloquea disculpa repetida (+ alerta ALTA al asesor), mensaje calcado, pedido de foto y saludo a mitad de hilo. Cada bloqueo queda como alerta `guard_*`. | `pide_foto`, `mensaje_duplicado`, `disculpas_seguidas`, `saludo_repetido` |
| `7cc48c0` | **Candado anti-duplicado** dentro de `generar_cotizacion`: si hay cotización vigente (<30 min) por el mismo producto y cantidad, devuelve el número existente en vez de crear otro. | `cotizacion_duplicada` |
| `bea9bf9` | **Rescate del agente**: al agotar las 8 rondas, una última llamada sin herramientas obliga a responder con lo averiguado. La disculpa queda solo si hasta el rescate falla. `ai_runs` distingue `max_iterations_salvaged`. | `error_procesamiento` |

---

## Qué debería verse en la próxima corrida

Cada cambio tiene una métrica que debe moverse. Si no se movió, no funcionó.

| Métrica | Base (5-ago) | Meta | Cómo leerla |
|---|---:|---|---|
| `fallas.pide_foto_que_no_puede_leer` | 30 incidencias / 22 chats | **0** | Está bloqueado por código: cualquier valor > 0 significa que el guardián no corrió (¿deploy viejo?) |
| `fallas.disculpas_seguidas` | 5 | **0** | Igual: bloqueado por código |
| `fallas.mensaje_duplicado` | 5 | **0** | Igual: bloqueado por código |
| `fallas.saludo_repetido` | 6 | **0** | Igual: bloqueado por código |
| `fallas.cotizacion_duplicada` | 2 | **0** | Candado en la tool |
| `fallas.error_procesamiento` | 12 | **bajando** | No es cero por diseño: la primera disculpa sigue saliendo si el rescate falla. Mirar junto a `modelo.rescatados` |
| `modelo.rescatados` | — | **> 0** | Cada rescate es un cliente que recibió respuesta útil en vez de disculpa |
| `intentosBloqueadosPorGuardian` | — | **bajando** | Lo que el modelo INTENTÓ. Si sigue alto, el prompt no sanó y el guardián está tapando |
| `fallas.pregunta_teniendo_medida` | 2 | **bajando** | No es bloqueable por regex sin falsos positivos: se mide, no se bloquea |
| `tasaMedidaACotizacion` | — | **subiendo** | La prueba de que venta-primero funciona |

**Regla de lectura:** los cuatro primeros están garantizados por código. Si
aparecen con valor > 0 en una corrida, no es que el bot empeoró — es que algo
del guardián no está corriendo, y eso se investiga antes que nada.
