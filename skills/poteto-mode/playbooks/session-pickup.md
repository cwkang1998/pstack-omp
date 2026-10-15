### Session pickup

**You own the resume point. Read the prior trail, don't redo it.** For "take over this", "resume this conversation", "continue from <session resource>", "you're taking over", "pick up where X left off", a recorded session handoff, or a pushed branch you're meant to continue.

1. Locate the prior trail. Read OMP session history through `history://` resources, a transcript directory passed in `$PSTACK_TRANSCRIPTS_DIR`, a durable handoff or export, or a pushed branch. Never scan another project, unrelated private sessions, or a global transcript tree. Read the metadata overview and last messages first, then scan back for the decision points. Parse a long history through an `explorer` **Bounded session** and keep only the reduced timeline in the main thread (the **principle-guard-the-context-window** skill). Set each child's reasoning effort for the job through the task runner's effort setting when the host exposes it, per the Delegation section.
2. Reconstruct operational state. The branch and worktree, what already landed (`git log`, `git diff` against the base), the open todos, the decisions made. The prior trail is authoritative input. Resist the bias to re-derive it.
3. Diff done vs pending. Compare what shipped against what was planned and name the resume point. Do not redo prior investigation or implementation. Run only the minimum verification needed to validate the inherited head; for a bug fix, that may be the original reproduction. A broad "let me re-derive everything" pass is the tell that you're ignoring the trail.
4. Route the remaining work to the matching playbook and pick the verdict: continue the execution, ship a finished recommendation, ratify or override a prior conclusion, or postmortem a failed run. The pickup playbook ends here; the routed playbook owns the rest.
5. Verify the inherited claims against the original goal on the real artifact (the **principle-prove-it-works** skill). A passing prior self-report is not the proof.

**Reply:** where the prior agent stopped, what you inherited vs redid (ideally nothing redone), the resume point, and the outcome.
