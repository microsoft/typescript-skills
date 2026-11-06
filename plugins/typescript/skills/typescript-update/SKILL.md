---
name: typescript-update
description: Guidance for updating to the newer versions of TypeScript. Use this when you need to upgrade TypeScript or as part of a larger dependency update process.
---

<!-- prettier-ignore-start -->

Upgrade to the requested target (latest 7.x if unspecified), preserving effective baseline safety, runtime/output semantics and persisted installation. This governs **every guide**: no lower-target or suppression escape hatch. In unattended runs, finish safe work and [summarize](#summarize) unresolved blockers as incomplete, without questions.

## How To Upgrade

1. **Preflight and record the baseline (cheaply).**
   - Reuse one manifest/config scan as an **ownership ledger**: directory/manifest/declaration section; requested CLI/API/emit role; baseline version/effective configs; target CLI and retained API owners; peers/overrides; lockfile; validation command. Include all workspace declarations and relevant standalone example/test roots. Separate intentional old-compiler consumer fixtures; do not blanket-upgrade them or exempt requested examples.
   - Record current Node/package-manager versions, build/development minimum and published runtime minimum separately. Resolve and [probe the exact target launcher](6to7.md#upgrade-checklist) on the current host **before expensive baseline work or bulk edits**; metadata is not proof.
   - Reuse `node_modules`, otherwise do **one** non-interactive baseline install without changing package-manager setup. Run owned build/typecheck/test/lint scripts once; log directory/config/compiler/host coverage and results. Bound long monorepo baselines to relevant gates; record timeouts/missing prerequisites.
   - A red baseline is information, not a reason to abandon safe work. Separate host blockers from source diagnostics.
2. **Read the version guides before your first edit.** Always read [6to7.md](6to7.md). Also read [5to6.md](5to6.md) if starting below 6.0, and [4to5.md](4to5.md) if starting below 5.0. Treat them as checklists of changes to apply up front, not as references to consult only after something breaks.
3. **Choose each owner's package layout.** Run the [API-consumer check](6to7.md#does-the-project-need-the-typescript-api). Use the side-by-side CLI/API layout where needed; a simple app without API consumers keeps the direct plain-target path.
4. **Apply config changes in one pass** by shared inheritance, including generated/test/example configs. Check TS6 defaults/removals (`types`, strictness, module/resolver, `baseUrl`/`paths`, interop, target, `rootDir`) even when jumping to 7. Preserve emitted paths and published `types`/exports, not just `--noEmit`. Update `@types/*` to compiler-compatible releases matching the supported runtime/dependency majors, and repair API tools rather than unrelated dependencies.
5. **Install the target versions once**, then typecheck with the new `tsc` and fix the errors.
   - Do not install/build every intermediate major. At most, run one optional check with the installed `tsc6` for more descriptive deprecation messages. Collect non-bailing workspace/config diagnostics once; build generated-declaration prerequisites before repairing downstream missing-type errors.
6. **Run the [Completion Gate](#completion-gate)**, then **[Summarize](#summarize)**.

## Long-Running and Interactive Commands

- Log non-interactive installs/builds/tests, e.g. `CI=true yarn build > ts-upgrade-build.log 2>&1; echo "exit=$?"`; read the tail, then clean scratch logs. Target installs permit lockfile updates; baseline/completion installs are frozen/immutable.
- If a command moves to the background, wait for its exit or explicitly stop it at the chosen budget and record it as unverified. **Do not end your turn while a command is still running**, and never end with an empty message.
- Avoid input-waiting commands (`pnpm patch` without `--edit-dir`, `npx` without `-y`, generators, interactive git). If prompted, finish or cancel that workflow in the same turn.
- Prefer upgrading a dependency over patching it. If a dependency must be patched, persist the patch non-interactively and refresh the lockfile:
  - **pnpm:** `pnpm patch <pkg>@<exact-version> --edit-dir patch-work/<pkg>`, edit there, `pnpm patch-commit patch-work/<pkg>` (writes `patches/`, `patchedDependencies` and lockfile), remove the scratch directory, then `pnpm install --frozen-lockfile`.
  - **yarn (berry):** `yarn patch <pkg>@npm:<exact-version>` prints a folder; edit it, run `yarn patch-commit -s <folder>`, then `yarn install`.
  - **npm:** edit `node_modules/<pkg>`, run `npx -y patch-package <pkg>`, and add a `"postinstall": "patch-package"` script.

## Forbidden Fixes

- Do not use `ignoreDeprecations`. The target version will not support this option.
- Do not add `// @ts-ignore`, `// @ts-expect-error`, or `// @ts-nocheck` to silence new errors.
- Do not introduce `any`, double casts or disabled checks just to hide errors.
- Do not weaken **effective baseline** strictness (`strict`, `noImplicitAny`, `strictNullChecks`, etc.). Explicitly preserving an old implicit default such as `strict: false` is allowed.
- Never turn `skipLibCheck` **on** to bypass new declaration diagnostics; repair compatible dependency versions/declarations instead. Existing negative type-test directives and precise asset declarations are not new suppressions.

## Usercode Bugs

DOM/type updates may expose usercode bugs. Fix clear intent and verify runtime behavior; otherwise leave diagnostics visible, continue independent safe work and report the blocker. Do not temporarily suppress errors or invent behavior.

## Completion Gate

The upgrade is not done until this gate has been run after your last edit:

1. Do a clean, lockfile-respecting install (e.g. `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`). This proves `package.json`, the lockfile and any `patchedDependencies` agree.
2. Reconcile **every ledger row**: declarations/peers must satisfy the target or a verified CLI/API migration. Probe installed compiler version and tool API resolution from each owner directory, without auto-downloading missing compilers. A green root or TS7 alias beside unrelated retained TS5 is insufficient.
3. Rerun baseline gates with matching directory/config/entrypoint/host coverage, including standalone roots. Check all ordinary compiler entrypoints, API tools and emitted `types`/exports. Shared gates can cover multiple rows; no full build per example is required.
4. Audit the final diff for new `any`/double casts, suppressions, disabled checks and output-format changes against effective baseline semantics.
5. Fix regressions or report an incomplete upgrade. Unchanged requested declarations, target errors (including generated/example configs) and unverified gates prevent completion. Downloaded newer Node checks are **not original-host passes**; a permitted host migration must persist setup/CI changes and be reported separately without dropping published runtime support.

## Summarize

Your final message must always be this summary, even if you were blocked or stopped early:

- Starting/installed versions and CLI/API/emit ownership by ledger group, including unchanged requested declarations and intentional compatibility fixtures
- Target installed, ordinary CLI usable and API-tool gates usable: report each separately
- Baseline vs. final build/typecheck/test/lint results with coverage and Node version; separate current-host and upgraded-host results and any durable support change
- Notable edits, usercode bugs, every red/unverified gate and why
- Complete or incomplete upgrade, with concrete remaining blockers; no deferred-cleanup offer or question in unattended runs

<!-- prettier-ignore-end -->
