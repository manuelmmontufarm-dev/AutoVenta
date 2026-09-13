# Adelgazar al Ángel Guardián sin devolverle errores al cliente

> Medido el 12-sep-2026 contra producción (30 días, 5.740 corridas del guardián).
> Este plan NO es una optimización de estilo: el guardián es el 55 % de la
> factura de IA y su rúbrica cuadruplicó de tamaño en cinco semanas.

## El diagnóstico, con números

La rúbrica del guardián ([`guardian.ts`](../app/src/services/guardian.ts), la
constante `INSTRUCCIONES`) pesa ~4.900 tokens y se manda **en cada corrida**.

| Semana | Tokens de entrada por corrida | Caché |
|---|---|---|
| 10-ago | 1.388 | 0 % |
| 17-ago | 1.750 | 0,1 % |
| 24-ago | 2.763 | 31 % |
| 31-ago | 6.064 | 74 % |
| 7-sep | 6.505 | 75 % |

El costo por conversación no explotó **solo porque el caché entró a tiempo**.
Ese caché es lo único que sostiene el número de hoy, y es frágil: cada edición
de la rúbrica lo invalida.

Costo por conversación hoy: **$0,140**, de los cuales el guardián es **$0,079**.

## La tesis

La rúbrica se volvió el basurero de las reglas: cada error nuevo se resolvió
agregándole un párrafo, porque era más fácil que ponerlo en su capa. Parte de
lo que cobra ya **está implementado río abajo en código**, en los 21 candados
deterministas de [`prepararSalida.ts`](../app/src/services/prepararSalida.ts).

El orden importa y es la razón de todo esto: **el guardián corre en el paso 3
de 24 y los candados corren después**. Cuando un candado ya hace el trabajo, lo
que el guardián escribió se descarta. Son tokens que se pagan para producir
texto que se tira.

`docs/COMO-ARREGLAR-EL-BOT.md` ya dice cuál es la capa de cada cosa. Este plan
solo la aplica hacia atrás, a lo que quedó mal puesto.

## Nivel 1 — HECHO (12-sep-2026)

Solo lo que quedó **probado redundante**: el candado corre después, en las
mismas puertas, con el mismo predicado, y ya tiene pruebas que lo sostienen.

| Regla | Tokens | Candado que la hace innecesaria | Prueba |
|---|---|---|---|
| 14 — números de cotización | 116 | `sin_numeros_de_cotizacion` → `sinNumerosDeCotizacion`, regex puro, corre en las 3 puertas | `test/numerosDeCotizacion.test.ts` (nueva) |
| 10 — aviso de stock corto | 206 | `aviso_de_stock` → `recordatorioQueFalta`, 3 puertas, mismo predicado `faltanteDeLaCotizacionVigente` que produce el HECHO | `test/stockCortoViaja.test.ts` (ya existía) |
| 18 — al que se despidió no se le insiste | 188 | `despedida_de_venta_perdida` → `despedidaQueCorresponde`, **la misma función** que calcula el HECHO; reemplaza el borrador entero y marca `salidaTerminal` | `test/cierrePerdido.test.ts` (ya existía) |

Las reglas 10 y 14 se **borran**. La 18 se **mueve** al bloque de seguimiento,
no se borra: su candado corre en `respuesta` y `retomada` pero **no en
`seguimiento`**, y el guardián sí revisa seguimientos (19,5 % de sus corridas).
Borrarla dejaría ese camino sin nadie.

Por qué la 10 es exactamente el candado y no un parecido: `recordatorioQueFalta`
cubre los dos modos de equivocarse que la regla enumera — no pega el aviso si el
borrador no afirma la cotización (`afirmaLaCotizacion`), y no lo duplica si ya
lo trae (`yaAvisaDelStock`) — y agrega el dato sin cambiar la cantidad cotizada.

Por qué la 18: el HECHO «EL CLIENTE SE DESPIDIÓ» se calcula en
`guardian.ts:561` con `despedidaQueCorresponde(ultimoDelCliente)`, la misma
función que el paso `despedida_de_venta_perdida` usa para **reemplazar el texto
completo**. Lo que el guardián redacte bajo esa regla nunca llega al cliente.

**Ahorro medido de la rúbrica:** 322 tokens en el 100 % de las corridas más 188
en el 80,5 % → ~473 tokens de 4.900, un **9,7 % de la rúbrica** y un **3,1 %
del costo por conversación** ($0,140 → $0,136).

Es poco a propósito. El valor del nivel 1 no es el ahorro: es dejar montado el
método y comprobar que los candados aguantan el borrador crudo, que es la
pregunta que decide si los niveles 2 y 3 son viables.

### Lo que se descartó al verificar

Cuatro reglas que parecían cubiertas y **no lo están**. Quedan donde están:

| Regla | Por qué NO se toca |
|---|---|
| 3 — re-preguntas (89 tk) | `sin_pregunta_repetida_en_el_turno` solo deduplica dos preguntas **de la misma clase en un mismo turno** (local/día). La regla habla de preguntar algo que el cliente ya respondió antes en la conversación. No es lo mismo. |
| 6 — repetición (21 tk) | `sin_calco_reciente` exige texto **idéntico** contra mensajes ya enviados; la regla atrapa el parafraseo. Y son 21 tokens. |
| 15 — preguntas prohibidas (633 tk) | La enumeración sí está cubierta por `sinPreguntasProhibidas` (3 puertas), pero la regla además carga el «el mensaje no puede quedar mudo», la categoría `cotizacion_sin_eleccion` y la exención del aviso de cantidad grande, que son juicio. Y `test/preguntasProhibidas.test.ts:120` fija parte de su texto. Cirugía aparte → nivel 2. |
| 16 — cierre en dos mensajes (106 tk) | La parte de formato la hace `estructura_del_turno`, pero ese paso corre **solo en `respuesta`**. En `retomada` y `seguimiento` no hay nadie. |

## Nivel 2 — PENDIENTE

Reglas que necesitan un cambio chico, con el molde ya existente.

| Regla | Tokens | Qué hacer |
|---|---|---|
| 12 — estado desincronizado | 197 | La regla **dice textualmente** «repórtalo y APRUEBA el texto tal cual». Es una regla de detección viviendo en un prompt de reescritura: paga tokens en cada llamada para producir un hallazgo que no cambia el mensaje. Convertirla en alerta (`createBotAlert`) y sacarla de la rúbrica. |
| 21 — el tipo de llanta sale del catálogo | 326 | Es una comparación contra el `CATÁLOGO DE HOY` (el tipo viene entre corchetes en cada fila). Candado nuevo en `domain/`, con el molde de `tireTypes.ts` / `restriccionesLlanta.ts`. |
| 15 — recorte de la enumeración | ~250 | Quitar de la rúbrica la lista cerrada de preguntas prohibidas (la cubre el candado en las 3 puertas) y **conservar** el «no puede quedar mudo» y la exención del aviso de cantidad grande. Ajustar `test/preguntasProhibidas.test.ts:120`. |

Ahorro estimado: $0,136 → $0,115 por conversación.

Antes de tocar la 15, leer la cabecera de
[`preguntasProhibidas.ts`](../app/src/domain/preguntasProhibidas.ts): documenta
que el guardián falló **3 de 3** con esta familia en el simulador (marcó la
falta en ALTA y su propia corrección volvió a preguntar). Esa regla no está
funcionando hoy; el candado es el que sostiene la política.

## Nivel 3 — PENDIENTE

Candados nuevos de verdad. Medio día a un día cada uno, y la regla 22 es la más
delicada porque toca las cuatro puertas de salida.

| Regla | Tokens | Hallazgos/mes | Candado a escribir |
|---|---|---|---|
| 22 — sin medida no hay cotización | 611 | 33 | Estado (`MEDIDA NO CONFIRMADA` vs `ARO DADO`) + detección de anuncio de cotización. Base: `medidaConfirmada.ts`, `medidaPedida.ts` |
| 19 — reofrece lo aceptado | 248 | 18 | `ofertaAceptada.ts` ya existe y **no tiene paso en `PASOS`** |
| 20 — el ancho rechazado | 193 | 28 | `restriccionesLlanta.ts` ya existe, mismo caso |
| 11 — negativa específica con alternativa | 237 | — | Necesita la huella de herramientas del turno |

Ahorro estimado: $0,115 → $0,085 por conversación.

## La otra palanca, sin tocar ninguna regla

El **36 % del costo del guardián es salida**, no entrada: cuando corrige
reescribe el mensaje completo (185 tokens promedio, a $30 por millón). Para las
categorías que un candado va a arreglar igual, devolver solo el veredicto y el
hallazgo —sin el texto reescrito— es un pedazo de costo que no depende de
recortar la rúbrica.

## Las tres reglas de este trabajo

1. **Nada se borra sin la prueba de que el candado corre en las mismas
   puertas.** Un candado que corre solo en `respuesta` no cubre `retomada` ni
   `seguimiento`, y el guardián revisa las tres.
2. **Se verifica en el simulador, no leyendo.** Quitar una regla cambia lo que
   el candado recibe: hoy recibe un texto ya corregido por el guardián, después
   va a recibir el borrador crudo, que puede venir con otra forma.
3. **Nada nuevo entra a la rúbrica si un candado lo puede verificar.** Sin esta
   regla el trabajo se deshace solo en cuatro semanas, que es exactamente lo que
   pasó entre el 10-ago y el 7-sep.
