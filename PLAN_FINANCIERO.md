# AutoVenta — Plan Financiero

> Precios verificados a **2026-07-13**. Volumen esperado: 10–50 chats/día (~300–1.500 conversaciones/mes).
> Complementa a [PLAN_DESARROLLO.md](PLAN_DESARROLLO.md).

---

## 1. Cuánto cuesta operar el bot (costos recurrentes)

### Escenario A — Arranque (10–20 chats/día, ~300–600 conv/mes)

| Concepto | Servicio | $/mes |
|---|---|---|
| Hosting (bot + dashboard) | Railway Hobby | $5,00 |
| Base de datos + Auth | Supabase Free (con keep-alive + backups por GitHub Actions) | $0 |
| WhatsApp (canal) | Meta Cloud API — conversaciones de servicio **gratis**; ~100 alertas utility × $0,0113 | ~$1,13 |
| LLM — conversación | Claude Sonnet 5 (~5 turnos/conv, con prompt caching) | ~$6–12 |
| LLM — clasificador de etapa | Claude Haiku 4.5 | ~$1 |
| Observabilidad, backups, CI | Sentry + Better Stack + GitHub Actions (free tiers) | $0 |
| **TOTAL** | | **≈ $13–19/mes** |

### Escenario B — Régimen (30–50 chats/día, ~900–1.500 conv/mes)

| Concepto | $/mes |
|---|---|
| Railway (posible overage de crédito) | $5–10 |
| Supabase Free | $0 |
| WhatsApp (alertas + algún template de reapertura) | $2–4 |
| Claude (Sonnet 5 conversación + Haiku clasificador + fotos con visión) | $15–30 |
| **TOTAL** | **≈ $22–44/mes** |

### Escenario C — Crecimiento (100+ chats/día, o exigencia de backups gestionados)

| Concepto | $/mes |
|---|---|
| Railway con más uso / Pro | $10–20 |
| Supabase Pro (sin pausas, backups 7 días) | $25 |
| WhatsApp | $5–15 |
| Claude | $40–80 |
| **TOTAL** | **≈ $80–140/mes** |

**Notas de costos:**
- El canal WhatsApp es prácticamente gratis porque el 100% del flujo lo inicia el cliente (servicio = $0 ilimitado desde nov-2024). Solo se pagan templates fuera de ventana.
- El LLM se abarata con **prompt caching** (lecturas a ~10% del precio) y Sonnet 5 tiene precio intro $2/$10 por MTok **hasta el 31-ago-2026**.
- Opción ultra-económica: Haiku 4.5 en todo → LLM ~$3–8/mes, sacrificando algo de calidad conversacional. Opción máxima calidad: Opus 4.8 → LLM ~$30–60/mes.

### Costos únicos (one-time)
| Concepto | Costo |
|---|---|
| Verificación Meta Business | $0 (solo RUC + documentos) |
| Test number de desarrollo | $0 |
| Templates de WhatsApp | $0 (crear/aprobar es gratis) |
| Wheel-Size Fitment API | **$0 en Fases 1–3** (tabla curada propia); $450/año solo si escala |
| **Total setup externo** | **$0** |

### Costo por conversación / por venta
- Conversación completa (~5 turnos, Sonnet 5 con caching): **~$0,02–0,04**.
- Una llanta se vende a $60–150+ → el costo del bot por venta es **despreciable** (<0,1% del ticket). Argumento de venta fuerte.

---

## 2. Cuánto cobrar

### 2.1 El contexto
- La idea inicial: **$600 por todo**.
- Horas estimadas del proyecto (ver PLAN_DESARROLLO §9): **75–100 h** → $600 equivale a **$6–8/hora**. Muy por debajo de mercado (freelance junior LATAM: $15–30/h; agencias de bots cobran $2.000–10.000 por proyectos así), pero defendible como precio amigo + pieza de portafolio.
- Referencia local directa: el dev de la competencia ("Interbot") **cobra mensualidad** a otras empresas de llantas — el modelo recurrente ya está validado en este mercado.
- Referencia SaaS: solo la "tubería" de WhatsApp en WATI/360dialog cuesta **$59+/mes** sin ninguna inteligencia. Todo lo que cobres debajo de eso es barato.

### 2.2 La regla de oro
> **Nunca absorber los costos recurrentes (API de Claude, Railway, WhatsApp) en el precio fijo.**
> El bot cuesta $13–44/mes en operar *para siempre*. Si cobras $600 una vez y pagas tú la operación, en ~15–24 meses trabajaste gratis y encima pierdes plata. La mensualidad no es opcional: o la paga el cliente como fee, o el cliente asume las cuentas a su nombre.

### 2.3 Opciones de precio

| Opción | Estructura | Pros | Contras |
|---|---|---|---|
| **A (recomendada)** | **$600 de implementación** (pagados por fase: F1 $250 · F2 $200 · F3 $150) **+ $40/mes** todo incluido (infra + WhatsApp + Claude + mantenimiento + soporte + hasta 1 h de cambios menores) | Ingreso recurrente; alinea con el modelo del competidor; cubre operación con margen; el cliente paga poco por entrar | Hay que sostener el servicio |
| B | $900–1.100 únicos + cuentas (Railway, Meta, Anthropic) a nombre del cliente; mantenimiento a $15–20/h bajo demanda | Sin compromiso mensual tuyo | El cliente debe gestionar 3 cuentas y tarjeta; sin ingreso recurrente; soporte se vuelve regateo |
| C | $600 + comisión por venta | Al cliente le suena atractivo | **Ya descartada**: "confirmado" ≠ venta real (mucha gente dice que va y no llega); imposible de auditar |
| D | Solo mensualidad, $0 de entrada: $99/mes × 12 meses mínimo | Barrera de entrada nula; LTV mayor ($1.188/año) | Riesgo de cancelación temprana; más difícil de vender a una PyME |

### 2.4 Recomendación: Opción A

**$600 de implementación (por fases) + $40/mes.**

Economía de la mensualidad de $40:

| | Escenario A (arranque) | Escenario B (régimen) |
|---|---|---|
| Costos de operación | $13–19 | $22–44 |
| Margen mensual | **$21–27** | **–$4 a $18** |

- En régimen alto (50 chats/día con Sonnet), $40 queda justo → **cláusula de ajuste**: "si el volumen supera ~1.000 conversaciones/mes, la mensualidad pasa a $60–70". Dejarlo escrito desde el día 1.
- La mensualidad también paga las **25–40 h/año de mantenimiento** (§8 del plan técnico) a razón efectiva de ~$12–19/h sobre el margen — bajo pero razonable para un cliente-amigo con potencial de referidos.
- Los pagos por fase protegen el flujo: $250 al entregar la demo de Fase 1 (~2 semanas), no todo al final.

### 2.5 Argumentos para la negociación con el cliente
1. "Solo el canal de WhatsApp en un SaaS cuesta $59/mes sin ninguna IA; esto es un agente completo por $40."
2. "El costo del bot por venta es menos de 5 centavos — se paga con la primera llanta del mes."
3. "El de Interbot les cobra mensualidad a otras llanteras por menos que esto" (validación del modelo, mismo mercado).
4. "El fijo va por fases: pagan $250 y ven la demo funcionando en 2 semanas antes de seguir."

### 2.6 Proyección año 1 (Opción A)

| Concepto | Monto |
|---|---|
| Implementación (una vez) | $600 |
| Mensualidad × 12 | $480 |
| **Ingreso año 1** | **$1.080** |
| Costos de operación año 1 (promedio ~$20/mes) | –$240 |
| **Neto año 1** | **≈ $840** + portafolio + referidos a otras llanteras |

**Upside real:** el producto es genérico (AutoVenta). La segunda llantera cuesta ~10–15 h de setup (no 75–100) y puede cobrarse $500–800 + $50–80/mes. Ahí está el negocio.
