# Las 10 conversaciones reales · cómo correrlas

Diez conversaciones de clientes de verdad de Depot Tire, sacadas de `messages`
en producción **sin editar una palabra**, repetidas contra el bot en el
simulador. Cada comprobación nació de una falla medida el **30-ago-2026**
contra `main` `0a83522`. Si una vuelve a fallar, volvió el bug.

## Los archivos

| Archivo | Qué es |
|---|---|
| `pruebas-10.mjs` | El arnés. Manda los mensajes y da veredicto. |
| `datos/historicas-10.json` | Los 110 mensajes de cliente, textuales. |
| `linea-base-0a83522.json` | Cómo le fue **antes** de los arreglos. Para comparar. |

## Correrlas

### 1. Primero la rápida — no gasta un token, tarda un segundo

```bash
cd app && npm run build && node scripts/sim/pruebas-10.mjs --rapido
```

Comprueba tres cosas contra el código, sin hablar con nadie:

- **A** · que el selector de fase entienda las medidas que el lector real del bot
  ya sabe leer (`235/75/15`, `205 55 16`, …).
- **B** · que **ninguna fase quede sin poder derivar a un asesor ni sin poder
  mostrar una llanta**. Esto es lo que dejó a un cliente 12 turnos sin ver nada.
- **C** · que tres frases reales no desvíen la fase: un día de la semana, una
  queja de precio con la palabra «presupuesto», y «tengo una oferta».

**Si esta falla, no hace falta correr el resto**: los arreglos no están puestos.

### 2. Después las conversaciones enteras

```bash
cd app && npm run sim                       # en otra terminal · necesita app/.env.sim
node scripts/sim/pruebas-10.mjs --base scripts/sim/linea-base-0a83522.json
```

Tarda **entre 40 y 60 minutos** y gasta tokens de verdad (gpt-5.5). Con `--base`
te marca qué se arregló (▲) y qué se rompió (▼) respecto de antes.

Una sola conversación, para iterar rápido:

```bash
node scripts/sim/pruebas-10.mjs --conv 8318 --base scripts/sim/linea-base-0a83522.json
```

### 3. Re-juzgar una corrida guardada, sin gastar

```bash
node scripts/sim/pruebas-10.mjs --desde pruebas-10-resultado.json
```

Aplica las comprobaciones sobre una corrida vieja. Sirve para agregar una
comprobación nueva y ver si la corrida de ayer ya la pasaba.

## Cómo le fue antes de los arreglos

Línea base contra `0a83522` (`linea-base-0a83522.json`):

```
rápidas:         9 fallas
comprobaciones:  34 pasaron · 17 fallaron
110 turnos · guardián: 44 correcciones, 12 sin revisar (11%)
```

**El objetivo mínimo antes de prender:** que pasen las 9 rápidas y que
**conv 8318** quede en verde. Es la que deja a un cliente sin ver una llanta.

## Qué mira cada conversación

| conv | El caso | Qué se comprueba |
|---|---|---|
| **8318** | Dio la medida como `235/75/15` después de elegir local | Que busque y muestre. Que no diga «sí tenemos» sin consultar. Que llegue a mostrar algo. |
| **8288** | Quiere UNA llanta 165/80R13, que no hay | Que si promete asesor, **lo avise de verdad**. Que no repita el mismo mensaje. |
| **9887** | Cotizó y se fue a comparar a Ibarra | Que no pregunte el local después de «No gracias» ni de «Ya compre». |
| **11274** | Pidió Falken; preguntó fabricación y frenado en mojado | Que conteste si hay Falken. Que no diga «no tengo el dato» teniendo `respaldo_marcas`. |
| **11620** | Peugeot 206; descartó la 205 por roce | Que no vuelva a ofrecer la 205 rechazada. Que no repita la pieza. |
| **12682** | Preguntó por un cambio de aceite | Que no afirme el servicio ni invente horarios. |
| **10002** | Quería que le recibieran sus llantas nuevas | Que no prometa recompra. |
| **7946** | Cambió de medida tres veces | Que atienda el cambio de medida. Que no insista tras el «No gracias». |
| **9684** | Camino feliz hasta la visita | Que cierre la venta. Que no la reabra tras «ya compré». |
| **10859** | Llantas industriales de montacargas | Que **no** cotice. Que derive a un asesor. |

Y en las diez: ningún turno sin respuesta, ninguna corrida con error, y que el
Guardián no marque `insiste_tras_rechazo`.

## Advertencias

- **Las fotos y audios van como el texto que la visión ya transcribió** en
  producción, no como archivo. **La visión real no se ejercita acá.**
- El simulador necesita **clave propia de OpenAI** en `app/.env.sim` — no la del
  bot, porque esos tokens se le facturan a Depot.
- Estas 10 no reemplazan a `npx vitest run` ni a `npm run sim:humo`. Son otra cosa:
  conversaciones reales de punta a punta, no unidades.
- El veredicto de algunas comprobaciones depende del modelo, así que **una falla
  aislada puede ser ruido**. Dos corridas seguidas fallando la misma es una falla.
- `linea-base-0a83522.json` se generó re-juzgando la corrida del 30-ago, no
  volviendo a hablar con el bot. Los turnos son reales; las comprobaciones se
  aplicaron después.
