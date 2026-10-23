# PLAN MAESTRO — Métricas comprobables

> **Cómo usar este documento.** Cada «SPRINT N» es un prompt autocontenido. En
> una sesión nueva se pega **primero el bloque del SPRINT** y **después la
> PARTE A**. Los dos sprints numerados corren **AL MISMO TIEMPO y en cualquier
> orden**: cada uno sale de `origin/main` fresco, no toca los archivos del otro
> y termina en un PR contra `main`. Ninguno espera al otro. El **SPRINT FINAL**
> revisa los dos PRs contra la PARTE B, los prueba juntos con datos reales de
> producción ANTES de publicar, mergea y verifica en vivo.
> Estado del repo al escribir: `origin/main` = `60b93c3` (23-oct-2026).

**De dónde sale esto.** Manuel (23-oct): «updatear las estadísticas para que
muestren solo lo que se comprueba de forma real», qué días y a qué hora se
vende, cuántas conversaciones hubo, y una base para decirle a las empresas
cuánto y cuándo invertir en anuncios. Desde que Depot exige el teléfono de
WhatsApp en la factura, el cruce chat ↔ factura de Contífico
(`app/src/services/ventasConfirmadas.ts`) es la única venta que no depende de
que alguien marque «ganado» a mano.

**Lo medido en producción el 23-oct (lectura, sin escribir nada) — sirve de
control para los sprints:**
- 26 ventas comprobadas desde el 31-jul (ago 10, sep 5, oct 11); 174 facturas
  con llantas de la tienda en el mismo lapso → el bot = 14,9 % de las facturas
  de llantas (14,4 % del monto). Semana del 12-oct: 6 de 17; semana del 19-oct
  (lun–jue): 4 de 10.
- Rezago chat → factura (días): mediana 5; ≤1 día 10/26, ≤7 16/26, ≤14 21/26;
  4 ventas a más de 50 días.
- Chats por hora de inicio: 18:00–05:59 → 617 chats, 0 ventas; sábado → 401
  chats, 0 ventas; 9–10 h y 12 h → 730 chats, 15 ventas.
- Chats con día de visita: 158 → 14 ventas (8,9 %); sin día: 2.896 → 12 (0,4 %).
- Facturas del bot por hora: 18 de 26 entre 11:00 y 13:59.
- Mensajes de asesor en las 26: 0 → 17 ventas; 1–5 → 5; más de 5 → 4.
- Contífico trae por factura `hora_emision` ("HH:MM:SS"), `subtotal` (sin IVA),
  `iva`, `total`; hoy `normalizarFactura` descarta la hora y el subtotal.
- El primer mensaje de un chat que viene de un anuncio guarda
  `messages.metadata.anuncio = {titulo, texto, url}` desde el 19-sep
  (`app/src/index.ts:735`, `app/src/domain/anuncio.ts`). En las olas, 80–95 %
  de los chats lo traen; fuera de ola, 0 %. NO se guardan `source_id`,
  `source_type` ni `ctwa_clid`, que son los que separan un anuncio de otro (el
  título casi siempre es «Depot Tire»).
- Métricas actuales que dependen de `sales_history.outcome = 'ganado'`
  (manual): «Dinero → Vendido/Ganados» (`app/src/services/hubData.ts:396-408`),
  «Embudo → Ganado», «Hasta dónde llega el bot → Confirmados»,
  «Plantillas de seguimiento → Ventas» (`app/src/services/followUpAdmin.ts:255`)
  e «Impacto de descuentos».

## PARTE A — Contexto y reglas comunes (pegar al inicio de CADA sprint)

Eres un ingeniero senior en **AutoVenta** (bot de ventas de llantas por
WhatsApp para Depot Tire; servidor Node/Express/TypeScript en `app/`, Postgres
en Railway; panel React/Vite en `hub/`, cuyo build se COMMITEA en
`app/site/admin` y `app/site/demo-showroom-gp`). Vas a ejecutar UN sprint.
Antes de escribir código lee `CLAUDE.md`, las últimas 3 entradas de
`BITACORA.md`, el encabezado de este plan y tu sección.

**Arranque.** `cd /Users/manue/AutoVenta && git fetch origin && git worktree add
../av-<tu-slug> -b <tu-rama> origin/main`. Trabaja SOLO en ese worktree: el
checkout principal tiene cambios ajenos sin commitear y está 37 commits atrás.

**Reglas duras (cada una con su porqué):**
- **Un push a `main` sale a staging Y a producción** (los dos deployan de
  `main`). Nunca pushees a `main`; tu rama → PR. Mergea solo el Sprint Final.
- **JAMÁS levantes el servidor (`npm run dev`, `npm start`, el worker) con el
  `.env` de producción.** `app/.env` del checkout principal apunta a la base de
  producción de Depot: el servidor arrancaría seguimientos, relojes y envíos de
  WhatsApp reales. Para mirar números reales, escribe un script de SOLO
  LECTURA en tu carpeta temporal que cargue `/Users/manue/AutoVenta/app/.env`,
  importe tus funciones de servicio y haga solo `select` (ejemplo de patrón al
  final de esta parte). Nada de `insert`/`update`/`delete` contra esa base.
- **Solo números comprobables.** Una cifra entra al panel si sale de una
  factura de Contífico, de un mensaje o de un hecho guardado en la base. Nada
  que dependa de que alguien marque «ganado» a mano, y nada inferido leyendo el
  texto del bot (regla de Manuel del 20-oct: el estado se guarda como hecho).
- **Muestras chicas, dichas.** Toda cifra que salga de pocas ventas se muestra
  con su `n` y, si corresponde, su rango. Nunca un porcentaje solo.
- **El contrato de datos de la sección «Contrato» es ley**: nombres y tipos
  exactos. Si crees que hay que cambiarlo, para y anótalo en el PR; no lo
  cambies por tu cuenta (el otro sprint lo está consumiendo en paralelo).
- **Pruebas.** `cd app && npx vitest run <tus archivos>` y `npm run typecheck`
  en `app/`; en `hub/`, `npm run build` (incluye `tsc`). La suite completa
  (`npm test`, ~1.300 pruebas) necesita Postgres local; córrela si lo tienes y
  di el resultado en el PR. El test `interbotSync` falla solo los miércoles:
  no es tuyo.
- **Simulador.** Si agregas una tabla de configuración o una variable de
  entorno, `npx vitest run test/simuladorFidelidad.test.ts` falla: clasifícala
  en `app/scripts/sim/lib/`. Este plan no debería necesitar ninguna.
- **Estilo.** Como el vecino: comentarios en castellano que explican el porqué
  con el caso real, nombres en castellano, funciones puras en `app/src/domain/`
  con sus pruebas. En el panel, los componentes de `hub/src/components/ui.tsx`
  y `charts.tsx`, sin librerías nuevas.
- **Bitácora.** Una entrada en `BITACORA.md` arriba de todo (formato de las
  existentes: `## <fecha> · <título>` + **Qué** / **Por qué**). Si hay
  conflicto al mergear, se conservan las dos.
- **PR.** Título `feat(metricas): …`; cuerpo con objetivo, archivos, cómo se
  verificó (con los números que te dio el script de solo lectura), riesgos y
  los R-xx que cubre, con capturas si toca el panel. No mergear.

Patrón de lectura de producción (solo `select`):
```ts
import fs from "node:fs";
for (const l of fs.readFileSync("/Users/manue/AutoVenta/app/.env", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("="); const k = l.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
}
const svc = await import("<worktree>/app/src/services/metricasComprobables.ts");
// … llamar, imprimir, `await sql.end(); process.exit(0)`
```
Se corre con `cd <worktree>/app && npx tsx <script>.mts`.

### Contrato (lo entrega S1, lo consume S2, el Sprint Final verifica que encajan)

`GET /admin/api/hub/metrics?mes=…` agrega un campo **`comprobables`** a
`metrics`. Tipo exacto (se copia igual en `app/src/services/metricasComprobables.ts`
y en `hub/src/data/types.ts`):

```ts
export type Franja = "madrugada" | "manana" | "mediodia" | "tarde" | "noche";
// madrugada [00,06) · manana [06,11) · mediodia [11,14) · tarde [14,18) · noche [18,24), hora de Guayaquil

export type GrupoAtencion = "bot" | "bot_y_asesor" | "asesor";
// bot: el asesor escribió 0 o 1 mensajes · asesor: el asesor escribió más que el bot · bot_y_asesor: el resto

export interface MetricasComprobables {
  disponible: boolean;               // false: no hay Contífico o todavía no se leyó
  ultimaSync: string | null;         // ISO
  /** Período del selector (mes o «todos»). */
  periodo: { clave: string; todos: boolean };

  /** Bloque 1 — ventas comprobadas DEL PERÍODO (por día de la primera factura con llantas). */
  ventas: {
    n: number;
    conIva: number;                  // suma de `total` de las facturas de esas ventas
    sinIva: number;                  // suma de `subtotal` de las mismas facturas
    rango: { bajo: number; alto: number }; // IC 95 % exacto de Poisson sobre n (Garwood), 1 decimal
    grupos: Record<GrupoAtencion, { n: number; conIva: number }>;
  };

  /** Bloque 2 — participación en las facturas de llantas de toda la tienda. */
  participacion: {
    periodo: { llantasTienda: number; delBot: number; pct: number }; // pct 0–100, 1 decimal
    /** Últimas 12 semanas (lunes, hora de Guayaquil), de la más vieja a la más nueva, SIEMPRE (no depende del selector). */
    semanas: Array<{
      lunes: string;                 // "YYYY-MM-DD"
      llantasTienda: number;         // facturas FAC no anuladas con al menos una llanta a precio ≥ $25
      delBot: number;                // ventas comprobadas cuya primera factura cae esa semana
      chats: number;                 // conversaciones creadas esa semana
      chatsConAnuncio: number;       // de esas, cuyo primer mensaje del cliente trae metadata.anuncio
      anuncios: "si" | "no" | "sin_dato"; // sin_dato: semana anterior al primer mensaje con metadata.anuncio en la base; si: chatsConAnuncio ≥ 10 y ≥ 30 % de chats
    }>;
  };

  /** Bloque 3 — embudo de la COHORTE: chats creados en el período, hasta la factura (de cualquier fecha). */
  embudo: {
    chats: number;
    conMedida: number;               // conversations.tire_size no vacío
    cotizados: number;               // al menos una fila en quotes
    conDiaDeVisita: number;          // conversations.visit_date no nulo
    compraron: number;               // ventas comprobadas de esos chats
    /** La cohorte todavía no maduró si su chat más nuevo tiene < 14 días. */
    madura: boolean;
    /** Conversión según si acordaron día (cohorte del período). */
    porDia: { conDia: { chats: number; compraron: number }; sinDia: { chats: number; compraron: number } };
  };

  /** Bloque 4 — rezago chat → factura, con TODO el histórico (no depende del selector). */
  rezago: {
    n: number;                       // ventas con las que se calcula
    medianaDias: number | null;
    acumulado: Array<{ dias: 1 | 3 | 7 | 14 | 30 | 60; pct: number }>; // % de ventas con rezago ≤ dias
    /** Ventas esperadas en los próximos 14 días de chats ya abiertos que aún no compraron. */
    porLlegar: { esperado: number; bajo: number; alto: number; chatsVivos: number };
  };

  /** Bloque 5 — cuándo, con TODO el histórico (no depende del selector). */
  cuando: {
    ventasTotales: number;
    suficiente: boolean;             // ventasTotales ≥ 40 (≥ 5 esperadas por celda en 7 días + margen)
    escribenPorFranja: Array<{ franja: Franja; chats: number; ventas: number }>;  // por hora de creación del chat
    escribenPorDia: Array<{ dia: 0 | 1 | 2 | 3 | 4 | 5 | 6; chats: number; ventas: number }>; // 0 = domingo
    facturanPorFranja: Array<{ franja: Franja; bot: number; tienda: number }>;    // por hora_emision de la factura
    facturanPorDia: Array<{ dia: 0 | 1 | 2 | 3 | 4 | 5 | 6; bot: number; tienda: number }>;
  };
}
```

Reglas del contrato:
- `escribenPor*` y `facturanPor*` siempre traen TODAS las franjas/días (con 0).
- «Tienda» = todas las facturas con llantas leídas (desde el primer chat del
  bot), incluidas las del bot.
- Las ventas son las de `cruzar()` de `ventasConfirmadas.ts`, con sus reglas de
  descarte intactas. El grupo se calcula con los mensajes del chat.
- `porLlegar`: `tasa` = ventas / chats de las cohortes diarias con ≥ 30 días;
  `F` = distribución empírica acumulada del rezago; para cada día `d` de los
  últimos 60 días con `c_d` chats que aún no compraron y edad `a_d` días,
  `esperado += c_d · tasa · (F(a_d + 14) − F(a_d))`; `bajo`/`alto` = cuantiles
  2,5 % y 97,5 % de Poisson(esperado). `esperado` con 1 decimal.

## PARTE B — Lista maestra de requisitos (lo que el Sprint Final verifica)

### B.1 Datos (servidor)
- **R-01 Ventas comprobadas con atribución honesta.** `comprobables.ventas`
  da n, con y sin IVA (sin IVA = `subtotal` de Contífico), rango de Poisson y
  los tres grupos; con datos del 23-oct, «todos» = 26 ventas y el grupo `bot`
  tiene 17. → **S1 (datos) + S2 (pantalla)**
- **R-02 Participación en las llantas de la tienda.** Por período y por semana
  (12 semanas), con chats, chats con anuncio y marca de anuncios; «todos» ≈
  14,9 % con datos del 23-oct; la semana del 5-oct sale `anuncios: "no"` y la
  del 12-oct `"si"`. → **S1 (datos) + S2 (pantalla)**
- **R-03 Embudo real hasta la factura.** chats → medida → cotización → día de
  visita → compraron, de la cohorte del período, con `madura` y la conversión
  con/sin día (≈ 8,9 % vs 0,4 % en «todos»). → **S1 (datos) + S2 (pantalla)**
- **R-04 Rezago y ventas por llegar.** Mediana 5 días, curva acumulada
  (≤7 días ≈ 62 %) y `porLlegar` con rango. → **S1 (datos) + S2 (pantalla)**
- **R-05 Cuándo escriben y cuándo facturan.** Por franja y día, chats y ventas,
  bot y tienda, con `suficiente`; noche (18–24 h) con datos del 23-oct = 0
  ventas sobre cientos de chats. → **S1 (datos) + S2 (pantalla)**
- **R-06 Estadística pura y probada.** Funciones puras en
  `app/src/domain/estadisticaVentas.ts` con pruebas: IC de Poisson exacto
  (0 → 0–3,7; 2 → 0,2–7,2; 5 → 1,6–11,7; 15 → 8,4–24,7), cuantiles de
  Poisson(4) = 1 y 8 (2,5 %/97,5 %), franja por hora (bordes 6, 11, 14, 18),
  lunes de la semana en Guayaquil, curva acumulada y `porLlegar` con un caso
  armado a mano. → **S1**
- **R-07 El anuncio completo se guarda como hecho.** `anuncioDelReferral`
  guarda además `sourceId`, `sourceType`, `ctwaClid` y `mediaType` (los
  `source_id`, `source_type`, `ctwa_clid`, `media_type` de Meta), y un
  referral que trae `source_id` sin título ni texto ya NO se descarta;
  `hechoDelAnuncio` y lo que lee el vendedor no cambian. → **S1**

### B.2 Pantalla (panel)
- **R-08 Solo números comprobables en Métricas.** Desaparecen de la pantalla
  «Vendido/Ganados» del Kanban, el bloque «Embudo» por etapas con «Ganado»,
  «Hasta dónde llega el bot» (confirmados a mano), la barra «Ventas» de
  Plantillas de seguimiento y el bloque «Impacto de descuentos». La fila de KPIs
  pasa a: Conversaciones · Cotizaciones · Con día de visita · Ventas
  comprobadas (n · $ con IVA) · Parte de las llantas de la tienda (%). →
  **S2**
- **R-09 Muestras chicas visibles.** Cada bloque que sale de ventas muestra el
  `n`; el de «cuándo» muestra el aviso «pocas ventas todavía: patrón tentativo»
  mientras `suficiente` sea false; el embudo dice «todavía madurando» si
  `madura` es false; el rango de ventas se lee «compatible con entre X y Y». →
  **S2**

### B.3 Cierre
- **R-10 El contrato encaja.** Con las dos ramas juntas, el panel compila
  contra el tipo del servidor sin diferencias (el tipo es idéntico en los dos
  archivos) y ningún bloque lee un campo que no exista. → **SF**
- **R-11 Probado con datos reales antes de publicar.** Con las dos ramas
  integradas, un script de solo lectura saca `comprobables` de producción para
  «todos» y para octubre, se carga como fixture en el panel en modo demo y se
  revisan capturas de escritorio y de celular; las cifras coinciden con el
  control de este plan (con lo que haya cambiado desde el 23-oct). → **SF**
- **R-12 En producción y verificado.** Merge a `main`, `/health` de los dos
  servicios con el commit nuevo, Métricas en vivo con los cinco bloques y sin
  los números manuales, entrada de bitácora y memoria actualizadas. → **SF**

## SPRINT 1 — números comprobables (rama `feat/metricas-comprobables-datos`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 1 — números
> comprobables`** (con la herramienta de título de sesión si la tienes). Después
> lee la PARTE A de este mismo documento
> (`docs/planning/PLAN-METRICAS-COMPROBABLES-MASTER-PROMPT.md` en la rama
> `docs/metricas-comprobables-plan`, o el texto que te pegaron) y ejecuta.

**Objetivo.** (R-01…R-07) El servidor calcula los cinco bloques de números
comprobables y los entrega en `metrics.comprobables` con el contrato exacto, y
el anuncio de Meta se guarda completo. Sale de `origin/main` fresco y abre PR
**contra `main`**. No espera al otro sprint.

**Archivos permitidos:**
- `app/src/domain/estadisticaVentas.ts` (nuevo, puro) + `app/test/estadisticaVentas.test.ts`
- `app/src/services/metricasComprobables.ts` (nuevo: consultas + armado del contrato) + `app/test/metricasComprobables.test.ts` (partes puras del armado, con facturas y conversaciones de mentira)
- `app/src/services/ventasConfirmadas.ts` (aditivo: `hora`, `subtotal` en `FacturaContifico`; exportar un getter de las facturas leídas y de la última sync; `VentaConfirmada` gana `sinIva`, `grupo`, `mensajesAsesor`, `mensajesBot`, `primerDia`; nada de lo existente cambia de significado) + `app/test/ventasConfirmadas.test.ts`
- `app/src/server/admin.ts` **solo** el handler `router.get("/hub/metrics", …)` (hoy líneas 660–684): sumar `comprobables` al `Promise.all` con su `.catch` que devuelve `{ disponible: false, … }`
- `app/src/domain/anuncio.ts` + `app/test/anuncio.test.ts` (nuevo si no existe)
- `BITACORA.md`

**Prohibido:** `hub/**` y `app/site/**` (los toca S2); `app/src/services/hubData.ts`
y `app/src/services/followUpAdmin.ts` (las métricas manuales se dejan de
MOSTRAR en S2; no se borran del servidor en esta ronda); `app/src/index.ts`
(la llamada a `anuncioDelReferral` ya pasa el referral crudo: el cambio va
dentro de la función); migraciones (no hacen falta: el anuncio vive en
`messages.metadata.anuncio`).

**Pasos.**
1. `estadisticaVentas.ts` (puro): `rangoPoisson(n)` exacto por bisección sobre
   la CDF de Poisson (sin librerías); `cuantilPoisson(lambda, p)`; `franjaDeHora(h)`;
   `lunesDe(dia)`; `curvaAcumulada(rezagos, cortes)`; `mediana`;
   `ventasPorLlegar({ chatsPorDia, rezagos, tasa, hoy })`. Pruebas con los
   valores de R-06. Escribe primero las pruebas.
2. `ventasConfirmadas.ts`: guarda `hora_emision` (horas 0–23 o null) y
   `subtotal` en `normalizarFactura`; amplía `VentaConfirmada` (campos de
   arriba) dentro de `cruzar()`; el `atendio` de hoy queda igual (lo usa la
   tarjeta actual). Exporta `facturasLeidas()` y `ultimaSyncFacturas()`. Los
   tests existentes deben seguir verdes sin tocarlos más que para agregar casos.
3. `metricasComprobables.ts`: `resumenComprobables(mes)` usa
   `resolverPeriodo(mes)` (`services/periodoMensual.ts`) y el cruce vigente;
   consultas en hora de Guayaquil (`at time zone 'America/Guayaquil'`), con el
   primer mensaje del cliente por conversación vía `distinct on`; arma el tipo
   del contrato tal cual. El cálculo pesado se hace una vez por sync (cache
   por `ultimaSync` + 60 s, como `cruceVigente`).
4. `admin.ts`: sólo el handler de métricas, en paralelo con lo que ya corre.
5. `anuncio.ts`: amplía `Anuncio` con `sourceId`, `sourceType`, `ctwaClid`,
   `mediaType` (string | null, recortados); conserva el anuncio si trae
   cualquiera de título, texto o `sourceId`. Pruebas con un referral real de
   anuncio de feed y uno de «Anuncio en estados» (este último sin `ctwa_clid`).
6. Verificación con datos reales: script de solo lectura (patrón de la PARTE A)
   que imprime `resumenComprobables("todos")` y `("2026-10")`. Compara con el
   control del encabezado (26 ventas al 23-oct, 14,9 %, 0 ventas de noche,
   8,9 % vs 0,4 %, mediana 5) — si cambió porque entraron ventas nuevas, dilo.
   Guarda la salida de «todos» y de octubre como
   `app/test/fixtures/comprobables-2026-10-23.json` SIN teléfonos ni nombres
   (el contrato no los trae): el Sprint Final la usa para el panel.
7. `npm run typecheck` y las pruebas de tus archivos; la suite completa si hay
   Postgres local.

**Reglas de dominio** (como pruebas puras):
- Una venta cuenta en un solo grupo; la suma de los grupos = `ventas.n`.
- `sinIva ≤ conIva` siempre; con IVA del 15 %, `conIva ≈ sinIva × 1,15` salvo
  facturas con ítems sin IVA.
- `participacion.semanas` trae exactamente 12 semanas consecutivas.
- Las franjas y los días vienen completos aunque estén en cero.
- Un chat sin primer mensaje del cliente no cuenta como «con anuncio».

**Aceptación:** R-01…R-07 con pruebas verdes, typecheck limpio, la salida del
script de solo lectura pegada en el PR y la fixture
`app/test/fixtures/comprobables-2026-10-23.json` commiteada.

## SPRINT 2 — pantalla de métricas (rama `feat/metricas-comprobables-pantalla`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 2 — pantalla
> de métricas`** (con la herramienta de título de sesión si la tienes). Después
> lee la PARTE A de este mismo documento
> (`docs/planning/PLAN-METRICAS-COMPROBABLES-MASTER-PROMPT.md` en la rama
> `docs/metricas-comprobables-plan`, o el texto que te pegaron) y ejecuta.

**Objetivo.** (R-08, R-09 + la mitad de pantalla de R-01…R-05) Métricas
muestra solo números comprobables: fila de KPIs nueva, los cinco bloques del
contrato y fuera lo que depende del Kanban manual. Sale de `origin/main`
fresco y abre PR **contra `main`**. No espera al otro sprint.

**Archivos permitidos:**
- `hub/src/screens/Dashboard.tsx`
- `hub/src/components/comprobables.tsx` (nuevo: los cinco bloques)
- `hub/src/components/charts.tsx` **solo** agregar un gráfico nuevo al final (p. ej. barras agrupadas bot/tienda o barras con marca de semana); no cambiar la firma de `BarChart`, `LineChart` ni `FunnelChart`
- `hub/src/data/types.ts` **solo** el tipo `MetricasComprobables` (copiado exacto del contrato) y el campo `comprobables?: MetricasComprobables` en `HubMetrics`
- `hub/src/data/mock/fixtures.ts` y `hub/src/data/mock/mockSource.ts` **solo** el mock de `comprobables` con las cifras del control de este plan
- `app/site/admin/**` y `app/site/demo-showroom-gp/**` (build: `cd hub && npm run build`)
- `BITACORA.md`

**Prohibido:** todo `app/src/**` y `app/test/**` (los toca S1); otras pantallas
del panel; `hub/src/components/billing.tsx` (la tarjeta de facturación queda
igual); cambiar el selector de mes.

**Contrato que consume:** `metrics.comprobables` con el tipo exacto de la
PARTE A (lo entrega S1). Mientras no esté mergeado, el panel en modo demo lee
el mock de `mockSource.ts`. Si `comprobables` no viene o `disponible` es false,
cada bloque dice «sin Contífico» o «leyendo facturas…» y no inventa números
(regla de la pantalla actual: un guion dice «todavía no sé»).

**Pasos.**
1. Tipos: copia el contrato tal cual a `types.ts`. Mock en `mockSource.ts` con
   las cifras del control (26 ventas, 17 del bot solo, 14,9 %, etc.) y 12
   semanas plausibles (dos olas de anuncios y una semana sin anuncios).
2. KPIs (R-08): Conversaciones (`summary.conversaciones`) · Cotizaciones ·
   Con día de visita (`embudo.conDiaDeVisita`) · Ventas comprobadas
   (`ventas.n` · `money(ventas.conIva)`) · Parte de las llantas de la tienda
   (`participacion.periodo.pct` %).
3. Bloque 1 «Ventas comprobadas»: integra la tarjeta actual
   (`VentasConfirmadasBloque`, se queda con su detalle plegable y sus
   descartes) y agrega: sin IVA, rango («compatible con entre X y Y ventas»),
   y los tres grupos con su nombre en castellano: «Bot solo», «Bot + asesor»,
   «Asesor».
4. Bloque 2 «Parte de las llantas de la tienda»: barras por semana (12) de
   facturas de llantas de la tienda con la parte del bot, y una marca visible
   en las semanas con anuncios (`anuncios: "si"`); «sin dato» atenuado.
5. Bloque 3 «Del chat a la factura»: `FunnelChart` con chats → con medida →
   cotizados → día de visita → compraron, y debajo «acordaron día: X de Y
   compraron · no acordaron: …». Aviso si `madura` es false.
6. Bloque 4 «Cuánto tardan en comprar»: curva acumulada (1, 3, 7, 14, 30, 60
   días) y «por llegar en 14 días: ~X (entre A y B), de N chats vivos».
7. Bloque 5 «Cuándo escriben y cuándo se factura»: dos gráficos por franja
   (chats y ventas por franja de inicio; facturas bot vs tienda) y los días de
   la semana; siempre con `n`; aviso de muestra chica si `suficiente` es false.
   La franja se nombra «Madrugada 0–6 h», «Mañana 6–11 h», «Mediodía 11–14 h»,
   «Tarde 14–18 h», «Noche 18–24 h».
8. Fuera (R-08): el bloque «Embudo» por etapas, «Hasta dónde llega el bot»,
   «Impacto de descuentos», la barra y la fila «Ventas» de Plantillas, y
   «Vendido/Ganados» del bloque «Dinero» (Dinero queda con En juego y
   Cotizado). «¿A qué hora contestan más?» lo reemplaza el bloque 5.
9. `cd hub && npm run build`, `npm run dev` en modo demo: capturas de
   escritorio (1440 px) y celular (375 px), modo claro y oscuro si el panel lo
   tiene; sin scroll horizontal en celular.

**Aceptación:** R-08, R-09 y la mitad de pantalla de R-01…R-05 con capturas
del modo demo en el PR, `npm run build` limpio y el build commiteado en
`app/site`.

## SPRINT FINAL — revisión y publicación (rama de trabajo `release/metricas-comprobables`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint Final —
> revisión y publicación`**. Debajo pega la PARTE A y ejecuta. Córrelo cuando
> los dos sprints tengan PR abierto (o cuando uno lo tenga: el que falte
> simplemente no se publica).

**Objetivo.** (R-10, R-11, R-12) Que los dos PRs encajen, se prueben con
datos reales de producción ANTES de publicar y salgan a producción
verificados.

**Archivos permitidos:** los de los dos PRs (para arreglar bloqueantes en su
rama), `hub/src/data/mock/**` (cargar la fixture real), `BITACORA.md`,
`docs/planning/PLAN-METRICAS-COMPROBABLES-MASTER-PROMPT.md` (estado final).

**Prohibido:** cualquier archivo fuera de los dos PRs sin anotarlo en el
informe; pushear a `main` antes de que R-11 esté en ✅.

**Pasos.**
1. Inventario: `gh pr list --state open` → PR ↔ sprint ↔ R-xx; diff completo
   de cada uno; ¿solo archivos permitidos?; ¿pruebas?; ¿bitácora?
2. Revisión por PR con lentes en paralelo: corrección (¿cada número es el que
   dice el contrato? recalcular dos a mano con el script de solo lectura),
   estadística (rangos, cuantiles, bordes de franja y de semana en Guayaquil),
   rendimiento (la consulta de primeros mensajes con `distinct on` sobre
   ~3.000 chats, que Métricas no tarde más que hoy), regresión (la tarjeta de
   ventas confirmadas y su detalle siguen igual), copy y celular. Bloqueantes →
   commit en su rama → re-verificar.
3. R-10: los dos tipos `MetricasComprobables` son idénticos (diff de texto);
   integrar las dos ramas en `release/metricas-comprobables` y compilar `app`
   y `hub`.
4. R-11: script de solo lectura sobre la rama integrada → `comprobables` de
   producción para «todos» y octubre; cargar esa salida como mock del panel en
   modo demo (sin datos personales) y revisar capturas de escritorio y de
   celular contra el control del plan. Pasárselas a Manuel antes de publicar.
5. Merge: primero S1 (no cambia nada visible), después S2; suite de `app` tras
   cada uno; rebuild del panel si `hub` cambió al integrar.
6. R-12: push a `main` (sale a staging y producción); esperar el deploy;
   `/health` de los dos servicios con el commit nuevo; Métricas en vivo (con la
   sesión de Manuel en el navegador) con los cinco bloques y sin los números
   manuales; un chat nuevo desde un anuncio deja `sourceId` en
   `messages.metadata.anuncio` (consulta de solo lectura).
7. Bitácora, memoria del proyecto e informe final R-01…R-12 con ✅/⚠️/❌ y
   evidencia.

**Criterio de éxito.** R-01…R-12 en ✅ con evidencia; producción = `main`;
Métricas sin un solo número que dependa de marcar «ganado» a mano.

## Qué hace cada sprint

| Sprint | Rama | Qué entrega | Pedidos |
|---|---|---|---|
| **S1 — números comprobables** | `feat/metricas-comprobables-datos` | El servidor calcula ventas comprobadas con quién las atendió, sin IVA y con rango; la parte del bot en las llantas de la tienda por semana con anuncios sí/no; el embudo hasta la factura; cuánto tardan en comprar y cuántas faltan por llegar; cuándo escriben y cuándo se factura. Guarda el id del anuncio de cada chat. | P-01…P-05, P-07 |
| **S2 — pantalla de métricas** | `feat/metricas-comprobables-pantalla` | Métricas muestra esos cinco bloques con su tamaño de muestra y quita todo lo que dependía de marcar «ganado» a mano. | P-01…P-06 |
| **Sprint Final — revisión y publicación** | mergea a `main` | Revisa los dos PRs contra R-01…R-12, los prueba juntos con los números reales de producción en el panel antes de publicar, publica y verifica en vivo. | P-08 + verificación |

Pedidos (P-xx): P-01 solo estadísticas comprobables · P-02 ventas reales con
atribución · P-03 qué días y a qué hora se vende · P-04 cuántas conversaciones
hubo y cuántas compraron · P-05 predecir cuándo llegan las ventas · P-06 quitar
lo que no se comprueba · P-07 guardar el anuncio de cada chat · P-08 probar
antes de producción.

**Fuera de alcance (próxima ronda):** el informe de pauta para empresas (CPA,
ROAS, chats y ventas por dólar por ola) necesita el gasto de cada ola, que hoy
no está en ningún lado, y unas semanas de `sourceId` guardado; el envío de
compras a Meta por Conversions API choca con el rezago (Meta acepta eventos de
hasta 7 días y el 38 % de las ventas llega después).

## Apéndice — Paralelismo

Los dos sprints numerados corren a la vez; el Sprint Final se corre cuando
tengan PR.

| Archivo caliente | Quién lo toca |
|---|---|
| `app/src/services/ventasConfirmadas.ts`, `app/src/services/metricasComprobables.ts`, `app/src/domain/estadisticaVentas.ts`, `app/src/domain/anuncio.ts` | S1 |
| `app/src/server/admin.ts` | S1, **solo** el handler `/hub/metrics` |
| `hub/src/**` | S2 |
| `app/site/**` (build del panel) | S2 |
| `BITACORA.md` | los dos (entradas separadas; en conflicto se conservan ambas) |

Contrato: `metrics.comprobables` (`MetricasComprobables`) — lo entrega S1 en
`app/src/services/metricasComprobables.ts`, lo consume S2 en
`hub/src/data/types.ts` con el mock de `hub/src/data/mock/mockSource.ts`; el
Sprint Final comprueba que son idénticos y reemplaza el mock por la fixture
real para la prueba previa.
