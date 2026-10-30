"""Logo de AutoVenta en trazos: el bloque rojo «AV» y la palabra «AUTOVENTA».

Un favicon no carga fuentes, así que las letras salen de Barlow Condensed
itálica 800 (la copia de @fontsource que ya usa el panel) convertidas a
trazos. Escribe:

  hub/public/autoventa-icono.svg        el bloque solo (favicon e íconos)
  hub/public/autoventa-logo-claro.svg   bloque + AUTOVENTA, tinta oscura
  hub/public/autoventa-logo-oscuro.svg  bloque + AUTOVENTA, tinta clara
  hub/src/lib/marca-trazos.ts           los trazos de «AV» para el favicon dinámico

Uso (desde hub/, con node_modules instalado):  python3 scripts/logo-autoventa.py
Los PNG (192, 512 y el apple-touch-icon de 180) se sacan de
autoventa-icono.svg con ImageMagick: los comandos están al final.
"""

from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HUB = Path(__file__).resolve().parent.parent
FUENTE = HUB / "node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-italic.woff"

ROJO = "#C8102E"
CREMA = "#F5F3EC"
TINTA = "#111917"

font = TTFont(FUENTE)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font["head"].unitsPerEm
cap = font["OS/2"].sCapHeight


def r(n: float) -> str:
    return f"{n:.2f}".rstrip("0").rstrip(".")


def trazos(texto: str, size: float, x: float, baseline: float) -> str:
    """Path SVG del texto con la línea base en `baseline` y el origen en `x`."""
    s = size / upm
    pen = SVGPathPen(glyphs, ntos=r)
    cursor = 0.0
    for ch in texto:
        nombre = cmap[ord(ch)]
        glyphs[nombre].draw(TransformPen(pen, (s, 0, 0, -s, x + cursor * s, baseline)))
        cursor += font["hmtx"][nombre][0]
    return pen.getCommands()


def caja(texto: str) -> tuple[float, float, float, float]:
    """Caja de tinta del texto en unidades de la fuente (xMin, yMin, xMax, yMax)."""
    bp = BoundsPen(glyphs)
    cursor = 0.0
    for ch in texto:
        nombre = cmap[ord(ch)]
        glyphs[nombre].draw(TransformPen(bp, (1, 0, 0, 1, cursor, 0)))
        cursor += font["hmtx"][nombre][0]
    return bp.bounds


def av_centrado(lado: float) -> str:
    """«AV» centrado por su tinta en un bloque de `lado`, a 28/46 del lado."""
    size = lado * 28 / 46
    s = size / upm
    x0, _, x1, _ = caja("AV")
    x = lado / 2 - (x0 + x1) / 2 * s
    baseline = lado / 2 + cap * s / 2
    return trazos("AV", size, x, baseline)


# ── Ícono 64×64 ──
LADO = 64
icono = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {LADO} {LADO}">'
    f'<rect width="{LADO}" height="{LADO}" rx="{r(LADO * 0.13)}" fill="{ROJO}"/>'
    f'<path fill="{CREMA}" d="{av_centrado(LADO)}"/></svg>\n'
)
(HUB / "public/autoventa-icono.svg").write_text(icono)

# ── Logo completo: bloque 46, separación 12, AUTOVENTA a 36 ──
B, GAP, T = 46, 12, 36
s = T / upm
x0, _, x1, _ = caja("AUTOVENTA")
xt = B + GAP - x0 * s
ancho = B + GAP + (x1 - x0) * s
palabra = trazos("AUTOVENTA", T, xt, B / 2 + cap * s / 2)
for tema, tinta in (("claro", TINTA), ("oscuro", CREMA)):
    logo = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {r(ancho)} {B}" role="img" aria-label="AutoVenta">'
        f'<rect width="{B}" height="{B}" rx="{r(B * 0.13)}" fill="{ROJO}"/>'
        f'<path fill="{CREMA}" d="{av_centrado(B)}"/>'
        f'<path fill="{tinta}" d="{palabra}"/></svg>\n'
    )
    (HUB / f"public/autoventa-logo-{tema}.svg").write_text(logo)

# ── Trazos de «AV» en un bloque de 64, para el favicon con canvas ──
(HUB / "src/lib/marca-trazos.ts").write_text(
    "// Generado por scripts/logo-autoventa.py: no lo edites a mano.\n"
    "/** «AV» de Barlow Condensed itálica 800, centrado en un bloque de 64×64. */\n"
    f'export const AV_64 = "{av_centrado(LADO)}";\n'
)

# ── PNG ── (apple-touch-icon va a sangre, sin esquinas: iOS pone las suyas)
#   magick -background none -density 900 public/autoventa-icono.svg -resize 512x512 public/icon-512.png
#   magick -background none -density 400 public/autoventa-icono.svg -resize 192x192 public/icon-192.png
#   sed 's/rx="[0-9.]*"//' public/autoventa-icono.svg > /tmp/ios.svg
#   magick -density 400 /tmp/ios.svg -resize 180x180 -background "#C8102E" -flatten public/apple-touch-icon.png
print("Listo: SVG en public/ y src/lib/marca-trazos.ts. Los PNG, con los magick del final del script.")
