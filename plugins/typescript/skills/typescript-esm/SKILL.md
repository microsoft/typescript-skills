---
name: typescript-esm
description: Convert a TypeScript package from CommonJS to native Node.js ESM. Use when asked to migrate a package to ESM, set "type" to "module", switch to node16/nodenext modules, or fix ERR_MODULE_NOT_FOUND / TS2835 after such a migration.
---

Your role is to convert one TypeScript package from CommonJS to ECMAScript modules that Node.js
executes natively, leaving typecheck, lint, tests, build, and the built entry point all green.

## When this applies

Use this skill when **Node.js executes the emitted JavaScript**: a CLI, a server, a build script, or
a library published as ESM. If the code is only ever consumed by a bundler (Vite, esbuild, webpack,
Rollup), it usually wants `"moduleResolution": "bundler"`, where extensionless specifiers are
correct; do not add `.js` everywhere there.

### A request to convert is the authorization — do not stop to ask

If the user asked you to convert the package to ESM, do it: pick an option below, implement it,
verify it, and state the trade-off in your summary. "Convert to ESM" means `"type": "module"` with
ESM entry points. Keep a dual CJS+ESM build only if the user asked for one, or the repo already ships
one and the request says to preserve it.

When something still `require()`s the package's output — CJS consumers, or a tool that loads your
files with `require()` (jscodeshift transforms, ESLint/Babel plugins, Jest transformers, config
loaders) — first read the CI matrix and `engines.node`, then:

 1. **CI tests only Node 20 or newer (or there is no CI):** rely on `require(esm)`, which works on
    **`^20.19.0 || >=22.12.0`** when nothing in the import graph uses top-level `await`. Set
    `engines.node` and CI to that range, even if `engines` named an older, untested floor.
 2. **CI tests a Node major below 20, or the user asked to keep supporting one:** keep those
    versions. The package stays `"type": "module"`; emit or keep a `.cjs` file (or a small `.cjs`
    wrapper) only for the entry that is `require()`d. `bin`, `main`, and `exports["."]` are ESM.
    Details: [config-and-tooling.md](references/config-and-tooling.md#tools-that-require-your-output).
 3. **Stop only if neither keeps a documented entry point working**, or if it needs a forbidden fix.

Dropping a Node major that CI tests is a **breaking change**: do it only if the user asked, and
label it "breaking" in your summary.

## Workflow

Work in this order. Do not skip step 7. This skill ships two dependency-free Node scripts; run them
by path from the directory you read this SKILL.md from (for example
`.github/skills/typescript-esm/`), shown as `<skill-dir>`:

* `node <skill-dir>/scripts/rewrite-relative-specifiers.mjs <package-root>`
* `node <skill-dir>/scripts/scan-esm-leftovers.mjs <package-root>` — exits 1 while leftovers remain.

Files under `.github/skills/` are tooling, not repo code. If the repo's lint or format check reports
them, that is not a regression; do not edit them.

**Running gates.** Run every test suite and lint the same way, with the log outside the repo:

```bash
CI=1 npm test > ../esm-gate.log 2>&1; echo "exit=$?"; tail -n 30 ../esm-gate.log
```

* Pass/fail is the `exit=` value, never a `grep` for `passing`. `npm test` may run lint in
   `pretest`/`posttest`, so green tests followed by `exit=1` is a failure.
* Read results from the log file, never from `get_terminal_output` or an earlier terminal buffer.
* While iterating, run only the focused test files you touched. Run the full suite at most twice:
   after the bulk rewrite and at the end.

**Shell hygiene.** Never put `!` inside a double-quoted `node -e "…"` or `bash -c "…"`: bash
history-expands it and the command never runs. Avoid `'"'"'` quote juggling. For anything longer
than one line, write a `.mjs` file or use a quoted heredoc (`node <<'EOF'` … `EOF`). Do not rely on
`rg`; use `grep -rnE` or `git grep -nE`.

### 1. Find the gates — do not run the test suite yet

Read the `package.json` scripts and CI config to find the commands, including ones the tests do not
cover, such as `node ./dist/cli.js --help`. If `node_modules` is missing, install with the
lockfile's package manager (`npm ci`, `pnpm install --frozen-lockfile`, `yarn install
--frozen-lockfile`).

Run the cheap gates now and note each exit code: typecheck, lint, build, and
`timeout 60 node dist/cli.js --help </dev/null`. **Do not run the test suite before editing.** If the
final run has failures, re-run only the failing test files on the original code (`git stash -u`,
run them, `git stash pop`) to decide whether each one is pre-existing.

Note which files each gate sees. Test files are often excluded from the typecheck `tsconfig.json`,
and Jest/Vitest resolve extensionless imports themselves. **A package can typecheck clean and pass
every test while still being broken under `node`.**

### 2. Switch the module system

In `package.json`, set `"type": "module"`. In `tsconfig.json`, set `"module"` to `nodenext` (or
`node16`/`node18`/`node20` if the project pins an older Node) and the matching `"moduleResolution"`.
Both are required: under these modes each file's output format follows `"type"` and its extension,
so changing only the tsconfig still emits CommonJS. Consider `"verbatimModuleSyntax": true`.

If a bundler or build script produces `dist/` (esbuild, tsup, Rollup, a `build.mts`), set its output
format to ESM too (`format: 'esm'` for esbuild), then check that `grep -l 'require(' dist/` finds
nothing.

See [references/config-and-tooling.md](references/config-and-tooling.md) for `exports`, `bin`,
shebangs, emit format, test runner, and formatter changes.

### 3. Rewrite every relative specifier to an explicit emitted-file extension

```bash
node <skill-dir>/scripts/rewrite-relative-specifiers.mjs <package-root>
git diff --stat
```

The script resolves each specifier on disk (`.ts`/`.tsx` → `.js`, `.mts` → `.mjs`, `.cts` → `.cjs`,
directory → `/index.js`) across `import`, `export … from`, `import type`, and `import()`. It prints
counts per directory, then what it could not fix: JSON imports, computed `import()` templates, and
unresolved specifiers. Handle that list by hand. It skips build output, `.github/skills`, and
test-data directories (`fixtures`, `valid-data`, …), which it lists for review.

Node requires the extension of the **emitted** file, so TypeScript sources import `./util.js`, and
`./lib` must become `./lib/index.js`. Work from the script's output, not the compiler's error list:
the compiler does not see excluded files. [references/specifiers.md](references/specifiers.md) has
the commonly missed file categories and `grep` fallbacks.

### 4. Replace CommonJS globals

`require`, `module`, `exports`, `__filename`, `__dirname`, `require.main`, `require.resolve`, and
`require.cache` do not exist in ESM. On Node 20.11+/21.2+, use `import.meta.dirname` and
`import.meta.filename`. Below that, or when the installed `@types/node` predates them, derive both
from `import.meta.url` with `fileURLToPath`. When you delete a `path.join(__dirname, …)`, check
whether `path` is still used before deleting its import.

### 5. Fix CommonJS dependency interop

Under `node16`/`nodenext`, a default import of a CommonJS dependency is its whole `module.exports`,
so files you never edited can stop typechecking. First check what Node actually gives you:
`node --input-type=module -e 'import m from "pkg"; console.log(typeof m, Object.keys(m))'`. Then:

* **`TS2349 This expression is not callable`**: when Node shows the callable on `.default`:

   ```ts
   import traverseModule from '@babel/traverse'
   const traverse = traverseModule.default
   ```

   If Node and the types agree but only the test runner differs, fix the runner config (Jest
   `extensionsToTreatAsEsm`, ts-jest `useESM`), not the source.
* **`TS2503 Cannot find namespace 'yargs'`**: `import type yargs from 'yargs'` then `yargs.Argv`
   no longer works. Import the named type: `import type { Argv } from 'yargs'`.
* **`TS2307 Cannot find module 'pkg/src/Thing'`** on a deep import: add the emitted extension
   (`'jscodeshift/src/Runner.js'`). That is the whole fix when the dependency has no `"exports"`.
* **`TS2339 Property 'scriptName' does not exist`** on `yargs()`: call
   `yargs(hideBin(process.argv))` with `import { hideBin } from 'yargs/helpers'`.

A named import from a CJS dependency can typecheck and still be `undefined` at run time; step 7.5
catches it. More in [references/globals-and-interop.md](references/globals-and-interop.md).

### 6. Re-run the formatter and linter over what you touched

Run the project's own `prettier --write` / `eslint --fix` on the changed files. Do not hand-format.

### 7. Verify, in this order

1. `tsc --noEmit` (or the project's typecheck script): **zero** errors.
2. Lint and format check, using the "Running gates" command.
3. Build.
4. The full test suite, once, using the "Running gates" command. Check any failures against the
   original code by test name (step 1).
5. **Run the built artifact, non-interactively and with a timeout.** For a CLI:
   `timeout 60 node dist/cli.js --help </dev/null`, then once from outside the repo in a subshell:
   `(cd /tmp && timeout 60 node "/abs/path/to/repo/dist/cli.js" --help </dev/null)`. For a library:
   `timeout 60 node --input-type=module -e 'await import("./dist/index.js")' </dev/null`. Never
   start a command that prompts without its `--yes`/non-TTY flags.
6. `node <skill-dir>/scripts/scan-esm-leftovers.mjs <package-root>` exits 0. Files under a nested
   `"type": "commonjs"` package are reported as intentional, not as failures.
7. **Review the manifest diff:** `git diff -- '*package.json'`. For every removed `dependencies`
   entry, `grep -rn "<name>" --exclude-dir=node_modules .` must find no remaining `import`/`require`;
   restore it otherwise. Confirm every `engines` and CI change is one you meant to make.

## Summarize

Report under these headings:

* **Node floor:** `engines.node` and CI matrix before → after. Say "breaking" if a Node major that
   CI tested was dropped.
* **`require()` consumers:** how they keep working (option 1 or 2), or "none".
* **Config:** `package.json`, tsconfig, build, test, and lint changes.
* **Specifiers:** how many were rewritten, by directory.
* **Interop fixes and workarounds:** each one and why, including every cast, banner, disabled rule,
   or `process.chdir`.
* **Gates:** each command you ran with its `exit=` code.
* **Left undone:** what, and why.

## Forbidden fixes

* No `// @ts-ignore`, `// @ts-expect-error`, or `// @ts-nocheck` on interop errors.
* No `any` casts and no double assertions (`as unknown as T`) to silence an import type, and no
   `m.default ?? m` shape-probing. Check the runtime shape with `node` and use the import that matches
   it (step 5).
* Do not weaken `strict`, `noImplicitAny`, or add `skipLibCheck` to hide new errors.
* Do not revert `moduleResolution` to `node10`/`bundler` to make `TS2835` disappear.
* Prefer fixing the source over a `__dirname`/`require` banner in the bundler config. A banner is a
   last resort for third-party code you cannot edit; if you use one, say so in your summary.

## When you cannot finish

Do not stop for something you can fix. CJS code in the same repo that imports the package: convert
it, or bridge it with `await import()` (a gulp plugin can stay `"type": "commonjs"` or `.cjs`). A
tool that `require()`s the output: use the options at the top. Leave something undone, and say what
and why, only when a dependency has no ESM entry point for what the code needs, or a gate would need
a forbidden fix.
