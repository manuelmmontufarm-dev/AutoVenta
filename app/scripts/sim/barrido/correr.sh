#!/bin/bash
# Barrido de modelos (27-nov-2026). Corre el lote difícil caso por caso contra
# UN simulador ya levantado, con tope global de gasto en Anthropic.
# uso: correr.sh <etiqueta> <base-tag> <n-sim> <casos: "1-20,28">
TAG=$1; BASE=$2; N=$3; CASOS=$4; TOPE=${TOPE:-9.5}
cd /Users/manue/AutoVenta-wt-27-modelos/app
export SIM_UI_URL=http://127.0.0.1:$((3700+N*10))
export SIM_APP_URL=http://127.0.0.1:$((3695+N*10))
export SIM_DATABASE_URL=postgresql://manue@localhost/autoventa_sim_bm_$BASE
unset ANTHROPIC_BASE_URL OPENAI_BASE_URL
for tramo in $(echo "$CASOS" | tr ',' ' '); do
  a=${tramo%-*}; b=${tramo#*-}
  for n in $(seq "$a" "$b"); do
    g=$(node scripts/sim/barrido/gasto.mjs --total)
    if awk "BEGIN{exit !($g >= $TOPE)}"; then echo "TOPE alcanzado: $g"; exit 3; fi
    perl -e 'alarm shift; exec @ARGV' 600 node scripts/sim/lote-canary.mjs --etiqueta "bm-$TAG" --rango "$n-$n" --continuar --sin-juez \
      | grep -E "^▶|💥|sin juez"
  done
done
node scripts/sim/barrido/volcar-runs.mjs "bm-$TAG"
echo "FIN bm-$TAG gasto total anthropic $(node scripts/sim/barrido/gasto.mjs --total)"
