#!/usr/bin/env bash
# Mete en app/.env el valor que tengas COPIADO en el portapapeles.
# Uso: ./poner-llave.sh CONTIFICO_API_KEY
# Nunca imprime el valor, solo confirma longitud y primeros caracteres.
set -euo pipefail

VAR="${1:-}"
if [[ -z "$VAR" ]]; then
  echo "Uso: $0 NOMBRE_DE_LA_VARIABLE   (ej. CONTIFICO_API_KEY)" >&2
  exit 1
fi

ENV_FILE="$(cd "$(dirname "$0")/../.." && pwd)/.env"
VALOR="$(pbpaste | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

if [[ -z "$VALOR" ]]; then
  echo "El portapapeles está vacío. Copia la llave primero (Cmd+C) y vuelve a correr." >&2
  exit 1
fi

BAK="$ENV_FILE.bak.$(date +%Y%m%d-%H%M%S)"
# El portapapeles suele traer texto del chat en vez de la llave. Una credencial
# no lleva espacios ni pasa de ~64 caracteres; si los lleva, es prosa.
if [[ "$VALOR" == *" "* ]]; then
  echo "ABORTADO: lo copiado tiene espacios, o sea que es texto, no una llave." >&2
  echo "  copiado (primeros 40): ${VALOR:0:40}…" >&2
  echo "  Copia la llave DESDE el panel de Contifico y vuelve a correr." >&2
  exit 1
fi
if (( ${#VALOR} > 64 )); then
  echo "ABORTADO: lo copiado mide ${#VALOR} caracteres, demasiado para una llave." >&2
  exit 1
fi
if (( ${#VALOR} < 16 )); then
  echo "ABORTADO: lo copiado mide ${#VALOR} caracteres, muy corto para una llave." >&2
  exit 1
fi

cp "$ENV_FILE" "$BAK"

if grep -q "^${VAR}=" "$ENV_FILE"; then
  ANTES="$(grep "^${VAR}=" "$ENV_FILE" | head -1 | cut -d= -f2-)"
  grep -v "^${VAR}=" "$ENV_FILE" > "$ENV_FILE.tmp"
  printf '%s=%s\n' "$VAR" "$VALOR" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
  if [[ "$ANTES" == "$VALOR" ]]; then
    echo "OK $VAR: ${#VALOR} chars, empieza en ${VALOR:0:6}… (IGUAL a la que ya estaba)"
  else
    echo "OK $VAR: ${#VALOR} chars, empieza en ${VALOR:0:6}… (REEMPLAZADA, la anterior era distinta)"
  fi
else
  printf '%s=%s\n' "$VAR" "$VALOR" >> "$ENV_FILE"
  echo "OK $VAR: ${#VALOR} chars, empieza en ${VALOR:0:6}… (AGREGADA, no existía)"
fi

echo "Respaldo del .env anterior en $BAK"
