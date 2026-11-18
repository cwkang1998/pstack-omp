---
name: pstack-profile
description: 'Save and switch pstack model profiles. Use for "switch pstack profile", "use the gpt config", or "save my pstack setup as X".'
---

# Pstack profiles

Run the command from the project directory. Use this skill's directory for `<skill dir>`.

```sh
bun "<skill dir>/scripts/pstack-profile.ts" list
bun "<skill dir>/scripts/pstack-profile.ts" save NAME
bun "<skill dir>/scripts/pstack-profile.ts" diff NAME
bun "<skill dir>/scripts/pstack-profile.ts" use NAME
```

- `list` marks profiles that match both the current role config and OMP overrides.
- `save` writes the current role config and any overrides not covered by a role.
- `diff` previews per-agent override changes, including removed panel seats.
- `use` applies the profile. It keeps unlisted non-seat overrides and drops unlisted panel seats. Changes apply to new sessions.

Profiles are named `NAME.md` in `$PSTACK_PROFILES_DIR` or the `profiles/` directory next to `$PSTACK_CONFIG`. If `$PSTACK_CONFIG` is unset, the role config is `.pstack/config.md`.

To build a new profile from scratch, run [`/skill:setup-pstack`](../setup-pstack/SKILL.md), then `save NAME`.
