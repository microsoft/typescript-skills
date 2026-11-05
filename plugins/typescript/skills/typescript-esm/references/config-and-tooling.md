# Manifest, tsconfig, build, test, and lint alignment

Flipping `"type": "module"` is the smallest part of the migration and the easiest to mistake for the
whole of it. Every consumer of the package's layout has to agree.

## package.json

```jsonc
{
  "type": "module",        // the switch: .js/.ts files in this package are now ES modules
  "engines": { "node": "^20.19.0 || >=22.12.0" },  // require(esm) floor; see below
  "bin": "./dist/cli.js",  // must point at an ESM-emitting output
  "exports": {             // if present, this is the *only* way in
    ".": "./dist/index.js",
    "./package.json": "./package.json"
  }
}
```

* `"type"` applies to the nearest ancestor `package.json`, so in a monorepo it affects exactly one
   workspace. Sibling packages are unaffected; packages that *import* this one are.
* `.mjs`/`.cjs` (and `.mts`/`.cts`) always win over `"type"`. Use `.cjs` for the handful of files
   that genuinely must stay CommonJS.
* If you add or tighten `"exports"`, verify every existing deep import from other workspaces still
   resolves. `"exports"` is a hard cutoff, not a hint.
* If the package has a CLI, the emitted entry point still needs its `#!/usr/bin/env node` shebang.
* **Align `engines` and CI with what the migration relies on.** If anything `require()`s the
   converted package — CJS consumers, or a tool that loads your files (next section) — either the
   floor is `^20.19.0 || >=22.12.0`, where `require(esm)` is unflagged, or a narrow `.cjs` artifact
   keeps older Node working. Change `engines.node` and the CI matrix in the same change, and verify
   on the lowest supported version if one is installed. Dropping a Node major that CI tests is a
   breaking change; say so in the summary. If
   nothing `require()`s it, `import.meta.dirname` only needs `>=20.11`; without either, the
   `fileURLToPath(import.meta.url)` forms work on every ESM-capable Node. Never leave an
   `engines.node` floor that the output cannot actually run on.

> A package's `"type"` field defines the module format that Node.js should use for all `.js` files
> within that package scope.
>
> — [Node.js, Modules: Packages — Determining module system](https://nodejs.org/api/packages.html#determining-module-system)

### Tools that `require()` your output

jscodeshift transforms, ESLint plugins, Babel plugins, Jest transformers, and many config loaders
load your files with `require()`. Converting the package to ESM must keep them working. Do not stop
to ask which way to go. Choose by what CI tests, and state the choice in the summary:

 1. **Raise the floor to `require(esm)`** when CI tests only Node 20 or newer (or there is no CI)
    and the user has not asked to keep older Node. On `^20.19.0 || >=22.12.0` the tool's
    `require()` loads your ES module, provided nothing in its graph uses top-level `await`. Set
    `engines.node` and CI accordingly. Check what the tool reads from the result: `require(esm)`
    returns the module namespace object. Many tools already accept `mod.default`; if the tool needs
    the `require()` result itself to be the function, also add `export { fn as 'module.exports' }`.
    Node honours that name only on `>=22.12.0` (not 20.19), so it raises the floor further — or use
    option 2.
 2. **Keep a narrow `.cjs` artifact** when CI tests a Node major below 20, or the user asked to
    keep supporting one. Keep the
    package `"type": "module"`. Emit or keep only the `require()`d files as `.cjs` (for example
    a separate build step for the transform files, or a `.cjs` wrapper that re-exports a CommonJS
    build of just those files). `bin`, `main`, and `exports["."]` stay ESM.

Either way, test the integration the README documents (for example run the tool against a fixture
with `timeout 60 … </dev/null`), not just your own test suite.

## tsconfig.json

```jsonc
{
  "compilerOptions": {
    "module": "nodenext",            // or node16 / node18 / node20
    "moduleResolution": "nodenext",  // must pair: node16 with node16, nodenext with nodenext
    "target": "es2022",
    "verbatimModuleSyntax": true
  }
}
```

* `node16`, `node18`, `node20`, and `nodenext` are the only `module` values that model Node's dual
   module system, and they are the correct choice for anything that runs under Node — whether or not
   it uses ESM. Every other value forces all output into one format.
* They emit CJS *or* ESM per file, based on detected module format: `.mts`/`.mjs` are always ESM,
   `.cts`/`.cjs` always CJS, and `.ts`/`.js` follow the nearest `package.json` `"type"`. This is why
   `"type": "module"` and the `module` setting must be changed together — either one alone leaves
   the package in a state that neither typechecks nor runs.

   > The detected module format of input `.ts`/`.tsx`/`.mts`/`.cts` files determines the module
   > format of the emitted JavaScript files. So, for example, a project consisting entirely of `.ts`
   > files will emit all CommonJS modules by default under `--module nodenext`, and can be made to
   > emit all ES modules by adding `"type": "module"` to the project `package.json`.
   >
   > — [TypeScript, Modules Reference — module format detection](https://www.typescriptlang.org/docs/handbook/modules/reference.html#module-format-detection)

   Setting `"module": "nodenext"` does **not** by itself make the output ESM. A `.ts` file in a
   package without `"type": "module"` still emits CommonJS under `nodenext`. If you change the
   tsconfig and not the manifest, `tsc` will happily typecheck CJS-style code and emit CJS, and you
   will think the migration succeeded.
* `node16`/`node18` disallow `require` of an ESM file; `nodenext` models `require(esm)`, which Node
   supports unflagged on `^20.19.0 || >=22.12.0`. Pick based on the Node versions you support, not
   on convenience. Note that TypeScript cannot see whether the required graph contains top-level
   `await`, which still throws at runtime — see [globals-and-interop.md](globals-and-interop.md).
* If the repo has several tsconfigs (`tsconfig.json`, `tsconfig.build.json`, a test config, a root
   solution config), update the ones that apply and check what each `include`/`exclude` actually
   covers. A config that excludes `__tests__` will never tell you the test files are broken.
* Adding `"rootDir"`, a build-only tsconfig, or new excludes changes the emitted layout. If `dist/`
   gains or loses a directory level, every `import.meta.dirname`-based path shifts with it.

## Build tooling

The compiler is not necessarily what produces `dist/`. Check for esbuild, tsup, SWC, Rollup, or a
framework build helper, and set its output format explicitly:

```js
// esbuild
await build({ ...defaultBuildOptions, format: 'esm', platform: 'node' })
```

Then read the output. `grep -l 'require(' dist/` finding hits means the build still emits CommonJS
regardless of what `package.json` says.

Some build helpers offer a banner that redefines `require`, `__filename`, and `__dirname` inside the
ESM output:

```js
banner: { js: `import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);` }
```

This is a compatibility shim for bundled third-party CJS you cannot edit. It is not a substitute for
migrating your own source — it makes the leftover CommonJS invisible to every check. If you need it,
scope it as narrowly as possible and call it out in your summary.

## Test runner

Vitest and Jest have their own resolvers and will happily resolve `./foo` with no extension, so the
suite stays green over broken imports. That is convenient and dangerous: it means **a passing test
suite is not evidence the migration is complete**.

* Check the test config for `moduleNameMapper` / `resolve.alias` entries that paper over extensions.
* Jest on native ESM needs `--experimental-vm-modules` or a transform; if the suite runs through a
   CJS transform, it is not exercising ESM at all.
* Setup files (`vite.setup.mts`, `jest.setup.ts`) are ordinary modules and need the same treatment.
* Run suites with `CI=1` and output to a log file outside the repo, and judge them by exit code.
   Jest and Vitest switch to watch or interactive mode on a TTY without it.

**Add a check that Node actually loads the build.** Keep it non-interactive and bounded, so a CLI
that prompts cannot hang the session:

```bash
timeout 60 node dist/cli.js --help </dev/null                                        # CLI
(cd /tmp && timeout 60 node "/abs/path/to/repo/dist/cli.js" --help </dev/null)       # from outside
timeout 60 node --input-type=module -e 'await import("./dist/index.js")' </dev/null   # library
```

Use only `--help`, `--version`, or the CLI's `--yes`/non-TTY flags; never start an interactive
prompt. Keep the `cd` in a subshell so later commands still run in the repo. This is the only gate
that catches a missing extension in a file the typechecker skipped:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/dist/foo/bar'
imported from …/dist/foo/bar.yargs.js
```

## Lint and format

Run the project's own formatter over every file you changed, then the format check the CI runs:

```bash
npx prettier --write <changed files>
npx eslint --fix <changed files>
```

Import rewrites and `import.meta.dirname` substitutions change line widths, so previously conforming
lines now wrap differently. Hand-formatting these is a reliable way to fail `prettier --check` on an
otherwise correct migration.

Also check lint config for rules that the migration invalidates — `import/extensions`,
`n/no-missing-import`, `import/no-unresolved` — and for the lint config file itself being CommonJS
(`.eslintrc.js` in a `"type": "module"` package must become `.eslintrc.cjs`, or move to
`eslint.config.mjs`).

## Generated code

If the package generates code (scaffolding templates, codemod templates, `create-*` fixtures), the
templates are source too. A template that still emits `require`, `__dirname`, or extensionless
imports produces a broken file on every run, and nothing in the current build will catch it.

## References

* [Node.js — Modules: Packages](https://nodejs.org/api/packages.html)
* [Node.js — Determining module system](https://nodejs.org/api/packages.html#determining-module-system)
* [Node.js — `"type"`](https://nodejs.org/api/packages.html#type)
* [Node.js — `"exports"`](https://nodejs.org/api/packages.html#exports)
* [TypeScript — `module` compiler option](https://www.typescriptlang.org/tsconfig/#module)
* [TypeScript — Modules Reference, module format detection and emit](https://www.typescriptlang.org/docs/handbook/modules/reference.html#node16-node18-node20-nodenext)
* [TypeScript — Choosing compiler options](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html)
