# PLAN MAESTRO — Días abiertos, promoción 3x4 y anuncios

> **Estado al 26-oct-2026:** EJECUTADO. S1 = PR #19, S2 = PR #20, S3 = PR #18,
> integrados por el Sprint Final en `release/promo-horarios-anuncios-2026-10` y
> publicados a `main`. Informe R-xx y arreglos del Sprint Final en `BITACORA.md`
> (entrada del 26-oct). Correcciones al plan: R-04 necesitó un candado en las
> DOS puertas que registran visita (herramienta y pipeline), no solo texto;
> R-11 necesitó apartar «la del anuncio» de la vitrina por aro sin modelo.

> **Cómo usar este documento.** Cada «SPRINT N» es un prompt autocontenido. En
> una sesión nueva se pega **primero el bloque del SPRINT** (así el chat queda
> llamado `Sprint N — <nombre corto>`) y **después la PARTE A**. **Los tres
> sprints numerados corren AL MISMO TIEMPO y en cualquier orden**: cada uno sale
> de `origin/main` fresco, no toca las zonas de los otros y termina en un PR
> contra `main`. Ninguno espera a ninguno. El **SPRINT FINAL** (sin número; lo
> corre Fable, el chat que escribió este plan) revisa los tres PRs contra la
> PARTE B, los prueba juntos en el simulador, mergea, publica y entrega el
> checklist para Manuel.
> Estado del repo al escribir: `origin/main` = `ddbc29f` (26-oct-2026).
>
> **Modelos sugeridos por sprint** (pedido de Manuel: que termine rápido):
> S1 → Sonnet 5.5 · S2 → Opus 5.5 (toca 6 renderizadores, el más delicado) ·
> S3 → Sonnet 5.5 · Sprint Final → Fable 5.1 (este chat).

**De dónde sale esto.** Manuel, 26-oct-2026: (P-01) Depot va a cerrar los
domingos y en Ajustes no se puede marcar «domingo cerrado» sin cerrar también
el sábado; (P-02) por el feriado cambiaron la promoción de «25 %» a «3x4» /
«$300 por 4», que es la misma plata pero se dice distinto, y tiene que haber
un lugar en Ajustes donde elegirlo que se refleje en la pieza, en el PDF y en lo
que dice el bot; (P-03) saber de qué anuncio viene el cliente, o poder pegar el
link/la descripción del anuncio, para cuando pregunte «quiero la llanta del
anuncio»; (P-04) no puede revisar qué dejaron configurado en Ajustes de
producción (eso lo mira el Sprint Final con un script de solo lectura);
(P-05) que Fable verifique todo, lo publique y entregue un checklist de prueba.

**Lo que encontré investigando (manda sobre lo que uno supondría):**
- Los horarios de local viven en `settings.store_hours` con el esquema
  `{ weekday, weekend, excepciones }` (`app/src/services/settings.ts:53-58`): sábado
  y domingo son UN solo tramo. Lo leen `formatStoreHours` (prompt del vendedor y
  hechos del Guardián, `settings.ts:189`), `algunLocalAbre` (botones de día,
  `settings.ts:177` → `index.ts:684` → `domain/botones.ts:121`) y `storeSchedule`
  en `app/src/agent/tools.ts:313-322`. El panel lo pinta `SeccionHorarios`
  (`hub/src/screens/Ajustes.tsx:681-697`) con dos filas fijas.
- El 25 % no está escrito en ninguna parte: se calcula lista vs. venta en SEIS
  sitios: `render/diaNoche.ts:169,479-500` (insignia «−25% DESCUENTO HOY»),
  `render/depotPosters.ts:109-112,222` (clásica), `services/quotePdf.ts:207,326`
  (PDF de respaldo pdfmake), `services/quoteMessages.ts:612-621,697-732` (texto
  de respaldo), `domain/ahorro.ts:65-67` (`fraseDeAhorro`: «*25 %* de descuento ya
  aplicado, *$X* menos») y `services/guardian.ts:826-840` (hecho del ahorro).
- **El PDF que recibe el cliente ES la imagen**: `tools.ts:3316-3320` hace
  `pngToQuotePdf(visual.png)`; pdfmake solo si el render falló. Arreglar la pieza
  arregla el PDF.
- Todas las piezas reciben `...(await getPiecesConfig())` (6 llamadas:
  `tools.ts:1459,2217,2534,3294`, `directSalesRoutes.ts:115`, `admin.ts:1142,1389`
  para la vista previa). Un campo nuevo en `PiecesConfigSchema` llega solo a
  `PieceTheme` sin tocar `tools.ts`. Por eso la promoción vive ahí.
- El vendedor se entera de los beneficios por `activeBenefitFactsBlock()`
  (`services/benefits.ts:159`), que ya viaja al prompt desde `agent.ts:201`.
  Es el lugar para contarle la promoción sin tocar `agent.ts`.
- El anuncio de Meta YA se captura y se usa: `index.ts:804` →
  `domain/anuncio.ts` (`titulo`, `texto`, `url`, `sourceId`, `ctwaClid`) →
  `agent.ts:629-631` manda `hechoDelAnuncio` como mensaje de sistema, y
  `tools.ts:1123-1133` lo usa para la clase de vehículo. Lo que NO hay: un lugar
  donde el negocio diga qué muestra cada anuncio (el título casi siempre es
  «Depot Tire»), un hecho para el Guardián, y una vista de qué anuncios están
  llegando.
- Pegar el link del anuncio NO lo lee el bot: `linkPreview.ts:141` descarta
  facebook/instagram a propósito (piden login y devuelven «Por seguridad,
  completa este paso», `linkPreview.ts:500`). La descripción escrita por el
  negocio es la única fuente fiable; el link sirve para reconocerlo.
- El build del hub se COMMITEA en `app/site/admin` (commit `ae3e6b4`). Tres PRs
  que commiteen el build chocan en binarios: lo construye solo el Sprint Final.
- No hace falta migración ni variable de entorno nueva: todo cabe en la tabla
  `settings` (el simulador la copia entera, `scripts/sim/lib/tablas.mjs:17`).
- El checkout principal `/Users/manue/AutoVenta` está en `main` con cambios
  ajenos sin commitear (docs, `comprobables.tsx`) y 1 commit atrás: se trabaja en
  worktrees `../av-<slug>`.

## PARTE A — Contexto y reglas comunes (pegar al inicio de CADA sprint)

Eres un ingeniero senior en **AutoVenta** (bot de ventas de llantas por
WhatsApp para Depot Tire; servidor Node/Express/TypeScript en `app/`, Postgres
en Railway; panel React/Vite en `hub/`). Vas a ejecutar UN sprint. Antes de
escribir código lee `CLAUDE.md`, `docs/COMO-ARREGLAR-EL-BOT.md`, las últimas 3
entradas de `BITACORA.md`, el encabezado de este plan
(`docs/planning/PLAN-PROMO-HORARIOS-ANUNCIOS-MASTER-PROMPT.md`) y tu sección.

**Arranque.** `cd /Users/manue/AutoVenta && git fetch origin && git worktree add
../av-<tu-slug> -b <tu-rama> origin/main && cd ../av-<tu-slug>/app && npm ci && cd ../hub && npm ci`.
Trabaja SOLO en ese worktree. Ponle a la sesión el nombre que dice tu bloque.

**Reglas duras (cada una con su porqué):**
- **Un push a `main` sale a staging Y a producción.** Nunca pushees a `main`;
  tu rama → PR contra `main` con `gh pr create`. Mergea solo el Sprint Final.
- **JAMÁS levantes el servidor con el `.env` de producción.** `app/.env` del
  checkout principal apunta a la base real de Depot. Para probar el bot usa el
  simulador (`cd app && npm run sim`, necesita `app/.env.sim` con una clave de
  OpenAI propia). Para probar Ajustes sin tocar prod: servidor del worktree con
  `DATABASE_URL` a una base local desechable + `ADMIN_KEY` de prueba, y el hub con
  `AUTOVENTA_DEV_API_URL` (así se probó el 24-oct).
- **Alcance de archivos: solo los permitidos de tu bloque, y en las zonas
  marcadas «solo»**. Los otros dos sprints están editando los demás archivos
  AHORA MISMO en paralelo. Si necesitas otro archivo, para y anótalo en el PR.
- **No commitees el build del hub** (`app/site/admin/**`, `app/site/demo-showroom-gp/**`).
  Corre `npm run build` en `hub/` para verificar que compila, pero deja esos
  archivos fuera del commit (`git checkout -- app/site`). Lo construye el Sprint Final.
- **Nada hardcodeado del cliente**: lo que el negocio cambia vive en la tabla
  `settings` (key/value jsonb) o en `app/src/negocio/negocios/depot.ts`, nunca en
  el prompt ni en el renderizador.
- **Sin migraciones ni variables de entorno nuevas** en este plan. Si crees que
  hace falta una, para: rompería `test/simuladorFidelidad.test.ts`.
- **Compatibilidad hacia atrás con lo guardado en producción**: toda lectura de
  `settings` que cambie de forma tiene que aceptar la forma vieja sin
  migración (así se hizo con `aviso_matrix` → `aviso_niveles` el 24-oct).
- **El Ángel Guardián borra lo que no puede verificar.** Todo dato nuevo que el
  bot deba poder decir (la promoción, el anuncio) viaja también como HECHO al
  Guardián en `services/guardian.ts`, o lo tacha.
- **Pruebas.** Primero el test en rojo, luego el arreglo. `cd app && npx vitest run <tus archivos>`
  y `npm run typecheck`; en `hub/`, `npm run build` (incluye `tsc`). La suite
  completa (`npm test`, ~1.400 pruebas) necesita Postgres local; córrela si lo
  tienes y pega el resultado en el PR. `interbotSync.test` falla los miércoles: no es tuyo.
- **Estilo.** Como el vecino: comentarios en castellano que explican el porqué
  con el caso real, nombres en castellano, funciones puras en `app/src/domain/`
  con sus pruebas. En el panel, los componentes de `hub/src/components/ui.tsx`,
  sin librerías nuevas.
- **Bitácora.** Una entrada en `BITACORA.md` arriba de todo (formato
  `## <fecha> · <título>` + **Qué** / **Por qué** / **Horas**). Si hay conflicto
  al mergear, se conservan las dos.
- **PR.** Título `feat(<área>): …`; cuerpo con objetivo, archivos, cómo se
  verificó (comandos + capturas del panel y del simulador), riesgos y los R-xx
  que cubre. No mergear.

## PARTE B — Lista maestra de requisitos (lo que el Sprint Final verifica uno por uno)

### B.1 Días abiertos por local
- **R-01 Horario por día de la semana.** `settings.store_hours` acepta por local
  los 7 días (`lun, mar, mie, jue, vie, sab, dom`), cada uno con `open`, `close`,
  `closed`. Lo guardado hoy en producción (`weekday`/`weekend`) se lee sin
  migración: `weekend` se expande a `sab` y `dom`. Test puro que lo demuestre. → **S1**
- **R-02 Ajustes muestra los 7 días.** En Ajustes → Negocio → Horarios de locales,
  cada local tiene una fila por día con Abre/Cierra/Cerrado y un botón «copiar a
  lunes–viernes». Marcar «Cerrado» solo en domingo deja sábado abierto. Al
  guardar y recargar se conserva. → **S1**
- **R-03 El bot lee el horario por día.** El texto del prompt y del Guardián
  agrupa días iguales («lunes a viernes 08:30–17:30; sábado 08:30–14:30; domingo
  cerrado»); `storeSchedule` de `tools.ts` dice lo mismo; los botones de día de
  visita no ofrecen un día en que ningún local abra (domingo cerrado → el botón
  salta a lunes). Tests puros. → **S1**
- **R-04 Si el cliente propone un día cerrado, el bot lo dice y ofrece el
  siguiente día abierto** (verificable en el simulador con «paso el domingo»
  teniendo domingo cerrado en los dos locales). → **S1**

### B.2 Promoción configurable (25 % ↔ 3x4)
- **R-05 Ajuste «Cómo se nombra la promoción».** `settings.pieces_config` gana
  `promocion: { modo: "porcentaje" | "3x4" }` (default `porcentaje`); lo guardado
  hoy se lee igual. Ajustes → Piezas tiene un selector con los dos modos y
  vista previa inmediata. → **S2**
- **R-06 La pieza y el PDF lo reflejan.** En modo `3x4` la insignia de la
  cotización y de las opciones dice «3x4 · PAGA 3 LLEVA 4» (plantilla clásica y
  día/noche) en vez de «−25% DESCUENTO»; el PDF que sale al cliente es esa
  misma imagen; el PDF de respaldo (pdfmake) y el texto de respaldo dicen «3x4».
  En modo `porcentaje` todo queda exactamente como hoy (tests existentes verdes). → **S2**
- **R-07 Candado de verdad.** `3x4` solo se muestra si el descuento real de esa
  línea está entre 24 % y 26 %; si no, cae a porcentaje y Ajustes avisa
  («esta llanta tiene −18 %: saldría como porcentaje»). Test puro. → **S2**
- **R-08 El bot lo dice y el Guardián lo respeta.** La frase del ahorro
  («promoción 3x4: paga 3 llantas y lleva 4, $X menos»), el hecho del ahorro
  del Guardián y el bloque de hechos del vendedor nombran la promoción en el
  modo vigente; preguntar «¿tienen el 3x4?» en el simulador con el modo activo
  se responde que sí, sin inventar monto. → **S2**

### B.3 Anuncios
- **R-09 Anuncios activos en Ajustes.** Ajustes → Negocio → «Anuncios» permite
  cargar anuncios: link (opcional), qué muestra (llanta/marca/tipo/medida/promo,
  texto libre obligatorio), activo sí/no, vigencia hasta (opcional). Vive en
  `settings.anuncios_activos`; GET/PUT `/admin/api/anuncios-activos`. → **S3**
- **R-10 Qué anuncios están llegando.** La misma sección muestra los anuncios
  vistos en los últimos 14 días (de `messages.metadata.anuncio`): título, texto
  recortado, `sourceId`, cuántos chats y el último; botón «usar como activo»
  que precarga el formulario. GET `/admin/api/anuncios-vistos`. → **S3**
- **R-11 El vendedor y el Guardián los conocen.** Si hay anuncios activos, el
  mensaje de sistema del anuncio (`agent.ts`) incluye «ANUNCIOS VIGENTES
  (cargados por el negocio)» con cada descripción; si el chat trae referral se
  dice cuál coincide (por `sourceId` o por link). El Guardián recibe el mismo
  hecho. En el simulador, «quiero la llanta del anuncio» con un anuncio activo
  que diga «Kenda KR601 rin 16» busca esa llanta y no pregunta cuál. → **S3**
- **R-12 El link no se lee solo, y se dice.** El panel aclara que Meta no deja
  leer el link del anuncio y que la descripción escrita es la que manda. → **S3**

### B.4 Operación
- **R-13 Leer lo que Depot dejó en Ajustes de producción** (script de solo
  lectura: `store_hours`, `pieces_config`, beneficios activos, cupón) y decirlo
  en el informe. → **SF**
- **R-14 Integración, build del hub, publicación y verificación en vivo** con
  `/health` de los dos servicios y el checklist de Manuel. → **SF**

## SPRINT 1 — domingos cerrados (rama `feat/horario-por-dia`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 1 — domingos
> cerrados`** (con `set_session_title` si lo tienes). Después pega debajo la
> PARTE A del plan y ejecuta. Modelo sugerido: Sonnet 5.5.

**Objetivo.** (R-01, R-02, R-03, R-04) Que Depot pueda marcar «domingo cerrado»
sin cerrar el sábado, y que el bot, el Guardián, el prompt y los botones de día
lo respeten. Sale de `origin/main` fresco y abre PR **contra `main`**. No espera
a ningún otro sprint.

**Archivos permitidos:**
- `app/src/services/settings.ts` **solo** la zona de horarios (líneas ~35–200:
  `TimeSchema`, `StorePeriodSchema`, `StoreSchema`, `StoreHoursSchema`,
  `DEFAULT_STORE_HOURS`, `conLocalesDelNegocio`, `getStoreHours`,
  `saveStoreHours`, `podarExcepciones`, `excepcionDelDia`, `algunLocalAbre`,
  `formatStoreHours`). NO toques `PiecesConfigSchema` ni nada después de la
  línea 200: lo edita S2.
- `app/src/negocio/perfil.ts` **solo** `TramoDeHorario` / `HorarioDeLocal` (si
  decides aceptar también 7 días en el perfil; opcional).
- `app/src/agent/tools.ts` **solo** la función `storeSchedule` (líneas ~313–322).
- `app/src/domain/botones.ts` (solo si hace falta; hoy ya recibe el predicado `estaAbierto`).
- `app/test/horariosEspeciales.test.ts`, `app/test/horarioPorDia.test.ts` (nuevo),
  `app/test/botones*.test.ts` si existen y afirman sobre fines de semana.
- `hub/src/screens/Ajustes.tsx` **solo** las interfaces `StorePeriod`/`Store`/
  `StoreHours` (líneas ~63–66), la función `Excepciones` (~640–680) y la función
  `SeccionHorarios` (~681–697). NO toques el bloque de `import` ni el render de
  las pestañas (líneas ~255–290): ahí insertan S2 y S3.
- `BITACORA.md`.

**Prohibido:** `app/src/services/settings.ts` fuera de la zona de horarios
(S2), `app/src/render/**`, `app/src/services/quotePdf.ts`,
`app/src/services/quoteMessages.ts`, `app/src/domain/ahorro.ts`,
`app/src/services/benefits.ts`, `app/src/services/guardian.ts` (S2 y S3),
`app/src/agent/agent.ts`, `app/src/domain/anuncio.ts`, `app/src/server/admin.ts`
(S2 y S3 agregan rutas; tú no necesitas ninguna: `PUT /store-hours` ya existe),
`app/src/agent/prompts.ts`, `app/site/**`.

**Pasos.**
1. **Esquema por día, leyendo lo viejo.** En `settings.ts` define
   `DIAS_SEMANA = ["lun","mar","mie","jue","vie","sab","dom"] as const` y
   `StoreSchema = { dias: Record<Dia, StorePeriod>, excepciones }`. Antes de
   validar, una función pura `normalizarHorarioDeLocal(crudo)` convierte la forma
   vieja `{weekday, weekend}` en 7 días (`weekday` → lun–vie, `weekend` → sab y
   dom) y deja pasar la nueva tal cual. `getStoreHours` y `saveStoreHours` la
   usan; `saveStoreHours` guarda siempre la forma nueva. `DEFAULT_STORE_HOURS`
   sale del perfil (`horarioPorDefecto` sigue en forma vieja: pásalo por la misma
   normalización, así `depot.ts` no cambia).
2. **`algunLocalAbre`** lee el día real (`Intl.DateTimeFormat` con
   `America/Guayaquil`, como hoy) y mira `dias[<ese día>].closed`.
3. **`formatStoreHours`** agrupa días consecutivos con el mismo tramo:
   «Cumbayá: lunes a viernes 08:30–17:30; sábado 08:30–14:30; domingo cerrado.
   Quito Sur: lunes a viernes 08:30–17:30; sábado y domingo cerrado.» Exporta
   `horarioEnPalabras(local: StoreHoursDeUnLocal): string` con esa lógica y haz
   que `storeSchedule` en `tools.ts` la llame (hoy repite el formato a mano).
   Los casos especiales (`excepciones`) siguen igual.
4. **Panel.** `SeccionHorarios`: por local, 7 filas (Lunes…Domingo) con
   Abre/Cierra/Cerrado, más un botón «Copiar lunes a martes–viernes». La
   interfaz `StoreHours` pasa a `Record<string, Store>` (ya es un mapa abierto en
   el servidor). `Excepciones` toma el `open/close` por defecto de `dias.lun`.
5. **Tests puros** (`horarioPorDia.test.ts`): (a) la forma vieja de producción
   se lee y `dom.closed` hereda de `weekend`; (b) solo domingo cerrado → sábado
   abierto; (c) `algunLocalAbre` en un domingo con los dos locales cerrados = false
   y `diasSugeridos` salta al lunes; (d) `formatStoreHours` agrupa como en el
   paso 3; (e) `horariosEspeciales.test.ts` actualizado al esquema nuevo.
6. **Simulador** (R-04): base del sim con domingo cerrado en ambos locales,
   cotiza y escribe «paso el domingo». Captura: el bot dice que el domingo no
   atienden y propone lunes; los botones no ofrecen domingo.
7. Bitácora + PR `feat(horarios): un horario por día de la semana`.

**Reglas de dominio** (tests puros):
- `{weekday, weekend}` ⇒ `sab` y `dom` copian `weekend` · `dias.dom.closed` no
  afecta a `sab` · ningún botón de día cae en un día con todos los locales cerrados ·
  el texto nunca dice «sábado y domingo» si difieren.

**Aceptación:** R-01…R-04 con tests verdes, captura de Ajustes con domingo
cerrado y sábado abierto tras recargar, y captura del simulador del paso 6.

## SPRINT 2 — promoción 3x4 (rama `feat/promocion-3x4`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 2 — promoción
> 3x4`**. Después pega debajo la PARTE A del plan y ejecuta. Modelo sugerido:
> Opus 5.5 (toca seis renderizadores y el Guardián).

**Objetivo.** (R-05, R-06, R-07, R-08) Que Depot elija desde Ajustes si la
rebaja se presenta como «25 % de descuento» o como «3x4», y que la pieza, el
PDF, el texto de respaldo, la frase del ahorro, el vendedor y el Guardián digan
lo mismo. La plata NO cambia: el precio sigue saliendo del catálogo (lista vs.
venta); cambia solo cómo se nombra. Sale de `origin/main` fresco y abre PR
**contra `main`**. No espera a ningún otro sprint.

**Archivos permitidos:**
- `app/src/domain/promocion.ts` (nuevo, puro) + `app/test/promocion.test.ts` (nuevo).
- `app/src/services/settings.ts` **solo** `PiecesConfigSchema` / `PiecesConfig` /
  `DEFAULT_PIECES_CONFIG` (líneas ~240–262). NO toques nada entre las líneas 35 y
  200 (horarios: S1).
- `app/src/render/quoteImage.ts` **solo** `PieceTheme` (agregar `promocion?`) y
  el paso de ese campo a `toPosterLine`/posters.
- `app/src/render/diaNoche.ts`, `app/src/render/depotPosters.ts` (insignias y «ahorras»).
- `app/src/services/quotePdf.ts`, `app/src/services/quoteMessages.ts` **solo**
  `buildSingleQuoteMessageDetallado`, `discount`, `porcentaje` y donde se llame `fraseDeAhorro`.
- `app/src/domain/ahorro.ts`, `app/src/services/ahorroVigente.ts`.
- `app/src/services/benefits.ts` **solo** `activeBenefitFactsBlock`.
- `app/src/services/guardian.ts` **solo** el `Promise.all` de beneficios/horarios
  (líneas ~516–519, agrega `getPiecesConfig()`) y el hecho del ahorro (~826–840).
  NO toques el hecho «Anuncio por el que llegó» (~636): es de S3.
- `app/src/server/admin.ts` **solo** `GET /pieces-config` (devuelve también
  `modosPromocion`) y `PUT /pieces-config` (líneas ~1662–1688); la vista previa
  (`/pieces-preview`, ~2017) acepta `promocion=3x4`.
- `app/src/render/preview.ts` (la cotización de ejemplo de la vista previa).
- `hub/src/components/promocion.tsx` (nuevo: `SeccionPromocionModo`).
- `hub/src/screens/Ajustes.tsx` **solo** DOS líneas: (a) un `import` nuevo
  insertado como PRIMERA línea del bloque de imports (antes de `framer-motion`),
  y (b) `<SeccionPromocionModo … />` insertado justo DESPUÉS de
  `<SeccionPromociones … />` en la pestaña «piezas» (~línea 277), pasando el
  modo y un setter que viva junto a `plantilla`/`modo` (puedes añadir el estado
  `promocion` en el mismo `useState` de `plantilla`, ~línea 150, y en `aplicar`).
  Nada más en ese archivo.
- `app/test/plantillaDiaNoche.test.ts`, `app/test/quoteMessages.test.ts`,
  `app/test/guardian.test.ts` (solo los asserts que nombren el %).
- `BITACORA.md`.

**Prohibido:** `app/src/agent/tools.ts` (recibe el campo solo por
`...getPiecesConfig()`), `app/src/agent/agent.ts` (S3), `app/src/agent/prompts.ts`,
`app/src/agent/compactPlaybook.ts`, `app/src/domain/anuncio.ts`,
`app/src/services/settings.ts` líneas 35–200 (S1), `hub/src/screens/Ajustes.tsx`
fuera de las dos líneas dichas (S1 y S3), `app/site/**`, migraciones.

**Pasos.**
1. **Dominio puro** `domain/promocion.ts`: `MODOS_PROMOCION = ["porcentaje","3x4"]`,
   `type ModoPromocion`, y `etiquetaDePromocion(modo, pct: number | null)` →
   `{ clase: "3x4", grande: "3x4", renglones: ["PAGA 3", "LLEVA 4"], frase: "promoción 3x4: paga 3 llantas y lleva 4" }`
   cuando `modo === "3x4"` y `24 ≤ pct ≤ 26`; en cualquier otro caso
   `{ clase: "porcentaje", grande: "−25%", renglones: ["DESCUENTO","HOY"], frase: "25 % de descuento ya aplicado" }`.
   También `advertenciaDe3x4(pct)` para el panel. Tests: los cuatro cuadrantes
   (modo × pct), pct null, 23 y 27 caen a porcentaje.
2. **Config**: `PiecesConfigSchema` gana
   `promocion: z.object({ modo: z.enum(MODOS_PROMOCION).default("porcentaje") }).default({})`.
   Lo guardado hoy (sin el campo) sigue validando. `GET /pieces-config` devuelve
   `modosPromocion`.
3. **Piezas**: `PieceTheme.promocion` llega solo a `renderQuoteImage` y
   `renderOptionsImage`. En `diaNoche.ts` la insignia dorada (~479–500) y el
   `ahorras` por tarjeta usan `etiquetaDePromocion`; en `depotPosters.ts`
   `savingsPct`/`savingsBadge` igual. En `porcentaje` el PNG tiene que ser
   byte-idéntico al de hoy (los tests existentes lo afirman por texto).
4. **PDF y texto de respaldo**: `quotePdf.ts` (líneas 207 y 326) y
   `buildSingleQuoteMessageDetallado` reciben el modo (parámetro opcional, default
   `porcentaje`, para no tocar `tools.ts`): en `3x4` dicen «3x4 · paga 3 lleva 4»
   donde hoy dicen «−25%».
5. **Frase del ahorro**: `AhorroDeLaCotizacion` gana `modo?: ModoPromocion` (opcional, para no tocar a quien ya lo consume);
   `ahorroVigente` lo llena con `getPiecesConfig()`; `fraseDeAhorro` dice
   «*promoción 3x4* (paga 3 llantas y lleva 4), *$X* menos» o lo de siempre. Así
   `directSalesRoutes.ts:277`, `quoteMessages.ts:372` y `prepararSalida.ts:888`
   no cambian.
6. **Vendedor y Guardián**: `activeBenefitFactsBlock` agrega una línea
   «PROMOCIÓN VIGENTE (fuente determinística): se presenta como 3x4 — paga 3
   llantas y lleva 4; es el mismo precio que imprime la cotización; si preguntan
   por el 25 %, es lo mismo». El hecho del ahorro en `guardian.ts` nombra el modo
   igual, y añade: «confirmar que 3x4 y 25 % son la misma rebaja NO es error».
7. **Panel**: `SeccionPromocionModo` (dos botones, como las plantillas) + la
   vista previa pide `promocion=` y se ve al instante; aviso de R-07 si la llanta
   de ejemplo no está en 24–26 %.
8. **Simulador** (R-08): con el modo `3x4` guardado en la base del sim, pide una
   cotización y pregunta «¿tienen el 3x4?»: captura de la pieza con «3x4» y de la
   respuesta; después vuelve a `porcentaje` y confirma que la pieza vuelve a «−25%».
9. Bitácora + PR `feat(promocion): el descuento se puede presentar como 3x4`.

**Reglas de dominio** (tests puros):
- modo `porcentaje` ⇒ salida idéntica a hoy · `3x4` solo con pct ∈ [24, 26] ·
  el total y el precio por llanta no cambian con el modo · lo guardado sin
  `promocion` valida como `porcentaje`.

**Aceptación:** R-05…R-08 con tests verdes, captura de la vista previa en los dos
modos (clásica y día/noche), PDF del simulador en 3x4, y la respuesta del bot a
«¿tienen el 3x4?» con el Guardián encendido.

## SPRINT 3 — anuncios activos (rama `feat/anuncios-activos`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 3 — anuncios
> activos`**. Después pega debajo la PARTE A del plan y ejecuta. Modelo
> sugerido: Sonnet 5.5.

**Objetivo.** (R-09, R-10, R-11, R-12) Que Depot cargue en Ajustes qué anuncio
está corriendo y qué muestra, vea qué anuncios están trayendo chats, y que el
vendedor y el Guardián lo sepan cuando el cliente dice «la del anuncio». Sale de
`origin/main` fresco y abre PR **contra `main`**. No espera a ningún otro sprint.

**Archivos permitidos:**
- `app/src/domain/anunciosActivos.ts` (nuevo, puro) + `app/test/anunciosActivos.test.ts` (nuevo).
- `app/src/services/anunciosActivos.ts` (nuevo: get/save en `settings.anuncios_activos`,
  cache 30 s como los demás, y `anunciosVistos(dias)` que agrega
  `messages.metadata->'anuncio'` por `sourceId`+título+texto).
- `app/src/domain/anuncio.ts` **solo** `hechoDelAnuncio` (parámetro opcional con
  los activos) + `app/test/anuncio.test.ts`.
- `app/src/agent/agent.ts` **solo** las líneas ~625–635 (donde se arma el
  mensaje de sistema del anuncio) y el `import`. NO toques el `Promise.all` de
  ~194–205.
- `app/src/services/guardian.ts` **solo** la zona del hecho existente
  «Anuncio por el que llegó» (~línea 636) y la línea donde ese `anuncio` se lee
  (`anuncioDeLaConversacion`): ahí sumas los activos con un `await` propio.
  NO toques el `Promise.all` de ~516–519 ni ~826–840 (S2).
- `app/src/server/admin.ts` **solo** rutas nuevas `GET/PUT /anuncios-activos` y
  `GET /anuncios-vistos`, insertadas justo DESPUÉS del handler
  `PUT /store-hours` (~línea 1769). No toques `/pieces-config` (S2).
- `hub/src/components/anuncios.tsx` (nuevo: `SeccionAnuncios`).
- `hub/src/screens/Ajustes.tsx` **solo** DOS líneas: (a) un `import` nuevo
  insertado como ÚLTIMA línea del bloque de imports (después de
  `./Settings`), y (b) `<SeccionAnuncios onError={setError} />` insertado justo
  DESPUÉS de `<SeccionCupones onError={setError} />` en la pestaña «negocio»
  (~línea 261). Nada más en ese archivo.
- `BITACORA.md`.

**Prohibido:** `app/src/services/settings.ts` (S1 y S2), `app/src/render/**`,
`app/src/services/quote*.ts`, `app/src/domain/ahorro.ts`, `app/src/services/benefits.ts`,
`app/src/agent/tools.ts` (sigue leyendo el anuncio del chat como hoy),
`app/src/services/linkPreview.ts` (no se lee el link: Meta pide login),
`app/src/index.ts`, `hub/src/screens/Ajustes.tsx` fuera de las dos líneas,
`hub/src/screens/TicketDetail.tsx`, `hub/src/data/types.ts`, `app/site/**`, migraciones.

**Pasos.**
1. **Dominio puro** `domain/anunciosActivos.ts`: tipo
   `AnuncioActivo = { id: string; link: string | null; descripcion: string; activo: boolean; hasta: string | null }`
   (zod, `descripcion` 10–400 caracteres obligatoria, máx. 20 anuncios),
   `vigentes(lista, hoy)`, `coincide(anuncio, referral)` (por `sourceId`
   contenido en el link, o por link normalizado = `url` del referral) y
   `hechoDeAnunciosActivos(lista, referralDelChat)` → texto:
   «ANUNCIOS VIGENTES (cargados por el negocio): 1) Kenda Klever KR601, camioneta,
   rin 15–17, promoción 3x4. …». Si uno coincide con el referral: «El cliente
   llegó por el anuncio 1». Regla para el vendedor: «la del anuncio» = esa
   descripción; si hay varios y ninguno coincide, pregunta cuál. Tests: sin
   activos → null; vencido → fuera; coincidencia por sourceId y por link;
   texto estable.
2. **Servicio** `services/anunciosActivos.ts`: `getAnunciosActivos`,
   `saveAnunciosActivos` (valida con zod, poda vencidos > 30 días),
   `anunciosVistos(14)` (solo `select`).
3. **Hechos**: en `agent.ts` el mensaje de sistema del anuncio se arma con
   `hechoDelAnuncio(anuncio, activos)` o, sin referral pero con activos, con
   `hechoDeAnunciosActivos(activos, null)`. En `guardian.ts` el mismo texto como
   hecho (para que no tache «la Kenda del anuncio»).
4. **Rutas** en `admin.ts` (después de `PUT /store-hours`): `GET /anuncios-activos`
   → `{ ok, anuncios }`; `PUT /anuncios-activos` (lista completa) → 400 con
   mensaje claro si no valida; `GET /anuncios-vistos?dias=14` →
   `{ ok, vistos: [{ sourceId, titulo, texto, url, chats, ultimo }] }`.
5. **Panel** `SeccionAnuncios` (pestaña Negocio): lista editable (descripción,
   link, activo, hasta, borrar) con botón Guardar; debajo «Anuncios que están
   llegando (14 días)» con «Usar como activo» que precarga descripción = texto
   del anuncio y link = url. Nota visible (R-12): «El link no se puede leer
   automáticamente (Meta pide iniciar sesión): lo que manda es la descripción».
6. **Simulador** (R-11): carga un anuncio activo «Kenda Klever KR601, camioneta,
   promoción 3x4» en la base del sim; sin referral escribe «quiero la llanta del
   anuncio en rin 16»: captura de que busca Kenda KR601 (o su tipo) y no pregunta
   cuál. Repite con un referral de prueba (el fixture `deFeed` de
   `test/anuncio.test.ts`) si el sim lo permite.
7. Bitácora + PR `feat(anuncios): anuncios activos cargados por el negocio`.

**Reglas de dominio** (tests puros):
- sin activos el hecho es null (el prompt no crece) · vencido = no vigente ·
  coincidencia por `sourceId` gana sobre link · descripción obligatoria.

**Aceptación:** R-09…R-12 con tests verdes, captura de la sección con un anuncio
activo y la lista de vistos, y la respuesta del simulador del paso 6.

## SPRINT FINAL — revisión, merge y publicación (rama `release/promo-horarios-anuncios-2026-10`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint Final — revisión
> y merge`**. Lo corre Fable 5.1 (el chat que escribió este plan) cuando los tres
> sprints tengan PR abierto. Debajo pega la PARTE A y ejecuta.

**Objetivo.** Que nada se pierda y todo funcione junto: revisar los PRs S1–S3
contra la PARTE B, probarlos juntos en el simulador, mergear, construir el hub,
publicar y verificar en vivo, y entregar a Manuel el checklist de prueba.
Todos los PRs salen de `main` y van contra `main`: **sin orden obligatorio**;
el que falte no se mergea y los demás siguen.

**Pasos.**
1. **Inventario.** `gh pr list --state open` → tabla PR ↔ sprint ↔ R-xx. Por
   PR: diff completo; ¿solo archivos y zonas permitidos?; ¿tests?; ¿bitácora?;
   ¿build del hub fuera del commit?
2. **Lo que Depot dejó en producción (R-13).** Script de SOLO LECTURA (patrón de
   la PARTE A de `PLAN-METRICAS-COMPROBABLES`) que imprima `settings.store_hours`,
   `pieces_config`, beneficios activos y `coupon_config`. Anótalo en el informe:
   si ya escribieron «3x4» como beneficio, decidir con Manuel si se borra al
   activar el modo.
3. **Revisión por PR, en paralelo, una lente por agente:** corrección
   (reproducir cada R-xx en el simulador), compatibilidad hacia atrás (la forma
   vieja de `store_hours` y `pieces_config` sin `promocion`), regresión (modo
   `porcentaje` idéntico a hoy; chats sin anuncio sin cambios en el prompt),
   Guardián (ningún hecho nuevo que lo haga tachar lo correcto), copy del panel.
   Bloqueantes → commit en la misma rama → re-verificar.
4. **Merge** en `release/promo-horarios-anuncios-2026-10` desde `origin/main`:
   primero S1 (aislado), luego S3, por último S2 (más superficie). Tras cada
   merge: `npm run typecheck` + `npx vitest run`; al final suite completa con
   Postgres local, `npm run sim:humo` y `test/simuladorFidelidad.test.ts`.
   Resolver los conflictos de `Ajustes.tsx` (dos imports, dos JSX), `admin.ts`,
   `guardian.ts` y `BITACORA.md` conservando ambos lados.
5. **Prueba conjunta en el simulador** con la configuración de los tres: domingo
   cerrado + modo 3x4 + un anuncio activo. Conversación completa: «la llanta del
   anuncio en rin 16» → opciones → cotiza → «¿tienen el 3x4?» → «paso el domingo».
   Guardián encendido. Capturas de pieza, PDF y respuestas.
6. **Build del hub** una sola vez: `cd hub && npm run build`; commitear
   `app/site/admin` en la rama release.
7. **Publicación.** PR `release/… → main`, merge, esperar deploy; `/health` de
   `autoventa-staging.up.railway.app` y `autoventa-depottire.up.railway.app` con el
   commit nuevo en `version.commit`.
8. **Configurar en producción lo que Depot pidió** (solo si Manuel lo confirma
   en el chat): domingo cerrado en Ajustes, modo 3x4 mientras dure el feriado, y
   el anuncio vigente si Joaquín manda la descripción.
9. **Informe final** en la bitácora y en el chat: tabla R-01…R-14 con ✅/⚠️/❌ +
   evidencia, y el checklist de Manuel (sección siguiente) con lo que ya quedó
   verificado marcado.

**Archivos permitidos:** todos (es el que integra). **Prohibido:** nada.
**Aceptación:** R-13, R-14 y todos los R-xx de S1–S3 en ✅ con evidencia;
producción = main; checklist entregado.

## Checklist de pruebas para Manuel (después de publicar)

Ajustes → Negocio → Horarios
- [ ] Cada local muestra 7 filas (lunes…domingo), no dos.
- [ ] Marcar «Cerrado» solo en domingo de los dos locales, guardar, recargar: domingo sigue cerrado y sábado abierto.
- [ ] «Copiar lunes a martes–viernes» copia la hora y no toca sábado ni domingo.
- [ ] Los casos especiales (feriados) siguen funcionando igual.
- [ ] En WhatsApp (o el simulador): pedir una cotización un jueves/viernes y mirar los botones de día: no aparece «El domingo».
- [ ] Escribir «paso el domingo»: el bot dice que el domingo no atienden y propone el lunes.
- [ ] Ajustes → Seguimientos: destildar «Dom» en «Horarios de seguimiento» (eso es otro ajuste: cuándo escribe el bot solo).

Ajustes → Piezas → Promoción
- [ ] Aparece el selector «25 % de descuento / 3x4» junto a la plantilla.
- [ ] Al elegir 3x4 la vista previa cambia al instante (clásica y día/noche) y la insignia dice «3x4 · PAGA 3 LLEVA 4».
- [ ] Al aplicar y pedir una cotización real, la imagen y el PDF traen «3x4»; el total es el mismo que con 25 %.
- [ ] Preguntarle al bot «¿tienen el 3x4?»: dice que sí y que es la rebaja ya aplicada, sin inventar un monto distinto.
- [ ] Preguntarle «¿y el 25 %?»: explica que es lo mismo.
- [ ] Volver a «25 %» y confirmar que la pieza vuelve a «−25% DESCUENTO HOY».
- [ ] Si una llanta tiene otro descuento (no 25 %), la pieza muestra el porcentaje y no «3x4».

Ajustes → Negocio → Anuncios
- [ ] Cargar un anuncio con descripción («Kenda Klever KR601, camioneta, promoción 3x4»), activo, guardar, recargar: sigue.
- [ ] La lista «Anuncios que están llegando» muestra los últimos 14 días con cuántos chats trajo cada uno.
- [ ] «Usar como activo» precarga descripción y link.
- [ ] Guardar sin descripción da error claro.
- [ ] En WhatsApp: escribir «quiero la llanta del anuncio en rin 16»: ofrece la Kenda KR601 (o su tipo en ese aro), no pregunta «¿cuál anuncio?».
- [ ] Desactivar el anuncio y repetir: el bot pregunta cuál.

General
- [ ] `/health` de los dos servicios muestra el commit nuevo.
- [ ] Un chat viejo con cotización del 25 % se sigue viendo bien en el panel.
- [ ] El Guardián no tacha «3x4» ni «la del anuncio» (mirar el informe del Guardián en Ajustes).

## Qué hace cada sprint

| Sprint | Rama | Qué entrega | Pedidos |
|---|---|---|---|
| **S1 — domingos cerrados** | `feat/horario-por-dia` | Horarios por día de la semana en Ajustes; el bot, el Guardián y los botones de día respetan «domingo cerrado» sin cerrar el sábado | P-01 |
| **S2 — promoción 3x4** | `feat/promocion-3x4` | Selector «25 % / 3x4» en Ajustes → Piezas; la cotización, el PDF, el texto y el bot lo nombran igual; el Guardián no lo tacha; la plata no cambia | P-02 |
| **S3 — anuncios activos** | `feat/anuncios-activos` | Depot carga qué muestra cada anuncio y ve cuáles están llegando; «la llanta del anuncio» se entiende; el link no se lee solo y el panel lo dice | P-03 |
| **Sprint Final — revisión y merge** (Fable) | mergea a `main` | Lee lo que Depot dejó en Ajustes de producción, revisa los 3 PRs contra R-01…R-14, prueba los tres juntos en el simulador, construye el hub, publica, verifica `/health` y entrega el checklist | P-04, P-05 + verificación |

## Apéndice — Paralelismo

**Todos los sprints numerados corren a la vez; el SPRINT FINAL se corre cuando
los tres tengan PR.** No hay contratos entre sprints: cada uno lee y escribe su
propia clave de `settings`.

| Archivo caliente | S1 | S2 | S3 |
|---|---|---|---|
| `app/src/services/settings.ts` | líneas 35–200 (horarios) | líneas 240–262 (`PiecesConfigSchema`) | — |
| `app/src/agent/tools.ts` | solo `storeSchedule` (313–322) | — (recibe el campo por `getPiecesConfig()`) | — |
| `app/src/agent/agent.ts` | — | — | solo 625–635 + import |
| `app/src/services/guardian.ts` | — | 516–519 y 826–840 | hecho «Anuncio por el que llegó» (~636) + donde se lee el anuncio |
| `app/src/server/admin.ts` | — (usa `PUT /store-hours` existente) | 1662–1688 (`pieces-config`) + `/pieces-preview` | rutas nuevas tras `PUT /store-hours` (~1769) |
| `hub/src/screens/Ajustes.tsx` | interfaces 63–66, `Excepciones`, `SeccionHorarios` 681–697 | import PRIMERO + 1 JSX tras `SeccionPromociones` (~277) + estado junto a `plantilla` | import ÚLTIMO + 1 JSX tras `SeccionCupones` (~261) |
| `BITACORA.md` | entrada propia | entrada propia | entrada propia |
| `app/site/admin/**` | nadie | nadie | nadie (lo construye SF) |
