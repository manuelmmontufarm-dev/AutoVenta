# Alta de un cliente nuevo en AutoVenta

> Receta para poner a un segundo (tercer, cuarto…) cliente sobre el **mismo código** que Depot.
> Escrita el 4-nov-2026 para Mundillantas/Competimotor (Sprint 3 del
> [plan multicliente](../planning/PLAN-MULTICLIENTE-MASTER-PROMPT.md), R-37). Contexto y nombres
> decididos: [MULTICLIENTE.md](../MULTICLIENTE.md) §3.2.

**La idea en una línea:** un cliente = un servicio de Railway + su Postgres + `NEGOCIO=<id>`. El
código es uno solo; lo que cambia de un cliente a otro vive en su perfil
(`app/src/negocio/negocios/<id>.ts`), su política (`app/src/negocio/politicas/<id>.ts`), sus archivos
(`app/assets/<id>/`) y sus Ajustes en el panel.

---

## 0. Antes de empezar

- El perfil del cliente existe y está registrado en `PERFILES` (`app/src/negocio/index.ts`), con lo
  que no esté confirmado marcado `"[PENDIENTE] …"` — **nunca inventado** (coordenadas, teléfonos,
  garantías, precios). Un `NEGOCIO` que no está en `PERFILES` no arranca, a propósito.
- Su lista de arranque: `docs/clientes/<id>-arranque.md` (la de Mundillantas:
  [mundillantas-arranque.md](mundillantas-arranque.md)). La tarjeta «Falta para encender el bot» de
  Ajustes muestra lo que sigue `[PENDIENTE]`.

## 1. Servicio web + Postgres en Railway

1. En el proyecto de Railway: **New Service → Deploy from GitHub repo** (el mismo repo de Depot).
   Root Directory = `app/`.
2. **Add Postgres** (uno nuevo, solo de este cliente), renómbralo `Postgres-<Cliente>` y en el
   servicio: `DATABASE_URL=${{Postgres-<Cliente>.DATABASE_URL}}` (la referencia lleva el nombre
   exacto del servicio de Postgres; `${{Postgres.…}}` es la base de **Depot**).
3. En el Postgres nuevo: **Settings → Networking → TCP Proxy** (puerto 5432). Sin él no hay URL
   pública y la semilla del paso 3 no se puede correr desde el portátil.
4. **Un solo servicio por cliente, sin réplicas**: la ráfaga de mensajes y las colas viven en memoria
   (`docs/OPERACION.md`).

> Mundillantas (5-nov-2026): entorno `Depot_Tire`, servicios `Mundillantas` y
> `Postgres-Mundillantas`, panel en `https://mundillantas-depottire.up.railway.app/admin/`.

## 2. Variables del servicio

| Variable | Valor para un cliente nuevo | Por qué |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` del Postgres de **este** cliente | Cada cliente tiene su base; nunca la de Depot. |
| `NEGOCIO` | `<id>` del perfil (`mundillantas`) | Elige perfil, política y assets. Mal escrito = no arranca. |
| `NODE_ENV` | **No la pongas** (Depot tampoco la tiene) | Con `production` el build falla: `npm ci` omite las devDependencies y `tsc` no existe. El panel igual queda cerrado porque `ADMIN_KEY` está puesta. |
| `ADMIN_KEY` | Clave nueva, **distinta** de la de Depot | Firma las sesiones del panel y abre la API. |
| `OWNER_KEY` | Clave nueva, distinta de `ADMIN_KEY` | Solo para marcar meses como pagados (facturación). |
| `HUB_PIN` | PIN compartido nuevo del panel | Sin ella el PIN es «1234», que está publicado en el repo. |
| `ADMIN_PANEL_ORIGIN` | El origen del panel central (como en Depot) | CORS del panel; sin ella queda `*`. |
| `BOT_POWER_DEFAULT` | `off` | **El bot nace apagado.** Se enciende a mano cuando todo está cargado (paso 8). Sin la variable nace **prendido**. |
| `OPENAI_API_KEY` | La clave del proyecto de OpenAI que pagará este cliente | Los tokens de un cliente no se mezclan con los de otro. |
| `OPENAI_MODEL`, `OPENAI_ROUTINE_MODEL`, `OPENAI_CLASSIFIER_MODEL`, `OPENAI_GUARDIAN_MODEL`, `OPENAI_RESEARCH_MODEL`, `OPENAI_VISION_MODEL`, `OPENAI_ESCALATION_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_EVAL_MODEL`, `OPENAI_EXACT_TOOL_MODEL` | **Copiadas del servicio de Depot**, salvo decisión de costos | Mismos modelos = el mismo bot que ya se probó con Depot. |
| `AI_*` | Copiadas de Depot **sin** las del canary (`AI_CANARY_*`) | Interruptores del agente (prompt compacto, historia, vueltas). |
| `SELLER_NAME` | Nombre de quien recibe los avisos de respaldo | Respaldo de avisos si la tabla de asesores no responde. |
| `SELLER_PHONE` | Teléfono (con 593) de ese respaldo — o en blanco y se carga en el panel | Ídem. |
| `BILLING_START` | Primer día facturable (`YYYY-MM-DD`) | Sin ella cuenta desde el inicio de Depot (12-ago-2026). |
| `BILLING_MANTENIMIENTO` | Cuota mensual del cliente en USD | Sin ella usa los $80 de Depot. |
| `PHASES_DEFAULT` | Sin definir (= Fase 1) o la fase acordada | Qué pantallas y herramientas arrancan encendidas. |

**No van en un cliente sin Contífico ni Interbot:** `CONTIFICO_*`, `INTERBOT_*`, `CATALOG_SHEET_ID`
(salvo que use la Sheet de respaldo), ni las del canary (`OPENAI_CANARY_*`, `AI_CANARY_*`). Las
`WHATSAPP_*` se dejan en blanco: se cargan desde el panel (paso 5).

## 3. Primer deploy y semilla

1. Deploy. El servicio crea el esquema solo al arrancar.
2. Deja la base lista para el perfil (idempotente: correrla dos veces no pisa nada):

   ```bash
   cd app && DATABASE_URL='<DATABASE_PUBLIC_URL del Postgres del cliente>' NEGOCIO=<id> OPENAI_API_KEY=x npm run seed:negocio
   ```

   Con la URL **pública** del Postgres del cliente (Railway → Postgres → Connect): la
   `DATABASE_URL` interna del servicio no se alcanza desde el portátil. `OPENAI_API_KEY` solo la
   pide la carga de la configuración; la semilla no llama a OpenAI. Revisa dos veces que la URL sea
   la del cliente y no la de Depot.

   Escribe prompts por etapa, fases y las llaves de arranque desde el perfil: `guardian_config`
   (guardián **prendido**), `ai_config`, `pieces_config` y `store_hours` (desde `horarioPorDefecto`
   de cada local o `horasPorDia` del negocio). El log dice qué sembró y qué ya existía.
3. Entra al panel (`https://<servicio>.up.railway.app/admin/`) con `manuel` y el `HUB_PIN`. Un negocio
   que no es Depot arranca con **un solo** usuario (Manuel, admin); los del cliente se crean en
   Ajustes → Usuarios (cada uno crea su clave en su primer ingreso).

## 4. Ajustes del cliente (sin deploy)

- **Negocio → Horarios:** un recuadro por local del perfil. Ajusta horarios, feriados y cierres.
- **Avisos → Quién recibe los avisos:** carga a los asesores (nombre + teléfono con 593 + nivel) y
  marca **en qué local atiende cada uno**. Con local elegido por el cliente, el aviso va solo a los de
  ese local; un local sin nadie marcado, o un chat sin local todavía, avisa a todos.
- **Piezas → Promociones:** lo que «incluye» la compra (si no se carga, el bot no promete nada).
- **Bot → Falta para encender el bot:** lo que sigue `[PENDIENTE]` en el perfil.

## 5. Conectar WhatsApp

Sigue [CONECTAR_WHATSAPP_CLIENTE.md](../CONECTAR_WHATSAPP_CLIENTE.md) al pie de la letra. La regla de
oro: **la app de Meta va en el portafolio DEL CLIENTE**, y Meta lo paga el cliente con su tarjeta. Al
final, las credenciales se pegan en el panel del cliente y el webhook se registra en
`https://<servicio>.up.railway.app/webhook`.

## 6. Subir el catálogo

Sin Contífico, el inventario entra por archivo: el cliente exporta su Excel/CSV (en Fénix, el
inventario) y lo sube en **Ajustes → Catálogo** (`POST /api/catalog/import`, Sprint 2). El mapeo de
columnas (`catalogo_mapeo`: medida, marca, precio, stock, qué filas son aros…) se configura una vez.
El bot usa el catálogo nuevo sin reinicio; si no suben otro, sigue con el último y el panel muestra
la fecha.

> Hasta que el Sprint Final monte la tarjeta del catálogo en Ajustes, la subida se hace por la API o
> con el simulador (`--catalogo-archivo`).

## 7. Probar en el simulador ANTES de encender

```bash
cd app && npm run sim -- --perfil <id> --humo
```

```bash
cd app && npm run sim -- --perfil <id> --catalogo-archivo <ruta/al/inventario.xlsx>
```

- Sin servicio en la tabla `PERFILES_SIM` (`app/scripts/sim/lib/entorno-prod.mjs`), el simulador
  siembra su base con `seed:negocio` y toma de Depot **solo los modelos** (`OPENAI_*`).
- Cuando el cliente tenga servicio, ponlo en `PERFILES_SIM` (`entorno`/`servicio` de Railway) y el
  simulador copiará su configuración real, como hace con Depot. Para eso necesita
  `app/.env.sim.<id>` (ignorado por git) con `DATABASE_URL=<URL pública del Postgres del cliente>`
  y `NEGOCIO=<id>`: de ahí **lee** los Ajustes, nunca escribe. Mundillantas ya está así (5-nov).
- Clave de OpenAI de pruebas en `app/.env.sim` (la misma de siempre, nunca la del cliente). Detalle
  en [app/scripts/sim/README.md](../../app/scripts/sim/README.md).

Criterio de la prueba de Mundillantas: que conteste bien 20 chats reales de ellos antes de encender
(ver la lista de arranque).

## 8. Encender

1. La tarjeta «Falta para encender el bot» vacía (o cada pendiente aceptado a sabiendas).
2. Asesores cargados con su local, horarios revisados, catálogo subido y con fecha de hoy.
3. Ajustes → Bot → **Encender el bot**. Primero en un horario corto (fuera de horario es donde no
   pisa a nadie) y revisando cada chat el mismo día.

## 9. El costo de «un solo código»

**Un push a `main` despliega a todos los servicios**: cambiar el `.ts` del perfil de Mundillantas
también reinicia el servicio de Depot (un reinicio corto: lo que llega en ese momento espera a la
siguiente respuesta). Por eso:

- Lo que cambia todos los días va en **Ajustes**, que no despliega nada.
- Los cambios de perfil/política/assets se **juntan** y se despliegan **fuera del horario de Depot**.
- Antes de mergear, confirma en Railway si el servicio de Depot tiene auto-deploy (los docs se
  contradicen: `CLAUDE.md` dice que `main` sale a producción; `docs/entrega-fases-depot.md` dice que
  el de Depot tiene el auto-deploy apagado). El Sprint Final lo comprueba (R-40).
- Un arreglo del bot se hace en el código común, con su prueba en rojo, y llega a los dos clientes en
  el mismo deploy — esa es la ventaja que paga este costo.
