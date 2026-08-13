---
name: revision-contextual
description: Revisa TODOS los mensajes del día del bot de Depot Tire, uno por uno y en contexto, buscando los errores que ningún detector automático ve (re-preguntar lo ya respondido, contradecirse, ignorar la pregunta, llanta equivocada para el vehículo, chats que mueren en silencio). Genera un reporte HTML del día con historial para comparar día a día. Usar al final del día, cuando se pida "la corrida de los chats de hoy", "los errores de hoy" o revisar un día concreto.
---

# Revisión contextual diaria

## En qué se diferencia de auditoria-ventas

`auditoria-ventas` cuenta fallas con **detectores determinísticos** (números
comparables entre corridas). Esta revisión es su complemento: el **juicio en
contexto**, mensaje por mensaje. El caso que la parió (13-ago): el cliente
dijo «Al sur me resulta más fácil», el bot confirmó Quito Sur, y dos mensajes
después preguntó «¿Cumbayá o Quito Sur?». Ningún regex ve eso; leyendo el hilo
es obvio. Existe para que Joaquín no tenga que vivir pegado al teléfono
cazando estos errores.

## Paso 1 · Extraer el día

Necesita el `DATABASE_URL` de producción (el de `app/.env` es el de
producción; verifícalo contra un chat conocido antes de confiar en él).

```bash
cd app
COMMIT=$(curl -s https://autoventa-depottire.up.railway.app/health | grep -o '"commit":"[a-f0-9]*"' | cut -d'"' -f4)
DATABASE_URL='postgresql://…' node scripts/revision/extraer.mjs \
  --fecha YYYY-MM-DD --commit "$COMMIT" --salida /tmp/revision.json
```

Trae la transcripción COMPLETA de cada conversación con actividad ese día
(el contexto de días anteriores incluido — el error contextual vive en la
relación entre lo de hoy y lo de antes), los `hechos` que el bot cree saber,
las cotizaciones y las alertas agregadas.

## Paso 2 · Revisar cada conversación contra la rúbrica

La rúbrica canónica vive en `rubrica.md` (junto a este archivo): qué es un
error contextual, las 8 categorías con ejemplos reales y el formato JSON de
los hallazgos. No la parafrasees: pásala tal cual a quien revisa.

Con un día normal (80–120 chats) **reparte el trabajo en 3–5 subagentes en
paralelo**, cada uno con un lote de conversaciones (partir el JSON en un
archivo por conversación ayuda a que cada agente lea solo lo suyo). Cada
agente lee sus chats COMPLETOS y escribe su array de hallazgos en un archivo.
Exige evidencia textual con ids de mensajes: un hallazgo sin cita no vale.

Después consolida los archivos en uno solo y **verifica tú mismo los
hallazgos de severidad alta antes de publicarlos**: contra la base si hace
falta (¿el bot de verdad calló, o estaba `bot_paused_until` esperando a un
humano? ¿respondió después de la extracción?). Un reporte con un falso
positivo alto pierde la confianza de quien lo lee.

## Paso 3 · Sintetizar

Escribe `/tmp/sintesis.json`:

```json
{
  "resumen": "Dos o tres frases: qué clase de día tuvo el bot y qué es lo más urgente.",
  "patrones": [
    {
      "titulo": "Nombre del patrón",
      "detalle": "Qué pasa y por qué (causa raíz si se conoce)",
      "conversaciones": [5008, 5061],
      "accion": "Qué habría que cambiar (código, prompt u operación)"
    }
  ],
  "correcciones": ["Lo que ya se corrigió hoy mismo, si aplica"]
}
```

Los patrones valen más que los hallazgos sueltos: 8 chats mudos por la misma
pausa de handoff son UN problema, no ocho.

## Paso 4 · Render + registro (no se puede saltar)

```bash
node scripts/revision/render.mjs --datos /tmp/revision.json \
  --hallazgos /tmp/hallazgos.json --sintesis /tmp/sintesis.json
```

Deja el reporte en `scripts/revision/registro/reportes/<fecha>/` y actualiza
`registro/historial.jsonl` (re-renderizar el mismo día reemplaza su línea, no
duplica). El HTML compara las categorías contra el día anterior — esa tabla
de tendencia es la razón del registro: ver si los errores contextuales bajan.

**Commitea el registro** (el hook del repo exige entrada en `BITACORA.md`) y
entrega el HTML con `SendUserFile`.

## Paso 5 · Cerrar el ciclo

1. Veredicto sobre los patrones del día anterior: ¿bajaron tras lo corregido?
2. Máximo 3 acciones propuestas, cada una apuntando a un patrón concreto.
3. Los hallazgos de sistema (floods de alertas, pipeline caído, piezas rotas)
   se reportan aparte de los conversacionales: son bugs, no estilo.

## Trampas conocidas

- **Silencio ≠ bot roto.** Muchos chats mudos están en `bot_paused_until`
  (handoff a humano). El hallazgo real ahí es operativo: nadie humano contestó.
  Verifícalo antes de reportar «el bot se cayó».
- **`window_closing` puede venir repetida miles de veces** en un chat (el
  extractor ya las agrega con `veces`). Un conteo alto es hallazgo de sistema.
- Mensajes de `author_kind` distinto de bot son del asesor: no se auditan.
- Lo que pasó DESPUÉS de la extracción no existe en el JSON: si un chat
  parece morir a las 15:00, confirma en la base antes de declararlo muerto.
