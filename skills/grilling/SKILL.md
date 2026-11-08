---
name: grilling
description: "Grill the user relentlessly about a plan, decision, or idea. Use only when the user explicitly asks to be grilled, such as 'grill me' or 'grill this plan', or when grill-me or grill-with-docs loads it. Never start it on your own judgment."
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round, then wait for the user's answers before the next round.

Ask each round as one call to OMP's `ask` tool that holds every frontier question, so the user answers the whole round in one form. Build each question like this:

- `id`: a short slug for the decision, such as `storage-engine`. Reuse it when the decision comes back in a later round.
- `header`: the question title in two or three words.
- `question`: the full question, with the context the user needs to decide it.
- `options`: two to five concrete answers. Each `description` names that answer's tradeoff. Put a sketch, schema, or code shape in `preview` when seeing it helps the choice. Never add an "Other" option, since the form adds a free-text answer itself. When the question has no short list of plausible answers, such as a name or a date, pass `options: []` so the form shows only the free-text answer.
- `recommended`: the index of your recommended answer. When `options` is empty, leave it out and end the `question` text with your suggested answer instead.
- `multi: true` only when several answers can hold at once.

Before the call, post a short reply that says what the last round settled and shows anything the form can't hold, such as a diff or a long draft. Keep the reasoning for each recommendation in its option's `description` rather than in the reply.

Read every answer before you recompute the frontier:

- A free-text answer or a note is the user's decision. When it leaves the decision open, ask it again next round, reworded around what the user said.
- An answer marked `auto-selected after timeout` is not a decision. Ask it again next round.
- When the user picks "Chat about this", settle those questions in ordinary replies, then go back to `ask` rounds.
- A cancelled form ends your turn and settles nothing. On the user's next message, ask in an ordinary reply whether to resume the rounds.

When the session has no `ask` tool, as in headless or print mode, post each round as an ordinary reply instead. Number each question and give your recommended answer, worded so that "yes" accepts it:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one. When a settled decision reopens, every decision that depends on it, directly or through another decision, reopens with it, because its answer assumed the old one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a fresh canonical `explorer` subagent per the [portable runtime contract](../pstack-omp/references/runtime.md) to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Post every settled decision as one summary, then confirm it with a single `ask` question offering "Confirmed" and "Something's off". Do not act on it until the user confirms you have reached a shared understanding. "Something's off" reopens each decision the user names, and with it every decision that depends on it, then the rounds continue from there.
