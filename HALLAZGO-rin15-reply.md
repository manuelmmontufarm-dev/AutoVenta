# Hallazgo: rin 15 → mostró 33X12.5R20, y el reply "2" se leyó mal

Worktree: `.claude/worktrees/rin15-reply-bug`, rama `fix/rin15-reply-context` (desde `main`, commit `ef8872d`).

## Bug 2 — el bot no lee el "reply" de WhatsApp (causa raíz de todo)

El mensaje de WhatsApp trae un campo `context.id` que dice a qué mensaje anterior se está respondiendo. El bot nunca lo lee:

- `app/src/index.ts:530-555` — solo saca `message.text.body` y `message.id`, ignora `message.context`.
- `app/src/pipeline/inbound.ts` — el pipeline tampoco tiene un campo para cargar ese dato aunque quisiéramos leerlo.
- Lo único que existe hoy es una adivinanza por texto en `app/src/domain/salesIntent.ts:233-239` (`esRespuestaDelMenuDePreferencia`), que mira si el *último mensaje nuestro* (los últimos 3 mensajes salientes concatenados) menciona el menú de prioridad, y si el texto entrante matchea `^([123])$`. No usa el reply real.
- Esa función solo se consulta para decidir `selected_quantity` (cantidad), no para decidir qué debe *hacer* el modelo con "2". La decisión de qué hacer queda 100% en manos del LLM, con solo una pista suave en el prompt. Un modelo sin ese ancla duro puede leer "2" como "quiero 2 llantas" en vez de "elijo la opción 2 (equilibrio)".

**Arreglo:** capturar `message.context.id` en `index.ts`, pasarlo por el pipeline (`inbound.ts`) hasta guardarlo con el mensaje, resolverlo contra el `wa_message_id` guardado, y usar ese match exacto (no la adivinanza de "últimos 3 mensajes") para decirle al modelo de forma dura: "el cliente respondió con reply a la pregunta de prioridad, la respuesta fue 'equilibrio', prohibido interpretar otra cosa" — mismo patrón que ya usan otras señales duras del prompt.

## Bug 1 — la "medida activa" (tire_size) no se borra al cambiar de medida

Aclaración: con `/restart` y con la caducidad del chat frío **sí** se borra — las dos pasan por `reopenConversation`, que pone `tire_size = null` (`conversations.ts:104`). Lo que faltaba es el caso del medio: el cliente sigue en la misma conversación y cambia de llanta.

`app/src/services/conversations.ts:516-538` — `tire_size` se actualiza con `coalesce(nuevo, tire_size)`: dentro del ciclo solo puede ponerse, nunca limpiarse. Así que si antes se fijó `tire_size = 33X12.5R20` (todoterreno rin 20) y después el cliente pide "rin 15" sin reiniciar nada, ese dato viejo se queda pegado.

Ese valor viejo se inyecta como "hecho confirmado" en cada turno (`app/src/agent/agent.ts:849`): *"Medida confirmada: 33X12.5R20 — prohibido volver a pedirla"* — al mismo tiempo que el prompt también muestra las opciones correctas de rin 15. El modelo recibe dos "verdades" contradictorias en el mismo mensaje.

Cuando el turno ambiguo del Bug 2 hace que el modelo busque/elija algo de la medida vieja, `preparar_opciones` (`app/src/agent/tools.ts:1242-1252`) lee ese mismo `tire_size` de la base y lo mete en el set de "medidas permitidas como exactas" (`medidaPedida.ts:41-49`), así que el renderizador (`depotPosters.ts`) le pone honestamente la etiqueta "MEDIDA EXACTA" a la 33X12.5R20 — el sistema es consistente puertas adentro con un dato que ya no correspondía.

*Nota:* el commit `96c8b54` (de esta misma mañana) tocó un problema parecido pero distinto — evita que "en rin 20" dispare una búsqueda amplia cuando ya hay medida activa. No limpia `tire_size` nunca, así que no evita esta staleness; si acaso, la refuerza un poco.

**Arreglo:**
1. Agregar una forma real de limpiar `tire_size` (hoy `updateConversationFacts` solo sabe fijarlo).
2. En `buscar_por_aro_y_tipo` (`tools.ts:748-799`), comparar el aro pedido contra el aro de la `tire_size` guardada; si no coinciden (15 vs 20), limpiarla ahí mismo.
3. Como refuerzo, que `agent.ts:849` no diga "medida confirmada, prohibido volver a pedirla" de forma incondicional — solo cuando el aro de esa medida coincide con lo que se está mostrando en el turno actual.

## Por qué se combinan

El Bug 2 es la chispa: sin el reply real, el "2" del cliente se malinterpreta y el modelo termina agarrando la medida vieja. El Bug 1 es la trampa que estaba esperando: aunque el modelo se hubiera comportado bien, el dato viejo (33X12.5R20) seguía ahí listo para reaparecer como "confirmado". Conviene arreglar los dos — arreglar solo uno no cierra el caso completo.

---

## Lo que quedó implementado (31-ago)

Rama `fix/rin15-reply-context`. Suite 1441/1441, typecheck limpio.

**El reply de WhatsApp ahora viaja y decide:**
- `index.ts` lee `message.context.id` y lo pasa a `recibirMensaje` (texto, botones y foto).
- `pipeline/inbound.ts` lo carga por la ráfaga (se queda con el reply más reciente del grupo).
- `conversations.ts` → `outboundTextByWaMessageId` lo resuelve al texto del mensaje citado, solo salientes del ciclo vigente.
- `esRespuestaDelMenuDePreferencia` prefiere el reply sobre la adivinanza, **en las dos direcciones**: citar el menú confirma el escalón; citar la vitrina descarta que sea el escalón (eso último la heurística vieja no sabía hacerlo).
- `agent.ts` inyecta `ordenDeResponderElEscalon` como orden dura cuando el reply confirma el escalón: entrega esa opción, prohibido leerlo como cantidad y prohibido cambiar de llanta.

**La medida vieja se suelta al cambiar de aro:**
- `medidaPedida.ts` → `aroDeLaMedida` (métrica y flotación).
- `conversations.ts` → `olvidarMedidaDeTrabajo`: borra `tire_size` y `selected_product_code` (el producto era de la medida que se va). La cantidad se conserva.
- `agent.ts`: el aro del turno pasa de dos casos a tres — sin medida activa dispara vitrina; aro que coincide no dispara (se respeta el arreglo de `96c8b54`); aro que **no** coincide borra la medida vieja antes de armar el prompt, así el turno actual ya no la ve.

**Prueba nueva:** `app/test/replyCitadoYCambioDeAro.test.ts` — 6 casos, dos de los cuales fallan si se quita el arreglo del reply (verificado).

**Lo que NO se hizo:** el refuerzo 3 de arriba (condicionar la línea "Medida confirmada" en `salesFactsPrompt`). Con la medida vieja ya borrada en el turno del cambio de aro, la línea sale correcta sola; agregar la condición tocaría un prompt que usan todos los turnos y no hacía falta para cerrar este caso.
