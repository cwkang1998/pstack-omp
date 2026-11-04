---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
disable-model-invocation: true
---

# Reflect

Follow the [portable runtime contract](../pstack-omp/references/runtime.md) for transcript discovery, child roles, model choices, tool access, questions, and skill authoring.

Mine the current conversation for durable learnings, then route them into skill edits.

Invoke when the user says "reflect" or "/reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## 1. Locate the active transcript

Before fanning out, find this conversation's transcript. Search `$PSTACK_TRANSCRIPTS_DIR` when set. Otherwise it is the current session file `$PI_SESSION_FILE`, in this workspace's OMP sessions directory `$(dirname "$PI_SESSION_FILE")`. Read a known session ID through `history://`. Do not glob across `~/.omp/agent/sessions/*/`. That crosses workspace boundaries and reads private chats from unrelated projects.

```bash
ls -t <transcripts-dir>/*.jsonl <transcripts-dir>/*/*.jsonl 2>/dev/null | head -10
```

That covers the session (`<timestamp>_<id>.jsonl`) and subagent (`<timestamp>_<id>/<name>.jsonl`) layouts. For each candidate, read the first JSONL line whose `message.role` is `user`. Take the file whose `message.content[0].text` contains the conversation's opening user prompt. If none matches, pass a tight digest of the session instead.

## 2. Spawn three reviewers in parallel

One message, three `task` calls, each in its lens's default role with MCP access. Reviewers need MCP access to look up the tickets, chat threads, and observability traces the transcript references, and a read-only mode that strips MCPs blocks that.

Each reviewer and the synthesizer name a role line in `$PSTACK_CONFIG (or .pstack/config.md)` and a default role. Spawn each in that role. OMP applies the line's value through its model settings, never a `model` field on the task, and runs the role's default model if the configuration or the line is missing. An `auto` or `inherit-parent` value means the parent model. Report the resolved model OMP returns for each child, and say so when it fell back from the configured choice. If the host task runner rejects a slug, use the default and say so. If it rejects the default, use the closest valid agent for that role from its error message. Set each child's reasoning effort for the job through the task runner's effort setting when the host exposes it, per the Delegation section of the **poteto-mode** skill.

| Lens | Role line | Default role | Prompt template |
|---|---|---|---|
| Judgment | `reflect judgment, divergent, synthesizer` | `reviewer` | `references/judgment-reviewer.md` |
| Tooling | `reflect tooling` | `researcher` | `references/tooling-reviewer.md` |
| Divergent | `reflect judgment, divergent, synthesizer` | `reviewer` | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in the `task` response body.

## 3. Synthesize

One `task` call in the `synthesizer` role, with its model from the `reflect judgment, divergent, synthesizer` line applied the same way and MCP access. It spot-verifies citations through MCP, and a read-only mode that strips MCPs blocks that. Pass `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. It returns an Accepted / Rejected / Backlog list.

## 4. Structural enforcement check

Move any Accepted item that a lint rule, script, metadata flag, or runtime check would enforce more reliably to Backlog. See the **encode-lessons-in-structure** principle skill.

## 5. Apply

Present the synthesizer's full Accepted / Rejected / Backlog output and wait for explicit approval before applying any Accepted edit. The user picks the subset and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

File each Backlog item to your team's devex or backlog tracker without waiting. Only the Accepted list waits for approval.

Never edit a skill under `~/.omp/plugins/`. Before approval, show its destination, `.omp/skills/<skill>/` or `~/.omp/agent/skills/<skill>/`. After approval, copy the skill folder there and edit the copy. Never open a PR or push.

Follow each approved row's Routing exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): the parent does it directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): hand to an installed skill-authoring skill when one exists and run its draft / test / iterate loop, or run that loop directly.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): hand to that skill-authoring skill and run its description-optimization loop, or run that loop directly.
- `new skill: <kebab-name>`: hand creation to that skill-authoring skill, or follow an existing skill's shape. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done.

## 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
