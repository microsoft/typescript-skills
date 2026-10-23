# Benchmark catalog

These are the benchmark definitions behind the upstream experiments summarized
in [Initial results](README.md#initial-results), not tests of the current skill
stubs. Prompts, public source pins, environments, and success criteria are
recorded here so contributors can understand the tasks and specify comparable
ones. The executable harness, per-repository command plans, measured starts, and
reference solutions remain outside this repository.

## Shared evaluation procedure

For an existing-project task, clone the exact commit below into a clean checkout.
Use its recorded Node and package-manager versions; a major-only version or
unversioned `npm` is only as precise as the source definition, not a fully
reproducible image pin. The generated environments use Debian Bookworm, Git,
Corepack, Python 3, and public network access, with 4 CPUs, 8 GiB RAM, and
20 GiB storage. The agent limit is 30 minutes and the verifier limit 60 minutes.
Some repositories need additional native dependencies or browser provisioning.

Before evaluating an agent, establish a repository-specific verification plan:
dependency setup, compile/build/typecheck, applicable lint, tests, and runtime
probes. Run that plan on the untouched pinned checkout and retain the measured
start. This **start** is a quality reference, not the **unaided baseline**, which
is a separate agent attempt at the same requested task. A known baseline
workaround must be identical in both evaluation arms.

Give the agent the task prompt and repository, not the hidden plan, success
rubric, measured start, or reference solution. The TypeScript-upgrade tasks also
append an unattended-execution contract: resolve repository-supported safe
defaults, do not ask the user for input, and avoid interactive commands or
unbounded waits. After the attempt, run the verifier independently rather than
trusting the agent's claim of success. Greenfield tasks are the exception to
the pinned-checkout procedure, as described below.

Native-quality checks and migration success are separate dimensions:

- **Compile/test/runtime:** recorded compiler errors, test failures, and runtime
  assertion failures. Upgrade tasks compare these against the measured start;
  strict-mode and build-reference reports require passing native checks and
  treat missing required evidence as failure.
- **Lint:** if applicable, the selected lint command must actually pass; missing
  or placeholder commands must not be invented as passing checks.
- **Additional diagnostics:** dependency downgrades, added type-safety escape
  hatches, unexpected output files, and an agent ending with an unanswered
  question. Escape hatches include added `any` assertions/types, unsafe double
  assertions, suppression comments, ambient modules, and weakening compiler
  settings. Only an actual `@ts-expect-error` comment with a same-line
  explanation in a recognized test path is exempt from that directive count.

The report does not fold every diagnostic into every benchmark's pass rate.
The success rules below state the differences. They describe the inspected
grader revision; the historical table is not a claim that every saved run has
been reverified after subsequent fixes.

## typescript-update

Definition: `assets/jsupgrade_typescript.json`; benchmark `jsupgrade.typescript`.

### Upgrade task prompt

> Upgrade `typescript` to `7` in this repository.

The declared grading target is `^7`, applied to the repository's requested
TypeScript declarations, not just whichever package is easiest to update.

### Upgrade repositories and commits

| Repository | Commit | Node | Package manager |
| --- | --- | --- | --- |
| [google/zx](https://github.com/google/zx) | `cd18352320de3873a1d1473c037632212557757a` | 22 | npm |
| [graphql-hive/graphql-yoga](https://github.com/graphql-hive/graphql-yoga) | `670d1f9055e38b86693c01a4dadb15b7034bd189` | 18 | pnpm 10.11.1 |
| [immerjs/immer](https://github.com/immerjs/immer) | `f6736a4beef727c6e5b41c312ce1b202ad3afb23` | 16.20.2 | Yarn 1.22.22 |
| [microsoft/monaco-editor](https://github.com/microsoft/monaco-editor) | `51ba6777fc7bab43da4091e4a42220960836ca23` | 16 | npm |
| [open-webui/open-webui](https://github.com/open-webui/open-webui) | `b8278f81ea4dc8d3011003cc490b094fe74ed331` | 24 | npm |
| [palantir/osdk-ts](https://github.com/palantir/osdk-ts) | `ba5f1164f36b5557c4b6eb87bdc1a3b1ca9bb672` | 18 | pnpm 9.5.0 |
| [prettier/prettier](https://github.com/prettier/prettier) | `b9a3995e3a85240fbd22a27b060dab4716adec22` | 16 | Yarn 3.6.3 |
| [RackulaLives/Rackula](https://github.com/RackulaLives/Rackula) | `23810429c94f92ddc83e239c664fda9e026d82ba` | 22 | npm |
| [redwoodjs/graphql](https://github.com/redwoodjs/graphql) | `7656f8f2370eae0b808d4f164fea817096ced721` | 20 | Yarn 4.1.0 |
| [reduxjs/redux-toolkit](https://github.com/reduxjs/redux-toolkit) | `e7a3456eb3c2fa219a8fad462563906746761c47` | 18 | Yarn 1.22.22 |
| [remix-run/react-router](https://github.com/remix-run/react-router) | `eb59d5fe066c141c0b8d170adfdc29d9a584a0e0` | 20 | pnpm 9.10.0 |
| [rollup/rollup](https://github.com/rollup/rollup) | `e871ad822c0a4fa8eaf8a66199b46738750d9b62` | 16 | npm |
| [tryghost/ghost](https://github.com/tryghost/ghost) | `83399222ea8bff553c38e06be7c8184af569e548` | 18 | Yarn 1.22.22 |
| [vercel/next.js](https://github.com/vercel/next.js) | `2b846de4c59b5e47a28432e49106322c34915891` | 20 | pnpm 10.33.0 |
| [tailadmin/free-nextjs-admin-dashboard](https://github.com/tailadmin/free-nextjs-admin-dashboard) | `6d9c24c1a855b4e027c31865740f0a2c3599e2c9` | 20 | npm |

### Upgrade success graders

- **Requested dependency upgraded:** all applicable TypeScript declarations from
  the original manifests must satisfy the target. Installed dependencies must
  change and their minimum allowed version must meet it; `^5 || ^7` is not an
  installed-compiler migration. Peer ranges must cover the whole target, but
  may retain support for older consumers and need not change if already broad
  enough. This is one logical dependency outcome per repository, not a fraction
  of changed manifests.
- **Compiler/API split:** the grader also recognizes a changed official
  `typescript: npm:@typescript/typescript6@^6...` API declaration paired with a
  newly introduced or changed `@typescript/native: npm:typescript@<target>`
  compiler declaration in that package or its actual workspace root. An unrelated
  ancestor, unchanged compiler, or preview alias is insufficient. This checks
  declaration evidence, not which executable actually ran.
- **Quality gate:** setup must succeed; compiler errors, test failures, and
  runtime assertion failures must not increase against the measured start, and
  applicable lint must pass. A failed gate zeros the upgrade score. Type-safety
  and other workflow diagnostics are recorded separately, not extra gates in
  this report's upgrade score.
- **Native scope:** verification includes monorepo typechecks where defined,
  not just root compilation. Runtime probes range from loading library exports
  (Yoga, OSDK, Redwood, Redux Toolkit, React Router, Ghost) to CLI behavior
  (zx, Prettier, Rollup, Next.js), built artifacts (Monaco), and served pages
  (Open WebUI, Rackula, TailAdmin). These probes are not full application tests.

## typescript-project-setup

Definition: `assets/project_setup.json`; benchmark `project-setup`.

### Setup task prompts

Each row is a separate task; the prompt is given verbatim.

| Task | Difficulty | Prompt |
| --- | --- | --- |
| expense-tracker-cli | Easy | Write a TypeScript Node.js CLI app for tracking personal expenses. It should support adding, listing, filtering, and summarizing expenses stored in a local JSON file, plus importing and exporting CSV. Organize the implementation across multiple files and include automated tests. |
| fractal-generator-cli | Easy | Write a TypeScript Node.js CLI app to generate Mandelbrot and Julia fractals. Support configurable dimensions, iteration limits, coordinates, and output to an image file. Make it complicated enough to require multiple files of code and include automated tests for the non-rendering logic. |
| static-site-generator | Medium | Write a TypeScript static site generator with a CLI. It should convert Markdown files into HTML, apply templates, copy static assets, generate an index page, and support watch mode for local development. Structure it as a multi-file project and include automated tests. |
| webhook-delivery-service | Medium | Write a TypeScript Node.js service that accepts webhook events through an HTTP API, stores them locally, and delivers them asynchronously to registered endpoints. Include retry policies, exponential backoff, delivery history, request validation, structured logging, and automated tests. |
| collaborative-task-board | Hard | Write a TypeScript real-time task board with a browser frontend and Node.js backend. Users should be able to create boards, move tasks between columns, and see other clients' changes immediately over WebSockets. Share types between the frontend and backend, persist board state, and include automated tests. |
| workflow-automation-platform | Hard | Write a TypeScript monorepo for a workflow automation platform. It should contain an HTTP API, background worker, command-line client, shared domain package, and plugin SDK. Workflows should support dependency graphs, scheduled and manual execution, retries, cancellation, persisted execution history, and dynamically loaded plugins. Include unit and integration tests and commands for development, building, testing, and production execution. |

### Starting repositories

There are no source repositories or source pins. Each task starts in a
deterministic empty Git repository on `node:22-bookworm`, with an empty baseline
commit dated `2000-01-01T00:00:00Z` and tagged `msbench-baseline`. No starter
source, package-manager choice, or populated execution plan is supplied.
There is no measured existing-project start.

### Setup success graders

- **Deterministic setup:** valid root `package.json`, TypeScript in
  `devDependencies`, a tsconfig, `rootDir: src`, `outDir: dist`, implementation
  TypeScript under `src`, and a build script invoking `tsc`. The version
  heuristic accepts a declared TypeScript major of at least 5 or a supported
  moving/workspace/catalog declaration; it does not prove that the latest
  registry version was selected.
- **Environment-specific setup:** Node/server projects need `@types/node` as a
  development dependency and `types: ["node"]`. Detected bundlers need bundler
  module resolution and both bundler and TypeScript build paths. On Node 22.18
  or newer, CLI tasks additionally require `erasableSyntaxOnly`, a direct Node
  `.ts` runtime script/bin, and no `tsx` dependency. These are this benchmark's
  opinionated setup criteria, not universal TypeScript requirements.
- **Repository health:** discover npm/pnpm/Yarn from `packageManager` or lockfiles;
  discover applicable setup, build/typecheck, lint, and test commands from the
  resulting repository, then execute them with bounded timeouts. Unavailable
  checks are marked unavailable, not successful. Setup failure zeros the score.
  The core accuracy is the equal-weight mean of deterministic setup and health
  scores; the compact table counts only completed tasks with full core accuracy.
- **Adaptive quality judge:** RewardKit's `adaptive-repository-quality` judge
  (`gpt-5-mini`) inspects bounded, sanitized command evidence. It passes only
  when command selection follows the actual repository, handles unavailable
  or placeholder checks honestly, and every selected applicable command passes.
  It executes no additional repository commands. This judge is recorded
  separately and participates in the combined Harbor reward, not the compact
  table's core pass-rate calculation.

The graders check setup conventions and observable health, not exhaustive
functional fulfillment of every requested application feature.

## typescript-strict

Definition: `assets/strict_mode.json`; benchmark `strict-mode`.

### Strict-mode task prompt

> Enable TypeScript strict mode for NAME and make sure everything works afterward.

Substitute the exact `NAME` from the first column below.

### Strict-mode repositories and commits

| NAME | Repository | Commit | Node / package manager | Required configs |
| --- | --- | --- | --- | --- |
| aurelia-path | [aurelia/path](https://github.com/aurelia/path) | `c7c5674dc9a2f4bc17b47c45a740684655d8980a` | 22.21.1 / npm 10.9.4 | `tsconfig.json` |
| reading-time | [ngryman/reading-time](https://github.com/ngryman/reading-time) | `1d07a5cb1c01950e4a0b0dce9aab7192fedd9b92` | 22.21.1 / npm 10.9.4 | `tsconfig.json`, `tsconfig-build.json` |
| wretch | [elbywan/wretch](https://github.com/elbywan/wretch) | `bf1dfe8fe532fadc6b6391fb678a785c3efc9b4b` | 22.21.1 / npm 10.9.4 | `tsconfig.json`, `tsconfig.cjs.json` |
| moize | [planttheidea/moize](https://github.com/planttheidea/moize) | `bed3b06a101a057395a3ca17b483b733d5cf0f51` | 24.18.0 / Yarn 4.10.2 | `tsconfig.json` |
| @colyseus/schema | [colyseus/schema](https://github.com/colyseus/schema) | `9dc4133c71f674cd5d434572c647269c6b38e161` | 18.20.3 / npm 10.7.0 | `tsconfig.json`, `tsconfig/tsconfig.cjs.json`, `tsconfig/tsconfig.esm.json` |
| finitio | [enspirit/finitio.js](https://github.com/enspirit/finitio.js) | `a34018651a2b8c7fc1e397d9c0aab20383b78f50` | 24.18.0 / npm 11.16.0 | `tsconfig.json` |
| sequelize-typescript | [sequelize/sequelize-typescript](https://github.com/sequelize/sequelize-typescript) | `8ded61aa26e192b455c682377d45cef0582e11e2` | 18.17.1 / npm 9.6.7 | `tsconfig.json`, `test/tsconfig.json` |
| graphql-query-to-json | [trayio/graphql-query-to-json](https://github.com/trayio/graphql-query-to-json) | `081bb9e62e21753d598edcb339b8788cd1d131c3` | 24.11.1 / npm 11.6.2 | `tsconfig.json` |
| object-observer | [gullerya/object-observer](https://github.com/gullerya/object-observer) | `e7eeeafd0161a32e0cdc73651be1d36170df6711` | 24.18.0 / npm 11.16.0 | `tsconfig.json` |

### Strict-mode success graders

- **Strict enabled without opt-outs:** every target's effective inherited
  compiler configuration must set `strict: true`, disable none of its
  constituent strict flags, and avoid `noCheck`.
- **Original inputs preserved:** every original tracked compiler input remains
  selected, and tracked TypeScript files are not deleted. Narrowing `include`
  or adding exclusions cannot make the migration pass.
- **Native quality:** setup/compilation, tests, runtime assertions, and applicable
  lint must pass. Colyseus also independently typechecks the original Mocha
  `**/*.test.ts` inputs and imports; transpile-only test execution is not enough.
- **Safety and workflow:** unlike the other task-success benchmarks, this
  report also requires no dependency downgrades, no added counted type-safety
  escapes, no unexpected files, and no abandoned final question. Missing
  required evidence fails the complete-task score.
- **Runtime scope:** path/query-string operations; reading-time word counts;
  Wretch HTTP requests and errors; Moize caches and promises; Colyseus state
  replication; Finitio schema validation; Sequelize related-model persistence
  in SQLite; GraphQL query conversion; and Object Observer notifications,
  validators, and batching.

## typescript-esm

Definition: `assets/cjs_to_esm.json`; benchmark `cjs-to-esm`.

### ESM task prompts

| Task | Prompt |
| --- | --- |
| typescript-cjs-to-esm | Convert the packages/codemods package from CJS to ESM. |
| tsquery-cjs-to-esm | Convert tsquery from CJS to ESM. |
| ts-json-schema-generator-cjs-to-esm | Convert ts-json-schema-generator from CJS to ESM. |
| jest-codemods-cjs-to-esm | Convert jest-codemods from CJS to ESM. |
| yargs-cjs-to-esm | Convert yargs from its dual CommonJS and ES module build to native ES modules. Preserve its public package entrypoints and supported CommonJS interoperability. |
| conventional-changelog-cjs-to-esm | Convert the conventional-changelog monorepo from CommonJS to native Node.js ES modules while keeping gulp-conventional-changelog as a working CommonJS interoperability package. Preserve the public libraries and CLIs. |

### ESM repositories and commits

| Task | Repository | Commit | Node / package manager |
| --- | --- | --- | --- |
| typescript-cjs-to-esm | [cedarjs/cedar](https://github.com/cedarjs/cedar), `packages/codemods` | `28fd4bb982f68a303a9b1faddf28c7a74be28418` | 22 / Yarn 4.12.0 |
| tsquery-cjs-to-esm | [phenomnomnominal/tsquery](https://github.com/phenomnomnominal/tsquery) | `e606433fed78afe44342d83b6c1bacb47e7762f3` | 22 / npm 10.9.8 |
| ts-json-schema-generator-cjs-to-esm | [vega/ts-json-schema-generator](https://github.com/vega/ts-json-schema-generator) | `e94cc55c158db26e5acc68f4889daab71d12b39a` | 22.23.2 / npm 11.12.1 |
| jest-codemods-cjs-to-esm | [skovhus/jest-codemods](https://github.com/skovhus/jest-codemods) | `d0c8b81c3e4e4f20e0df1ecada77a42190d875da` | 22.23.2 / pnpm 9.15.9 |
| yargs-cjs-to-esm | [yargs/yargs](https://github.com/yargs/yargs) | `ef28c98ae14621fd484ec80b128b46e85b6bf858` | 22.12.0 / npm 8.19.4 |
| conventional-changelog-cjs-to-esm | [conventional-changelog/conventional-changelog](https://github.com/conventional-changelog/conventional-changelog) | `fac8045242099c016f5f3905e54e02b7d466bd7b` | 18.17.1 / pnpm 8.7.5 |

Despite its name, `typescript-cjs-to-esm` is a Cedar package task, not a migration
of the TypeScript compiler repository.

### ESM success graders

- **Changed ESM manifests:** each selected package's manifest changes from the
  pinned baseline and sets `type: "module"`. The conventional-changelog task
  covers the root and its selected public packages, while explicitly preserving
  `gulp-conventional-changelog` as a CommonJS package.
- **Compiler configuration:** the single-package TypeScript tasks need a valid
  ESM-capable module configuration with implementation inputs. Cedar specifically
  needs Node ESM module and resolution settings.
- **Cedar source contract:** relative imports/exports/dynamic imports in effective
  `.ts` implementation inputs use `.js` extensions, directory handling uses
  `import.meta.dirname` or `import.meta.url`, and no unresolved CommonJS
  `__dirname` remains. Inherited input selection and imported modules count;
  excluded fixtures do not. Locally bound names are not CommonJS globals.
- **Other packages' emitted modules:** inspect `main`, `bin`, and JavaScript
  export targets and their relative static-import graph. Emitted entries must
  exist as native ESM, respect nested package scopes, and avoid CommonJS
  export/require patterns; an explicitly bound `createRequire` interop path is
  permitted. This is structural inspection, not a substitute for execution.
- **Separate native checks:** the plans exercise Cedar CLI help, tsquery queries
  and transformations, schema-generator CLI/bin/API output, jest-codemods'
  interactive CLI and published transformers, yargs ESM plus supported
  require-of-ESM interop, and conventional-changelog libraries/presets, the gulp
  bridge, and seven CLIs. Build/test/lint/runtime and safety outcomes remain
  separately visible; this report's ESM pass rate uses the task-success grader,
  not an additional conjunction of all those diagnostics.

## typescript-build-references

Definition: `assets/build_reference.json`; benchmark `build-reference`.

### Project-reference task prompts

For `NAME` equal to `just`, `changesets`, `shiki`, `xstate`, or `vueuse`:

> Configure TypeScript project references and incremental builds for NAME's library packages and enable isolatedDeclarations for their declaration emission.

Use Gesture has a different prompt:

> Configure TypeScript project references and incremental builds for use-gesture's library packages and their declaration emission. Its TypeScript 5.2.2 compiler predates isolatedDeclarations, so do not enable that option.

### Project-reference repositories and commits

| NAME | Repository | Commit | Node / package manager |
| --- | --- | --- | --- |
| use-gesture | [pmndrs/use-gesture](https://github.com/pmndrs/use-gesture) | `c779631aa05959638dee81b9a25fb1299a7467f6` | 18.20.3 / pnpm 8.7.5 |
| just | [microsoft/just](https://github.com/microsoft/just) | `c87d5059afa7a001475321915ac9df364f154e47` | 22.21.1 / Yarn 4.17.1 |
| changesets | [changesets/changesets](https://github.com/changesets/changesets) | `c73949ba7b3160a4aa5729223335c190de1528f8` | 24.18.0 / pnpm 11.13.1 |
| shiki | [shikijs/shiki](https://github.com/shikijs/shiki) | `f7d0167873fd676fe4e190bc9b53832fba9ee01d` | 24.18.0 / pnpm 12.8.1 |
| xstate | [statelyai/xstate](https://github.com/statelyai/xstate) | `da4c74efa441dd3a4c1d9835c42c3d1f87cdcaba` | 24.16.0 / pnpm 10.34.5 |
| vueuse | [vueuse/vueuse](https://github.com/vueuse/vueuse) | `ad2822b3854347f9eeb1c738fd2b90b773381c4a` | 24.18.0 / pnpm 11.25.0 |

The fixed library scope is not whatever the agent leaves in workspace metadata:

| Repository | Required packages below `packages/` |
| --- | --- |
| Use Gesture | `core`, `react`, `vanilla` |
| Just | `just-task`, `just-scripts` |
| Changesets | `apply-release-plan`, `assemble-release-plan`, `changelog-git`, `changelog-github`, `cli`, `color`, `config`, `errors`, `get-dependents-graph`, `get-github-info`, `get-release-plan`, `get-version-range-type`, `git`, `logger`, `parse`, `pre`, `read`, `release-utils`, `should-skip-package`, `types`, `write` |
| Shiki | `cli`, `colorized-brackets`, `core`, `engine-javascript`, `engine-oniguruma`, `magic-move`, `markdown-exit`, `markdown-it`, `monaco`, `primitive`, `rehype`, `shiki`, `stream`, `transformers`, `twoslash`, `types`, `vitepress-twoslash` |
| XState | `core`, `xstate-immer`, `xstate-inspect`, `xstate-react`, `xstate-solid`, `xstate-store`, `xstate-store-angular`, `xstate-store-preact`, `xstate-store-react`, `xstate-store-solid`, `xstate-store-svelte`, `xstate-store-vue`, `xstate-svelte`, `xstate-vue` |
| VueUse | `components`, `core`, `electron`, `firebase`, `integrations`, `math`, `metadata`, `nuxt`, `router`, `rxjs`, `shared` |

### Project-reference success graders

- **Reachable library graph:** a nonempty, acyclic reference graph reaches
  separate projects for every selected package, with direct references for the
  original internal runtime/optional/peer dependency edges. Preserve package
  identity; one giant project or a demo-only graph does not suffice.
- **Original library inputs:** preserve all selected tracked TypeScript inputs,
  including declaration inputs. Scope is under each package's `src`, except
  VueUse's package-root/composable layout. Tests, fixtures, demos, tooling/build
  configs, and template scaffolding are excluded from declaration-input scope.
- **Declaration options:** library emitters need effective `composite`,
  incremental caching, and declaration emission, without `noEmit` or `noCheck`.
  Inherited JSONC settings and composite defaults count. A non-emitting root
  checker may coexist with the emitters but cannot replace them.
- **Isolated declarations:** enable `isolatedDeclarations`, or use an installed
  compiler older than 5.5. The current exemption is not limited to Use Gesture
  and does not pin the compiler: downgrades can satisfy it and remain visible
  only in separate dependency diagnostics.
- **Build wiring:** a supported root build/compile/typecheck/`types:check`/`tsc`
  script must reach a real `tsc` or `vue-tsc` build-mode invocation. Supported
  npm/pnpm/Yarn/`nr` delegation and literal Lage task graphs count; comments,
  orphan scripts, forced rebuilds, disabled checks, and unsupported dynamic
  wrappers do not.
- **Complete-task report gate:** all five migration checks plus native
  compilation, tests, runtime, and applicable lint must pass. Missing evidence
  fails. Dependency/type-safety/file/question diagnostics remain separate here,
  unlike strict-mode. The static migration grader does not itself execute the
  compiler, validate packed consumers, or measure incremental rebuild speed.

The native plans exercise built behavior: pointer-event callbacks (Use Gesture),
dependent task order (Just), a CLI patch release from 1.0.0 to 1.0.1 (Changesets),
highlighting with both engines (Shiki), built framework adapter exports (XState),
and reactive conversions/toggle/arithmetic (VueUse). Just retains its native
Lage build. VueUse retains `test:all` with Chromium and WebKit, no file
parallelism, and the pre-existing named `useStorageAsync > onReadyByPromise`
exclusion in both browser runs; do not claim that excluded test was verified.

## typescript-build-project

Definition: `assets/scenario_expansion.json`; benchmark `scenario-expansion`.
This measures the upstream build helper during heterogeneous modernization tasks.
There is no separate "build this project" task prompt in this cohort.

### Build-helper task prompts

| Task | Prompt |
| --- | --- |
| npm-monorepo-update | Please convert bruno-cli to use Typescript |
| typescript-cjs-to-esm | Convert the packages/codemods package from CJS to ESM. |
| electron-webpack-to-oxc | Switch from using webpack and eslint to oxc and oxlint. |
| react-machine-babel-to-swc | Switch from using babel (transpile) and healthier (lint) to swc and oxlint |

### Public repositories and commits

| Task | Repository | Commit | Node / package manager |
| --- | --- | --- | --- |
| npm-monorepo-update | [usebruno/bruno](https://github.com/usebruno/bruno), `packages/bruno-cli` | `910581a627f4bf5bacfd68b212030dc21c91740a` | 22.12.0 / npm |
| typescript-cjs-to-esm | [cedarjs/cedar](https://github.com/cedarjs/cedar), `packages/codemods` | `28fd4bb982f68a303a9b1faddf28c7a74be28418` | 22 / Yarn 4.12.0 |
| electron-webpack-to-oxc | [electron-react-boilerplate/electron-react-boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate) | `f3465eae52f3683f1f1bcb2dd841b6a63da9e1cf` | 22 / npm |
| react-machine-babel-to-swc | [humaans/react-machine](https://github.com/humaans/react-machine) | `cfa5e526f1cbcf69e2e9bfe3196f4c05da7a4fe2` | 22 / npm |

The historical five-task cohort also contains one non-public input. Its prompt,
repository identity, commit, and private grader details are not published here.
The dashboard row retains that original cohort, not a recomputed public subset;
the full historical result cannot be recreated from these four public cases.

### Build-helper success graders

- **Bruno:** valid CLI tsconfig and a build script invoking `tsc` or `tsgo`;
  TypeScript implementation sources with no obsolete JavaScript under the CLI's
  `src`; a TypeScript dependency at the root or CLI package; and emitted
  JavaScript in a recognized output directory.
- **Cedar:** the same package, compiler-configuration, relative-extension, and
  `import.meta` source checks described in the ESM benchmark.
- **Electron boilerplate:** declared oxlint wired into lint without ESLint;
  an accepted Oxc/Rolldown dependency or a verified stable Vite 8 / Rolldown-Vite
  alias build route; and reachable build scripts without webpack invocations.
  The Vite route checks resolved package identity/version, not merely the word
  "vite" in a script.
- **React Machine:** declared oxlint invoked from lint or tests; a declared SWC
  package; removal of `@babel/core`, `@babel/register`, and `healthier`; and a
  test script that no longer invokes healthier.
- **Separate native evidence:** compilation/tests/lint/runtime and safety are
  reported independently. Runtime plans render Bruno and Cedar CLI help,
  build Electron's development main process, and import React Machine's built
  package. The compact score is task-success pass rate, not native-build pass
  rate or a separate evaluation of build-helper correctness.

## typescript-publish-types (upstream only)

Definition: `assets/publish_types.json`; benchmark `publish-types`.
This skill is present in the source results but is not distributed in this plugin.

### Publication task prompt

> Publish bundled TypeScript declarations for PACKAGE. Update the package metadata so TypeScript consumers resolve the declarations from the packed package.

Substitute the exact `PACKAGE` below.

### Publication repositories and commits

| PACKAGE | Repository | Commit | Node / package manager |
| --- | --- | --- | --- |
| yargs-parser | [yargs/yargs-parser](https://github.com/yargs/yargs-parser) | `913df9d1ddbea131e38516c09c2a81eb15c69968` | 22 / npm |
| ts-migrating | [ycmjason/ts-migrating](https://github.com/ycmjason/ts-migrating) | `d39cd8520a2fde6990c989f9d157dfe25dc1a6a7` | 18 / pnpm 10.28.0 |
| babel-plugin-polyfill-corejs3 | [babel/babel-polyfills](https://github.com/babel/babel-polyfills), `packages/babel-plugin-polyfill-corejs3` | `6e327937ea1155242de55858192dca0bb80e0a74` | 24 / npm |
| @anu3ev/fabric-image-editor | [Anu3ev/image-editor](https://github.com/Anu3ev/image-editor) | `a3fe456624350ba9abf14712c82c006ddd9de4d9` | 20 / npm |
| @tarojs/taro-loader | [NervJS/taro](https://github.com/NervJS/taro), `packages/taro-loader` | `d6d69e30f70d98e49aa9d0b6d4e149d7f4df2980` | 18 / pnpm 10.0.0 |
| tsec | [google/tsec](https://github.com/google/tsec), `packages/tsec` | `17b8ff47adfc3cf357cb69b6df6eb3c72fa3df24` | 20 / npm |

### Publication success graders

- **Metadata changed:** the target package manifest must differ from the pinned
  original.
- **Real packed declarations:** run `npm pack --ignore-scripts`, extract the
  tarball as an external installed package, and resolve every verifier-owned
  public entry to nonempty `.d.ts`, `.d.mts`, or `.d.cts` files inside that
  package. Unpublished checkout files or agent-deleted export branches cannot
  shrink the required matrix.
- **Consumer/module compatibility:** TypeScript 5.9.3 resolves both declaration
  and JavaScript routes, compares their module kinds, and compiles strict
  external consumers with real standard libraries. Dependencies may come from
  the prepared checkout, but the target package files must come from the tarball.
  Required entries/modes are `yargs-parser` root and `./browser` (ESM);
  `ts-migrating` root, `./api`, and `./cli` (ESM and CJS); Babel root (ESM);
  Fabric root (Bundler); and Taro/tsec roots (CJS).
- **Scope of the result:** packing/checker errors are explicit failures. These
  are focused routing and sampled API checks, not comprehensive
  Are the Types Wrong analysis or JavaScript execution. Separate native plans
  exercise the libraries/CLIs or served demo, but the compact publication score
  uses task success, not an added conjunction of native/safety diagnostics.

## Specifying a new benchmark

Provide the exact agent prompt, task ID, public repository URL and full commit
(or a precise empty-project starting state), Node/package-manager versions,
resource limits, required package/config/input scope, and English pass/fail
criteria. Define which checks gate the result and which are only diagnostics.

Record setup/build/typecheck/lint/test commands with working directories,
timeouts, baseline workarounds/exclusions, and runtime assertions with expected
outcomes. Verify the untouched start and a known-good reference solution before
collecting paired agent results. Preserve the source pin, measured start,
grader version, and submitted diff so a grader fix can be applied to the same
attempt rather than silently changing the task.

Do not include private repositories, credentials, or internal result links in a
public benchmark. If an input cannot be published, state the reproducibility gap
and do not relabel a mixed cohort as public-only.
