---
name: auditoria-ventas
description: Audita cómo está vendiendo el bot de AutoVenta. Analiza todas las conversaciones reales, detecta fallas, incoherencias y patrones que se repiten, genera un HTML con estadísticas comparadas contra la auditoría anterior, y propone el prompt corregido. Usar cuando se pregunte cómo va el bot, por qué no cierra ventas, qué está haciendo mal, o cuando se quiera medir si un cambio anterior sirvió.
---

# Auditoría de ventas del bot

## La regla que manda sobre todo lo demás

**El bot existe para VENDER.** No para informar, no para ser prudente, no para
cubrirse las espaldas. Cada hallazgo se juzga por una sola pregunta: *¿esto acercó
o alejó una venta?*

Una respuesta técnicamente correcta que deja al cliente sin precio es un **fallo**,
no un acierto. El bot prudente que pregunta tres veces antes de cotizar pierde
contra el vendedor que cotiza y después ajusta.

## Cuándo usar esto

- «¿Cómo va el bot?», «¿está vendiendo?», «¿qué está haciendo mal?»
- Después de cambiar el prompt o el modelo, para ver si sirvió.
- Antes de una reunión con el cliente.

## Paso 1 · Extraer los datos

Hace falta el `DATABASE_URL` de producción (Railway → servicio de Depot →
Variables). Si no lo tienes, pídelo; no lo adivines ni uses el de staging: las
conclusiones saldrían de conversaciones que no son las del negocio.

Anota **siempre** el commit del bot que produjo esas conversaciones: sin él, un
«mejoró» no se puede atribuir a ningún cambio.

```bash
COMMIT=$(curl -s https://autoventa-depottire.up.railway.app/health | grep -o '"commit":"[a-f0-9]*"' | cut -d'"' -f4)
DATABASE_URL='postgresql://…' node app/scripts/auditoria/extraer.mjs \
  --dias 14 --commit "$COMMIT" --salida /tmp/auditoria.json
```

Los conteos son **determinísticos** (reglas fijas sobre la base), no opinión del
modelo. Eso es lo que hace comparables dos corridas. No inventes números que no
estén en ese JSON, y no ajustes un detector para que dé mejor: si un detector
está mal, se corrige en `extraer.mjs` y se dice explícitamente en el reporte que
la serie se cortó.

### Antes de mirar nada: lee la corrida anterior

```bash
cat app/scripts/auditoria/registro/historial.jsonl | tail -1     # la corrida previa
cat app/scripts/auditoria/registro/LINEA-BASE-2026-08-05.md      # el punto cero
```

Cada entrada trae `cambiosAplicados` con el detector que ataca y **la métrica que
debía moverse**. Ese es tu encargo principal en esta corrida: dar veredicto sobre
cada uno. La línea base documenta los errores del 5-ago, los commits que los
arreglaron, y qué debería verse ahora.

## Paso 2 · Leer los chats, no solo los números

**REGLA INNEGOCIABLE: cada chat con hallazgos se lee COMPLETO y se entiende
exactamente qué vivió el cliente, mensaje por mensaje.** El 5-ago la falla se
descubrió por capturas de Joaquín, no por el análisis — eso no puede repetirse.
Los conteos localizan; la lectura entiende. Para CADA chat afectado escribe en
el análisis: qué pidió el cliente, qué respondió el bot, en qué mensaje exacto
se rompió la venta, y qué debió responder. Si un chat te parece confuso, ese es
precisamente el que hay que leer dos veces.

Referencia obligada — las fallas reales del 5-ago que la auditoría debe
reconocer al instante si reaparecen:

- **Ricardo Nitro**: tres «tuve un problema procesando» seguidos, dos idénticos
  calcados. El cliente preguntó «¿incluye alineación?» y quedó hablando solo.
- **Jordian**: dos respuestas al mismo mensaje con 30 s de diferencia, la
  segunda arrancando con «¡Buenas tardes!» como si nada — a mitad de hilo.
- **KLEVER**: dos números de cotización distintos (COT-MSGJQPAK y COT-MSGJR010)
  para la MISMA compra, cada uno enviado 3 veces.
- **Chevrolet Orlando**: con la medida 225/65R17 en mano, pidió versión y foto.
- **18 pedidos de foto en un solo día.** El bot no puede leer imágenes.

Los detectores dicen *qué* pasó; el chat dice *por qué*. Toma las conversaciones
con más hallazgos y **lee la transcripción completa** de al menos 5, incluyendo
una que sí terminó en venta (para saber qué funciona, no solo qué falla):

```sql
select direction, author_kind, content, created_at
from messages where conversation_id = <id> order by created_at;
```

Busca específicamente:

- **Preguntas que no hacían falta.** ¿El cliente ya había dado ese dato? ¿Estaba
  en la conversación tres mensajes antes?
- **Prudencia que cuesta plata.** ¿El bot se negó a afirmar algo y con eso mató la
  venta, cuando podía haber cotizado y aclarado el límite en la misma frase?
- **Callejones sin salida.** ¿El bot pidió algo que el cliente no puede dar, o que
  el propio bot no puede procesar?
- **Lo que el cliente pedía a gritos.** Muchos escriben la medida y la cantidad en
  el primer mensaje. ¿Cuánto tardó el bot en darles un precio?
- **Qué hizo distinto el chat que sí vendió.**

## Paso 3 · Escribir el análisis

Escribe `/tmp/analisis.json`:

```json
{
  "resumen": "Dos o tres frases, sin rodeos: ¿está vendiendo o no, y qué lo frena?",
  "hipotesis": [
    "Cada causa raíz, con el número que la respalda y el chat donde se ve."
  ],
  "cambiosPropuestos": [
    {
      "cambio": "Qué se cambia, concreto y verificable",
      "ataca": "id_del_detector",
      "metrica": "qué métrica debería moverse y en qué dirección"
    }
  ],
  "promptPropuesto": "El texto del prompt corregido, listo para pegar."
}
```

Reglas para los cambios propuestos:

- **Cada cambio ataca un detector concreto y nombra su métrica.** Un cambio que no
  se puede medir no entra: en la corrida siguiente no habría forma de saber si
  sirvió.
- **Máximo 3 cambios por corrida.** Con cinco cambios a la vez, cuando la métrica
  se mueva no vas a saber cuál lo movió. Prioriza por venta perdida, no por
  frecuencia: una falla en 3 chats que estaban por cerrar pesa más que una en 20
  que nunca iban a comprar.
- **El prompt propuesto se escribe completo**, no como diff. Va a pegarse tal cual.

## Paso 4 · Generar el HTML (y archivar la corrida)

```bash
node app/scripts/auditoria/render.mjs --datos /tmp/auditoria.json --analisis /tmp/analisis.json
```

**El archivado es automático y no se puede saltar.** Cada corrida queda en el
repo bajo su sello de fecha (`2026-08-09-1430`):

```
app/scripts/auditoria/registro/
├── historial.jsonl                     ← una línea por corrida, orden cronológico
├── LINEA-BASE-2026-08-05.md            ← el punto cero, con los commits que arreglaron cada falla
└── reportes/<sello>/
    ├── reporte.html                    ← el reporte
    ├── datos.json                      ← datos crudos (para recalcular métricas nuevas sobre corridas viejas)
    └── analisis.json                   ← el análisis (por qué se propuso cada cambio)
```

`--salida` es opcional: solo hace una copia extra para mandar o abrir. El
original **siempre** va al repo — un reporte en `/tmp` se pierde y la corrida
siguiente se queda sin nada contra qué comparar.

Re-renderizar la misma extracción (por ejemplo tras corregir el análisis) no
duplica la corrida: reemplaza su propia entrada y sigue comparando contra la
anterior de verdad.

**Commitea el registro.** Si no entra al repo, la próxima corrida no lo ve:

```bash
git add app/scripts/auditoria/registro && git commit -m "auditoría: corrida <sello>"
```

Entrega el reporte al usuario con `SendUserFile`.

## Paso 5 · Cerrar el ciclo

Al terminar, di explícitamente:

1. **Veredicto sobre cada cambio de la corrida anterior.** Toma su
   `cambiosAplicados` del historial, mira la métrica que cada uno prometía mover
   y falla: *funcionó* / *no se movió* / *no medible todavía*. Si no se movió,
   dilo — revertir es una conclusión válida y más honesta que insistir por
   inercia. Esta es la razón de ser del historial: sin veredicto, la corrida
   fue una foto suelta.
2. **Qué se propone ahora** y qué métrica debería moverse (máximo 3).
3. **Qué NO se pudo medir**, si aplica.

Cuidado al comparar corridas con `fuente` distinta (`extraer.mjs` vs
`censo-panel`): son varas distintas y hay que decirlo, no promediarlas.

Si el usuario aplica los cambios, anótalos en `BITACORA.md` (el hook del repo
exige entrada en cada commit).

## Fallas conocidas y qué significan

| Detector | Qué significa para la venta |
|---|---|
| `error_procesamiento` | El agente agotó sus 8 iteraciones sin responder. El cliente ve «tuve un problema»; muchos no reescriben. Venta perdida en seco. |
| `pide_foto_que_no_puede_leer` | El bot no procesa imágenes. Pedir una foto es mandar al cliente a un callejón sin salida. |
| `pregunta_teniendo_medida` | Ya tenía todo para cotizar y en vez de eso preguntó. Fricción pura. |
| `pregunta_repetida` | El cliente siente que no lo escuchan. Es la principal causa de abandono. |
| `cotizacion_duplicada` | Dos números de cotización para lo mismo. El cliente no sabe cuál presentar en la tienda. |
| `con_medida_sin_cotizar` | La venta más barata que se dejó ir: el dato estaba y nunca hubo precio. |
| `sin_ficha_verificada` | Prudencia mal calibrada. Correcto sería: cotizar igual y aclarar el límite, no frenar. |
| `pieza_fallida` | El cliente recibe texto donde debía ver la imagen. |
| `abandono_tras_pregunta` | El último mensaje fue una pregunta del bot y el cliente no volvió. |
| `mensaje_duplicado` | Mensaje calcado al anterior. Spam puro (caso Ricardo Nitro). |
| `disculpas_seguidas` | Dos disculpas seguidas = bot atascado y cliente abandonado. |
| `saludo_repetido` | «¡Hola!» a mitad de conversación: delata al bot (caso Jordian). |

## El guardián de salida y qué significa para la auditoría

Desde el 5-ago existe `outboundGuard.ts`: un filtro determinístico que corre
sobre CADA respuesta antes de enviarla. Bloquea pedir fotos, la disculpa
repetida, el mensaje calcado y el saludo a mitad de conversación, y registra
cada intento como alerta `guard_*` en `bot_alerts`.

Consecuencia para el análisis: **lo que llega al cliente ya viene filtrado.**
La métrica `intentosBloqueadosPorGuardian` del reporte dice cuántas veces el
modelo INTENTÓ la falla aunque el cliente no la viera. Léela siempre:

- Intentos altos + chats limpios = el guardián está tapando; el prompt sigue
  enfermo y hay que arreglarlo (proponer cambio de prompt).
- Intentos bajando entre corridas = la mejora de prompt funcionó de verdad.
- Un intento `bot_atascado` = un cliente quedó SIN respuesta (el guardián
  bloqueó la segunda disculpa). Ese chat se lee completo sí o sí: alguien tuvo
  que atenderlo a mano.

## Sobre el modelo

El reporte trae `modelo.pctErrores`, latencia y tokens. Antes de recomendar
cambiar de modelo, verifica en los chats si la falla es de **capacidad** (el modelo
no entendió algo que un humano sí entendería) o de **instrucción** (el prompt le
mandó hacer exactamente eso). Cambiar de modelo no arregla una regla mal escrita,
y sale más caro. Si se cambia, hazlo **solo** entre dos corridas sin otros cambios
— si no, no se puede atribuir la diferencia.
