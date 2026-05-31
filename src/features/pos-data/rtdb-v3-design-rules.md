# RTDB V3 Design Rules

Scope: every new RTDB resource under `src/features/pos-data/`.

## Must

1. Define shard boundary first.
   - No new feature may use table root or month root as generic source of truth when smaller canonical shards are possible.
   - Live table canonical shards are `summary`, `draft`, `pendingBatches`, `submittedBatches`.

2. Define revision path for every cacheable resource.
   - Revision is only invalidation source.
   - Multi-location write must update data path and matching revision path in same write.
   - Live counter transactions are allowed only on summary child counters like `nextRequestSeq` and `nextSplitCounter`.

3. Register cache descriptor before use.
   - Use resource registry helpers.
   - Descriptor owns `resourceKey`, `remotePath`, `revision.path`, and `codec`.
   - Unregistered descriptors are invalid by contract and tests.

4. Read flow must be cache-first + revision-preflight.
   - Hydrate local cache first.
   - Read revision node.
   - Refetch body only when revision changed or cache decode failed.

5. Write flow must be small-write command.
   - Each command lists exact shard reads and exact shard writes.
   - Do not rebuild/write unrelated sibling shards.
   - Do not subscribe `on('value')` to live table root.
   - Do not `once('value')` live table root for normal flows.

6. Persisted DTO must stay storage-oriented.
   - App model naming stays readable.
   - Storage boundary may compact keys or remove duplication.
   - History closed order stores `entries` as source of truth; root `lines` is legacy-read fallback only.

7. Generated RTDB entity keys must use the shared short-id helper.
   - Only opaque generated IDs may be converged here: entry, batch, order, attendance record, and entry-local line IDs.
   - Do not embed timestamps, source/status prefixes, item ids, or parent ids into generated RTDB keys.
   - Business keys stay readable and stable; only generated internal identifiers are compacted.
   - Entry-local line keys must stay local to one entry, using `m` for main and `c..` for children.

## Required Tests

- Contract/path audit for forbidden root reads/subscriptions/transactions.
- Warm-cache reuse when revision unchanged.
- Partial invalidation when one revision changes.
- Cache corruption self-heal.
- Payload budget assertion for affected hot path when write shape changes.
- Generated ID shape/path budget assertion when write path keys change.

## Review Gate

If change adds RTDB resource and does not also add shard + remote path + revision + cache + contract test evidence, change is incomplete.
