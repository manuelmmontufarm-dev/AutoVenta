# Plan de mejoras — Agente Depot Tire (v2)

Fecha: 3 de agosto de 2026
Origen: mensajes de Joaquín Tamayo (3-ago, 10:07–10:13), 3 chats exportados
("ejemplos de chats perfectos y ventas cerradas") y el documento
`Especificaciones_Agente_WhatsApp_Depot_Tire.pdf` v1.0.
Estado del bot: en vivo con la cuenta de Depot Tire.

---

## Parte A — Qué pide el cliente, exactamente

### A.1 Los tres reclamos explícitos

| # | Lo que dijo | Qué significa | Prioridad |
|---|---|---|---|
| 1 | *"está mandando dms texto y la people ni siquiera lee"* | El bot contesta con muros de texto. La gente no los lee. **Menos texto, más piezas visuales y mensajes cortos.** | CRÍTICA |
| 2 | *"fuera del puctas que puede cotizar así"* | Las imágenes de cotización y comparativa le encantaron. **Esa es la forma correcta: la imagen es el mensaje, no un adjunto.** | Confirmación |
| 3 | *"en estos casos es mejor que busque así (como en la otra foto) … porque mucha gente cambia los aros originales entonces ya no es la medida original"* | El fitment por vehículo está roto en la práctica. Debe razonar **por aro**, ofrecer la medida estándar más alternativas válidas con la explicación de qué cambia — como el ejemplo de ChatGPT que él mismo mandó. | CRÍTICA |

**Reporte adicional:** las fotos de cotizaciones y comparativas **no se estarían
mandando bien en este momento**. Hay que verificarlo antes que nada — ver §B.1-bis y la
Tanda 0.0: es muy posible que sea la causa del reclamo #1 y no un problema aparte.

El contraste que él marcó es directo:

**Lo que hace el bot hoy** (captura de la L200):
> Cliente: *"Buen día, para una camioneta L200, rin 17"*
> Bot: *"¿Cuál es el año?"* → *"He encontrado algunas medidas para la L200 del 2017: 245/70R16 y 265/60R18. Pero esta referencia no garantiza que sean compatibles. ¿Podrías decirme qué versión es o enviar una foto de la etiqueta de la puerta?"*

El cliente dio el aro 17 y el bot devolvió dos medidas que **no son R17**, pidió un dato
que ya no importa y terminó sin recomendar nada.

**Lo que él quiere** (el ejemplo que mandó):
> *"Para una Mitsubishi L200 con aro R17, la medida más común/original es **265/65 R17**.*
> *• 265/65 R17 → medida estándar, cero complicaciones.*
> *• 265/70 R17 → un poco más alta (+~2,6 cm de diámetro), buena para AT/RT.*
> *• 285/70 R17 → bastante más grande y agresiva; ya hay que revisar roce, offset y suspensión."*

### A.2 Lo que pide implícitamente: los 3 chats "perfectos"

Los chats que mandó como modelo son de vendedores humanos. Estas son las jugadas
que aparecen en los tres y que el bot **no hace**:

1. **Bloque `*INCLUYE*` después de cada precio.** Literal, en los 3 chats:
   ```
   *INCLUYE*
   - Todos los servicios de instalación y beneficios
   - Seguro gratuito contra golpes, cortes o cualquier daño que sufra la llanta
   - Mantenimiento gratuito cada 10.000km para alargar la vida útil de las llantas
   - Camiseta de la TRI🇪🇨
   - Revisión gratuita de su vehículo para que ruede seguro
   ```
2. **Elección de sucursal como pregunta binaria**, nunca pidiendo GPS:
   *"Estamos en Cumbayá y Quito Sur, ¿qué ubicación le queda mejor?"* + link de Maps.
3. **Invitación a visitar sin compromiso**: *"puede visitarnos sin compromiso a ver
   las llantas usted mismo y probárselas en su vehículo, y así toma la mejor decisión"*.
   Es la frase que más veces precede al cierre.
4. **Alternativa mejor cuando no hay la marca pedida.** Pidieron BFGoodrich (no hay):
   *"le tengo una mejor opción y más económica"* + link del estudio comparativo +
   *"es equipo original de Ford Raptor, Bronco Raptor, Jeep Gladiator"*. Argumento
   verificable, no opinión.
5. **Formas de pago**: *"puede diferir a 3 y 6 meses sin intereses"*.
6. **Cierre por fecha con motivo real**: *"¿qué día nos visita, para enviar las
   llantas de bodega a la sucursal de Cumbayá?"*
7. **Aclarar que el precio es por unidad** (el cliente lo pregunta siempre).
8. **Descuento por volumen sin prometer número**: 8 llantas → *"sí le puedo dar un
   descuento adicional, en la sucursal lo revisamos"*.
9. **Leer la medida de las fotos del cliente.** En el chat 1 el cliente manda 4 fotos
   del flanco; el vendedor lee la medida y hasta corrige *"R16 es, ya le vi bien"*.
10. **Seguimientos espaciados y variados** (día 3, 6, 9…), cada uno con texto distinto.
11. **Preguntar el uso antes de recomendar**: *"¿Necesita para ciudad y carretera o
    para caminos mixtos e irregulares también?"* — el bot nunca lo pregunta.

### A.3 El PDF de especificaciones

27 secciones y ~250 casillas. Es el **checklist de aceptación** con el que Depot Tire
va a firmar `APROBADO / APROBADO CON RESTRICCIONES / NO APROBADO`. La condición de
aprobación es: **todos los criterios CRÍTICOS + 90 % de los ALTOS demostrados**.

Los 6 criterios CRÍTICOS del §27:

1. Nunca inventa stock, precio, promoción, compatibilidad ni confirmación de pago.
2. Consulta información actualizada y registra la fuente utilizada.
3. Recomienda según vehículo, uso, seguridad y presupuesto.
4. Sabe cuándo transferir a una persona y entrega todo el contexto.
5. Respeta control humano, privacidad y permisos.
6. Supera las pruebas de fallas de integraciones sin inventar datos.

La frase que resume el documento: *"Es preferible lanzar menos funciones bien
controladas que presentar un agente 'capaz de todo' que invente, duplique acciones o
genere compromisos que Depot Tire no puede cumplir."* Eso ordena el plan: primero
personalidad y fitment (lo que él reclamó), después los bloqueantes críticos del PDF,
y al final lo que necesita datos que el negocio todavía no entrega.

---

## Parte B — Diagnóstico: por qué pasa

### B.1 El muro de texto

El flujo actual manda **imagen + muro de texto**, duplicando todo:

- `preparar_opciones` ([tools.ts:233](app/src/agent/tools.ts:233)) renderiza y envía la
  imagen de opciones, y **además** devuelve `mensaje_para_enviar` =
  `buildCustomerOptionsMessage()`.
- `buildCustomerOptionsMessage` ([quoteMessages.ts:32](app/src/services/quoteMessages.ts:32))
  arma, por cada producto: precio lista → precio hoy, disponibilidad, índice de carga
  y velocidad, garantía de fábrica y garantía contra golpes. Con 5 productos son
  ~30 líneas. **Es exactamente la captura que mandó el cliente.**
- `exactToolReply` ([agent.ts:210](app/src/agent/agent.ts:210)) devuelve ese texto tal
  cual, sin que el modelo pueda acortarlo.
- `buildSingleQuoteMessage` ([quoteMessages.ts:91](app/src/services/quoteMessages.ts:91))
  hace lo mismo con la cotización: repite en texto todo lo que ya dice la imagen.
- `index.ts:88` envía **un solo mensaje**. El vendedor humano manda 4–6 mensajes
  cortos seguidos.
- `AiConfigSchema` ([settings.ts:11](app/src/services/settings.ts:11)) trae
  `emojis: "muchos"` por defecto.

**La imagen ya lleva marca, diseño, medida, precio tachado, precio hoy, índice,
disponibilidad y garantías.** Repetirlo en texto no agrega nada y es lo que la gente
no lee.

### B.1-bis El envío de imágenes puede estar fallando — y explicaría el reclamo #1

Joaquín reporta que **ahorita las fotos de cotizaciones y comparativas no se están
mandando bien**. Revisando el código, eso no es un problema aparte del muro de texto:
**es probablemente la misma cosa.**

`sendVisual` ([tools.ts:134](app/src/agent/tools.ts:134)) se traga cualquier error:

```ts
} catch (err) {
  console.error(`❌ Imagen de ${what} falló:`, err);
  return { ok: false, png };     // ← y sigue como si nada
}
```

Y cada tool reacciona distinto a ese `ok: false`:

| Tool | Si la imagen falla | Se entera alguien |
|---|---|---|
| `preparar_opciones` | **Nada.** Manda solo `buildCustomerOptionsMessage()` — el muro | **No.** Ni alerta ni respaldo |
| `enviar_comparacion` | Cae a PDF | No |
| `generar_cotizacion` | Cae a PDF; alerta solo si también falla el PDF | Parcial |

O sea: **cuando la imagen de opciones falla, el cliente recibe exactamente el muro de
texto de la captura que mandó Joaquín, y en el panel no queda rastro.** Es muy posible
que el reclamo #1 no sea "el bot manda mucho texto" sino "el bot manda texto *porque
la imagen no salió*".

**Medición hecha el 4-ago (`npx tsx test/piezas-diagnostico.ts`):**

| Pieza | Prod | Tamaño | Peso | Tiempo |
|---|---|---|---|---|
| cotización | 1 | 2160×3120 | 0,62 MB | 317 ms |
| comparativa | 3 | 2880×2360 | 0,76 MB | 220 ms |
| opciones | 9 | 2880×7538 | 2,55 MB | 541 ms |
| opciones | 12 | 2880×8804 | **3,44 MB** | 701 ms |

**Descartado — el peso no es el problema.** Ni el peor caso (12 productos) se acerca
a los 5 MB de Meta. La hipótesis inicial era esa y la medición la tumbó.

**Descartado — el render funciona en producción.**
`GET /cotizaciones/live.png?medida=205/55R16` en staging responde **200, 1,1 MB,
2880×2360, en 1,4 s**. satori, resvg, fuentes y fotos están sanos en el servidor real.
`/health` confirma catálogo con 368 ítems sincronizado desde Contífico y worker latiendo.

**Descartado — no faltan assets.** Fuentes, logos y las 35 fotos de catálogo están
versionadas (`git ls-files`).

**Descartado — no es la política de conversación.** `sendImage` y `sendCustomerText`
pasan por el mismo `assertConversationOutbound` con la misma regla, así que no puede
bloquear la imagen y dejar pasar el texto.

**Queda por verificar (necesita datos de producción):**

1. **Upload a Meta.** `uploadMedia` ([wa/client.ts:205](app/src/wa/client.ts:205))
   reintenta una vez y lanza. Un token temporal vencido o un rate limit lo tumban, y
   es el único paso que distingue texto de imagen. **Es el sospechoso que queda.**
2. **Memoria en el deploy de Depot.** satori + resvg a 2880 px consume; una instancia
   chica puede hacer OOM aunque staging aguante.
3. **Que sí lleguen pero se vean mal.** La pieza de opciones mide 2880×7538 — en el
   chat se ve como una tira muy alta donde el texto queda diminuto hasta que la abres.

**Lo que sí quedó confirmado por lectura de código, y ya está corregido:**
el fallo silencioso. Ver Tanda 0.0.

**Defecto secundario detectado al revisar la pieza a ojo:** de 9 productos, 3 caen a la
llanta genérica por falta de foto. Contra el §5 del PDF ("acceder a fotografías reales y
correctas de cada modelo"). Medir la cobertura real con `/api/catalog/media-report`.

### B.2 El fitment

- `fitment_vehiculo` ([tools.ts:197](app/src/agent/tools.ts:197)) **no acepta el aro**
  como parámetro. El dato que el cliente dio primero se pierde.
- `FITMENT_TABLE` ([fitment.ts:23](app/src/domain/fitment.ts:23)) tiene la L200 con
  `["245/70R16", "265/60R18"]` — ninguna es R17. `lookupFitment` no filtra por aro.
- 47 de 48 entradas están `validated: false`, así que el camino normal termina en
  *"no garantiza compatibilidad"*.
- No existe cálculo de equivalencias: ni diámetro exterior, ni tolerancia, ni
  descripción de qué cambia al subir de medida.
- El resultado nunca se cruza con el stock real, así que puede sugerir medidas que
  no se venden.

### B.3 Guion comercial ausente

Búsqueda en todo `src/`: no existe `INCLUYE`, `beneficio`, `diferido`, `sin intereses`,
`camiseta`, `traslado`, `alineación` ni `balanceo`. Nada del guion humano está en el bot.

Además `local_mas_cercano` ([tools.ts:624](app/src/agent/tools.ts:624)) exige lat/lng o
un sector reconocido, y `notificar_vendedor` ([tools.ts:685](app/src/agent/tools.ts:685))
**bloquea el handoff** si no hay ubicación. El vendedor humano nunca pide GPS: pregunta
cuál de las dos sucursales le queda mejor.

### B.4 Fotos y audios

[index.ts:163-181](app/src/index.ts:163) responde literalmente
*"[El cliente envió una foto que todavía no puedes ver]"* y
*"[…un audio que todavía no puedes escuchar]"*. En el chat 1 el cliente mandó 4 fotos
del flanco de la llanta: hoy esa conversación se cae.

### B.5 Lo que sí está bien y no hay que tocar

- Motor de imágenes (satori + resvg) con cotización, comparativa y opciones —
  funciona en producción y es justo lo que al cliente le gustó.
- Precios y stock deterministas desde Contífico; el modelo no puede inventarlos.
- Seguimientos: ventanas de 24 h, horario comercial, opt-out, campañas, redacción
  perezosa. Cubre casi todo el §13 del PDF.
- Control humano: interruptor global, pausa por chat, `resumeBot`, alertas al asesor.
- CRM base: conversaciones, etapas, hechos comerciales, artefactos de cotización,
  eventos de embudo, `ai_runs` con versión de prompt.

---

## Parte C — Plan de ejecución

Seis tandas. La 0.0 va primero porque puede estar causando el reclamo #1, y arreglarla
sola ya cambia lo que ve el cliente.

---

### TANDA 0.0 — Verificar y blindar el envío de imágenes · BLOQUEANTE

**Estado: implementado el 4-ago, pendiente de desplegar y de cerrar el diagnóstico.**

**C.0.0.1 — Diagnóstico** ✅ hecho, resultados en §B.1-bis

- `test/piezas-diagnostico.ts` (nuevo): mide peso, tamaño y tiempo de las tres piezas a
  distintos números de producto. Descartó el peso como causa.
- `GET /cotizaciones/live.png` en staging: 200 en 1,4 s. Descartó el render.
- `GET /diagnostico/piezas?medida=205/55R16` (nuevo,
  [webhook.ts](app/src/server/webhook.ts)): mide las tres piezas **contra el catálogo
  real** y reporta `ok`, peso, tiempo, si Meta la acepta y cuántos productos van sin
  foto. Es el que hay que correr en el deploy de Depot.

**C.0.0.2 — Pendiente: cerrar el diagnóstico con datos de producción**

- Logs de Railway del deploy de Depot: buscar `❌ Imagen de`. Cada ocurrencia trae ahora
  la etapa (`render` o `envío`) y el motivo exacto.
- Consulta a `messages`: `type='image'` con `status='sent'` vs `'failed'` de los últimos
  15 días. Ese número es el tamaño real del problema.
- Correr `/diagnostico/piezas` en el deploy de Depot, no solo en staging.

**C.0.0.3 — Que no vuelva a fallar en silencio** ✅ implementado

- `sendVisual` ([tools.ts](app/src/agent/tools.ts)) devuelve `error` con la etapa
  (`render:` / `envío:`) y el motivo exacto, en vez de solo un `console.error`.
- `preparar_opciones`: si la imagen falla, registra el mensaje con `status: "failed"` y
  `metadata.renderError`, y **crea una alerta `send_error` de prioridad alta**. Antes no
  hacía nada: el cliente recibía el muro y nadie se enteraba.
- `enviar_comparacion`: el PDF de respaldo estaba **sin `try`** — si fallaba, la tool
  lanzaba y el cliente se quedaba sin comparativa **y sin respuesta**. Ahora se captura,
  se marca `failed` y se crea alerta crítica.
- `generar_cotizacion`: se suma `metadata.renderError` al registro.
- `test/piezas.test.ts` (nuevo): falla si cualquier pieza supera 4,5 MB u 8 s, o si el
  buffer no es un PNG válido. Corre con `npm test`.

**Pendiente de esta tanda**

- [x] Contador en Métricas: piezas enviadas vs fallidas por tipo, últimos 7 días. **Hecho 4-ago** — `visualPieces` en `hubData.ts` + sección en `Dashboard.tsx`, verificado en el panel contra una base real.
- [ ] Desplegar y correr `/diagnostico/piezas` en el deploy de Depot.
- [ ] Cerrar la causa raíz del reporte de Joaquín con los logs y la consulta a `messages`.

---

### TANDA 0 — Personalidad y formato (1–1,5 días) · el reclamo directo

**Objetivo:** que el bot escriba como el vendedor de los chats perfectos: mensajes
cortos, separados, la imagen manda, siempre cierra con una pregunta.

**C.0.1 — Los captions reemplazan a los muros**

`app/src/services/quoteMessages.ts`:

- `buildCustomerOptionsMessage` → `buildOptionsCaption(products, recommendation)`.
  Máximo 4 líneas. Nada de precios ni garantías por producto (ya están en la imagen):
  ```
  Le mando las opciones en 205/55R16 👆

  Por el uso que me comenta yo iría por la *Kenda KR203*: es el mejor equilibrio
  entre duración y precio.

  ¿Cuál le llama más la atención?
  ```
  La recomendación explícita es además el §7 del PDF ("siempre indicar cuál elegiría
  el agente").
- `buildSingleQuoteMessage` → número de cotización, total, vigencia y siguiente
  pregunta. Sin repetir índice, disponibilidad ni garantías.
- `buildComparisonMessage` → una línea por modelo con la diferencia práctica, no la
  ficha completa.
- Mantener las funciones viejas exportadas bajo `…Detallado` como respaldo del
  camino en que la imagen falla ([tools.ts:499](app/src/agent/tools.ts:499) ya tiene
  ese fallback y no puede quedarse sin texto completo).

**C.0.2 — Mensajes separados**

- Convención: el agente separa bloques con `\n\n---\n\n`.
- `index.ts` divide la respuesta y envía cada bloque con `sendCustomerText`, con
  700–1000 ms entre uno y otro. Se guarda cada bloque como su propio mensaje.
- Tope de 4 bloques por turno para no parecer spam.

**C.0.3 — Bloque INCLUYE**

- Nueva tabla `benefits` (o `settings.key = 'benefits'`): lista ordenada, con
  condiciones opcionales (marca, cantidad mínima, sucursal, vigencia) — así se cumple
  el §8 del PDF, que prohíbe promociones escritas en el prompt.
- Se envía automáticamente como bloque propio después de la imagen de cotización o de
  opciones. Se siembra con el texto literal de los chats.

**C.0.4 — Prompt y playbook**

`app/src/agent/prompts.ts` + `app/BOT_PLAYBOOK.md`, sección nueva "Formato WhatsApp":
- Máximo 4 líneas por mensaje; si hay más, se parte en bloques.
- Prohibido repetir en texto lo que ya va en una imagen.
- "Usted" por defecto (§19 del PDF); se cambia a "tú" solo si el cliente tutea.
- Cerrar siempre con una pregunta que haga avanzar la venta.
- Nunca presionar ni inventar urgencia.
- Un emoji por bloque como máximo.

`settings.ts`: `longitud` por defecto `"corta"`, `emojis` por defecto `"pocos"`, y
`formato: "imagen_primero" | "texto_completo"` para poder revertir desde el panel sin
tocar código.

**Verificación:** los 6 escenarios de la §25 del PDF que dependen de formato, medidos
en número de mensajes y líneas. Objetivo: ninguna respuesta con imagen supera 5 líneas
de texto.

---

### TANDA 1 — Fitment por aro y lectura de fotos (2–3 días) · el segundo reclamo

**C.1.1 — Motor de equivalencias** — nuevo `app/src/domain/tireEquivalence.ts`

```
diametroExteriorMm(medida)  = aro·25,4 + 2·(ancho·perfil/100)
equivalentes(base, aroObjetivo, tolerancia = 0,03)
describirCambio(base, alterna) → "+2,6 cm de diámetro · el velocímetro marca ~2 km/h menos"
```

Reglas duras (§4 del PDF):
- ±3 % de diámetro = seguro. Fuera de eso = requiere revisión física en local.
- Nunca proponer un índice de carga o velocidad inferior al de fábrica.
- Cada alterna sale con la frase de qué cambia en la práctica.

**C.1.2 — `fitment_vehiculo` reescrito**

- Se agrega `rin` (nullable) al schema.
- Devuelve tres tramos, igual que el ejemplo que aprobó el cliente:
  `medida_estandar`, `alternativas_seguras`, `alternativas_agresivas` (esta última
  siempre con la advertencia de roce/offset/suspensión).
- **Cruce con catálogo**: solo se ofrecen medidas que existan en stock. Las demás se
  mencionan como referencia técnica sin precio.
- El año pasa a ser opcional: si el cliente dio el aro, no se le pide el año.

**C.1.3 — Tool nueva `medidas_por_aro`**

Para el caso que él describió — *"cambió los aros, ya no es la medida original"*:
recibe aro y (opcional) uso, devuelve lo que hay en catálogo en ese aro agrupado por
ancho, con la recomendación de confirmar en el flanco. Sin depender del fitment OEM.

**C.1.4 — Ampliar `FITMENT_TABLE`**

Entradas por **aro**, no solo por modelo, empezando por lo que aparece en los chats
reales y en las camionetas más vendidas de Quito: L200 (R16/R17/R18), Hilux, D-Max,
Ranger, Frontier, BT-50, Wingle 7 2024 (235/70R16), JAC T8 (265/70R18), Highlander,
Duster, Sportage, Tucson, Grand Vitara, Montero, Prado, 4Runner.
Se marca `validated: true` **solo** lo que Depot Tire confirme por escrito → eso
satisface el criterio CRÍTICO #2 (registrar la fuente).

**C.1.5 — Fotos y audios**

- `index.ts`: descargar el media de Meta (`GET /{media-id}` → `url` → descarga con el
  token) y guardarlo.
- Fotos → visión (`gpt-4o`) con prompt cerrado: *devuelve solo la medida del flanco o
  null*. Si la lee, sigue el flujo normal; si no, pide otra foto indicando exactamente
  dónde mirar. Nunca adivina.
- Audios → transcripción, y el texto entra al pipeline normal.
- Cubre las pruebas obligatorias "fotografía borrosa de la medida" y "audio con ruido
  y palabras incompletas" del §25.

---

### TANDA 2 — El guion del vendedor humano (2 días)

**C.2.1 — Sucursal como pregunta, no como GPS**
- `local_mas_cercano` acepta también `sucursal_elegida: "cumbaya" | "quito_sur"`.
- Cuando no hay ubicación, el bot pregunta cuál le queda mejor y manda el link.
- `notificar_vendedor` deja de bloquear el handoff por falta de ubicación: exige
  sucursal **o** ubicación (hoy exige ubicación siempre, [tools.ts:685](app/src/agent/tools.ts:685)).

**C.2.2 — Preguntar el uso antes de recomendar**
Una sola pregunta, con las tres opciones del vendedor humano: ciudad/carretera,
mixtos e irregulares, o trabajo pesado. Alimenta la recomendación y el CRM.
Es el criterio CRÍTICO #3 del PDF.

**C.2.3 — Invitación a visitar sin compromiso**
Bloque estándar tras la cotización: ver las llantas, probárselas en el vehículo,
tener las dos opciones listas el día de la visita.

**C.2.4 — Alternativa cuando no hay la marca pedida**
Tabla `brand_equivalences`: marca pedida → alternativa en catálogo + argumentos
**verificables** (equipo original de X, estudio comparativo con URL). Sin la fuente
cargada, el bot no hace la afirmación. §5 del PDF: comparar sin desacreditar y sin
afirmaciones no demostrables.

**C.2.5 — Formas de pago y vigencia**
Configurables desde el panel: efectivo, tarjeta, diferido 3 y 6 meses sin intereses,
transferencia. Se mencionan al cotizar. El bot **nunca** confirma un pago (§10).

**C.2.6 — Volumen y traslado**
- Cantidad ≥ 4 con más de un vehículo → conectar con `discountOffers` y ofrecer
  revisar el descuento adicional en sucursal, sin prometer cifra.
- Cierre por fecha: *"¿qué día nos visita, para tener las llantas listas en la sucursal?"*

**C.2.7 — Precio por unidad, siempre**
En el caption y en la imagen. Es la pregunta que más se repite en los chats.

---

### TANDA 3 — Bloqueantes críticos del PDF (3–4 días)

**C.3.1 — Resumen obligatorio de transferencia (§17, CRÍTICO #4)**
`notificar_vendedor` pasa a entregar los 7 campos exigidos: Cliente, Vehículo,
Necesidad, Opciones enviadas, Objeción, Estado, Próximo paso. Confirmar que el asesor
lo recibió, avisar al cliente que una persona continúa, y no obligarlo a repetir nada.

**C.3.2 — Manejo de objeciones (§9)**
Las 6 objeciones del PDF con su comportamiento esperado, en el playbook, y registro de
la objeción principal en el CRM. Ninguna se responde con descuento automático.

**C.3.3 — Falla segura de integraciones (CRÍTICO #6)**
Auditar cada camino en que Contífico, el render o Meta fallan: hoy la cotización ya
tiene respaldo, falta cubrir catálogo caído (no afirmar stock) y fitment caído
(no afirmar compatibilidad). Prueba: apagar cada integración y verificar que el bot
transfiere en vez de inventar.

**C.3.4 — Etapas del CRM alineadas al §16**
Mapear las etapas actuales a las 11 sugeridas o justificar por escrito la diferencia
en la hoja de validación.

**C.3.5 — Suite de las 30 pruebas del §25**
Un archivo de escenarios con: entrada exacta del cliente, datos consultados, respuesta
enviada, acciones ejecutadas, registro en CRM, resultado esperado vs obtenido. Es la
evidencia que pide la hoja de validación para firmar.

---

### TANDA 4 — Dos paneles separados: negocio y técnico (§20) (3 días)

**El problema de hoy:** todo vive en una sola pantalla. El logo `DT` del rail
([App.tsx:92](hub/src/App.tsx:92)) lleva a `Settings.tsx` (759 líneas, 6 pestañas:
`whatsapp · ai · followups · manual · business · connection`), donde el token de Meta
está a dos clics del tono de voz del bot. Depot Tire no debería ver nunca un token, y
yo no debería tener que entrar por la misma puerta para cambiar una promoción.

**La separación es por audiencia, no por tema:**

#### 4.A — Tab «Ajustes» en el rail (para Depot Tire)

Ruta nueva `#/ajustes`, ícono de perillas, **siempre visible** (`requiere: null` en
`NAV`, [App.tsx:23](hub/src/App.tsx:23)) — apagar el bot no puede depender de una fase.
Es todo lo que el negocio cambia solo:

| Sección | Qué edita | De dónde sale |
|---|---|---|
| ⏻ **Bot encendido / apagado** | Interruptor grande, primero de todo | `BotPowerSwitch`, ya existe ([Settings.tsx:583](hub/src/screens/Settings.tsx:583)) |
| **Promociones y beneficios** | El bloque `*INCLUYE*`, con vigencia y condiciones por marca/cantidad/sucursal | Tabla nueva (Tanda 0) |
| **Formas de pago** | Efectivo, tarjeta, diferido 3 y 6 meses sin intereses, transferencia | Tabla nueva (Tanda 2) |
| **Sucursales y horarios** | Nombre, dirección, link de Maps, horario por día | Hoy **hardcodeado** en `config.ts:66` |
| **Equivalencias de marca** | "Si piden BFGoodrich → ofrecer Falken" + fuente | Tabla nueva (Tanda 2) |
| **Personalidad del bot** | Tono, emojis, largo, "usted/tú", texto libre | Pestaña `ai`, la mitad de estilo |
| **Seguimientos** | Cada cuánto, en qué horario, tope diario | Pestaña `followups` |
| **Datos del negocio** | Nombre, teléfono, IVA, marcas | Pestaña `business` + `config.ts` |

Reglas de esta pantalla: lenguaje de negocio (nada de "prompt", "tool" ni "webhook"),
**vista previa antes de aplicar** (§20 del PDF lo pide explícitamente), y validación de
formatos para que no se pueda guardar un precio a medias.

#### 4.B — El logo `DT` → «Configuración técnica» (para mí)

La ruta `#/settings` se queda donde está pero cambia de título y de contenido. Solo lo
que puede romper el bot:

- **Canal de WhatsApp**: token, Phone ID, verify token, app secret, diagnóstico paso a
  paso (`whatsapp-setup.tsx`, ya existe)
- **Conexión con el servidor**: clave admin (`connection`)
- **Fases** 2/3/4 — hoy en `/panel`; decidir si se mueven acá o se quedan centralizadas
- **Manual base del bot** (`BOT_PLAYBOOK.md`) y **prompts por etapa** con las tools
  habilitadas — son los que pueden dejar al bot mudo, no los toca el cliente
- **Salud del sistema**: estado del catálogo, latido del worker, últimas piezas
  renderizadas y fallidas (el contador de la Tanda 0.0), errores recientes

#### 4.C — Cómo se llega a cada uno

- Rail y tab bar móvil: se agrega «Ajustes» al final de `NAV`.
- El logo `DT` (rail y topbar móvil) sigue navegando a `settings`, ahora rotulado
  «Configuración técnica».
- Los avisos de "Bot apagado" ([App.tsx:171](hub/src/App.tsx:171)) y el punto rojo del
  rail pasan a apuntar a `#/ajustes`, que es donde ahora se enciende.
- El `ConnectionChip` sigue apuntando a `settings` — ese sí es técnico.

#### 4.D — Historial y reversión (§20 del PDF)

Toda edición del panel de negocio queda con fecha, usuario y versión, y se puede
revertir. La tabla `settings` ya es key/value jsonb: se le agrega una `settings_history`
con el valor anterior. Sin esto no se aprueba el §20.

**Decisión pendiente:** ¿el panel técnico se esconde detrás de un rol o basta con que
esté fuera del camino? Para el piloto propongo dejarlo accesible — un solo nivel de
cuenta, como ya dice la pestaña `business` — y meter roles solo cuando entren asesores.

---

### TANDA 5 — Lo que necesita datos del negocio (sin fecha)

Estos bloques del PDF **no se pueden construir con lo que hay hoy**. Requieren que
Depot Tire entregue datos o sistemas:

| Bloque | Qué falta del lado del cliente |
|---|---|
| §6 Stock por sucursal, reservas, traslados | Contífico hoy da stock global. Hace falta stock por bodega y una política de reservas. |
| §11 Agendamiento y taller | No existe calendario ni capacidad de taller en ningún sistema. |
| §12 Servicios adicionales (frenos, aceite, baterías…) | Faltan precios, duraciones y disponibilidad por sucursal. |
| §14 Posventa y recompra | Requiere registro de instalación y kilometraje. |
| §15 Reclamos y garantías | Requiere proceso interno definido y responsable asignado. |
| §21 B2B y flotas | Requiere lista de precios corporativa y política de crédito. |

**Recomendación:** presentarlos como Fase 3 en la hoja de validación, con las funciones
deshabilitadas explícitamente. El §26 del PDF permite `APROBADO CON RESTRICCIONES`
justamente en ese caso — y advierte que es peor lanzarlas a medias.

---

## Parte D — Criterios de aceptación

Cada tanda se cierra con evidencia reproducible, no con "está hecho".

**Tanda 0.0**
- [x] Las tres piezas renderizan correctamente, verificado con las imágenes reales
      (`test/tanda0-evidencia.ts` + `test/piezas.test.ts`). El envío a un WhatsApp de
      prueba queda para cuando se despliegue: es lo único que necesita credenciales.
- [x] Ninguna pieza supera 4,5 MB ni 8 s, verificado por prueba automática. **Hecho** — `test/piezas.test.ts`, pasa en 1,9 s.
- [x] Si la imagen de opciones falla, el cliente recibe el texto completo **y** se crea
      una alerta visible en el hub. **Hecho** — `usarCaptionCorto()` cae al muro
      `…Detallado` y `preparar_opciones` crea la alerta `send_error`.
- [x] Contador de piezas enviadas vs fallidas visible en Métricas. **Hecho 4-ago.**
- [ ] Número real de conversaciones afectadas en los últimos 15 días, medido en la DB.
      **Ya no bloquea nada:** es una métrica de daño histórico. El fallo silencioso está
      corregido y el contador de Métricas mide el problema de aquí en adelante.

**Tanda 0**
- [x] Ninguna respuesta con imagen supera 5 líneas de texto. **Hecho** — prueba automática sobre los 3 captions.
- [x] Las opciones se responden con imagen + caption + recomendación explícita. **Hecho** — `preparar_opciones` ahora exige `recomendado` y `motivo` en su schema.
- [x] El bloque INCLUYE sale después de todo precio, desde tabla y no desde el prompt. **Hecho** — tabla `benefits` (migración 008) + `services/benefits.ts`, con filtros por marca, cantidad, sucursal y vigencia.
- [x] Toda respuesta comercial termina en una pregunta. **Hecho** — último bloque de `composeBlocks` en las 3 tools, con prueba.
- [x] Capturas del antes/después de los 3 escenarios. **Hecho 4-ago** — `test/tanda0-evidencia.ts` genera la conversación lado a lado con las piezas renderizadas por el mismo motor de producción. Opciones 21→10 líneas, cotización 11→10 en 3 mensajes, comparativa 12→4.

**Tanda 1**
- [ ] *"camioneta L200, rin 17"* → responde 265/65R17 + alternativas, sin pedir el año.
- [ ] Las alternativas indican qué cambia y cuáles requieren revisión física.
- [ ] No se ofrece ninguna medida que no esté en catálogo.
- [ ] Foto del flanco → medida leída o petición concreta de otra foto. Nunca adivina.
- [ ] Audio → transcrito y respondido.

**Tanda 2**
- [ ] Elige sucursal por pregunta binaria, sin exigir GPS.
- [ ] Pregunta el uso antes de recomendar.
- [ ] Marca no disponible → alternativa con fuente verificable, o handoff.
- [ ] El handoff ya no se bloquea por falta de ubicación.

**Tanda 3**
- [ ] Los 6 criterios CRÍTICOS del §27 demostrados con log reproducible.
- [ ] Las 30 pruebas del §25 ejecutadas y documentadas.
- [ ] Cada integración caída → transfiere, no inventa.

**Tanda 4**
- [ ] Depot Tire cambia una promoción, un horario y una forma de pago sin tocar código,
      y el bot lo refleja en el siguiente mensaje.
- [ ] El bot se apaga y se enciende desde el tab «Ajustes», en dos toques.
- [ ] Ningún token ni clave aparece en el panel de negocio.
- [ ] Toda edición queda con fecha, usuario y versión, y se puede revertir.
- [ ] Vista previa antes de aplicar en las secciones que afectan lo que lee el cliente.

---

## Parte E — Orden y esfuerzo

| Tanda | Días | Qué desbloquea |
|---|---|---|
| **0.0 — Verificar envío de imágenes** | 0,5–1 | **Bloqueante.** Puede ser la causa real del reclamo #1. |
| 0 — Personalidad y formato | 1–1,5 | El reclamo #1 y #2. Visible el mismo día. |
| 1 — Fitment por aro + fotos | 2–3 | El reclamo #3. Recupera las conversaciones que hoy se caen. |
| 2 — Guion del vendedor | 2 | Sube la conversión: es lo que cierra en los chats reales. |
| 3 — Bloqueantes del PDF | 3–4 | Habilita firmar `APROBADO`. |
| 4 — Ajustes negocio + técnico | 3 | Depot Tire deja de depender del desarrollador. |
| 5 — Datos del negocio | — | Bloqueado por el cliente. |

**Total tandas 0.0–4: 11–15 días de trabajo.**

Recomendación de entrega: **primero la 0.0**, porque si las imágenes están fallando,
arreglarlas sola ya cambia lo que Joaquín está viendo — y hay que saberlo antes de
rediseñar los textos, para no optimizar el mensaje equivocado. Después la Tanda 0 con
capturas del antes/después sobre sus propios ejemplos. Las dos juntas salen en 2 días y
compran tiempo para las tandas 1–3.

---

## Anexo — Archivos que toca cada tanda

| Tanda | Archivos |
|---|---|
| 0.0 | `render/quoteImage.ts`, `agent/tools.ts` (`sendVisual`, `preparar_opciones`), `wa/client.ts` (`uploadMedia`), `server/webhook.ts` (endpoint de diagnóstico), `services/hubData.ts`, `test/piezas.test.ts` (nuevo) |
| 0 | `services/quoteMessages.ts`, `agent/tools.ts`, `agent/prompts.ts`, `BOT_PLAYBOOK.md`, `index.ts`, `services/settings.ts`, migración `benefits` |
| 1 | `domain/tireEquivalence.ts` (nuevo), `domain/fitment.ts`, `services/vehicleFitmentResearch.ts`, `agent/tools.ts`, `index.ts`, `wa/client.ts` (descarga de media) |
| 2 | `agent/tools.ts`, `agent/prompts.ts`, `config.ts`, migración `brand_equivalences` + `payment_methods` |
| 3 | `services/advisorNotifications.ts`, `agent/tools.ts`, `BOT_PLAYBOOK.md`, `domain/pipeline.ts`, `test/escenarios-depot.test.ts` (nuevo) |
| 4 | **Hub:** `App.tsx` (NAV + rutas), `router.ts`, `screens/Ajustes.tsx` (nuevo), `screens/Settings.tsx` (se queda solo con lo técnico), `components/icons.tsx`. **Backend:** `server/admin.ts`, migración `settings_history` + tablas de negocio |
