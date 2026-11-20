# Conector de Fénix

Un programa chico que corre **en el servidor del cliente**, lee la base de datos de Fénix cada
5 minutos y le entrega al bot el **inventario** (stock y precios) y las **facturas** (con teléfono).
Reemplaza al Excel que hoy se sube a mano.

```
Servidor del cliente                         Railway (el bot del cliente)
┌─────────────────────────────┐   HTTPS    ┌──────────────────────────────────┐
│ Fénix ──► su base de datos  │            │ /conector/inventario             │
│              ▲ solo lectura │  ───────►  │ /conector/facturas               │
│   conector (cada 5 min)     │            │   └► la MISMA importación que el │
└─────────────────────────────┘            │      panel usa con el Excel      │
                                           └──────────────────────────────────┘
```

Del lado del bot no hay nada nuevo que aprender: lo que llega pasa por la importación de
`src/services/fuentes/archivo.ts`, con el mismo mapeo de columnas (Ajustes → Catálogo) y la misma
regla de seguridad. Un inventario dudoso (cae un tercio, sale todo en 0) **no reemplaza al bueno**;
queda anotado y lo decide una persona en el panel.

## Qué está hecho y qué falta

| | Estado |
|---|---|
| La puerta del bot (`/conector/*`, clave propia) | Hecho y probado |
| El conector: leer, mandar, reintentar, registrar, avisar errores | Hecho y probado contra una base de mentira |
| Herramientas para encontrar las tablas (`--explorar`, `--buscar`, `--muestra`) | Hecho y probado |
| Diagnóstico de Windows (`Diagnostico.bat`) | Escrito, **sin correr todavía en un Windows** |
| Instalador (`Instalar.bat`, tarea programada) | Escrito, **sin correr todavía en un Windows** |
| Motor de base de datos | Solo **PostgreSQL**. Si Fénix usa otro (SQL Server, MySQL, Firebird) es un archivo más en `src/motores/` |
| Las dos consultas (qué tablas y columnas) | **Faltan**: salen de mirar la base del cliente |

Las pruebas: `npx vitest run test/conectorFenix.test.ts` (necesita el Postgres local).

## Lo que hace falta del cliente

1. **Una sesión remota al servidor donde está instalado Fénix** (AnyDesk o lo que usen), de una
   hora, con alguien de ellos presente. No es la computadora de un vendedor: es la máquina que
   guarda los datos.
2. **Un usuario de solo lectura a la base de Fénix.** Lo ideal es que lo cree su técnico o
   Fenixcorp. Es el punto que puede trabar todo: a veces la clave de la base la tiene solo el
   proveedor.
3. Que esa máquina esté **prendida en horario de atención** y tenga internet. Si se apaga, el
   bot sigue con el último inventario y el panel avisa que está viejo.

No se abre ningún puerto en su red ni se instala nada: es una carpeta con un programa y una tarea
programada. Para quitarlo: `Desinstalar.bat` y borrar la carpeta.

## Paso 0 — Diagnóstico (se puede hacer hoy, sin nosotros)

Mandarle al cliente `windows/Diagnostico.bat` y `windows/diagnostico.ps1` (los dos, en la misma
carpeta). Alguien hace doble clic en `Diagnostico.bat` **en el servidor de Fénix** y nos devuelve
el `diagnostico-fenix.txt` que aparece al lado.

Solo lee: no instala ni cambia nada, y tapa las claves que encuentre. Dice qué Windows es, qué
base de datos hay, dónde está instalado Fénix y cómo se conecta. Con eso se sabe, antes de la
sesión, qué motor falta programar y si hace falta pedirle algo a Fenixcorp.

## Paso 1 — Preparar el bot (una vez por cliente)

En el servicio del cliente en Railway, crear la variable `CONECTOR_KEY` con una clave larga al azar
(`openssl rand -hex 32`). Sin esa variable las rutas `/conector/*` contestan 404 (así está Depot).

Esa clave **solo** sirve para entregar inventario y facturas. No abre el panel: desde el servidor
del cliente no se puede leer un chat ni cambiar un ajuste.

## Paso 2 — Armar la carpeta

```bash
cd app && npm run conector:empaquetar
```

Sale `conector-fenix/dist/AutoVenta-Conector/`. Falta agregarle `node.exe`: el «Windows Binary
(.exe)» de la versión LTS, de nodejs.org. Es un solo archivo, no se instala. Necesita Windows 10 o
Windows Server 2016 en adelante (el diagnóstico dice cuál tienen).

Copiar la carpeta al servidor en una ruta sin espacios, por ejemplo `C:\AutoVenta-Conector`.

## Paso 3 — Encontrar las tablas (en la sesión remota)

Copiar `config.ejemplo.json` como `config.json` y llenar `servidor`, `clave` y `conexion`. Las
consultas pueden quedar como están por ahora. Abrir una consola en la carpeta:

```bat
node.exe conector.cjs --explorar
```

Escribe `exploracion.txt` con todas las tablas y sus columnas. Para no adivinar, se busca un dato
que se ve en la pantalla de Fénix:

```bat
node.exe conector.cjs --buscar "008760"
node.exe conector.cjs --buscar "001-001-000123"
node.exe conector.cjs --muestra public.nombre_de_la_tabla
```

El primero es un código de artículo (dice en qué tabla viven los artículos); el segundo, un número
de factura reciente.

## Paso 4 — Escribir las dos consultas

Van en `config.json`. Cada columna lleva con `as` el nombre que espera el mapeo del bot:

**Inventario** — una fila por artículo:

| Columna | Qué es |
|---|---|
| `código` | Código del artículo |
| `articulo` | Nombre completo (de ahí salen marca, medida y diseño) |
| `categoria` | Para separar aros de llantas |
| `precio a` | Precio al público, con IVA |
| `precio b`, `precio c` | Con tarjeta / en efectivo |
| `precio d` | Mayorista. Nunca se muestra; sirve para detectar un precio mal tipeado |
| `existencia` | Stock total (suma de las bodegas) |

**Facturas** — una fila por línea de factura, filtrando con `{desde}` y sin las anuladas:

| Columna | Qué es |
|---|---|
| `num factura` | 001-001-000123 |
| `fecha` | `2026-11-20` |
| `hora` | `10:15` |
| `total`, `subtotal` | De la factura |
| `cliente`, `telefono` | Sin teléfono la venta no se puede cruzar con el chat |
| `producto`, `cantidad`, `precio` | De la línea |
| `local` | Bodega o punto de venta |

Las consultas solo pueden ser un `SELECT`: el conector rechaza cualquier otra cosa, y además abre
la conexión en modo solo lectura.

## Paso 5 — Probar sin tocar nada

Doble clic en `Probar.bat`. Lee Fénix y le pregunta al bot qué pasaría, **sin guardar**:

```
El bot leería 482 llantas y 0 aros (3120 unidades en stock).
Hoy tiene cargadas 450 llantas (2980 unidades).
  descartadas 17: Llanta de camión aro 17.5 o 22.5: el bot todavía no las cotiza
→ Se cargaría sin preguntar.
```

Comparar contra el Excel que Jenny subió ese día: mismas llantas, mismo stock, mismos precios. Si
no coincide, se corrige la consulta y se vuelve a probar. Hasta que coincida no se instala.

## Paso 6 — Instalar

Clic derecho en `Instalar.bat` → «Ejecutar como administrador». Vuelve a probar, deja `config.json`
legible solo para administradores y crea la tarea «AutoVenta Conector Fenix» cada 5 minutos.

Para traer las facturas viejas, una sola vez:

```bat
node.exe conector.cjs --historial 365
```

## Cómo saber si sigue vivo

- **En el panel:** `GET /api/catalog/archivo` trae `conector` con la última vez que llamó, cómo le
  fue con el inventario y las facturas, y el error que haya tenido de su lado (Fénix apagado, clave
  cambiada). Falta mostrarlo en la pantalla de Inventario; hoy esa pantalla ya avisa cuando el
  inventario está viejo.
- **En el servidor:** `conector.log`, en la carpeta.

## Lo que hay que saber

- **Una actualización de Fénix puede mover una tabla.** El conector deja de leer, el bot sigue con
  el último inventario bueno y el error queda anotado. Hay que corregir la consulta.
- **Una factura anulada después de enviada** se queda en el bot. La consulta deja fuera las
  anuladas, pero no borra las que ya llegaron.
- **Datos de clientes:** las facturas llevan nombre y teléfono. Viajan cifradas (HTTPS) y quedan en
  la base del bot de ese cliente, igual que las que hoy se suben por Excel.
- **Otro motor de base de datos:** copiar `src/motores/postgres.mjs`, cambiar el controlador y
  sumarlo en `src/motores/index.mjs`. Lo demás no cambia.
