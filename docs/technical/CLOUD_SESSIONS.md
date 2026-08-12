# Cloud sessions — personal skills

How the personal skills (`/push`, `/merge`) reach a Claude Code session running in the cloud,
and why they arrive via a session-start hook rather than one of the alternatives.

## The problem

Personal skills live in their own repo,
[`JakubAnderwald/claude-skills`](https://github.com/JakubAnderwald/claude-skills), symlinked into
place as `~/.claude/skills`. That covers every local session on the Mac.

It does not cover cloud sessions. Working on Routista from the Claude mobile app or
claude.ai/code runs a cloud session: a fresh clone of this repo on an Anthropic-managed VM that,
by design, never reads `~/.claude/` from any personal machine. `/push` and `/merge` — the two
skills that matter most for reviewing and shipping from a phone — were simply absent there.

## How it works

`.claude/hooks/sync-cloud-skills.sh` runs as a `SessionStart` hook (matcher `startup|resume`,
wired up in `.claude/settings.json` with a 60 s timeout). At the start of every cloud session it
shallow-clones the skills repo into a temp directory and copies the wanted skills into
`.claude/skills/`.

| Piece | Where | Why it is there |
| :--- | :--- | :--- |
| The hook | `.claude/hooks/sync-cloud-skills.sh` | Clones and installs the skills. |
| The wiring | `.claude/settings.json` | `SessionStart` / `startup|resume`, `timeout: 60`. |
| The placeholder | `.claude/skills/.gitkeep` | Claude Code only watches a top-level skills directory that existed when the session started. Without it, skills dropped in by the hook need a restart to be discovered. |
| The ignore rules | `.gitignore` | `/push` runs `git add -A`; an un-ignored clone would get committed. `.gitkeep` is negated back in afterwards, because later patterns win. |

Behaviour worth knowing:

- **Local sessions are untouched.** The hook exits 0 immediately unless `CLAUDE_CODE_REMOTE=true`,
  which is set only on cloud session VMs. Locally the symlink already serves the skills, and
  personal skills override project ones.
- **`/watch` is deliberately excluded.** It needs ffmpeg and a local whisper.cpp model the session
  VM does not have. The wanted list is the `SKILLS` variable at the top of the hook.
- **Every copy is stamped `disable-model-invocation: true`**, overwriting whatever value the
  source set rather than only filling in a missing field. Skills arriving this way are
  project-scoped, and project skills are model-invocable — so without the stamp an autonomous
  cloud session (an auto-fix run, a routine) could load `/merge` on its own and merge past the
  human gate. Typing `/push` or `/merge` still works normally. The rewrite touches the frontmatter
  block only, and happens inside the clone, so the skill watcher never sees a half-built
  directory.
- **Each destination is cleared before the copy**, so a skill deleted or renamed upstream cannot
  survive as a stale copy in a resumed session. Only the specific directories in `SKILLS` are
  removed; `.gitkeep` is never touched.
- **It reports honestly and always exits 0.** A skill counts as installed only after its guarded
  `SKILL.md` is verified in place; anything that fails is named, never silently skipped. A clone
  failure prints a one-line diagnosis naming the fix and the session carries on without the
  skills. The hook's stdout becomes context the session can read.

## Operator setup

Nothing to do while `claude-skills` is public — the clone just works.

If the repo is ever made private, a cloud session cannot reach it: the VM's git credential is
proxied and scoped to repositories attached to the session. Set `SKILLS_REPO_TOKEN` in the cloud
environment's variables at claude.ai/code to a read-only fine-grained PAT scoped to that one repo.
The hook feeds it to git through a `-c credential.helper=…` shell helper that reads the token from
the environment rather than embedding it in the clone URL, so it cannot leak into the git error
output the hook prints on failure.

`ROUTISTA_SKILLS_REPO` overrides the source repo (`owner/name`) if it ever moves.

## Why a hook, and not…

- **Committing the skills into `.claude/skills/`** — guaranteed to work with no reachability
  question, but it duplicates the skills into this repo, needs a sync step on every skills change,
  and makes Routista-unrelated personal workflow part of the repo history.
- **Declaring `claude-skills` as a plugin marketplace in `.claude/settings.json`** — the most
  elegant fit on paper, since repo-declared plugins install at session start. But the marketplace
  source must be reachable, so it carries the same reachability question as the clone, and once
  that is answered it buys nothing over the hook while adding plugin-manifest scaffolding to the
  skills repo.
- **Uploading the skills to the claude.ai account** — the only route that also covers Cowork and
  every other repo, and worth doing independently of this. Rejected as the mechanism here because
  uploads accept only the six Agent Skills spec frontmatter fields: `user-invocable` and
  `argument-hint` are hard errors, so it needs a packaging step and a manual re-upload on every
  change, which is exactly the drift the hook avoids.
- **A cloud environment setup script** — runs before Claude Code launches, which would sidestep
  the discovery-timing question the `.gitkeep` solves. But setup scripts are skipped when a cached
  environment exists, freezing the skills at cache-build time, and they live in environment config
  rather than in the repo, invisible to anyone reading the codebase.

The hook keeps the skills repo as the single source of truth, with no copies to keep in sync:
every cloud session clones the latest commit.
