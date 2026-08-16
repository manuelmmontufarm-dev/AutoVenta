# Sprint 1 · «Conversación repetitiva» sin falsos positivos + afinar el Ángel Guardián

**Modelo recomendado:** Opus · razonamiento alto. Es el sprint más de criterio: heurísticas
de similitud, prompt del guardián y decidir qué merece alerta. Poco código, mucho juicio.

**Archivos que toca (nadie más los toca en otros sprints):**
- `app/src/domain/conversationQuality.ts` — el detector
- `app/src/services/conversationQuality.ts` — la alerta
- `app/src/services/guardian.ts` — prompt y política de alertas
- `app/src/index.ts` y `app/src/services/resumeBot.ts` — solo el call site de `flagRepetitiveConversation`
- `app/test/` — tests nuevos del detector

---

## Contexto: lo que se verificó en producción (15-ago, vía API del hub)

**Ángel Guardián, últimos 7 días (tabla `guardian_reviews`):**

| Métrica | Valor |
|---|---|
| Revisiones | 323 (~46/día) |
| Correcciones | 62 (19,2 %) |
| Hallazgos ALTA | ignora-pregunta 16 · re-pregunta 11 · otro 11 · precio_incorrecto 8 · medida_incorrecta 2 · contradicción 1 |
| Hallazgos «repeticion» | 9 en 7 días (8 media, 1 baja) |

**Alertas `repetitive_conversation` (el detector tonto, NO el guardián): 14 solo el 15-ago.**
Caso confirmado por Manuel: conv **6467** — el cliente confirmó «el lunes en Quito Sur»,
pidió la ubicación, el bot respondió perfecto… y saltó «conversación repetitiva».

**Por qué se dispara mal** (`looksRepetitiveReply`):
1. Similitud = tokens compartidos / **min**(tokens A, tokens B). Un mensaje corto de
   confirmación comparte casi todos sus tokens con el anterior → ratio altísimo.
2. No excluye entidades que se repiten legítimamente: *Depot, Tire, Quito, Sur, lunes,
   cotización, medida, marca*. En 6467 esas palabras SON la conversación.
3. Mira solo al bot: no exige ninguna señal de que el **cliente** esté atascado.
4. Umbral 0.72 contra cualquiera de los últimos 3 mensajes — un solo roce basta.

**Veredicto sobre apagar el guardián:** NO apagarlo. En 7 días corrigió 62 respuestas antes
de enviarse, 39 con errores de severidad alta (8 de precio). Eso es exactamente el tipo de
error que costó ventas en el censo del 5-ago. Lo que sobra es **ruido de alertas**, no la
revisión. Este sprint quita el ruido y baja el costo.

---

## Tareas

### 1. Reescribir el detector de repetición (`domain/conversationQuality.ts`)

Nueva firma: `looksRepetitiveReply(candidate, previousBot, lastClientMessages)` con reglas:

- **Jaccard, no min-overlap**: `intersección / unión`. Umbral inicial 0.65 (calibrar con los
  casos del informe del guardián).
- **Filtrar entidades del dominio** antes de comparar: nombres de local (leer de
  `domain/locations.ts`), medidas (`tireSize`), marcas, días de la semana, «cotización»,
  «COT-…». Son vocabulario obligado del negocio, no repetición.
- **Exigir doble señal.** Alerta solo si (a) el candidato es similar a ≥2 de los últimos 3
  mensajes del bot (el bot lleva 3 vueltas en lo mismo), **o** (b) es similar a 1 y el último
  mensaje del cliente también es similar a su mensaje anterior (los DOS están dando vueltas),
  **o** (c) se mantiene el candado del `fitmentLoop` actual.
- **Lista de exención**: mensajes cortos de cortesía/confirmación (≤ 8 tokens útiles), y no
  disparar si el último mensaje del cliente es una afirmación/agradecimiento
  (`sí|dale|gracias|perfecto|por favor|👍|ok`) — como en 6467.

### 2. Bajar el volumen de la alerta (`services/conversationQuality.ts`)

- `priority: "high"` → `"medium"`; el resumen deja de decir que el cliente «puede quedar
  atrapado» si no hay señal del cliente.
- **Máximo 1 alerta de este tipo por conversación por día** (hoy el dedupe es por ciclo y
  igual salieron 14 en un día). Ampliar `dedupeKey` con el día de Guayaquil.
- El aviso de WhatsApp (`notifyAdvisor`) solo sale si el caso cumplió la doble señal
  (a) o (b); el resto queda como alerta de panel solamente. Nota: tras el Sprint 3 este
  evento ya no llega a los asesores de rol `asesor`, solo a admins.

### 3. Cruce con el guardián (la fuente buena de «repetición»)

El guardián ya detecta repetición **entendiendo** la conversación (9 casos en 7 días, contra
14 del detector tonto en un día). Cambio en `guardian.ts`:

- Si el guardián corrige con hallazgo `repeticion` severidad **alta**, crear la alerta
  `repetitive_conversation` (con su dedupe diario) — así el tab de errores tiene UNA fuente
  con juicio real y el detector tonto queda como red de respaldo barata.

### 4. Ataque de causas raíz que el informe del guardián ya identificó

Los hallazgos de 7 días apuntan a 3 causas concretas (¡esto es prompt, no código!):

1. **`preparar_opciones` cierra con «¿Necesita alguna recomendación?» aunque la herramienta
   ya traía una recomendación específica o el cliente pidió precio** (convs 6559, 6505,
   6507, 6525…). Corregir la salida fija de la herramienta y la regla del playbook: si la
   herramienta prepara recomendación o el cliente pidió precio, se entrega, no se pregunta.
   Coincide con la auditoría del 9-ago (9,1 % de intención de precio → cotización).
2. **Bloques de «beneficios» genéricos que ignoran la pregunta del cliente** (rendimiento,
   precio — convs 6551, 6525): regla en `BOT_PLAYBOOK.md`/prompt: responder la pregunta
   del último mensaje ANTES de cualquier bloque de beneficios.
3. **«Mantenimiento gratuito cada 10.000 km» sin respaldo en los datos** (conv 6551):
   revisar `benefits`/prompts y quitar o respaldar la cifra.

### 5. Política de alertas del guardián

25 alertas `guardian_correccion` en el feed. Mantener la regla «solo corrección + hallazgo
alto» pero excluir categorías `tono` y `otro` del aviso (quedan en el informe semanal).
El informe (`/api/guardian/informe`) es la herramienta de mejora; las alertas son solo para
«mira este chat ahora».

### 6. Tests

- Casos reales como fixtures: la secuencia de 6467 (no debe disparar), un bucle real de
  fitment (debe disparar), 3 mensajes calcados del bot (debe disparar).
- Test de que la alerta respeta el tope diario.

## Criterios de aceptación

- La secuencia de conv 6467 no genera alerta.
- Un bucle genuino (bot repite 3 veces la misma pregunta) sí la genera, una sola vez al día.
- `npm test` en verde; el guardián sigue fallando abierto.
- Después de 2 días en producción: < 3 alertas `repetitive_conversation`/día y ninguna
  sobre conversaciones sanas (verificar contra el informe del guardián).

## Qué NO hacer

- No apagar el guardián ni tocar su esquema de salida/tabla.
- No tocar `advisorNotifications.ts` (es del Sprint 3) más allá del call site ya descrito.
- No tocar el hub.
