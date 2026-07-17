# AutoVenta — Parte 1: Depot Tire Hub (solo frontend)

> Plan a **2026-07-16**. Alcance: un panel web **100% frontend** (datos simulados) con calidad
> visual nivel Apple, aplicado a la marca Depot Tire, listo para demo con Joaquín.
> El backend real (bot ya esqueletizado en `app/`) se conecta en la Parte 2 **sin rediseñar nada**:
> el mock imita la forma exacta de la API futura.

---

## 0. Resumen ejecutivo

| Qué | Decisión |
|---|---|
| **Producto** | "Depot Tire Hub": panel del vendedor con **tickets** (1 cliente = 1 ticket abierto/cerrado) + **pipeline visual** que copia su guion real de venta + chat estilo WhatsApp + KPIs |
| **Stack** | Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + Framer Motion + dnd-kit |
| **Datos** | Capa `DataSource` con implementación mock (fixtures + simulador en vivo). En Parte 2 se cambia por `fetch` al Express del bot — cero cambios de UI |
| **Dónde vive** | `hub/` en este repo. Se sirve después bajo `/admin` del mismo Express (PLAN_DESARROLLO §6) |
| **Demo** | "Modo demo": botón que simula clientes escribiendo en tiempo real y los tickets avanzando solos por el pipeline — el efecto ¡wow! para Joaquín |
| **Estimación** | **22–30 h** (desglose en §7) |

---

## 1. El pipeline = su guion real de venta

El cliente ya vende así por WhatsApp (confirmado en las reuniones). El pipeline del Hub
**copia ese guion literal**, etapa por etapa:

```
1. NUEVO        Cliente escribe → se responde y se le preguntan las MEDIDAS
2. MEDIDAS      Se tienen las medidas → se busca el PDF/cotización
3. COTIZADO     PDF enviado → se le pregunta si está INTERESADO
4. UBICACIÓN    Interesado → se le pide su ubicación → se manda el LOCAL MÁS CERCANO
5. POR VISITAR  Se le pregunta: ¿vas a venir a comprar la llanta?
   └─► CERRADO  ganado (dijo que va / compró) · perdido (no va) · sin respuesta
```

Mapeo contra lo que ya existe en el código (para no romper nada en Parte 2):

| Etapa Hub | `Stage` actual (`app/src/services/conversations.ts`) | Cambio |
|---|---|---|
| Nuevo | `nuevo` | — |
| Medidas | `conversando` | renombrar en schema en Parte 2 (o alias en UI) |
| Cotizado | `cotizado` | — |
| Ubicación | 🆕 | agregar al enum en Parte 2 |
| Por visitar | `alerta` (hoy = "alerta vendedor") | el significado coincide: cliente caliente |
| Cerrado ganado/perdido | `cerrado` / `perdido` | — |

**Regla del frontend:** el mock usa ya los nombres nuevos (`nuevo | medidas | cotizado | ubicacion | por_visitar | cerrado_ganado | cerrado_perdido`). La migración SQL es de Parte 2.

---

## 2. Sistema de tickets — lógica copiada de los que lo hacen bien

Investigado en `docs/INVESTIGACION_GITHUB.md` + patrones estándar del sector:

| Programa | Qué le copiamos (lógica, no código) | Licencia |
|---|---|---|
| **Whaticket / ticketz** | El modelo exacto que pidió el cliente: **1 contacto = máx. 1 ticket abierto a la vez**. Se cierra → queda en historial. Si el cliente vuelve a escribir → **ticket nuevo** (cada venta es su propio ticket, el historial por cliente se conserva) | AGPL ⚠️ solo ideas |
| **Chatwoot** | **Reapertura automática**: si llega mensaje de un contacto con ticket cerrado, se abre uno nuevo con badge "cliente recurrente". Estados ortogonales: *estado* (abierto/cerrado) ≠ *etapa* (pipeline) ≠ *quién atiende* (bot/humano) | MIT ✅ |
| **wacrm** | Kanban de ventas ligado a conversaciones: columnas = etapas, card = ticket, arrastrar card = cambiar etapa | MIT ✅ (forkeable si acelera) |
| **Zendesk/Intercom** | Motivo de cierre obligatorio (ganado/perdido/sin respuesta) — sin esto no hay métricas de conversión reales | — patrón |

### Modelo de datos del frontend (espeja `app/src/db/schema.sql`)

```ts
type Etapa = "nuevo" | "medidas" | "cotizado" | "ubicacion" | "por_visitar";
type Cierre = "ganado" | "perdido" | "sin_respuesta";

interface Ticket {
  id: number;
  telefono: string;            // wa_id
  nombre: string | null;
  estado: "abierto" | "cerrado";
  etapa: Etapa;                // solo aplica si abierto
  cierre?: Cierre;             // solo aplica si cerrado
  atiende: "bot" | "humano";   // bot_paused_until del schema
  medida?: string;             // "205/55R16" — lo que busca
  vehiculo?: string;           // "Chevrolet Sail 2019"
  cotizacion?: { total: number; items: number; pdfUrl: string };
  localAsignado?: { nombre: string; distanciaKm: number };
  esRecurrente: boolean;       // tuvo tickets cerrados antes
  creadoEn: string;
  ultimaActividad: string;
}

interface Mensaje {
  id: number;
  ticketId: number;
  rol: "cliente" | "bot" | "vendedor";
  tipo: "texto" | "pdf" | "ubicacion" | "imagen";
  contenido: string;
  hora: string;
}
```

Coincide campo a campo con `conversations` + `messages` + `quotes` de `schema.sql` — la
Parte 2 es literalmente escribir 5 endpoints que devuelvan estas formas.

---

## 3. Pantallas (4 + modo demo)

### 3.1 Inbox de tickets (pantalla principal)
- Lista de tickets ordenada por última actividad, estilo bandeja WhatsApp Business pero premium.
- Cada fila: avatar con inicial, nombre/teléfono, preview del último mensaje, badge de **etapa**
  (color propio por etapa), pill **bot 🤖 / humano 👤**, tiempo relativo ("hace 4 min"),
  punto rojo pulsante si espera respuesta.
- Filtros como segmented control (estilo iOS): **Abiertos · Cerrados · Todos** + filtro por etapa.
- Búsqueda instantánea (nombre, teléfono, medida).
- Contador vivo en el título: "12 abiertos".

### 3.2 Pipeline (Kanban)
- 5 columnas = 5 etapas + zona de cierre. Header de columna: nombre, contador, **$ potencial**
  (suma de cotizaciones en esa etapa).
- Cards arrastrables (dnd-kit) con spring físico al soltar; la card muestra nombre, medida
  buscada y monto cotizado.
- Soltar en "Cerrado" abre un sheet: ¿ganado o perdido? (motivo obligatorio — patrón Zendesk).
- Vista alternativa de embudo: barras horizontales con conversión % etapa→etapa.

### 3.3 Detalle de ticket (la pantalla estrella)
Layout 3 zonas (en móvil: tabs):
- **Centro — chat**: burbujas estilo WhatsApp (verde saliente/blanco entrante sobre fondo
  oscuro elegante), mensajes PDF renderizados como card de documento con miniatura,
  mensajes de ubicación como mini-mapa estático, doble check. Composer para escribir
  como humano (en Parte 1 solo simula).
- **Derecha — ficha del cliente**: medida buscada (chip grande monoespaciado `205/55 R16`),
  vehículo, cotización (total + botón "ver PDF"), local asignado con distancia,
  historial de tickets anteriores si es recurrente.
- **Arriba — stepper del pipeline**: las 5 etapas como línea de progreso animada
  (la etapa actual pulsa). Es el "dónde está esta venta" de un vistazo.
- Acciones: **Tomar conversación** (bot→humano, toggle grande), **Cerrar ganado/perdido**,
  **Reabrir**, nota interna.

### 3.4 Dashboard (KPIs)
- 4 stat tiles: tickets abiertos hoy · cotizaciones enviadas · % cotizado→visita ·
  tiempo medio de respuesta del bot.
- Embudo del mes (funnel chart) + línea de conversaciones por día (últimos 14 días).
- Feed de actividad en vivo ("Carlos M. recibió cotización — hace 2 min").
- Números con animación count-up al entrar.

### 3.5 Modo demo (el vendedor de la Parte 1)
Botón discreto "▶ Demo" que arranca un guion simulado: entran 2–3 clientes nuevos,
escriben (indicador "escribiendo…"), el bot responde con delays realistas, piden medidas,
llega el PDF, avanzan de columna en el Kanban en vivo, suena una notificación sutil y
uno termina en "ganado" con micro-confetti. **Esto es lo que cierra la venta con Joaquín**:
ve su negocio funcionando solo, antes de que exista el backend.

---

## 4. Sistema de diseño — Depot Tire, nivel Apple

Base: el branding que ya definimos en `docs/catalogo-pitstop-sudinco-mejorado.html`,
llevado a modo oscuro premium (técnica glass del simulador 3D de `tools/webhook/simulador-seccion-2-3d/`).

```css
--ink:      #0a1020;   /* fondo base (ya es el theme-color del catálogo) */
--ink-2:    #111a31;   /* paneles */
--red:      #e3262e;   /* Depot red — SOLO acciones primarias y alertas */
--blue:     #173d76;   /* secundario */
--lime:     #d9ff4f;   /* focus/éxito — ya definido en el catálogo */
--glass:    rgba(17, 26, 49, .72) + backdrop-blur(18px) saturate(140%);
```

Reglas que hacen el "nivel Apple":
- **Tipografía**: Inter variable (ya es la del catálogo); números tabulares
  (`font-variant-numeric: tabular-nums`) en todo KPI y precio; medidas de llanta en
  monoespaciada (`JetBrains Mono`) como chip — es EL dato del negocio, se le da jerarquía.
- **Motion**: Framer Motion con springs (nada de `ease-in-out` lineal). Transiciones de
  layout compartido entre inbox→detalle (la fila "se convierte" en el header del chat).
  Solo `transform`/`opacity` — 60fps garantizado. `prefers-reduced-motion` respetado.
- **Profundidad**: sombras de 2 capas + bordes `1px rgba(255,255,255,.06)` (patrón del
  simulador), radios 16–24 px consistentes.
- **Detalle obsesivo**: skeleton screens con shimmer (nunca spinners), estados vacíos
  ilustrados ("Sin tickets abiertos — el bot está atento 🛞"), hover lift de 2px en cards,
  punto verde pulsante "bot en línea" (animación ya escrita en el simulador), favicon con
  contador de abiertos, dark scrollbars estilizados.
- **Responsive real**: el dueño lo va a abrir desde el celular. Mobile-first: inbox y chat
  perfectos en 390px; Kanban con scroll horizontal con snap.

---

## 5. Arquitectura del frontend

```
hub/
├── src/
│   ├── data/
│   │   ├── source.ts          # interface DataSource (el contrato con la Parte 2)
│   │   ├── mock/
│   │   │   ├── fixtures.ts    # ~25 tickets realistas (nombres EC, medidas reales del
│   │   │   │                  #   catálogo SUDINCO, cotizaciones, los 2 locales)
│   │   │   ├── simulator.ts   # motor del modo demo (guiones, timers, typing)
│   │   │   └── mockSource.ts
│   │   └── types.ts           # Ticket, Mensaje, Etapa… (espejo de schema.sql)
│   ├── stores/                # Zustand: tickets, ui, demo
│   ├── screens/               # Inbox / Pipeline / TicketDetail / Dashboard
│   ├── components/            # StageBadge, TicketRow, ChatBubble, StatTile, Stepper…
│   └── design/                # tokens.css, motion presets
└── package.json               # vite build → app/public/admin (Parte 2)
```

- **`DataSource` es el contrato**: `listTickets()`, `getTicket(id)`, `getMensajes(id)`,
  `moverEtapa()`, `cerrar()`, `tomarConversacion()`, `subscribe(cb)` (eventos en vivo).
  El mock lo implementa con fixtures + EventEmitter; la Parte 2 con fetch + SSE al Express.
- **Sin backend, sin auth, sin deploy comercial** en Parte 1. Demo local o preview
  temporal (Vercel preview solo para enseñar, no producción — Hobby prohíbe uso comercial).

### Qué se reusa y de dónde

| Fuente | Qué |
|---|---|
| `docs/catalogo-pitstop-sudinco-mejorado.html` | Paleta Depot, Inter, radios, eyebrows, theme-color |
| `tools/webhook/simulador-seccion-2-3d/` | Técnica glass (blur+saturate), dot pulsante, gradientes de fondo |
| `app/src/db/schema.sql` + `conversations.ts` | Modelo de datos (tipos espejo) y nombres de etapas |
| `app/src/domain/locations.ts` | Los 2 locales + haversine → copiar a fixtures para "local más cercano" |
| `docs/INVESTIGACION_GITHUB.md` | wacrm (kanban MIT, referencia visual), Chatwoot (estados), tremor dashboard (Apache 2.0, componentes KPI) |
| NOVOPAN (`NOVOPAN-live`) | Patrones de animación/presentación que ya gustaron al cliente de Novopan |
| Jardín Express | Patrón de pantalla de revisión/dashboard ya verificado en producción |

---

## 6. Orden de construcción

1. **Cimientos** — Vite + Tailwind + tokens Depot + shell de navegación (sidebar glass, 4 secciones).
2. **Datos** — tipos, `DataSource`, fixtures realistas (esto define TODO lo demás).
3. **Inbox** — la pantalla que más se usa; filtros abierto/cerrado, búsqueda.
4. **Detalle de ticket** — chat + ficha + stepper + acciones de cierre/reapertura.
5. **Pipeline Kanban** — drag & drop + sheet de cierre + $ por columna.
6. **Dashboard** — tiles, embudo, feed.
7. **Modo demo** — simulador con guiones + typing + notificaciones.
8. **Pulido Apple** — pasada exclusiva de motion, vacíos, skeletons, móvil 390px, contraste AA.

## 7. Estimación

| Bloque | Horas |
|---|---|
| Cimientos + design tokens | 2–3 |
| Capa de datos mock + fixtures | 3–4 |
| Inbox | 3–4 |
| Detalle de ticket (chat + ficha + stepper) | 5–6 |
| Pipeline Kanban | 3–4 |
| Dashboard KPIs | 2–3 |
| Modo demo | 2–3 |
| Pasada de pulido + móvil | 2–3 |
| **Total** | **22–30 h** |

## 8. Criterios de aceptación (guion de demo con Joaquín)

1. Abre el Hub en el celular → ve SUS colores, SUS 2 locales, medidas reales de llanta.
2. "▶ Demo" → entra un cliente nuevo, el ticket aparece en Inbox con animación.
3. Abre el ticket → ve el chat avanzando solo: medidas → PDF → ubicación → local más cercano.
4. Va al Pipeline → la card se mueve sola de columna; arrastra una manualmente.
5. El cliente simulado confirma → notificación + ticket a "ganado" con confetti → KPI sube.
6. Cierra un ticket a mano (motivo obligatorio) y lo reabre escribiendo como cliente recurrente.
7. Todo a 60fps, sin un solo dato hardcodeado fuera de fixtures.

## 9. Fuera de alcance (Parte 2+)

WhatsApp real (webhook ya esqueletizado en `app/`), Contífico (bloqueado hasta confirmar
plan/API con el papá de Joaquín), auth, deploy productivo, clasificador de etapa con Haiku,
migración SQL de nombres de etapa. **Nada del diseño cambia al conectar el backend** — ese
es el punto de la capa `DataSource`.
