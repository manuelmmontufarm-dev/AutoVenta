#!/usr/bin/env bash
# Suscribe la app del cliente a su WABA y muestra el estado, usando el token que
# ya está guardado en el panel (settings.channel_config). El token nunca se imprime.
# Uso: suscribir-waba.sh <servicio-postgres-railway> <host:puerto del proxy> <WABA_ID>
set -euo pipefail
SVC="$1"; PROXY="$2"; WABA="$3"
cd "$(dirname "$0")/../../.."
set -a; eval "$(railway variables --service "$SVC" --kv 2>/dev/null | grep -E '^(PGUSER|PGPASSWORD|PGDATABASE)=')"; set +a
export PGHOST="${PROXY%%:*}" PGPORT="${PROXY##*:}"
TOKEN=$(psql -At -c "select value->>'token' from settings where key='channel_config'")
[ -n "$TOKEN" ] || { echo "No hay token guardado en el panel todavía."; exit 1; }
G=https://graph.facebook.com/v23.0
echo "== suscribir"; curl -s -X POST "$G/$WABA/subscribed_apps" -H "Authorization: Bearer $TOKEN"; echo
echo "== apps suscritas"; curl -s "$G/$WABA/subscribed_apps" -H "Authorization: Bearer $TOKEN"; echo
echo "== números"; curl -s "$G/$WABA/phone_numbers?fields=id,display_phone_number,verified_name,status,quality_rating,platform_type,is_on_biz_app" -H "Authorization: Bearer $TOKEN"; echo
