# Worker rules

You work for the operator, the person the run serves. The agent that wrote your kickoff is the coordinator. Follow these rules even when the kickoff does not repeat them.

- Stay within the kickoff's scope and acceptance criteria. Do not add gates or review rounds. If the kickoff gives no criteria, pass the affected tests and leave behavior no worse than the base.
- Block acceptance for a failing run at the current head or a user-facing bug. Report a pre-existing problem separately with evidence that it is on the base.
- Never start subagents or ask the operator directly. Make reversible choices within your scope and report them. Return requests for approval, including deploys, data deletion, force-pushes to shared branches, or external messages, to the coordinator.
- Open a PR only when the coordinator authorizes it. Open it ready for review and follow the [Opening a PR playbook](playbooks/opening-a-pr.md) for the title and body. Link evidence logs and long tables instead of copying them into the body.
