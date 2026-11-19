# Cómo crear plantillas de WhatsApp en Meta sin entrar al Facebook del cliente

Probado el 18-nov-2026 con Depot Tire y Competimotor. Se hace desde la terminal con el
token que el bot ya usa. No hace falta abrir WhatsApp Manager ni el Facebook del cliente.

## Qué se necesita

| Dato | Dónde está |
|---|---|
| Token del cliente | Base Postgres del cliente, tabla `settings`, clave `channel_config`, campo `token` |
| Id de la cuenta de WhatsApp (WABA) | Depot: `970823328872837` · Competimotor: `847835534545450` |
| Railway CLI enlazado | `railway status` debe decir proyecto `AutoVentas`, ambiente `Depot_Tire` |

Ojo: el `WHATSAPP_TOKEN` de las variables de Railway de Depot es de la app vieja y **no sirve**
(da error 100). El bueno es siempre el de la base.

## Paso 1 — Escribir la plantilla en un archivo JSON

```json
{
  "name": "recordatorio_visita_v1",
  "language": "es",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hola {{1}}, le recordamos su visita de mañana {{2}} en {{3}}. Ya tenemos listas sus llantas {{4}}. Si no puede venir, avísenos por aquí y le cambiamos el día.",
      "example": { "body_text": [["Carlos", "jueves", "Depot Tire Granados", "205/55R16"]] }
    },
    {
      "type": "BUTTONS",
      "buttons": [
        { "type": "QUICK_REPLY", "text": "Sí voy" },
        { "type": "QUICK_REPLY", "text": "Cambiar día" }
      ]
    }
  ]
}
```

Reglas de Meta que importan:

- `name`: minúsculas, números y guion bajo.
- Un ejemplo por cada hueco `{{n}}`, en orden.
- El texto no puede empezar ni terminar con un hueco.
- `UTILITY` (~1 ¢) = avisa de algo que el cliente ya acordó. Si el texto vende o trae promo,
  Meta la pasa a `MARKETING` (~7 ¢).
- Máximo 3 botones de respuesta rápida.

## Paso 2 — Conectarse a la base del cliente y sacar el token

El servicio Postgres de Competimotor se llama `Postgres-Mundillantas`. Para otro cliente,
cambiar el nombre del servicio. El token queda en una variable y nunca se imprime.

```bash
eval "$(railway variables --service Postgres-Mundillantas --environment Depot_Tire --kv \
  | grep -E '^(PGUSER|PGPASSWORD|PGDATABASE|RAILWAY_TCP_PROXY_DOMAIN|RAILWAY_TCP_PROXY_PORT)=' \
  | sed -E "s/^([A-Z_]+)=(.*)$/export \1='\2'/")"
export PGHOST=$RAILWAY_TCP_PROXY_DOMAIN PGPORT=$RAILWAY_TCP_PROXY_PORT
TOKEN=$(psql -Atc "select value::jsonb->>'token' from settings where key='channel_config'")
```

## Paso 3 — Comprobar el permiso (solo lectura)

```bash
curl -sS "https://graph.facebook.com/v23.0/debug_token?input_token=$TOKEN" -H "Authorization: Bearer $TOKEN"
```

En `scopes` debe salir `whatsapp_business_management`. Sin ese permiso no se puede crear.

## Paso 4 — Enviar la plantilla a Meta

```bash
WABA=847835534545450
curl -sS -X POST "https://graph.facebook.com/v23.0/$WABA/message_templates" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data-binary @plantilla.json
```

Respuesta buena: `{"id":"…","status":"PENDING","category":"UTILITY"}`.

## Paso 5 — Ver si Meta ya la aprobó

```bash
curl -sS "https://graph.facebook.com/v23.0/$WABA/message_templates?fields=name,status,category,language" \
  -H "Authorization: Bearer $TOKEN"
```

- `PENDING`: en revisión (minutos, a veces hasta 24 h).
- `APPROVED`: lista para usar.
- `REJECTED`: leer el motivo, corregir y enviar con otro nombre (`_v2`).
- Mirar también `category`: si cambió a `MARKETING`, cuesta ~7 ¢ en vez de ~1 ¢.

## Paso 6 — Conectarla al bot

En el panel del cliente, Seguimientos → plantillas: poner el nombre exacto de la plantilla y
marcarla como aprobada (tabla `follow_up_templates`). Hasta entonces el bot no la envía.

## Plantillas enviadas el 18-nov-2026

| Cliente | Plantilla | Id en Meta | Estado al enviar |
|---|---|---|---|
| Depot Tire | `recordatorio_visita_v1` | `1090812663987948` | PENDING · UTILITY |
| Depot Tire | `visita_no_llego_v1` | `1168267625538604` | PENDING · UTILITY |
| Competimotor | `recordatorio_visita_v1` | `1680661520324356` | PENDING · UTILITY |
| Competimotor | `visita_no_llego_v1` | `1679376043547704` | PENDING · UTILITY |

En Competimotor el local va escrito fijo («en Competimotor»), así que tiene un hueco menos.

## Lo que falta en el código

- El recordatorio debe salir la tarde anterior a `visit_date`; hoy se calcula desde el último
  mensaje del cliente (`app/src/services/followUpCampaigns.ts`).
- `visita_no_llego_v1` no existe todavía en `follow_up_templates` ni tiene disparador.
- Las plantillas del código no tienen botones; hay que manejar las respuestas «Sí voy»,
  «Cambiar día», «Agendar otro día» y «Ya no las necesito».
