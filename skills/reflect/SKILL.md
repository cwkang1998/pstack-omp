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

Before fanning out, find this conversation's transcript through the host's active history resource, an explicit transcript directory, or `$PSTACK_TRANSCRIPTS_DIR`, in that order. Never scan another workspace or a global vendor history tree.

```bash
ls -t <agent-transcripts>/*.jsonl <agent-transcripts>/*/*.jsonl <agent-transcripts>/*/subagents/*.jsonl 2>/dev/null | head -10
```

That covers the legacy flat (`<id>.jsonl`), current nested (`<id>/<id>.jsonl`), and subagent (`<parent>/subagents/<child>.jsonl`) layouts. For each candidate, read the first JSONL line. Take the file whose `message.content[0].text` contains the conversation's opening user prompt. If none matches, pass a tight digest of the session instead.

## 2. Spawn three reviewers in parallel

Launch three reviewer children concurrently through the host's task facility. Grant each child read access to the transcript and the host tools it needs to look up the tickets, chat threads, and observability traces the transcript references. Forbid file writes in the brief; the parent applies edits. If the host cannot combine read-only repository posture with external-tool access, preserve tool access and enforce no writes in the brief.

Each reviewer and the synthesizer name a role line in `$PSTACK_CONFIG (or .pstack/config.md)` and a default role. Launch each child in its default role. The role line records its model choice, which OMP applies only through its settings, never through a `model` field in the task item; see [Model routing](../pstack-omp/SKILL.md#model-routing). If the configuration or the line is missing, the role's OMP default model runs. An `auto` or `inherit-parent` value runs the child on the parent chat model. Report the resolved model OMP returns for each child, and say so when it fell back from the configured choice. Set each child's reasoning effort for the job through the task runner's effort setting when the host exposes it, per the Delegation section of the **poteto-mode** skill.

| Lens | Role line | Default role | Prompt template |
|---|---|---|---|
| Judgment | `reflect judgment` | `reviewer` | `references/judgment-reviewer.md` |
| Tooling | `reflect tooling` | `researcher` | `references/tooling-reviewer.md` |
| Divergent | `reflect divergent` | `designer` | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in their child reports.

## 3. Synthesize

Launch one child in the `synthesizer` role, with its model from the `reflect synthesizer` line applied the same way. It spot-verifies citations through host tools, so grant those while its standalone brief forbids repository writes. Pass `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. It returns an Accepted / Rejected / Backlog list.

## 4. Structural enforcement check

Move any Accepted item that a lint rule, script, metadata flag, or runtime check would enforce more reliably to Backlog. See the **encode-lessons-in-structure** principle skill.

## 5. Apply

Present the synthesizer's full Accepted / Rejected / Backlog output and wait for explicit approval before applying any Accepted edit. The user picks the subset and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

File each Backlog item to your team's devex or backlog tracker without waiting. Only the Accepted list waits for approval.

Follow each approved row's Routing exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): the parent does it directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): use the host's skill-authoring facility when available and run its draft / test / iterate loop; otherwise apply that loop directly.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): use the host's skill-authoring facility when available, or directly run the same description-review loop.
- `new skill: <kebab-name>`: use the host's skill-authoring facility when available, or author it directly from package conventions. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done.

## 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
