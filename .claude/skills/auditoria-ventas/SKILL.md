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

```bash
DATABASE_URL='postgresql://…' node app/scripts/auditoria/extraer.mjs --dias 14 --salida /tmp/auditoria.json
```

Los conteos son **determinísticos** (reglas fijas sobre la base), no opinión del
modelo. Eso es lo que hace comparables dos corridas. No inventes números que no
estén en ese JSON, y no ajustes un detector para que dé mejor: si un detector
está mal, se corrige en `extraer.mjs` y se dice explícitamente en el reporte que
la serie se cortó.

## Paso 2 · Leer los chats, no solo los números

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

## Paso 4 · Generar el HTML

```bash
node app/scripts/auditoria/render.mjs --datos /tmp/auditoria.json --analisis /tmp/analisis.json --salida ~/auditorias/$(date +%F).html
```

Esto además **registra la corrida** en `app/scripts/auditoria/registro/historial.jsonl`,
con sus métricas y los cambios propuestos. El HTML muestra cada métrica contra la
corrida anterior y una tabla de historial: ahí es donde se ve si los cambios de la
vez pasada funcionaron.

Entrega el archivo al usuario con `SendUserFile`.

## Paso 5 · Cerrar el ciclo

Al terminar, di explícitamente:

1. **Qué se propuso** y qué métrica debería moverse.
2. **Si los cambios de la corrida anterior funcionaron.** Compara su métrica
   objetivo contra la corrida previa. Si no se movió, dilo — revertir es una
   conclusión válida y más honesta que insistir por inercia.
3. **Qué NO se pudo medir**, si aplica.

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

## Sobre el modelo

El reporte trae `modelo.pctErrores`, latencia y tokens. Antes de recomendar
cambiar de modelo, verifica en los chats si la falla es de **capacidad** (el modelo
no entendió algo que un humano sí entendería) o de **instrucción** (el prompt le
mandó hacer exactamente eso). Cambiar de modelo no arregla una regla mal escrita,
y sale más caro. Si se cambia, hazlo **solo** entre dos corridas sin otros cambios
— si no, no se puede atribuir la diferencia.
