#!/bin/bash

# Ralph Wiggum - Human-in-the-loop mode
# Run this script to execute one iteration at a time
# Watch what Claude does, review the commit, then run again

/Users/Gabriel/.claude/local/claude --dangerously-skip-permissions -p "@PRD.md @progress.txt \
1. Read the PRD and progress file. \
2. Find the next incomplete task and implement it. \
3. Run feedback loops (types, tests, lint) to verify the implementation. \
4. Commit your changes with a clear commit message. \
5. Update progress.txt with what you did. \
ONLY DO ONE TASK AT A TIME. \
Keep changes small and focused. Quality over speed."
