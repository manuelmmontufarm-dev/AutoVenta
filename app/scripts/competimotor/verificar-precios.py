"""
¿El bot cotiza el P2? Compara, al centavo, lo que sale de verificar-precios.ts
contra las columnas del Excel de Fénix leídas acá, por separado (xlrd).

  python3 -I scripts/competimotor/verificar-precios.py <INV_NOV.XLS> <precios-bot.json> [--muestra N]

Revisa TODAS las llantas del catálogo del bot y muestra una muestra de N (por
defecto 20) repartida por aro y marca. Sale con código 1 si alguna no calza.
"""
import json
import sys

import xlrd

args = [a for a in sys.argv[1:] if not a.startswith("--")]
muestra_n = int(sys.argv[sys.argv.index("--muestra") + 1]) if "--muestra" in sys.argv else 20
ruta_xls, ruta_json = args[0], args[1]

hoja = xlrd.open_workbook(ruta_xls).sheets()[0]
encabezado = None
excel = {}
for r in range(hoja.nrows):
    fila = hoja.row_values(r)
    if encabezado is None:
        if "Precio B" in fila and "Precio C" in fila:
            encabezado = {nombre: i for i, nombre in enumerate(fila) if nombre}
        continue
    codigo = fila[encabezado["Código"]]
    if isinstance(codigo, float) and codigo.is_integer():
        codigo = str(int(codigo))
    codigo = str(codigo).strip()
    precio_b = fila[encabezado["Precio B"]]
    if codigo and isinstance(precio_b, float):
        excel[codigo] = {
            "articulo": fila[encabezado["Articulo"]],
            "A": fila[encabezado["Precio A"]],
            "B": precio_b,
            "C": fila[encabezado["Precio C"]],
            "D": fila[encabezado["Precio D"]],
        }

bot = json.load(open(ruta_json))
cent = lambda x: int(round(x * 100))
fallas = []
filas = []
for it in bot["items"]:
    x = excel.get(it["codigo"])
    if x is None:
        fallas.append((it["codigo"], "no está en el Excel"))
        continue
    esperado = it["cotizaPorLlanta"] if it["promocion"] else x["B"]
    ok_p2 = cent(it["cotizaPorLlanta"]) == cent(x["B"]) if not it["promocion"] else cent(it["tachadoPorLlanta"] or 0) == cent(x["B"])
    ok_total = cent(it["totalDe4"]) == cent(4 * it["cotizaPorLlanta"])
    ok_p3 = it["efectivoPorLlanta"] is not None and cent(it["efectivoPorLlanta"]) == cent(min(x["C"], it["cotizaPorLlanta"]))
    nunca_a = cent(it["cotizaPorLlanta"]) != cent(x["A"]) or cent(x["A"]) == cent(x["B"])
    a_en_texto = f"${x['A']:.2f}" in it["textoPagos"] and cent(x["A"]) not in (cent(x["B"]), cent(x["C"]), cent(it["cotizaPorLlanta"]))
    if not (ok_p2 and ok_total and ok_p3 and nunca_a) or a_en_texto:
        fallas.append((it["codigo"], f"P2 {ok_p2} total {ok_total} P3 {ok_p3} sinA {nunca_a} A-en-texto {a_en_texto}"))
    filas.append((it, x, ok_p2 and ok_total and ok_p3 and nunca_a and not a_en_texto))

# Muestra: una por (aro, marca) alternando, hasta N, con al menos una de Black Friday por aro si hay.
import re
def aro(medida):
    m = re.search(r"R(\d{2}(?:\.\d)?)", medida or "")
    return m.group(1) if m else "?"
vistos = set()
muestra = []
for it, x, ok in sorted(filas, key=lambda t: (aro(t[0]["medida"]), t[0]["marca"], t[0]["codigo"])):
    clave = (aro(it["medida"]), it["marca"])
    if clave in vistos or it["stock"] <= 0:
        continue
    vistos.add(clave)
    muestra.append((it, x, ok))
paso = max(1, len(muestra) // muestra_n)
muestra = muestra[::paso][:muestra_n]

print(f"Instante: {bot['instante']} · Black Friday aplicado a {bot['aplicadasBlackFriday']} llantas")
print(f"Revisadas: {len(filas)} llantas del catálogo del bot · fallas: {len(fallas)}")
print()
print("| Llanta | Código | P2 Excel | Cotiza c/u | ¿= P2? | Total 4 | 6 cuotas | P3 Excel | Efectivo c/u |")
print("|---|---|---|---|---|---|---|---|---|")
for it, x, ok in muestra:
    bf = " (Black Friday; P2 tachado)" if it["promocion"] else ""
    igual = "✅" if ok else "❌"
    print(f"| {it['nombre']} | `{it['codigo']}` | ${x['B']:.2f} | ${it['cotizaPorLlanta']:.2f}{bf} | {igual} | ${it['totalDe4']:.2f} | ${it['cuota6De4']:.2f} | ${x['C']:.2f} | ${it['efectivoPorLlanta']:.2f} |")
for codigo, motivo in fallas[:30]:
    print("FALLA", codigo, motivo)
print()
print("Descartadas por el bot:", [d for d in bot["descartadas"] if not d["motivo"].startswith("aro de camión") and d["motivo"] != "precio inválido"])
sys.exit(1 if fallas else 0)
