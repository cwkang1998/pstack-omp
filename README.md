# pstack-omp

Rigorous engineering workflows for [OMP](https://omp.sh/).

`pstack-omp` is an OMP port of the original
[Cursor pstack](https://github.com/cursor/plugins/tree/main/pstack). It keeps the
upstream workflow catalog, playbooks, principles, references, and verification
scripts while replacing Cursor-only runtime assumptions with an OMP adapter.

## What is included

- The upstream pstack skills and their supporting references.
- Benny's three fail-closed issue-triage/reproduction skills.
- `poteto-mode` for routing work through the right playbook.
- `pstack-omp` for translating roles, delegation, models, transcripts, questions,
  and long-running work to OMP.
- `grill-me`, `grilling`, `grill-with-docs`, `domain-modeling`, and `wizard`
  from [mattpocock/skills](https://github.com/mattpocock/skills). This package
  pins them to one upstream commit. The daily upstream sync does not update them.
  `poteto-mode` routes to `domain-modeling` and `wizard`, and reads the glossary in
  `.pstack/docs/`, through `skills/pstack-omp/references/local-routes.md`. The
  grill skills run only when you ask for them.
- `statechart-dashboard`, a fork-local companion to `statechart`. It builds one
  offline Chrome page from statechart output folders and rebuilds it only when an
  input changed. `poteto-mode` routes to it after a statechart run.
- Native OMP package metadata.
- Daily upstream synchronization that opens a verified pull request.

The original Cursor repository is the content authority. The dsebban repository
was used only as an early structural example; it is not an upstream source.

## Install

Install the public GitHub package:

```bash
omp install https://github.com/weiihann/pstack-omp
```

For local development, load the checkout directly:

```bash
omp --plugin-dir /path/to/pstack-omp
```

Use `omp plugin list` to confirm the package. Remove it with
`omp plugin uninstall pstack-omp`. The package runs with full system access;
review the source before installing and keep it pinned or update it
deliberately.

## Quick start

Start substantial work with `poteto-mode`. Use `pstack-omp` when a workflow
needs delegation or OMP-specific lifecycle behavior.

The runtime adapter maps canonical pstack roles to OMP's bundled task agents
(`scout`, `reviewer`, `security-reviewer`, `task`, `sonic`) and to the
`planner`, `designer`, and `librarian` agents this package ships in `agents/`.
The package also ships an agent for each config line that needs its own model,
such as `pstack-hardest` and the panel seats `pstack-runner-1` to `3`.
Missing integrations are reported honestly and fail closed; for
example, Benny requires an available Slack/tracker/control adapter rather than
pretending those tools exist.

## First-time setup

After installing, start a fresh OMP session in the project you want to work on.
Run the setup skill once:

```text
/skill:setup-pstack
```

It detects the models and task agents your OMP session actually exposes, lets
you choose the defaults for implementation and review work, and writes concrete
`provider/model-id` assignments to `.pstack/config.md` (or to `$PSTACK_CONFIG`
when set). It also writes each agent's model to `task.agentModelOverrides` in
your global OMP config. pstack never names a model on a task call. Before each
spawn it checks that the agent's override matches the config line, and it stops
when they differ.

Then route your first real task through the main workflow:

```text
/skill:poteto-mode add a small feature and prove it works end to end
```

The setup skill may offer to create a project verification skill when the project
has no existing way to exercise the real application. Accept that offer when you
want repeatable behavioral proof; otherwise setup finishes without changing the
project. Read `skills/setup-pstack/SKILL.md` for the complete setup contract.

## Playbooks

[`/skill:poteto-mode`](./skills/poteto-mode/SKILL.md) matches each task to one of
twenty-three playbooks and opens a todo list from its steps.

<details>
<summary>The twenty-three playbooks</summary>

| playbook | for |
|---|---|
| [investigation](./skills/poteto-mode/playbooks/investigation.md) | a read-only question. how does x work, why was y built this way, are we sure. |
| [bug fix](./skills/poteto-mode/playbooks/bug-fix.md) | reproduce a defect, root-cause it, and fix with runtime evidence. |
| [perf](./skills/poteto-mode/playbooks/perf-issue.md) | trace a measured slowness and improve it against a baseline. |
| [hillclimb](./skills/poteto-mode/playbooks/hillclimb.md) | sustained, scientific improvement of one metric against a target, looping hypotheses with before/after measurement and one commit per accepted win. |
| [runtime forensics](./skills/poteto-mode/playbooks/runtime-forensics.md) | diagnose a live symptom (leak, idle-cpu spin, glitch) from instrumentation. |
| [trace forensics](./skills/poteto-mode/playbooks/trace-forensics.md) | diagnose a captured profiling artifact (cpuprofile, trace, spindump, heap snapshot). |
| [feature](./skills/poteto-mode/playbooks/feature.md) | new or changed behavior, built from a named data shape. |
| [refactoring](./skills/poteto-mode/playbooks/refactoring.md) | a behavior-preserving change to structure or shape. |
| [prototype](./skills/poteto-mode/playbooks/prototype.md) | a throwaway sketch to make a design or behavioral decision cheaply, or to settle an empirical fork by observing it. |
| [visual parity](./skills/poteto-mode/playbooks/visual-parity.md) | pixel-exact ui equivalence between two implementations. |
| [authoring a skill](./skills/poteto-mode/playbooks/authoring-a-skill.md) | writing or editing a SKILL.md. |
| [eval](./skills/poteto-mode/playbooks/eval.md) | test how a skill or prompt change affects agent behavior, blinded. |
| [babysit](./skills/poteto-mode/playbooks/babysit.md) | drive a pr or a stack to merge-ready: conflicts, review threads, ci. |
| [shipping](./skills/poteto-mode/playbooks/shipping.md) | independently verify a green stack, then land the contiguous verified run bottom-up through github by default or origin when available. |
| [autonomous run](./skills/poteto-mode/playbooks/autonomous-run.md) | drive a long task to completion without stopping. |
| [orchestrate](./skills/poteto-mode/playbooks/orchestrate.md) | a standing project handed to one coordinator chat: multi-day, many stacked prs, fleets of subagents. |
| [autopilot-full](./skills/poteto-mode/playbooks/autopilot-full.md) | run independent prs to merged with one owner per pr. a swarm verifies each code-ready head, and every later change to the patch gets a fresh check. |
| [autopilot-stack](./skills/poteto-mode/playbooks/autopilot-stack.md) | autopilot-full without the merge. build and verify prs for the operator to review and land, stacking a pr only on a pr it builds on. |
| [session pickup](./skills/poteto-mode/playbooks/session-pickup.md) | resume or take over a prior agent's in-flight work. |
| [pause safely](./skills/poteto-mode/playbooks/pause-safely.md) | suspend in-flight work cleanly so it can be resumed later. |
| [multi-phase plan](./skills/poteto-mode/playbooks/multi-phase-plan.md) | work that spans phases or stacked PRs. |
| [worktree cleanup](./skills/poteto-mode/playbooks/worktree-cleanup.md) | reclaim disk by pruning merged or abandoned worktrees and stale ios simulators, safety-gated. |
| [opening a pr](./skills/poteto-mode/playbooks/opening-a-pr.md) | open a ready pr from small ordered commits with a conventional commits title and a briefing-style body. invoked at the end of every other playbook. |

</details>

## Skills

`/skill:poteto-mode` runs most of these when a step needs them. Use the table when
you want one directly.

<details>
<summary>All skills</summary>

| skill | use it when |
|---|---|
| [`/skill:poteto-mode`](./skills/poteto-mode/SKILL.md) | default entry point for any non-trivial task. |
| [`/skill:poteto-help`](./skills/poteto-help/SKILL.md) | you're new to pstack, or unsure which skill, playbook, or principle fits. finds out what you're trying to do, answers that part, and hands you a prompt to type. runs only when you type `/skill:poteto-help`. |
| [`/skill:in-your-own-words`](./skills/in-your-own-words/SKILL.md) | you want the agent to play back your goal and the problem before it starts. runs only when you type `/skill:in-your-own-words`. |
| [`/skill:sharpen`](./skills/sharpen/SKILL.md) | you want a prompt made deeper, not bigger, before you send it: what a top professional would do that you didn't ask for, the raw material they'd start from, their methods and tools, and an outside check that the result is right. hands back the rewritten prompt, which asks the agent to prototype any choice an experiment can settle and leaves product and preference choices to you. doesn't do the task. runs only when you type `/skill:sharpen`. |
| [`/skill:how`](./skills/how/SKILL.md) | you want a walkthrough of how a subsystem works. |
| [`/skill:why`](./skills/why/SKILL.md) | you want to know why something was built this way. answers from the record, not the code: the commits and pr discussions that introduced it and each later change, and other sources when that trail is thin. cites what the authors wrote, marks its own inferences, and says what the record does not answer. |
| [`/skill:recall`](./skills/recall/SKILL.md) | you're starting or resuming work and want your recent context on a topic rebuilt from your own chat history and the shared record, handed back as a tight current-state brief. |
| [`/skill:ketchup`](./skills/ketchup/SKILL.md) | you want what changed in this chat since your last message, in plain words and small visuals, with every item waiting on you listed and decidable from the reply alone, even when that makes the reply long. |
| [`/skill:ketchup-video`](./skills/ketchup-video/SKILL.md) | you want the `/skill:ketchup` catch-up as a short subtitled video of slides, with the calls waiting on you as text under it. |
| [`/skill:blast-radius`](./skills/blast-radius/SKILL.md) | you have a small-looking change and want to know what else it could break, with the one fact it's safe because of proven by running code, not asserted. |
| [`/skill:architect`](./skills/architect/SKILL.md) | you're about to write code that crosses a function boundary and want the caller's usage, types, and module shape settled first. |
| [`/skill:arena`](./skills/arena/SKILL.md) | you want N parallel attempts at the same thing, then to grab the best parts of each. |
| [`/skill:swarm`](./skills/swarm/SKILL.md) | you want N parallel workers across different slices or races, then one aggregated report. |
| [`/skill:interrogate`](./skills/interrogate/SKILL.md) | you have a diff and want different models to try to break it, keeping only findings a run proves. |
| [`/skill:automate-me`](./skills/automate-me/SKILL.md) | you want your own `-mode` skill, drafted from how you've actually worked. |
| [`/skill:make-bot-ui`](./skills/make-bot-ui/SKILL.md) | you want a page or dashboard whose buttons wake a Grok Bot over a webhook, including the sender-key handoff and Tailscale. |
| [`/skill:setup-pstack`](./skills/setup-pstack/SKILL.md) | you want to pick which models pstack uses per role. detects your models and writes a config rule. |
| [`/skill:reflect`](./skills/reflect/SKILL.md) | a long task landed and you want the recipe captured as a skill edit. |
| [`/skill:correct`](./skills/correct/SKILL.md) | you keep correcting agents for the same mistakes. mines history for mistake classes, fixes each at the highest level that works (architecture, then types, lint, and ci, then tests, with docs last), and keeps a table pairing each rule with what enforces it. |
| [`/skill:teach`](./skills/teach/SKILL.md) | you want to actually understand a change or subsystem, not just have it summarized. runs how + why and weaves one plain explanation, built up diagram by diagram. |
| [`/skill:tdd`](./skills/tdd/SKILL.md) | you're fixing a bug and there's a cheap local test path. write the failing test first, then the fix. |
| [`/skill:benchmark-checklist`](./skills/benchmark-checklist/SKILL.md) | you ran a benchmark or measured a speedup or regression. vets the number (limiter, tuning, errors, repeat runs, end-to-end relevance) before you report or act on it. |
| [`/skill:no-comments`](./skills/no-comments/SKILL.md) | strip comments before review; spawns Comment Sicko, fixes accepted findings, offers encodings for claimed constraints. |
| [`/skill:typescript-best-practices`](./skills/typescript-best-practices/SKILL.md) | you're reading or editing typescript. grounds the type-system-discipline principle in syntax. |
| [`/skill:figure-it-out`](./skills/figure-it-out/SKILL.md) | no bundled playbook fits. designs a rigorous, auditable playbook for the task. |
| [`/skill:show-me-your-work`](./skills/show-me-your-work/SKILL.md) | you want a reviewable decision trail. logs decisions to a tsv you can commit. |
| [`/skill:create-verification-skill`](./skills/create-verification-skill/SKILL.md) | your project has no scripted way to prove app behavior. generates a project-local verify skill with a feature map, for any language or platform. |
| [`/skill:maintain-verification-skill`](./skills/maintain-verification-skill/SKILL.md) | your verify skill's feature map has drifted from the app. source wave + one live pass, at most one PR of proven corrections. |
| [`/skill:create-formal-verification-skill`](./skills/create-formal-verification-skill/SKILL.md) | tests can't reach the case that breaks a race, retry, state machine, parser, or unsafe code. verifies one property with the tool that fits and generates a project-local skill to recheck it on every change. |
| [`/skill:maintain-formal-verification-skill`](./skills/maintain-formal-verification-skill/SKILL.md) | code your formal verification covers has changed since it was last checked. updates the model, harness, or properties to match the code, reruns, and says whether each failure is drift in the verification or a bug in the code. |
| [`/skill:statechart`](./skills/statechart/SKILL.md) | someone who owns the behavior needs to see it, not read a spec. checks a tla+ model, draws what the user sees as a mermaid statechart, marks each state that breaks a rule, and gives the shortest path to each one. |
| [`/skill:unslop`](./skills/unslop/SKILL.md) | you're cleaning up writing. removes AI tells. |
| [`/skill:bro`](./skills/bro/SKILL.md) | you want the last message restated in plain human language, no jargon. |
| [`/skill:technical-writing`](./skills/technical-writing/SKILL.md) | layered doc standard (Diátaxis + Google developer style + STE + Global English) for docs, RFCs, readmes, PR descriptions, commit messages. |
| [`/skill:pstack-omp`](./skills/pstack-omp/SKILL.md) | a workflow needs delegation or OMP lifecycle behavior. maps pstack roles to OMP task agents and pins each config line to its own agent. `poteto-mode` reads it for you. |
| [`/skill:orchestrate-omp`](./skills/orchestrate-omp/SKILL.md) | you want parallel discovery, specialist review, or partitioned implementation across OMP subagents. |
| [`/skill:statechart-dashboard`](./skills/statechart-dashboard/SKILL.md) | you ran `/skill:statechart` and want every chart with its rules, report, spec, and notes in one offline Chrome page. |
| [`/skill:domain-modeling`](./skills/domain-modeling/SKILL.md) | you're settling codebase terminology, editing a GLOSSARY.md, or recording an ADR. |
| [`/skill:grill-me`](./skills/grill-me/SKILL.md) | you want a relentless interview to sharpen a plan or design. runs only when you ask. |
| [`/skill:grill-with-docs`](./skills/grill-with-docs/SKILL.md) | the `/skill:grill-me` interview, writing the glossary and ADRs as it goes. |
| [`/skill:grilling`](./skills/grilling/SKILL.md) | the interview the grill skills load. runs only when you ask to be grilled. |
| [`/skill:wizard`](./skills/wizard/SKILL.md) | a step only a human can do, such as provisioning, credentials, CI secrets, or a third-party dashboard. generates an interactive bash walkthrough. |
| [`/skill:rust-best-practices`](./skills/rust-best-practices/SKILL.md) | you're reading or editing rust. |
| [`/skill:setup-benny`](./skills/setup-benny/SKILL.md) | you're installing benny, or changing its slack, tracker, repository, routing, control, model, or budget settings. |
| [`/skill:triage-issue-reports`](./skills/triage-issue-reports/SKILL.md) | benny's triage automation runs it on a slack issue report. not for direct use. |
| [`/skill:reproduce-and-fix-issues`](./skills/reproduce-and-fix-issues/SKILL.md) | benny's repro automation runs it on a triaged bug. not for direct use. |

</details>

## Principles

Twenty-four short skills, one principle each. `poteto-mode` indexes them inline
and reads that index at task start.

<details>
<summary>All twenty-four principles</summary>

| principle | group | rule |
|---|---|---|
| [laziness-protocol](./skills/principle-laziness-protocol/SKILL.md) | core | Bias toward deletion and the smallest change that solves the problem. |
| [foundational-thinking](./skills/principle-foundational-thinking/SKILL.md) | core | Apply before writing logic: choosing core types and data structures, sequencing scaffold-vs-feature work, asking what concurrent actors share. Get the data structures right so downstream code becomes obvious. |
| [redesign-from-first-principles](./skills/principle-redesign-from-first-principles/SKILL.md) | core | Redesign as if the requirement had been a foundational assumption from day one, instead of bolting it on. |
| [attack-the-premise](./skills/principle-attack-the-premise/SKILL.md) | core | Apply when two or more fixes that share one premise have failed the same gate. Write the premise down and test it directly before you write another fix that assumes it. |
| [subtract-before-you-add](./skills/principle-subtract-before-you-add/SKILL.md) | core | Remove dead weight, redundant validators, and stub references first, then build on the simpler base. |
| [minimize-reader-load](./skills/principle-minimize-reader-load/SKILL.md) | core | Count layers between question and answer, and hidden state in the reader's head; collapse one-caller wrappers and shrink mutable scope. |
| [outcome-oriented-execution](./skills/principle-outcome-oriented-execution/SKILL.md) | core | Apply during planned rewrites and migrations with explicit phase boundaries. Converge on the target architecture; don't preserve smooth intermediate states with throwaway compatibility code. |
| [experience-first](./skills/principle-experience-first/SKILL.md) | core | Choose user delight over implementation convenience; ship fewer polished features over more rough ones. |
| [exhaust-the-design-space](./skills/principle-exhaust-the-design-space/SKILL.md) | core | Build 2-3 competing prototypes and compare side by side before committing. |
| [build-the-lever](./skills/principle-build-the-lever/SKILL.md) | core | Apply to any non-trivial work, not just bulk work: edits, migrations, analyses, checks. Build the tool that does it or proves it (codemod, script, generator, or a skill your subagents follow) instead of working by hand. The tool is the artifact a reviewer can rerun. |
| [model-the-domain](./skills/principle-model-the-domain/SKILL.md) | architecture | Encode the domain in a structure instead of scattered conditionals. |
| [boundary-discipline](./skills/principle-boundary-discipline/SKILL.md) | architecture | Concentrate guards at system boundaries (CLI, config, network, external APIs); trust internal types and keep business logic in pure functions. |
| [type-system-discipline](./skills/principle-type-system-discipline/SKILL.md) | architecture | Make illegal states unrepresentable, brand semantic primitives, parse external data at boundaries, exhaust variants, derive from authoritative schemas. |
| [make-operations-idempotent](./skills/principle-make-operations-idempotent/SKILL.md) | architecture | Converge to the same end state regardless of partial prior runs. |
| [migrate-callers-then-delete-legacy-apis](./skills/principle-migrate-callers-then-delete-legacy-apis/SKILL.md) | architecture | Migrate callers and delete the old API in the same wave instead of preserving compatibility layers. |
| [separate-before-serializing-shared-state](./skills/principle-separate-before-serializing-shared-state/SKILL.md) | architecture | Eliminate the sharing first; serialize structurally only when one shared writer is a real invariant. |
| [prove-it-works](./skills/principle-prove-it-works/SKILL.md) | verification | Apply after completing a task, before declaring done. Verify against the real artifact (run the feature, read the actual value, inspect the diff), not a proxy, self-report, or 'it compiles.'. |
| [fix-root-causes](./skills/principle-fix-root-causes/SKILL.md) | verification | Trace each symptom back to the first place the system went wrong and fix it there. A guard is a fix only when the state it handles is legitimate. |
| [sequence-verifiable-units](./skills/principle-sequence-verifiable-units/SKILL.md) | verification | Apply to multi-step work (sweeps, migrations, runs of similar edits) and to how you stack commits and PRs. Break work into small units that each end in a verifiable state, check each before the next, and order delivery so the sequence proves itself to a reviewer. |
| [test-behavior-not-implementation](./skills/principle-test-behavior-not-implementation/SKILL.md) | verification | Apply when you write, change, or keep a test. Assert what the code's users can observe, so the test fails when that behavior breaks and keeps passing when only the internals change. |
| [explain-the-number](./skills/principle-explain-the-number/SKILL.md) | verification | Apply before you trust, report, or act on a number you measured: a speedup, a regression, a throughput, a latency, or an eval result. Find what limits it, and rule out that it measured something other than the work you think. |
| [guard-the-context-window](./skills/principle-guard-the-context-window/SKILL.md) | delegation | Route bulk to subagents; keep summaries in the main thread, not raw payloads. |
| [never-block-on-the-human](./skills/principle-never-block-on-the-human/SKILL.md) | delegation | Proceed, present the result, let the human course-correct after the fact; reserve confirmation for irreversible actions. |
| [encode-lessons-in-structure](./skills/principle-encode-lessons-in-structure/SKILL.md) | meta | Encode the rule as a lint, metadata flag, runtime check, or script instead of more text. |

</details>

## Agents

The adapter routes pstack roles to OMP's bundled task agents and to these agents.
Each `pstack-*` agent carries one line of the model config and runs on that line's
model through `task.agentModelOverrides`.

| agent | role |
|---|---|
| [`planner`](./agents/planner.md) | technical planning, architecture, decomposition, and sequencing. |
| [`designer`](./agents/designer.md) | visual, interaction, and product design. |
| [`librarian`](./agents/librarian.md) | read-only, source-verified research on external libraries, APIs, protocols, and repository history. |
| [`poteto-agent`](./agents/poteto-agent.md) | runs one delegated implementation brief under the active playbook. |
| [`comment-sicko`](./agents/comment-sicko.md) | read-only comment reviewer. `/skill:no-comments` spawns it. |
| [`pstack-hardest`](./agents/pstack-hardest.md) | the `hardest tasks` line. |
| [`pstack-judgment`](./agents/pstack-judgment.md) | the `judgment and prose` line. |
| [`pstack-reflect-tooling`](./agents/pstack-reflect-tooling.md) | the `reflect tooling` line. read-only. |
| [`pstack-swarm-worker`](./agents/pstack-swarm-worker.md) | the `swarm workers` line. |
| [`pstack-runner-1`](./agents/pstack-runner-1.md) | entry 1 of the runner lines. |
| [`pstack-runner-2`](./agents/pstack-runner-2.md) | entry 2 of the runner lines. |
| [`pstack-runner-3`](./agents/pstack-runner-3.md) | entry 3 of the runner lines. |
| [`pstack-judge-1`](./agents/pstack-judge-1.md) | entry 1 of the `arena cross-judge pool` line. read-only. |
| [`pstack-judge-2`](./agents/pstack-judge-2.md) | entry 2 of the `arena cross-judge pool` line. read-only. |
| [`pstack-judge-3`](./agents/pstack-judge-3.md) | entry 3 of the `arena cross-judge pool` line. read-only. |

## Automatic upstream updates

`.github/workflows/upstream-sync.yml` checks the original pstack `main` branch
every day at 04:17 UTC and can also be started manually. The pinned baseline lives
in `upstream.lock.json`.

The updater:

1. Fetches the latest upstream revision.
2. Normalizes known Cursor runtime bindings for OMP.
3. Three-way merges every file against the pinned upstream, so OMP edits survive
   and upstream edits land around them.
4. Leaves conflict markers where upstream and the OMP port changed the same
   lines, and exits with status 2 until they are resolved.
5. Runs the manifest, package, docs, updater, and skill script checks, the Bun
   tests, and strict TypeScript checking.
6. Opens a pull request only after those checks pass.

Run it locally:

```bash
npm run sync:check
npm run sync:apply -- --dry-run
npm run sync:apply
```

Protected adaptation changes require a human merge decision. The updater never
silently overwrites them.

## Development and verification

npm run validate
npm run verify
npm run check:docs
npm run test:sync
npm install --no-save --prefix skills/statechart/scripts
npm run test:skills
bun install --cwd skills/poteto-mode/scripts --frozen-lockfile
bun test watch-pr check-plan.test.ts
bunx tsc --project skills/poteto-mode/scripts/watch-pr/tsconfig.json --noEmit --strict
bun install --cwd skills/statechart-dashboard/scripts --frozen-lockfile
bun test skills/statechart-dashboard/scripts
```

`.github/workflows/validate.yml` runs these on every pull request and on pushes to
`main`. The scripts follow the checks upstream runs in `cursor/plugins`.

`npm run validate` checks the OMP manifest in `package.json`: a kebab-case name, a
semantic version, an `omp` manifest, and that every path it declares exists. OMP
publishes no manifest schema, so these are the fields its plugin loader reads.

`npm run check:docs` checks this README against the tree. Every `/skill:` command
and relative link must resolve, anchors must match a heading, counts such as
"twenty-three playbooks" must match, and the README must link every skill,
playbook, and agent. A new skill needs a row in the tables above.

`npm run test:skills` runs every `skills/*/scripts/test/*.test.ts` suite with
Node's test runner.

`npm run verify` checks that every skill and agent has matching frontmatter, that
links, `skill://` references, and named skills resolve, and that no merge
conflict markers remain. It also checks that the adapter's Model routing table
covers exactly the config lines `setup-pstack` writes, routes only to agents in
its roster, and that an agent made for one config line names no model but its
own override.

## Host contract

Read `skills/pstack-omp/references/runtime.md` before adapting a workflow. It
defines canonical roles, capability mapping, configuration paths, transcript
handling, interaction fallbacks, and verification ownership for OMP.

## License and attribution

MIT. See `LICENSE` and `THIRD_PARTY_NOTICES.md`.

The pstack-derived material is adapted from Lauren Tan's original work in
`cursor/plugins`. See `THIRD_PARTY_NOTICES.md` for attribution and license text.
