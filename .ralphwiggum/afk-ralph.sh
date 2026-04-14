#!/bin/bash

# Ralph Wiggum - AFK (Away From Keyboard) mode
# Runs Claude in a loop for autonomous coding
# Usage: ./afk-ralph.sh <iterations>

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  echo "Example: $0 10"
  exit 1
fi

echo "Starting Ralph Wiggum AFK mode with $1 iterations..."
echo "=============================================="

for ((i=1; i<=$1; i++)); do
  echo ""
  echo ">>> Iteration $i of $1"
  echo "----------------------------------------------"

  result=$(/Users/gabriel/.local/bin/claude --dangerously-skip-permissions -p "@prd-native-app.md @progress.txt \
  1. Read the PRD, progress file and demo plan to understand the current state. \
  2. Find the highest-priority incomplete task and implement it. \
  3. Run feedback loops: types, tests, and lint checks. \
  4. Commit your changes with a descriptive message. \
  5. Update progress.txt with what was completed. \
  ONLY WORK ON A SINGLE TASK. \
  Keep changes small and focused. Quality over speed. \
  If all tasks in the PRD are complete, output <promise>COMPLETE</promise>.")

  echo "$result"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo ""
    echo "=============================================="
    echo "PRD complete after $i iterations!"
    echo "=============================================="
    exit 0
  fi
done

echo ""
echo "=============================================="
echo "Completed $1 iterations. PRD may not be fully complete."
echo "Run again with more iterations if needed."
echo "=============================================="
