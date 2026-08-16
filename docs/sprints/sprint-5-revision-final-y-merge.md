# Sprint 5 · Integración de las 4 ramas paralelas, revisión final y merge

**Modelo recomendado:** Fable · razonamiento alto. Este sprint no construye nada nuevo:
lee TODO lo que hicieron los otros cuatro (diffs completos + los 4 MDs), resuelve los
conflictos entre ramas, cablea las costuras que quedaron a propósito sin conectar, pule
y mergea. Es trabajo de contexto largo y criterio transversal — el punto fuerte de Fable.

**Prerequisito:** los sprints 1–4 terminados **en paralelo**, cada uno en su rama partida
del mismo commit de `main`: `fix/repetitiva-guardian` · `feat/login-hub` ·
`feat/avisos-por-rol` · `feat/cupon-confirmacion`. Nada mergeado a `main` todavía —
el merge es el final de ESTE sprint.

**Archivos que toca:** cualquiera, pero solo para integrar/corregir/pulir lo hecho en 1–4.
Ningún feature nuevo.

---

## Fase 0 · Integrar las ramas

En una rama de integración (`integracion/sprints-ago15`) partida de `main`:

1. Merge de las 4 ramas **en este orden** (del que menos choca al que más):
   `fix/repetitiva-guardian` → `feat/login-hub` → `feat/avisos-por-rol` →
   `feat/cupon-confirmacion`.
2. Conflictos esperados (documentados en el README; resolverlos conservando AMBOS
   cambios, no eligiendo un lado):
   - `app/src/server/admin.ts` — gate de auth (S2) + CRUD asesores (S3) + endpoints de
     cupones (S4).
   - `hub/src/screens/Ajustes.tsx` — rol del asesor (S3) + toggle del cupón (S4).
   - `BITACORA.md` — 4 entradas nuevas: quedan las cuatro, ordenadas por fecha.
   - Migraciones: verificar 017 (S3) y 018 (S4) sin colisión de número ni de tablas.
3. Compilar (`app` y `hub`) y `npm test` ANTES de seguir: los tests de los 4 sprints
   deben pasar juntos, no solo cada uno en su rama.

## Fase 0.5 · Cablear las costuras diferidas

Lo que los sprints dejaron en stub porque corrían en paralelo:

- **Cupón → avisos de visita:** llamar `getCouponForConversation()` (S4) desde los
  `details` de `visita_comprometida` / `visita_manana` / `visita_hoy` (S3).
- **`redeemed_by` → login:** el canje registra el usuario de la sesión (S2) en vez del
  string provisional.
- **Guardián → alerta de repetición:** si S1 dejó el hallazgo `repeticion` alta detrás
  de un flag, activarlo ahora que el enrutamiento del S3 filtra a quién le llega.
- Barrer los `TODO(S5)`/stubs que los MDs 1–4 pidieron dejar marcados.

## Fase A · Revisión cruzada (contra los 4 MDs)

Releer cada MD y verificar sus criterios de aceptación contra el código real del stack.
Después, las costuras ENTRE sprints, que ninguna sesión individual vio completas:

1. **Sesión (S2) × avisos (S3):** el rol del login (`admin`/`asesor`) y el rol de la
   tabla `advisors` son dos cosas distintas a propósito — verificar que nadie los haya
   fusionado ni cruzado. El `redeemed_by` del cupón (S4) debe guardar el usuario del
   login, no el asesor de WhatsApp.
2. **Detector (S1) × enrutamiento (S3):** `repetitive_conversation` ya no debe llegarle a
   ningún rol `asesor`, y con el detector nuevo deben salir < 3/día. Verificar también que
   el hallazgo `repeticion` alta del guardián genera la alerta con el dedupe diario.
3. **Cupón (S4) × avisos (S3):** el código debe aparecer en los `details` de
   `visita_comprometida`, `visita_manana` y `visita_hoy`, con la cabecera visual correcta.
4. **Cupón (S4) × guardián (S1):** el mensaje del cupón anuncia un 2 % que NO está en la
   cotización — confirmar que el guardián no lo «corrige» como precio inventado (probar
   un turno real con guardián activo; si lo marca, incluir el cupón en los hechos duros
   del contexto del guardián).
5. **Gate de auth (S2):** `x-admin-key` sigue funcionando para el panel central, los
   scripts de auditoría y el bot; el token expira y renueva bien.
6. **Taxonomía:** `visita_hoy` y `ventana_por_cerrar` clasificados en `alertTaxonomy.ts`
   (operativos, no errores); ningún `AdvisorEventType` sin cabecera visual (el test del
   mapa de S3 en verde).

## Fase B · Pulido

- Pasada de simplificación sobre el diff total (código muerto, duplicación entre
  sprints, nombres inconsistentes es/en).
- Mensajes de WhatsApp releídos EN un teléfono (longitud, negritas, emojis): los 5 del
  rol asesor + el del cupón.
- `npm test` completo + `scripts/eval` (la batería de 17 turnos) con guardián prendido:
  **0 fallos críticos**, juez ≥ los valores del 8-ago (4,2 / 4,2 / 4,6 / 4,4).
- Revisar el hub en móvil (login, logout, canje de cupón, baraja) — Safari iOS incluido.
- BITACORA.md: una entrada por sprint si falta alguna (el hook las exige).

## Fase C · Merge y verificación en staging

1. Merge de `integracion/sprints-ago15` a `main` (un solo merge, ya integrado y en
   verde). `main` deploya solo a **staging**.
2. En staging: humo de punta a punta — login de los 4 usuarios, un chat de prueba que
   dispare cotización → fecha → cupón, verificar los avisos y sus cabeceras, canje.
3. Reporte final a Manuel: qué se revisó, qué se corrigió, resultado de evals, y el
   checklist de humo. **El deploy a Depot (producción) queda para Manuel** — este
   sprint NO lo hace.

## Criterios de aceptación

- Los criterios de los 4 MDs verificados uno a uno (checklist en el reporte).
- Eval en verde, tests en verde, staging humeado.
- `main` contiene los 4 sprints; ninguna rama con trabajo sin mergear.
- Reporte final entregado; producción intacta hasta el visto de Manuel.

## Qué NO hacer

- No agregar features ni «mejoras» que cambien alcance — solo corregir e integrar.
- No deployar a Depot.
- No reescribir lo que funciona solo por gusto de estilo.
