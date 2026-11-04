---
name: typescript-update
description: Guidance for updating to the newer versions of TypeScript. Use this when you need to upgrade TypeScript or as part of a larger dependency update process.
---

<!-- prettier-ignore-start -->

Your role is to upgrade the project to the latest TypeScript version (7.x, or a later minor such as 7.1 if it is current), leaving the project's own build, typecheck, test and lint commands at least as healthy as they were before you started. You must always finish with the summary described in [Summarize](#summarize), even if you are blocked.

## How To Upgrade

1. **Record the baseline (cheaply).**
   - Read every `package.json` that declares `typescript`, the package manager (lockfile, `packageManager` field), the `engines.node` range, and `node --version`.
   - Identify the project's own `build`, `typecheck`/`check-types`, `test` and `lint` scripts.
   - Reuse an existing `node_modules` if present. Otherwise do **one** non-interactive install (see [Long-Running and Interactive Commands](#long-running-and-interactive-commands)). Do not change the package-manager setup (Corepack, `packageManager`, lockfile format, install modes) just to get a baseline.
   - Run each of those scripts once, logging output, and note which pass and which fail.
   - A red or uninstallable baseline is **information to report, never a reason not to upgrade**. Continue with the upgrade and compare against the baseline at the end.
2. **Read the version guides before your first edit.** Always read [6to7.md](6to7.md). Also read [5to6.md](5to6.md) if starting below 6.0, and [4to5.md](4to5.md) if starting below 5.0. Treat them as checklists of changes to apply up front, not as references to consult only after something breaks.
3. **Choose the package layout.** Run the API-consumer check in [6to7.md](6to7.md#does-the-project-need-the-typescript-api). If anything in the project or its dependencies uses the TypeScript API, use the side-by-side layout (`typescript` aliased to `@typescript/typescript6`, `@typescript/native` aliased to `typescript@7`) from the start. Otherwise install plain `typescript@7`.
4. **Apply all config changes in one pass.** Edit `tsconfig*.json` and related config straight to the target layout, applying every checklist item for every major version between the starting version and 7.0 (e.g. `types`, `module`/`moduleResolution`, `baseUrl`/`paths`, `rootDir`, `esModuleInterop`, removed options). Update `@types/*` and TypeScript-dependent tools (see [`@types` Dependencies](#types-dependencies)).
5. **Install and test each intermediate major version in order**, then the target version, rather than jumping straight to the target (e.g. 4.x -> 5.x -> 6.x -> 7.x).
   - At each version, typecheck with the newly installed compiler, rerun the project's baseline build, test and lint commands, and fix new errors before installing the next major version. Use the package layout chosen in step 3 when you reach the target version.
6. **Run the [Completion Gate](#completion-gate)**, then **[Summarize](#summarize)**.

## Long-Running and Interactive Commands

Installs and builds in large repositories can take several minutes. Agent terminals may move a command to the background after a timeout; the command is still running.

- Run installs, builds and tests non-interactively, with output redirected to a log file, e.g. `CI=true yarn build > /tmp/ts-upgrade-build.log 2>&1; echo "exit=$?"`. Then read the tail of the log.
- If the terminal tool reports that a command was moved to the background or timed out, keep polling its output (or the log file) until it exits. **Do not end your turn while a command is still running**, and never end a turn with an empty message.
- Never run commands that wait for input (e.g. `pnpm patch` without `--edit-dir`, `npx` without `-y`, `npm init`, project generators, `git rebase -i`). If a prompt appears anyway, answer it immediately and finish the workflow it started in the same turn.
- Prefer upgrading a dependency over patching it. If a dependency must be patched, persist the patch non-interactively and refresh the lockfile:
  - **pnpm:** `pnpm patch <pkg>@<exact-version> --edit-dir /tmp/patch-<pkg>`, edit the files there, `pnpm patch-commit /tmp/patch-<pkg>` (writes `patches/` and `patchedDependencies` and updates the lockfile), then verify with `pnpm install --frozen-lockfile`.
  - **yarn (berry):** `yarn patch <pkg>@npm:<exact-version>` prints a folder; edit it, run `yarn patch-commit -s <folder>`, then `yarn install`.
  - **npm:** edit `node_modules/<pkg>`, run `npx -y patch-package <pkg>`, and add a `"postinstall": "patch-package"` script.

## Forbidden Fixes

Do not paper over upgrade errors with suppression escape hatches. Specifically:

- Do not use `ignoreDeprecations`. The target version will not support this option.
- Do not add `// @ts-ignore`, `// @ts-expect-error`, or `// @ts-nocheck` to silence new errors.
- Do not use `any` just to make an error go away.
- Do not disable `tsconfig.json` strictness flags (`strict`, `noImplicitAny`, `strictNullChecks`, `skipLibCheck`, etc.)

## Version-Specific Guidance

Additional files document version-specific changes and migration steps. Read the ones that apply before editing (see step 2 above):

- [4to5.md](4to5.md) covers upgrading from 4.x to 5.0.
- [5to6.md](5to6.md) covers upgrading from 5.x to 6.0.
- [6to7.md](6to7.md) covers upgrading from 6.x to 7.0, including the TypeScript API compatibility layout and troubleshooting for tool-injected `baseUrl`, the Node.js version required by the 7.0 `tsc` launcher, and framework-generated tsconfigs.

## Common Issues

All versions of TypeScript may include updates to the DOM. These are not specifically documented anywhere. Use your best judgment to determine how to fix these, keeping in mind that you should not be making runtime-affecting changes unless absolutely justified.

## Usercode Bugs

Newer versions TypeScript may sometimes find _unambiguous problems_ in the user's code that were not caught by previous versions.
Sometimes you will be able to easily determine the correct fix (i.e. what was intended).
If you can't determine the correct fix, add a temporary `ts-ignore` comment to suppress the error so you can continue with the upgrade process:

```ts
// @ts-ignore BUG: This is always a runtime error! Fix as appropriate depending on intended meaning
const p = "foo" in 42;
```

When you're done, remove the `@ts-ignore` part of the comment, but leave behind the explanation of why the code is wrong.
Report all bugs you found in the summary.

## `@types` Dependencies

You may need to update `@types` dependencies alongside the main TypeScript version.
Check the `package.json` for any `@types/` entries and update them to the latest version compatible with the corresponding core dependency.

## Completion Gate

The upgrade is not done until this gate has been run after your last edit:

1. Do a clean, lockfile-respecting install (e.g. `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`). This proves `package.json`, the lockfile and any `patchedDependencies` agree.
2. Confirm the installed compiler version, e.g. `npx tsc --version`.
3. Rerun each baseline command (build, typecheck, test, lint), including tests, and compare each one against the baseline.
4. Every command that passed in the baseline and fails now must be fixed, or reported in the summary as an explicit failure of the upgrade. Do not label it "out of scope". The upgrade is also not complete while the target `tsc` reports errors for the project, including errors from framework-generated tsconfigs.

## Summarize

Your final message must always be this summary, even if you were blocked or stopped early:

- Starting TypeScript version
- Ending TypeScript version actually installed (from `tsc --version` or the lockfile), and the package layout used (plain `typescript@7` or side-by-side with `@typescript/typescript6`)
- Baseline vs. final result for each build, typecheck, test and lint command
- Any notable edits you had to make
- Bugs in usercode you found
  - Offer to remove the `// @ts-ignore` comments you added
- Every gate that is still red, and why
- If you had to stop before reaching the latest version, explain what happened and what remains to be done

<!-- prettier-ignore-end -->
