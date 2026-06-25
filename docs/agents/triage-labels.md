# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Existing labels on HenryLiang/cms-ng

`wontfix` already exists on `HenryLiang/cms-ng`; the other four are created on first use by `gh`. They sit alongside existing category labels (`bug`, `backend`, `frontend`, `ai`, `testing`, `quality`, `refactor`, `regression`, `i18n`, …) and priority labels (`P0`/`P1`/`P2` and `priority:high`/`medium`/`low`).
