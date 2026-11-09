# Archivos de marca de Mundillantas / Competimotor

Esta carpeta es la de `NEGOCIO=mundillantas`. Las piezas y los PDF buscan acá los logos.

## Lo que hay (6-nov-2026)

Manuel pidió que **se lean las dos marcas en todo**, Competimotor primero. Por eso
hay un solo logo combinado y NO hay `logo-mundillantas.png` ni
`logo-competimotor.png`: sin ellos, las dos identidades caen a `logo-blanco.png`
(ver `depotLogo` en `src/render/assets.ts`) y cada pieza y cada PDF lleva las dos.

| Archivo | Qué es | Dónde se usa |
|---|---|---|
| `logo-blanco.png` | Competimotor (blanco, horizontal) │ Mundillantas (amarillo), fondo transparente, 2630×300 | Encabezado oscuro de las piezas y de los PDF |
| `logo.png` | Lo mismo para fondo claro: Competimotor rojo │ Mundillantas azul | Plantilla día y noche en modo día |

Si algún día cada local tiene que salir solo con su marca, basta con agregar
`logo-competimotor.png` y `logo-mundillantas.png` acá; no hay que tocar código.

## De dónde salen (`fuentes/`)

- `competimotor-rojo.png`, `competimotor-blanco.png`: los que mandó Jenny el 6-nov
  (1080×1080, transparentes). La versión horizontal separa el ícono de puntos y
  la palabra y los pone lado a lado.
- `mundillantas-captura.png`: **captura de 270×130** del logo «MUNDI LLANTAS ONLINE»
  sobre círculo azul. El texto amarillo se recortó de ahí. Se ve bien al tamaño del
  encabezado, pero es de baja resolución: **pedirle a Jenny el archivo original de
  Mundillantas** (PNG o PDF/AI) y rehacer los dos logos.

Colores: Competimotor rojo `#E42629`; Mundillantas amarillo `#F5D000` sobre azul `#3D508E`.

## Otros archivos

`escalera-precio.json`, `conocimiento-marcas.json` y `base_llantas_tipos.json`.
