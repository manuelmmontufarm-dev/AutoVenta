# Sprints · pedidos del 15-ago (chat de Manuel + reunión con Andrés del 14-ago)

Cuatro sprints de construcción que corren **en paralelo** (sesiones simultáneas) más un
quinto que integra. Partidos para que ninguno dependa del código de otro y para que cada
uno quepa cómodo en una sesión de contexto limpia. Cada MD es autocontenido: se le puede
dar a una sesión nueva sin este README.

| Orden | Sprint | Qué resuelve | Modelo / potencia | Tamaño |
|---|---|---|---|---|
| 1 | [sprint-1-conversacion-repetitiva-y-guardian.md](sprint-1-conversacion-repetitiva-y-guardian.md) | Falsos positivos de «conversación repetitiva», afinado del Ángel Guardián y sus 3 causas raíz | Opus · alto | M |
| 2 | [sprint-2-login-permisos-y-cotizador.md](sprint-2-login-permisos-y-cotizador.md) | Login con dropdown (Manuel/Andrés/Joaquín/Asesor, clave 1234), logout, base de permisos + fix «Guardar imagen» del cotizador | Opus · alto (mín.: Sonnet medio) | M |
| 3 | [sprint-3-notificaciones-por-rol.md](sprint-3-notificaciones-por-rol.md) | Rol `asesor` (Jocelyn/Jimmy): solo ventana 24 h, cotizaciones y visitas (dijo fecha / día antes / día de) + aviso nuevo «viene hoy» + estilo visual por tipo | Opus · alto | M–L |
| 4 | [sprint-4-cupon-confirmacion.md](sprint-4-cupon-confirmacion.md) | Cupón de confirmación (~2 % extra) para medir cotización → venta real | Opus · alto | L |
| 5 | [sprint-5-revision-final-y-merge.md](sprint-5-revision-final-y-merge.md) | Integrar las 4 ramas paralelas: resolver conflictos, cablear las costuras, revisar, pulir, evals, merge a `main` y humo en staging | **Fable · alto** | L |

**Modo de ejecución: los sprints 1–4 corren EN PARALELO** (decisión de Manuel, 15-ago:
sesiones simultáneas, todas en Opus alto). El 5 corre al final y es quien integra.

**Reglas para las 4 sesiones paralelas:**
- Cada una parte del MISMO commit de `main` y trabaja en su rama:
  `fix/repetitiva-guardian` · `feat/login-hub` · `feat/avisos-por-rol` ·
  `feat/cupon-confirmacion`. **Nadie mergea a `main`** — eso es del Sprint 5.
- Leer `BITACORA.md` (cabecera) y el MD del sprint; respetar sus «Qué NO hacer» y
  su sección «Independencia» (qué NO asumir de los otros sprints).
- Cada sprint debe compilar y pasar `npm test` **solo**, sin el código de los demás:
  donde necesite algo de otro sprint, deja el stub que su MD indica y el Sprint 5 cablea.
- Migraciones: para no chocar en numeración, cada sprint usa el prefijo que le asigna
  su MD (S3 → `017_advisor_roles`, S4 → `018_confirmation_coupons`). No renumerar.
- Escribir la entrada de bitácora (el hook la exige) antes de cerrar el sprint.
- Deploy a Depot solo con el visto de Manuel (tampoco lo hace el Sprint 5).

**Puntos de choque conocidos que el Sprint 5 debe resolver** (los 4 no se coordinan
entre sí; está bien que choquen aquí):
- `app/src/server/admin.ts`: S2 toca el gate de auth, S3 el CRUD de asesores, S4 agrega
  endpoints de cupones → conflicto de merge seguro, resolución mecánica.
- `hub/src/screens/Ajustes.tsx`: S3 (rol de asesor); S2 no lo toca (login es
  `admin-key.tsx`), S4 agrega su toggle — conflicto posible S3/S4.
- `app/src/services/visitAlerts.ts`: S3 (visita_hoy) y S4 NO lo toca en paralelo
  (expone su servicio y el S5 cablea el cupón en los avisos).
- Cableados diferidos al S5: cupón → `details` de avisos de visita; `redeemed_by` →
  usuario del login; hallazgo `repeticion` alta del guardián → alerta (si S1 lo dejó
  detrás de un flag).

## Datos verificados que sustentan el plan (15-ago, producción Depot)

- Guardián, 7 días: **323 revisiones, 62 correcciones (19 %)**; altas: ignora-pregunta 16,
  re-pregunta 11, otro 11, **precio 8**, medida 2. → **No se apaga**; vale lo que corrige.
  El ruido está en las alertas, no en la revisión (Sprint 1).
- Alertas «conversación repetitiva»: **14 solo el 15-ago**, la mayoría en conversaciones
  sanas (caso confirmado: conv 6467). Causa: similitud por `min()` + entidades del negocio
  (local, medida, día) contadas como repetición. El guardián, con juicio real, solo marcó
  9 repeticiones en 7 días.
- Causas raíz ya identificadas por el guardián: cierre fijo «¿Necesita alguna
  recomendación?» aunque hay recomendación lista o piden precio; bloques de beneficios que
  ignoran la pregunta; «mantenimiento cada 10.000 km» sin respaldo.

## Pendientes que NO entran en estos sprints

- Restricciones reales por rol en el hub (la base queda en el Sprint 2; qué ve cada quién
  lo define Depot después).
- QR del cupón (fase 2 del Sprint 4).
- Cross-reference con facturación de Contífico (idea alternativa de la reunión; el cupón
  la reemplaza por ahora).
- Capacitación de asesores (Depot agenda; Manuel participa).
