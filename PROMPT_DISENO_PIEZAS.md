# Prompt para rediseñar las piezas visuales de Depot Tire

Copiar de la línea siguiente hacia abajo y pegarlo en una conversación nueva de Claude.

---

Necesito que rediseñes las piezas comerciales que un bot de WhatsApp envía a clientes
de una llantera en Quito, Ecuador. Hoy funcionan pero se ven correctas, no deslumbrantes.
Quiero piezas que un vendedor sienta orgullo de mandar y que un cliente guarde.

## El negocio

**Depot Tire**, llantera en Quito con más de 30 años. Dos sucursales: Cumbayá y Quito
Sur. Vende llantas de tres marcas, cada una con un lugar comercial distinto:

- **Falken** — premium: desempeño, respaldo y durabilidad. Es equipo original de Ford
  Raptor, Bronco Raptor y Jeep Gladiator.
- **Kenda** — el equilibrio: buena calidad, buen desempeño, buen precio.
- **Winrun** — accesible, para quien prioriza presupuesto sin bajar de los mínimos técnicos.

Cliente típico: dueño de auto o camioneta que pregunta por WhatsApp, compara dos o tres
opciones y decide en horas o días. Compra 4 llantas. El ticket va de $250 a $1.200.

## Dónde se ve la pieza — esto define todo

Es un **PNG que llega a WhatsApp**. El cliente lo ve primero dentro de una burbuja de
chat, en un teléfono: **unos 350 px de ancho**. Recién si le interesa la toca para
ampliar.

Eso significa que la pieza tiene **dos lecturas** y ambas tienen que funcionar:

1. **A 350 px, de un vistazo:** marca, modelo, precio de hoy y que hay una oferta. Si a
   ese tamaño no se entiende qué es y cuánto cuesta, la pieza fracasó.
2. **Ampliada:** la ficha completa, garantías, beneficios, condiciones.

La jerarquía tipográfica tiene que ser brutal: lo importante enorme, lo secundario
chico de verdad. Un diseño parejo se vuelve ilegible en la burbuja.

## Qué tiene que lograr comercialmente

No es una ficha técnica, es una herramienta de venta. Debe:

- **Anclar el precio.** Precio de lista tachado, precio de hoy grande, y el ahorro
  expresado en dólares y en porcentaje. Que se vea que está ganando algo.
- **Hacer sentir los beneficios como valor real**, no como letra chica. Hoy se mandan
  como un texto aparte y el cliente los pasa por alto. Deben verse como algo que viene
  incluido y que en otro lado se cobra.
- **Dar confianza.** Garantías, años de respaldo, disponibilidad real, 30 años de
  trayectoria.
- **Empujar al siguiente paso**: visitar una sucursal.
- **Hacer la comparación fácil de decidir**, no solo fácil de leer. Que se note cuál
  conviene y por qué, sin desacreditar a las otras.

## Las tres piezas

**1. Cotización** — un solo modelo y una cantidad ya elegida. Es la pieza de cierre.
**2. Comparativa** — 2 o 3 modelos lado a lado, para cuando el cliente duda.
**3. Opciones** — todo lo disponible en una medida, agrupado por marca (hasta 9
productos en 3 marcas). Es la más difícil: hoy queda como una tira de 2880×7538 px,
altísima, que en el chat se ve como un hilo delgado e ilegible. Necesita una solución
de layout mejor, no solo mejor estilo.

## Datos reales disponibles

Todo sale de un catálogo real. **No inventes campos**: si no está en esta lista, no
existe.

**Por producto:**
- Marca (`Falken` / `Kenda` / `Winrun`) — hay logo vectorial de cada una
- Diseño/modelo (`ZE310R`, `KR203`, `WILDPEAK A/T 4W`, `R380`)
- Medida (`205/55R16`, `265/70R17`)
- Índice de carga y velocidad (`91V`) y su traducción (`615 kg máx · 240 km/h máx`)
- Precio de hoy con IVA (`$111.32`)
- Precio de lista con IVA, tachado — a veces no existe (`$148.43`)
- Disponibilidad: `Disponible` / `Consultar` / `Sin stock`
- Garantía contra golpes en meses: 18 Falken, 12 Kenda, 6 el resto
- Garantía de fábrica: 5 años, todas
- Foto real del producto — **ojo: no todos los productos tienen. Necesito que el diseño
  se vea bien igual cuando cae a una silueta genérica.** Hoy se ve pobre.

**Solo en la cotización:**
- Número de cotización (`COT-000123`) — el cliente debe presentarlo en tienda para
  validar el descuento, así que tiene que ser fácil de encontrar
- Fecha, cantidad, subtotal, IVA (15 %), total
- Descuento adicional en dólares con su condición, cuando existe
- Vigencia de la oferta, cuando existe

**Beneficios incluidos** (los mismos que el vendedor humano manda como texto y que
quiero integrar a la pieza):
- Todos los servicios de instalación
- Seguro gratuito contra golpes, cortes o cualquier daño que sufra la llanta
- Mantenimiento gratuito cada 10.000 km
- Revisión gratuita del vehículo
- Camiseta de la selección de Ecuador 🇪🇨 (solo en algunas campañas)

**Formas de pago:** efectivo, tarjeta, transferencia, y diferido a 3 y 6 meses sin
intereses.

**Pie:** los precios incluyen IVA y Ecovalor · son por unidad · las dos sucursales.

## Restricciones técnicas — son duras, no sugerencias

Las piezas se renderizan con **satori** (JSX → SVG) y **resvg** (SVG → PNG) en un
servidor sin navegador. Satori soporta un subconjunto chico de CSS:

- ✅ **Solo flexbox.** `display: flex` o `none`. Nada de grid, float, ni tablas.
- ✅ `border-radius`, `box-shadow`, `linear-gradient`, `opacity`, `border`, `padding`,
  `margin`, `gap`, `position: absolute/relative`, `transform` básico
- ✅ Imágenes solo como data URI embebido
- ❌ **Sin** `filter`, `backdrop-filter`, `blur`, `mix-blend-mode`, `clip-path`,
  `mask`, pseudo-elementos (`::before`/`::after`), animaciones, `overflow: scroll`
- ❌ Sin recursos externos: ni fuentes de Google, ni imágenes por URL, ni iconos de
  librería. **Los iconos tienen que ser SVG inline o caracteres de la fuente.**
- ⚠️ Cada nodo de texto debe ser hoja: un `div` con texto no puede tener hijos.
- ⚠️ Tipografía disponible: **Archivo** (400/500/700) y **Archivo Black** (900). Si tu
  diseño necesita otra, dímelo explícitamente y justifícalo — se puede agregar, pero
  cada fuente pesa en el servidor.

**Lienzo:** 1440 px de ancho lógico, rasterizado a 2×. El alto es libre pero **evita
proporciones más altas que 1:2** — más que eso se vuelve ilegible en el chat.

## Paleta actual (puedes evolucionarla, dime qué cambias y por qué)

```
Crema   #f6f1e4     Panel   #fffdf6     Navy    #14213d
Rojo    #d62828     Dorado  #fcbf49     Verde   #2a9d8f
Texto tenue #5c6273     Borde   #d9d2bf
Acentos por marca: Falken #1f4e8c · Kenda #d62828 · Winrun #2a9d8f
```

Se llama "Racing Heritage": crema, navy, rojo y dorado. Es una llantera, así que el
mundo visual del automovilismo funciona — pero quiero que se sienta **premium y
confiable**, no un volante de descuentos. Referencia de tono: la ficha de producto de
una marca automotriz seria, no una promoción de supermercado.

## Qué NO quiero

- Urgencia falsa. Solo se puede mostrar vigencia si la oferta tiene fecha real.
- Densidad de tabla. Prefiero menos datos bien jerarquizados que todos apretados.
- Que el descuento se vea barato o agresivo. Debe verse **limpio**: el ahorro es un
  hecho, no un grito.
- Desacreditar marcas en la comparativa. Cada una tiene su lugar.
- Texto que a 350 px sea una mancha gris.

---

## Lo que te pido, en dos pasos

### Paso 1 — ahora

Dame **4 o 5 propuestas de la pieza de COTIZACIÓN**, en un solo artifact HTML, una
debajo de otra, cada una rotulada y con un párrafo corto explicando la idea.

Que sean **de verdad distintas entre sí** — distinta estructura, distinta jerarquía,
distinto uso del color y del espacio. No cinco variaciones del mismo layout. Quiero
poder elegir una dirección, no un matiz.

Para cada una muéstrame además **cómo se ve a 350 px de ancho**, al lado o debajo de
la versión grande. Es la prueba real: si a ese tamaño no vende, no sirve.

Usa estos datos de ejemplo:

```
Cotización COT-000847 · 04/08/2026
4 × Falken WILDPEAK A/T 4W · 265/70R17 · 116T (1250 kg máx · 190 km/h máx)
Precio lista $395.39 → precio hoy $296.55 c/u
Disponible · 18 meses contra golpes · 5 años de fábrica
Subtotal $1031.48 · IVA 15% $154.72 · Total $1186.20
Descuento adicional $60.00 si la compra se cierra esta semana
Oferta válida hasta el 11/08/2026
```

Y una segunda, sin foto de producto y sin descuento, para ver el caso pobre:

```
Cotización COT-000848 · 04/08/2026
2 × Winrun MAXCLAW HT · 205/55R16 · 91V (615 kg máx · 240 km/h máx)
Precio hoy $63.17 c/u · sin precio de lista
Consultar disponibilidad · 6 meses contra golpes · 5 años de fábrica
Subtotal $109.86 · IVA 15% $16.48 · Total $126.34
```

Para los logos de marca usa una reconstrucción tipográfica razonable en SVG inline
(no tengo los archivos en esta conversación; en producción sí existen los vectoriales
reales y se sustituyen después).

### Paso 2 — después de que elija

Cuando te diga cuál dirección me gusta y qué quiero ajustar, generas en ese mismo
estilo:

1. La **comparativa** de 2 y de 3 modelos
2. Las **opciones** con 9 productos en 3 marcas, resolviendo el problema del alto
3. El **bloque de beneficios incluidos**, integrado a la pieza y no como texto suelto

Y por último me entregas el **código JSX compatible con satori** de los tres, usando
solo lo que la lista de restricciones permite.

---

Empieza por el Paso 1. Si algo de los datos o las restricciones te limita para lograr
lo que te pido, dímelo antes de diseñar en vez de inventar una solución que no se pueda
implementar.
