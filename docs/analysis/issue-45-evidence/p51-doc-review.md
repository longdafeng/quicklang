# P5.1 independent design-document review

Read-only review of the three `docs/design/0.7/longterm-*` documents against the current four-table DDL, Rust DTO/repository, import parser, owner-bound import UI and export encoder. No source or design documents were changed.

## Concrete documentation corrections

1. `longterm-branches-integration-plan.md:110` identifies `shared/features/longterm/Workspace.tsx` as the current entry point. The actual file is `src/ui/src/shared/features/longterm/LongtermWorkspace.tsx`.
2. `longterm-branches-integration-plan.md:115` still describes mapping an `unavailable` filter to `paused`. The current client/API exposes only `all`, `due`, and `mastered`; the notebook does not expose a paused filter. This stale mapping should be removed from the current implementation column or explicitly marked historical.
3. `longterm-branches-integration-plan.md:288` says the timezone implementation/regressions are still underway and not claimed passing, whereas the storage design section 10 and the plan's acceptance paragraph correctly report the completed current-baseline timezone regression. The note should distinguish that already-passed work from the new P5.1 import validation now being rerun.
4. Both import sections describe the raw 256-code-point bound and specifically mention only backend normalized-length validation. The parser has now been corrected to enforce the normalized bound before preview as well. Updating the wording to say both frontend and backend validate original and normalized lengths would make the latest fix discoverable. Existing wording is not false, but is incomplete.

## Core design consistency confirmed

- The long-term schema contains only card/session/session_item/event. The docs explicitly distinguish upstream user-document/settings tables from these four tables.
- No source table/API, tombstone, deleted-word marker, aggregate import receipt, extra operation table or batch table is introduced by import.
- Physical deletion removes affected word history and private receipts; unrelated retained receipts contain only their own Add payload. The docs accurately acknowledge that deletion cannot erase external JSON copies and cannot provide indefinite historical exactly-once semantics without retaining forbidden deletion history.
- Export is owner-scoped and produces v2's four arrays. Cards/sessions retain userId, private receipt fields are excluded, and raw answers default to JSON null. Export is distinct from the upstream portable user backup.
- Import selects the current owner rather than trusting file userId. It accepts bounded TXT, export v2 spellings and compact words v1, imports only spellings, preserves existing schedule/version/events, creates immediately-due fresh cards, leaves current review queues unchanged, and rolls back the whole batch on a late error.
- Import preview and confirmation preserve original owner/epoch. Unknown write results are not automatically retried; restored data during a pending write keeps mutual exclusion until settlement, then re-enables controls without publishing the old success.
- The documents correctly separate completed macOS/simulator/compile checks from the still-unverified real iOS picker/provider interaction. They do not use old P6b test totals to claim that new P5.1 functionality has passed the final current run.

Overall: the requested database and import/export design agrees with implementation. The listed corrections are stale identifiers/filter mapping, an inconsistent status sentence, and a recent validation detail; none requires adding a table or changing the product design.
