# Prompt de construcción — rediseño del Hub

Pegar en una sesión **nueva** de Claude Code con Fable 5, con el repo abierto.
Antes de pegarlo hay que hacer dos cosas:

1. Abrir `docs/rediseno/DESIGN.md` y dejar **una sola** dirección en la sección 4,
   borrando las otras dos.
2. `cd hub && npm install && npm i -D puppeteer` (puppeteer habilita el detector
   sobre el render; sin él sólo corre el escaneo estático).

---

## El prompt

```
Vas a rediseñar el front del Hub de Depot Tire, en `hub/`. Es un CRM de venta de
llantas por WhatsApp: React 19, Vite, Tailwind 4, zustand, framer-motion,
@dnd-kit. Unas 11.700 líneas en 9 pantallas.

Antes de escribir una línea, leé los dos archivos que gobiernan este trabajo:

- `docs/rediseno/DESIGN.md` — las reglas. Es la autoridad. La dirección visual
  ya está elegida ahí; no la discutas ni la promedies con tu gusto.
- `docs/rediseno/INVENTARIO-FUNCIONAL.md` — el contrato de lo que no se puede
  perder. Cada línea de ahí tiene que seguir funcionando al terminar.

Esto es un REDISEÑO con RECORTE. DESIGN.md Parte II §17 dice qué se va, qué se
mueve y qué queda; el inventario lo marca línea por línea. Fuera de lo marcado,
la verdad del producto —datos, funciones, rutas, permisos, copy— se conserva
entera. Recortar más de lo marcado es tan grave como recortar menos. El look actual NO es la base:
es la evidencia de lo que hay que reemplazar. DESIGN.md §1 explica por qué el
Hub de hoy parece hecho por una IA, con la cuenta exacta de cada tell. Esos tells
son tu anti-referencia: si tu resultado los reproduce, fallaste, aunque se vea
bonito.

El objetivo que se mide: que alguien que mira esto no pueda decir que lo hizo un
modelo. No "moderno". No "limpio". Que no se note.

## Cómo quiero que trabajes

No hagas las nueve pantallas de un tirón. Trabajás en tandas y parás al final de
cada una para que yo mire:

**Tanda 0 — los cimientos.**
- Reescribí `hub/src/design/tokens.css` entero con la dirección elegida. Borrá
  los cuatro temas de `hub/src/design/themes/` (racing, showroom, showroom-gp,
  neobrutalista): el rediseño deja un solo mundo.
- Cambiá las fuentes de `<link>` de Google Fonts a `@fontsource` auto-hospedado
  en `hub/index.html` y `main.tsx`.
- Tematizá las superficies que no dibujaste (DESIGN.md §10): `::selection`,
  `caret-color`, scrollbars, `:focus-visible`, `tabular-nums`. Esto va primero,
  no al final: es el detalle que nunca se hace si se deja para después.
- Rehacé `hub/src/components/ui.tsx` (Avatar, StageBadge, CierreIcon,
  CierreBadge, AtiendePill, MedidaChip, Segmented, EmptyState, SkeletonRows,
  Modal) con los siete estados de DESIGN.md §9. Misma firma de props: las
  pantallas no se tocan todavía.
- `MedidaChip` es el detalle firma (DESIGN.md §5). Dedicale el tiempo.
- Sacá `IconSparkle` de `icons.tsx` y dale a Oportunidades un icono dibujado que
  signifique lo que la pantalla hace.
- PARÁ. Mostrame capturas de Inbox y Pipeline con los tokens nuevos, a 1440 y a
  390 de ancho. Todavía van a verse a medio hacer; es lo que quiero ver.

**Tanda 1 — el armazón y las dos pantallas núcleo.**
`App.tsx` (navegación, chips de estado, sonido, tour), `Inbox.tsx`,
`TicketDetail.tsx` + `chat.tsx`. Parás y mostrás.

**Tanda 2 — Pipeline, y borrar Oportunidades.**
Pipeline cambia de forma (DESIGN.md §17): la barra de etapas como cabecera, 3–4
tarjetas visibles debajo de cada etapa sin hacer clic, desplazamiento dentro de
la caja, arrastre conservado. Después borrás `Opportunities.tsx`,
`swipe-review.tsx`, su ruta, su entrada de navegación y sus pruebas. Parás y mostrás.

**Tanda 3 — Cotizador y Métricas.**
Cotizador funciona perfecto: no tocás la función, sólo la piel. Repasá su
sección del inventario dos veces. Las piezas que genera (PDF e imagen que salen
al cliente por WhatsApp) se rediseñan con la identidad nueva. En Métricas los
datos se conservan todos, pero cada gráfico lleva eje X y eje Y con valores, y
el valor exacto al pasar el cursor; «Conversaciones por día» y «¿A qué hora
contestan más?» primero. Cada sección lleva al menos un gráfico así. Fuera
`Sparkline`, `DonutChart` y `useCountUp`. Parás y mostrás.

**Tanda 4 — Ajustes y Configuración técnica.**
Ajustes recibe Negocio, Horarios de seguimiento y los tiempos de seguimiento
desde Settings; Settings queda con WhatsApp, encendido y Manual base, y pierde
«IA por etapa» y todo lo demás. Cada guardado conserva su mensaje de error
propio. El tour queda sólo para la primera conexión. Parás y mostrás.

**Tanda 5 — el barrido final.**
Corré las cuatro comprobaciones de DESIGN.md §13 y arreglá lo que salga. Después
una sola ronda de inspección visual: escritorio y móvil juntos, arreglás todo lo
que muestre en un lote, confirmás con una ronda más y parás. No entres en un
bucle de pulido.

## Cómo verificás

El servidor ya está configurado: `preview_start` con el nombre `hub-dev` levanta
Vite en el 5199. Verificás vos, con capturas y con el detector; no me pidas a mí
que abra el navegador a ver si quedó bien.

Después de cada tanda, corré:

    node ~/.claude/skills/impeccable/scripts/detect.mjs hub/src
    node ~/.claude/skills/impeccable/scripts/detect.mjs "http://localhost:5199/#/inbox"
    node ~/.claude/skills/impeccable/scripts/detect.mjs "http://localhost:5199/#/inbox" --viewport 390x844
    cd hub && npm run typecheck

El detector lee `docs/rediseno/DESIGN.md`: cualquier color, fuente, tamaño o
radio fuera del sistema lo marca solo. Cero hallazgos no es una meta opcional.

## Dónde vas a estar tentado de fallar

Te lo digo de antemano porque son las salidas fáciles de tu entrenamiento:

- Vas a querer poner un gradiente. No.
- Vas a querer `rounded-2xl` y una sombra suave en todo. El radio está decidido
  por familia de componente en DESIGN.md.
- Vas a querer Inter. Está prohibida, con nombre y apellido, junto con Space
  Grotesk, Space Mono, Geist, Instrument Serif, Fraunces y Source Serif.
- Vas a querer una chispita para lo que tenga que ver con el bot o la IA. No.
- Vas a querer meter todo en tarjetas, y tarjetas dentro de tarjetas. Agrupá con
  aire y tipografía.
- Vas a querer un chip-píldora arriba de los títulos. Prohibido sin excepción.
- Vas a querer animar la entrada de cada sección igual. Un solo momento con
  intención por pantalla.
- Vas a querer mejorar el copy. No lo toques: está en la voz del negocio y es de
  lo mejor que tiene el producto. Si algo te parece mal escrito, preguntame.

## Qué me preguntás antes de decidir solo

1. El selector de temas de Ajustes: si el rediseño deja un solo mundo, ¿el
   selector se va, o se queda con claro/oscuro del mismo mundo?
2. El confeti al ganar una venta: ¿se queda o se va?
3. Si alguna función del inventario choca de verdad con una regla de diseño:
   gana la función, pero avisame antes de resolverlo por tu cuenta.

Empezá por leer los dos archivos y decime qué entendiste que hay que hacer,
antes de tocar código.
```

---

## Por qué el prompt está armado así

- **Las reglas viven en archivos del repo, no en el prompt.** Un prompt largo se
  diluye en cuanto la conversación avanza; un archivo se puede releer en la
  tanda 4. Además el detector lee `DESIGN.md` y lo convierte en compuerta
  automática. El prompt es corto a propósito.
- **Tandas con parada obligatoria.** 11.700 líneas de un tirón se van en deriva:
  la pantalla nueve no se parece a la uno. Parar después de los cimientos es lo
  que hace que todas se parezcan.
- **El anti-referente es explícito y contado.** Decir "no parezcas IA" no sirve.
  Decir "hay 147 `rounded-2xl`, 20 gradientes y 10 chispitas, y ése es el
  problema" sí.
- **La lista de tentaciones.** Nombrar de antemano cada default que el modelo va
  a querer usar es la técnica que más rinde: le quita la salida fácil antes de
  que la tome.
- **Le pedimos que repita lo que entendió** antes de escribir. Barato, y ahí se
  ve si la dirección quedó clara.
