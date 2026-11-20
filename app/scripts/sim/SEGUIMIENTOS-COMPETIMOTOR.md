# Seguimientos de Competimotor · prueba con el reloj adelantado

Prueba los mensajes que el bot manda **solo** cuando el cliente deja de contestar,
con el bot real de Competimotor (perfil `mundillantas`, commit `6c22842` = PR #59),
sin esperar horas: una semana simulada (jue 19 → lun 23-nov-2026) dura ~5 min reales.

```bash
cd app
node scripts/sim/seguimientos-competimotor.mjs                    # 12 casos × 3 corridas, en paralelo
node scripts/sim/seguimientos-competimotor.mjs --corridas 1        # una corrida
node scripts/sim/seguimientos-competimotor.mjs --casos s08-sabado-tarde,s10-ventana-24h
node scripts/sim/seguimientos-competimotor.mjs --conservar-db      # deja autoventa_sim_seg_rN para mirar
```

Necesita lo mismo que `npm run sim`: `app/.env.sim` (clave de OpenAI de pruebas),
`app/.env.sim.mundillantas` (lectura de la config de producción de Competimotor),
`dist/` compilado y Postgres local. Usa puertos 3911–3935 y bases
`autoventa_sim_seg_r1..3`, lejos de la flota.

## Cómo se adelanta el tiempo (sin reescribir la lógica)

El bot corre entero en `sim.mjs --perfil mundillantas`; el script solo le cambia **la hora**:

- **Node**: el mismo `seguimientos-competimotor.mjs`, cargado con `NODE_OPTIONS=--import`,
  reemplaza `Date` por uno con desfase (lo lee de un archivo cada 100 ms). `TZDate` y todo
  lo que calcula horarios lo hereda.
- **Postgres**: en la base desechable se crea `public.now()` = `pg_catalog.now()` + el mismo
  desfase, la base queda con `search_path = public, pg_catalog` y los `default now()` de las
  columnas pasan a `public.now()`. Bot y base ven la misma hora (deriva medida: < 5 ms).
- El script salta el reloj al `due_at` del próximo job (+10 s) y espera una vuelta del
  **worker real** (cada 5 s): él decide portones, horario, ventana de 24 h, redacción con IA,
  Guardián y envío a la Graph de mentira. El agrupador va en `--debounce 1500`.
- Viernes 8:00 se sube por `POST /api/catalog/import` un Excel de Fénix cambiado (solo la
  Kenda 195/65R15 del caso 12: precio A 104,65 → 112,99, existencia 4 → 2).

Todos los veredictos salen de hechos de la base (`follow_up_jobs`, `follow_up_attempts`,
`messages` con `followUpJobId`, `conversations`, `quotes`, `bot_alerts`, `ai_runs`); el texto
del seguimiento solo se lee para juzgar **contenido** (precio, medida, promo, marca).

## Casos

| Caso | Silencio en | Qué tiene que pasar |
|---|---|---|
| s01-sin-medida | preguntó precios sin medida (jue 9:00) | 2 seguimientos en hora de la política, sin precio; al agotarse, revisión del asesor |
| s02-recibio-opciones | recibió la lámina 205/55R16 | 1.º a +180 min; montos = precio A de la lámina |
| s03-recibio-cotizacion | recibió cotización 4 × Kenda 185/70R14 | 1.º a +180 min con el precio de la cotización |
| s04-dijo-que-pasa | «el sábado paso» tras cotizar | sale como confirmación de visita, no repregunta el día |
| s05-rechazo | «no gracias, ya compré» | ningún seguimiento |
| s06-pidio-asesor | pidió un asesor | ningún seguimiento al cliente; queda con el asesor |
| s07-contesto-justo-antes | contesta 5 min antes del 1.º | el programado se cancela; el nuevo plan cuenta desde la respuesta |
| s08-sabado-tarde | sáb 13:30 (cierra 16:00) | nada después de las 16:00 ni el domingo |
| s09-viernes-noche | vie 16:30 | nada de noche; sale el sábado de mañana |
| s10-ventana-24h | sáb 15:00 | ningún texto libre fuera de 24 h; sin plantilla aprobada → asesor |
| s11-contesta-al-seguimiento | contesta al 1.º seguimiento | retoma con la misma medida, llanta y total |
| s12-cambio-precio-stock | cotizó jue 15:00; Excel del vie 8:00 cambia | no repite el precio viejo ni promete 4 si quedan 2 |

Chequeos de todos los casos: horario real de Competimotor (L–V 8–18, sáb 8–16, dom cerrado),
ventana de 24 h, tope de seguimientos por silencio, identidad (sin Depot/Quito/Mundillantas),
sin promo/descuento/urgencia, sin precio D, montos = cotización o precio A vigente, medida
correcta y momento según la política cargada (oráculo propio de la regla, no el código del bot).

## Resultados (18-nov-2026, noche)

**34 de 42 caso×corrida pasan** (14 casos × 3 corridas; 472 chequeos ok, 12 en falla).
Costo: **$2,91** en tokens (configuración real) + $0,82 de la variante con Fase 4 + $0,15 de
la prueba de humo ≈ **$3,90**. Tiempo: una semana simulada de 12 casos ≈ 10 min reales; las
corridas 2 y 3 en paralelo.

| Caso | Pasan | Qué falló |
|---|---|---|
| s01-sin-medida | 3/3 | — |
| s02-recibio-opciones | 3/3 | — |
| s03-recibio-cotizacion | 2/3 | r2: después de la cotización **no se agendó ningún seguimiento** (ver hallazgo 1) |
| s04-dijo-que-pasa | 3/3 | — |
| s05-rechazo | 3/3 | — |
| s06-pidio-asesor | 3/3 | — |
| s07-contesto-justo-antes | 2/3 | r1: el seguimiento promete «le aplican el **descuento** de su cotización» (hallazgo 3) |
| s08-sabado-tarde | **0/3** | sale el **sábado 16:30** con el local cerrado (hallazgo 2) |
| s09-viernes-noche | 3/3 | — |
| s10-ventana-24h | 3/3 | — |
| s11-contesta-al-seguimiento | 3/3 | — |
| s12-cambio-precio-stock | 3/3 | — |
| s13-pregunta-misma-etapa | 3/3 | — (la pregunta sí movió la etapa: no aisló el hallazgo 1) |
| s14-pregunta-tras-cotizar | **0/3** | cotiza, pregunta la garantía, calla → **cero seguimientos** (hallazgo 1) |

Variante informativa con **Fase 4 encendida** (solo en la base del simulador, corridas 4–6):
s03 3/3, s13 3/3, s14 **3/3 con seguimiento** (r5 vuelve a traer la frase del descuento).

### Hallazgos

1. **Con la Fase 4 apagada (así está Competimotor en producción), un cliente que vuelve a
   escribir sin que cambie la etapa se queda sin seguimientos el resto del ciclo.** El turno
   solo agenda si `fase4` está prendida (`src/index.ts:682`); lo demás depende de un cambio de
   etapa o de la red del worker (`ensureActiveConversationPlans`), que descarta la conversación
   si existe **cualquier** `advisor_review` del ciclo, aunque esté cancelado
   (`src/services/followUps.ts:837`, sin filtro de estado). s14: 0/3 con la config real, 3/3
   con Fase 4. Paradoja de paso: «Fase 4 apagada» no apaga los seguimientos (el worker los
   arma igual en los primeros silencios; en producción ya hay 48 jobs).
2. **La política de seguimientos de Competimotor trae el horario de Depot**
   (`follow_up_policies.business_hours` = lun–sáb 08:30–17:30, copiado de producción), no el
   del local (L–V 8–18, sáb 8–16; `store_hours` sí está bien). Efecto medido: seguimiento el
   sábado 16:30 con el local cerrado (s08, 3/3). Menor: L–V pierde 8:00–8:30 y 17:30–18:00.
3. **«Con ese dato le aviso al asesor y le aplican el descuento de su cotización apenas
   llegue.»** Sale fijo de `buildVisitPlanQuestion` (`src/services/quoteMessages.ts:397`)
   cuando no hay descuento autorizado ni ahorro: en Competimotor no hay descuento. Está en el
   turno del bot en **16 de 18** conversaciones con cotización y el seguimiento con IA lo copió
   en 1 de 48 (s07-r1) y en la variante (s14-r5).

Lo que sí quedó bien, 3/3: momento exacto según la política (+180 min, segundo 2 h antes de
cerrar la ventana, corridos a horario hábil), nada de noche, tope de 2, nada fuera de 24 h
(sin plantilla aprobada no se manda nada y el asesor recibe la revisión), rechazo y pedido de
asesor sin seguimientos, respuesta 5 min antes cancela el programado, visita = libreto de
confirmación sin repreguntar el día, montos = cotización o precio A (nunca D), sin promo ni
«últimas unidades», solo Competimotor, y tras el Excel del viernes no repite el precio viejo.

### Lo que esta prueba no cubre

- La entrega real de Meta (plantillas, 131047, acuses): la Graph es de mentira. Las tres
  plantillas de Competimotor están `not_configured`, así que fuera de 24 h no sale nada.
- Las variables del servicio de Competimotor en Railway: el simulador no pudo leerlas; los
  modelos se alinearon desde `ai_runs` de producción (gpt-5.5 vendedor y Guardián,
  gpt-5.4-mini rutina) y los interruptores quedaron como en `.env`. El bot se encendió en la
  base de la prueba (como va a estar en el arranque).
- Agrupador en 1,5 s (producción 12 s) y la ráfaga del cliente va mensaje por mensaje.
- `datos/` tiene un `.gitignore` con `*`: este archivo de casos no se versiona sin `git add -f`.
