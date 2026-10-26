# Baseline and comparison workflow

Use this workflow for every task that changes the repository: tool swaps,
module-format changes, JavaScript-to-TypeScript conversions, upgrades,
dependency and security fixes, or changes to compiler settings, framework
configuration, emitted output, or runtime behavior.

## Before changes

1. Prepare the environment. Install dependencies with the lockfile frozen
   (`npm ci`, `yarn install --immutable`, `pnpm install --frozen-lockfile`)
   and build the workspace packages the target package imports. A frozen
   install does not rewrite the lockfile. Check each install's exit code;
   never hide its errors with `--silent`. Put these commands in the plan's
   `setup` when they must rerun after the change, so baseline and compare
   prepare the tree the same way.
2. Author the plan. Do not prove each command by hand; the baseline does that.
   Mark a category the change creates (`typecheck` in a JavaScript-to-TypeScript
   conversion) `added`, with its checks.
3. Run:

   ```text
   node <skill-directory>/scripts/run-validation.mjs --package-directory <packageDirectory> --mode baseline
   ```

4. Diagnose a red baseline before changing the project:
   - **Environment blocker** — `[ENV-FAILURE]`, `[ENV]`, or
     `Baseline not usable`. The cause is a missing command (exit 127,
     `command not found`), an uninstalled package (`Cannot find module`/
     `Cannot find package` for a bare specifier, `ERR_MODULE_NOT_FOUND`), an
     unbuilt workspace package (`TS2307` for a workspace package), an `npx`
     that would download a tool, registry authentication (401), or installed
     dependencies that do not match `package.json` (a declared dependency
     missing or outside its range). Fix it and
     capture a fresh baseline. If it cannot be fixed in this environment,
     remove the check, mark its category `blocked` with the reason, and
     capture a fresh baseline.
   - **Plan defect** — wrong command, cwd, or flags. Correct it and capture a
     fresh baseline.
   - **Genuine project failure** — keep the check. The baseline stores its
     individual errors; compare reports any new ones.

Do not capture a baseline after the change has begun. A repaired diagnostic run
must not be presented as the pristine baseline. The runner warns when the
working tree already differs from `HEAD` at baseline time. If you have
already edited, `git stash -u`, capture the baseline, then `git stash pop`.

The baseline also records the repository contract:

- every script in the root and package `package.json`;
- the effective `compilerOptions` (following `extends`) of each tsconfig in the
  package and at the workspace root: strictness flags, `skipLibCheck`,
  `allowJs`, `checkJs`, `module`, and `moduleResolution`;
- whether the package has a tsconfig or a `typescript` dependency, and its
  JavaScript source files (excluding tests, build output, fixtures,
  dot-directories and toolchain config files);
- counts of `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, lint-disable
  comments, explicit `any`, `as unknown as` double assertions, and ambient
  `declare module '<package>'` stubs (augmentations in files that import or
  export are not counted) in source files (git repositories only);
- `legacy-peer-deps`, `force`, and `strict-peer-deps` in `.npmrc`.

## After changes

Run the unchanged plan:

```text
node <skill-directory>/scripts/run-validation.mjs --package-directory <packageDirectory> --mode compare
```

The runner rejects a plan hash mismatch. Comparison outcomes are:

- unchanged pass;
- regression (pass to fail);
- changed failure: fail to fail, with errors that were not in the baseline.
  The new errors are printed as `[NEW]` lines;
- improvement (fail to pass);
- pre-existing failure: fail to fail, with no error occurring more often than
  in the baseline;
- added pass: a check of an `added` category passes (an added check that
  fails is a regression);
- inconclusive: a missing or skipped result, or a baseline check that failed
  for an environment reason.

Compare also fails, with an `[ENV]` line, when the installed dependencies no
longer match `package.json`: a dependency edit that was never installed (or
whose install failed) means the checks ran against a different tree than a
fresh install gets. Install, confirm the exit code, and compare again. A
failed check with many errors also prints its error count per file.

Errors are compared without line numbers, counting repeats, and a timeout
after a baseline run that finished counts as a new error. The runner recognizes TypeScript,
ESLint, Oxlint, Biome, Prettier, Jest/Vitest/TAP/AVA failures, missing scripts
and thrown errors. When it recognizes none, it compares error-looking lines
with digits normalized. Regressions, changed failures and inconclusive results
all fail the comparison. Never call an error pre-existing unless the same
error appears in the baseline output.

While fixing, rerun only the affected checks against the baseline with
`--mode compare --check <name>` (repeatable). That writes
`targeted-comparison-result.json` and leaves the full comparison alone. Finish
with one full compare.

Comparison also reports `[CONTRACT]` findings against the baseline contract:

- a removed or renamed `package.json` script;
- a loosened compiler option: `strict` or a `strict*` flag turned off,
  `skipLibCheck` turned on, `checkJs` turned off, or `module`/
  `moduleResolution` moved away from `node16`/`nodenext`;
- `allowJs` turned on without `checkJs`;
- a new tsconfig that starts weakened, judged by effective values:
  - `strict` explicitly false, or left unset (TypeScript's default is false)
    when the repository had no tsconfig or already uses `strict`;
  - `skipLibCheck: true`;
  - `allowJs` without `checkJs: true` (deleting `checkJs: false` does not clear
    it);
- `js-sources-remaining:<package>` — the package adopted TypeScript (it gained
  its first tsconfig or a `typescript` dependency), but non-test JavaScript
  source files remain;
- more suppression comments, explicit `any`, `as unknown as` or
  `declare module '<package>'` than before;
- `legacy-peer-deps` or `force` added to `.npmrc`.

Fix regressions and contract findings related to the change and rerun
comparison, up to three focused fix-and-retry cycles.

## Do not weaken the project

The project's configuration is part of the contract. Do not delete or weaken a
valid check, and do not make one pass by loosening compiler options, adding
`@ts-ignore`/`@ts-expect-error`/`as any`/`as unknown as`, declaring a typed
package as an untyped module, disabling lint rules, or installing
with `--force`/`--legacy-peer-deps`. Fix the underlying error, or leave the
check failing and report it with the option you did not change.

If the user's request requires a flagged change (for example, the user asked to
remove a script), accept that one finding explicitly and report it:

```text
node <skill-directory>/scripts/run-validation.mjs --package-directory <packageDirectory> --mode compare --accept script-removed:package.json:build:dll
```

If the intended validation contract must change, deliberately replace the
baseline by rerunning `--mode baseline` after reviewing the new plan. Never
silently compare different plans.
