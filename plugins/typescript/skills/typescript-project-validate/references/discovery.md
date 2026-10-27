# Repository validation discovery

Discover the repository's existing contract before authoring a plan. Do not
start with generic `npx tsc`, `npm test`, or `npm run build` guesses.

## 1. Resolve scope

Determine:

- repository/workspace root;
- package directory being changed;
- whether checks must run at the workspace root or package level;
- the package manager selected by the lockfile;
- the supported Node version from `engines`, version-manager files, CI, and
  developer documentation.

In a monorepo, preserve workspace selectors such as `--filter`, `--workspace`,
or task-runner targets. Do not run every package when the caller changed one
package unless the repository's normal validation contract requires it.

## 2. Inspect sources of truth

Read, in priority order:

1. CI workflow and required-check configuration.
2. `package.json` scripts at the root and target package.
3. Contributor documentation and README instructions.
4. Task-runner configuration (`turbo`, Nx, Lerna, Rush, Lage, workspaces).
5. TypeScript, linter, test-runner, bundler, packaging, and application configs.

### Inventory existing scripts

Before the first edit, list the scripts in the root and target
`package.json`. Each script that builds, bundles, typechecks, lints, formats or
tests, and each lifecycle hook (`pre*`/`post*`, for example `prestart`,
`postinstall`, `prepare`, `pretest`), must either become a plan check or be
deliberately left out (watch and interactive scripts, publishers).

Removing or renaming an existing script is a regression unless the user asked
for it. When a migration replaces the tool a script calls, rewrite the script
to call the new tool. The baseline records every script, and comparison
reports a removed one as a `[CONTRACT]` finding.

Use the package manager implied by the lockfile:

| Lockfile | Package manager |
|---|---|
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` | Yarn |
| `bun.lock` / `bun.lockb` | Bun |
| `package-lock.json` / `npm-shrinkwrap.json` | npm |

Do not create or rewrite a lockfile during validation. A frozen-lockfile
install (`npm ci`, `yarn install --immutable`, `pnpm install
--frozen-lockfile`) does not rewrite it and is the expected way to prepare a
clean environment.

## 3. Account for every category

Investigate each category independently:

| Category | Evidence to seek |
|---|---|
| `typecheck` | `check-types`, `typecheck`, `tsc --noEmit`, project references |
| `lint` | ESLint/Oxlint/Biome scripts, formatter checks (`prettier --check`, `format:check`, `biome format`), CI lint jobs; in a monorepo, scoped to the package's paths |
| `build` | compilation or bundling that produces runnable output |
| `test` | unit/integration test scripts in non-watch mode |
| `package` | side-effect-free dry runs only (`npm pack --dry-run`, `vsce ls`, `electron-builder --dir`) |
| `runtime` | CLI smoke command, local server probe, app launch, browser flow |

Prefer a dedicated script over reconstructing its implementation, and call the
script rather than the tool it currently runs (`npm run lint`, not
`npx healthier`), so that a check still covers the script after the task
replaces its tool. If multiple commands are required, use separate checks so
failures identify the concern.

For an absent category, record:

```json
{ "status": "unavailable", "reason": "This source-only package has no packaging step." }
```

For an environment-dependent operation:

```json
{ "status": "blocked", "reason": "Integration tests require credentials unavailable in this environment." }
```

For an operation the task cannot affect, or one with side effects such as a
full installer build or publish:

```json
{ "status": "out-of-scope", "reason": "The bundler swap does not change packaging; electron-builder rewrites files." }
```

Do not label a failing command blocked merely because it fails; first determine
whether the failure is a project defect.

In a monorepo, the repository's lint and format gates often run from the
workspace root. Add them as checks with `"cwd": "../.."` (relative paths may
reach anywhere in the git repository) or set top-level `workspaceRoot`. Scope
them to the changed package's paths (`yarn prettier --check packages/x/src
packages/x/build.mts`, `yarn eslint packages/x`). A root script that also checks
unrelated paths can already fail for unrelated reasons, which hides new
failures in your package.

## Module format

A package that Node runs directly (CLI, server, scripts, Node library) and
that is ESM (`"type": "module"`, `.mts`, or ESM output) needs `module` and
`moduleResolution` set to `nodenext` or `node16`/`node18`/`node20`, and
relative imports with `.js` extensions. `bundler` resolution is only for code
that a bundler (Vite, webpack, esbuild, Rolldown) consumes. Record the current
values during discovery; changing them away from the runtime's needs is a
contract regression, not a fix.

## 4. Prepare the environment, then let the baseline prove the plan

Before the baseline:

- If dependencies are not installed (no `node_modules`, no Yarn PnP
  `.pnp.cjs`), run the frozen-lockfile install. Keep its output short without
  hiding errors (npm `--no-audit --no-fund --loglevel=error`, never
  `--silent`), and check its exit code.
- In a monorepo, build the workspace packages the target package imports. Use
  the task runner's dependency build (`nx run-many -t build -p <deps>`,
  `turbo run build --filter=<pkg>^...`) or `yarn workspace <dep> build`.
- Put those commands in `setup` when they must rerun after the change, for
  example a dependency change or an edit to a workspace package. Otherwise run
  them once before the baseline.
- When the change creates a category (a JavaScript-to-TypeScript conversion
  adds `typecheck`), mark it `added` with its checks rather than
  `unavailable`.

Do not run candidate commands by hand to prove them. Write the plan and run
`--mode baseline`. It runs each check with `CI=1` and `npm_config_yes=false`,
so nothing prompts, and an `npx` call for a tool that is not installed fails
instead of downloading it. It prints each failure's output tail and marks
environment failures `[ENV-FAILURE]`. Fix plan defects and rerun the baseline.
When you must run a tool outside the runner, use the repository's script or
`npm exec --no -- <tool>`, never a bare `npx <tool>`. If a command prompts to
install a package, decline: the earlier install failed, so fix it. Do not ask
the user to approve it.

Checks must not prompt, mutate dependencies, or leave processes running.
