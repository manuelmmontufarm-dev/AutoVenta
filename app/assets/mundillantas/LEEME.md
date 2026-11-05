# Archivos de marca de Mundillantas / Competimotor

Esta carpeta es la de `NEGOCIO=mundillantas`. Las piezas buscan acá los logos.
Si un archivo falta, la pieza dibuja el nombre de la marca en texto. No se rompe,
pero se ve menos profesional.

## Faltan (pedírselos a Jenny, fila 18 de `docs/clientes/mundillantas-arranque.md`)

| Archivo | Qué es | Dónde se usa |
|---|---|---|
| `logo-mundillantas.png` | Logo de Mundillantas para fondo oscuro, PNG con fondo transparente | Encabezado de las piezas y del PDF de los 2 locales de Mundillantas |
| `logo-competimotor.png` | Logo de Competimotor para fondo oscuro, PNG con fondo transparente | Encabezado de las piezas y del PDF del local de Competimotor |
| `logo-blanco.png` | Respaldo si falta el logo de una marca (puede ser una copia de `logo-mundillantas.png`) | Encabezado cuando no se conoce la marca |
| `logo.png` | Versión para fondo claro | Plantilla día y noche en modo día |

Cada logo puede tener su propia proporción. El ancho y el alto se leen del
archivo, así que no hace falta recortarlo a 422×132 como el de Depot. Solo hay
que recortarlo al contenido, sin márgenes vacíos.

## Otros archivos que esta carpeta va a tener (los carga el Sprint 4)

`escalera-precio.json`, `conocimiento-marcas.json` y `base_llantas_tipos.json`.
Mientras falten, se usan los de `app/assets/` comunes.
