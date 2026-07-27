# Prueba de carga — 50 clientes simultáneos

Responde una pregunta con evidencia: **¿el backend aguanta 50 conversaciones en
paralelo sin perder mensajes, sin duplicarlos, sin corromper estado y con el
panel usable?**

```bash
cd app
node scripts/loadtest/run.mjs                       # 50 clientes, escenarios A-E
node scripts/loadtest/run.mjs --clientes 10 --escenarios A
node scripts/loadtest/run.mjs --keep-db 1           # conserva la base para inspeccionar
```

Sale con código 0 si los 13 criterios pasan, 1 si alguno falla.

## Qué levanta

Todo aislado y efímero: base de datos propia, stub de la Graph API, stub de
OpenAI, y el bot y el worker como procesos hijos. **No toca staging ni
producción, y ningún mensaje llega a Meta** — `GRAPH_BASE_URL` apunta al stub,
que además registra todo lo que el bot intentó enviar.

| Pieza | Para qué |
|---|---|
| `stub-graph.mjs` | Se hace pasar por Meta. Su log es el criterio de "no duplicó". `--chaos 0.1` inyecta 429/503 para probar reintentos. |
| `stub-openai.mjs` | Respuestas deterministas. `--latency 2000` simula un modelo lento. |
| `lib/meta.mjs` | Webhooks firmados igual que los de Meta. |
| `scenarios.mjs` | Los guiones de cliente y los escenarios A, B y C. |
| `verify.mjs` | Los 13 criterios. |
| `screenshots.mjs` | Capturas del panel con Playwright, cada una con su aserción. |

Cada corrida deja todo en `reports/<timestamp>/`: `reporte.json`, las capturas,
los logs de ambos stubs y la salida del bot y del worker.

## Los escenarios

- **A — Ráfaga fría.** 50 clientes a la vez, 4 turnos cada uno.
- **B — Duplicados.** Meta entrega *at-least-once*; se reenvía el 20 % tres
  veces, en paralelo. Debe resultar en cero respuestas de más.
- **C — Ráfaga bajo el debounce.** 5 mensajes en 2 s del mismo cliente deben
  producir **una** respuesta que considere los cinco textos.
- **D — Worker bajo presión.** 50 seguimientos vencidos y **dos réplicas** del
  worker: prueba el lease y el `FOR UPDATE SKIP LOCKED`.
- **E — Reinicio a media carga.** Se mata el proceso con mensajes en vuelo.

## Dos cosas que cuestan caro aprender dos veces

**El webhook responde 200 aunque no procese nada.** Si el canal no tiene
credenciales, `webhook.ts` contesta 200 y descarta el mensaje. Una prueba que
solo cuente códigos 200 daría verde con el bot apagado — por eso cada criterio
se verifica contra la base o contra el log del stub, nunca contra el status.

**Meta firma el payload con el unicode escapado.** `ó` viaja como `ó`, y
`whatsapp-api-js` lo reproduce antes de verificar. Un harness que mande tildes
literales recibe 401 **solo en los mensajes con acentos** — que en español son
casi todos, y parece un fallo intermitente del bot. Ver `escapeUnicode` en
`lib/meta.mjs`.

## Límites conocidos

- Los stubs miden capacidad, no calidad comercial de las respuestas. Para eso
  hace falta una evaluación del agente, que es otro trabajo.
- Un stub rápido esconde timeouts que un modelo lento provocaría: usar
  `--latency` antes de dar por bueno el resultado.
- Tras un reinicio los mensajes en vuelo quedan guardados pero **sin respuesta
  automática** (el asesor los ve en el Inbox). El criterio 13 excluye ese rango
  a propósito.
