# PLAN MAESTRO — Misma calidad, menos tokens

> **Cómo usar este documento.** Cada «SPRINT N» es una PARTE del plan y un
> prompt autocontenido. En una sesión nueva se pega **primero el bloque del
> SPRINT** (así el chat queda llamado `Sprint N — <nombre corto>`) y **después
> la PARTE A**.
>
> **Este plan es SECUENCIAL, a propósito**, y en eso se aparta del molde de
> sprints paralelos. Manuel lo pidió así (una parte cada dos días) y además
> es lo que corresponde:
> - 8 de las 9 partes tocan `guardian.ts` o `prepararSalida.ts`.
> - Cada parte mide su ahorro **contra lo que ya está publicado**, incluida la
>   parte anterior.
>
> Por eso cada parte sale de `origin/main` fresco **después** de que la
> anterior está en producción y su ventana de observación salió limpia (PARTE A,
> regla 9). El **SPRINT FINAL** no mergea nada pendiente: mide el total contra
> la línea base y cierra.
>
> **Estado al escribir (12-sep-2026):**
> - `origin/main` = `32df6f3`.
> - La rama `perf/adelgazar-guardian` trae el nivel 1 y la medición (`4d83b9f`,
>   `b5c1936`, `607c393`), sin publicar.
>
> **Contexto obligatorio:**
> - `docs/PLAN-ADELGAZAR-GUARDIAN.md`
> - `docs/PEDIDO-DISENO-NIVEL-2-3.md`
> - `docs/COMO-MEDIR-TOKENS.md`

## Pedidos (lo que este plan no puede perder)

- **P-01** Publicar el nivel 1 (hecho y probado, sin publicar).
- **P-02** Niveles 2 y 3: sacar de la rúbrica las reglas 12, 15, 19, 20, 21 y 22, y decidir la 11.
- **P-03** Último nivel A: que el contexto del guardián entre más al caché (~1.600 tokens sin caché, ~$0,035 por conversación).
- **P-04** Último nivel B: bajar lo que escribe el guardián (~127 tokens a $30/M, ~$0,017 por conversación).
- **P-05** «Lo más importante es que no baje la calidad del bot y que se pruebe. Misma calidad, menos tokens.»
- **P-06** «Todos los tokens gastados se tienen que registrar en todas las conversaciones.»
- **P-07** Partes de un plan con orden: una cada dos días.
- **P-08** Cada parte con un pool de pruebas de simulador que tenga un poco de todo **y** que apunte a lo que se cambió, para presionar a ver si hay errores.
- **P-09** Comprobar que cada parte de verdad ahorra tokens.

## Calendario

| Día | Fecha tentativa | Parte |
|---|---|---|
| 0 | lun 14-sep | S1 — banco de pruebas (+ publicar nivel 1) |
| 2 | mié 16-sep | S2 — registrar todo el gasto |
| 4 | vie 18-sep | S3 — reglas 12 y 15 |
| 6 | lun 21-sep | S4 — ancho rechazado (regla 20) |
| 8 | mié 23-sep | S5 — oferta ya aceptada (regla 19) |
| 10 | vie 25-sep | S6 — tipo de llanta (regla 21) |
| 12 | lun 28-sep | S7 — sin medida confirmada (regla 22; la 11 se queda) |
| 14 | mié 30-sep | S8 — contexto al caché |
| 16 | vie 2-oct | S9 — salida del guardián |
| 18 | lun 5-oct | SPRINT FINAL — medición y cierre |

Los domingos no se publica: con poco tráfico la ventana de observación no dice
nada, y nadie está mirando. Si una ventana no se cumple (PARTE A, regla 9), todo
el calendario se corre; **no se salta una parte para mantener la fecha**.

## PARTE A — Contexto y reglas comunes (pegar al inicio de CADA parte)

Sos un ingeniero senior en **AutoVenta**: bot de ventas de llantas por WhatsApp
para Depot Tire (Quito). Stack: TypeScript + Node, Postgres, OpenAI (gpt-5.5 y
gpt-5.4-mini), Railway. Vas a ejecutar **UNA parte** de un plan secuencial cuyo
objetivo es **misma calidad, menos tokens**.

Antes de tocar código, leé:
- tu sección de este plan y la PARTE B;
- `docs/COMO-MEDIR-TOKENS.md`;
- `docs/PLAN-ADELGAZAR-GUARDIAN.md` (qué se hizo y qué se descartó al verificar);
- `docs/COMO-ARREGLAR-EL-BOT.md`, sección «Elegir la capa correcta»;
- `docs/COMO-PROBAR-CAMBIOS.md` (lo crea S1; desde S2 es obligatorio).

**Reglas duras** (cada una sale de algo que ya pasó en este repo):

1. **Worktree propio desde `origin/main` fresco**:
   `git worktree add .claude/worktrees/<tema> -b <rama> origin/main`, enlazar
   `app/node_modules` y copiar `app/.env`, `app/.env.sim` y
   `app/scripts/sim/datos/catalogo.json` (los tres los ignora git; sin el
   catálogo falla `buscarPorAroCompleto.test.ts`).
   *Por qué:* hay varios chats en `/Users/manue/AutoVenta` a la vez y el 1-sep
   dos sesiones se pisaron el árbol.
2. **Simuladores con puertos y base propios.** Se matan por puerto, **después
   de verificar que el `cwd` del pid es tu worktree**. Nunca `pkill` por nombre.
   *Por qué:* los puertos se reciclan entre sesiones, y un `pkill -f sim.mjs`
   tumbó el simulador de otra.
3. **Un push a `main` publica en producción Y en staging.**
   - Antes de pushear: `git fetch`, rebase sobre `origin/main`, suite completa, y
     avisar a las otras sesiones con SendMessage (qué archivos tocás).
   - Publicar necesita el **sí explícito de Manuel** en el chat, salvo que él
     haya autorizado de antemano publicar cuando todas las compuertas pasan.
4. **La base de producción se lee y nunca se escribe.** `DATABASE_URL` de
   `app/.env`, conexión con `default_transaction_read_only=on`.
5. **El simulador usa la clave de `app/.env.sim`** (proyecto de pruebas), nunca
   la de Depot: esas pruebas se le cobrarían al cliente.
6. **Las compuertas de calidad corren con los modelos de producción** (el
   simulador los alinea desde Railway). Nada de `--mini` ni de plomería para
   decidir que la calidad quedó igual.
7. **Primero la prueba roja.** Todo candado nuevo empieza con una prueba que
   falla sin él, usando el caso real de producción (fecha + conv) de la cabecera
   del archivo. Molde: `app/test/rubricaAdelgazada.test.ts`. Mitad 1, la regla
   ya no está en el texto; mitad 2, el candado sostiene el caso solo; más una
   prueba sobre `PASOS` (orden y puertas).
8. **Nada se borra de la rúbrica sin las cuatro evidencias:**
   - el candado corre **después** del guardián y en **las mismas puertas** que
     la regla cubría (el guardián revisa `respuesta`, `retomada` y `seguimiento`);
   - la **sombra histórica** llega a su umbral (R-03);
   - el **pool general y el pool dirigido** no tienen regresiones contra `main` (R-02);
   - el **conteo exacto** confirma el ahorro (`scripts/guardian/contar-tokens-rubrica.mjs`).
9. **Una parte = un PR = una publicación, y una ventana de observación.** La
   parte siguiente arranca solo cuando se cumplen las dos cosas:
   - pasaron **2 días y al menos 150 conversaciones reales** desde la publicación;
   - la revisión de producción (R-24) salió limpia: sin subida de
     `guardian_sin_revision`, sin subida de la categoría tocada, sin ningún
     error duro atribuible (medida, precio o stock equivocado al cliente).

   Si algo falla: `git revert` del commit de la parte, publicar, anotar en la
   bitácora y **no seguir** hasta entenderlo.
10. **Se mide como dice `docs/COMO-MEDIR-TOKENS.md`.** Nunca caracteres ÷ 4, y
    nunca «ahorro» sacado de la conversación estándar sola: su ruido (±$0,03)
    tapa cambios chicos.
11. **Regla de la casa:** nada nuevo entra a la rúbrica si un candado lo puede
    verificar. `guardian.ts` y `prepararSalida.ts` son zona caliente: se tocan
    solo las zonas permitidas de tu parte.
12. **`BITACORA.md` en cada commit** (el hook lo exige): qué, por qué, horas.
    Si hay conflicto, se conservan las dos entradas.
13. **El cierre de cada parte para Manuel va en lenguaje simple:** qué cambió
    para el cliente (nada, si salió bien), cuánto ahorra medido, qué pruebas
    corrieron de verdad y qué no. Lo técnico va a los archivos.

**Cómo se prueba cada parte (el banco que construye S1)**:

```bash
# Dos simuladores a la vez: main (base) y tu rama. Puertos y base propios.
node app/scripts/sim/sim.mjs --sin-build --nombre Mario --puerto 3310 --puerto-bot 3305 \
  --puerto-graph 4820 --puerto-contifico 4821 --puerto-stub 4822 --db autoventa_sim_base
node app/scripts/sim/sim.mjs --sin-build --nombre Mario --puerto 3410 --puerto-bot 3405 \
  --puerto-graph 4920 --puerto-contifico 4921 --puerto-stub 4922 --db autoventa_sim_rama

# El pool general + el dirigido de tu parte, en los dos, y la comparación
node app/scripts/sim/pools/comparar.mjs --pools general,parte-NN \
  --base 3310:3305:autoventa_sim_base --rama 3410:3405:autoventa_sim_rama
```

**PR:** título `perf|feat|fix(<área>): …`. El cuerpo lleva:
- los R-xx que cubre;
- la tabla de compuertas (pools, sombra, conteo exacto, suite) con números;
- los riesgos;
- cómo revertir.

## PARTE B — Lista maestra de requisitos

### B.1 Banco de pruebas

- **R-01 Pool general versionado.** Existe `app/scripts/sim/pools/general.mjs`,
  **fuera de `datos/`** (git ignora esa carpeta entera: así se perdieron los 105
  escenarios del T115). Trae ~16 escenarios que cubren «un poco de todo»:
  - las cuatro puertas de salida (turno, retomada tras humano, seguimiento y
    `/restart` si el simulador lo permite);
  - medida, aro, vehículo sin medida, tipo A/T, cotizar directo, «Ok» que acepta,
    ancho rechazado, stock que no alcanza, día de visita pendiente, fuera de
    catálogo, despedida, objeción que no es rechazo, pago y ubicación, sticker;
  - al menos 2 conversaciones reales históricas.
  Cada escenario trae jueces deterministas sobre hechos de la base y texto.
  Todos pasan los invariantes globales: sin turno mudo, sin error de IA, sin
  `sin_revision`, sin «COT-/AV-» al cliente, sin cotización ni pieza duplicada,
  sin mensaje repetido 3 veces. **Corre verde contra `main`** en 2 corridas
  seguidas (si un juez falla contra `main`, el juez está mal o hay un bug que se
  anota aparte; no se deja rojo). → **S1**
- **R-02 Comparador base contra rama.** `app/scripts/sim/pools/comparar.mjs`
  corre uno o varios pools en dos simuladores a la vez y entrega, por escenario
  y por juez, «pasa/falla» en base y en rama.
  - **Regresión:** falla en la rama y pasa en la base. Cada regresión se repite
    2 veces más en los dos lados y se confirma si la rama falla en al menos 2 de
    3 y la base pasa en al menos 2 de 3.
  - **Tokens:** mediana de entrada, cacheada y salida por llamada del guardián y
    del vendedor, y costo normalizado por conversación.
  - Guarda las transcripciones y **sale con código 1 si hay una regresión
    confirmada**. → **S1**
- **R-03 Sombra histórica.** `app/scripts/guardian/sombra-historica.mjs --regla <n> --dias 60`
  corre el detector de un candado sobre los borradores guardados en
  `guardian_reviews` (`original_text`, más los mensajes de la conversación hasta
  ese momento), en solo lectura. Reporta:
  - **Cobertura:** de los borradores donde el guardián marcó la categoría de la
    regla, cuántos detecta el candado.
  - **Falsos positivos:** en borradores aprobados, cuántas veces dispara.
  - **Lista de fallos:** cada uno con su número de conversación.
  **Umbral para borrar una regla:** cobertura ≥ 95 % con al menos 10 casos
  (si hay menos, se amplía hasta 90 días) y falsos positivos ≤ 1 %. Cada fallo y
  cada falso positivo se lee y se clasifica («el guardián se equivocó» / «el
  candado no lo ve») en el PR. → **S1**
- **R-04 Pools dirigidos.** Formato documentado en `docs/COMO-PROBAR-CAMBIOS.md`.
  Cada parte agrega `app/scripts/sim/pools/parte-NN-<tema>.mjs` con:
  - los casos reales de producción de la regla (conv + fecha);
  - al menos 4 variantes que presionan el borde: la excepción documentada, la
    frase ambigua, el caso cruzado con otra regla, y una puerta que no sea el
    turno normal.
  S1 deja el formato y el pool de su propia parte. → **S1**

### B.2 Nivel 1

- **R-05 Nivel 1 en producción.** El contenido de `perf/adelgazar-guardian` está
  en `main`:
  - `/health` de producción muestra el commit;
  - el pool general no tiene regresiones contra la base;
  - el conteo exacto documenta −512 tokens de rúbrica;
  - a los 2 días, la entrada media por llamada del guardián en producción bajó
    ~450 tokens (consulta de `COMO-MEDIR-TOKENS.md` §5). → **S1**

### B.3 Registro completo del gasto

- **R-06 Transcripción registrada.** Cada audio transcrito deja una fila en
  `ai_runs` con `call_type='transcription'`, el `conversation_id` real y el uso
  que devuelve la API (tokens si vienen; si no, segundos de audio en una columna
  aditiva). Se registra **después** de que `recibirMensaje` resuelve la
  conversación: ese era el motivo documentado para no registrarla
  (`transcripcion.ts:10-13`). → **S2**
- **R-07 Investigación de fitment registrada.** `call_type='research'`, una fila
  por llamada a Responses (incluido el reintento en texto,
  `vehicleFitmentResearch.ts:135-143`), con tokens y cantidad de búsquedas web
  (columna aditiva). → **S2**
- **R-08 Texto de seguimiento registrado.** `followUpCopy.ts:76` deja
  `call_type='followup_copy'` con su conversación. → **S2**
- **R-09 Visión de vista previa de links registrada.** `linkPreview.ts` le pasa
  `audit` a `describirFotoDeLlanta`. → **S2**
- **R-10 El guardián registra también cuando falla.**
  - **JSON inválido:** el uso se registra antes de parsear
    (`guardian.ts:795-797`).
  - **Tiempo agotado:** la respuesta que llega tarde se registra cuando llega,
    sin bloquear el mensaje (`conTiempoMaximo`, `guardian.ts:305`).
  - **Razonamiento:** `reasoning_tokens` del guardián deja de quedar en 0. → **S2**
- **R-11 El vendedor registra por modelo y aunque se caiga.**
  - Un turno que usó varios modelos deja una fila por modelo (hoy suma todo y
    cobra con el último, `agent.ts:688-691`, `:880-883`, `:899-902`).
  - Un turno que se cae registra lo que ya gastó (hoy 0, `agent.ts:138-148`). → **S2**
- **R-12 La facturación cobra lo nuevo.** `billing.ts` cobra los segundos de
  audio y las búsquedas web con su tarifa. Una prueba cuadra, para un día de
  datos de ejemplo, el total de `usoEntre` con la suma por conversación. → **S2**
- **R-13 Nadie vuelve a gastar a ciegas.** Una prueba estática recorre `app/src`
  y falla si aparece una llamada `openai.<x>.create`, `responses.create` o
  `audio.transcriptions.create` sin su registro en la misma función (con lista
  de excepciones justificadas). → **S2**
- **R-14 Nueva línea base.** Con el registro completo se remiden la conversación
  estándar (3 medidas + calentamiento) y el pool general, y queda la línea en
  `mediciones/historial.jsonl` con la etiqueta `linea-base-registro-completo`.
  **Esa, y no la anterior, es la base del SPRINT FINAL.** → **S2**

### B.4 Rúbrica (niveles 2 y 3)

- **R-15 Regla 12 → alerta de código.** Un paso de `PASOS` (o una verificación
  después del envío) compara lo que el bot confirmó (visita, local, medida,
  cantidad) contra los HECHOS REGISTRADOS y abre `createBotAlert` tipo
  `estado_desincronizado`, sin tocar el texto.
  - La mitad «reportá y aprobá» sale de la rúbrica.
  - La mitad «solo corrige si contradice un hecho anotado» se decide y se
    escribe (queda o se va con su justificación).
  - Sombra histórica: la alerta aparece en ≥ 95 % de los hallazgos
    `estado_desincronizado` de 60 días. → **S3**
- **R-16 Regla 15 → el candado es la única autoridad.** Sale la regla entera y
  `sinPreguntasProhibidas` queda como autoridad, con la evidencia de
  `domain/preguntasProhibidas.ts` (el guardián falló 3 de 3). Las tres piezas de
  juicio quedan donde se decida, con prueba:
  - «el mensaje no queda mudo» (conv 13617);
  - `cotizacion_sin_eleccion` (conv 13615);
  - la exención del aviso de cantidad grande.
  `app/test/preguntasProhibidas.test.ts:120` deja de fijar texto y pasa a fijar
  comportamiento. → **S3**
- **R-17 Regla 20 → candado de ancho rechazado.** Paso después del guardián, en
  las 3 puertas, con `violaRestriccionesDeLlanta` sobre las medidas que nombra
  el texto final. Sombra ≥ 95 %. La regla sale de la rúbrica y el HECHO se
  queda. → **S4**
- **R-18 Regla 19 → candado de oferta ya aceptada.** Paso con
  `ofertaDeCotizarAceptada`, en las 3 puertas.
  - Respeta la excepción «DÍA DE VISITA PENDIENTE» (conv 13909).
  - Decide y prueba dónde vive `cierre_sin_pregunta_dia`.
  - Sombra ≥ 95 %. La regla sale y el HECHO se queda. → **S5**
- **R-19 Regla 21 → candado de tipo desde el catálogo.** Primero se mide en
  producción si la excepción de la regla 0 está muerta (alertas
  `guardian_hecho_nuevo_bloqueado` con productos del tipo pedido) y se decide.
  Después, el candado con `tipoDeProducto` y `productosDelCatalogoMencionados`,
  coordinado con `guardian_no_vende_solo`, sin que el bot «venda por su cuenta».
  Pool con los casos 13645 y 13645 bis. Sombra ≥ 95 %. → **S6**
- **R-20 Regla 22 → párrafo a demanda.** El texto de la regla 22 sale de
  `INSTRUCCIONES` y se agrega al contexto **solo** cuando el HECHO «MEDIDA NO
  CONFIRMADA POR EL CLIENTE» o «ARO DADO POR EL CLIENTE» está presente, después
  del prefijo fijo. Pool con conv 13862, conv 3 (rin 14), conv 18684 (Qashqai,
  varias medidas) y variantes. Se mide con conteo exacto y con el % de
  llamadas en que aparece el párrafo. → **S7**
- **R-21 Regla 11 se queda, con justificación escrita.** En
  `docs/PLAN-ADELGAZAR-GUARDIAN.md`, con la misma vara que las 4 reglas
  descartadas del nivel 1: depende de la huella de herramientas, su corrección
  es redactar alternativas con productos y choca con `guardian_no_vende_solo`.
  Si la sombra histórica muestra lo contrario, se reabre. → **S7**

### B.5 Palancas de costo

- **R-22 El contexto del guardián entra al caché.**
  1. **Explicar** con un experimento controlado (dos llamadas idénticas con la
     clave de pruebas, variando una sección a la vez) por qué el caché de
     producción corta en 4.864 tokens si la rúbrica sola pesa 5.120.
  2. **Reordenar `armarContexto`** para que lo fijo vaya primero, justo después
     de la rúbrica: horarios, origen de marcas, locales, beneficios, el bloque
     de seguimiento y el catálogo del día (verificar antes si `catalogoHoy`
     depende de la medida pedida; si depende, es variable y no sube).
  3. **Agregar** `prompt_cache_retention: "24h"` al guardián (el vendedor ya lo
     usa, `agent.ts:674`) y `prompt_cache_key` si el experimento muestra que
     ayuda.
  **Aceptación:**
  - `probar-rubrica.mjs` da los mismos veredictos que en `main` en 3 corridas;
  - pools sin regresión;
  - a los 2 días, la parte cacheada por llamada del guardián en producción sube
    y el costo por llamada baja (§5 de `COMO-MEDIR-TOKENS.md`). → **S8**
- **R-23 El guardián escribe menos.**
  1. **Medir** con los datos de S2 cuánto de la salida es razonamiento y cuánto
     texto visible.
  2. **Probar**, de a una, las palancas: `detalle` más corto, no reescribir
     cuando la categoría la arregla un candado posterior, y el nivel de
     razonamiento.
  3. **Quedarse** solo con las que no cambian veredictos.
  **Aceptación:**
  - `probar-rubrica.mjs` 14 de 14 igual que `main` en 3 corridas;
  - pools sin regresión;
  - salida media por llamada del guardián −25 % o más en el pool y, a los 2
    días, en producción. → **S9**

### B.6 Operación y cierre

- **R-24 Cada parte se publica sola y se vigila.** PR propio, publicación propia,
  entrada en la bitácora y línea en `mediciones/historial.jsonl`. A los 2 días
  va la revisión de producción, con números, en la tabla «Seguimiento por
  parte» de `docs/PLAN-ADELGAZAR-GUARDIAN.md`:
  - tokens y costo por llamada del guardián;
  - `guardian_sin_revision`;
  - hallazgos y alertas de la categoría tocada;
  - errores duros. → **PARTE A**
- **R-25 Informe final.** Se mide contra la línea base de S2 (R-14):
  - la conversación estándar;
  - el pool general;
  - producción 7 días (por llamada y por conversación, con el registro ya completo).
  Tabla R-01…R-24 con ✅/⚠️/❌ y evidencia. Docs y memoria al día. → **SF**

## SPRINT 1 — banco de pruebas (rama `test/banco-de-pruebas`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 1 — banco de
> pruebas`** (con la herramienta de título de sesión si la tenés). Después pegá
> debajo la PARTE A y ejecutá.

**Arranca cuando:** día 0. Es la primera parte.

**Objetivo.** (R-01, R-02, R-03, R-04, R-05) Que cada parte siguiente tenga con
qué demostrar «misma calidad, menos tokens», y estrenar ese banco publicando el
nivel 1 que ya está hecho. Nada cambia para el cliente, salvo los ~450 tokens
menos por llamada del guardián del nivel 1.

**Archivos permitidos:**
- `app/scripts/sim/pools/general.mjs`, `app/scripts/sim/pools/comparar.mjs`, `app/scripts/sim/pools/parte-01-nivel1.mjs` (nuevos)
- `app/scripts/sim/lib/turnos.mjs` (nuevo: texto, sticker, seguimiento adelantado, retomada tras humano; lo usan los pools y la conversación estándar)
- `app/scripts/sim/medir-conversacion-estandar.mjs` (pasar a usar `lib/turnos.mjs`, sin cambiar lo que mide)
- `app/scripts/sim/sim.mjs` **solo** lo mínimo para retomada tras humano (un endpoint `/api/humano` que escribe como asesor y devuelve el bot), si hoy no se puede
- `app/scripts/guardian/sombra-historica.mjs` (nuevo)
- `docs/COMO-PROBAR-CAMBIOS.md` (nuevo)
- El contenido ya hecho de `perf/adelgazar-guardian` (se integra tal cual; ver pasos)

**Prohibido:** todo `app/src/**` (este sprint no cambia al bot; el nivel 1 ya
viene hecho y probado), `app/scripts/sim/lib/corredor-t115.mjs` (arnés congelado
del T115: se importa, no se edita), `app/scripts/sim/pruebas-10.mjs` (vara
congelada del 51/51).

**Pasos.**
1. **Integrar el nivel 1.** Rebase de `perf/adelgazar-guardian` sobre
   `origin/main`, suite completa verde. Esa rama es la base de este sprint.
2. **Pool general (R-01).** Se reconstruye desde la especificación
   `/Users/manue/Documents/AUTOVENTAS/THRESHOLD-115-CONVERSACIONES.md`, que tiene
   ids y resultados esperados, y desde conversaciones reales copiadas de
   producción. Los 105 escenarios del T115 **no existen**: vivían en `datos/`,
   que git ignora. Composición mínima:

   | Id | Qué cubre | Fuente |
   |---|---|---|
   | G01 | Conversación estándar: medida → opciones → sticker → seguimiento | conv 18588 |
   | G02 | Aro «Rin 15» → opciones por aro → elige → cotiza | P03 |
   | G03 | Vehículo sin medida: opciones sí, cotización no | P04 / X01 / conv 13862 |
   | G04 | Pide A/T y hay stock: no se niega el tipo | P09 / M03 |
   | G05 | Pide cotizar con cantidad: sale, sin preguntar cantidad ni permiso | Q06 / Q02 |
   | G06 | «Ok» tras la oferta de cotizar: cotiza, no reofrece | Q03 / conv 11070 |
   | G07 | Rechaza un ancho y no se lo vuelven a ofrecer | O06 |
   | G08 | Pide 4 y hay 1 (stock forzado con `/api/stock`) | conv 11720 |
   | G09 | Local elegido sin día: se pregunta el día; «gracias» es acuse | V07 / conv 13909 |
   | G10 | Servicio fuera de catálogo: negativa con siguiente paso | E02 |
   | G11 | «Ya compré en otro lado»: despedida y el seguimiento no insiste | C01 / conv 4732 |
   | G12 | «Está caro» no es rechazo: alternativa | C05 / O01 |
   | G13 | Pago con tarjeta y ubicación: responde con links, sin mapas a mano | conv 16843 |
   | G14 | Retomada tras humano con cotización y stock corto | `stockCortoViaja.test.ts:298` |
   | G15 | Histórica real: tres cambios de medida y «No gracias» | H01 / conv 7946 |
   | G16 | Histórica real: local primero, presupuesto y rechazo | H03 / conv 8318 |

   Las históricas salen de
   `.claude/worktrees/keen-cerf-e06120/app/scripts/sim/datos/historicas-10.json`
   (única copia) y se **versionan** dentro del pool. Formato de escenario:
   `{ id, familia, titulo, fuente, preparar?, turnos: [{tipo, …}], jueces: [[nombre, fn]] }`.
   Los jueces se escriben sobre hechos de la base (cotizaciones, visita, ficha,
   alertas, herramientas) antes que sobre regex del texto.
3. **Comparador (R-02)** según la PARTE B: reusa `correrEscenario`,
   `snapshot` e `invariantesGlobales` de `lib/corredor-t115.mjs` (importar, no
   editar), más los tipos de turno de `lib/turnos.mjs`. Salida en
   `app/scripts/sim/pools/resultados/<fecha>-<pools>.json`, con transcripciones.
4. **Sombra histórica (R-03).** Contrato del detector que cada parte escribe:
   `export const regla = { numero, categorias: [...], detectar({ borrador, mensajesCliente, ultimoDelBot, ultimoDelCliente, hechos }) → { dispara, motivo } }`.
   Para validar la herramienta, S1 la corre con el detector de una regla que ya
   tiene candado (`sinPreguntasProhibidas` contra `pregunta_de_mas`) y deja el
   resultado en `docs/COMO-PROBAR-CAMBIOS.md`.
5. **Pool dirigido del nivel 1** (`parte-01-nivel1.mjs`): los tres temas que
   salieron de la rúbrica.
   - Número de cotización: con cotización real, ningún «COT-» llega al cliente,
     tampoco en retomada ni en seguimiento.
   - Stock corto: el aviso aparece una vez y no se duplica.
   - Despedida: en respuesta y retomada la contesta el candado; en seguimiento,
     el guardián con el bloque movido.
6. **Correr las compuertas.**
   - `general` dos veces contra `main` (tiene que quedar verde).
   - `comparar.mjs --pools general,parte-01-nivel1` base contra rama.
   - `contar-tokens-rubrica.mjs` base contra rama.
   - Suite completa, `sim:humo` y `simuladorFidelidad`.
7. **`docs/COMO-PROBAR-CAMBIOS.md`:** cómo correr cada herramienta, qué es una
   regresión, el formato del pool dirigido, los umbrales, costo y tiempo medidos
   de una corrida.
8. **Publicar** con el sí de Manuel (PARTE A, regla 3). A los 2 días, la revisión
   de R-05 y R-24.

**Costo esperado:** el pool general son ~16 conversaciones por lado con gpt-5.5,
del orden de $3–4 por lado. Hay que medirlo y anotarlo.

**Aceptación:**
- R-01: dos corridas verdes contra `main`, con archivo de resultados.
- R-02: la salida del comparador en el PR, más una regresión provocada a
  propósito (un juez roto adrede) que el comparador detecta con código 1.
- R-03: el resultado de la sombra histórica de prueba.
- R-04: `docs/COMO-PROBAR-CAMBIOS.md` y el pool de nivel 1.
- R-05: `/health` con el commit y la revisión de producción a los 2 días.

## SPRINT 2 — registrar todo el gasto (rama `feat/registro-completo-tokens`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 2 — registrar
> todo el gasto`**. Después pegá debajo la PARTE A y ejecutá.

**Arranca cuando:** S1 está publicado y su ventana salió limpia.

**Objetivo.** (R-06 a R-14) Que cada token que gasta el bot quede en `ai_runs`,
con su conversación, y que la factura lo cobre. **No ahorra nada y no cambia
nada para el cliente:** hace visible lo que hoy no se ve. Por eso va antes que
cualquier ahorro, porque sin esto las comparaciones siguientes miden con puntos
ciegos.

**Archivos permitidos:**
- `app/src/services/transcripcion.ts` (devolver el uso junto al texto)
- `app/src/index.ts` **solo** los dos lugares donde se transcribe y se llama a visión, para registrar con la conversación ya resuelta
- `app/src/services/vehicleFitmentResearch.ts` (parámetro opcional `audit`, uso y búsquedas web de cada llamada)
- `app/src/agent/tools.ts` **solo** las llamadas a `researchVehicleFitment` (pasar `audit`)
- `app/src/services/followUpCopy.ts` (parámetro opcional `audit`) y `app/src/services/followUpProcessor.ts` **solo** la llamada a `redactarSeguimiento`
- `app/src/services/linkPreview.ts` **solo** la llamada a `describirFotoDeLlanta`
- `app/src/services/guardian.ts` **solo** `revisarConGuardian`, `conTiempoMaximo` y `registrarFalloAbierto`
- `app/src/agent/agent.ts` **solo** la acumulación de `usage` y las llamadas a `logAiRun`
- `app/src/services/conversations.ts` **solo** `logAiRun`
- `app/src/db/schema.ts` **solo** columnas aditivas en `ai_runs` (`audio_seconds`, `web_search_calls`)
- `app/src/services/billing.ts`
- Tests nuevos: `app/test/registroCompletoTokens.test.ts`, `app/test/sinGastoACiegas.test.ts`
- `app/scripts/sim/pools/parte-02-registro.mjs`, `app/scripts/sim/estandar/conversacion-estandar.json` **solo** `cacheDeProduccion` si aparecen clases nuevas

**Prohibido:** `INSTRUCCIONES` y `armarContexto` en `guardian.ts`; `PASOS` en
`prepararSalida.ts`; prompts y decisiones del agente. Este sprint no cambia **qué**
se le pide a ningún modelo, solo **qué se anota**. Además, cualquier cambio en el
cliente de OpenAI queda afuera: la rama vieja
`claude/openai-token-migration-239468` toca esas líneas; si alguien la publica
antes, rebaseá.

**Pasos.**
1. **Prueba roja por punto ciego:** transcripción, investigación, copia de
   seguimiento, visión de link, guardián con JSON roto, guardián con tiempo
   agotado, turno con dos modelos, turno caído. Cada una afirma la fila en
   `ai_runs` con `call_type`, conversación y uso.
2. **Transcripción.** `transcribirAudio` devuelve `{ texto, uso }` y el llamador
   de `index.ts` registra cuando la conversación existe. Verificá contra la API
   qué trae `usage` para `gpt-4o-transcribe`: si trae tokens, se usan; si no, van
   los segundos. Documentá lo que encontraste.
3. **Guardián con tiempo agotado.** No se cancela: al promise original se le
   engancha un `.then` que registra el uso cuando llegue, marcado con `error`
   `tardio`. **Nunca** bloquea el mensaje.
4. **Vendedor.** Acumular el uso **por modelo** en un mapa y escribir una fila por
   modelo (`iterations` por modelo). En el camino de caída, registrar lo
   acumulado hasta ese punto (el acumulador vive fuera del `try`).
5. **`billing.ts`.** Tarifa por segundo de audio y por búsqueda web, cada una con
   su fuente citada (https://developers.openai.com/api/docs/pricing). La prueba
   cuadra el total del período con la suma por conversación.
6. **`sinGastoACiegas.test.ts`** (R-13), con su lista de excepciones justificadas.
7. **Pool dirigido `parte-02-registro`:** audio real (mandar un `.ogg` corto con
   `adjunto`), vehículo raro que fuerza investigación web, seguimiento con texto
   de IA, link con foto, y un turno que escala al rescate. Juez: cada llamada
   esperada tiene su fila.
8. **Compuertas:** pools `general,parte-02-registro` sin regresión; suite; humo.
   Después, la **nueva línea base** (R-14).

**Aceptación:**
- R-06 a R-13: pruebas verdes y filas vistas en el pool dirigido.
- R-14: línea `linea-base-registro-completo` en `historial.jsonl`, con la
  diferencia contra la medición del 12-sep explicada (cuánto gasto estaba oculto).
- A los 2 días en producción: `ai_runs` trae las clases nuevas, y el costo por
  conversación subió exactamente lo que estaba oculto. Nada más cambió.

## SPRINT 3 — reglas 12 y 15 (rama `perf/rubrica-reglas-12-15`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 3 — reglas 12 y
> 15`**. Después pegá debajo la PARTE A y ejecutá.

**Arranca cuando:** S2 está publicado y su ventana salió limpia.

**Objetivo.** (R-15, R-16) Sacar las dos reglas más seguras. La 12 nunca cambiaba
el mensaje. En la 15 el candado ya existe y el guardián falla. Dos commits
separados, para poder revertir uno sin el otro. Para el cliente no cambia nada.

**Archivos permitidos:**
- `app/src/services/guardian.ts` **solo** las reglas 12 y 15 de `INSTRUCCIONES` y el comentario de doctrina de arriba
- `app/src/services/prepararSalida.ts` **solo** un paso nuevo `estado_desincronizado`
- `app/src/domain/estadoDesincronizado.ts` (nuevo, con detector compatible con la sombra histórica)
- `app/src/domain/preguntasProhibidas.ts` (si las piezas de juicio de la 15 pasan al candado)
- `app/test/preguntasProhibidas.test.ts`, `app/test/estadoDesincronizado.test.ts` (nuevo)
- `app/test/rubricaAdelgazada.test.ts` **solo** un `describe` nuevo para las reglas 12 y 15
- `app/scripts/sim/pools/parte-03-reglas-12-15.mjs`, `app/scripts/guardian/detectores/regla-12.mjs`, `app/scripts/guardian/detectores/regla-15.mjs`

**Prohibido:** las demás reglas de `INSTRUCCIONES`; `armarContexto` (los HECHOS
de visita y local se escriben siempre: los necesita la alerta y, sin ellos, el
revisor borra datos); los otros pasos de `PASOS`.

**Pasos.**
1. **Sombra histórica de la 12** (`estado_desincronizado`, 60 días) con el
   detector nuevo. Si no llega al umbral, se ajusta el detector o la regla se
   queda, y la parte cierra solo con la 15.
2. **Decidir la mitad que corrige de la 12:** si queda, es una frase; si se va,
   hay que probar que otra regla la cubre. Escribí la decisión en el PR.
3. **Regla 15 entera.** Por cada pieza de juicio (mudo, `cotizacion_sin_eleccion`,
   aviso de cantidad grande), decidí dónde vive: candado, HECHO, o una frase en
   otra regla. Cada una lleva su prueba con su conversación real.
4. **Reemplazar** la prueba de `preguntasProhibidas.test.ts:120`, que fija texto
   exacto, por una de comportamiento.
5. **Pool dirigido:**
   - para la 12: bot confirma visita sin registrarla, cambio de local, cantidad
     dicha y no anotada;
   - para la 15: cliente elige y el borrador pide permiso; pregunta de solo
     precio (13615); recorte que deja mudo (13617); 9 llantas (exención); y la
     misma pregunta prohibida en un seguimiento.
6. **Compuertas** de la PARTE A, regla 8. `probar-rubrica.mjs` sin cambios en
   los 14 casos.

**Aceptación:** R-15 y R-16 con:
- la sombra histórica de la 12;
- el comparador sin regresiones;
- el conteo exacto (esperado: ~−210 de la 12 y ~−680 de la 15, en tokens reales).

## SPRINT 4 — ancho rechazado (rama `perf/rubrica-regla-20`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 4 — ancho
> rechazado`**. Después pegá debajo la PARTE A y ejecutá.

**Arranca cuando:** S3 está publicado y su ventana salió limpia.

**Objetivo.** (R-17) Que un ancho o perfil que el cliente rechazó no le vuelva a
llegar, garantizado por código y no por el guardián. Las búsquedas ya lo filtran
(`agent/tools.ts` ~937, ~1434, ~2301); falta el texto libre.

**Archivos permitidos:**
- `app/src/domain/restriccionesLlanta.ts` (función nueva que detecta medidas rechazadas en un texto)
- `app/src/services/prepararSalida.ts` **solo** un paso nuevo `sin_ancho_rechazado`
- `app/src/services/guardian.ts` **solo** la regla 20 de `INSTRUCCIONES`
- `app/test/restriccionesLlanta.test.ts`
- `app/test/rubricaAdelgazada.test.ts` **solo** un `describe` nuevo para la regla 20
- `app/scripts/sim/pools/parte-04-ancho-rechazado.mjs`, `app/scripts/guardian/detectores/regla-20.mjs`

**Prohibido:** `agent/tools.ts` (el filtro río arriba ya funciona: no se toca);
las demás reglas; `armarContexto` (el HECHO de restricciones se queda).

**Pasos.**
1. **Qué hace el candado al detectar:** quita la oración que ofrece la medida
   rechazada **solo si queda otra opción válida en el mensaje**. Si no queda
   ninguna, reemplaza por la pregunta de qué medida busca y abre alerta. Nunca
   deja el mensaje mudo (prueba).
2. **Posición:** después de `angel_guardian` y de `guardian_no_vende_solo`, en
   las 3 puertas (prueba sobre `PASOS`).
3. **Sombra histórica** de la 20, 60 días.
4. **Pool dirigido:** «no quiero 205» y después pide opciones; rechaza un perfil
   («nada de 65»); rechaza y después vuelve a pedir esa misma medida (el cliente
   cambió de idea: **no** se bloquea); rechazo en un turno y seguimiento que
   recuerda opciones; medida rechazada dentro de una comparación.
5. **Compuertas** de la regla 8.

**Aceptación:** R-17 con:
- la sombra histórica;
- el comparador;
- el conteo exacto (~−210 tokens reales);
- la prueba de «cambió de idea».

## SPRINT 5 — oferta ya aceptada (rama `perf/rubrica-regla-19`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 5 — oferta ya
> aceptada`**. Después pegá debajo la PARTE A y ejecutá.

**Arranca cuando:** S4 está publicado y su ventana salió limpia.

**Objetivo.** (R-18) Que al cliente que ya dijo que sí no se le vuelva a ofrecer
lo mismo, garantizado por código, sin romper el caso en que «gracias» es solo un
acuse.

**Archivos permitidos:**
- `app/src/domain/ofertaAceptada.ts` (detector de reofrecimiento en el texto)
- `app/src/services/prepararSalida.ts` **solo** un paso nuevo `sin_reofrecer_lo_aceptado`
- `app/src/services/guardian.ts` **solo** la regla 19 de `INSTRUCCIONES`
- `app/test/ofertaAceptada.test.ts`
- `app/test/rubricaAdelgazada.test.ts` **solo** un `describe` nuevo para la regla 19
- `app/scripts/sim/pools/parte-05-oferta-aceptada.mjs`, `app/scripts/guardian/detectores/regla-19.mjs`

**Prohibido:** `agent/agent.ts` (usa `ofertaDeCotizarAceptada` para decidir; no
se toca esa decisión); las demás reglas; `armarContexto`.

**Pasos.**
1. **Excepción primero, como prueba roja:** con «DÍA DE VISITA PENDIENTE», un
   «gracias» no es un sí y preguntar el día **no** se toca (conv 13909).
2. **Qué hace el candado:** quita la oferta repetida («si desea, le dejo la
   cotización formal», «¿quiere que se la cotice?»). Si con eso el mensaje queda
   sin siguiente paso, deja el que corresponde y abre alerta.
3. **`cierre_sin_pregunta_dia`** (la segunda categoría de la regla): decidí si
   queda como frase o pasa a candado, con su prueba.
4. **Sombra histórica** de la 19.
5. **Pool dirigido:** conv 11070; «Ok» después de opciones; «dele pue»;
   «gracias» con día pendiente; «gracias» después de un servicio no relacionado
   (no es aceptar); aceptación en retomada tras humano.
6. **Compuertas** de la regla 8.

**Aceptación:** R-18 con:
- la sombra histórica;
- el comparador;
- el conteo exacto (~−270 tokens reales);
- la prueba de la excepción.

## SPRINT 6 — tipo de llanta (rama `perf/rubrica-regla-21`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 6 — tipo de
> llanta`**. Después pegá debajo la PARTE A y ejecutá.

**Arranca cuando:** S5 está publicado y su ventana salió limpia.

**Objetivo.** (R-19) Que el tipo de llanta que dice el bot (A/T, H/T, M/T) salga
siempre del catálogo, sin que el bot «venda por su cuenta».

**Archivos permitidos:**
- `app/src/domain/tipoDelCatalogo.ts` (nuevo)
- `app/src/domain/guardianNoVendeSolo.ts` (solo si la decisión del paso 1 lo exige)
- `app/src/services/prepararSalida.ts` **solo** el paso nuevo `tipo_desde_catalogo` y, si la decisión lo exige, `guardian_no_vende_solo`
- `app/src/services/guardian.ts` **solo** la regla 21 y la EXCEPCIÓN a la regla 0 de `INSTRUCCIONES`
- `app/test/tipoDelCatalogo.test.ts` (nuevo), `app/test/guardianNoVendeSolo.test.ts`
- `app/test/rubricaAdelgazada.test.ts` **solo** un `describe` nuevo para la regla 21
- `app/scripts/sim/pools/parte-06-tipo-llanta.mjs`, `app/scripts/guardian/detectores/regla-21.mjs`

**Prohibido:** `domain/tireTypes.ts` (se usa, no se cambia); `agent/tools.ts`; las
demás reglas.

**Pasos.**
1. **Medir antes de diseñar.** En producción (solo lectura), las alertas
   `guardian_hecho_nuevo_bloqueado` de 30 días en las que el producto frenado es
   del tipo que pidió el cliente. Si la excepción de la regla 0 está muerta en la
   práctica, se escribe y se decide: el candado solo **corrige el tipo mal dicho**
   y no agrega productos. Si está viva, el candado replica esa única excepción.
2. **Detector:** tipos nombrados en el texto contra `tipoDeProducto` de los
   productos mencionados (`productosDelCatalogoMencionados`). Solo corrige la
   etiqueta del tipo o quita la negación falsa («no tenemos A/T» con A/T en
   stock), y abre alerta.
3. **Sombra histórica** de la 21 (`tipo_negado_con_stock` y la categoría del tipo mal dicho).
4. **Pool dirigido:** conv 13645 y 13645 bis; A/T pedida con A/T en stock; H/T
   disfrazada de A/T; M/T con una sola opción; tipo pedido sin stock (la negación
   es verdadera y **no** se toca).
5. **Compuertas** de la regla 8. `probar-rubrica.mjs` con los casos 13645 y
   CONTROL 3 sin cambios.

**Aceptación:** R-19 con:
- la medición del paso 1;
- la sombra histórica;
- el comparador;
- el conteo exacto (~−350 tokens reales).

## SPRINT 7 — sin medida confirmada (rama `perf/rubrica-regla-22`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 7 — sin medida
> confirmada`**. Después pegá debajo la PARTE A y ejecutá.

**Arranca cuando:** S6 está publicado y su ventana salió limpia.

**Objetivo.** (R-20, R-21) Que la regla más delicada deje de cobrarse en todas
las llamadas sin perder su juicio: su texto viaja **solo** cuando la situación
existe. Y dejar escrita la decisión de que la 11 se queda.

**Archivos permitidos:**
- `app/src/services/guardian.ts` **solo** la regla 22 de `INSTRUCCIONES` y, en `armarContexto`, el bloque nuevo `REGLA_22_A_DEMANDA` que se agrega después de los HECHOS de medida
- `app/test/reglaADemanda.test.ts` (nuevo)
- `app/test/rubricaAdelgazada.test.ts` **solo** un `describe` nuevo para la regla 22
- `app/scripts/sim/pools/parte-07-sin-medida.mjs`
- `docs/PLAN-ADELGAZAR-GUARDIAN.md` **solo** la justificación de la regla 11

**Prohibido:** `domain/medidaConfirmada.ts` y `domain/medidaPedida.ts` (se usan,
no se cambian); el candado de medida de `generar_cotizacion` en `agent/tools.ts`;
las demás reglas.

**Pasos.**
1. **Medir** en producción qué % de llamadas del guardián traen «MEDIDA NO
   CONFIRMADA» o «ARO DADO». Con eso sale el ahorro esperado (tokens × % de
   llamadas **sin** el hecho).
2. **Mover el texto, sin reescribirlo.** El mismo texto de la regla pasa al
   bloque a demanda. Prueba: sin el hecho, el bloque no está; con cada hecho, sí.
3. **Pool dirigido:**
   - Suzuki SZ 2016, vehículo sin medida (conv 13862);
   - «rin 14» → elige una opción (conv 3): **sí** cotiza;
   - Qashqai rin 17 con varias medidas en pantalla (conv 18684): confirma la medida;
   - media medida en pulgadas (MT 30.5 R15);
   - medida escrita después de haber dado el vehículo.
4. **Compuertas** de la regla 8 (en esta parte, la «sombra» es el pool más
   `probar-rubrica.mjs` caso 13862, porque la regla no se borra: cambia de lugar).
5. **Regla 11:** justificación escrita (R-21), con una sombra histórica
   exploratoria si el detector es barato de escribir.

**Aceptación:** R-20 con:
- el % medido;
- el conteo exacto con y sin el hecho;
- el comparador sin regresiones.

R-21 con el texto en el plan.

## SPRINT 8 — contexto al caché (rama `perf/guardian-cache`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 8 — contexto al
> caché`**. Después pegá debajo la PARTE A y ejecutá.

**Arranca cuando:** S7 está publicado y su ventana salió limpia.

**Objetivo.** (R-22) Que la parte fija de lo que lee el guardián se cobre a
precio de caché: es la palanca más grande que queda (~1.600 tokens a $5/M por
llamada). El guardián tiene que leer lo mismo, en otro orden.

**Archivos permitidos:**
- `app/src/services/guardian.ts` **solo** el orden de `armarContexto` y los parámetros de caché de la llamada en `revisarConGuardian`
- `app/test/ordenDelContextoGuardian.test.ts` (nuevo: lo fijo va antes que lo variable y ningún HECHO se pierde)
- `app/scripts/guardian/experimento-cache.mjs` (nuevo), `app/scripts/guardian/contar-tokens-rubrica.mjs` (contar también el prefijo fijo)
- `app/scripts/sim/pools/parte-08-cache.mjs`
- `docs/COMO-MEDIR-TOKENS.md` **solo** la sección 2 (lo que el experimento explique)

**Prohibido:** el texto de `INSTRUCCIONES` (este sprint no cambia qué se dice,
solo el orden); `PASOS`; el vendedor.

**Pasos.**
1. **Experimento** (`experimento-cache.mjs`, clave de pruebas): la misma petición
   dos veces seguidas, y después variando una sección por vez. Tiene que
   explicar por qué producción cachea 4.864 tokens y no los ~5.100 de la rúbrica,
   y dónde se corta el prefijo común. Sin explicación, no se reordena a ciegas.
2. **Clasificar cada línea de `armarContexto`** en fija, fija por día o
   variable. Verificá si `catalogoHoy` depende de la medida pedida.
3. **Reordenar:** lo fijo, justo después de la rúbrica; lo variable, al final;
   el borrador, último. Agregar `prompt_cache_retention: "24h"` y
   `prompt_cache_key` si el experimento muestra que sirven.
4. **La calidad puede moverse por el orden** (el modelo lee distinto). Por eso:
   `probar-rubrica.mjs` 3 corridas en base y en rama, los 14 casos con el mismo
   veredicto; pool general y dirigido. El dirigido lleva casos donde un HECHO del
   final decide: despedida, stock que no alcanza, cotización desalineada, ahorro.
5. **Medir:** parte cacheada por llamada en el pool y, a los 2 días, en producción.

**Aceptación:** R-22 con:
- el experimento explicado;
- `probar-rubrica` 3 de 3 igual;
- el comparador sin regresiones;
- la cacheada por llamada en producción, antes y después.

## SPRINT 9 — salida del guardián (rama `perf/guardian-salida`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 9 — salida del
> guardián`**. Después pegá debajo la PARTE A y ejecutá.

**Arranca cuando:** S8 está publicado y su ventana salió limpia.

**Objetivo.** (R-23) Que el guardián escriba menos (la salida cuesta $30/M) sin
cambiar ni un veredicto.

**Archivos permitidos:**
- `app/src/services/guardian.ts` **solo** `ESQUEMA_SALIDA`, las descripciones de sus campos y los parámetros de la llamada en `revisarConGuardian`
- `app/src/services/aiRequestPolicy.ts` **solo** el esfuerzo de razonamiento del guardián
- `app/scripts/guardian/probar-rubrica.mjs` (repeticiones y comparación de salida)
- `app/test/guardianSalida.test.ts` (nuevo)
- `app/scripts/sim/pools/parte-09-salida.mjs`

**Prohibido:** `INSTRUCCIONES` (salvo que una palanca lo exija; entonces se
consulta primero); `aplicarVeredicto` (la red de seguridad no se toca); `PASOS`.

**Pasos.**
1. **Medir** con el registro de S2: razonamiento contra texto visible por
   llamada, en `aprobar` y en `corregir`.
2. **Una palanca por vez**, cada una con `probar-rubrica` × 3 y el pool dirigido:
   - (a) `detalle` en una frase;
   - (b) no reescribir cuando la única categoría la arregla un candado posterior
     (lista cerrada, sacada de `PASOS`);
   - (c) el esfuerzo de razonamiento.

   Palanca que cambia un veredicto, afuera.
3. **Pool dirigido:** los 14 casos de `probar-rubrica` llevados al simulador
   donde se pueda, más una corrección larga (varios hallazgos) y una aprobación
   limpia.
4. **Compuertas** de la regla 8.

**Aceptación:** R-23 con:
- la tabla de palancas (tokens ahorrados y veredictos iguales);
- el comparador sin regresiones;
- la salida por llamada en producción a los 2 días.

## SPRINT FINAL — medición y cierre (rama `docs/cierre-menos-tokens`, para el modelo más fuerte)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint Final — medición
> y cierre`**. Debajo pegá la PARTE A y ejecutá. Se corre cuando S9 está
> publicado y su ventana salió limpia.

Este sprint **no lleva número** y no implementa: revisa que todo lo publicado
cumple la PARTE B, mide el total y cierra. Como las partes se mergearon y
publicaron de a una, **no hay merge pendiente**; si alguna parte se revirtió o
se saltó, se reporta como ❌ con su motivo.

**Pasos.**
1. **Inventario:** PR, commit en `main`, fecha de publicación y revisión de
   producción de cada parte (tabla de `docs/PLAN-ADELGAZAR-GUARDIAN.md`).
2. **Revisión en paralelo, una lente por agente**, sobre el diff acumulado desde
   `32df6f3`:
   - calidad: pool general completo 2 veces contra la línea base de S2;
   - candados: cada paso nuevo en sus puertas y en orden (pruebas sobre `PASOS`);
   - registro: consulta de producción que busca llamadas sin fila (R-13 en vivo);
   - simplificación: detectores duplicados, pasos que se pisan.
3. **Medición final** contra `linea-base-registro-completo` (R-14):
   - conversación estándar 3 + 1;
   - conteo exacto de la rúbrica;
   - producción 7 días, por llamada del guardián y por conversación.
4. **Informe** (bitácora y `docs/PLAN-ADELGAZAR-GUARDIAN.md`): tabla R-01…R-25
   con ✅/⚠️/❌ y evidencia; ahorro total medido contra el estimado; lo que quedó
   pendiente.
5. **Docs y memoria al día.** Si algo de este cierre se tiene que publicar, pasa
   por el sí de Manuel.

**Criterio de éxito.** Misma calidad: cero regresiones confirmadas en el pool
general contra la línea base. Menos tokens, medido en producción. Todo el gasto
registrado.

## Qué hace cada sprint

| Sprint | Rama | Qué entrega | Pedidos |
|---|---|---|---|
| **S1 — banco de pruebas** | `test/banco-de-pruebas` | Un pool de 16 conversaciones de todo tipo, un comparador main contra cambio, la sombra histórica sobre borradores reales, y el nivel 1 publicado con esa vara | P-01, P-05, P-08, P-09 |
| **S2 — registrar todo el gasto** | `feat/registro-completo-tokens` | Audio, búsqueda de vehículos, texto de seguimiento, visión de links y fallos del guardián quedan anotados por conversación y cobrados; nueva línea base honesta | P-06, P-09 |
| **S3 — reglas 12 y 15** | `perf/rubrica-reglas-12-15` | El estado desincronizado pasa a alerta de código; las preguntas prohibidas las garantiza el candado solo | P-02, P-05 |
| **S4 — ancho rechazado** | `perf/rubrica-regla-20` | El ancho que el cliente rechazó no vuelve, garantizado por código | P-02, P-05 |
| **S5 — oferta ya aceptada** | `perf/rubrica-regla-19` | Al que dijo que sí no se le reofrece, sin romper el «gracias» que es acuse | P-02, P-05 |
| **S6 — tipo de llanta** | `perf/rubrica-regla-21` | El tipo A/T, H/T o M/T sale siempre del catálogo, sin que el bot venda por su cuenta | P-02, P-05 |
| **S7 — sin medida confirmada** | `perf/rubrica-regla-22` | La regla de «sin medida no hay cotización» se paga solo cuando aplica; la 11 se queda, justificada | P-02, P-05 |
| **S8 — contexto al caché** | `perf/guardian-cache` | Lo que el guardián lee fijo se cobra 10 veces más barato; mismo contenido, otro orden | P-03, P-05, P-09 |
| **S9 — salida del guardián** | `perf/guardian-salida` | El guardián escribe menos sin cambiar veredictos | P-04, P-05, P-09 |
| **Sprint Final — medición y cierre** (modelo más fuerte) | informe; sin merge pendiente | Revisa todo contra R-01…R-25, mide el total contra la línea base y deja el informe ✅/⚠️/❌ | P-07 + verificación |

## Apéndice — Por qué en secuencia, y archivos calientes

Todas las partes son en fila, por dos razones:
- los archivos se comparten (tabla de abajo);
- cada medición necesita la anterior publicada.

| Archivo | Partes que lo tocan (en orden) |
|---|---|
| `app/src/services/guardian.ts` | S2 (registro), S3, S4, S5, S6, S7 (reglas), S8 (orden y caché), S9 (salida) |
| `app/src/services/prepararSalida.ts` | S3, S4, S5, S6 (un paso nuevo cada una) |
| `app/test/rubricaAdelgazada.test.ts` | S3, S4, S5, S6, S7 |
| `app/src/agent/agent.ts` | S2 (solo registro) |
| `app/scripts/sim/pools/**` | S1 crea el banco; cada parte agrega su pool dirigido |

**Ramas ajenas que tocan estos archivos:**
- `claude/openai-token-migration-239468`: `agent.ts`, `billing.ts`, `guardian.ts`
  y el cliente de OpenAI; 10 días sin merge.
- `fix/rin15-reply-context`: `agent.ts`, `conversations.ts`; 12 días sin merge.

Si alguna se publica, la parte que siga rebasea sobre ella antes de empezar.

**Presupuesto de pruebas (clave de pruebas, estimado; S1 lo mide):**
- por parte: ~$8–10 (pool general en dos simuladores más el dirigido);
- todo el plan: ~$80–100.
