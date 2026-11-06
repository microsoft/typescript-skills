---
name: typescript-update
description: Guidance for updating to the newer versions of TypeScript. Use this when you need to upgrade TypeScript or as part of a larger dependency update process.
---

<!-- prettier-ignore-start -->

Upgrade to the requested target (latest 7.x if unspecified), preserving effective baseline safety, runtime/output semantics and persisted installation. This governs **every guide**: no lower-target or suppression escape hatch. In unattended runs, finish safe work and [summarize](#summarize) unresolved blockers as incomplete, without questions.

## How To Upgrade

1. **Inventory and preflight.** Reuse one manifest/config scan as a compact **ownership ledger**:
   - Enumerate every requested declaration (manifest, section, CLI/API/emit role) and relevant workspace/standalone example/test config root. Group by shared config/install/tool graph; rows link to group-level baseline versions/configs, CLI/API owners, peers/overrides, generator policy, lockfile and gates. No prose dossier per directory.
   - Private transitive compilers and intentional historical consumer fixtures stay unchanged unless they own or break a requested gate. There is **no global “zero TS5 in the lockfile” goal**; requested examples are not exempt.
   - [Probe the exact launcher and declared build hosts](6to7.md#upgrade-checklist) before expensive baseline work or bulk edits.
2. **Baseline once.** Reuse `node_modules`, otherwise do one frozen non-interactive baseline install. Run relevant owned build/typecheck/test/lint gates once with bounded time/output; record coverage (directory/config/compiler/host), failures and unverified prerequisites. Do not retry a broad red gate until its root cause or prerequisite changes.
3. **Read guides before editing; prove one representative per group.** Always read [6to7.md](6to7.md); also [5to6.md](5to6.md) if starting below 6, [4to5.md](4to5.md) if below 5. Use the [API-consumer check](6to7.md#does-the-project-need-the-typescript-api) to choose plain or split layout and test the applicable integration boundaries. Simple current-runtime apps without API consumers take the direct plain-target path, without API checks.
4. **Batch migration by shared inheritance**, including generated/test/example configs. Apply TS6 defaults/removals even when jumping to 7; preserve effective safety, emitted paths and published `types`/exports. Update `@types/*` within supported runtime/dependency majors; repair required API tools, not unrelated dependencies.
5. **Propagate the proven layout and install**, then collect one non-bailing target diagnostic inventory. Use the repository task graph to build generated prerequisites before diagnosing downstream missing types. No intermediate-major installs/builds; at most one optional installed `tsc6` diagnostic check.
6. **[Complete](#completion-gate) and [summarize](#summarize)**, including blockers rather than abandoning safe work.

## Long-Running and Interactive Commands

- Log commands with exit status; read bounded error inventories, not repeated full logs. Clean scratch files. Target installs allow lock updates; baseline/completion installs are frozen.
- Wait for commands or stop them at the budget and record unverified; never end with running commands or an empty message. Finish/cancel prompts; use non-interactive flags.
- Prefer compatible dependency upgrades. Persist necessary patches and refresh the lockfile:
  - **pnpm:** `pnpm patch <pkg>@<exact-version> --edit-dir patch-work/<pkg>`, edit, `pnpm patch-commit patch-work/<pkg>`, remove scratch.
  - **yarn (berry):** `yarn patch <pkg>@npm:<exact-version>`, edit the printed folder, `yarn patch-commit -s <folder>`, then `yarn install`. Inspect changed descriptors: patch-save must not replace `typescript` API aliases with the CLI/implementation package.
  - **npm:** edit `node_modules/<pkg>`, run `npx -y patch-package <pkg>`; persist its install hook/tool without breaking published-package installs.

## Forbidden Fixes

- Do not use `ignoreDeprecations`. The target version will not support this option.
- Do not add `// @ts-ignore`, `// @ts-expect-error`, or `// @ts-nocheck` to silence new errors.
- Do not introduce `any`, double casts or disabled checks just to hide errors.
- Do not weaken **effective baseline** strictness (`strict`, `noImplicitAny`, `strictNullChecks`, etc.). Explicitly preserving an old implicit default such as `strict: false` is allowed.
- Never turn `skipLibCheck` **on** to bypass new declaration diagnostics; repair compatible dependency versions/declarations instead. Existing negative type-test directives and precise asset declarations are not new suppressions.

## Usercode Bugs

DOM/type updates may expose usercode bugs. Fix clear intent and verify runtime behavior; otherwise leave diagnostics visible, continue independent safe work and report the blocker. Do not temporarily suppress errors or invent behavior.

## Completion Gate

Batch repairs, then run one integrated gate set. Late edits invalidate only affected evidence:

1. Manifest/lock/patch/install-hook changes require a clean frozen install per affected install root, renewed resolution/integration checks and affected consumer gates. Reuse the representative boundary tests.
2. Reconcile **every ledger row**, including peers and standalone roots, against the requested target or verified CLI/API roles. Batch installed version/resolution probes from owner directories in one pass; never auto-download missing compilers. Root green does not certify local peers.
3. Run grouped baseline gates with matching config/entrypoint/host coverage, API tools and emitted `types`/exports. No full build per owner. Source/config changes invalidate affected compile/build/test consumers; docs-only edits need no install/runtime rerun. Keep unaffected evidence.
4. Audit the diff for new casts/suppressions/disabled checks and output changes against effective baseline semantics. Fix regressions; unchanged requested declarations, new target errors and unverified gates mean **incomplete**.

## Summarize

Always report starting/installed versions and CLI/API/emit roles by group, unchanged declarations/fixtures, and notable edits. Separate target installed, ordinary CLI usable and API-tool gates usable. Compare baseline/final gates with coverage and Node hosts; newer-Node passes are **not original-host passes**. List red/unverified gates and concrete blockers, then complete/incomplete; no cleanup offer or unattended question.

<!-- prettier-ignore-end -->
