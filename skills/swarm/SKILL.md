---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

# Swarm

Follow the [portable runtime contract](../pstack-omp/references/runtime.md) for worker roles, concurrent execution, models, writable isolation, and unavailable-capability fallbacks.

## Start

Open a todolist with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Start workers on the agent the Model routing section of the **pstack-omp** skill names for the `swarm workers` line in `$PSTACK_CONFIG (or .pstack/config.md)`. If the configuration or that line is missing, use the canonical `implementer` role. If that section's check stops a spawn, or the spawn fails, stop and report it. For a model race, start each arm on the seat agent for its model, per the same section. Set each child's reasoning effort for the job through the task runner's effort setting when the host exposes it, per the Delegation section of the **poteto-mode** skill.
4. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

## Phase B: Fan out

Spawn all N workers in one message on the agent the Model routing section of the **pstack-omp** skill names for the `swarm workers` line. For a model race, start each arm on a runner seat whose override names its model, per the same section, check each returned model identity, and stop when no seat runs a model the race needs. Set `isolated: true` when the task runner exposes `isolated`. Otherwise give each writer its own worktree or output path, or report that isolation is unavailable. Use `isolated: false` only when the worker needs access to something in the user's live checkout.

When a worker must start from a non-default pushed branch, name that branch in its brief.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

## Phase D: Report

Return one consolidated in-chat report with a result table, issue one-liners, gaps or dropouts, and the race rule when used.
