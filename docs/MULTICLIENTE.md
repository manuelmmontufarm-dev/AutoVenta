# MULTICLIENTE — Depot Tire y Mundillantas/Competimotor sobre el mismo AutoVenta

> **Estado:** documento de arranque (4-nov-2026). Fuente única para los sprints de
> `docs/planning/PLAN-MULTICLIENTE-MASTER-PROMPT.md`.
> **Fuentes.** El pitch del 4-nov ([transcripción](reuniones/2026-11-04-mundillantas-competimotor.md)),
> la ficha pública del cliente ([mundillantas.md](clientes/mundillantas.md)), la investigación de
> Fénix ([integraciones/FENIX.md](integraciones/FENIX.md)) y el código en `origin/main` = `dc50dab`.
> No hay ningún commit anterior que hable de un segundo cliente: el perfil de negocio se hizo el
> 24-sep-2026 (`456889b`, `34aa0cb`) pensando en esto, pero nunca se probó con otro perfil.

---

## 1. Qué se pidió y qué significa

| Dicho por Manuel (4-nov) | Implicación |
|---|---|
| «Las dos empresas bajo AutoVenta, que los arreglos del bot apliquen a las dos.» | **Un solo código.** Nada de copiar el repo ni un «sub-repo»: una copia se queda atrás en el primer arreglo. |
| «Cada una con su modalidad de trabajo.» | Lo que cambia de un cliente a otro vive en **su carpeta de cliente** (perfil + política + assets), nunca en el prompt ni en el código común. |
| «Flexibilidad donde sabemos que va a haber cambios.» | Cada cosa que todavía no sabemos de Mundillantas tiene **una perilla con lugar fijo** (tabla §3.2). Cambiarla es editar un archivo o un ajuste, no reescribir el bot. |
| «Aprender cómo operan en las 2 semanas y al final tener todo armado.» | Una lista de arranque ([clientes/mundillantas-arranque.md](clientes/mundillantas-arranque.md)) que liga cada pregunta al cliente con la perilla que llena. |

**Por qué no un sub-repo.** El código ya está pensado para «una instancia por cliente»:
`app/src/negocio/index.ts:1-10` — cada cliente es su propio servicio de Railway con su propia base,
y la variable `NEGOCIO` elige su perfil al arrancar. El mismo commit de `main` corre en los dos
servicios: un arreglo del bot llega a los dos en el mismo deploy. Lo que se separa es **dato**, no
código.

## 2. Cómo funciona hoy (lo que se reutiliza tal cual)

- **Perfil de negocio** — `app/src/negocio/perfil.ts` (la forma) y `negocios/depot.ts` (los valores):
  nombre, ciudad, teléfono, horarios, marcas, locales (N, con patrones de cómo los nombra el
  cliente), sectores de la ciudad, IVA, garantías, nombre del vendedor, pies de las piezas,
  facturación. `negocios/ejemplo.ts` es la plantilla. Un `NEGOCIO` mal escrito no arranca
  (`negocio/index.ts:27-35`).
- **Ajustes editables sin deploy** (tabla `settings` y tablas de config): estilo de la IA, horarios
  por local con excepciones, piezas (paleta, fuente, plantilla), cupones, guardián, fases, encendido
  del bot, niveles de aviso, usuarios del panel, canal de WhatsApp, anuncios activos, prompts por
  etapa, `benefits` (lo que «incluye» la compra), `brand_profiles`, `advisors`, políticas y
  plantillas de seguimiento.
- **Despliegue por cliente** — un servicio web (`app/railway.toml`) + Postgres propio, el panel (hub)
  servido por el mismo servicio (`server/webhook.ts:222-226`, todas las llamadas a `/api/...`
  relativas), credenciales de WhatsApp pegadas en el panel. Receta: `docs/entrega-fases-depot.md:50-70`
  y `docs/CONECTAR_WHATSAPP_CLIENTE.md` (la app de Meta va en el portafolio DEL CLIENTE).
- **Simulador** — `npm run sim` copia la configuración de un servicio de producción (por defecto
  Depot, cambiable con `--entorno-prod/--servicio-prod`, `scripts/sim/lib/entorno-prod.mjs:64-69`).

## 3. Qué falta para que el segundo cliente sea configuración

### 3.1 Lo que todavía es Depot dentro del código (hallazgos con archivo:línea)

| Tema | Dónde | Efecto en Mundillantas si no se toca |
|---|---|---|
| Una sola identidad | `negocio.nombre` en `domain/saludo.ts:65,80`, `domain/cierrePerdido.ts:82`, `domain/coupons.ts:71`, `render/assets.ts:277`, `render/depotDesign.ts:271` | No puede presentarse como Mundillantas **y** Competimotor, ni poner el logo del local elegido |
| Garantías | `services/quoteMessages.ts:671-691` (Falken 18 / Kenda 12 / Winrun 6 meses). El campo `garantias` del perfil **no lo lee nadie** (`config.ts:102`) | Les cotiza con las garantías de Depot |
| Formas de pago | `domain/datosDelNegocio.ts:51-61` → prompt (`prompts.ts:36`), guardián (`guardian.ts:311`), `respaldo_marcas` | Promete «3 y 6 meses sin intereses» de Depot |
| Pagos inyectados en la salida | `services/prepararSalida.ts:819-871`: los pasos `sin_descuento_negado` y `el_pago_se_responde` pegan `politicaDePagos()` de Depot en `:830` y `:870` | Aunque la política no tenga cuotas, la respuesta sale con «3 y 6 meses sin intereses» |
| Juego de 4 y productos fuera de catálogo | `domain/opcionesCandados.ts:134` (juego = 4), `domain/alcanceComercial.ts` | No se sabe si Mundillantas vende de a 4 ni qué productos deriva al asesor |
| Beneficio de redes | `domain/beneficioDeRedes.ts:36-41` (usado en `prepararSalida.ts:917`) | Promete alineación + rotación gratis a los 10.000 km |
| Cobertura y lugares | `domain/fueraDeCobertura.ts:106,121-125` (Quito), `compraADistancia.ts:35`, `agent/faseOperativa.ts:37`, `domain/storeSelection.ts:101,112` (`cumbaya`/`sur` en regex) | Trata Santo Domingo como «fuera de cobertura»; no detecta que se preguntó el local |
| Textos con Quito/Depot | `agent/prompts.ts:30,53`, `agent/compactPlaybook.ts:27`, `services/guardian.ts:239,251,280`, `agent/tools.ts:1022,1295,1301,1324-1328,3517-3520`, `domain/fitmentResearch.ts:145`, `services/vehicleFitmentResearch.ts:125`, `domain/transcripcionEco.ts:22-23` | «vendedor quiteño», «los dos locales», «Manuel ya fue notificado», «fuera de Quito» |
| Escalera de marcas | `domain/escalera.ts:48` (`assets/escalera-precio.json` global), `tools.ts:324-460` (`ESCALONES`, `etiquetaEscalon`, `tresOpciones`, `escaleraPorUso`), y el orden de marcas de `domain/tireTypes.ts:73-75` (`assets/base_llantas_tipos.json` global) | Con ~10 marcas que la escalera no conoce, las 3 opciones (premium/equilibrio/económica) salen mal |
| Conocimiento de marcas | `domain/respaldoMarcas.ts` (`assets/conocimiento-marcas.json` global) | Habla de Falken/Kenda/Winrun |
| Piezas | `render/depotPosters.ts:249,451,721`, `render/diaNoche.ts:264-267,812`, `services/quotePdf.ts:146,336,423,576-582`, `services/quoteMessages.ts:531,568,646-647,751-753`, `render/depotDesign.ts:161-230,485-498` | «IVA y Ecovalor», «Precio directo de distribuidor», colores/emojis de marcas de Depot |
| Catálogo | `services/catalog.ts:229-257` (if Contífico / else Sheets, sin interfaz), estado solo en memoria (`:41`) | Fénix local no tiene API: no hay cómo cargar su inventario salvo armar una Google Sheet a mano |
| Precios de Interbot | `services/interbotPrices.ts:81-83` (ruta) y `:85-101` (`loadSnapshot`) cargan `assets/precios-interbot.json` **siempre**, y `services/catalog.ts:190-202` pisa precios por código | Si un código de Fénix coincide con uno de Depot, cotiza el precio de Depot |
| Facturas y Métricas comprobables | `services/ventasConfirmadas.ts:38` (regex `LLANTA` no lee `33X12.5R17` ni `7.00R15`), `:111-112` (serie 001/002 = local de Depot), `:278-323` (solo Contífico), `metricasComprobables.ts:370` | Sin facturas no hay ventas comprobadas ni estadísticas |
| Herramientas por etapa | `agent/agent.ts` solo le ofrece al modelo las herramientas de los `allowedTools` publicados por etapa (`services/settings.ts:510-628` por defecto); `mostrarPorAro.ts:52-58` y `agent.ts:556,847` mandan todo «aro N» a la búsqueda de llantas | Una herramienta nueva (`buscar_aros`) nunca llegaría al modelo, y «tienen aros de 15?» saldría como ficha de llantas |
| Otras ciudades | `domain/ubicacionPedida.ts:58-83` y la lista de `fueraDeCobertura.ts:40-60` cuentan Santo Domingo como otra ciudad | «Soy de Santo Domingo» se trataría como un cliente lejano |
| Cupón | `domain/coupons.ts:115-123`: el normalizador de caja quita el literal `DT` | Un cupón de otro negocio no se valida en caja |
| Logo | `render/assets.ts` y los que usan `DEPOT_LOGO_RATIO` dibujan todo logo con la proporción 422×132 de Depot; las piezas no reciben la conversación ni el local (`PieceTheme` no tiene local) | Los logos de Mundillantas saldrían deformados y siempre el de la presentación |
| Aros | `domain/aros.ts` y `services/mostrarPorAro.ts` solo entienden «aro» como el rin de una llanta; las filas sin medida de llanta se descartan (`services/catalog.ts:78-82,159-164`) | No se puede cotizar un aro, que es el segundo producto que pidió Jenny |
| Ancho + aro sin perfil | `buscar_por_aro_y_tipo` (`agent/tools.ts:1078-1290`) no recibe ancho, y la ruta directa sin modelo (`services/mostrarPorAro.ts:92`) la llama solo con el aro; existe el caso «perfil + aro sin ancho» (`tools.ts:1663,1778`) pero no «ancho + aro sin perfil» | El error de la demo: «235 rin 15» → 205/65, 185/65, 195/55 (afecta también a Depot) |
| Panel | `hub/src/App.tsx:142`, `hub/index.html:17-18`, `hub/public/manifest.webmanifest:2-4`, `hub/src/components/tour.tsx:50`, `hub/src/components/chat.tsx:396,454` (teléfono de Depot), `hub/src/data/types.ts:501-518` (`LOCALES`, `MARCAS`), `hub/src/data/catalog.ts:250`, `hub/src/screens/Ajustes.tsx:79,95,713` (horarios **solo** de Cumbayá y Quito Sur), `hub/src/screens/Settings.tsx:4` (muestra el playbook de Depot horneado en el build) | El panel de Mundillantas dice Depot y no deja cargar sus horarios |
| Usuarios y PIN | `services/hubUsers.ts:76-83` (siembra manuel/andres/joaquin/asesor), `server/auth.ts:40` (PIN `"1234"` en el código) | Los Tamayo aparecen en el login de Mundillantas |
| Asesores por local | `advisors` no tiene local (`db/migrations/010_advisors.ts`, `018_roles_de_asesor.ts`) | Todos los asesores reciben todo; en el pitch se prometió «avisa al asesor correcto» |
| Base nueva | `db/seed-depot.ts` es solo de Depot; el simulador exige `guardian_config`, `ai_config`, `pieces_config`, `store_hours` y prompts por etapa (`scripts/sim/sim.mjs:483-496`); la migración `009_brand_profiles.ts` siembra los perfiles de FALKEN/KENDA/WINRUN de Depot en cualquier base nueva | Una base vacía no sirve ni para el bot ni para el simulador |
| Pruebas | 97 de 247 archivos de `app/test` nombran Depot/Cumbayá/Martín; **ninguna** corre con otro perfil (`test/perfilDelNegocio.test.ts:178-193` muta el de Depot) | Nada avisa si un cambio vuelve a clavar Depot en el código |

Lo que **no** cambia y es una ventaja: Santo Domingo de los Tsáchilas está en Ecuador, así que los
~60 `America/Guayaquil`, los 33 `es-EC`, el IVA de 15 %, el dólar y el manejo de teléfonos `593`
(`candadosDeTexto.ts:61`) sirven tal cual. Todo lo que se aprendió de los errores de Depot (cómo se
lee una medida, cuándo un «sí» autoriza, el guardián, los seguimientos) aplica a Mundillantas sin
tocar nada.

### 3.2 La carpeta de cliente y las perillas (nombres decididos — los sprints NO los inventan)

Un cliente = **cuatro lugares**, siempre los mismos:

| Lugar | Qué va | Cambiarlo |
|---|---|---|
| `app/src/negocio/negocios/<id>.ts` | **Perfil**: quién es (identidades/marcas comerciales, locales, sectores, teléfonos, horarios de arranque, IVA, garantías, vendedor, pies de piezas, facturación) | Editar + push (sale a todos los servicios, solo cambia el que tiene ese `NEGOCIO`) |
| `app/src/negocio/politicas/<id>.ts` | **Política comercial**: formas de pago, beneficio de redes, envíos, servicios que ofrece, región/gentilicio, escalera de marcas | Igual |
| `app/assets/<id>/` | **Archivos**: `logo-blanco.png` (y `logo-<identidad>.png`), `escalera-precio.json`, `conocimiento-marcas.json`, `base_llantas_tipos.json`, `precios-interbot.json` (solo Depot). Si falta, se usa `app/assets/<archivo>` común | Subir el archivo + push |
| Ajustes (base del servicio) | Lo que el dueño toca: horarios por local, beneficios incluidos, perfiles de marca, cupones, asesores por local, mapeo de columnas del catálogo, catálogo subido | Desde el panel, sin deploy |

Los nombres nuevos, fijados acá:

- **`NEGOCIO=mundillantas`**, perfil `MUNDILLANTAS` en `negocios/mundillantas.ts`.
- **`Identidad`** (en `perfil.ts`): `{ id: string; nombre: string; locales: string[] /* slugs */; logo?: string /* archivo en assets/<id>/ */ }`.
  `PerfilDeNegocio.identidades?: Identidad[]` — sin el campo, hay una sola identidad = `nombre` (Depot no cambia).
  `PerfilDeNegocio.presentacion?: { modo: "combinada" | "fija"; identidad?: string; frase?: string }` — cómo se presenta el bot
  antes de que el cliente elija local. Mundillantas arranca en `combinada` con la frase «Mundillantas y Competimotor».
- Helpers puros en **`app/src/negocio/identidad.ts`**: `identidades(perfil)`, `identidadDelLocal(perfil, slugONombre)`,
  `identidadDeLaConversacion(perfil, nearestStore)`, `nombresDelNegocio(perfil)` (todas las identidades, para detectores y
  `palabrasDeLugarPropias`), `faltantesDelPerfil(perfil): string[]` (lo que todavía es `[PENDIENTE]`).
- **`PoliticaComercial`** en **`app/src/negocio/politica.ts`**, elegida por `negocio.id` (`politica` exportada), valores en
  `negocio/politicas/{depot,ejemplo,mundillantas}.ts`. Campos: `formasDePago: string[]`, `cuotasSinIntereses: string | null`,
  `descuentoEnEfectivo: string | null`, `beneficioDeRedes: string | null`, `vendeADistancia: boolean`,
  `serviciosQueOfrece: string[]`, `gentilicio: string` («quiteño»), `variedadDeEspanol: string` («Español de Ecuador»),
  `juegoCompleto: number` (4), `escalonPorPrecio: boolean` (Depot `false`), `productosQueDerivaAlAsesor: string[]`,
  `asesorEnReglas: string` («Manuel»). Exporta `faltantesDeLaPolitica(politica)`. Solo literales: la empaqueta el panel.
  Depot sale **idéntico** a hoy. Los textos de pago de `perfil.piezas` son solo texto de pieza; **la verdad comercial es `politica`**.
- Helper de assets en **`app/src/negocio/assets.ts`**: `rutaDeAsset(nombre)` → `assets/<negocio.id>/<nombre>` si existe, si no `assets/<nombre>`.
- **Fuentes de datos** en **`app/src/services/fuentes/`**: `tipos.ts` (`IdFuente = "contifico" | "sheets" | "archivo"`,
  `FuenteDeCatalogo`, `FuenteDeFacturas`, `FacturaVenta`), `index.ts` (`fuenteDeCatalogo()`, `fuenteDeFacturas()`, elegidas al
  arrancar: Contífico si hay `CONTIFICO_API_KEY`; si no, `archivo` si hay catálogo subido; si no, Sheets si hay `CATALOG_SHEET_ID`),
  `contifico.ts`, `sheets.ts`, `archivo.ts`. La fuente se evalúa **en cada sincronización** (subir un catálogo no pide reinicio).
- Ajustes nuevos (claves de `settings`): **`catalogo_archivo`** (último catálogo subido: nombre, fecha, filas normalizadas),
  **`catalogo_mapeo`** (qué columna del Excel es medida/marca/diseño/código/precio/precio de lista/precio mínimo/stock/foto/tipo, si
  el precio trae IVA, qué filas son aros), **`facturas_mapeo`** (lo mismo para el Excel de facturas), **`asesores_por_local`** (`{ [slugDeLocal]: number[] /* advisor ids */ }`).
- Tabla nueva **`facturas_importadas`** (migración `031_facturas_importadas.ts`, la ÚNICA migración del plan): una fila por factura
  subida (documento, día, hora, total, subtotal, cliente, teléfonos, líneas jsonb, local, archivo de origen). Es DATO de clientes:
  va en `TABLAS_DATOS` del simulador.
- Producto aro: **`AroProducto`** en `app/src/domain/aroProducto.ts` (`{ id, codigo, nombre, marca, diametro, ancho?, pernos?, offset?, acabado?, precio, stock, imageUrl }`),
  en una lista aparte del catálogo de llantas (`arosDelCatalogo()`), nunca mezclado con las búsquedas de llantas. Herramienta
  **`buscar_aros`** en `app/src/agent/herramientasAros.ts`, y detector **`pideAroComoProducto(texto)`**. Solo existen si el catálogo
  trae aros: Depot no los ve.
- Piezas: **`PieceTheme.identidad?`** (opcional; sin ella, la de la presentación). Cupón: **un prefijo por negocio**.
- Endpoint **`GET /api/negocio`** (archivo `app/src/server/negocioPublico.ts`), con la misma credencial que el resto del panel:
  `{ id, nombre, ciudad, telefono, identidades: [{ id, nombre, locales: string[] }], locales: [{ slug, nombre, nombreCorto, claveHorario }], marcas: string[], vendedor: { nombre }, playbook: string, faltantes: string[] }`.
- Variable nueva **`HUB_PIN`** (la ÚNICA del plan): reemplaza el `"1234"` de `server/auth.ts:40`; sin ella sigue `"1234"`.

### 3.3 Cómo atiende Mundillantas (flujo decidido para la prueba)

1. **Un solo número de WhatsApp** para las dos marcas (el que elijan para ventas). El bot se presenta
   «Soy <vendedor>, de Mundillantas y Competimotor» (`presentacion.modo = "combinada"`).
   *Alternativa descartada por ahora:* un número por marca → exige rutear por `phone_number_id`
   dentro de un servicio, que hoy no existe (`docs/PENDIENTES.md:90-100`). Queda como perilla
   futura; si lo piden, se cambia `presentacion.modo` a `fija` por servicio o se hace ese ruteo.
2. Llantas: igual que Depot (medida → opciones → cotización → local → día). Las **tres opciones**
   se quedan (Joaquín las eligió, y Manuel las defendió en el pitch); con marcas que la escalera no
   conoce, el escalón sale **por precio dentro del aro** en vez de por marca.
3. **Aros**: si el cliente pide aros/rines como producto, `buscar_aros` lista los que hay (diámetro,
   pernos, precio, stock, foto si hay) como texto; después sigue el mismo cierre de local y día.
   Sin pieza gráfica para aros en esta etapa.
4. Lubricantes, baterías, aceites, taller: el bot no cotiza; avisa al asesor del local (comportamiento
   que ya existe para lo que está fuera de alcance).
5. Al elegir local, la cotización y las piezas llevan **la marca de ese local** (logo de
   Competimotor si es el de Competimotor) y el aviso va **a los asesores de ese local**.

### 3.4 Datos del cliente: catálogo y ventas

- **Catálogo:** Jenny exporta el inventario de Fénix a Excel (ella lo propuso, 1:08:45) y lo sube en
  el panel (Ajustes → Catálogo). El mapeo de columnas se configura una vez. Si no lo suben, el bot
  sigue con el último que subieron y el panel avisa la fecha. La Google Sheet sigue como respaldo.
- **Ventas comprobadas:** sin API no hay facturas automáticas. Camino de la prueba: exportar las
  facturas de Fénix (CSV/Excel) y subirlas en el panel; el cruce por teléfono es el mismo de Depot
  (`cruzar()` en `ventasConfirmadas.ts:178-231`). Para que sirva, los vendedores tienen que poner el
  número de WhatsApp en la factura (como Depot desde el 13-oct).

## 4. Lecciones previas que aplican

- **Depot es el contrato vivo.** `negocios/depot.ts` dice: si un valor cambia, cambia producción.
  Todo lo que se mueve de un literal al perfil/política tiene que salir **idéntico** para Depot
  (`test/perfilDelNegocio.test.ts` lo fija byte a byte).
- **Un `NEGOCIO` mal escrito no arranca** a propósito (`negocio/index.ts:27-35`): mejor caído que
  mandando clientes a Cumbayá.
- **El guardián borra lo que no puede verificar** (`services/guardian.ts`): todo dato nuevo que el bot
  pueda decir (política, aros) viaja como HECHO al guardián.
- **El simulador tiene que seguir siendo fiel**: tabla o variable nueva sin clasificar rompe
  `test/simuladorFidelidad.test.ts`, a propósito.
- **Un servicio por cliente, sin réplicas**: la ráfaga y las colas viven en memoria (`docs/OPERACION.md:124-128`).
- **Meta**: la app va en el portafolio del cliente (`docs/CONECTAR_WHATSAPP_CLIENTE.md`); Meta lo paga
  el cliente con su tarjeta.
- **Los docs no coinciden sobre el deploy**: `CLAUDE.md:4` dice que push a `main` sale a staging y
  producción; `docs/entrega-fases-depot.md:84-89` dice que el servicio de Depot tiene auto-deploy
  apagado. El Sprint Final lo comprueba en Railway antes de mergear.

## 5. Preguntas abiertas (cada una ligada a su perilla en la lista de arranque)

1. ¿Qué número de WhatsApp será el de ventas, y quieren uno por marca? → `presentacion`, canal. **Jenny.**
2. Dirección, pin de Google Maps y teléfono de cada local; cuáles son Mundillantas y cuál Competimotor. → `locales`, `identidades`. **Jenny.**
3. ¿Fénix Comercial Contable en su servidor (confirmado «servidor local»): qué columnas trae el Excel de inventario? ¿Stock por local o total? ¿Qué lista de precios es la del público? ¿Precios con o sin IVA? → `catalogo_mapeo`. **Contacto designado + captura del Excel.**
4. ¿Qué marcas venden y cuál es su premium/equilibrio/económica? → `assets/mundillantas/escalera-precio.json`. **Jenny.**
5. Garantías y seguro por marca. → `garantias`. **Jenny.**
6. Formas de pago, cuotas sin intereses, descuento por efectivo. → `politica.formasDePago`, `cuotasSinIntereses`. **Jenny.**
7. ¿Qué incluye la compra (alineación, balanceo, válvulas)? ¿Con una llanta también? → `benefits` en Ajustes. **Jenny.**
8. ¿Envían a otras ciudades? → `politica.vendeADistancia`. **Jenny.**
9. ¿Venden llanta de camión (rin 17.5/19.5/22.5)? El esquema de herramientas solo acepta aros enteros 12–24 (`tools.ts:1083`). **Fuera de este plan** hasta que lo confirmen.
10. ¿Qué datos de los aros tienen (diámetro, pernos, offset, foto)? → `catalogo_mapeo` + `AroProducto`.
11. Asesores: nombre, teléfono y local de cada uno; quién recibe qué aviso. → `advisors` + `asesores_por_local`.
12. ¿Cómo se llama el vendedor del bot? (Depot: Martín.) → `vendedor.nombre`.
13. ¿Pueden exportar facturas de Fénix con el teléfono del cliente? ¿Quién cobra la comisión de una venta que trajo el bot? → importación de facturas; acuerdo comercial (no es código).
14. Razón social y RUC a facturar (¿Sat Mundillantas S.A.S.?). → `facturacion` (sin esto no sale pre-factura; está bien durante la prueba).
15. Logos de Mundillantas y Competimotor en buena calidad. → `assets/mundillantas/`.

## 6. Glosario

- **Perfil** — quién es el negocio (`negocios/<id>.ts`). **Política** — cómo vende (`politicas/<id>.ts`).
- **Identidad** — una marca comercial del negocio (Mundillantas, Competimotor) con sus locales.
- **Fuente** — de dónde salen el catálogo y las facturas (Contífico, Sheets, archivo subido).
- **Perilla** — un valor con lugar fijo que se cambia sin tocar la lógica.
- **Prueba de 2 semanas** — desarrollo a nuestro riesgo; si funciona, pagan $1.500 + $600/mes.

## 7. Dónde está cada cosa

| Cosa | Ruta |
|---|---|
| Forma del perfil | `app/src/negocio/perfil.ts` |
| Perfiles | `app/src/negocio/negocios/` |
| Política comercial (nuevo) | `app/src/negocio/politica.ts`, `app/src/negocio/politicas/` |
| Identidades (nuevo) | `app/src/negocio/identidad.ts` |
| Assets por cliente | `app/assets/<id>/`, helper `app/src/negocio/assets.ts` |
| Fuentes de catálogo/facturas (nuevo) | `app/src/services/fuentes/` |
| Aros como producto (nuevo) | `app/src/domain/aroProducto.ts`, `app/src/agent/herramientasAros.ts` |
| Endpoint del negocio (nuevo) | `app/src/server/negocioPublico.ts` |
| Semilla de base nueva (nuevo) | `app/src/db/seed-negocio.ts` |
| Alta de un cliente (nuevo) | `docs/clientes/ALTA-DE-CLIENTE.md` |
| Lista de arranque de Mundillantas | `docs/clientes/mundillantas-arranque.md` |
| Plan | `docs/planning/PLAN-MULTICLIENTE-MASTER-PROMPT.md` |
