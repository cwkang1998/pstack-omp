---
name: setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Detects your available models and writes a config file that overrides the skill defaults. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Follow the [portable runtime contract](../pstack-omp/references/runtime.md) throughout this setup.

Write `$PSTACK_CONFIG (or .pstack/config.md)`, the config file that sets pstack's model per role.

## Steps

### 1. Detect available models

Enumerate the `provider/model-id` models OMP routes task agents to in this session, from `modelRoles` and `task.agentModelOverrides`. That is the dependable source. If `omp models` lists the user's available models, prefer it for completeness. If you cannot detect any, ask the user to paste the models they have access to. Never write a real model you have not confirmed is available. `inherit-parent` and `auto` are valid only when OMP can pass the current model to a child.

### 2. Load current state

The default role-to-model mapping is the config shape shown in step 5 below. If `$PSTACK_CONFIG (or .pstack/config.md)` already exists, read it and treat its `# budget` line and its role values as the current choices. Otherwise start from those defaults. A line whose role is not in step 5, such as `how critics`, is from a retired role. Drop it. If the file contains only role aliases the current OMP settings cannot honor, treat those aliases as stale inactive state and start from the detected models.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Prefer structured interaction tool over free text. Offer these four options with these exact labels, and name the current budget when the config records one. With no config, say that `large` matches the skill defaults.

- `unlimited — max reasoning`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Build the working table from the skill defaults, and on a re-run keep any role you changed by family, list, or alias (`inherit-parent`, `auto`). `unlimited`, `large`, `medium`, and `small` set the effort level of every real model, panel entries included, to `max`, `xhigh`, `high`, or `medium`. The effort level is the model's `:level` suffix, on the ladder `max` > `xhigh` > `high` > `medium` > `low`. If the model does not support that level, use its highest supported level at or below the target, else mark the role as needing a choice. `inherit-parent` and `auto` do not change. So `unlimited` turns `<model>:xhigh` into `<model>:max`. A model that tops out at `xhigh` stays at `xhigh` under `unlimited`. `large` keeps the defaults. `small` turns every default into `<model>:medium`.

**(c) Show the roles and confirm.** Show every role with its model, marking any real model not in the detected set as needing a choice. Also list each line step 2 dropped. Ask whether to accept as-is or change specific roles, offering the detected models plus `inherit-parent` and `auto` (both mean: this role runs on the parent chat model) as the options. Prefer structured interaction tool over free text. For panel roles (arena runners, architect runners, interrogate reviewers) the value is a list, and one subagent runs per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena runs one judge. It tries only values from a family other than the parent's, in list order, so order it by preference. An `inherit-parent` or `auto` value never judges. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

If the live session exposes models but no usable task facility, stop model mapping with an explicit capability report naming the missing capability. Say that no pstack role can receive a different model in this session and do not present the portable defaults as an assignment or overwrite an existing role configuration with inactive aliases.

### 4. Validate

Every real model written must be in the detected set. Role aliases pass only when the host task facility documents those aliases. `inherit-parent` and `auto` pass only when the host can pass the current model to a child. If a chosen real model is not available, stop and ask again.

### 5. Write the config

When the host supports per-child selection, write `$PSTACK_CONFIG (or .pstack/config.md)` with a `# budget` line with the chosen label and its target effort, and one line per role, using the same labels poteto-mode uses. Overwrite the whole file so re-runs stay idempotent. Each `<role-model>` default is the model OMP resolves for the agent that role maps to in the `pstack-omp` role map. Shape:

```
# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` or `auto` as a value: the role runs on the parent chat model. Alias entries in a panel list still count toward its fan-out.
# budget: large (xhigh)
feature, refactoring: <implementer-model>:xhigh
bug-fix: <implementer-model>:xhigh
perf-issue: <implementer-model>:xhigh
hillclimb: <implementer-model>:xhigh
judgment and prose: <reviewer-model>:xhigh
hardest tasks: inherit-parent
how explorer: <explorer-model>:xhigh
how explainer: <synthesizer-model>:xhigh
why investigators: <researcher-model>:xhigh
why synthesizer: <synthesizer-model>:xhigh
reflect tooling: <researcher-model>:xhigh
reflect judgment, divergent, synthesizer: <reviewer-model>:xhigh
arena runners: <planner-model>:xhigh, <implementer-model>:xhigh
arena cross-judge pool: <reviewer-model>:xhigh, <planner-model>:xhigh
swarm workers: <implementer-model>:xhigh
architect runners: <planner-model>:xhigh, <implementer-model>:xhigh
interrogate reviewers: <planner-model>:xhigh, <implementer-model>:xhigh
```

OMP routes a child's model through its settings, never through a task `model` field. Map each chosen value into `task.agentModelOverrides` for the agent its role maps to, preserving unrelated keys. Roles that map to the same agent share one model, so when their values differ, ask which one the agent keeps.

### 6. Confirm

Tell the user the config was written and that it applies to new sessions. Re-running this skill updates it. If the session lacks per-child model selection, report that no role configuration was written or activated. Tell the user which model is active and how to switch it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke `/create-verification-skill` (resolves wherever pstack is installed: workspace, user, or plugin). On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill (a project skill that runs a model checker, a proof, or another verifier against the code). If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with /create-formal-verification-skill." On yes, invoke `/create-formal-verification-skill` (resolves wherever pstack is installed: workspace, user, or plugin). On no, move on without pushing.
