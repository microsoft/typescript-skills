---
name: typescript-webpack-to-oxc
description: Migrate existing webpack and/or ESLint tooling to Oxc, Oxlint, Rolldown, Vite, or tsdown without breaking scripts, builds, public artifacts, tests, or runtime behavior. Use for requests to replace webpack or ESLint with these tools; not for new-project setup or unrelated compiler upgrades.
---

<!-- prettier-ignore-start -->

Migrate only the requested tooling; preserve unrelated tooling, callable workflows, and consumer behavior.

**A running install/build/test terminal is not a result.** Next, read/wait for that exact operation, handle a real prompt, or stop it on an exact blocker; never return an empty/progress-only final answer. Before final narration, confirm replacement edits exist, owned operations finished/stopped, and the executed ledger is final. An exact blocker permits no edits, not unauthorized execution. Report failures and excluded scope declaratively, never as a follow-up question.

## 1. Gate tool releases on the actual runtime

Read repository instructions; record actual runtime/package-manager versions/pins, platform, CI/container and deployment constraints. Bound preflight to these, candidate CLI viability, and one old route/consumer. Use published stable metadata/types for the feature at hand; do not enumerate historical releases.

> **Release-selection gate**
>
> 1. Select compatible engines, peers, and native/browser support.
> 2. In the **first bounded replacement slice**, execute the CLI/API and one minimal required-feature probe on the actual permitted runtime **before editing its manifests or accepting the candidate**. Use a project-local install if needed; missing `engines` metadata is not compatibility.
> 3. If tests need runtime A but the bundler needs B, **reselect** a release/implementation or report a blocker; never combine cross-runtime results into a green ledger.
> 4. Upgrade runtime only with permission and the complete final install/build/lint/test environment. CI YAML or selected temporary-runtime commands alone are insufficient.

Prefer Rolldown for bundles, Vite for apps/dev servers, or tsdown for libraries, subject to observed contracts. Verify package identity and the actual Oxc/Rolldown backend.

Reuse installed dependencies; restore missing tools with the existing manager's locked install and documented registry authentication. Update manifests and authoritative locks together; preserve unrelated resolutions. Keep normal lifecycle/native/optional/browser preparation reproducible: ignored engines/scripts and hand-repaired `node_modules` are not final proof.

## 2. Capture one executable consumer checkpoint

Read the affected script → aliases/runner → config/input/output and its existing consumer. Build one representative old route and record **only contracts present here**, not an exhaustive pre-edit inventory:

| Observed route       | Expected baseline contract             | Actual assertion/result              |
| -------------------- | -------------------------------------- | ------------------------------------ |
| First built consumer | All required aliases + real API result | Baseline result; replacement pending |

For a baseline with coexisting direct/default aliases:

```js
const assert = require("node:assert/strict");
const loaded = require("./dist/entry.cjs");
assert.equal(typeof loaded, "function");
assert.equal(loaded.default, loaded);
```

Record all required direct/default/named/global accessors together, their important values/equalities, and one real API result. Substitute project-observed assertions; never invent aliases or use `loaded.default ?? loaded`. A default-only facade is not equivalent merely because the direct API works. Replay the unchanged original consumer first.

Open [consumer-smoke.md](references/consumer-smoke.md) **relative to the full path of the SKILL.md just opened**, not by searching the target workspace. Use its Node/browser/worker recipes for observed routes; resolve other skill references the same way.

Preserve machine consumers: readiness strings, problem matchers, redirects, exit codes, lifecycle timing. Compare directory document/final redirect URLs with/without a trailing slash before child-resource resolution. If a baseline hangs, trace the real startup/loader route; use its permitted actual consumer or record an exact blocker, not repeated unbounded probes.

Keep tests/fixtures as acceptance consumers. If adapting one is necessary, prove the public alias/API remains equivalent; do not make only a smoke page consume a new contract. Label blocked baseline expectations as documented, not observed.

## 3. Implement and verify vertical slices

After preflight, implement the first route immediately with its gated feature probe: **replacement → original entry point → built consumer → repair**, then expand incrementally across package/install boundaries, scripts, CI/editor/publish callers, and all test lanes. Do not require every baseline suite before replacement.

Consult [feature-map.md](references/feature-map.md) only for encountered features. Preserve non-webpack producers, typechecks/declarations, and test runners unless replacement is necessary.

**Scripts are public API; keep existing keys and pre/post hooks callable**, including `eslint` and webpack-named keys. Make the build graph transparent to users: bundler-backed `build`, `build:*`, and `bundle*` routes should visibly invoke the new bundler, preferably a CLI/config (`rolldown -c`, `vite build`) or tool-named helper such as `bundle:rolldown`. Retain legacy webpack-named keys only as aliases **to the new canonical script**, never as keys the build/bundle routes call. When a custom Node API runner is needed, expose the bundler in the script body/runner filename or helper key (for example, `node scripts/rolldown.config.mjs`) and verify it actually calls the installed API. Keep independent TypeScript-only stages.

**Repair the first failed original consumer boundary before broader parity work or another full suite; source tests do not close a built-artifact row.** Keep one ledger: command/consumer, environment, expected → actual result, finished status. Rerun affected rows; reserve clean installs/full suites for dependency/lifecycle changes and the final gate.

**Invalidate consumer results** after changing source → generated JS input, TS `module`, interop/export mode, wrappers, injection, final minifier, or resource URL logic. Rebuild and rerun the same complete baseline alias/API assertions against final output before another variant.

For temporary servers/watchers, record ownership and actual process tree/port, use bounded readiness waits, and execute the real consumer. Stop the owned process tree and confirm exit/port release before replay or finishing. If a terminal wrapper detaches, inspect the existing service rather than launching a duplicate.

## 4. Translate lint semantics

Preserve effective rules, **defaults/options**, globals, ignores, overrides, extensions, suppressions, declaration/API scope, and fix/quiet/API routes. Translate against the selected Oxlint release's help/schema/rule list; inspect migration-helper output rather than copying unsupported rules.

Translate rule/options first, using scoped options for semantic differences (including unused catch bindings), not broader correctness categories. Map suppressions to existing rules, verify file coverage, and retain formatting coverage/policy separately where needed; report unsupported translations. Do not weaken types, add `any`/`skipLibCheck`, or delete assertions.

Make `lint`/`eslint` automation routes Oxlint-backed and **non-mutating by default**; retain keys/scope and separate callable fix/format-write routes. Execute the actual check route, including formatting; verify unchanged pre/post worktree status/diff. A fixer pass is not a final lint pass.

Do not automatically reformat unrelated source/tests/examples. Review fixer output and revert unrelated changes; preserve existing cast/suppression/type-escape lines unless migration needs them changed. Choose compatible formatting options/tooling, not typed-expression rewrites for green output. Use focused cases for nontrivial rule translations.

## 5. Finish one reproducible pipeline

- Audit original script keys/callers and all discovered routes. For a full replacement, no script executes webpack/ESLint; bundler routes and lint actually reach their replacements.
- In the **same supported final environment**, complete clean locked setup/preparation for root and independent packages, then clean build, typechecks/declarations, lint, and the full original test surface: API/declaration/native/browser/renderer plus distinct generic/CI lanes. Record finished counts/skips and investigate regressions.
- Replay affected built/packed consumers for every observed published/runtime variant, including dev/watch readiness and rebuilds, production serving, resources, package contents, and maps. Source tests or initial specs do not substitute for finished consumer/suite results.
- Remove obsolete tooling after tracing consumers; remove incidental probes/logs/generated output, not user work, versioned artifacts, license notices, or wired configs. Update affected docs/editor/CI recipes.
- Report releases/backend, adaptations, preserved routes, and the ledger with failed/blocked/not-run checks explicit. Alternative commands or mixed-runtime results are not completion.

<!-- prettier-ignore-end -->
