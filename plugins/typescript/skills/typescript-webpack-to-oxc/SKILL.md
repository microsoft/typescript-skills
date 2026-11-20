---
name: typescript-webpack-to-oxc
description: Migrate existing webpack and/or ESLint tooling to Oxc, Oxlint, Rolldown, Vite, or tsdown without breaking scripts, builds, public artifacts, tests, or runtime behavior. Use for requests to replace webpack or ESLint with these tools; not for new-project setup or unrelated compiler upgrades.
---

<!-- prettier-ignore-start -->

Migrate only the requested tooling; preserve unrelated tooling, callable workflows, and consumer behavior.

**A running terminal ID means work remains in this turn.** Follow that exact install/build/test operation to a finished exit/result; never end with it running or a progress-only promise to continue. Do not finish with no migration edits unless an exact blocker prevents work. On a real blocker, finish or stop owned operations and report the failure.

## 1. Gate tool releases on the actual runtime

Read repository instructions first. Record actual Node/package-manager versions and pins, OS/architecture, CI/container and replay/deployment constraints. Missing authorized infrastructure is a blocker, not permission to bypass restrictions.

> **Release-selection gate**
>
> 1. Choose a candidate compatible with those constraints, engines, peers, and required native/browser support.
> 2. **Before editing manifests for that candidate**, execute its CLI/API and a minimal required-feature probe on the actual permitted runtime; use an isolated project-local install if needed. Missing `engines` metadata is not evidence of compatibility.
> 3. If tests need runtime A but the bundler needs B, **stop and reselect** a release/implementation or report an unresolved blocker. Never combine cross-runtime failures into a green ledger.
> 4. Upgrade runtime only when permitted and the actual final install/build/lint/test environment changes together. CI YAML edits alone or selected `npx node@…` commands do not change the environment executing delivered scripts.

Prefer Rolldown for explicit bundles, Vite for apps/dev servers, or tsdown for library packaging, subject to observed contracts. Verify the selected release's package identity and actual Oxc/Rolldown backend; neither the name `oxc` nor a product name proves suitability.

Reuse installed dependencies; restore missing tools with the existing manager's locked install and documented registry authentication. Update manifests and authoritative locks together; preserve unrelated resolutions. Keep normal lifecycle/native/optional/browser preparation reproducible: ignored engines/scripts and hand-repaired `node_modules` are not final proof.

## 2. Capture one executable consumer checkpoint

Read the affected script → aliases/runner → config/input/output and its existing consumer. Build one representative old route and record **only contracts present here**, not an exhaustive pre-edit inventory:

| Observed route       | Expected baseline contract                 | Actual assertion/result              |
| -------------------- | ------------------------------------------ | ------------------------------------ |
| First built consumer | Exact accessor + representative API result | Baseline result; replacement pending |

For example, this tiny CJS accessor assertion can start a project-local probe:

```js
const assert = require("node:assert/strict");
const api = require("./dist/entry.cjs").default;
assert.equal(typeof api, "function");
```

Replace the path/accessor with the baseline's actual direct/default/named shape; never use `loaded.default ?? loaded`. Add a real API call and assert its recorded result before marking the row passed. File/regex/`typeof` checks are intermediate observations, not consumer proof.

Open [consumer-smoke.md](references/consumer-smoke.md) **relative to the full path of the SKILL.md just opened**, not by searching the target workspace. Use its Node/browser/worker recipes for observed routes; resolve other skill references the same way.

Machine consumers include stdout readiness strings, task problem matchers, browser global aliases, URL redirects, exit codes, and lifecycle timing: preserve them or update their actual consumers together, checking nested/trailing-slash routes. If a runner hangs before specs, inspect its startup condition before blaming browsers.

Keep tests/fixtures as acceptance consumers. If adapting one is necessary, prove the public alias/API remains equivalent; do not make only a smoke page consume a new contract. Label blocked baseline expectations as documented, not observed.

## 3. Implement and verify vertical slices

Repeat **one route → replacement → original entry point → built consumer → repair**, then expand to the next observed variant. Discover remaining package/install boundaries, scripts, CI/editor/publish callers, and omitted test lanes incrementally; never silently omit them. Do not require every baseline suite before the first focused replacement.

Consult [feature-map.md](references/feature-map.md) for features actually encountered. Use selected-release help/schema/types for the needed API, not broad schema tours. Preserve non-webpack producers, typechecks/declarations, and test runners unless replacement is necessary.

**Scripts are public API; keep existing keys and pre/post hooks callable**, including `eslint` and webpack-named keys. Make the build graph transparent to users: bundler-backed `build`, `build:*`, and `bundle*` routes should visibly invoke the new bundler, preferably a CLI/config (`rolldown -c`, `vite build`) or tool-named helper such as `bundle:rolldown`. Retain legacy webpack-named keys only as aliases **to the new canonical script**, never as keys the build/bundle routes call. When a custom Node API runner is needed, expose the bundler in the script body/runner filename or helper key (for example, `node scripts/rolldown.config.mjs`) and verify it actually calls the installed API. Keep independent TypeScript-only stages.

**Repair the currently observed red check before optional parity work or new API substitutions.** Keep one session ledger: command/consumer, environment, expected → actual result, finished status. Rerun affected rows, not independent completed checks after every edit; reserve repeated clean installs/full suites for dependency/lifecycle changes and the final gate.

**Invalidate consumer results** after changing source → generated JS input, TS `module`, interop/export mode, wrappers, injection, final minifier, or resource URL logic. Rebuild and rerun the exact baseline accessor/API against final output before continuing to another variant.

For temporary servers/watchers, record ownership and actual process tree/port, use bounded readiness waits, and execute the real consumer. Stop the owned process tree and confirm exit/port release before replay or finishing. If a terminal wrapper detaches, inspect the existing service rather than launching a duplicate.

## 4. Translate lint semantics

Preserve effective rules, **defaults/options**, globals, ignores, overrides, extensions, suppressions, declaration/API scope, and fix/quiet/API routes. Translate against the selected Oxlint release's help/schema/rule list; inspect migration-helper output rather than copying unsupported rules.

Use supported scoped options for semantic differences (including unused catch bindings); do not escalate broad correctness categories. Map suppressions only to existing rules, verify included/excluded files, and keep formatting in a separate tool where needed. Do not weaken types, add `any`/`skipLibCheck`, or delete assertions to get green.

Keep lint keys, even `eslint`, invoking Oxlint with equivalent scope/flags; add an entry if requested and absent. Inspect fixer diffs, revert unrelated edits, and finish in check mode. Use focused cases for nontrivial rule translations.

## 5. Finish one reproducible pipeline

- Audit original script keys/callers and all discovered routes. For a full replacement, no script executes webpack/ESLint; bundler routes and lint actually reach their replacements.
- In the **same supported final environment**, complete clean locked setup/preparation for root and independent packages, then clean build, typechecks/declarations, lint, and the full original test surface: API/declaration/native/browser/renderer plus distinct generic/CI lanes. Record finished counts/skips and investigate regressions.
- Replay affected built/packed consumers for every observed published/runtime variant, including dev/watch readiness and rebuilds, production serving, resources, package contents, and maps. Source tests or initial specs do not substitute for finished consumer/suite results.
- Remove obsolete tooling only after tracing remaining consumers. Curate the diff: remove incidental probes/logs/generated output, not user work, versioned artifacts, required license notices, or wired configs; update affected docs/editor/CI recipes.
- Report resolved releases/backend, adaptations, preserved routes, and the compact ledger with failed/blocked/not-run checks explicit. An alternative command or mixed-runtime ledger is not completion.

<!-- prettier-ignore-end -->
