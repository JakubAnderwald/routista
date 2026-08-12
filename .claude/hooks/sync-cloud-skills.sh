#!/bin/bash
# Hook: SessionStart — make the personal skills repo available in cloud sessions.
#
# Cloud sessions (claude.ai/code, the Claude mobile app, routines) start from a
# fresh clone of this repo on an Anthropic VM and never read ~/.claude/skills,
# so the skills in github.com/JakubAnderwald/claude-skills are missing there.
# This hook clones them into .claude/skills/ (gitignored) at the start of every
# cloud session, so a session always gets the latest committed version.
#
# Local sessions exit immediately: this machine already has ~/.claude/skills
# symlinked to the skills checkout, and personal skills override project ones.
#
# The skills repo must be reachable from the session VM. It is public today; if
# it ever goes private, set SKILLS_REPO_TOKEN (a read-only fine-grained PAT
# scoped to that one repo) in the cloud environment's variables at
# claude.ai/code — the VM's proxy-injected git credential only covers repos
# attached to the session. See docs/technical/CLOUD_SESSIONS.md.

set -uo pipefail

# CLAUDE_CODE_REMOTE is "true" on cloud session VMs and unset everywhere else.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

SKILLS_REPO="${ROUTISTA_SKILLS_REPO:-JakubAnderwald/claude-skills}"
# /watch is deliberately excluded: it needs ffmpeg and a local whisper.cpp model
# the session VM does not have.
SKILLS="push merge"

DEST="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/skills"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Clear the managed skill directories before the clone, not after it. A cloud
# VM's workspace survives a resume, so a session that installed these skills and
# is later resumed with a failing clone would otherwise keep the old copies on
# disk — usable, silently outdated, and contradicting the "not available in this
# session" message below. Only the directories named in SKILLS are touched, so
# .gitkeep and anything else in here is left alone.
for skill in $SKILLS; do
  rm -rf "$DEST/$skill"
done

# Never prompt for credentials: a prompt would hang until the hook times out.
export GIT_TERMINAL_PROMPT=0

# Feed the token through a credential helper rather than the clone URL, so it
# cannot leak into git's error output (which this hook prints on failure).
# The empty value first clears inherited helpers, so the token wins instead of
# queueing behind the VM's proxy helper. The helper reads the token from the
# environment, so it must be exported for git's subshell to see it.
GIT_ARGS=()
if [ -n "${SKILLS_REPO_TOKEN:-}" ]; then
  export SKILLS_REPO_TOKEN
  GIT_ARGS=(
    -c "credential.helper="
    -c "credential.helper=!f() { printf 'username=x-access-token\npassword=%s\n' \"\$SKILLS_REPO_TOKEN\"; }; f"
  )
fi

if ! CLONE_ERR=$(git ${GIT_ARGS[@]+"${GIT_ARGS[@]}"} clone --depth 1 --quiet \
  "https://github.com/$SKILLS_REPO.git" "$TMP/skills" 2>&1); then
  echo "Personal skills repo ($SKILLS_REPO) could not be cloned, so /push and /merge are not available in this session. Fix: check the repo is public, or add SKILLS_REPO_TOKEN to this cloud environment (docs/technical/CLOUD_SESSIONS.md). Carry on without them. git said: $CLONE_ERR"
  exit 0
fi

if ! mkdir -p "$DEST" 2>/dev/null; then
  echo "Could not create $DEST, so /push and /merge are not available in this session. Carry on without them."
  exit 0
fi

INSTALLED=""
FAILED=""
for skill in $SKILLS; do
  # Already cleared above, before the clone: a skill deleted or renamed upstream
  # must not survive in a resumed session as a stale copy of what it used to be.
  if [ ! -f "$TMP/skills/$skill/SKILL.md" ]; then
    # Named, not skipped: this means the list above has gone stale.
    FAILED="$FAILED /$skill"
    continue
  fi

  # Force disable-model-invocation: true, overwriting whatever value the source
  # set. Project skills are model-invocable, so an autonomous cloud session (an
  # auto-fix PR run, a routine) could load /merge on its own and merge past the
  # human gate. Explicit /push and /merge still work.
  #
  # The rewrite happens in the clone, not in .claude/skills/, so no half-built
  # directory is ever visible to Claude Code's skill watcher.
  SRC="$TMP/skills/$skill"
  if awk -v bom="$(printf '\357\273\277')" '
      NR == 1 {
        # Strip a UTF-8 BOM so a byte-order mark cannot hide the "---" opener
        # and get real frontmatter demoted into the body, yielding a skill too
        # broken to load. Passed in as bytes and matched with index/substr: a
        # /^\357\273\277/ regex silently fails to fire on macOS awk.
        if (index($0, bom) == 1) $0 = substr($0, length(bom) + 1)
        if ($0 == "---") { print; print "disable-model-invocation: true"; in_fm = 1 }
        else { print "---"; print "disable-model-invocation: true"; print "---"; print }
        next
      }
      in_fm && $0 == "---" { in_fm = 0; print; next }
      in_fm && /^disable-model-invocation:/ { next }
      { print }
    ' "$SRC/SKILL.md" >"$SRC/SKILL.md.guarded" &&
    mv "$SRC/SKILL.md.guarded" "$SRC/SKILL.md" &&
    cp -R "$SRC" "$DEST/$skill" 2>/dev/null &&
    grep -q '^disable-model-invocation: true$' "$DEST/$skill/SKILL.md"; then
    INSTALLED="$INSTALLED /$skill"
  else
    # Never report a skill as installed unless its guarded SKILL.md is in place.
    rm -rf "$DEST/$skill"
    FAILED="$FAILED /$skill"
  fi
done

if [ -n "$FAILED" ]; then
  echo "Personal skills that could not be installed in this cloud session:$FAILED (from $SKILLS_REPO — missing SKILL.md, or a filesystem error). Do not use them here."
fi

[ -n "$INSTALLED" ] || exit 0

# The read-it-directly fallback is deliberately scoped to /push. This hook's
# stdout is injected into the session as model-readable context, and
# disable-model-invocation only blocks the Skill tool — not a Read followed by
# Bash. Telling the session it may read any SKILL.md and follow it would hand
# back exactly the bypass the stamp above exists to block. /push is safe to
# reach that way; /merge stays behind the human gate.
MSG="Personal skills installed for this cloud session from $SKILLS_REPO:$INSTALLED (in .claude/skills/)."
case "$INSTALLED" in
  *"/push"*) MSG="$MSG If /push is not in the / menu yet, read .claude/skills/push/SKILL.md and follow it directly." ;;
esac
case "$INSTALLED" in
  *"/merge"*) MSG="$MSG Do not do the same for /merge: run it only when the human explicitly asks for it, never on your own initiative." ;;
esac
echo "$MSG"
exit 0
