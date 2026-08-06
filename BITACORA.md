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
| 2026-08-06 | _(este mismo)_ | Favicon como archivo para la tarjeta de Vercel | 0.25 |
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
| | | **TOTAL** | **~84.0 h** |

---

## Entradas (más reciente primero)

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
