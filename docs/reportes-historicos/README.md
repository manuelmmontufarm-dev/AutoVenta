# Reportes históricos

Reportes de **periodo largo** (mes, trimestre) para reuniones con el cliente.
No confundir con el reporte diario automático de las 20:00 (`/api/hub/reporte-diario`),
que cubre un solo día y se envía solo a los asesores.

| Archivo | Periodo | Para |
|---|---|---|
| `2026-08-13-mes-1.html` | 13 jul – 13 ago 2026 | Reunión con Andrés Tamayo (Depot Tire) |

## Cómo hacer el siguiente

El formato es una sola página HTML autocontenida (sin dependencias externas, se abre
con doble clic y se imprime a PDF desde el navegador). Lo más rápido es **copiar el
último archivo, renombrarlo con la fecha de corte y reemplazar los números**.

Reglas del formato, para que todos se lean igual:

- **Casi puro gráfico.** Los SVG van escritos a mano dentro del HTML; nada de librerías.
- **Paleta de Depot Tire**: rojo `#E11B22`, amarillo `#F5B301`, vino `#2A1210`, negro `#141414`,
  rosa `#F3B4B4`. Misma cabecera y misma regla tricolor que el reporte diario.
- **Ninguna cifra sin fuente.** Cada bloque sale de un reporte guardado, no de un estimado.
  Lo que no se pudo medir se dice, no se rellena.
- Lo que todavía falla va en su propia sección al final. No se maquilla.

### De dónde salen los números

| Bloque | Fuente |
|---|---|
| KPIs, dona, kanban, día por día | Reporte diario de la fecha de corte (`/api/hub/reporte-diario`, o el PDF que llega a los asesores) |
| Errores por tipo y % de chats afectados | `app/scripts/auditoria/registro/reportes/<fecha>-censo/datos.json` |
| Calidad antes/después y fallos críticos | `app/scripts/eval/reports/<timestamp>/reporte.json` (`juez`, `fallosCriticos`) |
| Costo de IA, cache, tokens por conversación | `app/scripts/auditoria/registro/reportes/<fecha>-costos/datos.json` |
| Estabilidad bajo carga | `app/scripts/loadtest/reports/<timestamp>/reporte.json` |
| Qué pasó cada semana | `BITACORA.md` |
| Pendientes del cierre | `app/scripts/revision/registro/reportes/<fecha>/sintesis.json` |

Para generar fuentes frescas antes de armar el reporte:
`/auditoria-ventas` (costos y efectividad) y `/revision-contextual` (errores del día en contexto).

### Serie por semana desde la base

El reporte del mes 1 armó las semanas a partir de la bitácora y del reporte diario porque
la base de Depot no se pudo alcanzar ese día. Con `DATABASE_URL` de Depot a mano, esto da
la serie real y es lo que conviene usar la próxima vez:

```sql
-- conversaciones nuevas por semana
select date_trunc('week', created_at at time zone 'America/Guayaquil') as semana,
       count(*) as conversaciones
from conversations group by 1 order by 1;

-- mensajes y chats activos por semana
select date_trunc('week', created_at at time zone 'America/Guayaquil') as semana,
       count(distinct conversation_id)                as chats,
       count(*) filter (where role = 'user')          as mensajes_cliente,
       count(*) filter (where role = 'assistant')     as mensajes_bot
from messages group by 1 order by 1;

-- cotizaciones y plata cotizada por semana
select date_trunc('week', created_at at time zone 'America/Guayaquil') as semana,
       count(*) as cotizaciones, sum(total) as monto
from quotes group by 1 order by 1;
```

### La calculadora de costo

El bloque interactivo del final es JavaScript plano al pie del archivo. Para actualizarlo
solo se tocan dos constantes:

- `T` — tarifas por millón de tokens de cada modelo (fuente: precios publicados de OpenAI,
  los mismos que usa la auditoría de costos).
- `P` — consumo real por conversación (tokens de entrada, cuántos llegaron cacheados y
  tokens de salida), sacado de `datos.json` de la auditoría de costos dividido para las
  conversaciones del periodo.

Vale la pena verificar el cálculo contra un día ya medido: con el perfil del 8-ago y GPT-5.5
la calculadora devuelve los $13,41 que costó ese día.
