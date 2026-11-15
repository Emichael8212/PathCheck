#!/usr/bin/env bash
# SessionStart hook (matchers: startup, resume, clear, compact). Stdout is added to
# Claude's context (code.claude.com/docs/en/hooks.md#sessionstart). After auto-compaction
# this re-injects where the work stands, because hook context added earlier is only summarized.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
[ -t 0 ] || cat >/dev/null 2>&1
branch=$(git branch --show-current 2>/dev/null)
id=$(printf '%s' "$branch" | sed -n 's|^feat/\([A-Za-z0-9]*\)-.*|\1|p')
echo "PathCheck state (from disk — trust this over any summary):"
echo "- Branch: ${branch:-unknown}; HEAD: $(git log --oneline -1 2>/dev/null)"
echo "- Uncommitted files: $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
node scripts/status.mjs 2>/dev/null | sed 's/^/- /' || echo "- Features: unknown (node missing or features.json unreadable)"
echo "- Rules: docs/BRIEF.md is the spec; re-read CLAUDE.md before acting; hard limits are enforced by .claude/hooks/guard.mjs."
if [ -n "$id" ]; then
  [ -f "docs/sprints/$id.md" ] && echo "- Current sprint contract: docs/sprints/$id.md — re-read it and resume from its last recorded step."
  pr=$(gh pr view --json url,state -q '.url+" ("+.state+")"' 2>/dev/null) && [ -n "$pr" ] && echo "- PR for this branch: $pr"
fi
exit 0
