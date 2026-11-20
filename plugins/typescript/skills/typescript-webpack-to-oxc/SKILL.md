---
name: typescript-webpack-to-oxc
description: Migrate existing webpack and/or ESLint tooling to Oxc, Oxlint, Rolldown, Vite, or tsdown without breaking scripts, builds, public artifacts, tests, or runtime behavior. Use for requests to replace webpack or ESLint with these tools; not for new-project setup or unrelated compiler upgrades.
---

<!-- prettier-ignore-start -->

Migrate the requested tooling in an existing repository. Preserve its callable workflows and consumer contracts, not just successful compilation.

**Definition of done.** For a webpack + ESLint replacement, finish only when:

- **Existing script keys remain callable**, including names such as `eslint`, `webpack`, `prestart`, and pre/post lifecycle hooks. Change their implementations, not their names; scripts are a public API.
- **No `package.json` script still invokes webpack or ESLint.** Lint scripts invoke **Oxlint**; build/bundle scripts that used webpack visibly invoke **Rolldown, Vite, or tsdown**, through their CLI or a clearly named runner that actually imports/calls the replacement bundler. Trace aliases and wrappers to prove execution; neither an unused dependency nor a tool name in a comment is integration. Keep independent TypeScript-only build stages.
- A clean locked install, required preparation, build, typecheck, lint, full test surface, and consumer smoke checks complete in the **same supported final environment**, for every affected package.
- Published formats, export accessors, files, resource URLs, and development/production/runtime behavior match the baseline. Build success and source tests alone do not prove artifact equivalence.

If only webpack or only ESLint is requested, apply the replacement gates to that tool and preserve unrelated tooling. Record blocked or failing gates explicitly; an alternative working command is not a completed migration.

## 1. Preflight: environment and installation

- Read repository instructions before executing anything. Record Node/package-manager pins, actual versions, OS/architecture, CI/container setup, deployment targets, and native/browser prerequisites. Respect execution restrictions; missing authorized infrastructure is a blocker, not permission to run prohibited host commands.
- Reuse installed dependencies for discovery. If required tools are missing, restore with the existing manager and authoritative lock: `npm ci`, `pnpm install --frozen-lockfile`, Yarn modern `install --immutable`, or Yarn classic `install --frozen-lockfile`. Handle registry authentication through the repository's documented mechanism.
- Freeze the supported environment **before choosing tool releases**. It must satisfy engines, package-manager compatibility, native/optional bindings, tests, and deployment requirements together. Temporary newer Node plus tests on older Node is not one passing pipeline.
- Inspect candidate package identity, engine ranges, peer requirements, and documentation for the **selected release** (e.g. package-manager metadata queries). The npm package named `oxc` is not automatically the intended bundler. Select a compatible release line instead of forcing latest or using `--ignore-engines`. If an upgrade is required and allowed, validate the entire pipeline on it.
- Confirm that the resolved Vite/tsdown release or integration actually uses the requested Oxc/Rolldown tooling; the product name alone is not backend evidence. Prefer Rolldown for explicit bundle contracts, Vite for application/dev-server pipelines, and tsdown for library packaging, subject to the required features.
- Change manifests and authoritative locks **together**, using the existing manager. Preserve unrelated resolutions and lock formats where practical; do not delete locks or defer reconciliation. Read installed help, schemas, typings, and examples before configuring APIs; do not guess plugin names/options when web docs are unavailable.
- Preserve install/lifecycle preparation and required native/optional dependencies. A scripts-disabled install or hand-repaired `node_modules` is diagnostic only unless the permitted setup explicitly reproduces all required preparation. Final verification must reproduce it from the lock.
- Provision browser/native prerequisites through permitted repository procedures. Configure noninteractive/headless execution explicitly where needed; preserve generic and CI routes rather than testing only the easier one.

## 2. Inventory the command graph and artifact contract

Before editing, record these inventories and the [verification ledger](#5-verification-ledger).

### Command/package graph

- Enumerate root/member manifests, actual workspace definitions, independently installed packages, and directory-walking install/build scripts. TypeScript references are not package installation boundaries.
- Trace scripts → aliases/task runners → CLI/API calls. Include CI, containers, editor tasks, docs, publishing, dev servers, test transforms, lint API/fix/quiet routes, and pre/post hooks. Preserve ordering: generated/compiled inputs must exist before bundling.
- List every production, development, watch, release, example, style, library, CLI, and platform-specific route. Root `test` may omit API, declaration, native, renderer, or browser lanes; inventory them all.
- Keep shared configuration **outside enumerated package collections**, unless every existing walker is made robust to non-package entries. Use directory + manifest checks, not a newly narrowed glob that hides broken existing traversal.

### Observable artifact matrix

For each entry/output, record:

- Producer, source/generated input, filename/output directory, ESM/CJS/IIFE/UMD format, exact export accessor (`require(...)`, `.default`, named property, direct constructor), global name, and named/anonymous AMD registration where advertised.
- Externals and their browser globals, aliases, module resolution, target syntax, JSX/Babel semantics, development/production defines, and injected runtime dependencies.
- CSS/Sass/PostCSS, SVG components versus URLs/raw text, copied assets/licenses, code splitting, source-map chaining to original sources, and declaration generation.
- Worker constructor/API, classic/module mode, inline Blob **and external fallback**, CSP failure behavior, disposal, WASM/async initialization, no-worker API, and fetchable resource/base/worker-relative URLs.
- Package `main`/`module`/`browser`/`exports`/`types`, deep imports, publish contents, HTML/static routes, and dev-server behavior (including proxy, redirects, base paths, and watch/HMR).

Run baseline build/typecheck/lint/tests and representative **built-artifact** consumer probes before replacing configuration. Capture export shapes and important files/URLs as acceptance expectations; keep source tests too. If baseline execution is blocked, distinguish documented expectations from observed results.

## 3. Replace webpack responsibilities deliberately

Choose the tool by the artifact matrix; do not default every library to ESM or replace a test framework merely to change its bundler.

| Webpack feature                                                    | Replacement responsibility                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entries, output, `libraryTarget`/`libraryExport`, `umdNamedDefine` | Configure every format/filename and exact default-versus-namespace/direct-constructor shape. Preserve named AMD and each advertised loader branch. Check the selected bundler's supported formats; use a small adapter entry or explicit compatibility wrapper if it cannot express the contract. Never silently replace UMD with ESM.       |
| `externals`, aliases, resolution                                   | Preserve bundled-versus-external choices, peer dependencies, global mappings, browser conditions, and CommonJS interop. Test through package entry points, not only direct source imports.                                                                                                                                                   |
| `DefinePlugin`, `ProvidePlugin`, browser polyfills                 | Separate compile-time replacement from module injection/runtime shims. Preserve production `NODE_ENV`; audit `process`, `Buffer`, `global`, and Node built-ins in browser output, including transformed dependencies. Configure dev and production paths separately and execute both. Do not dismiss unresolved browser imports as harmless. |
| TS/Babel loaders, transpilation/minification                       | Preserve targets, JSX mode/runtime, decorators and other used transforms, banners/licenses, and production semantics. Keep independent `tsc` typechecks and declaration producers; fast transpilation is not typechecking.                                                                                                                   |
| CSS/Sass/PostCSS, URL/raw/SVG loaders, copy plugins                | Map each import's semantics, extraction, ordering, names, public paths, and copied resources. An SVG React component is not an image URL. Verify emitted files and served URLs, including nested/trailing-slash routes.                                                                                                                      |
| `worker-loader`                                                    | Bundle the worker and preserve constructor shape, classic/module choice, inline Blob behavior, external fallback, CSP failure path, URL/base handling, and cleanup. Vite worker query syntax is a candidate, not proof of equivalent fallback behavior.                                                                                      |
| WASM and dynamic-import loaders                                    | Preserve async initialization, splitting, fetchable resources/MIME types, worker-relative paths, and direct no-worker entry points. Do not inline all resources or change a published format solely to make compilation work.                                                                                                                |
| Source maps, declarations, dev-server/test plugins                 | Chain maps back to original TS, retain declaration/package routing, and replace dev/test integration without dropping lanes. Prefer changing the existing runner's transform/bundler integration over migrating Karma/Mocha/etc. to another framework.                                                                                       |

Wire replacements into **the existing script keys and callers**. Prefer transparent CLI/config recipes; use clearly identified API runners when custom loader/plugin behavior needs them, and verify their imports against the installed API. Preserve non-webpack producers and unconverted consumers/dependencies.

After the first working bundle, immediately run the relevant [consumer smoke recipe](references/consumer-smoke.md). Fix export/resource mismatches before expanding to other variants; reuse those probes in the final gate.

## 4. Migrate ESLint to Oxlint semantically

- Inventory effective ESLint rules, plugins, environments/globals, ignores, directory overrides, file extensions, declaration lint, and inline suppressions. Capture lint entry points, including fix/quiet/API variants.
- Use the selected Oxlint release's help, schema, rule list, and effective configuration. An official migration helper can bootstrap configuration, but inspect its diff; unsupported rules/options must not be copied blindly.
- Map supported correctness rules and plugin behavior explicitly. Preserve browser/Node/test globals and directory-specific overrides. Translate suppression names/directives only where the replacement rule exists; remove obsolete directives rather than disabling broad categories.
- Keep declaration/API lint in scope: default ignores or file discovery must not silently drop previously linted `.d.ts`/`.d.mts`/`.d.cts` or other inputs. Verify included files and intentional exclusions.
- Formatting rules such as `semi`/`quotes` are not automatically Oxlint rules. Keep formatting in a separate appropriate tool when needed; explain unavailable rule coverage and any deliberate replacement. Do not weaken types, add `any`/`skipLibCheck`, delete assertions, or disable correctness categories to get green.
- Preserve existing lint **keys**, even `eslint`, while changing their bodies to `oxlint` with equivalent scope and supported flags. Add a lint entry if none existed and linting is requested. Inspect fixer diffs and revert unrelated changes; use check mode for final verification.
- Run Oxlint on the original input scope and the repository's typechecks/tests. For nontrivial rule translations, retain or add focused cases proving intended violations are still rejected.

## 5. Verification ledger

Keep a compact ledger in the session, not a new committed planning document:

| Package/route and environment               | Command or consumer contract                            | Baseline    | Final exit/result         |
| ------------------------------------------- | ------------------------------------------------------- | ----------- | ------------------------- |
| Root and each independent package           | Locked install + lifecycle/native/browser preparation   | Result      | Pending/pass/fail/blocked |
| Every original build/dev/watch/lint entry   | Exact existing script key and caller                    | Result      | Result                    |
| Typechecks/declarations and full test lanes | Commands, completed counts, expected skips/warnings     | Result      | Result                    |
| Every published/runtime variant             | Export/API, asset/worker/WASM URL, browser/CLI behavior | Expectation | Result                    |

After the last dependency/configuration changes, run in dependency order:

1. **Script-call audit.** Compare script keys against the baseline; retain every existing callable entry and hook. Inspect all affected manifests and trace active wrappers/configs/CI for old tool execution. For the full replacement, no script invokes ESLint/webpack; lint reaches Oxlint and webpack-owned build/bundle routes visibly reach the chosen new bundler. A legacy key mentioning the retired tool is fine; executing it is not.
2. **Clean locked setup** in the supported runtime for root and independent packages, including original package-discovery routes and required preparation. Do not finish with ignored engines/scripts or only a one-off native rebuild.
3. **Clean/uncached build, typecheck/declaration, and lint**, using existing entry points. Verify every production/development/library/style/example/platform output, then check watch/dev readiness and a rebuild; stop verification servers/watchers afterwards.
4. **Full original test surface**, including API/declaration, native, browser, and renderer lanes plus generic and CI routes where different. Preserve assertions, hooks/globals, and baseline counts/skips; investigate new failures. Do not replace a runner unless necessary and then preserve all lanes.
5. **Built/packed consumer probes** from the artifact matrix: CJS/ESM, advertised AMD/globals, representative API/constructor calls, browser without accidental Node globals, production and dev serving, inline/fallback/no-worker paths, and actual resource requests. Inspect publish contents and source maps/declarations as well.

Wait for each operation's **finished exit/result**. A terminal ID, first few specs, syntax check, editor diagnostic, or generated-file inspection is not a passing suite/runtime. Do not combine results from different Node versions or stale installs. Late changes invalidate affected rows: rerun installation for dependency/lifecycle changes and every downstream affected gate.

## 6. Cleanup and report

- Remove obsolete webpack/ESLint configs, loaders, plugins, and dependencies **only after tracing all consumers**. Do not remove a browser/native dependency while tests or other callers still need it. Update docs/editor/CI recipes without renaming public entry points.
- Inspect the full diff and `git status`. Remove only logs, probe consumers, dev bundles/maps, caches, and other output you created that should not ship. Preserve user-owned work, intentionally versioned artifacts, license assets, and wired replacement configs.
- Report the resolved tool versions/backend, preserved script keys and artifact variants, baseline-versus-final ledger, rule/compatibility adaptations, and all failed/blocked/not-run gates. Say exactly which suites finished; never claim completion while replacement or consumer checks remain unverified.

<!-- prettier-ignore-end -->
