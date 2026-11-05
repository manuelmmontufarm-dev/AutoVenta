# PLAN MAESTRO — MULTICLIENTE (Depot Tire + Mundillantas/Competimotor sobre el mismo AutoVenta)

> **Cómo usar este documento.** Cada «SPRINT N» es un prompt autocontenido para una sesión nueva de
> **Fable**. En la sesión se pega **primero el bloque del SPRINT** (empieza por su nombre, para que el
> chat quede llamado `Sprint N — <nombre corto>`) y **después la PARTE A**. **Los cuatro sprints de
> trabajo corren AL MISMO TIEMPO y en cualquier orden**: cada uno sale de `origin/main` fresco, toca
> solo sus archivos y termina en un PR contra `main`. Ninguno espera a otro. Cuando los cuatro tengan
> PR, el **SPRINT FINAL** (sin número) revisa todo contra la PARTE B, conecta lo que se dejó para el
> final, mergea, despliega y verifica.
> Contexto: `docs/MULTICLIENTE.md` (nombres decididos en §3.2 — **no se inventan otros**) y
> `docs/clientes/mundillantas-arranque.md`. Estado al escribir: `origin/main` = `dc50dab`. El plan fue
> revisado contra el código el 4-nov (88 hallazgos, los confirmados ya están aplicados acá).

> **La decisión, en corto.** No hay sub-repo ni copia del bot: **un solo código** para todos los
> clientes, desplegado como un servicio por cliente (`NEGOCIO=depot`, `NEGOCIO=mundillantas`). Un
> arreglo del bot llega a los dos en el mismo deploy. Lo que cambia de un cliente a otro vive en su
> **carpeta de cliente**:
>
> | Carpeta de Mundillantas | Qué hay |
> |---|---|
> | `app/src/negocio/negocios/mundillantas.ts` | Quién es: marcas comerciales, locales, horarios de arranque, garantías, vendedor, pies de pieza |
> | `app/src/negocio/politicas/mundillantas.ts` | Cómo vende: pagos, cuotas, envíos, juego completo, escalera por precio, qué deriva al asesor |
> | `app/assets/mundillantas/` | Logos de cada marca, escalera de marcas, conocimiento de marcas, tipos de llanta |
> | Ajustes del panel (su base) | Lo que cambia seguido: horarios, beneficios incluidos, asesores por local, catálogo subido y su mapeo |
> | `docs/clientes/mundillantas*.md` | Ficha, lista de arranque, reuniones |
>
> **El costo de esa decisión:** cambiar un `.ts` de Mundillantas es un push a `main`, y `main`
> despliega también a Depot (un reinicio corto: los mensajes que llegan en ese momento esperan a la
> siguiente respuesta). Durante la prueba, junta esos cambios y despliégalos fuera del horario de
> Depot. Lo que cambia todos los días va en Ajustes, que no despliega nada.

---

## PARTE A — Contexto y reglas comunes (pegar al inicio de CADA sprint)

Eres un ingeniero senior en **AutoVenta**: bot de ventas de llantas por WhatsApp (servidor
Node/Express/TypeScript en `app/`, Postgres en Railway, panel React/Vite en `hub/` servido por el mismo
servidor). Hoy atiende a **Depot Tire** (Quito) y va a atender a un segundo cliente,
**Mundillantas/Competimotor** (Santo Domingo de los Tsáchilas, dos marcas, 3 locales, Fénix sin API),
en una prueba de 2 semanas. El código ya está pensado para «una instancia por cliente»: cada cliente es
su propio servicio de Railway con su base, y la variable `NEGOCIO` elige su perfil
(`app/src/negocio/index.ts`). Vas a ejecutar UN sprint de este plan.

Antes de escribir código lee, en este orden: `CLAUDE.md`, `docs/COMO-ARREGLAR-EL-BOT.md`, las últimas 3
entradas de `BITACORA.md`, **`docs/MULTICLIENTE.md` completo** (en especial §3.1 hallazgos y §3.2
nombres decididos), el encabezado de este plan y **tu bloque de sprint**. Si `docs/MULTICLIENTE.md`
todavía no está en `main`, léelo de la rama: `git show origin/docs/multicliente-plan:docs/MULTICLIENTE.md`.
Las líneas citadas son de `dc50dab`; si se movieron, búscalas por contenido y respeta la **zona**, no el
número.

**Arranque.**
```bash
cd /Users/manue/AutoVenta && git fetch origin
git worktree add ../av-<tu-slug> -b <tu-rama> origin/main
cd ../av-<tu-slug>/app && npm ci && cd ../hub && npm ci
```
Trabaja SOLO en ese worktree. No cambies de rama en `/Users/manue/AutoVenta`: es el checkout compartido
y tiene cambios sin commitear de otras sesiones.

**Reglas duras (cada una con su porqué):**

- **Depot es el contrato vivo: tiene que salir idéntico.** Todo literal que muevas al perfil, a la
  política o a un asset tiene que producir, con `NEGOCIO` sin definir (= Depot), **exactamente** el
  mismo texto, la misma pieza y la misma decisión que hoy. Antes de mover algo, escribe la prueba que
  fija la salida actual de Depot y que siga verde después. Las piezas se fijan con reloj congelado
  (`vi.useFakeTimers(); vi.setSystemTime(…)`), modo día/noche explícito y la misma muestra de catálogo.
  Un cambio que «mejora» a Depot de paso no va en este plan.
- **Un push a `main` sale a staging y a producción de Depot.** Nunca pushees a `main`: tu rama → PR
  con `gh pr create` contra `main`. Mergea solo el Sprint Final.
- **JAMÁS levantes el servidor con el `.env` de producción** (`app/.env` del checkout principal apunta
  a la base real de Depot). Bot: simulador (`cd app && npm run sim`, con `app/.env.sim` y clave propia
  de OpenAI). Panel/Ajustes: servidor del worktree con `DATABASE_URL` a una base local desechable +
  `ADMIN_KEY` de prueba, y el hub con `AUTOVENTA_DEV_API_URL`.
- **Alcance de archivos: solo los permitidos de tu bloque, y en las zonas marcadas «solo».** Los otros
  tres sprints están editando los demás archivos AHORA, en paralelo. Los **imports** nuevos van en la
  línea exacta que dice tu bloque (nunca al final del bloque de imports, que es donde chocan los tres).
  Si necesitas otro archivo, para y anótalo en el PR como pendiente para el Sprint Final.
- **Firmas exportadas intactas.** No cambies la firma de ninguna función exportada que use código de
  otro sprint; si necesitas un parámetro nuevo, que sea **opcional, al final**, con el comportamiento de
  hoy por defecto.
- **Los nombres están decididos** en `docs/MULTICLIENTE.md` §3.2 (`Identidad`, `identidades`,
  `presentacion`, `PoliticaComercial`, `politica`, `rutaDeAsset`, `fuentes/`, `catalogo_archivo`,
  `catalogo_mapeo`, `facturas_mapeo`, `asesores_por_local`, `facturas_importadas`, `AroProducto`,
  `buscar_aros`, `pideAroComoProducto`, `GET /api/negocio`, `HUB_PIN`, y los campos de la política). Úsalos
  tal cual: otro sprint los consume en paralelo.
- **Una sola migración y una sola variable nueva en todo el plan.** La migración
  `031_facturas_importadas.ts` es del Sprint 2; la variable `HUB_PIN` es del Sprint 3. Ningún otro
  sprint agrega tablas ni variables de entorno: rompería `test/simuladorFidelidad.test.ts` y
  `db/schema.ts` tendría dos dueños. Lo nuevo de configuración va en claves de `settings` (que el
  simulador ya copia) o en archivos del cliente. No hay helper genérico de `settings`: las claves nuevas
  se leen y escriben con SQL propio en el servicio dueño (patrón de `services/anunciosActivos.ts`:
  `select value from settings where key = …` + `insert … on conflict (key) do update`). No agregues un
  helper a `services/settings.ts`.
- **Nada del cliente en el código común.** Lo que un cliente tendría distinto va en su perfil, su
  política, sus assets o en Ajustes. Lo que es igual para cualquier llantera se queda en el dominio.
  Para Mundillantas: **nunca inventes datos** (coordenadas, teléfonos, garantías, precios). Lo que no
  está confirmado va como `"[PENDIENTE] <qué falta>"` y **nunca llega a un cliente** (el S1 pone el
  candado; ver R-44).
- **Los módulos que lee el panel son puros.** `hub/` empaqueta `agent/compactPlaybook.ts` y, con él,
  `negocio/index.ts`. Nada de lo que importe esa cadena (`negocio/perfil.ts`, `negocio/identidad.ts`,
  `negocio/politica.ts`, `negocio/politicas/*`, `negocio/negocios/*`) puede importar `node:fs`, `domain/`
  ni `services/`: solo literales y `negocio/`. `negocio/assets.ts` (que usa `node:fs`) va aparte y no lo
  importa nadie de esa cadena. Si tocas algo de esa cadena, `cd hub && npm run build` es obligatorio.
- **El Ángel Guardián borra lo que no puede verificar** (`services/guardian.ts`): todo dato nuevo que
  el bot pueda decir tiene que llegarle como HECHO o en el resultado de una herramienta, o lo tacha.
- **Pruebas.** Primero la prueba en rojo, después el cambio. `cd app && npx vitest run <tus archivos>` y
  `npm run typecheck`; en `hub/`, `npm run build`. La suite completa (`npm test`, ~1.400 pruebas)
  necesita Postgres local: córrela si lo tienes y pega el resultado en el PR. Después de tocar el bot:
  `npm run sim:humo` y `npx vitest run test/simuladorFidelidad.test.ts`. `interbotSync.test` falla los
  miércoles: no es tuyo.
- **El build del hub y el hook.** No commitees `app/site/admin/**` ni `app/site/demo-showroom-gp/**`
  (los construye el Sprint Final; deja fuera con `git checkout -- app/site`). El hook de pre-commit
  bloquea un commit con `hub/src` sin `app/site/admin`: en ese caso, comprueba a mano que `BITACORA.md`
  está en el stage (`git diff --cached --name-only | grep -x BITACORA.md`) y commitea con
  `git commit --no-verify`. Anótalo en el PR.
- **Estilo.** Como el vecino: comentarios en castellano que explican el porqué con el caso real,
  nombres en castellano, funciones puras en `app/src/domain/` o `app/src/negocio/` con sus pruebas. En el
  panel, los componentes de `hub/src/components/ui.tsx`, sin librerías nuevas.
- **Bitácora.** Una entrada en `BITACORA.md` arriba de todo (`## <fecha> · <título>` + **Qué** /
  **Por qué** / **Horas**). El commit falla sin ella (hook). En conflicto al mergear, se conservan todas.
- **PR.** Título `feat(<área>): …`; cuerpo con objetivo, archivos tocados, cómo se verificó (comandos,
  salida, capturas del simulador o del panel), riesgos, qué quedó para el Sprint Final y los **R-xx**
  que cubre. No mergear.

---

## PARTE B — Lista maestra de requisitos (lo que el Sprint Final verifica uno por uno)

### B.1 Carpeta de cliente e identidades

- **R-01 Perfil de Mundillantas.** Existe `negocio/negocios/mundillantas.ts` registrado en `PERFILES`; con `NEGOCIO=mundillantas` el servidor arranca. Solo datos confirmados (`docs/MULTICLIENTE.md` §3.3, `docs/clientes/mundillantas-arranque.md`); lo demás `[PENDIENTE]`. Prueba que lo carga y valida su forma. → **S1**
- **R-02 Identidades.** `Identidad`, `PerfilDeNegocio.identidades?`, `presentacion?` y los helpers de `negocio/identidad.ts` existen con los nombres de §3.2. Sin `identidades`, hay una sola = `nombre` y Depot no cambia (prueba de igualdad de salida). Cada local pertenece a exactamente una identidad (si no, no arranca). → **S1**
- **R-03 Presentación combinada.** Con Mundillantas el primer saludo dice «…de Mundillantas y Competimotor» (`domain/saludo.ts`); con Depot, el texto de hoy byte a byte. → **S1**
- **R-04 Piezas que aceptan identidad.** `PieceTheme` acepta `identidad?` opcional; `depotLogo` busca `assets/<id>/logo-<identidad>.png` antes de `logo-blanco.png`, cachea por identidad y lee el ancho/alto del PNG (no la proporción fija de Depot); el PDF (`services/quotePdf.ts`) y el informe diario (`render/dailyReportPdf.ts`) usan esas medidas. Sin `identidad`, la de la presentación; sin archivo, el nombre en texto. Depot: piezas idénticas (hash con reloj congelado). Imágenes de muestra de Mundillantas con identidad `mundillantas` y `competimotor`. → **S1** (conectar las llamadas reales con el local de la conversación → **SF**, R-45)
- **R-05 Garantías del perfil.** `warrantyForBrand` (`services/quoteMessages.ts:671-691`) lee `negocio.garantias` con la misma comparación de hoy (`includes` sin mayúsculas); `golpesMeses: 0` = sin seguro contra golpes. Depot: tabla fija antes/después FALKEN 18 · KENDA 12 · WINRUN 6 · GITI sin seguro · SUNOCO sin seguro · desconocida sin seguro; fábrica «5 años». → **S1**
- **R-06 Detectores con todas las identidades.** Detector de cierre perdido, detector de locales inventados (`localesInventados.ts`) y `palabrasDeLugarPropias` reconocen cada identidad. El cupón usa **un prefijo por negocio** (las iniciales de la presentación; Depot `DT-` como hoy) y el normalizador de caja quita ese prefijo, no el literal `DT`: un cupón generado con `ejemplo`/`mundillantas` se valida en caja (ida y vuelta). → **S1**
- **R-07 Textos de las piezas del perfil.** «IVA y Ecovalor», «Precio directo de distribuidor» y el pie copiado a mano de `depotPosters.ts:721` salen de `negocio.piezas`; marcas de llanta desconocidas usan un estilo neutro, no el de Falken/Kenda/Winrun. Depot idéntico. → **S1**
- **R-08 `GET /api/negocio`.** Devuelve exactamente el contrato de §3.2 (con `playbook` y `faltantes`), detrás de la misma credencial que el resto del panel. Prueba del armado puro en `server/negocioPublico.ts` + prueba HTTP. → **S1**
- **R-09 Prueba de «perfil ajeno» — identidad.** `test/perfilAjeno.identidad.test.ts`: con `NEGOCIO=ejemplo` y con `NEGOCIO=mundillantas` (módulos recargados), el saludo, las piezas de muestra, el detector de cierre y el cupón no contienen `Depot|Cumbayá|Quito Sur|Pit ?Stop`. → **S1**
- **R-10 `[PENDIENTE]` nunca llega al cliente.** Candado de salida + prueba: ningún texto que el bot o una pieza le muestre al cliente contiene `[PENDIENTE]`; donde el perfil lo tiene, se usa un respaldo neutro (sin nombre de vendedor: «Soy el asistente de Mundillantas y Competimotor»; local sin dirección: no se ofrece el mapa). → **S1** · **R-44** El bot no se puede encender (`botPower`) mientras `faltantes` no esté vacío, salvo con una confirmación explícita en el panel. → **SF**

### B.2 Política comercial por cliente

- **R-11 Política comercial.** `negocio/politica.ts` con `PoliticaComercial` y `politica` elegida por `negocio.id`; valores en `negocio/politicas/{depot,ejemplo,mundillantas}.ts`, solo literales. Un `negocio.id` sin política no arranca. Exporta `faltantesDeLaPolitica(politica): string[]`. → **S4**
- **R-12 Pagos y descuento por efectivo de la política.** `datosDelNegocio.ts`, el prompt, el guardián, `respaldo_marcas` y los pasos de salida `sin_descuento_negado` y `el_pago_se_responde` (`prepararSalida.ts:819-871`, que hoy inyectan la política de Depot en `:830` y `:870`) usan `politica.formasDePago`, `cuotasSinIntereses` y `descuentoEnEfectivo`. Con `formasDePago` vacío, esos pasos devuelven el texto sin tocar (sin `---` colgando) y el bot no promete formas de pago. Depot: texto idéntico. → **S4**
- **R-13 Beneficio de redes opcional.** `beneficioDeRedes.ts` y el paso `el_beneficio_se_responde` salen de `politica.beneficioDeRedes`; `null` = no se menciona en ninguna salida. Depot igual. → **S4**
- **R-14 Cobertura y lugares del perfil.** `fueraDeCobertura.ts`, `ubicacionPedida.ts`, `compraADistancia.ts`, `agent/faseOperativa.ts` y `domain/storeSelection.ts` usan ciudad, sectores, locales y `politica.vendeADistancia`. Con Mundillantas: «soy de santo domingo» no es «otra ciudad», «estoy en la av quevedo» queda dentro. Depot igual. → **S4**
- **R-15 Textos regionales.** `prompts.ts:30,53` (con `marcas` vacío se omite «Vende …»), `compactPlaybook.ts:27`, `tools.ts:3517-3520` (el nombre del asesor sale de `politica.asesorEnReglas`: «Manuel» para Depot, idéntico por construcción), `fitmentResearch.ts:145`, `vehicleFitmentResearch.ts:125`, `transcripcionEco.ts:22-23` salen de perfil/política. Depot idéntico. → **S4**
- **R-16 Assets por cliente.** `negocio/assets.ts` con `rutaDeAsset`; `escalera.ts`, `respaldoMarcas.ts` y `tireTypes.ts` cargan `assets/<id>/…` con respaldo común. Mundillantas trae `base_llantas_tipos.json` con los mismos tipos y `orden_de_marca: []`. Depot lee los mismos archivos de hoy. → **S4**
- **R-17 Tres opciones con marcas desconocidas.** Con `politica.escalonPorPrecio = true` (Mundillantas; Depot `false`), el escalón de cada opción (premium/equilibrio/económica) sale por precio dentro del conjunto, en `tresOpciones`/`escaleraPorUso`, en la `nota_de_niveles` de `preparar_opciones` y en el `escalon` de cada opción que ve el modelo; nunca dos opciones con el mismo escalón ni una sola opción cuando hay tres precios distintos. Depot: mismas opciones que hoy. → **S4**
- **R-18 Herramientas y juego sin valores de Depot.** Descripciones de `buscar_catalogo` y `respaldo_marcas` (`tools.ts:1022,1295,1301`) y las reglas de `tools.ts:1324-1328` salen de `negocio.marcas` y del conocimiento de marcas del cliente; el juego completo (`opcionesCandados.ts:134`) sale de `politica.juegoCompleto`; lo que se deriva al asesor suma `politica.productosQueDerivaAlAsesor` (`alcanceComercial.ts`). Depot: mismo texto y mismo 4. → **S4**
- **R-19 Guardián sin locales fijos.** Regla 16 («Primero los dos locales», `guardian.ts:251`) y los ejemplos de `:239` y `:280` (`INSTRUCCIONES_SEGUIMIENTO`) usan los locales del perfil y su cantidad. Depot: mismas reglas. → **S4**
- **R-20 Prueba de «perfil ajeno» — política.** `test/perfilAjeno.politica.test.ts`: con `ejemplo` y `mundillantas`, el prompt del sistema, las reglas del guardián (`INSTRUCCIONES` e `INSTRUCCIONES_SEGUIMIENTO`), sus HECHOS, la salida de `respaldo_marcas` y los pasos de `prepararSalida` no contienen `Depot|Cumbayá|Quito|quiteño|Falken|Kenda|Winrun|3 y 6 meses` salvo que el perfil/política del cliente los diga. → **S4**

### B.3 Catálogo, aros y ventas

- **R-21 Fuentes de datos.** `services/fuentes/` con la interfaz de §3.2; `syncCatalog` y `sincronizarFacturas` pasan por `fuenteDeCatalogo()` / `fuenteDeFacturas()`, **evaluadas en cada sincronización**. Con Contífico configurado, mismo catálogo y mismas facturas que hoy (prueba de equivalencia con un fixture commiteado). → **S2**
- **R-22 Catálogo por archivo.** `POST /api/catalog/import` (CSV y XLSX, cuerpo crudo, ≤ 5 MB) + `GET/PUT /api/catalog/mapeo`: normaliza con `catalogo_mapeo`, guarda en `catalogo_archivo`, llama a `syncCatalog()` (el bot lo usa **sin reinicio**) y lo recupera al reiniciar; `/catalog/status` muestra fuente, fecha, filas y filas descartadas con motivo. Filas con y sin precio de lista. Probado con un Excel de muestra con columnas tipo Fénix. → **S2**
- **R-23 Interbot solo para quien lo tiene.** `precios-interbot.json` pasa a `app/assets/depot/`; sin `assets/<negocio.id>/precios-interbot.json`, `getInterbotPrice` devuelve null y `refreshPriceForSize`, `ensureInterbotPricesFresh`, `loadPersisted` y `applyInterbotPrices` no hacen nada. Prueba con `ejemplo`: un código que existe en el snapshot de Depot cotiza el precio del catálogo propio. Depot igual. → **S2**
- **R-24 Aros como producto.** `AroProducto` + `arosDelCatalogo()` + `pideAroComoProducto(texto)` + `buscar_aros` (`agent/herramientasAros.ts`). Con aros en el catálogo: «tienen aros de 15?» / «rines 15 de 4 pernos» NO dispara la ruta de llantas por aro (ni la directa ni la forzada en el agente) y el modelo recibe `buscar_aros` (está en los `allowedTools` por defecto de las etapas que venden). Responde con diámetro, pernos, precio con IVA, stock y foto si hay, en un JSON corto que cabe en la huella del guardián (≤ 500 caracteres para 5 aros). Sin aros en el catálogo (Depot), la herramienta no existe y el ruteo por aro es idéntico al de hoy. → **S2**
- **R-25 Ancho + aro sin perfil.** «235 rin 15» (y «235 R15», «235 aro 15», «rin 15 235») muestra solo anchos 235 en aro 15, también por la ruta directa sin modelo (`tryMostrarPorAro`); si no hay, lo dice y ofrece los anchos más cercanos que sí hay; `medidaNoDada` no bloquea una 235/xxR15 cuando el cliente dio «235 rin 15». Prueba en rojo con el caso de la demo del 4-nov (28:14). Vale para Depot también. → **S2**
- **R-26 Facturas por archivo.** Migración `031_facturas_importadas.ts` (aditiva, en `aplicarEsquema`) + `POST /api/ventas/import` (con `facturas_mapeo`) + fuente `archivo` de facturas; Métricas comprobables y «Para cerrar» se encienden con cualquier fuente de facturas, no solo con Contífico. La regex `LLANTA` (`ventasConfirmadas.ts:38`) lee también `33X12.5R17`, `7.00R15` y `LT245/75R16`. La serie 001/002 → local queda dentro del adaptador de Contífico/Depot. → **S2**
- **R-27 Base nueva sin las marcas de Depot.** La migración `009_brand_profiles.ts` siembra los perfiles de FALKEN/KENDA/WINRUN solo con `negocio.id === "depot"` (Depot ya tiene la marca de sembrado: no cambia nada). Con `ejemplo`, `brand_profiles` queda vacío. → **S2**
- **R-28 Tarjetas del catálogo y de facturas.** `hub/src/components/catalogo-archivo.tsx` exporta `SeccionCatalogoArchivo` (subir archivo, ver mapeo, estado, filas descartadas) y `SeccionFacturasArchivo`. El montaje en `Ajustes.tsx` lo hace el Sprint Final. → **S2**

### B.4 Panel, asesores y alta de clientes

- **R-29 Panel sin Depot.** Título, tour, pie del chat (teléfono), nombre del PDF, etiqueta de plantilla, anuncios, favicon y placeholders del cupón salen de `GET /api/negocio` (con respaldo a los valores de hoy si el endpoint todavía no existe). `index.html` y el manifest dicen «AutoVenta». `LOCALES`/`MARCAS` de `types.ts` quedan solo como datos del mock. → **S3**
- **R-30 Horarios por local.** La tarjeta de horarios de Ajustes (`Ajustes.tsx:713`) lista los locales del negocio, no Cumbayá y Quito Sur fijos. → **S3**
- **R-31 Playbook real.** `Settings.tsx` muestra `playbook` de `/api/negocio` en vez del importado en el build. → **S3**
- **R-32 Tarjeta de arranque.** Ajustes muestra `faltantes` de `/api/negocio` como lista de pendientes del cliente (vacía = no se muestra). → **S3**
- **R-33 Usuarios y PIN por cliente.** La semilla de usuarios del panel (`SEMILLA`, `hubUsers.ts:76-83`) trae los de Depot solo con `negocio.id === "depot"`; otro negocio arranca con un solo admin (Manuel). El PIN sale de `HUB_PIN` (sin ella, `"1234"`); `HUB_PIN` clasificada en el simulador. → **S3**
- **R-34 Asesores por local.** Clave `asesores_por_local`; `GET/PUT /api/asesores-por-local`; los avisos de visita, pedido de asesor y los que llegan después de elegir local van a los asesores de ese local (sin asignación o sin local = todos, como hoy; el primer aviso de cotización suele llegar antes de elegir local y va a todos). Tarjeta en Ajustes → Asesores. Depot sin asignación = igual que hoy. → **S3**
- **R-35 Semilla de base nueva.** `app/src/db/seed-negocio.ts` (`npm run seed:negocio`) deja una base vacía lista para el perfil activo: esquema, prompts por etapa, fases, `guardian_config`, `ai_config`, `pieces_config`, `store_hours` desde el perfil. Idempotente (no pisa lo existente). Escribe las 4 claves que el simulador exige. → **S3**
- **R-36 Simulador por cliente.** `npm run sim -- --perfil <id>`: tabla por perfil en `entorno-prod.mjs` (servicio de Railway o ninguno, y `catalogo: 'contifico' | 'archivo'`); con `archivo`, el simulador no levanta el Contífico de mentira ni exporta `CONTIFICO_*`, y `--catalogo-archivo <xlsx|csv>` sube el archivo por `POST /api/catalog/import` al arrancar. Un perfil sin servicio corre la semilla y toma las variables de modelos del servicio de Depot. `NEGOCIO` del perfil manda sobre el copiado (si no coinciden, aborta). Sin `--perfil` = igual que hoy, y una copia incompleta de Depot sigue fallando. → **S3**
- **R-37 Receta de alta.** `docs/clientes/ALTA-DE-CLIENTE.md`: servicio + Postgres, tabla de variables por cliente (incluye modelos `OPENAI_*`, `SELLER_NAME`, `SELLER_PHONE`, `BILLING_*`, `PHASES_DEFAULT`), `NEGOCIO`, `BOT_POWER_DEFAULT=off`, semilla, conectar WhatsApp, subir catálogo, simulador, encender, y el costo de que `main` despliegue a todos. → **S3**

### B.5 Documentos y cierre

- **R-38 Documentos del plan en `main`.** `docs/MULTICLIENTE.md`, `docs/clientes/mundillantas-arranque.md`, este plan y los docs de cliente (ficha, Fénix, reunión) llegan a `main`. → **S0**
- **R-45 Todo conectado.** En el SF: las llamadas reales a las piezas (`tools.ts:2192`, `:2530`, `:3290`, `directSalesRoutes.ts:112`, `webhook.ts:134,197`, `services/quotePdf.ts`) pasan la identidad del local de la conversación; `prompts.ts:30` y `compactPlaybook.ts:11` usan la frase de presentación; `faltantes` = perfil ∪ política ∪ assets que faltan; tarjetas del S2 montadas en Ajustes; respaldo de Depot del panel cambiado a neutro; prueba de Mundillantas de `perfilAjeno.politica` obligatoria; prueba de consistencia: sin cuotas en la política, las piezas no mencionan cuotas. → **SF**
- **R-39 Depot intacto.** Suite completa verde; `sim:humo` y fidelidad verdes; para 10 chats reales recientes de Depot, diff **byte a byte** vacío del prompt del sistema, reglas y HECHOS del guardián y descripciones de herramientas antes/después; y la reproducción con el modelo (3 corridas por chat) juzgada con gráfico de control (`scripts/sim/grafico-canary.mjs`) contra la fase I de `main`. → **SF**
- **R-40 Deploy verificado.** Se confirma en Railway si `main` despliega a Depot automáticamente (los docs se contradicen) y se despliega con ese conocimiento, fuera del horario de Depot; Depot responde en producción después del deploy. → **SF**
- **R-41 Servicio de Mundillantas listo para encender.** Servicio + Postgres creados con `NEGOCIO=mundillantas` y `BOT_POWER_DEFAULT=off`, semilla corrida, panel accesible, simulador `--perfil mundillantas --catalogo-archivo <fixture>` contestando un chat de llantas (con «235 rin 15») y uno de aros. Lo que requiere al cliente (Meta, Excel real, logos, datos de la lista de arranque) queda como pendiente explícito. → **SF**
- **R-42 Los arreglos siguen aplicando a los dos.** `CLAUDE.md` y `docs/COMO-ARREGLAR-EL-BOT.md` dicen que hay dos clientes y agregan a las pruebas de después de tocar el bot `npx vitest run test/perfilAjeno.*.test.ts` y `npm run sim -- --perfil ejemplo --humo`. → **SF**
- **R-43 Informe final.** Tabla R-01…R-45 con ✅/⚠️/❌ y evidencia, en el PR de cierre y en la bitácora; la lista de arranque actualizada. → **SF**

---

## SPRINT 0 — documentos base (rama `docs/multicliente-plan`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 0 — documentos base`**. Debajo pega la
> PARTE A y ejecuta.

**Objetivo.** (R-38) Subir a `main` los documentos que leen todos los sprints. La rama ya existe en el
checkout local (`/Users/manue/av-docs-multicliente`) con los commits listos; este sprint solo la empuja y
abre el PR. Los sprints de trabajo pueden arrancar antes: leen los docs desde la rama.

**Archivos permitidos:**
- `docs/MULTICLIENTE.md`, `docs/clientes/mundillantas-arranque.md`, `docs/clientes/mundillantas.md`
- `docs/planning/PLAN-MULTICLIENTE-MASTER-PROMPT.md`, `docs/integraciones/**`, `docs/reuniones/2026-11-04-mundillantas-competimotor.md`
- `BITACORA.md`

**Prohibido:** todo `app/**` y `hub/**`.

**Pasos.**
1. `cd /Users/manue/av-docs-multicliente && git log --oneline origin/main..HEAD` (deben verse los commits de docs).
2. `git push -u origin docs/multicliente-plan` y `gh pr create --base main --title "docs: plan multicliente (Depot + Mundillantas)"`.
3. Es solo documentación, pero `main` despliega: mergear solo con el visto bueno de Manuel.

**Aceptación:** R-38 con el enlace del PR.

---

## SPRINT 1 — dos marcas (rama `feat/dos-marcas`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 1 — dos marcas`** (con la herramienta de
> título de sesión si la tienes). Después pega debajo la PARTE A del plan y ejecuta.

**Objetivo.** (R-01…R-10) Que un negocio pueda tener **más de una marca comercial**: el saludo, las
piezas, el PDF, el cupón y los detectores usan la identidad correcta; dar de alta el perfil de
Mundillantas con solo datos confirmados y un candado para que lo pendiente nunca llegue al cliente; exponer
`GET /api/negocio` para el panel. Sale de `origin/main` fresco y abre PR contra `main`. No espera a ningún
otro sprint. **No** conectas las llamadas de `agent/tools.ts` a las piezas (lo hace el Sprint Final): tus
piezas aceptan la identidad y tus pruebas la pasan explícita.

**Archivos permitidos:**
- `app/src/negocio/perfil.ts`, `app/src/negocio/index.ts`, `app/src/negocio/negocios/ejemplo.ts`
- `app/src/negocio/negocios/depot.ts` **solo** `garantias` (y, si agregas campos opcionales a `piezas`, sus valores de Depot)
- nuevos: `app/src/negocio/identidad.ts`, `app/src/negocio/negocios/mundillantas.ts`, `app/src/server/negocioPublico.ts`
- `app/src/domain/saludo.ts`, `app/src/domain/cierrePerdido.ts`, `app/src/domain/localesInventados.ts` (**solo** `:38-51`)
- `app/src/domain/coupons.ts` **solo** `:66-71` (prefijo) y `:115-123` (normalizador de caja); el helper `inicialesDelNegocio` está en `negocio/perfil.ts:276`
- `app/src/render/assets.ts`, `app/src/render/depotDesign.ts`, `app/src/render/depotPosters.ts`, `app/src/render/diaNoche.ts`, `app/src/render/quoteImage.ts`, `app/src/render/preview.ts`, `app/src/render/dailyReportPdf.ts` (**solo** `:582-590`, medidas del logo)
- `app/src/services/quotePdf.ts` (el PDF de la cotización: `:17`, `:85`, `:146`, `:336`, `:423`, `:576-582`)
- `app/src/services/quoteMessages.ts` **solo** `warrantyForBrand` (`:671-691`), los textos de `:531`, `:568`, `:646-647` y los emojis/colores de marca de `:751-753`
- `app/src/server/admin.ts` **solo** (a) un import nuevo en la línea siguiente a `:107` (`domain/promocion.js`) y (b) `router.get("/negocio", …)` inmediatamente después de `router.use(exigirCredencial);` (`:471`), que llama a `negocioPublico.ts`
- `app/assets/mundillantas/LEEME.md` (nuevo: qué archivos de marca faltan)
- tests nuevos: `app/test/identidad.test.ts`, `app/test/perfilMundillantas.test.ts`, `app/test/perfilAjeno.identidad.test.ts`, `app/test/negocioPublico.test.ts`, `app/test/garantiasDelPerfil.test.ts`, `app/test/pendienteNoLlega.test.ts`; y `app/test/perfilDelNegocio.test.ts` **solo** agregando casos (no cambies los que fijan a Depot; este archivo es solo tuyo)
- `BITACORA.md`

**Prohibido:** `app/src/agent/**` (S2/S4), `app/src/services/guardian.ts`, `prepararSalida.ts` (S4), `app/src/domain/datosDelNegocio.ts`, `beneficioDeRedes.ts`, `fueraDeCobertura.ts`, `ubicacionPedida.ts`, `compraADistancia.ts`, `storeSelection.ts`, `escalera.ts`, `respaldoMarcas.ts`, `tireTypes.ts`, `opcionesCandados.ts`, `alcanceComercial.ts` (S4), `app/src/domain/locations.ts` (las palabras de lugar se cumplen con `palabrasDeLugarPropias` del perfil), `app/src/negocio/politica.ts`, `politicas/**`, `assets.ts` (S4), `app/src/services/catalog.ts`, `services/fuentes/**`, `ventasConfirmadas.ts`, `interbotPrices.ts`, `mostrarPorAro.ts`, `services/settings.ts`, `app/src/db/**` (S2/S3), `app/src/services/coupons.ts` (un solo prefijo por negocio: no hace falta), `app/src/server/admin.ts` fuera de tus dos líneas, `app/src/server/webhook.ts`, `app/src/services/directSalesRoutes.ts` (el cableado es del SF), `hub/**` (S3), `app/scripts/**` (S3).

**Pasos.**
1. **Forma.** En `perfil.ts` agrega `Identidad` y los campos opcionales `identidades?` y `presentacion?`
   exactamente como en §3.2. `firmaDePresentacion(perfil)` conserva su firma: con
   `presentacion.modo = "combinada"` devuelve «Soy <vendedor>, de <frase>» (frase por defecto: los nombres
   de las identidades unidos con « y »); sin `presentacion`, lo de hoy. Si `vendedor.nombre` está
   `[PENDIENTE]`, «Soy el asistente de <frase>».
2. **Helpers** en `negocio/identidad.ts` (puros, solo importan `negocio/perfil.ts`): `identidades(perfil)`
   (sin campo → `[{ id: perfil.id, nombre: perfil.nombre, locales: todos los slugs }]`), `identidadDelLocal`,
   `identidadDeLaConversacion(perfil, nearestStore)` (con `localPorNombre`; sin local o local que no existe →
   la de `presentacion.identidad` o la primera), `nombresDelNegocio(perfil)`, `faltantesDelPerfil(perfil)`
   (cada valor que empieza con `[PENDIENTE]`, con ruta legible: «Local 2 · dirección», más
   `PENDIENTES_NUMERICOS` del perfil). Validación al cargar: cada local en exactamente una identidad.
3. **Perfil de Mundillantas** (`negocios/mundillantas.ts`, registrado en `PERFILES`). Solo lo confirmado:
   ciudad «Santo Domingo», IVA 0,15, USD, lunes–sábado 08:00–18:00 y domingo cerrado, identidades
   `mundillantas` (2 locales) y `competimotor` (1 local), `presentacion: { modo: "combinada", frase:
   "Mundillantas y Competimotor" }`, matriz «Av. Quevedo km 1» (pin desde el Plus Code `PRQ7+887 Santo
   Domingo` solo si puedes convertirlo con certeza; si no, centro de Santo Domingo registrado en
   `PENDIENTES_NUMERICOS`), `sectores: []`, `marcas: []`, `garantias: { default: { golpesMeses: 0,
   fabricaAnios: 0 } }` con comentario `[PENDIENTE]`, `vendedor.nombre: "[PENDIENTE] nombre del vendedor"`,
   textos de pago de `piezas` en `[PENDIENTE]` (la verdad comercial es la política del S4; estos son solo
   texto de pieza), `facturacion` sin definir, `palabrasDeLugarPropias: ["mundillantas", "mundi",
   "competimotor"]`.
4. **Candado de `[PENDIENTE]`** (R-10): en el armado de cada texto de cara al cliente que sale del perfil
   (saludo, piezas, direcciones, pies) — dentro de tus archivos — un valor `[PENDIENTE]` se reemplaza por su
   respaldo neutro o se omite. Prueba `pendienteNoLlega.test.ts` con `NEGOCIO=mundillantas`.
5. **Saludo y detectores** (`saludo.ts:65,80`, `cierrePerdido.ts:82`, `localesInventados.ts:38-51`): usan
   `firmaDePresentacion` / `nombresDelNegocio` (un patrón por identidad). Cupón: **un prefijo por negocio**
   = iniciales de la presentación (Depot `DT` como hoy); `normalizarCodigoCupon` (`coupons.ts:115-123`)
   quita `inicialesDelNegocio(negocio)` en vez del literal `DT`. Prueba de ida y vuelta con `ejemplo` y
   `mundillantas`; Depot: «dt puma 47» normaliza igual que hoy.
6. **Piezas** (`render/*`, `services/quotePdf.ts`): `PieceTheme.identidad?` opcional; el encabezado, la
   leyenda y el pie salen de esa identidad (sin ella, la de la presentación). `depotLogo(variant,
   identidad?)` busca `assets/<id>/logo-<identidad>.png` y luego `logo-blanco.png`, cachea por
   `${identidad}:${variant}` y lee ancho/alto del encabezado IHDR del PNG; los que hoy usan
   `DEPOT_LOGO_RATIO` usan esas medidas (la constante queda exportada). Textos «IVA y Ecovalor», «Precio
   directo de distribuidor» y el pie de `depotPosters.ts:721` desde `negocio.piezas` (campos opcionales
   nuevos con el texto de Depot en `depot.ts`). Colores/emojis de marcas de llanta: los de
   Falken/Kenda/Winrun igual, respaldo neutro para las demás.
7. **Garantías** (`quoteMessages.ts:671-691`): `warrantyForBrand` lee `negocio.garantias` con
   `includes` sin mayúsculas sobre las claves y cae en `default`; `golpesMeses: 0` → `roadHazard: null`.
   En `depot.ts`: agrega `Winrun: { golpesMeses: 6, fabricaAnios: 5 }` y pon `default: { golpesMeses: 0,
   fabricaAnios: 5 }`. Tabla fija antes/después (R-05) en `garantiasDelPerfil.test.ts`, escrita **antes**
   del cambio.
8. **`GET /api/negocio`**: `negocioPublico.ts` exporta `armarNegocioPublico(perfil, playbook)` (pura) con el
   contrato exacto de §3.2 (`playbook` = `COMPACT_PLAYBOOK` importado sin editarlo; `faltantes` =
   `faltantesDelPerfil` por ahora — el SF le suma política y assets). La ruta en `admin.ts` solo lo llama.
9. **Verificación.** Las pruebas nuevas + `perfilDelNegocio.test.ts`, `npm run typecheck`,
   `npm run sim:humo`, `cd hub && npm run build`. Genera con `render/preview.ts` las piezas de muestra con
   `NEGOCIO=mundillantas` e identidad `mundillantas` y `competimotor` (con un logo de prueba cualquiera
   que **no** commiteas) y adjúntalas al PR.

**Reglas de dominio** (pruebas puras): sin `identidades` → una identidad con todos los locales · cada
local pertenece a exactamente una identidad · la identidad de una conversación nunca sale de un local que no
existe · `[PENDIENTE]` nunca en un texto al cliente · Depot: toda salida idéntica.

**Aceptación:** R-01…R-10 con pruebas verdes, imágenes de las piezas de Mundillantas (identidad
Mundillantas y Competimotor), hashes de Depot iguales y la salida de `curl` a `/api/negocio` contra la base
local.

---

## SPRINT 2 — catálogo por archivo (rama `feat/catalogo-por-archivo`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 2 — catálogo por archivo`**. Después pega
> debajo la PARTE A del plan y ejecuta.

**Objetivo.** (R-21…R-28) Que el inventario y las facturas puedan venir de **cualquier fuente** (Contífico
como hoy, Google Sheets, o un Excel/CSV subido en el panel, que es lo que tendrá Mundillantas con Fénix);
que el bot pueda **vender aros** como producto; que Depot deje de prestarle sus precios de Interbot y sus
perfiles de marca a otro cliente; y arreglar el error de la demo («235 rin 15»). Sale de `origin/main`
fresco y abre PR contra `main`. No espera a ningún otro sprint.

**Archivos permitidos:**
- nuevos: `app/src/services/fuentes/{tipos,index,contifico,sheets,archivo}.ts`, `app/src/domain/aroProducto.ts`, `app/src/domain/anchoYAro.ts`, `app/src/agent/herramientasAros.ts`, `app/src/db/migrations/031_facturas_importadas.ts`, `hub/src/components/catalogo-archivo.tsx`, `app/test/fixtures/catalogo-contifico-muestra.json`, `app/test/fixtures/inventario-fenix-muestra.xlsx` (+ `.csv`), `app/test/fixtures/facturas-fenix-muestra.csv`
- `app/src/services/catalog.ts`, `app/src/services/ventasConfirmadas.ts`, `app/src/services/interbotPrices.ts`
- `app/src/services/metricasComprobables.ts` **solo** la condición de `:370`
- `app/src/services/paraCerrar.ts` **solo** si su condición de disponibilidad mira `config.contifico`
- `app/src/domain/catalog.ts` **solo** el tipo `source` (`:49`)
- `hub/src/data/catalog.ts` **solo** el tipo `source` (`:41`)
- `app/src/services/mostrarPorAro.ts` **solo** `aroParaMostrar` (`:52-58`)
- `app/src/agent/agent.ts` **solo** `:556` (el aro forzado) y la lista de búsquedas de `:847`, con la condición `pideAroComoProducto(texto) && arosDelCatalogo().length > 0`
- `app/src/agent/tools.ts` **solo** (a) imports como líneas NUEVAS inmediatamente después de `:31` (`domain/catalog.js`); (b) `opcionesEnAro` (`:462-551`): parámetro opcional al final `ancho: number | null = null` que filtra `enElAro` antes de armar la escalera (las llamadas de `:585`, `:601`, `:694` no cambian); (c) `buscar_por_aro_y_tipo` (`:1078-1290`); (d) la lista `return [...]` de `buildTools` (`:4092-4109`)
- `app/src/services/settings.ts` **solo** los arreglos `allowedTools` de `DEFAULT_STAGE_PROMPTS` (`:510-628`): agregar `"buscar_aros"` en las etapas que venden
- `app/src/server/admin.ts` **solo** (a) un import nuevo en la línea siguiente a `:71` (`metricasComprobables.js`) y (b) un bloque nuevo de rutas inmediatamente después del cierre de `router.post("/catalog/quote-pdf", …)` (`:1594`) y antes de `// ── Mensajes` (`:1596`)
- `app/src/db/schema.ts` **solo** (a) el import de la 031 en una línea nueva después de `:38`; (b) `await runFacturasImportadasMigration(db);` dentro de `aplicarEsquema` inmediatamente después de `await runParaCerrarMigration(db);` (`:434`); (c) `ULTIMA_MIGRACION_REGISTRADA` (`:445`) apuntando al id de la 031. **Nunca** en `crearIndicesEnSegundoPlano` (`:494-502`)
- `app/src/db/migrations/009_brand_profiles.ts` **solo** la siembra: la marca `brand_profiles_seeded_v1` se inserta siempre, las tres filas de Depot solo con `negocio.id === "depot"`
- `app/scripts/sim/lib/tablas.mjs` **solo** agregar `"facturas_importadas"` a `TABLAS_DATOS`
- `app/assets/precios-interbot.json` → mover a `app/assets/depot/precios-interbot.json` (y las referencias de `app/scripts/**` y `app/test/**` que lo lean: `grep -rn precios-interbot app`)
- `app/package.json` **solo** el bloque `dependencies` (agregar `exceljs`) y `app/package-lock.json`
- tests nuevos: `app/test/fuentes.test.ts`, `app/test/catalogoArchivo.test.ts`, `app/test/aroProducto.test.ts`, `app/test/anchoYAro.test.ts`, `app/test/facturasArchivo.test.ts`, `app/test/interbotPorNegocio.test.ts`, `app/test/brandProfilesPorNegocio.test.ts`
- `BITACORA.md`

**Prohibido:** `app/src/negocio/**` (S1/S4), `app/src/agent/tools.ts` fuera de tus cuatro zonas (S4 tiene `:12`, `:104-106`, `:324-460`, `:1018-1030`, `:1292-1333`, `:2455-2467`, `:3515-3524`, `:4178`), las llamadas a Interbot de `tools.ts:2097-2098` y `:3181-3182` (no se tocan: el arreglo va **dentro** de `interbotPrices.ts`), `app/src/agent/prompts.ts`, `compactPlaybook.ts`, `app/src/services/guardian.ts`, `prepararSalida.ts` (S4), `app/src/services/quoteMessages.ts`, `app/src/services/quotePdf.ts`, `app/src/render/**` (S1), `hub/src/screens/**` (S3; el montaje de tus tarjetas lo hace el SF), `app/scripts/sim/sim.mjs` y `entorno-prod.mjs` (S3), `app/package.json` bloque `scripts` (S3), `app/src/services/advisorNotifications.ts`, `hubUsers.ts` (S3), `app/src/config.ts`, `app/src/services/settings.ts` fuera de los `allowedTools`.

**Pasos.**
1. **Interfaz de fuentes** (`fuentes/tipos.ts`, `index.ts`) como en §3.2. `fuenteDeCatalogo()` se evalúa en
   **cada** `syncCatalog`: Contífico si hay `CONTIFICO_API_KEY`; si no, archivo si existe
   `catalogo_archivo`; si no, Sheets si hay `CATALOG_SHEET_ID`. `startCatalogSync` no sale temprano si
   puede haber archivo. Mueve `syncSheetsCatalog` y `syncContificoCatalog` (`services/catalog.ts:56-182`)
   a `fuentes/sheets.ts` y `fuentes/contifico.ts` sin cambiar lo que producen; lo mismo con
   `normalizarFactura`/`traerPagina`. La serie `001-`/`002-` → local (`ventasConfirmadas.ts:111-112`) se
   queda **dentro** del adaptador de Contífico. Prueba de equivalencia con
   `app/test/fixtures/catalogo-contifico-muestra.json` (unas decenas de filas recortadas del snapshot local,
   varias marcas, medidas y stocks), más un `it.skipIf(!existsSync(snapshot))` que corre el snapshot
   completo de `app/scripts/sim/datos/catalogo.json` cuando existe (git lo ignora); pega su salida en el PR.
2. **Catálogo por archivo** (`fuentes/archivo.ts`): CSV y XLSX (`exceljs`). `catalogo_mapeo` =
   `{ columnas: { medida, marca, diseno, codigo, nombre, precio, precioLista?, precioMinimo?, stock, foto?, tipo?, stockPorLocal?: { [slug]: columna } }, precioIncluyeIva: boolean, filasDeAros: { columna: string, patron: string } | null }`.
   Sin `precioLista`/`precioMinimo`, los dos = `precio` (documentado: sin descuento visible). En esta etapa
   `stockPorLocal` se **suma** en `stock`. Reutiliza la normalización de filas de Sheets (sácala a una
   función compartida). Guarda en `catalogo_archivo` (`{ nombreArchivo, subidoEn, filas, descartadas: [{ fila, motivo }] }`)
   con SQL propio, y lo recarga al arrancar. Rutas: `POST /catalog/import` y `POST /ventas/import` reciben
   el archivo **crudo** (`Content-Type: application/octet-stream`, nombre en `?nombre=`) con
   `express.raw({ type: "*/*", limit: "5mb" })` a nivel de ruta (el `express.json()` del router corta en
   100 kB); nada de base64 en JSON. `POST /catalog/import` guarda y llama a `syncCatalog()`.
   `GET/PUT /catalog/mapeo` con validación `zod`.
3. **Aros** (`domain/aroProducto.ts`, `herramientasAros.ts`): las filas que marca `filasDeAros` (o la
   columna `tipo`) van a una **lista aparte** (`arosDelCatalogo()`), nunca al catálogo de llantas.
   `pideAroComoProducto(texto)` (puro): pregunta por aros/rines como producto («tienen aros de 15», «rines
   de 4 pernos», «aros de lujo») y **no** menciona llanta ni medida de llanta. Cuando es verdad **y** hay aros:
   `aroParaMostrar` (`mostrarPorAro.ts:52-58`) devuelve `null`, el aro forzado de `agent.ts:556` no se
   aplica y `buscar_aros` cuenta como búsqueda en `:847`. `herramientasAros.ts` exporta
   `herramientasDeAros(ctx, definir)`, donde `definir` se tipa por forma (`import type { AgentTool }`, sin
   ciclo en runtime) y `buildTools` le pasa `defineTool` desde su zona de `return`; se agrega a la lista
   **solo si** `arosDelCatalogo().length > 0`. `buscar_aros({ diametro?, pernos?, texto? })` devuelve hasta 5
   aros con stock: `{ aros: [{ codigo, nombre, diametro, pernos, precio_con_iva, stock }], fotos: […], regla }`
   (lo corto primero: la huella del guardián corta en 500 caracteres). La regla: no inventar compatibilidad
   con el vehículo; sin dato de pernos, se ofrece al asesor. Agrega `"buscar_aros"` a los `allowedTools`
   por defecto de las etapas que venden (`settings.ts:510-628`): una base nueva (Mundillantas) la tiene; la
   de Depot ya tiene sus prompts publicados y no cambia (y sin aros la herramienta no existe).
   Pruebas: con aros y los prompts por defecto, la lista final de herramientas de `agent.ts` incluye
   `buscar_aros`; «tienen aros de 15?» no manda la ficha de llantas; Depot: mismo ruteo por aro que hoy.
4. **Ancho + aro sin perfil** (`domain/anchoYAro.ts`): detecta «235 rin 15», «235 r15», «235 aro 15»,
   «rin 15 235». Dentro de `buscar_por_aro_y_tipo`: `const anchoPedido = ancho ?? anchoYAro(ctx.currentUserText)?.ancho ?? null`
   (parámetro opcional `ancho` en el schema) y se pasa a `opcionesEnAro`; así la ruta directa
   (`mostrarPorAro.ts:92`, que no se toca) también filtra. Sin resultados de ese ancho: `encontrado: false`
   con los anchos más cercanos que sí hay en el aro y una regla que prohíbe ofrecer otros anchos como si
   fueran el pedido (la ruta directa devuelve `null` en `:96` y el agente recibe lo mismo). Prueba en rojo por
   `tryMostrarPorAro` y por el agente con el caso de la demo (28:14), y que `medidaNoDada` no bloquee una
   235/xxR15 cuando el cliente dio «235 rin 15». Corre el simulador con ese mensaje contra el catálogo de
   Depot y adjunta antes/después.
5. **Interbot por negocio**: mueve el JSON a `assets/depot/`; `interbotPrices.ts` (`:81-83` ruta,
   `:85-101` `loadSnapshot`) lo busca en `assets/<negocio.id>/precios-interbot.json`. Sin archivo:
   `getInterbotPrice` → null y `refreshPriceForSize`, `ensureInterbotPricesFresh`, `loadPersisted` y
   `applyInterbotPrices` no hacen nada (todo dentro de `interbotPrices.ts`), sin spam en el log.
6. **Facturas por archivo**: migración 031 (tabla de §3.2, `create table if not exists`, índices simples
   `create index if not exists` —no `CONCURRENTLY`: la tabla es nueva— por teléfono de 9 dígitos y por día;
   exporta su id y se registra en `schema_migrations` como la 029). `POST /ventas/import` con `facturas_mapeo`;
   fuente `archivo` de facturas que lee la tabla. `disponible` (`ventasConfirmadas.ts:378`) y
   `metricasComprobables.ts:370` miran `fuenteDeFacturas()`. Regex `LLANTA` (`:38`) con prueba para
   `33X12.5R17`, `7.00R15`, `LT245/75R16`.
7. **Perfiles de marca por negocio** (`009_brand_profiles.ts`): las tres filas de Depot solo con
   `negocio.id === "depot"`. Prueba con `NEGOCIO=ejemplo` sobre una base vacía: `brand_profiles` = 0 filas.
8. **Tarjetas del panel** (`catalogo-archivo.tsx`): `SeccionCatalogoArchivo` (subir —manda el `File` como
   cuerpo—, ver estado/fecha/filas descartadas, editar el mapeo) y `SeccionFacturasArchivo`, con `ui.tsx`.
   No las montes.
9. **Verificación.** Pruebas nuevas + `npx vitest run test/catalog*.test.ts test/ventasConfirmadas*.test.ts`,
   `npm run typecheck`, `npm run sim:humo`, fidelidad del simulador, `cd hub && npm run build`. Con una base
   local: subir `inventario-fenix-muestra.xlsx` (10 llantas, 3 aros, columnas tipo Fénix, una fila mala) y
   mostrar `/catalog/status`.

**Reglas de dominio** (pruebas puras): una fila sin medida ni marca de aro se descarta con motivo, nunca en
silencio · un aro nunca aparece en una búsqueda de llantas · precio sin IVA → se suma el IVA del perfil una
sola vez · el ancho pedido nunca se sustituye en silencio · con Contífico, mismo catálogo y mismas facturas
que hoy · sin aros en el catálogo, el ruteo es el de hoy.

**Aceptación:** R-21…R-28 con pruebas verdes, `/catalog/status` con el Excel de muestra, captura del
simulador con «235 rin 15» antes y después, y las tarjetas compilando.

---

## SPRINT 3 — panel y alta (rama `feat/panel-y-alta`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 3 — panel y alta`**. Después pega debajo
> la PARTE A del plan y ejecuta.

**Objetivo.** (R-29…R-37) Que el panel de un cliente muestre **su** negocio (nombre, locales, horarios,
teléfono, playbook, pendientes de arranque), que los avisos lleguen **al asesor del local elegido**, que una
base nueva quede lista con un comando, que el simulador pueda correr **con otro cliente** (también con
catálogo por archivo), y dejar escrita la receta de alta. Sale de `origin/main` fresco y abre PR contra
`main`. No espera a ningún otro sprint.

**Archivos permitidos:**
- `hub/src/App.tsx`, `hub/index.html`, `hub/public/manifest.webmanifest`, `hub/src/components/tour.tsx`, `hub/src/components/chat.tsx`, `hub/src/screens/Settings.tsx`
- `hub/src/data/types.ts` (**solo** comentario: `LOCALES`/`MARCAS` quedan como datos del mock, los usa `data/mock/fixtures.ts`)
- `hub/src/data/catalog.ts` **solo** el nombre del PDF (`:250`)
- `hub/src/components/anuncios.tsx` **solo** `:114` (nombre del negocio), `hub/src/lib/favicon.ts` **solo** `:26`
- `hub/src/screens/Ajustes.tsx` — todo el archivo, **salvo** montar o importar algo de `catalogo-archivo.tsx` (lo monta el SF)
- nuevo: `hub/src/data/negocio.ts` (cliente de `GET /api/negocio` con respaldo)
- `app/src/server/auth.ts` **solo** el PIN (`:40`)
- `app/src/services/hubUsers.ts` **solo** la constante `SEMILLA` (`:76-83`); `IDS_SEMILLA`, el espejo y `reiniciarUsuariosHub` la derivan y no se tocan
- `app/src/services/advisorNotifications.ts`
- `app/src/server/admin.ts` **solo** (a) un import nuevo en la línea siguiente al cierre del import de `advisorNotifications.js` (`:128`) y (b) un bloque nuevo `GET/PUT /asesores-por-local` inmediatamente después del cierre de `router.delete("/advisors/:id", …)` (`:1963…`)
- nuevos: `app/src/db/seed-negocio.ts`, `app/src/services/asesoresPorLocal.ts`, `docs/clientes/ALTA-DE-CLIENTE.md`
- `app/package.json` **solo** el bloque `scripts` (agregar `"seed:negocio"` debajo de `"seed:depot"`)
- `app/scripts/sim/sim.mjs`, `app/scripts/sim/lib/entorno-prod.mjs`, `app/scripts/sim/README.md`
- tests nuevos: `app/test/asesoresPorLocal.test.ts`, `app/test/seedNegocio.test.ts`, `app/test/hubPin.test.ts`, `app/test/simPorPerfil.test.ts`; `app/test/simuladorFidelidad.test.ts` **no** se edita (tiene que seguir verde con `HUB_PIN` clasificada)
- `BITACORA.md`

**Prohibido:** `app/src/negocio/**` (S1/S4), `app/src/agent/**` (S2/S4), `app/src/render/**`, `services/quotePdf.ts` (S1), `app/src/services/catalog.ts`, `fuentes/**`, `ventasConfirmadas.ts`, `services/settings.ts` (S2), `app/src/db/schema.ts`, `app/src/db/migrations/**` (S2: no hay migración en este sprint; los asesores por local van en `settings`), `app/scripts/sim/lib/tablas.mjs`, `scripts/sim/lib/contifico-sim.mjs` (no hace falta), `app/package.json` bloque `dependencies` (S2), `hub/src/components/catalogo-archivo.tsx` (S2), `hub/src/data/mock/**`, `app/src/server/admin.ts` fuera de tus dos zonas.

**Contrato que consume** (lo entrega el S1; aquí va contra un respaldo, no lo esperes):
- `GET /api/negocio` → `{ id, nombre, ciudad, telefono, identidades: [{ id, nombre, locales }], locales: [{ slug, nombre, nombreCorto, claveHorario }], marcas, vendedor: { nombre }, playbook, faltantes }`.
  `hub/src/data/negocio.ts` lo pide una vez después del login; si responde 404 (S1 todavía no mergeado),
  usa un respaldo con los valores de Depot que hoy están clavados en el panel (y, para `locales`, las
  claves que devuelve `/api/store-hours`). El SF cambia ese respaldo a uno neutro («AutoVenta»).
- `POST /api/catalog/import` (lo entrega el S2): el simulador lo usa con `--catalogo-archivo`; si responde 404,
  error claro («falta el Sprint 2»).

**Pasos.**
1. **Datos del negocio en el panel** (`hub/src/data/negocio.ts` + hook): reemplaza los literales de
   `App.tsx:142`, `tour.tsx:50`, `chat.tsx:396,454`, `catalog.ts:250`, `Ajustes.tsx:79,95`, `anuncios.tsx:114`,
   `favicon.ts:26` y los placeholders `DT` del cupón en Ajustes (iniciales del negocio). `index.html` y el
   manifest pasan a «AutoVenta» y el título de la pestaña se pone en runtime con el nombre del negocio.
   `LOCALES`/`MARCAS` de `types.ts` siguen exportadas para el mock; lo real sale de `negocio.ts`.
2. **Horarios** (`Ajustes.tsx:713`): la lista de locales sale de `negocio.locales` (`claveHorario` +
   `nombreCorto`), con respaldo a las claves de `hours`.
3. **Playbook** (`Settings.tsx:4,14`): muestra `negocio.playbook`; deja de importar `compactPlaybook.ts`.
4. **Tarjeta de arranque** en Ajustes: si `faltantes.length > 0`, una `Tarjeta` arriba de todo con la lista y
   el texto «Lista completa en docs/clientes/<id>-arranque.md».
5. **Usuarios y PIN**: `SEMILLA` (`hubUsers.ts:76-83`) con los cuatro de hoy solo si `negocio.id === "depot"`
   (importa `negocio` de `negocio/index.ts` sin editarlo); si no, solo «manuel» admin. `auth.ts:40` usa
   `process.env.HUB_PIN ?? "1234"`. Clasifica `HUB_PIN` en `entorno-prod.mjs` según el criterio del archivo
   para secretos que no se copian (nunca al log).
6. **Asesores por local** (`services/asesoresPorLocal.ts` puro + SQL propio sobre
   `settings.asesores_por_local`): `asesoresActivos` selecciona también `id` (campo opcional en `Asesor`,
   los demás no cambian); `notifyAdvisor` agrega `nearest_store` a su `select` (`:510`). Con local, los
   avisos van a los asesores asignados a ese local (resuelto con `localPorNombre` del perfil); sin
   asignación o sin local, a todos como hoy. Rutas en tu bloque de `admin.ts`; en Ajustes → Asesores
   (`SeccionAsesores`, `Ajustes.tsx:1007`), una columna de checkboxes por local. Un asesor asignado a un
   local que ya no existe se ignora y se avisa en el log.
7. **Semilla** (`db/seed-negocio.ts`, `npm run seed:negocio`): generaliza `seed-depot.ts` sin tocarlo:
   `ensureSchema`, `ensureDefaultStagePrompts`, fases, `guardian_config`, `ai_config`, `pieces_config` y
   `store_hours` desde `horarioPorDefecto`/`horasPorDia` del perfil activo (las 4 claves de
   `AJUSTES_QUE_IMPORTAN` del simulador), idempotente. Prueba contra Postgres local.
8. **Simulador por cliente** (`sim.mjs`, `entorno-prod.mjs`, README): bandera `--perfil <id>` con una tabla
   por perfil en `entorno-prod.mjs`: `{ entorno, servicio | null, catalogo: "contifico" | "archivo" }`
   (Depot: el de hoy y `contifico`; `ejemplo` y `mundillantas`: sin servicio y `archivo` —Mundillantas
   cambia a su servicio cuando exista—). Fija `--env-file app/.env.sim.<id>`, `--db autoventa_sim_<id>` y,
   para `contifico`, `--catalogo-snapshot app/scripts/sim/datos/catalogo.<id>.json`. Con `catalogo:
   "archivo"`: no levanta el Contífico de mentira ni exporta `CONTIFICO_*` (tampoco en `--humo`), y
   `--catalogo-archivo <xlsx|csv>` sube el archivo por `POST /api/catalog/import` (`ADMIN_KEY` del simulador)
   después de arrancar. **Solo** si el perfil no tiene servicio, en vez de copiar producción corre la
   semilla del paso 7 y toma las variables de modelos (`OPENAI_*`) del servicio de Depot; con servicio, una
   copia incompleta (`sim.mjs:483-496`) sigue fallando como hoy. `NEGOCIO` del perfil se pone **después** de
   las variables copiadas (`sim.mjs:262-300`); si la copiada existe y no coincide, aborta. Sin `--perfil`,
   todo igual que hoy. Prueba con `--perfil ejemplo` (no necesita a Mundillantas ni al S2: sin
   `--catalogo-archivo` arranca con catálogo vacío y lo dice).
9. **Receta** `docs/clientes/ALTA-DE-CLIENTE.md`: servicio web + Postgres en Railway; tabla de variables
   (requeridas: `DATABASE_URL`, `OPENAI_API_KEY`, `NEGOCIO`, `ADMIN_KEY`, `OWNER_KEY`, `NODE_ENV`,
   `ADMIN_PANEL_ORIGIN`, `HUB_PIN`, `BOT_POWER_DEFAULT=off`; los modelos `OPENAI_*` copiados de Depot salvo
   decisión de costos; `SELLER_NAME`, `SELLER_PHONE`, `BILLING_START`, `BILLING_MANTENIMIENTO`,
   `PHASES_DEFAULT`; sin Contífico, Interbot ni canary); `npm run seed:negocio`; conectar WhatsApp según
   `docs/CONECTAR_WHATSAPP_CLIENTE.md`; subir el catálogo en Ajustes; simulador con `--perfil`; cómo
   encender; y el costo de que `main` despliegue a todos los servicios (cambios del perfil juntos, fuera del
   horario de Depot).
10. **Verificación.** Pruebas nuevas, `npm run typecheck`, `cd hub && npm run build`, fidelidad del
    simulador, `npm run sim -- --perfil ejemplo --humo`. Panel local con `NEGOCIO=ejemplo`: capturas de
    Ajustes (horarios con su único local, arranque, asesores por local) y del encabezado.

**Reglas de dominio** (pruebas puras): sin asignación → todos los asesores (Depot igual) · un asesor de un
local que ya no existe no rompe nada · la semilla nunca pisa un valor existente · `--perfil` desconocido no
arranca · el simulador de Depot sigue fallando ante una copia incompleta.

**Aceptación:** R-29…R-37 con capturas del panel con `NEGOCIO=ejemplo`, salida de `sim --perfil ejemplo
--humo`, pruebas verdes y el documento de alta.

---

## SPRINT 4 — política por cliente (rama `feat/politica-por-cliente`)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint 4 — política por cliente`**. Después pega
> debajo la PARTE A del plan y ejecuta.

**Objetivo.** (R-11…R-20) Sacar del código común la **forma de vender de Depot** (formas de pago, cuotas,
descuento por efectivo, beneficio de redes, cobertura en Quito, «vendedor quiteño», juego de 4, escalera y
orden de sus marcas, conocimiento de Falken/Kenda/Winrun, reglas del guardián con «los dos locales») a una
**política por cliente** y a **assets por cliente**, para que Mundillantas venda con lo suyo y Depot siga
idéntico. Sale de `origin/main` fresco y abre PR contra `main`. No espera a ningún otro sprint.

**Archivos permitidos:**
- nuevos: `app/src/negocio/politica.ts`, `app/src/negocio/politicas/{depot,ejemplo,mundillantas}.ts`, `app/src/negocio/assets.ts`, `app/assets/mundillantas/escalera-precio.json`, `app/assets/mundillantas/conocimiento-marcas.json`, `app/assets/mundillantas/base_llantas_tipos.json` (esqueletos válidos, paso 6)
- `app/src/domain/datosDelNegocio.ts`, `beneficioDeRedes.ts`, `fueraDeCobertura.ts`, `compraADistancia.ts`, `storeSelection.ts`, `escalera.ts`, `respaldoMarcas.ts`, `fitmentResearch.ts`, `transcripcionEco.ts`, `alcanceComercial.ts`
- `app/src/domain/ubicacionPedida.ts` **solo** `:58-83`, `app/src/domain/tireTypes.ts` **solo** la ruta (`:73-75`), `app/src/domain/opcionesCandados.ts` **solo** `:134`
- `app/src/services/vehicleFitmentResearch.ts` **solo** `:125`
- `app/src/services/prepararSalida.ts` **solo** los imports (`:59`, `:65`) y los pasos `sin_descuento_negado`, `el_pago_se_responde` y `el_beneficio_se_responde` (`:808-920`)
- `app/src/agent/prompts.ts`, `app/src/agent/compactPlaybook.ts` (**solo** `:27`), `app/src/agent/faseOperativa.ts`
- `app/src/agent/tools.ts` **solo**: imports como líneas NUEVAS inmediatamente después de `:106` (y puedes editar `:12`, `:104`, `:106`); `:324-460` (escalones: `ESCALONES`, `etiquetaEscalon`, `escalonDe`, `tresOpciones`, `escaleraPorUso`, `recorteConEscalera` — **sin cambiar sus firmas**); `:1018-1030` (descripción de `buscar_catalogo`); `:1292-1333` (`respaldo_marcas`); `:2455-2467` (`nota_de_niveles` de `preparar_opciones`); `:3515-3524` (el arreglo `regla` de `generar_cotizacion`); `:4178` (el `escalon` de `toolItem`)
- `app/src/services/guardian.ts`
- tests nuevos: `app/test/politica.test.ts` (también los casos nuevos de Depot para storeSelection/guardian/prompt), `app/test/escaleraPorPrecio.test.ts`, `app/test/perfilAjeno.politica.test.ts`, `app/test/prepararSalidaPagos.test.ts`; los tests existentes de los módulos que tocas **solo** agregando casos, **salvo** `test/perfilDelNegocio.test.ts`, que es del S1 y no se edita
- `BITACORA.md`

**Prohibido:** `app/src/negocio/perfil.ts`, `index.ts`, `identidad.ts`, `negocios/**` (S1 — tu política va en archivos propios), `app/src/agent/tools.ts` fuera de tus zonas (`:31`, `:462-551`, `:1078-1290` y `:4092-4109` son del S2), `app/src/agent/agent.ts`, `app/src/services/mostrarPorAro.ts`, `services/settings.ts` (S2), `app/src/services/quoteMessages.ts`, `services/quotePdf.ts`, `app/src/render/**`, `app/src/domain/saludo.ts`, `cierrePerdido.ts`, `coupons.ts`, `localesInventados.ts` (S1), `app/src/services/catalog.ts`, `fuentes/**`, `interbotPrices.ts`, `ventasConfirmadas.ts` (S2), `app/src/services/advisorNotifications.ts`, `hub/**`, `app/scripts/**`, `app/src/db/**` (S2/S3), `app/src/server/**`, `test/perfilDelNegocio.test.ts` (S1).

**Pasos.**
1. **Política** (`negocio/politica.ts`, solo literales e import de `negocio/index.ts` — nada de `node:fs`,
   `domain/` ni `services/`; el panel la empaqueta a través de `compactPlaybook.ts`): `PoliticaComercial` con
   los campos de §3.2 y `politica` resuelta una vez por `negocio.id`. Registro `POLITICAS`; un id sin política
   lanza el mismo tipo de error que `NEGOCIO` mal escrito. `faltantesDeLaPolitica(politica)` (pura) lista lo
   `[PENDIENTE]`. `politicas/depot.ts` copia **tal cual** lo de hoy (`datosDelNegocio.ts:51-61`, el
   descuento por efectivo de `:85-86`, `beneficioDeRedes.ts:36-41`, «quiteño», «Español de Ecuador»,
   «mantenimiento preventivo automotriz», `vendeADistancia` = lo que hace hoy `compraADistancia.ts`,
   `juegoCompleto: 4`, `escalonPorPrecio: false`, `productosQueDerivaAlAsesor: []`, `asesorEnReglas:
   "Manuel"`). `politicas/mundillantas.ts`: lo confirmado y `[PENDIENTE]` en el resto (`formasDePago: []`,
   `cuotasSinIntereses: null`, `descuentoEnEfectivo: null`, `beneficioDeRedes: null`, `escalonPorPrecio: true`,
   `productosQueDerivaAlAsesor: ["lubricantes", "baterías", "aceites", "taller"]`, `asesorEnReglas: "el
   asesor"`, `gentilicio` marcado `[SUPUESTO]` en un comentario).
2. **Pagos y beneficio** (`datosDelNegocio.ts`, `beneficioDeRedes.ts`, `prepararSalida.ts:808-920`,
   `prompts.ts:36`, `guardian.ts:311`, `respaldo_marcas`): leen `politica`. Con `formasDePago` vacío, los pasos
   `sin_descuento_negado` y `el_pago_se_responde` devuelven el texto sin tocar (sin el prefijo `---`) y el
   guardián no acepta formas de pago como HECHO; con `descuentoEnEfectivo: null` se apaga el candado del
   descuento negado; con `beneficioDeRedes: null` se salta `el_beneficio_se_responde`. Prueba de fijación de
   Depot antes del cambio en `prepararSalidaPagos.test.ts`.
3. **Cobertura y lugares** (`fueraDeCobertura.ts` —incluida su lista de ciudades, `:40-60`—,
   `ubicacionPedida.ts:58-83`, `compraADistancia.ts:35`, `faseOperativa.ts:37`, `storeSelection.ts:101,112`):
   la cobertura sale de `negocio.ciudad` + `sectores` + locales; las listas de «otras ciudades» excluyen la
   ciudad del negocio, sus alias y las palabras de las direcciones de sus locales; los regex de locales se
   arman con `comoPatron`/`comoLoNombran` del perfil. `vendeADistancia` decide la compra a distancia.
4. **Textos regionales** (`prompts.ts:30,53` —con `marcas` vacío se omite «Vende …»—, `compactPlaybook.ts:27`,
   `tools.ts:3515-3524` con `politica.asesorEnReglas` y «fuera de <ciudad>», `fitmentResearch.ts:145`,
   `vehicleFitmentResearch.ts:125`, `transcripcionEco.ts:22-23`). `compactPlaybook.ts:11` y el nombre del
   negocio de `prompts.ts:30` **no** se tocan (usan la frase de presentación del S1: lo conecta el SF).
5. **Assets por cliente** (`negocio/assets.ts`): `rutaDeAsset(nombre)` → `assets/<negocio.id>/<nombre>` si
   existe, si no `assets/<nombre>`. `escalera.ts:48`, `respaldoMarcas.ts` y `tireTypes.ts:73-75` lo usan.
6. **Escalera por precio** (`tools.ts:324-460`, `:2455-2467`, `:4178`): helper nuevo
   `escalonesPorPrecio(productos)` en tu zona (tercil alto = premium, medio = equilibrio, bajo = económica,
   sin repetir escalón). Con `politica.escalonPorPrecio`, `tresOpciones`/`escaleraPorUso` lo usan, la
   `nota_de_niveles` habla de los escalones del conjunto y el `escalon` que ve el modelo sale del conjunto (de
   un mapa a nivel de módulo; `toolItem` conserva su único parámetro). Con la bandera apagada (Depot), todo
   igual. Esqueletos de Mundillantas: `escalera-precio.json` vacío, `conocimiento-marcas.json` vacío con
   `[PENDIENTE]`, `base_llantas_tipos.json` = el común con `orden_de_marca: []` y sin SKUs de Depot pero con
   los mismos `tipos`/`regla_equivalencia`; los tres válidos para sus cargadores.
7. **Herramientas, juego y guardián**: descripciones de `buscar_catalogo` y `respaldo_marcas` desde
   `negocio.marcas` o el conocimiento de marcas del cliente (Depot: mismo texto); reglas de
   `tools.ts:1324-1328` desde el conocimiento del cliente (GITI y «10.000 km» son de Depot);
   `opcionesCandados.ts:134` = `politica.juegoCompleto` (las llamadas no cambian); `alcanceComercial.ts`
   suma `productosQueDerivaAlAsesor` a lo que está fuera de catálogo; guardián `:239`, regla 16 (`:251`) y el
   ejemplo de `INSTRUCCIONES_SEGUIMIENTO` (`:280`) con los locales del perfil y su cantidad.
8. **Pruebas.** Para cada texto movido, una prueba que fija la salida de Depot de hoy (antes de moverlo).
   `perfilAjeno.politica.test.ts`: con `vi.resetModules()` y `NEGOCIO=ejemplo` y luego `mundillantas`, arma
   el prompt del sistema, `INSTRUCCIONES` e `INSTRUCCIONES_SEGUIMIENTO` del guardián, sus HECHOS, la salida de
   `respaldo_marcas` y los pasos de pago de `prepararSalida`, y afirma que no contienen
   `Depot|Cumbayá|Quito|quiteño|Falken|Kenda|Winrun|3 y 6 meses`. Los casos de Mundillantas se saltan si el
   perfil todavía no existe en tu rama: `const existe = existsSync(new URL("../src/negocio/negocios/mundillantas.ts", import.meta.url)); it.skipIf(!existe)(…)`,
   **sin** importar `negocio/index.ts` antes del chequeo. El SF los vuelve obligatorios.
9. **Verificación.** Pruebas + `npm run typecheck`, `npm run sim:humo`, fidelidad del simulador,
   `cd hub && npm run build`, y el diff **byte a byte** vacío, para Depot, del prompt del sistema, las reglas y
   HECHOS del guardián y las descripciones de herramientas antes/después (adjúntalo al PR, con el prompt del
   sistema de `ejemplo`).

**Reglas de dominio** (pruebas puras): Depot idéntico en prompt, guardián, herramientas y salida · sin
formas de pago → no se prometen ni se inyectan · sin beneficio de redes → no se menciona · un cliente en la
ciudad del negocio no está fuera de cobertura · escalera por precio nunca repite escalón.

**Aceptación:** R-11…R-20 con pruebas verdes, el diff vacío de Depot y el prompt del sistema de `ejemplo`
adjunto en el PR.

---

## SPRINT FINAL — revisión y merge (rama de trabajo `release/multicliente-2026-11`, para Fable con agentes)

> **Empieza por aquí:** ponle a esta sesión el nombre **`Sprint Final — revisión y merge`**. Debajo pega la
> PARTE A y ejecuta. Córrelo cuando los cuatro sprints de trabajo tengan PR abierto.

Este sprint **no lleva número**: no es «uno más» de la fila, es el que cierra. Los requisitos que entrega
apuntan a `→ **SF**` en la PARTE B.

**Objetivo.** Que nada se pierda y todo funcione junto: revisar los PRs S1–S4 contra la PARTE B,
mergearlos, **conectar** lo que se dejó para acá a propósito (para que ningún archivo tuviera dos dueños),
verificar que **Depot sigue idéntico**, desplegar sabiendo qué despliega, y dejar el servicio de Mundillantas
listo para encender. Todos los PRs salen de `main` y van contra `main`: no hay orden obligatorio, y un sprint
que falte simplemente no se mergea.

**Pasos.**
1. **Inventario.** `gh pr list --state open` → tabla PR ↔ sprint ↔ R-xx. Por PR: diff completo; ¿solo
   archivos permitidos y dentro de sus zonas «solo»?; ¿pruebas?; ¿bitácora?; ¿verificación documentada?;
   ¿commits con `--no-verify` justificados?
2. **Revisión en paralelo, una lente por agente** (workflow o subagentes; tú consolidas):
   - *Depot idéntico* — por cada texto/pieza/decisión movida, la salida de Depot antes y después (pruebas de
     fijación, hashes de piezas con reloj congelado, diff del prompt del sistema, reglas y HECHOS del guardián).
   - *Perfil ajeno* — con `NEGOCIO=ejemplo` y `mundillantas`, `grep` de `Depot|Cumbayá|Quito|Martín|Falken|Kenda|Winrun|quiteño|\[PENDIENTE\]` en todo lo que el bot o el panel pueden mostrar; cada aparición es un hallazgo.
   - *Datos y seguridad* — rutas nuevas detrás de `exigirCredencial`; límites de tamaño del upload; el Excel
     no ejecuta nada; `facturas_importadas` en `TABLAS_DATOS`; `HUB_PIN` nunca en el log.
   - *Contratos* — `GET /api/negocio` (S1) contra `hub/src/data/negocio.ts` (S3); `POST /api/catalog/import`
     (S2) contra `--catalogo-archivo` (S3).
   - *Simplificación* — duplicación entre `fuentes/sheets.ts` y `fuentes/archivo.ts`, nombres, pruebas que
     faltan («mejora lo mejorable» sin cambiar comportamiento).
   Bloqueantes → commit en la rama del PR → re-verificar.
3. **Merge** (orden sugerido por riesgo: S3 → S2 → S1 → S4; cualquier orden sirve). Por cada uno: rebase
   sobre `main`, `npm run typecheck`, pruebas del PR, squash-merge, borrar rama. Conflicto en `BITACORA.md`:
   a mano, dejando todas las entradas (la del PR que entra arriba), sin `--ours/--theirs`, y `git diff --check`
   antes de seguir el rebase. Tras cada merge: suite completa con Postgres local.
4. **Conectar lo que se dejó para acá** (en `release/multicliente-2026-11`, R-45):
   - Las llamadas reales a las piezas pasan la identidad del local de la conversación
     (`identidadDeLaConversacion(negocio, nearest_store)`): `tools.ts:2192`, `:2530`, `:3290` (leyendo
     `nearest_store` con un `select`), `directSalesRoutes.ts:112`, `webhook.ts:134,197` y
     `services/quotePdf.ts`. Depot: una sola identidad → piezas idénticas (hash).
   - `prompts.ts:30` y `compactPlaybook.ts:11` usan la frase de presentación (`nombresDelNegocio`/
     `presentacion`) en vez de `negocio.nombre`; diff vacío para Depot.
   - `faltantes` de `/api/negocio` = `faltantesDelPerfil` ∪ `faltantesDeLaPolitica` ∪ archivos que faltan en
     `assets/<id>/` (logo por identidad, escalera, conocimiento).
   - `botPower` no se enciende con `faltantes` no vacío salvo confirmación explícita en el panel (R-44).
   - Montar `SeccionCatalogoArchivo` y `SeccionFacturasArchivo` en `Ajustes.tsx` (después de `SeccionPrecios`).
   - Respaldo de `hub/src/data/negocio.ts`: de los valores de Depot a uno neutro («AutoVenta»).
   - Volver obligatorios los casos de Mundillantas de `perfilAjeno.politica.test.ts`.
   - Prueba de consistencia: con `cuotasSinIntereses: null`, `piezas.condiciones`/`mediosDePago` no
     mencionan meses ni cuotas.
   - Si el guardián tachó los precios de aros (nota del S2), pasarle esos datos como HECHO
     (`agent.ts:915` / `guardian.ts`).
   - Construir el hub (`cd hub && npm run build`) y commitear `app/site/**` (esta vez con el hook normal).
5. **Depot intacto (R-39).** `npm test` completo, `npm run sim:humo`, fidelidad del simulador; para 10 chats
   reales recientes de Depot: diff byte a byte del prompt del sistema, reglas y HECHOS del guardián y
   descripciones de herramientas entre `main` previo y la rama (tiene que ser vacío); y la reproducción con el
   modelo, 3 corridas por chat, en un gráfico de control (`scripts/sim/grafico-canary.mjs`) con `main` previo
   como fase I: dentro de límites = sin cambio; una señal se explica o se arregla.
6. **Deploy (R-40).** En Railway, confirma si el servicio de Depot tiene auto-deploy desde `main` (los docs se
   contradicen: `CLAUDE.md:4` vs `docs/entrega-fases-depot.md:84-89`) y escríbelo en `CLAUDE.md`. Con eso claro
   y con el visto bueno de Manuel, PR `release/multicliente-2026-11` → `main`, merge **fuera del horario de
   Depot**, esperar el deploy, revisar logs 30 min y que Depot conteste en su número (una conversación de
   prueba del propio Manuel).
7. **Mundillantas listo para encender (R-41).** Con Manuel (crear servicios en Railway es una acción de su
   cuenta): servicio + Postgres según `docs/clientes/ALTA-DE-CLIENTE.md`, `NEGOCIO=mundillantas`,
   `BOT_POWER_DEFAULT=off`, `npm run seed:negocio`, panel accesible con `HUB_PIN` propio; actualizar su fila
   en la tabla de perfiles del simulador; `npm run sim -- --perfil mundillantas --catalogo-archivo
   app/test/fixtures/inventario-fenix-muestra.xlsx` contestando un chat de llantas (con «235 rin 15») y uno
   de aros. Lo que depende del cliente (Meta, Excel real, logos, datos de la lista de arranque) queda como
   pendiente explícito en `docs/clientes/mundillantas-arranque.md`.
8. **Que siga valiendo para los dos (R-42).** `CLAUDE.md` y `docs/COMO-ARREGLAR-EL-BOT.md`: dos clientes, y
   las pruebas de después de tocar el bot suman `npx vitest run test/perfilAjeno.*.test.ts` y
   `npm run sim -- --perfil ejemplo --humo`.
9. **Informe (R-43).** Tabla R-01…R-45 con ✅/⚠️/❌ y evidencia (PR, prueba, captura, URL), en el PR de cierre
   y en `BITACORA.md`; `docs/MULTICLIENTE.md` con «Estado al <fecha>».

**Criterio de éxito.** Todos los R-xx en ✅ con evidencia, Depot sin regresiones, producción = `main`, y el
servicio de Mundillantas esperando solo los datos del cliente.

---

## Qué hace cada sprint

| Sprint | Rama | Qué entrega | Pedidos |
|---|---|---|---|
| **Sprint 0 — documentos base** | `docs/multicliente-plan` | Los documentos que leen todos los sprints, en `main` | P-03 |
| **Sprint 1 — dos marcas** | `feat/dos-marcas` | El bot se presenta como Mundillantas y Competimotor, las piezas aceptan la marca del local con su logo, las garantías salen del perfil, el perfil de Mundillantas existe y lo pendiente nunca llega al cliente | P-01, P-02, P-04, P-10 |
| **Sprint 2 — catálogo por archivo** | `feat/catalogo-por-archivo` | Mundillantas carga su inventario de Fénix subiendo un Excel, el bot vende aros, «235 rin 15» deja de mostrar otros anchos, las facturas se pueden subir para medir, y los precios y perfiles de marca de Depot no se cuelan | P-05, P-06, P-07, P-13, P-14 |
| **Sprint 3 — panel y alta** | `feat/panel-y-alta` | El panel muestra el negocio de cada cliente, los avisos van al asesor del local, una base nueva se arma con un comando y el simulador corre con otro cliente y su Excel | P-08, P-11, P-12, P-15 |
| **Sprint 4 — política por cliente** | `feat/politica-por-cliente` | El bot deja de prometer las formas de pago, el beneficio y la cobertura de Depot, y arma las tres opciones por precio cuando no conoce las marcas | P-02, P-09 |
| **Sprint Final — revisión y merge** (Fable con agentes) | mergea a `main` | Revisa los PRs contra R-01…R-45, conecta la marca del local a las piezas reales, comprueba que Depot sigue idéntico, despliega fuera de horario y deja el servicio de Mundillantas listo para encender | P-14, P-15, P-16 + verificación |

Pedidos (intake del 4-nov): P-01 un solo código para las dos empresas · P-02 cada una con su modalidad ·
P-03 aprender en 2 semanas y terminar armado · P-04 dos marcas · P-05 Fénix local · P-06 medir ventas sin
API · P-07 aros · P-08 locales, horarios y asesores · P-09 política comercial propia · P-10 piezas y fotos
por marca · P-11 panel del cliente · P-12 simulador del cliente · P-13 error «235 rin 15» · P-14 Depot no
se rompe · P-15 servicio y WhatsApp del cliente · P-16 facturación del cliente (queda en la lista de
arranque: falta razón social).

**Fuera de alcance (decidido):** llanta de camión (aros 17.5/19.5/22.5; `tools.ts:1083` solo acepta enteros)
hasta que confirmen que la venden · un número de WhatsApp por marca (ruteo por `phone_number_id`) · un prefijo
de cupón por marca (uno por negocio) · cantidad de opciones distinta de tres · piezas gráficas para aros ·
stock por local en la cotización (se suma) · zona horaria por cliente (los dos están en Ecuador) · interfaz
en el panel para editar la política (se edita en `politicas/<id>.ts`: en la prueba la cambia Manuel, no el
cliente) · la pre-factura de Mundillantas (`facturacion` sin definir: el modelo actual —IA aparte +
mantenimiento, prefijo `DT`, archivo `prefactura-depot`— no calza con su contrato de $1.500 + $600 con IA
incluida; se adapta cuando paguen la instalación).

## Apéndice — Paralelismo

Todos los sprints numerados corren a la vez; el SPRINT FINAL se corre cuando todos tengan PR.

**Archivos calientes y quién los toca**

| Archivo | Zonas y dueño |
|---|---|
| `app/src/agent/tools.ts` | S2: imports después de `:31`, `:462-551`, `:1078-1290`, `:4092-4109` · S4: imports después de `:106` (+ `:12`, `:104`, `:106`), `:324-460`, `:1018-1030`, `:1292-1333`, `:2455-2467`, `:3515-3524`, `:4178` · nadie: `:215` (`defineTool`), `:2097-2098` y `:3181-3182` (Interbot), `:2192`/`:2530`/`:3290` (piezas → SF) |
| `app/src/server/admin.ts` | Imports: S2 después de `:71`, S1 después de `:107`, S3 después de `:128` (nadie al final del bloque) · Rutas: S1 después de `:471`, S2 después de `:1594`, S3 después de `/advisors/:id` (`:1963…`) |
| `app/src/services/quoteMessages.ts` | S1 (garantías `:671-691`, textos, emojis) |
| `app/src/services/quotePdf.ts` | S1 |
| `app/src/services/prepararSalida.ts` | S4 (`:59`, `:65`, `:808-920`) |
| `app/src/services/settings.ts` | S2 (**solo** `allowedTools` de `DEFAULT_STAGE_PROMPTS`) |
| `app/src/agent/agent.ts`, `services/mostrarPorAro.ts` | S2 (zonas de aros); `agent.ts:915` → SF si hace falta |
| `app/src/negocio/**` | S1: `perfil.ts`, `index.ts`, `identidad.ts`, `negocios/**` · S4: `politica.ts`, `politicas/**`, `assets.ts` |
| `app/src/db/schema.ts`, `migrations/**` | Solo S2 (031 y la siembra de la 009) |
| `app/package.json` | S2: `dependencies` · S3: `scripts` |
| `app/scripts/sim/**` | S2: `lib/tablas.mjs` (una línea) · S3: `sim.mjs`, `lib/entorno-prod.mjs`, README |
| `hub/src/screens/Ajustes.tsx` | S3 (el montaje de las tarjetas del S2 lo hace el SF) |
| `hub/src/data/catalog.ts` | S2: `:41` · S3: `:250` |
| `test/perfilDelNegocio.test.ts` | Solo S1 |
| `BITACORA.md` | Todos (arriba de todo; en conflicto se conservan todas las entradas) |

**Contratos**

| Contrato | Entrega | Consume | Respaldo mientras tanto |
|---|---|---|---|
| `GET /api/negocio` | S1 | S3 (`hub/src/data/negocio.ts`) | Valores de Depot de hoy si responde 404; el SF lo cambia a neutro |
| `POST /api/catalog/import` | S2 | S3 (`sim --catalogo-archivo`) | Error claro si responde 404 |
| `NEGOCIO=mundillantas` | S1 | S4 (prueba de perfil ajeno) | `it.skipIf` por `existsSync`; el SF la vuelve obligatoria |
| `PieceTheme.identidad?` | S1 | SF (llamadas de `tools.ts`, `webhook.ts`, `directSalesRoutes.ts`) | Sin identidad = la de la presentación |
| `faltantesDeLaPolitica` | S4 | SF (`negocioPublico.ts`) | `faltantes` = solo los del perfil |
| `SeccionCatalogoArchivo`, `SeccionFacturasArchivo` | S2 | Ajustes (SF) | No se montan hasta el SF |
| `negocio` (perfil activo) | existente | S3, S4 | Se importa de `negocio/index.ts` sin editarlo |
