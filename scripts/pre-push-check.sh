#!/bin/bash

# Get the list of files changed in the current branch compared to main
changed_files=$(git diff --name-only main...HEAD)

# Check if README.md is in the list of changed files
if echo "$changed_files" | grep -q "README.md"; then
  echo "✅ README.md has been updated."
else
  echo "⚠️  WARNING: README.md has NOT been updated in this branch."
  echo "Please check if your changes require a README update."
  echo "If no update is needed, you can proceed."
fi
