# Archivos de marca de Mundillantas / Competimotor

Esta carpeta es la de `NEGOCIO=mundillantas`. Las piezas y los PDF buscan acá los logos.

## Lo que hay (18-nov-2026)

Desde el cierre del 18-nov **cada servicio es una sola marca** (`IDENTIDAD`, ver
`perfilDelServicio` en `src/negocio/identidad.ts`). El servicio de Competimotor
encabeza todo con su logo y nunca con el combinado.

| Archivo | Qué es | Dónde se usa |
|---|---|---|
| `logo-competimotor-blanco.png` | Competimotor solo, blanco, horizontal, 1487×300 (recortado de `logo-blanco.png`) | Encabezado oscuro de las piezas y de los PDF del servicio de Competimotor |
| `logo-competimotor.png` | Competimotor solo, rojo, 1531×300 (recortado de `logo.png`) | Plantilla día y noche en modo día |
| `logo-blanco.png` | Competimotor (blanco) │ Mundillantas (amarillo), 2630×300 | Ya no lo usa ningún servicio: quedó como respaldo |
| `logo.png` | Lo mismo para fondo claro | Ídem |

`depotLogo` busca `logo-<identidad>-blanco.png` (fondo oscuro), después
`logo-<identidad>.png`, y recién después los combinados. **Falta el logo de
Mundillantas solo** (`logo-mundillantas-blanco.png` y `logo-mundillantas.png`):
hasta tenerlo, un servicio de Mundillantas caería al combinado. Pedirle a Jenny el
archivo original antes de levantar ese servicio.

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
