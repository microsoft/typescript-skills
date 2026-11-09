---
name: typescript-update
description: Guidance for updating to the newer versions of TypeScript. Use this when you need to upgrade TypeScript or as part of a larger dependency update process.
---

<!-- prettier-ignore-start -->

Upgrade to the requested target (latest 7.x if unspecified), preserving effective baseline safety, runtime/output semantics and persisted installation. This governs **every guide**: no lower-target or suppression escape hatch. In unattended runs, finish safe work and [summarize](#summarize) unresolved blockers as incomplete, without questions.

## How To Upgrade

1. **Inventory and preflight.** Reuse one manifest/config scan as a compact **ownership ledger**:
   - Enumerate every requested declaration (manifest, section, CLI/API/emit role) and workspace/standalone example/test root. Link rows to group-level old → target maps: ambient environment, module/resolver, strictness, source/output roots, controlling generator/policy, install/tool graph, owners, peers, locks and covering gates. Group by actual environment/policy, not inherited filename alone; no prose dossier per directory.
   - Private transitive compilers and intentional historical consumer fixtures stay unchanged unless they own or break a requested gate. There is **no global “zero TS5 in the lockfile” goal**; requested examples are not exempt.
   - [Probe the exact launcher and declared build hosts](6to7.md#upgrade-checklist) before expensive baseline work or bulk edits.
2. **Baseline once.** Reuse `node_modules`, otherwise do one frozen non-interactive baseline install. Run bounded owned build/typecheck/test/lint gates after generated prerequisites; record directory/config/compiler/host coverage and first-failure signatures. Untested failures remain unverified, not pre-existing; no unchanged failing-gate retries.
3. **Read sibling guides directly before editing.** Always read [6to7.md](6to7.md); start with [TS6 defaults/removals](5to6.md#typescript-60-migration) if crossing 6, [4to5.md](4to5.md) if below 5. An external-search miss does not mean a sibling is absent. Choose layout via the [API-consumer check](6to7.md#does-the-project-need-the-typescript-api); close one real representative transaction per group before propagation. Simple current-runtime apps without API consumers keep the direct plain-target path, without API checks.
4. **Batch migration by config/ambient/policy group**, including generated/test/example configs. Apply TS6 defaults/removals even when jumping to 7; preserve effective safety, emitted paths and published `types`/exports. Update `@types/*` within supported runtime/dependency majors; repair required API tools, not unrelated dependencies.
5. **Propagate only proven groups and install.** Build required generated prerequisites, then obtain one fresh non-bailing target diagnostic inventory. Reproduce stale incremental failures fresh before source edits. Drain each same-cause config/ambient/policy group using only affected gates; a local fix does not authorize a full-repository rerun. Integrate once after batching repairs. No intermediate-major installs/builds; at most one optional installed `tsc6` diagnostic check.
6. **[Complete](#completion-gate) and [summarize](#summarize)**, including blockers rather than abandoning safe work.

## Long-Running and Interactive Commands

- Log exit status and bounded diagnostics. Reserve closure time before another broad gate or patch transaction: finish/cancel prompts, remove scratch, wait/stop commands, and report verified/blocked/untouched groups; never end running or empty.
- **Compatibility transaction per real tool/install group:** install a compatible candidate; **patch only if needed** (prepare tooling → edit → save/register patch → refresh lock). Inspect alias/direct-peer ownership → remove scratch → rehydrate with **baseline setup/lifecycle flags** → ordinary bins and smallest existing affected consumer regression gate. Only then propagate. Prompts, unpacked sources, version/API-symbol probes and happy-path parses are not completion. Target installs allow lock updates; baseline/completion installs are frozen.
  - **pnpm:** `CI=true pnpm patch <pkg>@<exact-installed-version> --edit-dir patch-work/<pkg>`, edit, `pnpm patch-commit patch-work/<pkg>`, then install to refresh locks. If still prompted, select the exact installed owner and finish this transaction.
  - **yarn (berry):** `yarn patch <installed-locator>`, edit the printed folder, `yarn patch-commit -s <folder>`, then install. Inspect saved descriptors; CLI patches must not replace API aliases.
  - **npm / yarn classic:** install/register `patch-package` and its supported hook **before** transient `node_modules/<pkg>` edits; save with `npx -y patch-package <pkg>`. Preserve published-package installs.

## Forbidden Fixes

- Do not use `ignoreDeprecations`. The target version will not support this option.
- Do not add `// @ts-ignore`, `// @ts-expect-error`, or `// @ts-nocheck` to silence new errors.
- Do not introduce `any`, double casts or disabled checks just to hide errors.
- Do not weaken **effective baseline** strictness (`strict`, `noImplicitAny`, `strictNullChecks`, etc.). Explicitly preserving an old implicit default such as `strict: false` is allowed.
- Never turn `skipLibCheck` **on** to bypass new declaration diagnostics; repair compatible dependency versions/declarations instead. Existing negative type-test directives and precise asset declarations are not new suppressions.

## Usercode Bugs

DOM/type updates may expose usercode bugs. Fix clear intent and verify runtime behavior; otherwise leave diagnostics visible, continue independent safe work and report the blocker. Do not temporarily suppress errors or invent behavior.

## Completion Gate

After draining grouped diagnostics, run one integrated gate set. If it exposes more failures, batch affected-group repairs before reintegration; never certify the whole repository after each local fix. Late edits invalidate only affected evidence:

1. Manifest/lock/patch/install-hook changes require the closed transaction above: registered/tracked patches, matching locks, clean frozen baseline-policy install and renewed affected integration gates.
2. Mark **every requested CLI/API/emit role** verified, blocked or untouched using installed owners and grouped gates, including peers/standalone roots. Aliases alone are not evidence; list unfinished requested groups separately from historical/private exceptions. Batch owner-directory resolution probes; never auto-download missing compilers.
3. Run grouped baseline gates with matching config/entrypoint/host coverage, API tools and emitted `types`/exports. No full build per owner. Source/config changes invalidate affected compile/build/test consumers; docs-only edits need no install/runtime rerun. Keep unaffected evidence.
4. Audit the diff for new casts/suppressions/disabled checks and output changes against effective baseline semantics. Fix regressions; unchanged requested declarations, new target errors and unverified gates mean **incomplete**.

## Summarize

Report starting/installed versions and verified/blocked/untouched requested roles by group, separate historical/private exceptions, and notable edits. Distinguish target checker/ordinary entrypoint from API/emit package versions. Compare baseline/final setup policy, gates and hosts; newer-Node passes are **not original-host passes**. Red/unverified gates mean incomplete; name blockers without cleanup offers or unattended questions.

<!-- prettier-ignore-end -->
