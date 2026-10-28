---
name: typescript-build-references
description: Guidance for configuring TypeScript project references and incremental builds (`tsc -b`/`--build`, `composite`, solution-style tsconfigs) and declaration emission (`.d.ts` files) with `isolatedDeclarations` in an existing repo or monorepo. Use this whenever asked to add project references, build mode, incremental builds, declaration files, or isolated declarations, even when the repo already has a working build or bundler.
---

Your role is to add a TypeScript build-mode (project reference) graph to an existing repo **without** breaking its current build, public API, or runtime behavior.

**Definition of done.** You are finished only when:

* the repo's existing root `build` or `typecheck` script (or every in-scope package's `build`) runs the new `tsc -b` graph,
* in a workspace monorepo, `workspaces-to-typescript-project-references --check` (below) reports no differences, and
* after the frozen install, the repo's own root `build`, `typecheck`, and full test surface pass **with `isolatedDeclarations` enabled** (when it was requested). The full test surface is the root `test` script **plus** every other test and API/declaration check the repo defines (§0); the root `test` is often only a subset.

Handwritten `node -e` / `JSON.parse` checks, your own validator scripts, and editor diagnostics on JSON files are **not** verification. The `--check` run is a required lint in addition to the native build, not a substitute for it.
Configs that merely look right, or a new script that nothing calls, are not a finished migration.
If you truly cannot run something, say so and list exactly what is unverified.

**Reference check.** In a workspace monorepo (npm/yarn/pnpm/lerna workspaces), check that each package's `references` match its workspace dependencies with [`@monorepo-utils/workspaces-to-typescript-project-references`](https://github.com/azu/monorepo-utils/tree/master/packages/@monorepo-utils/workspaces-to-typescript-project-references), run from the repo root after installing:

* `npx --yes @monorepo-utils/workspaces-to-typescript-project-references --check`: compares each workspace package's `tsconfig.json` `references` with the workspace packages it depends on in `package.json`, and exits 1 if they differ (§3). Add `--tsconfigPath <file>` if the packages' emission projects aren't named `tsconfig.json`. Don't add the tool to the repo's dependencies.

## 0. Before editing anything: install, then record a baseline

* If `node_modules` is missing or `tsc` is not found, run the repo's frozen install first, chosen by lockfile:
   `pnpm install --frozen-lockfile` (`pnpm-lock.yaml`), `yarn install --immutable` (Yarn 2+ `yarn.lock`), `yarn install --frozen-lockfile` (Yarn 1), `npm ci` (`package-lock.json`), `bun install --frozen-lockfile` (`bun.lock`/`bun.lockb`).
   Don't use `--offline`, and don't skip the install to "avoid side effects": installing pinned dependencies is required to verify this task. If the install fails, report the error instead of continuing unverified.
* Find the repo's **full test surface**: read the root (and package) `package.json` scripts and the CI workflows for every test and API/declaration check, not just `test`. Look for `test:all`, other `test:*` scripts, unfiltered `vitest run`/`jest`, test-runner `projects`/workspaces that `test` filters out, and API checks such as `test:exports`, `test:types`, `api-extractor`, `tsnapi`, `tsd`, `attw`, and `publint`.
* Run the root `build` and `typecheck` scripts and every command on that test list, and record the results **before** changing configs, so you can tell your regressions from pre-existing failures. Skip only projects that genuinely cannot run here (e.g. a browser runner with no browser), and say which.
  * Don't install browsers or system packages, or switch Node versions, to make a suite runnable; report it as not run instead.
  * Coverage variants of suites you already run (`test:cov`, `--coverage`) need not be run separately.
  * Compare only suites that ran both before and after your change; don't call a failure "pre-existing" without a baseline run.
* Use the repo-local compiler (`node_modules/.bin/tsc`, or the package manager's `exec`). Don't run `npx tsc` without the compiler installed: it may offer to install the unrelated `tsc` package. If a command is waiting for input, answer or stop it; don't leave it running.

## 1. Inventory

* Check the installed TypeScript version. `isolatedDeclarations` and `${configDir}` need 5.5+. If the repo deliberately pins an older compiler, don't upgrade or downgrade it just to enable an option; keep the references and skip the unsupported option, and say so.
* List every in-scope package by identity and source root. Include private, CLI, and runtime packages, not just the publishable libraries.
   If the request names a set of packages, cover all of them.
* Record how each package is actually built today: root scripts, task runners (`lage`, `nx`, `turbo`, `nr`, `just`, ...), per-package scripts, CI workflows, and who produces declarations (`tsc`, a bundler plugin such as `tsdown`/`rolldown-plugin-dts`/`tsup`/`unbuild`/`vite-plugin-dts`, `preconstruct`, `vue-tsc`, ...).
   Trace root → package command chains to the real compiler invocations. Don't stop at a package script that looks relevant.
* Record the original inputs of each library: `include`/`files`/`exclude`, test and tooling files, generated sources, path aliases, and any inherited `tsconfig` settings (including `allowJs`/`checkJs`). Everything that was type-checked before must still be checked after.
* For packages whose public types you may touch, keep the emitted `.d.ts` files or API reports from the baseline build.

## 2. Design the reference graph

* Use a solution-style root config (`"files": []`, `"references": [...]`) so `tsc -b` at the root builds the projects and the root doesn't also check everything itself.
* Give each package an emission project with `composite` (which implies `declaration`), `rootDir`/`outDir` or `emitDeclarationOnly` as appropriate, and its own `tsBuildInfoFile` if the default location would collide. If a bundler still produces the JavaScript, keep that; the references build only adds declarations and checking.
   Keep tests, scripts, and tooling in separate projects (or the existing broad checker) when they have different options; they must still be covered.
* Derive `references` from **both** package manifests (`dependencies`, `peerDependencies`, `optionalDependencies`, workspace links) and actual source imports (including aliases and relative cross-package imports). Check for missing direct edges, not just transitive ones, and for cycles.
* Each project must reference every in-scope project it imports. Verify the whole graph is reachable from the root solution.

Package boundaries are hard rules:

* **One package, its own projects.** Each in-scope package gets its own emission project whose inputs are only files under that package's directory. Never set `rootDir` above the package, and never `include` `../` paths into another package (e.g. `../core/**/component.ts`). If package B imports package A's files, by name or by relative path, keep those files in A's project and add a `references` entry from B to A; `tsc -b` maps B's imports to A's declarations.
* **Never exclude a package's own source files from its emission project** to reduce `isolatedDeclarations` errors or to silence "not listed within the file list of project" (TS6307) errors. Annotate them instead (§5). Only tests, demos, scripts, and generated output may stay out of the emission project, and they must still be checked by another project.
* **Cover every TypeScript extension.** Prefer directory includes (`"include": ["src"]` or `["."]` with `exclude` for output). If you use globs, list `**/*.ts`, `**/*.tsx`, `**/*.mts`, and `**/*.cts`: `**/*.ts` alone silently drops `.mts`, `.cts`, and `.tsx` files, including hand-written `.d.mts` declarations.

## 3. Check effective configuration, not JSON shape

* `include`, `files`, `exclude`, `outDir`, `rootDir`, `baseUrl`, and `tsBuildInfoFile` in an inherited config are resolved relative to the config that **declares** them. A shared `../tsconfig.base.json` with `"include": ["src"]` points at the base directory's `src`, not each package's. Keep path-bearing settings package-local, or use `${configDir}` deliberately (TS 5.5+).
* Every `extends` target must exist. Validate with the compiler, not `JSON.parse`: tsconfig is JSONC and supports `extends` arrays.
* In a workspace monorepo, after every graph edit and again before finishing, run `npx --yes @monorepo-utils/workspaces-to-typescript-project-references --check` from the repo root. Fix every difference by changing `references`, never by moving, deleting, or excluding sources. It only compares `references` with `package.json` workspace dependencies; check package boundaries, input coverage, `composite`, and import-only edges yourself (§2).
* To debug a single project, use `tsc --showConfig -p <project>` or `tsc -p <project> --listFilesOnly`.

## 4. Wire it into the repo's real build entry points

* Make the repo's **existing** root `build` or `typecheck` script run the solution build, e.g. `"typecheck": "tsc -b tsconfig.build.json && <existing check>"`, or put `tsc -b` inside each in-scope package's `build` script that the root `build` already runs.
* Don't leave the existing `typecheck`/`build` unchanged just to keep the diff small. A new script (`types:build`, `typecheck:build`, `build:types`, ...) that no root script or CI job invokes is not a migration.
* Preserve the existing bundler, task runner, and JS emission. Don't replace a working Lage, Nx, Turbo, Vue, `preconstruct`, or similar pipeline with `tsc -b`; integrate the declaration build into it as a deliberate step.
* Keep existing no-emit typechecks working or replace them with an equivalent that covers at least the same files.
* Check caches: task-runner caches can hide a broken build. Run the build uncached (or clean) at least once.

## 5. Isolated declarations

`isolatedDeclarations` requires `declaration` or `composite`. Enabling it is a source migration, not just a config flag: library code usually needs explicit annotations on exported functions, variables, classes, and object members.

* **Every declaration-emission path reads the option.** Bundlers and wrappers (`tsdown`/`rolldown-plugin-dts`, `tsup`, `unbuild`, `vite-plugin-dts`, `preconstruct`, `vue-tsc`, framework tooling) run their own declaration emit with the package's tsconfig, so enabling the flag can break them even when `tsc -b` passes. After enabling it, run the repo's real `build`, not only `tsc -b`.
* **Every declaration-emission path may also print declarations differently.** For example, tsdown/`rolldown-plugin-dts` switches from the `tsc` declaration generator to `oxc` when `isolatedDeclarations` is on. That changes the emitted `.d.ts` text (quote style, overload listing, ordering) even when the types are identical, so expect API/declaration snapshot tests to change (§6).
* Fix the resulting errors (TS9007, TS9010, TS9011, TS9038, ...) until the **enabled** build succeeds. Work package by package in dependency order. Hundreds of annotation errors are normal for this task and are the work itself; don't stop at "this is a larger source change than configuration". A build with the option disabled or with `--noCheck` is a diagnostic only.
* **Add the missing annotations by hand.** For each library project, in dependency order, build it with the option enabled and annotate each reported site. Write the smallest readable annotation that is faithful to the inferred type (what the old `.d.ts` contained):
  * prefer an existing named type over a long structural or `import("…")` type, and never widen to `any`/`unknown` (§6);
  * fix any new type errors in changed files (usually a type that must be exported or imported);
  * run the repo's formatter on the changed files once;
  * **run the repo's API/declaration snapshot tests from §0 immediately after the first annotation pass**, not only at the end, and handle any differences as in §6. Importing named types for annotations can change how declarations print, so declarations that printed `import("m").T` may now print `T`.
* Check inherited options that conflict. **TS5053** (`allowJs` cannot be specified with `isolatedDeclarations`): if the library's emission project has no JavaScript inputs, set `"allowJs": false` on that project and keep any JS files (configs, scripts) checked by a separate project or the existing broad checker.
* Runtime/tooling that consumes `tsconfig` (e.g. `ts-node`, test runners, scripts) may conflict with `composite`/`declaration`/`isolatedDeclarations` (TS5069 and similar). Give those tools a separate transpile/tooling configuration or override instead of removing the option from library emission.
* Never finish with `isolatedDeclarations` enabled in a config that the native build reads while that build still fails.

## 6. Don't weaken the public API

An annotation must describe the type that was inferred, not a looser one.

* Prefer existing named types, or write the faithful structural type. Look at the declaration the compiler emitted before the change (or `typeof` hover) and copy that.
* Avoid `any`, `any[]`, `unknown`, broad assertions, and widening to a supertype. Preserve generics, overloads, literal discriminants, optionality, `readonly`, writable vs read-only refs (e.g. `WritableComputedRef` vs `ComputedRef`), and framework component types.
* Compare emitted `.d.ts` or API-report output before and after. Compile representative consumers, including existing tests and demos that write to or narrow the exported values.
* Run the repo's API/declaration snapshot tests from §0 immediately after the first annotation pass (§5) and again at the end. **Never edit generated snapshot or API-report files by hand**; only the tool may write them. If they fail, classify every difference:
  * If any signature changed (a type, generic, optionality, `readonly`, overload set, or export), fix the annotation. Don't regenerate.
  * Printer-only differences are quote style, `import("m").T` vs an imported `T`, member or overload order, whitespace, and omitted default type arguments. If the declaration generator changed, first try keeping the previous generator through the bundler's own option (check its type definitions in `node_modules`).
  * If all remaining differences are printer-only, update the snapshots with the test tool's normal update flag (e.g. `vitest run --project <name> -u`).
  * If that update is refused by a breaking-change guard, regenerate **once** with the tool's documented override (e.g. tsnapi `allowBreaking`, api-extractor `--local`), scoped to that single command, and revert any temporary config change. Never leave an "allow breaking" override enabled in the repo, and never use one when a signature changed.
  * Then run the snapshot tests again in normal compare mode; they must pass.
  * In the final message, say whether snapshots were unchanged or regenerated, and list every regenerated symbol with the reason it is printer-only. Never say "updated" for an update the guard refused.

## 7. Preserve native tooling and runtime resolution

* Know who owns declaration output, `exports`/`types` conditions, aliases, generators, and caches before moving them. Tools like `preconstruct` own the package's `exports`/`types` fields: don't hand-edit them; use the tool's own `fix`/`validate` command, and run its install hook (e.g. `preconstruct dev`) to confirm.
* Keep declaration output out of runtime/source resolution: don't point tests or imports at generated `.d.ts` directories, and don't let generated declarations shadow source modules.
* Don't weaken checking to make the migration pass (`strict`, `checkJs`, `skipLibCheck` changes, new `exclude`s, `@ts-ignore`). Disabling a flag for a tooling-only project is fine; disabling it for the library is not.
   Exception: setting `"allowJs": false` on a declaration-emission project with no JS inputs is required for `isolatedDeclarations` (TS5053) and is not weakening, as long as the JS files stay checked elsewhere.

## 8. Verify and report honestly

Run, in order, and record which actually completed:

* In a workspace monorepo, `npx --yes @monorepo-utils/workspaces-to-typescript-project-references --check` with no differences.
* The repo's formatter (write mode) once on the files you changed, then its lint in **check mode**, before the final gates, instead of repeated lint runs. Don't run repo-wide fixers. If you do use a lint fixer, inspect `git diff` afterwards and revert every change that is not part of the migration (removed casts, rewritten imports, unrelated files).
* A clean reference build (`tsc -b --verbose`, after removing outputs and build-info), then an immediate second build that reports every project up to date. Its output already shows build order and incrementality; don't add temporary probe edits or exports to test rebuilds.
* The repo's native root `build`, `typecheck`, and full test surface from §0, including the API/declaration snapshot tests (uncached), with `isolatedDeclarations` enabled, plus any runtime/CLI smoke tests that existed before.

In the final message:

* Name the root script that now runs `tsc -b`, and show it passing.
* List the commands you ran with their results, including every test and API check from §0. Don't present the root `test` alone as the full suite.
* Say whether API/declaration snapshots were unchanged or regenerated, and list regenerated symbols (§6).
* If anything could not be run (install failure, time), say exactly what was and was not run. Don't claim success from a hand-written validator or from the config files looking correct.
