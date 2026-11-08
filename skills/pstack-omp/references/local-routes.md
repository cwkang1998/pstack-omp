# Fork-local routes

The **poteto-mode** skill reads this file through its fork-local routes trigger. Each route sends work to a skill that this fork adds to upstream pstack. The upstream sync never writes this file.

- The project has `.pstack/docs/GLOSSARY.md` or `.pstack/docs/GLOSSARY-MAP.md` → read it before the first plan, design, explanation, or new name. Use its terms in code, plans, PR text, and replies, and never a word it lists under `_Avoid_`. Put its path in every child brief.
- A task asks why something is built the way it is, or changes a past decision → read the ADRs in `.pstack/docs/adr/`. Read these paths directly, because search tools that skip hidden directories, such as `rg` without `--hidden`, miss `.pstack/`.
- Code adds or renames a domain term, or makes a decision that is hard to reverse, surprising without context, and the result of a real tradeoff → the **domain-modeling** skill. It updates `.pstack/docs/GLOSSARY.md` when the term settles, or offers an ADR in `.pstack/docs/adr/` for the decision.
- A step only the human can perform, such as a third-party dashboard, a credential, a CI secret, or a one-off cutover → the **wizard** skill. Generate the wizard instead of writing the steps into the reply.

`grilling`, `grill-me`, and `grill-with-docs` have no route. They run only when the operator explicitly asks to be grilled.
