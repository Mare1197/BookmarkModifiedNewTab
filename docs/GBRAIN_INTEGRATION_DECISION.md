# GBrain integration decision

Status: **DECISION DEFERRED**

Date: 20 August 2026

## Recommendation

Do not add GBrain to the runtime yet. Keep the Browser OS shared Dexie model as the
local source of truth and evaluate GBrain later as an explicit, removable connector.
Reconsider a deeper memory layer only after real board/search/relationship workflows
show a measured retrieval or cross-device gap that the local model cannot address.

## Options considered

| Criterion | Connector | Deeper memory layer | Hybrid |
| --- | --- | --- | --- |
| Data ownership | Browser OS remains authoritative; selected bundles leave locally only after an explicit action | GBrain may become authoritative for recall/relationships | Authority is split and requires conflict rules |
| Duplication | Bounded exported source bundles | High: entities, embeddings, edges, and metadata may be copied | Highest unless strict boundaries are enforced |
| Offline behavior | Full local core remains available | Memory-backed workflows may degrade or fail | Local core can remain available, but behavior becomes inconsistent |
| Sync | Optional and explicit | Potentially automatic and cross-device | Complex two-way synchronization |
| Security/privacy | Narrow consent surface and removable credentials | Long-lived remote memory increases exposure and deletion obligations | Both connector and memory risks |
| Runtime/API needs | Small adapter plus export/import contract | Background jobs, identity mapping, retention, deletion, and conflict handling | All of the above |
| User value | Good for deliberate research handoff and recall requests | Potentially high only after sustained use produces enough history | Potentially highest, but currently unproven |
| Complexity | Low to medium | High | Very high |
| Overlap | Complements local search and optional Gemini analysis | Overlaps entities, relationships, search, and analysis records | Requires a formal ownership matrix |

## Required evidence before revisiting

1. At least one repeated workflow where bounded local search and relationship views
   fail to retrieve the needed context.
2. A documented GBrain API/runtime, authentication model, retention policy, export,
   deletion, offline, and cost behavior.
3. An identity mapping proof that preserves Browser OS canonical entity IDs without
   shadow copies.
4. A threat model for remote memory, incognito/private data, credentials, revocation,
   and account deletion.
5. A reversible pilot using explicit source bundles; no silent background upload.

## If a connector pilot is approved

- The user chooses the board/entities to send.
- The export records connector, timestamp, model/runtime, and source entity IDs.
- Returned notes or suggestions are separate analysis entities.
- Suggested relationships remain unconfirmed until accepted.
- Disconnecting GBrain removes credentials and remote access without breaking local
  boards, assets, search, or relationships.
- No sync or deletion of local records is inferred from remote state.

Until those gates are met, GBrain changes no runtime behavior and requires no
additional permission.
