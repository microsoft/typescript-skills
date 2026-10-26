---
name: typescript-publish-types
description: How to publish TypeScript declarations from an npm package so consumers actually resolve them. Use this when asked to add types/typings to a package, ship .d.ts files, fix "Could not find a declaration file for module", or make a package's published types resolve correctly.
---

Your role is to make every public entry point of a package resolve to a declaration file **from the
packed tarball**, without breaking the existing build.

The job is not done when `package.json` has a `types` field. It is done when a fresh consumer,
installing the tarball you would actually publish, gets types for every entry point they can import.

## Order Of Work

Each step has a check that must pass before you move on. Do the preflight first: most wasted work in
this task is a late discovery of the runtime, the package manager, or a lifecycle script.

0. [Preflight](#0-preflight)
1. [Inventory every public entry point](#1-inventory-every-public-entry-point)
2. [Emit declarations](#2-emit-declarations)
3. [Route every entry point to its declaration](#3-route-every-entry-point-to-its-declaration)
4. [Make sure the declarations are in the tarball](#4-make-sure-the-declarations-are-in-the-tarball)
5. [Verify as a consumer](#5-verify-as-a-consumer)
6. [Prove you didn't break the build](#6-prove-you-didnt-break-the-build)

## 0. Preflight

One pass, before you edit anything. Write the answers down; every later command depends on them.
Run it from the repo root; it prints only what it finds, and exits 0 whether or not a lockfile
exists — do not paper over the absent cases with `2>/dev/null` or `|| true`.

```bash
pwd; node -v; npm -v
for f in package-lock.json yarn.lock pnpm-lock.yaml bun.lock; do
  if [ -e "$f" ]; then echo "lockfile: $f"; fi
done
node -e 'const p = require("./package.json");
console.log("name:", p.name, "| type:", p.type ?? "commonjs", "| engines.node:", p.engines?.node ?? "unset");
console.log("workspaces:", JSON.stringify(p.workspaces ?? null));
for (const [k, v] of Object.entries(p.scripts ?? {})) console.log("script", k + ":", v)'
```

No `lockfile:` line means there is no lockfile: decide the package manager deliberately rather than
defaulting. `workspaces` tells you whether this is a monorepo without listing the tree; for pnpm,
read `pnpm-workspace.yaml` instead.

Record:

- **Absolute paths** of the repo root and of the package you are fixing. They differ in a monorepo,
  and packing the wrong one produces a thousand-line manifest of the wrong package.
- **Package manager**, from the lockfile — not from habit. Use that one manager for everything.
- **Node: declared versus actual.** Compare `node -v` against `engines.node`, `.nvmrc`, and any CI
  config. A test suite that fails under Node 18 when the package declares Node 24 is an environment
  mismatch, not a regression in your change. Find this out now, not after a day of bisecting.
- **Which tools already exist**: `typescript`, the bundler, `publint`, `@arethetypeswrong/cli` in
  `devDependencies` or `node_modules`. If `node_modules` is missing, install now with the repo's own
  manager and lockfile. Do not re-discover a missing tool once per step.
- **Lifecycle scripts**: `prepare`, `prepack`, `prebuild`, `pretest`, `build`, `test`, and any
  `watch:*`. These determine what your commands actually run. A `prebuild: npm install` means every
  build reinstalls; a `pretest` that deletes the build output means a build followed by `npm test`
  threw the build away.
- **Monorepo prerequisites**: which sibling packages must be built first, and the exact command.

Then:

- Give every command its own directory: `npm --prefix <abs-pkg-dir> run build`, or
  `(cd <abs-pkg-dir> && ...)`. Never rely on a previous command having left the terminal somewhere.
- Use `git status` at the repo root, not inside the package, so you see stray artifacts elsewhere.

## 1. Inventory Every Public Entry Point

**This is the step that is most often done wrong.** Fixing `exports["."]` and stopping is the single
most common failure. Write the list down before you edit anything.

Read the package's `package.json` and enumerate:

- `main`, `module`, `browser`, `types`/`typings`
- **every key in `exports`** — `"."`, `"./browser"`, `"./api"`, `"./cli"`, wildcards like `"./*"`.
  `"./package.json"` needs no types; everything else does.
- **every condition inside each `exports` key** — `import`, `require`, `node`, `browser`,
  `default`. A `require` condition that resolves to CJS needs its own CJS declaration.
- `typesVersions`, if present
- **if there is no `exports` map at all, the deep paths consumers already import.** Every published
  file is reachable today. Adding an `exports` map makes all of them unreachable except the ones you
  list — a breaking change you did not intend. Either keep the existing shape, or enumerate the deep
  paths (`grep -rn "from '<pkg>/" --include='*.ts' --include='*.js'` across the repo, plus the
  README and tests) and export them too.

`exports` also has a legacy array form, which is easy to skim past:

```jsonc
"exports": {
  ".": [{ "import": "./build/lib/index.js" }, "./build/lib/index.js"],
  "./browser": ["./browser.js"]      // <- still a public entry point, still needs types
}
```

Enumerate it mechanically rather than by eye:

```bash
node -e 'const e=require("./package.json").exports; console.log(JSON.stringify(e,null,2))'
```

Every path in that output is something a consumer can `import`. All of them need a declaration
route.

## 2. Emit Declarations

Find how the package builds, then enable declaration output **there**. Adding `"types"` to
`package.json` without emitting a `.d.ts` produces a package that is worse than untyped — it points
at a file that does not exist.

| Build system | How to emit declarations |
|---|---|
| `tsc` | `"declaration": true` in the tsconfig that produces the shipped output (watch `noEmit`, and project references/`composite`) |
| `tsup` | `dts: true` in `tsup.config.ts` |
| `vite` | `vite-plugin-dts` |
| `rollup` | `rollup-plugin-dts`, as a second bundle whose input is the entry `.ts` |
| `esbuild` | esbuild does not emit declarations — run `tsc --emitDeclarationOnly` alongside it |
| `api-extractor` | `@microsoft/api-extractor` to roll many `.d.ts` into one |

Rules that cost whole runs when ignored:

- **Extend the existing build; do not invent a parallel one.** A standalone `tsc` config in a repo
  whose bundler resolves workspace aliases emits a nested multi-package tree that routes nowhere.
  If the repo bundles, use that bundler's declaration emitter.
- **Configure a declaration plugin from the version that is actually installed**, not from memory.
  Option names move between majors — `vite-plugin-dts` renamed `rollupTypes` to `bundleTypes`, and
  bundling needs an API Extractor peer dependency. Read the resolved copy before you configure it:

  ```bash
  node -p 'require("vite-plugin-dts/package.json").version'
  sed -n '1,120p' node_modules/vite-plugin-dts/README.md
  ```

  Then make all the dependency changes at once, through the package manager, in one install.
- **`tsc` does not copy hand-written `.d.ts` inputs to the output directory.** If your source tree
  contains declarations or module augmentations that the public API references, copy them into the
  output or bundle them in. Do not weaken the types to make the reference disappear.
- **Generate declarations for published sources only.** Tests, fixtures, and benchmarks in the
  output are noise, and they drag their own dependencies into the declaration graph.
- If the tsconfig sets `"noEmit": true` for type checking, do not flip it — emit from the build
  config, or add a separate `tsconfig.build.json`.
- If you add a build dependency, **update the lockfile too**, or a clean `npm ci` /
  `--frozen-lockfile` install fails for everyone.
- Confirm the output exists on disk before continuing:

  ```bash
  find <outDir> -name '*.d.*ts' | head
  ```

## 3. Route Every Entry Point To Its Declaration

Set a `types` condition for each entry point you inventoried. **`types` goes inside the format
branch, immediately before that branch's `default`** — not once at the top of the entry:

```jsonc
{
  "name": "my-pkg",
  "type": "module",
  "main": "./dist/index.cjs",
  "types": "./dist/index.d.cts",             // Node10 fallback only; see below
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./browser": {                           // subpaths need the same shape
      "import": { "types": "./dist/browser.d.mts", "default": "./dist/browser.mjs" },
      "require": { "types": "./dist/browser.d.cts", "default": "./dist/browser.cjs" }
    },
    "./package.json": "./package.json"
  },
  "typesVersions": { "*": { "browser": ["./dist/browser.d.cts"] } }
}
```

A package that ships one format needs one branch per entry, `{ "types": ..., "default": ... }`, and
no `.d.mts`/`.d.cts` at all.

Rules:

- **Within any object of conditions, `types` must come before `default`.** Conditions match in
  order, so a `default` ahead of `types` wins and the entry ships untyped.
- **Dual-format entries need two declaration files, one per branch.** A single `types` shared by
  `import` and `require` cannot be right for both: under `node16`/`nodenext` a declaration's module
  format comes from its extension, or from the package's `type` field for a plain `.d.ts`.
- **A plain `.d.ts` is not "the CJS one".** In a `"type": "commonjs"` package it is CJS; in a
  `"type": "module"` package it is ESM. Shipping a plain `.d.ts`/`.js` pair from a `"type": "module"`
  package under a `require` condition is the masquerading error `attw` reports as
  `CJSResolvesToESM`. Only add `.d.mts`/`.d.cts` where the two branches genuinely differ — but where
  they do, add both.
- **Legacy (Node10) resolution ignores `exports` entirely.** It reads top-level `types`, and for
  subpaths it reads `typesVersions` — as above, pointing at the CJS declaration, since Node10
  consumers are CJS. Restructuring `exports` will never fix a Node10 subpath failure.

## 4. Make Sure The Declarations Are In The Tarball

Declarations that are generated but filtered out of the tarball are the second most common failure,
and nothing in the source tree reveals it. Check all four filters:

- `files` in `package.json` — including **negations**, e.g. `"!*.d.ts"`, `"!*.d.cts"`. Packages that
  once had broken types often still carry these exclusions; they will silently drop your new output.
- `.npmignore` — a bare `*.ts` line excludes `.d.ts`. Fix by re-including rather than deleting:

  ```text
  *.ts
  !**/*.d.ts
  ```

- `.gitignore` — npm falls back to it when there is no `.npmignore`
- the build's `clean`/`rimraf` step, which may wipe declarations after emitting them

Then make one scratch workspace and produce **one** real tarball in it, with lifecycle scripts
enabled:

```bash
mktemp -d                                     # note the path it prints; use it literally below
(cd <abs-pkg-dir> && npm pack --pack-destination <workspace>)
```

Use the printed path verbatim in every later command. A shell variable does not survive between
commands any more reliably than the working directory does, and a fixed path like `/tmp/pkgcheck`
fails the first time because nothing created it.

Assert the inventoried paths against the tarball instead of reading the whole manifest — a full
file list of a large package buries the answer and costs a re-read:

```bash
tar -tzf <workspace>/<name>-<version>.tgz | grep -E '\.d\.(m|c)?ts$'
```

Every declaration you routed in step 3 must appear, by exact path. Do not accept "the path is under
a directory that is already allowlisted" as proof.

Keep the workspace: steps 5 and 6 reuse this tarball and write their reports beside it. Delete it
(`rm -rf <workspace>`) when you finish, whether or not the task succeeded, and re-pack only when
the sources, build config, `package.json`, or dependencies change — note that `--dry-run` is fine
for reading a manifest but produces no artifact to install.

If packing fails because a `prepare`/`prepack` hook needs tools that aren't installed, install
dependencies and pack again. **Never pass `--ignore-scripts` and present the result as release
evidence**: the hook is part of what publishing runs.

## 5. Verify As A Consumer

Metadata can be well-formed and still not resolve. Run the tools built for this, against the tarball
you already produced:

```bash
npx --yes publint run <tarball>
npx --yes @arethetypeswrong/cli --format table <tarball>
```

`attw` is the check that catches a subpath export with no types, a `require` condition with no CJS
declaration, and ESM declarations masquerading as CJS. It reports **per entry point**, which is
exactly the blind spot in step 1. If you run only one verification tool, run this one.

**An `attw` failure in a mode the package supports is a failure.** Finding *a* declaration file is
not the same as that file having the right module semantics: a successful path-only probe does not
overrule `export =` missing from a CJS entry, or an ESM declaration served to `require`. Fix it, or
report it as an unresolved failure in your summary. Never drop it silently.

### When a checker misbehaves

Sort the output into four kinds before reacting:

| Symptom | What it means | What to do |
|---|---|---|
| Errors naming your entry points, conditions, or files | Real package diagnostics | Fix the package |
| An internal stack trace, e.g. `Cannot read properties of undefined (reading 'filename')` | The checker crashed | Retry **once** with a genuinely different input (explicit tarball instead of `--pack`), then use the [packed-consumer check](consumer-check.md) |
| `publint` and `npm pack` disagree about what is published | The checker inspected a different artifact or pack manager | Inspect the real archive from the repo's own manager (`yarn pack`, `pnpm pack`) and compare. Do not add metadata to make the message go away |
| A `publint` "suggestion", or a warning about a mode the package does not support | Optional | Leave it. Do not add `"type": "commonjs"`, change `default`, or restructure exports to silence advice — the warning usually survives and the change breaks something real |

Cycling through `attw` option permutations after the same internal error is not a discriminating
retry. One new hypothesis per attempt; when you run out, switch to the packed-consumer check.

Capture the report to a file and read the file rather than re-running the tool, and be careful with
`&&` chains: if the checker exits nonzero the formatter never runs, and the report is already there.

```bash
npx --yes @arethetypeswrong/cli --format json <tarball> > <workspace>/attw.json; echo "attw exit=$?"
node -e 'const p = require("<workspace>/attw.json").problems;
for (const [kind, list] of Object.entries(p)) for (const x of list)
  console.log(kind, x.entrypoint ?? x.fileName ?? "", x.resolutionKind ?? x.resolutionOption ?? "")'
```

`problems` is an object keyed by problem kind, empty when the package is clean. Report the real exit
status. Suppressing it with `|| true` hides the failure from the shell, not from your consumers.

### Offline, or when the checkers are broken

Use [consumer-check.md](consumer-check.md): a tested script that installs the packed tarball into a
throwaway consumer and type-checks an import of each entry point it is given, in every mode that
entry publishes. It
derives entries from the tarball's own `exports` map, so **pass your step-1 deep imports and any
concrete wildcard subpaths as arguments** — a package with no `exports` map has no enumerable
subpaths, and it will otherwise probe only the root and pass while the deep paths are untyped.

Do **not** call `ts.resolveModuleName(spec, '/tmp/consumer.ts', ...)` from the repo. Nothing installs
the package into `/tmp`, so it reports `UNRESOLVED` for a perfectly good package, and a resolution
lookup alone cannot see a broken import *inside* a declaration.

If the repo has a type test (`test/typescript`, `*.test-d.ts`, `tsd`, a `test:typescript` script),
run it too.

## 6. Prove You Didn't Break The Build

Turning on declaration emission changes what the compiler checks. It surfaces errors the build never
had — "has or is using name X from external module but cannot be named", inferred types referencing
private symbols, and deprecation errors from tooling that calls `tsc` internally. These are real
regressions, and they are easy to miss because the types goal appears met.

Run the checks your change can invalidate, once each:

| What you changed | What that invalidates |
|---|---|
| Source, build config, or tsconfig | build, pack, consumer checks, tests |
| `package.json` routes or `typesVersions` only | routing/resolution and pack checks — not the runtime suites, not the install |
| Dependencies, the lockfile, or install-affecting config | the clean/frozen install, build and tests, **and** pack plus consumer checks, since a dependency change can change the declarations you emit |

A successful check stays valid until something it depends on changes. Re-running an unchanged
runtime suite after a metadata-only edit buys nothing. Equally, do not let lifecycle scripts run
work twice: if `pretest` compiles, `npm run build && npm test` compiles twice and throws the first
build away. Read the scripts from the preflight and chain accordingly.

Before you report success, each of these guarantees must hold, backed by evidence produced *after*
the last change that invalidated it:

- **A clean, frozen install** — `npm ci` / `pnpm install --frozen-lockfile` / `yarn --immutable` —
  proving the manifest and lockfile you are shipping install from scratch. It must postdate your
  final dependency or lockfile edit. A clean install done *before* that edit proves nothing about
  what you are shipping; redo it, or say plainly that it predates the change. If you changed no
  dependencies at all, an earlier clean install still counts — name it.
- **Build and test evidence for the current sources and config.** If your last edit was
  routes-or-`typesVersions`-only, the green build and suites you already have are still valid:
  reuse them and say which run they came from. Do not repeat them "to be safe" — that is exactly
  the repetition this list exists to prevent.
- **Pack and consumer evidence for the current artifact**, from step 4 and step 5.

Run any install you do need **from a clean state**, not the warm `node_modules` your own ad-hoc
installs produced. A build that only works in your session is a broken build.

If the build pipeline changed, check the `watch:*` scripts too — they usually duplicate the build
command you just rewrote, and they break silently.

Do not dismiss a failing check as "pre-existing". Either confirm it against an unmodified baseline —
a second checkout or `git worktree add`, never by stashing or resetting the working tree — or report
it as failing and unexplained.

## Forbidden Fixes

Declaration emission is a correctness check. Do not silence it.

- Do not add `ignoreDeprecations`. It is a short-lived compatibility window, not a fix. If a build
  tool's own internals trip a deprecation, upgrade or configure **that tool**.
- Do not downgrade TypeScript to dodge a declaration-tool problem. Fix or replace the tool.
- Do not add `// @ts-ignore`, `// @ts-expect-error`, or `// @ts-nocheck` to make declaration emission
  succeed.
- Do not widen exported types to `any` to avoid a "cannot be named" error. Export the referenced
  type instead — if it appears in a public signature, it is already part of your public API.
- Do not turn on `skipLibCheck` to hide errors in the declarations you just generated. Those errors
  are what your consumers will see.
- Do not delete a `files`/`.npmignore` exclusion wholesale when a narrower re-inclusion works, and do
  not delete a type test that fails.
- Do not hand-write a `.d.ts` that duplicates generated output. It will drift.
- Do not edit `package.json` metadata solely to quiet a checker you have not explained.

## Environment

These cost whole runs when they aren't anticipated:

- **The checkout may have no `node_modules`.** `tsc: not found`, `vite: not found`, and a failing
  `prepare` hook usually mean this, not a broken config. Install once, in the preflight. Shipping
  unverified because a tool was missing is not acceptable.
- **Anything interactive hangs until the run dies.** Use `npx --yes`, `npm init -y` (plain
  `npm init --silent` still prompts for a name), and package-manager flags that never prompt.
  Prefer writing a two-line `package.json` to running an initializer at all.
- **Work in a temporary directory and delete it on failure as well as success** —
  `trap 'rm -rf "$WORK"' EXIT`. A `.tgz` or a scratch consumer left in the tree ends up in the diff.
- **`rg` may not be installed.** Fall back to `grep -rn` / `find` rather than retrying it.
- **Bash history expansion eats `!` inside double quotes.** Verification one-liners like
  `node -e "... if (!paths.includes(x)) ..."` fail with `event not found`. Use single quotes around
  the script, or write it to a file.
- **Extra arguments do not always reach the underlying tool.** `npm test -- --runInBand` can arrive
  as `jest "--" "--runInBand"`, which Jest reads as a test-name pattern and then reports that no
  tests matched. Read the script and pass arguments the way it forwards them.
- **Keep JSON indentation consistent with the file.** Re-read the file after patching
  `package.json`; a mis-indented insertion is a pointless extra review cycle.

## Summarize

Keep it short and verifiable. Report:

- Each public entry point and the declaration file it now resolves to, per module mode — the table
  from `attw` or the packed-consumer check, not a full tarball listing
- How declarations are emitted (which config/tool changed)
- The exact packed paths you asserted in step 4
- Build, test, and clean-install results, with the commands that produced them

Then, in the same summary and without softening:

- Every check you could not complete, and why — a crashed checker, an offline tool, a suite you did
  not run. An unfinished check is not a pass.
- Every failure you are leaving behind, including `attw` diagnostics in supported modes.
- Anything that only worked with help: a stubbed binary, a shim on `PATH`, a hand-set environment
  variable. Say so; it makes the result narrower than "the build passes".
- Any failure you call pre-existing, with the baseline comparison that establishes it.
- The output of a repo-wide `git status`, so stray tarballs, caches, or edits in other packages are
  visible rather than shipped.
