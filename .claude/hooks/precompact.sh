#!/usr/bin/env bash
# PreCompact hook. Exit-0 stdout becomes instructions for the compaction summary
# (code.claude.com/docs/en/hooks.md#precompact). Never blocks compaction.
[ -t 0 ] || cat >/dev/null 2>&1
cat <<'TXT'
When summarizing, preserve exactly: the current milestone (M0–M3) and whether the owner
has checked the previous one; the feature ID being worked on and its branch name; the
sprint contract path (docs/sprints/<id>.md) and the current step of /next-task (contract
review, implementing, QA round N, review, PR, CI, merge); the open PR URL; failing test
names and the last evaluator/reviewer defects not yet fixed; any question waiting on the
owner; and anything not yet committed. Drop tool output details that are already
recorded in files.
TXT
exit 0
