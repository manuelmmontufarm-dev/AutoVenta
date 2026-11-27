#!/bin/bash
# uso: lanzar.sh <tag> <n> <modelo_vendedor> <esfuerzo>
TAG=$1; N=$2; MV=$3; EF=$4
cd /Users/manue/AutoVenta-wt-27-modelos/app
UI=$((3700+N*10)); BOT=$((3695+N*10)); G=$((5710+N*10))
export AI_CLAUDE_EFFORT_VENDEDOR=$EF
# Variables de Depot_Tire/AutoVenta leídas con railway el 27-nov (la carpeta del worktree no está enlazada)
export AI_COMPACT_PROMPT_ENABLED=true AI_EXACT_TOOL_ROLLOUT=10 AI_HISTORY_LIMIT=10 AI_MAX_TOOL_ITERATIONS=3
export OPENAI_CLASSIFIER_MODEL=gpt-5.4-mini OPENAI_ESCALATION_MODEL=gpt-5.5 OPENAI_EXACT_TOOL_MODEL=gpt-5.4-mini
export OPENAI_MODEL=gpt-5.5 OPENAI_RESEARCH_MODEL=gpt-5.5 OPENAI_ROUTINE_MODEL=gpt-5.4-mini OPENAI_VISION_MODEL=gpt-5.5
unset ANTHROPIC_BASE_URL
exec node scripts/sim/sim.mjs --sin-build --debounce 1500 \
  --canary-model claude-haiku-5-5 --canary-model-vendedor $MV --canary-model-guardian claude-haiku-5-5 \
  --puerto $UI --puerto-bot $BOT --puerto-graph $G --puerto-contifico $((G+1)) --puerto-stub $((G+2)) \
  --db autoventa_sim_bm_$TAG > "${LOGS:-/tmp}/sim-$TAG.log" 2>&1
