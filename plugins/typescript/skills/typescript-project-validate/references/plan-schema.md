# Validation plan schema

The runner reads
`<packageDirectory>/.copilot/typescript-project-validate/plan.json`.

See [../examples/library-plan.json](../examples/library-plan.json),
[../examples/application-plan.json](../examples/application-plan.json), and
[../examples/monorepo-package-plan.json](../examples/monorepo-package-plan.json).

## Top level

```jsonc
{
  "version": 1,
  "projectType": "library",
  "workspaceRoot": "../..",
  "categories": {
    "typecheck": { "status": "covered" },
    "lint": { "status": "covered" },
    "build": { "status": "covered" },
    "test": { "status": "covered" },
    "package": { "status": "unavailable", "reason": "Not published." },
    "runtime": { "status": "covered" }
  },
  "setup": [],
  "devServer": {},
  "checks": []
}
```

`version` must be `1`. `projectType` is descriptive and may be `webapp`,
`server`, `cli`, `electron`, `library`, `framework`, `plugin`, or `other`.

`workspaceRoot` is optional. It is `packageDirectory` or one of its
ancestors, absolute or relative to `packageDirectory`. Relative `cwd` and
`prependPath` entries may reach any directory inside it. Without it, the
boundary is the enclosing git repository, or `packageDirectory` outside git.

Every core category is required. `status` is one of:

- `covered`: at least one check with the same `category` exercises it;
- `added`: the change creates the operation (for example a
  JavaScript-to-TypeScript conversion adds `typecheck`). At least one check
  must use the category. Its checks are skipped at baseline, run at compare,
  and must pass there; a failure is a regression;
- `unavailable`: the project has no such operation and the change does not
  add one;
- `blocked`: the operation exists but cannot run in this environment;
- `out-of-scope`: the operation exists, but the task cannot affect it or
  running it has side effects (full installers, publishing).

Every status except `covered` requires a non-empty `reason`. `checks` may be
empty only when no category is `covered` or `added`, for example a dependency fix in an
environment where nothing installs; the runner then only runs `setup` and the
contract check.

## Setup command

`setup` is optional and runs sequentially before checks:

```jsonc
{
  "command": "npm",
  "args": ["ci"],
  "cwd": ".",
  "env": { "CI": "true" },
  "prependPath": ["node_modules/.bin"],
  "timeoutSeconds": 600
}
```

Commands are spawned directly without a shell, with `CI=1` (unless already
set), `npm_config_yes=false` and `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, so they
never prompt. An `npx` call for a tool that is not installed fails instead of
downloading it. A check's `env` overrides these. On Windows, the runner resolves
Node-based `.cmd`/`.bat` package-manager shims such as `npm` and `pnpm` to
their JavaScript entry points so argument boundaries remain intact; plans
should still name the package manager directly. `cwd` and `prependPath`
entries may be absolute; relative paths resolve from `packageDirectory` and
may not escape the workspace root (see `workspaceRoot`).

## Managed dev server

`devServer` is optional:

```jsonc
{
  "command": "npm",
  "args": ["run", "dev", "--", "--port", "4173"],
  "url": "http://127.0.0.1:4173/",
  "readyTimeoutSeconds": 120
}
```

It supports the same `cwd`, `env`, and `prependPath` fields as setup commands.
The URL must be loopback HTTP(S). The runner starts the process once, waits for
the URL to respond, runs all checks, and terminates the process tree in a
`finally` path.

## Process check

```jsonc
{
  "name": "build",
  "category": "build",
  "kind": "process",
  "command": "npm",
  "args": ["run", "build"],
  "verificationMethod": "exit-code",
  "expected": "0",
  "timeoutSeconds": 300
}
```

Process verification methods:

- `exit-code`: `expected` is a stringified integer.
- `output-contains`: `expected` is a stable, case-sensitive substring owned by
  the project. Prefer exit codes unless output itself is the behavior.

## HTTP check

```jsonc
{
  "name": "home-route",
  "category": "runtime",
  "kind": "http",
  "url": "http://127.0.0.1:4173/",
  "verificationMethod": "http-status",
  "expected": "200",
  "timeoutSeconds": 30
}
```

HTTP verification methods:

- `http-status`: `expected` is a stringified status code.
- `output-contains`: `expected` is a stable response-body substring.

HTTP URLs must be loopback HTTP(S). An HTTP check normally relies on
`devServer`; it may also inspect a server the caller explicitly owns.

## Check names and results

Names must be unique kebab-case and stable because baseline comparison joins on
them.

Results are transient. In a git repository they are written under
`$(git rev-parse --git-path typescript-project-validate)/<package>-<hash>/`, so
they never appear in the working tree; outside git they are written beside the
plan. The runner also adds the plan directory to `.git/info/exclude`. The
console prints each failure's exit code and output tail, non-covered
categories, contract findings, and the result path. The files are:

- `standalone-result.json`
- `baseline-result.json` (includes the contract snapshot and an `environment`
  assessment: `usable`, `[ENV]` warnings and `[ENV-FAILURE]` checks)
- `comparison-result.json`
- `targeted-comparison-result.json` (from `--mode compare --check <name>`)

Each failed check records `diagnostics`: its errors with line numbers removed.
It also records `environmentFailure`, the line that shows the check could not
run here, or null. Comparison uses them to separate `changed-failure` (new
errors in a check that already failed) from `pre-existing-failure`. A baseline
check with an environment failure compares as `inconclusive`.

## Contract findings

Baseline mode records a contract snapshot: `package.json` scripts, effective
tsconfig strictness and module options, suppression-comment and explicit-`any`
counts, and `.npmrc` install overrides. Compare mode diffs the current tree
against it; standalone mode in a git repository diffs against `HEAD`. Each
finding has a stable id, for example:

- `script-removed:package.json:prestart`
- `compiler-option:packages/cli/tsconfig.json:moduleResolution`
- `suppression:tsIgnore` (also `tsExpectError`, `tsNocheck`, `lintDisable`,
  `explicitAny`)
- `compiler-option:tsconfig.json:allowJs` (JavaScript compiled without
  `checkJs`)
- `js-sources-remaining:packages/cli` (the package adopted TypeScript but
  JavaScript sources remain)
- `npmrc:.npmrc:legacy-peer-deps`

An unaccepted finding makes the run fail. `--accept <id>` (repeatable) accepts
one finding that the user's request requires; it does not change the plan
hash.

Persisted execution metadata redacts environment names containing terms such as
`TOKEN`, `PASSWORD`, `SECRET`, `API_KEY`, or `CONNECTION_STRING`.
