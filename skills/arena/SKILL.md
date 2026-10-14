---
name: arena
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
---

# Arena

Follow the [portable runtime contract](../pstack-omp/references/runtime.md) for child briefs, parallel execution, panels, models, and fallbacks.

Track one checklist entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything. Use the host's planning facility when available; otherwise keep a compact checklist in the conversation or project-local decision trail. The arena runs autonomously and the list keeps phases from silently disappearing.

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric, 3-6 concrete gradeable criteria for what success looks like on *this* task. It is the picker's tool in Phase D. Candidates only see the task.
3. Pick the runners. Use the `arena runners` line in `$PSTACK_CONFIG (or .pstack/config.md)`. If the configuration or that line is missing, use a diverse host-supported panel drawn from the canonical `designer`, `planner`, and `reviewer` roles and `inherit-parent`; the active adapter maps each role to an agent, and the live host inventory wins. An `auto` or `inherit-parent` entry in this line or the cross-judge line runs that seat on the parent chat model, with no explicit model choice. If the host task runner rejects a configured entry, run that seat on its family's default and say so. Families go by canonical role: an entry belongs to the role it fills, and that role is its default. With no family match, use `inherit-parent`. If it rejects a default, use the closest live agent the host exposes for that role. Spawn more runners when the arena covers multiple design directions. Repeating one choice N times is valid when the work is generation-bound rather than judgment-sensitive. Set each child's reasoning effort for the job through the task runner's effort setting when the host exposes it, per the Delegation section of the **poteto-mode** skill.
4. Give each candidate its own output location (a git worktree where possible, otherwise `/tmp/arena-<slug>/candidate-<n>/`), per the **separate-before-serializing-shared-state** principle skill.

## Phase B: Fan out

Launch all N children in one batch through the host task runner. Give each a standalone brief with the task, the path to the shared grounding, its own output path, acceptance criteria, verification, forbidden scope, and instructions to produce the artifact and a short rationale naming the alternatives it considered and what it rejected.

If a candidate produces no output, proceed with N-1 and note the dropout.

## Phase C: Cross-judge

After all Phase B candidates complete, choose one entry from the `arena cross-judge pool` line in `$PSTACK_CONFIG (or .pstack/config.md)`. If the configuration or that line is missing, use the canonical `reviewer` role or `inherit-parent`. Prefer a different model family from the parent's when the host exposes model identity. Launch one read-only judge child on that choice. It sees the rubric and the candidates by path label, scores each criterion, and recommends a base with rationale. It runs in parallel with your reading in Phase D. Don't launch it while candidates are still writing; it would see partial or empty outputs and report them as dropouts.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the Laziness Protocol.

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per the **redesign-from-first-principles** principle skill, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, per the **prove-it-works** principle skill. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

## Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.
