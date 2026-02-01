#!/bin/bash
set -e

NEEDS_SETUP=false

# Install deps if missing
if [ ! -d "node_modules" ]; then
  npm install 2>&1
  NEEDS_SETUP=true
fi

# Pull env vars if missing
if [ ! -f ".env.local" ]; then
  vercel env pull .env.local 2>&1 || echo "Warning: vercel env pull failed - may need auth"
  NEEDS_SETUP=true
fi

# Inject env vars into session via CLAUDE_ENV_FILE
if [ -n "$CLAUDE_ENV_FILE" ] && [ -f ".env.local" ]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^#.*$ ]] && continue
    [[ -z "$line" ]] && continue
    echo "export $line" >> "$CLAUDE_ENV_FILE"
  done < .env.local
fi

if [ "$NEEDS_SETUP" = true ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Remote environment was configured: npm install + env vars pulled."}}'
fi
