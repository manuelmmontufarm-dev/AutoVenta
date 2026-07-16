# NOVOPAN · Simulador 3D · Sección 2 (Encolados)

Simulador **visual** de la Sección 2 de la Línea 1 (Pelikano): silos → encolado → formación → prensa → estacado.

Fuente de verdad de máquinas y orden: repo [NOVOPAN](https://github.com/manuelmmontufarm-dev/NOVOPAN), deck `Encolados.dc.html` y simulador vivo `/simulador-seccion-2`.

## Abrir

**Opción rápida (recomendada):**

```bash
cd simulador-seccion-2-3d
python3 -m http.server 8765
# abrir http://127.0.0.1:8765/
```

O abrir `index.html` directo en Chrome/Edge/Firefox (requiere red para Three.js CDN).

## Layout (fiel al proceso)

```
RUTA SL (fina)     Silo 6 → Dosimbunca UBG → Clasif. + Encolador CE ─┐
                                                                      ├→ SL1 / CL / SL2 → Preprensa → Desmoldante
RUTA CL (gruesa)   Silo 5 → Dosimbunca UBG → Clasif. + Encolador CI ─┘
                   → Precalent. → Prensa continua → Corte angular → Enfriadora estrella → Estacado
```

## Controles

| Control | Acción |
|---------|--------|
| Arrastrar | Orbitar |
| Scroll | Zoom |
| Clic derecho | Pan |
| PAUSE / PLAY | Animaciones |
| ISO / SIDE / TOP / RESET | Cámaras |

## Stack

- Three.js r170 (CDN, ES modules)
- HTML/CSS/JS vanilla · un solo `index.html` autocontenido
- Sin KPIs ni paneles de datos (solo HUD + cámara)
