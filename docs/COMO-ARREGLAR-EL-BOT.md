# Cómo se arregla un error del bot

Esto no es una lista de buenas intenciones: es el orden que, cuando se saltó,
costó volver a arreglar el mismo error tres veces. Vale para vos y para
cualquier sesión de Claude Code que trabaje acá.

La idea de fondo: **los errores del bot no son incidentes, son familias.** El
`265` de la medida, el `5` del modelo del auto, el `3` de las marcas y el `5`
de la hora eran EL MISMO error encontrado cuatro veces, y las cuatro veces se
parchó como si fuera nuevo. Mientras se arregle por incidente, la lista no se
va a terminar nunca.

---

## El lazo, en seis pasos

### 1. Salir a buscar los errores, no esperarlos

Los errores que llegan por captura de WhatsApp son los que un humano vio. Los
que pierden plata son los que nadie miró.

```bash
cd app && node scripts/auditoria/extraer.mjs
```

Una vez por semana, sobre las últimas ~50 conversaciones. La auditoría del
27-ago (1.168 mensajes) encontró cinco fallas de un saque; ninguna había sido
reportada.

**Lo que la auditoría produce no es una lista de bugs: es una lista de
familias.** Antes de tocar código, cada hallazgo se escribe así:

> *No es* «en la conv 11366 cotizó 5 llantas para un Arrizo 5».
> *Es* «un número que cuenta OTRA COSA entra por el extractor y se propaga
> hasta el chat sin que nada lo frene».

Si no podés escribir la segunda versión, todavía no entendiste el error.

### 2. Reproducirlo en el simulador ANTES de tocar nada

```bash
cd app && npm run sim        # → http://localhost:3210
```

Lanzalo con `run_in_background: true` de la tool Bash — `nohup ... &` no
sobrevive al cierre del shell. Y si los puertos 3210/4720/4721 están ocupados
por una instancia vieja, la nueva se cae y terminás hablando con el build
anterior sin enterarte: matá por puerto, `dropdb autoventa_sim`, y confirmá en
el log desde qué carpeta arrancó.

Regla: **si no lo pudiste reproducir, no lo podés dar por arreglado.**

### 3. Escribir la prueba que falla — y verla fallar

Este es el paso que más veces se saltó y el que más caro salió.

- La prueba de `cantidadGrandePedida` usaba «busco 205/55R16», y `busco` no
  está en la lista de verbos del detector: pasaba en verde **sin ejercitar
  nada**.
- Dos pruebas de `salesIntent.test.ts` modelaban con ESPACIO el agrupado de
  mensajes que `pipeline/inbound.ts:102` hace con `\n`. Esa inexactitud era
  justo la grieta por donde entraba el bug.

Una prueba que no falla antes del arreglo no prueba el arreglo. **Correla en
rojo primero, siempre.**

### 4. Elegir la capa correcta (acá se decide si el error vuelve)

Tres lugares donde se puede poner una regla, y no son intercambiables:

| Capa | Sirve para | No sirve para |
|---|---|---|
| **Prompt** (`prompts.ts` **y** `compactPlaybook.ts`) | tono, criterio, cosas que exigen entender la conversación | nada que tenga que ser cierto sí o sí |
| **Ángel Guardián** (rúbrica) | lo que hay que juzgar leyendo el hilo | listas cerradas, números, formatos |
| **Candado determinístico** (después del guardián) | todo lo que no puede fallar nunca | criterio |

**El guardián es la ÚLTIMA mano que toca el texto y rompe lo que se le pide por
prompt.** Escribió los `COT-` que había que quitar. Borró la cifra del descuento
porque no la tenía en sus hechos duros. Y ante «¿Cuántas llantas necesita?» marcó
la falta en ALTA y su propia corrección terminó con «¿Cuántas llantas desea
llevar?», en los dos borradores.

Dos corolarios que se pagan caro si se olvidan:

- Lo que tiene que ser cierto va en un candado **después** del guardián
  (`domain/numerosDeCotizacion.ts`, `domain/preguntasProhibidas.ts`,
  `services/stockCorto.ts`).
- **Todo dato que el guardián deba dejar pasar tiene que estar en sus HECHOS,
  o lo borra.**

### 5. Arreglar en la fuente única, no en la puerta

Antes de escribir el fix, la pregunta obligatoria: **¿cuántos lugares hacen
esto?**

- «Qué medidas se pueden cotizar» tiene un solo dueño: `services/medidasDelPedido.ts`.
  Existe porque el candado miraba todo el ciclo y el guardián solo 16 mensajes,
  y por esa grieta se firmó una 265/65R17 a alguien que compraba 235/70R15.
- El orden de salida tiene un solo dueño: `services/prepararSalida.ts`, con su
  array `PASOS`.

Y **hay cuatro puertas de salida al cliente**. Un cambio de texto o de candado
tiene que revisarse en las cuatro, no solo en la que reprodujo el bug:

| Puerta | Archivo |
|---|---|
| turno normal | `index.ts` |
| retomada tras humano | `resumeBot.ts` |
| seguimiento | `followUpProcessor.ts` |
| `/restart` | `index.ts:498` (constante propia) |

Decisión tomada: **la puerta `retomada` SÍ paga el Ángel Guardián** — mismo
`runAgent`, mismos errores posibles.

Si el fix aparece dos veces, no es un fix: es la próxima familia de errores.

### 6. Verificar de verdad, en este orden

```bash
cd app && npx vitest run test/<el-que-escribiste>.test.ts   # el caso, en verde
cd app && npm test                                          # la suite entera
cd app && npm run sim:humo                                  # el simulador vive (0 tokens)
cd app && npx vitest run test/simuladorFidelidad.test.ts    # sigue fiel a producción
```

La de fidelidad falla si agregaste una tabla de configuración o una variable de
entorno que el simulador no sabe copiar. **No la silencies**: clasificá lo nuevo
en `scripts/sim/lib/tablas.mjs` o `lib/entorno-prod.mjs`. Un simulador
desactualizado sigue contestando — solo que contesta como otro bot, y lo que
pruebes ahí deja de decir algo del que atiende clientes.

Para cambios que tocan la conversación entera, además:

```bash
cd app && npm run test:calidad     # replay del historial REAL contra el bot de hoy
```

Y para publicar: push a `main` sale a **los dos** entornos. El deploy se
confirma leyendo `version.commit` en `/health` de cada servicio, no mirando
Railway.

---

## Lo que hay que decirle a Claude

Tres formas, según el tamaño.

### Un error concreto (lo más común)

Invocá la skill y pegá la evidencia cruda:

```
/probar-en-simulador
[captura o pedazo de conversación real]
La conv NNNNN: el cliente dijo X y el bot contestó Y.
```

Esa skill ya obliga a reproducir → prueba en rojo → arreglar → verificar, y
cierra con antes/después. Lo que **vos** tenés que agregar en el mensaje:

- **el número de conversación** (sin eso trabaja sobre una reconstrucción);
- **qué esperabas que dijera**, textual si lo tenés;
- **la familia**, si ya la ves: «esto es otra vez un número que significa otra cosa».

### Un pedido grande y desordenado (varios bugs + features)

```
/master-sprints
[el brain-dump entero]
```

Parte en sprints paralelos que no comparten archivos, cada uno un prompt
autocontenido para una sesión nueva, más un sprint final que revisa contra la
lista maestra, mergea y verifica en vivo. Es lo que se usó el 25 y el 27 de
agosto; los dos sprints del 27 no compartían un solo archivo.

### Juntar trabajo de varios chats y publicarlo

```
/integrar-y-publicar
```

Comprueba uno por uno que cada cambio hace lo que dice (con una prueba que
falle sin él) antes de mergear.

### Frases que conviene incluir siempre

Estas tres cambian el resultado, medido:

1. **«No es un incidente, buscá la familia: ¿qué clase de entrada causa esto?»**
2. **«Escribí la prueba, corrémela en rojo, y pegame la salida del fallo antes de arreglar.»**
3. **«¿Esto va en prompt, en el guardián o en un candado? Justificá.»**

Y una cuarta si el cambio toca lo que ve el cliente:

4. **«Revisá las cuatro puertas de salida, no solo la que reprodujo el bug.»**

---

## Trampas conocidas (no volver a caer)

- **`/ultrareview` da falsos positivos por bundle incompleto.** Reportó como
  bloqueante que `domain/reinicio.ts` no existía; estaba commiteado y `tsc
  --noEmit` en worktree limpio salió 0. Ante un hallazgo del tipo «el archivo no
  existe»: `git ls-tree` + compilar la rama en worktree aparte antes de actuar.
- **Prompt compacto encendido en producción**: toda regla se edita en
  `prompts.ts` **y** en `compactPlaybook.ts`. Editar uno solo es un cambio que
  no pasa nada.
- **`app/.env` local está desactualizado** respecto a Railway. La verdad de los
  modelos está en el servicio, no en el archivo.
- **El simulador exige clave propia** en `app/.env.sim`. Si usás la del bot, los
  tokens de prueba se los cobrás a Depot.
- **Un test verde no es un test que ejercita.** Ver paso 3.

---

## Y lo que este lazo NO arregla

Todo lo de arriba baja la tasa de errores. No mueve la aguja del negocio, que
está en otro lado: **solo 36 de 1.205 conversaciones llegan a tener día
acordado.** Quien se compromete cumple —de 7 que prometieron día, 6 fueron ese
mismo día—, así que el cuello no es la promesa incumplida: es que el bot pierde
a la gente ANTES del compromiso.

Arreglar bugs es mantenimiento. La palanca está en el embudo. Que la lista de
bugs esté corta no significa que el producto esté funcionando.
