# AutoVenta — notas para quien trabaje acá

Bot de ventas de llantas por WhatsApp. Cliente: **Depot Tire** (Quito).
Producción y staging deployan de `main`: **un push a `main` sale a los dos**.

## Antes de arreglar un error: leé el orden

[`docs/COMO-ARREGLAR-EL-BOT.md`](docs/COMO-ARREGLAR-EL-BOT.md) — el lazo de seis
pasos (buscar la familia, reproducir, prueba en rojo, elegir la capa, arreglar
en la fuente única, verificar). Está escrito a partir de los errores que hubo
que arreglar dos y tres veces por saltarse un paso.

## Probar un cambio: el simulador, no el WhatsApp real

```bash
cd app && npm run sim        # → http://localhost:3210
```

Levanta el bot entero contra una base local desechable, una Graph API de
mentira y una foto del catálogo, con la **configuración de producción copiada**
(prompts, guardián, beneficios) y los **modelos que Depot usa de verdad**
(se leen del servicio en Railway). Es la forma de reproducir un caso las veces
que haga falta, con el stock congelado en el número del reporte.

Necesita clave propia de OpenAI en `app/.env.sim` — **no la del bot**: esos
tokens se los cobramos a Depot. El simulador se niega a arrancar sin ella.

Detalles, banderas y qué NO prueba: [`app/scripts/sim/README.md`](app/scripts/sim/README.md).

## Después de tocar el bot, corré estas dos

```bash
cd app && npm run sim:humo                              # ¿el simulador sigue andando? (0 tokens)
cd app && npx vitest run test/simuladorFidelidad.test.ts # ¿sigue siendo fiel a producción?
```

La segunda falla si agregaste una **tabla de configuración** o una **variable
de entorno** que el simulador no sabe copiar. No la silencies: clasificá lo
nuevo en `app/scripts/sim/lib/tablas.mjs` o `app/scripts/sim/lib/entorno-prod.mjs`.
Un simulador que se quedó atrás sigue contestando — solo que contesta como otro
bot, y lo que se pruebe ahí deja de decir algo del que atiende a los clientes.

## Dos cosas que se olvidan

- La política comercial tiene una sola fuente: `app/src/agent/compactPlaybook.ts`.
  `prompts.ts` solo agrega negocio, estilo administrable y objetivo de etapa;
  no vuelvas a copiar reglas allí.
- La suite completa es `npm test` (unas 825 pruebas). Las de integración
  necesitan un Postgres local escuchando.

## Canary de modelos (en producción desde el 24-oct-2026)

Teléfonos que terminan en dígito **par** atienden con vendedor `gpt-5.4` + Guardián
`gpt-5.4-mini`; los **impares** siguen con `gpt-5.5`. Lo decide `src/agent/canary.ts` con las
variables `OPENAI_CANARY_MODEL`, `OPENAI_CANARY_MODEL_VENDEDOR`, `OPENAI_CANARY_MODEL_GUARDIAN`,
`AI_CANARY_DIGITS` y `AI_CANARY_SCOPE` del servicio Depot_Tire en Railway. Las corridas del
grupo llevan `+canary` en `ai_runs.route`. Todo lo que llame al Guardián tiene que pasarle el
`phone` de la conversación, o ese camino se queda fuera del canary sin avisar (pasó con los
seguimientos).

## Cómo se reportan los resultados: gráficos de control

Todo resultado medido (lotes del simulador, A/B, canary, auditorías, costos) se muestra como
**gráfico de control**, con un bloque corto «Qué estás viendo» al principio: fase I (antes del
cambio) fija la línea central y los límites ±3σ; fase II se juzga contra ellos; una señal es un
punto fuera de límites u 8 seguidos del mismo lado. Dentro de límites es ruido, no «mejor» ni
«peor». Herramientas: `app/scripts/sim/grafico-canary.mjs` (lotes del simulador) y
`app/scripts/canary/control-charts.mjs` (producción, solo lectura).

