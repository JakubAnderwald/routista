#!/bin/bash
set -e

STEPS=()

# Install deps if missing
if [ ! -d "node_modules" ]; then
  npm install 2>&1
  STEPS+=("npm install")
fi

# Pull env vars if missing
if [ ! -f ".env.local" ]; then
  if vercel env pull .env.local 2>&1; then
    STEPS+=("env vars pulled")
  else
    STEPS+=("env pull failed")
  fi
fi

# Inject env vars into session via CLAUDE_ENV_FILE
if [ -n "$CLAUDE_ENV_FILE" ] && [ -f ".env.local" ]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^#.*$ ]] && continue
    [[ -z "$line" ]] && continue
    echo "export $line" >> "$CLAUDE_ENV_FILE"
  done < .env.local
fi

if [ ${#STEPS[@]} -gt 0 ]; then
  IFS=', ' SUMMARY="${STEPS[*]}"
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"additionalContext\":\"Remote environment configured: ${SUMMARY}\"}}"
fi
