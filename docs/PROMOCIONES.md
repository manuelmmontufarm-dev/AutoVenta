# Promociones que el negocio arma solo

Desde el 24-nov-2026 el negocio maneja sus promociones en el panel, pestaña **Promociones**
(escritorio; la ve quien tiene el permiso «Ajustes»). Ya no hace falta un deploy para crear,
cambiar, prender o apagar una promoción.

## Cómo la usa el negocio

1. **Nueva promoción** → elige el tipo.
2. Nombre (sale en la cotización), texto extra opcional y fechas opcionales (día de inicio y último día).
3. **Baja el Excel**: trae todas sus llantas con stock y precio de hoy (con IVA). Llena solo las columnas amarillas.
4. **Sube el Excel lleno** y ve cómo queda cada llanta (precio de hoy tachado, precio de promo, %),
   cuáles no entran y por qué. Nada cambia hasta que guarda.
5. **Guardar y prender** (o guardar apagada). Después: interruptor, «Nombre y fechas»,
   «Cambiar llantas o precios» (baja el Excel con lo guardado) y «Quitar» (se archiva).

## Tipos

| Tipo | Qué llena | Cuenta |
|---|---|---|
| Precio de promoción | Precio nuevo por llanta | el de hoy queda tachado |
| Porcentaje de descuento | % por llanta | precio de hoy × (1 − %) |
| Dólares de descuento | $ menos por llanta | precio de hoy − $ |
| Precio por llanta 1, 2, 3 y 4 | precio de cada posición (vacío = normal, 0 = gratis) | suma de las posiciones; con 5+ se repite |
| Lleva N, paga M | X en las que aplican | 4x3, 3x2, 2x1… |
| La N.ª llanta con descuento | X en las que aplican | cada 2.ª/3.ª/4.ª con % menos (100 = gratis) |
| Precio por par o por juego | precio del par y/o del juego de 4 | paquetes primero, el resto a precio normal |
| Descuento por cantidad | X en las que aplican | escalones: desde N llantas, % en todas |
| Regalo o beneficio | X en las que aplican | no cambia el precio; sale como beneficio |

## Cómo llega al cliente (y por qué los PDF cuadran)

Toda promoción termina en **un precio por llanta**, montado sobre el mecanismo del precio tachado
que ya usaba el Black Friday de Competimotor (`domain/preciosEspeciales.ts`): `minimumPriceWithTax`
es el de la promo y `customerPriceWithTax` el de siempre. La pieza, el PDF, el texto, las cuotas,
el Guardián y la cotización firmada leen esa misma cifra; nadie la recalcula.

- **Parejas** (precio, %, $): se aplican al catálogo en cada sincronización.
- **Por cantidad** (por llanta, NxM, N.ª, juego, escalonada): el catálogo queda a precio normal y la
  llanta lleva `promocionPorCantidad`; al cotizar, `productoParaCantidad(llanta, cantidad)` devuelve la
  llanta con el precio por llanta = total de la promo ÷ cantidad (hacia abajo al centavo: el cliente
  nunca paga más que la cuenta). Con una cantidad que no rebaja (2 llantas en un 4x3) sale a precio normal.
- **Regalo**: va con los beneficios de la pieza y como línea 🎁 en el texto.

Candados: la llanta tiene que estar en el inventario de hoy, con la misma medida que tenía al subir
el Excel; el precio de la promo tiene que ser **menor** que el de hoy; fuera de fechas o apagada, no
existe. Dos promos sobre la misma llanta no se suman: gana la más barata. Un descuento de más de
50 % se avisa («revise que no sea un tipeo») pero no se bloquea.

## El «Descuento de siempre» de Depot (24-nov-2026)

Depot da −25 % en todas sus llantas, siempre. Antes venía escondido en el «precio mínimo» del
Interbot; ahora es una promoción más en la pestaña, sembrada una vez desde la política
(`politica.descuentoDeSiempre`, origen `politica:descuento-de-siempre`):

- Es un **porcentaje para todas las llantas** (`parametros: { todas: true, porcentaje: 25 }`), sin Excel.
  En el panel tiene interruptor, «Nombre y fechas» y «Quitar»; no tiene «Ver llantas» ni Excel.
- **No es un rótulo de promoción**: baja el *precio de hoy* de cada llanta (lista − 25 %) y la
  cotización se ve como siempre (lista tachada, «−25 %»). Lo aplica `services/precioDeVenta.ts`
  al poner precios, no `aplicarPromociones`.
- **Las demás se suman encima**: las promociones del panel se cuentan sobre ese precio de hoy
  (10 % del panel → 189,50 × 0,9 = 170,55). El Black Friday de temporada (2.ª llanta) se cuenta
  sobre la lista y reemplaza al −25 % solo si deja las llantas más baratas; si una promo del panel
  sale todavía más barata, gana la del panel. Probado en el simulador con las tres prendidas.
- **Apagada** (o vencida o quitada): se cotiza a la lista de Contífico, sin tachado. Sin sembrar,
  o si la base no contesta, manda el 25 % de la política.

La lista de Depot sale de Contífico, de la empresa que factura (`CONTIFICO_FACTURAS_API_KEY`,
leída entera cada hora); el Interbot queda de respaldo para lo que falte o no tenga sentido contra
el costo (fuera de 1,2–3,5 veces). Ver el encabezado de `services/precioDeVenta.ts`.

## El Black Friday de Depot en la pestaña (24-nov-2026)

La 2.ª llanta al 60 % (Falken y Kenda, sobre la lista) vivía solo en el código
(`politica.promocionDeTemporada`) y se prendía en Ajustes → «Modo promoción». Ahora también es una
fila de la pestaña, sembrada una vez (origen `politica:temporada`, tipo `enesima` con
`{ temporada: true, posicion: 2, porcentaje: 60, marcas: [...] }`, sin Excel):

- **Interruptor**: apagada o quitada, no hay Black Friday en ningún lado (cotización, pieza, PDF,
  saludo, guardián). Prendida, corre en sus fechas.
- **Nombre y fechas**: la fecha de fin del panel es la que dice el bot («válido hasta el 7 de
  diciembre»). El texto extra es el lema del saludo; vacío, va el de la política.
- Las cuentas siguen en `domain/promocionDeTemporada.ts`; el panel solo pone encima interruptor,
  fechas, % y lema (`fijarTemporadaDelPanel`, en cada sincronización del catálogo).
  `aplicarPromociones` no la toca. Sin sembrar o sin base, rige la política tal cual.
- «Quién ve Black Friday» (apagada / solo números de prueba / todos; antes «Modo promoción» en
  Ajustes) está plegado debajo de las promociones: las dos llaves tienen que estar abiertas. Se abre
  solo y avisa cuando no está en «todos».
- Prenderla a mitad de una conversación no rehace la cotización que el cliente ya tiene: la
  siguiente cotización nueva sí sale con la promo.

## Dónde vive

- `app/src/domain/promociones.ts` — tipos, cuentas y candados (puro).
- `app/src/services/promociones.ts` — tabla `promociones`, Excel de ida y vuelta, vista previa.
- `app/src/services/catalog.ts` — las aplica en cada sincronización y programa el cambio de vigencia.
- `app/src/server/admin.ts` — rutas `/api/promociones*`.
- `hub/src/screens/Promociones.tsx` — la pantalla.
- Pruebas: `app/test/promociones.test.ts`.

La lista que venía en el código (`politica.preciosEspeciales`, Black Friday de Competimotor) se
siembra **una vez** en la tabla al arrancar (`origen = politica:<nombre>`); desde ahí la maneja el
negocio. Si la base no contesta y nunca se cargó, el catálogo cae a la lista del código.

## Lo que no hace (todavía)

- La lámina de comparación no conoce la cantidad: muestra el precio normal en promos por cantidad.
- La pestaña no está en el teléfono.

## La pantalla: precio, lo que incluye y diseño (24-nov-2026)

Promociones absorbió Ajustes → Piezas. Tres pasos y, a la derecha, la cotización como le llega al
cliente (`hub/src/components/piezas.tsx`):

- **Promociones**: lo de arriba. Se guarda al tocar.
- **Lo que incluye**: los beneficios («INCLUYE»), cada uno con su interruptor y, si hace falta,
  condiciones (solo una marca, desde N llantas, hasta una fecha). Se guarda al tocar.
- **Diseño**: el tema (cinta de temporada), cómo se dice el descuento (25 % o 3x4) y, plegado,
  plantilla, colores y letra. Esto se prueba en la vista previa y sale a los clientes con
  **Aplicar**; «Deshacer» vuelve a lo que está saliendo.

La vista previa se pide al ancho del recuadro (`/api/pieces/preview.png?ancho=860`): mismo dibujo,
menos píxeles, ~0,3 s. La pieza que recibe el cliente sale a su tamaño de siempre.
