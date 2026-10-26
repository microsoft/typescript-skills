# Runtime checks

Runtime is one validation category, not the entire validation strategy. Add it
after discovering typecheck, lint, build, test, and package commands.

## CLI

Use a non-destructive command such as `--help`, `--version`, or a subcommand
against repository fixtures. Prefer `exit-code`; use `output-contains` only for
a stable project-owned banner or result.

## Server

Find the real entry point and route declarations. Prefer a health/readiness
route and one representative read route. Do not invent endpoints or call
write operations unless fixtures make them safely repeatable.

Declare one top-level `devServer` and one or more `http` checks. Use fixed
loopback ports that the repository already supports. The runner owns only the
server it starts and always cleans up its process tree. It rejects a readiness
URL that is already responding before startup rather than validating an
unrelated process.

## Web application

An HTTP 200 probe is the dependency-free default. If the repository already
uses Playwright, copy and adapt
[../examples/playwright-smoke.test.mjs](../examples/playwright-smoke.test.mjs), then run
it as a normal `process` check:

```jsonc
{
  "name": "browser-smoke",
  "category": "runtime",
  "kind": "process",
  "command": "npx",
  "args": ["playwright", "test", ".copilot/typescript-project-validate/playwright-smoke.test.mjs"],
  "verificationMethod": "exit-code",
  "expected": "0"
}
```

Do not install Playwright or download a browser without user approval. Do not
hand-author a detailed flow from guessed selectors. If no compatible browser
toolchain exists, use HTTP checks or mark the runtime category blocked with the
specific reason.

## Electron and hosted plugins

Launching the GUI usually needs a display, but most of an Electron app's
runtime contract runs headless. Before marking runtime `blocked`, add checks
for:

- the development main/preload bundles and any lifecycle script that builds
  them (for example `npm run prestart`, or a `build:main` run with
  `NODE_ENV=development`);
- the production main, preload, and renderer builds, as separate checks when
  the repository has separate scripts;
- `npx electron --version`, which proves the Electron binary is installed;
- the repository's own smoke or integration tests, when they run under
  `xvfb-run` or headless mode in CI.

Reserve `blocked` for the GUI launch itself and give the specific reason. Do
not run full installers such as `electron-builder` without `--dir` as checks;
they are slow and can rewrite tracked files. Do not add a new quit flag or
modify application code merely to satisfy validation without approval.

## Stable output checks

`output-contains` is appropriate only when the output is itself the contract.
Avoid versions, timestamps, counts, paths, dependency-owned diagnostics, ANSI
sequences, and serialized JSON. For "did it work," use `exit-code`.
