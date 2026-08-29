# AutoVenta — notas para quien trabaje acá

Bot de ventas de llantas por WhatsApp. Cliente: **Depot Tire** (Quito).
Producción y staging deployan de `main`: **un push a `main` sale a los dos**.

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
