---
name: typescript-project-validate
description: Use before and after any change to a JavaScript or TypeScript repository's build, bundler, linter, formatter, test runner, module format or dependency versions (webpack to Vite/Oxc, ESLint to Oxlint, Babel to SWC, CommonJS to ESM, JavaScript to TypeScript, upgrades). Records the repository's checks before the first edit and reports regressions and weakened configuration after it. For CVE fixes, use dependency-security.
---

# TypeScript Project Validate

Give a change a before/after contract: run the repository's own checks before
the first edit, run them again after it, and let the runner report anything
that got worse — failing checks, removed `package.json` scripts, loosened
compiler options, and new suppression comments.

## A. Change tasks (default)

Use this path whenever the task edits the repository's code or tooling. For a
dependency-only or vulnerability fix, use *C* instead.

1. **Prepare the environment before anything else.** A baseline taken without
   installed dependencies cannot detect regressions. If `node_modules` (or
   Yarn PnP `.pnp.cjs`) is missing, run the frozen-lockfile install (`npm ci`,
   `yarn install --immutable`, `pnpm install --frozen-lockfile`); a frozen
   install is not a lockfile rewrite. Check that it succeeded (see *Installs
   and tools outside the runner*). In a monorepo, also build the workspace
   packages this package imports (Nx/Turbo `^build`, `yarn workspace <dep>
   build`). Put these commands in the plan's `setup` if they must rerun after
   the change (dependency or workspace-package edits).
2. **Write the plan** from the pristine tree (see *Discovery* and *Plan
   format*) at `<packageDirectory>/.copilot/typescript-project-validate/plan.json`.
   Do not prove commands by hand first; the baseline runs every check
   non-interactively and prints each failure. When the change creates a
   category (a JavaScript-to-TypeScript conversion adds `typecheck` and
   usually `build`), mark it `added` with its checks instead of `unavailable`.
   Added checks are skipped at baseline and must pass at compare.
3. **Capture the baseline before the first edit:**

   ```text
   node <skill-directory>/scripts/run-validation.mjs --package-directory <packageDirectory> --mode baseline
   ```

   Diagnose every failure before editing
   ([references/baseline-workflow.md](./references/baseline-workflow.md)):
   - `[ENV-FAILURE]` / `[ENV]` / `Baseline not usable` (missing command,
     uninstalled, stale or unbuilt dependency, registry auth): fix the
     environment as in step 1 and
     rerun. If it cannot be fixed here, remove the check, mark its category
     `blocked` with the reason, and rerun.
   - Plan defect (wrong command, cwd or flags): fix the plan and rerun.
   - Genuine project failure: keep it. Compare tracks its individual errors.

   Edit only after a baseline without `Baseline not usable`. The baseline also
   records the contract (scripts, tsconfig settings, suppressions).
4. **Make the change.** Keep every existing script working: when a tool is
   replaced, point the script at the new tool instead of deleting it. After
   editing dependencies in `package.json`, install them (`npm install
   --no-audit --no-fund --loglevel=error`, `yarn install`, `pnpm install`)
   and confirm the install exited 0.
   The runner reports `[ENV] installed dependencies do not match package.json`
   and fails compare when a declared dependency is missing or installed at a
   version outside its range, because the checks would then test a different
   tree than a fresh install gets.
5. **Compare** with the **unchanged** plan:

   ```text
   node <skill-directory>/scripts/run-validation.mjs --package-directory <packageDirectory> --mode compare
   ```

   Fix each `[REGRESSION]`, `[CHANGED-FAILURE]` and `[CONTRACT]` line. A
   changed failure is a check that failed before and still fails with new
   errors (`[NEW]` lines). Those errors come from your change, even in files
   you did not edit. While fixing, rerun only the affected checks with
   `--check <name>` (repeatable). Finish with one full `--mode compare`. Do not
   rerun anything after edits that cannot affect a check (docs, `.gitignore`).
   The runner rejects a plan edited since the baseline.
6. **Report** the comparison result, any remaining failure, and every
   `--accept`ed contract finding with the reason. Call an error pre-existing
   only when the runner reports it as `[PRE-EXISTING-FAILURE]` with the same
   errors as the baseline.

If you already edited before capturing a baseline, do not present a later
baseline as pristine. Stash the change (`git stash -u`), capture the baseline,
and restore it (`git stash pop`). Otherwise run `--mode standalone`, which in
a git repository compares the contract against `HEAD`.

## B. Health check only

Prepare the environment (A.1), write the plan, and run `--mode standalone`.

## C. Dependency and vulnerability fixes

Use the [dependency-security](../dependency-security/SKILL.md) skill: declare
the fix in every affected `package.json` (direct range, or `overrides` /
`resolutions` for transitive copies), not only in the lockfile. Use path A only
when the upgrade crosses a major version and dependencies install. If installs
cannot run (registry authentication, no network), skip the runner rather than
writing checks that can only fail, and report the blocker. A plan whose
categories are all `blocked`, `unavailable` or `out-of-scope` with reasons may
have no checks.

## Installs and tools outside the runner

- Keep install output short but **never hide errors**. npm: `--no-audit
  --no-fund --loglevel=error`, never `--silent` or `--loglevel=silent`. pnpm:
  `--reporter=append-only`. Yarn: `--silent` is fine.
- After every install, check the exit code (append `; echo "exit=$?"`) and
  that the change landed (`git diff --stat -- '*package.json' '*lock*'`)
  before running anything that depends on it.
- `ERESOLVE` or a peer-dependency conflict: read the conflicting peer range in
  the error and choose compatible versions, or add the required peer at that
  range as a direct devDependency. Never use `--force` or
  `--legacy-peer-deps`.
- Run tools through the repository's scripts, `npm exec --no -- <tool>`,
  `yarn <bin>` or `pnpm exec <bin>`. Never run a bare `npx <tool>`.
- If a command stops at `Need to install the following packages … Ok to
  proceed?` or any other y/n prompt, decline it (`n` or Ctrl-C). The local
  binary is missing, which means the previous install failed: fix that install.
- Do not ask the user to approve an install, a version choice or any other
  step you can decide yourself; the task may be running unattended. Decide,
  act, and report. If you are truly blocked, say what blocked you in the final
  message instead of ending on a question.

## Discovery

- Sources of truth, in order: CI workflows, root and package `package.json`
  scripts, contributor docs, task-runner config (Turbo, Nx, Lerna, workspaces),
  then tool configs. Use the package manager implied by the lockfile. Install
  only with the lockfile frozen; do not regenerate the lockfile unless the
  change itself edits dependencies.
- **Script inventory.** Every existing script that builds, bundles,
  typechecks, lints, formats or tests, and every lifecycle hook (`pre*`/`post*`
  such as `prestart`, `postinstall`, `prepare`), is either a plan check or
  deliberately left out. Removing or renaming an existing script is a
  regression unless the user asked for it; the runner flags it.
- **Check the script, not the tool.** Call the repository's script
  (`npm run lint`) rather than the tool binary, so that when the task replaces
  the tool (Healthier → Oxlint, webpack → Vite) the same check exercises the
  replacement.
- **Scope lint and format checks to the package.** Formatter checks
  (`prettier --check`, `format:check`, `biome format`) belong in the `lint`
  category. In a monorepo, a root script that covers unrelated paths can fail
  for unrelated reasons and hide your regressions. Run the root tool on the
  changed package's paths instead (`yarn prettier --check packages/x/src
  packages/x/build.mts`, `yarn eslint packages/x`).
- Plan for what the change can affect. Run `package` only as a side-effect-free
  dry run (`npm pack --dry-run`, `electron-builder --dir`); otherwise mark it
  `out-of-scope`. Never run publishers or full installers as checks.
- Electron, servers, web apps, CLIs: read
  [references/runtime-checks.md](./references/runtime-checks.md) before marking
  runtime `blocked`. Electron main/preload bundles and dev builds run headless.
- More detail: [references/discovery.md](./references/discovery.md).

## Plan format

```jsonc
{
  "version": 1,
  "projectType": "cli", // webapp, server, cli, electron, library, framework, plugin, other
  "workspaceRoot": "../..", // optional: lets relative cwd reach a monorepo root
  "categories": {
    "typecheck": { "status": "covered" },
    "lint": { "status": "covered" },
    "build": { "status": "covered" },
    "test": { "status": "covered" },
    "package": { "status": "out-of-scope", "reason": "Publishing is not affected." },
    "runtime": { "status": "covered" }
  },
  "checks": [
    {
      "name": "format-check", // unique kebab-case
      "category": "lint",
      "kind": "process",
      "cwd": "../..", // relative to packageDirectory
      "command": "yarn",
      "args": ["prettier", "--check", "packages/cli/src"],
      "verificationMethod": "exit-code",
      "expected": "0",
      "timeoutSeconds": 180
    }
  ]
}
```

- Category status: `covered` (at least one check uses the category),
  `added` (the change creates it; its checks are skipped at baseline and must
  pass at compare), `unavailable` (the project has no such operation and the
  change does not add one), `blocked` (it exists but cannot run here), or
  `out-of-scope` (it exists, but this task cannot affect it or running it has
  side effects). Every status except `covered` needs a `reason`. Checks run
  with `CI=1` and `npm_config_yes=false`, so `npx` fails fast instead of
  prompting or downloading.
- Write `plan.json` as 2-space JSON with a trailing newline, so repository
  formatters accept it.
- Relative `cwd` resolves from `packageDirectory` and may reach anywhere inside
  the git repository (or `workspaceRoot`).
- Optional fields: `setup` commands, `env`, `prependPath`, a managed
  `devServer` with `http` checks, and `output-contains` verification. See
  [references/plan-schema.md](./references/plan-schema.md) and
  [examples/monorepo-package-plan.json](./examples/monorepo-package-plan.json).

## Runner output

The console shows everything you need: failures with exit code and output
tail, new errors, non-covered categories and contract findings. Result files
live under the git directory and the plan directory is git-excluded, so neither
appears in the diff (`git add -f` the plan only if the user wants it).

## Do not weaken the project to get a green check

The project's configuration is part of the validation contract. Do not make a
check pass by:

- changing `module`/`moduleResolution`/`target` away from what the runtime
  needs (for example `node16`/`nodenext` to `bundler`);
- enabling `skipLibCheck`; disabling `strict`, any `strict*` flag,
  `noImplicitAny` or `checkJs`;
- adding `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `as any`,
  explicit `any`, `as unknown as` double assertions, or `declare module`
  stubs that shadow a package's real types;
- disabling or downgrading lint rules, or adding `eslint-disable` comments;
- installing with `--force` or `--legacy-peer-deps`, or adding them to
  `.npmrc`.

Fix the underlying error, including errors your change causes in files you did
not edit. Do not narrow the user's request to keep a check green. If you still
cannot fix it, leave the check failing and report it, naming the option you did
not change. The runner reports weakening as `[CONTRACT]` findings, judged by
effective values (removing `"checkJs": false` does not turn `checkJs` on). Pass
`--accept <id>` only when the user's request requires that exact change, and
say so in the final message.

**Module format.** A package that Node runs directly — a CLI, server, script
or Node library with `"type": "module"` or ESM output — needs `module` and
`moduleResolution` set to `nodenext` (or `node16`/`node18`/`node20`), and
relative imports with `.js` extensions. Use `bundler` only for code that a
bundler consumes. For CommonJS to ESM, fix the interop errors (`__dirname`,
`require`, JSON imports, and default imports of CommonJS packages that set
`exports.default`, such as `@babel/traverse`, which now import the module
object: use `mod.default ?? mod`) rather than switching resolution.

**JavaScript to TypeScript.** Converting a package means every source file
under its source roots becomes `.ts`/`.tsx`. Tests, generated output, fixtures,
and config files the toolchain requires in JavaScript are exempt. `allowJs` may
help during the conversion but must be off at the end. A new tsconfig starts
from `"strict": true`, without `skipLibCheck`. In the plan, mark `typecheck`
`added` with a check that runs the new typecheck (`tsc --noEmit -p
<tsconfig>` or the new script), and do the same for `build` if the package
had none, so the runner compiles the converted package. Then work in a few
large batches, not file by file:

1. Rename and convert syntax in bulk (a codemod or one batch per directory):
   `.js` → `.ts`, `require`/`module.exports` → `import`/`export`.
2. Give dependencies real types first: add `@types/<package>` when it exists,
   and build workspace packages so their declarations exist. Never write
   `declare module '<package>'` for a package that has types. For a package
   with no types at all it is a last resort; name it in the final message.
3. Write the shared domain interfaces (requests, responses, options,
   collections) in one types module, derived from how the code uses them,
   before fixing individual files.
4. Run `--check typecheck` once; it prints the error count per file. Fix each
   file's whole error list in one edit, several small files per turn, and
   rerun once per batch. A package of about 25 modules should need a few dozen
   typecheck runs, not hundreds.

Type dynamic data with `unknown` plus narrowing, `Record<string, unknown>`, or
interfaces derived from how the code uses it, never `any` or `as unknown as`.
The runner reports `[CONTRACT] js-sources-remaining` while non-test JavaScript
sources remain. If a file truly cannot be converted, list it and the reason in
the final message as unfinished work.

## Principles

1. Prefer repository-owned scripts and the commands used by CI.
2. Invoke executables directly with argument arrays; do not wrap ordinary
   commands in `sh -c`, `cmd /c`, or PowerShell.
3. Keep checks deterministic, non-interactive, non-watch, and bounded by
   timeouts. One check proves one concern; a build does not replace tests.
4. Do not install a new test framework or generate tests merely because a test
   script is absent. Record the category as unavailable.
5. Keep command output bounded without hiding errors: redirect long build or
   test output to a file and read its tail, and use `--reporter=dot` for
   verbose test runners. For installs, follow *Installs and tools outside the
   runner*. The runner already keeps an output sample.
6. When a task changes dependencies, require the change in `package.json`, not
   only in the lockfile. A lockfile-only edit is not durable because the next
   lockfile regeneration can restore the old version. For vulnerability fixes,
   use the [dependency-security](../dependency-security/SKILL.md) skill.
