# Relative module specifiers

## The rule

In an ES module, Node resolves relative and absolute specifiers with plain URL semantics. It does
not try extensions and it does not look for `index.js` in a directory.

> A file extension must be provided when using the `import` keyword to resolve relative or absolute
> specifiers. Directory indexes (e.g. `'./startup/index.js'`) must also be fully specified.
>
> — [Node.js, Mandatory file extensions](https://nodejs.org/api/esm.html#mandatory-file-extensions)

"Specifier" is not limited to `import … from`. Node defines it as the string in an `import`
statement, in an `export … from` statement, and the argument to an `import()` expression — all three
obey the same rule ([Terminology](https://nodejs.org/api/esm.html#terminology)).

TypeScript reports the source-side violation as:

```text
error TS2835: Relative import paths need explicit file extensions in ECMAScript imports
when '--moduleResolution' is 'node16' or 'nodenext'. Did you mean './foo.js'?
```

When the specifier names a directory, TypeScript cannot suggest a replacement and reports `TS2834`
("Consider adding an extension to the import path") instead. At runtime the two fail differently:
a missing extension is `ERR_MODULE_NOT_FOUND`, a directory is `ERR_UNSUPPORTED_DIR_IMPORT`.

## Write the *emitted* extension

Under `node16`/`nodenext`, a specifier in a `.ts` file names the file that will exist at runtime, so
you write `.js` even though the file on disk is `.ts`.

> This code works in CommonJS modules, but will fail in ES modules because relative import paths
> need to use extensions. As a result, it will have to be rewritten to use the extension of the
> *output* of `foo.ts` — so `bar.ts` will instead have to import from `./foo.js`.
>
> — [TypeScript 4.7, `type` in `package.json` and new extensions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html#type-in-packagejson-and-new-extensions)

| Source file being imported | Specifier you write |
| --- | --- |
| `./util.ts` | `./util.js` |
| `./util.tsx` | `./util.js` |
| `./util.mts` | `./util.mjs` |
| `./util.cts` | `./util.cjs` |
| `./lib/index.ts` | `./lib/index.js` |
| `./data.json` | `./data.json` with `with { type: 'json' }` |

`.mts` always emits `.mjs` and `.cts` always emits `.cjs`, with declarations `.d.mts` and `.d.cts`
([New File Extensions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html#new-file-extensions)).
`.mjs`/`.cjs` are unconditional — `"type"` cannot override them — so they are the right tool for the
handful of files that must stay one format regardless of the package scope.

`./lib` → `./lib/index.js`, never `./lib.js`. Check whether the path names a file or a directory
before you rewrite it; a directory is the case that silently produces a wrong path.

Declaration files follow the same rule: a `.d.ts` is interpreted according to its containing
package, so hand-written `.d.ts` files in the package need extensions on their relative specifiers
too.

### The `rewriteRelativeImportExtensions` exception

If the project sets `"allowImportingTsExtensions"` together with `"rewriteRelativeImportExtensions"`
(TypeScript 5.7+), the convention is inverted: source files write `./util.ts` and the compiler
rewrites the specifier to `./util.js` on emit. Check the tsconfig before rewriting anything.

This exists for projects that also run their `.ts` files **in place** under `tsx`, Deno, Bun, or
`node --experimental-strip-types`, where the runtime needs the `.ts` extension
([TypeScript 5.7 — Path rewriting for relative paths](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-7.html#path-rewriting-for-relative-paths)).
Running `.ts` in place and running `tsc`-emitted `.js` under Node are two different contracts; pick
the one the project actually ships and be consistent.

It is **not** a shortcut around this audit. The flag only rewrites relative specifiers that already
carry a `.ts`/`.tsx`/`.mts`/`.cts` extension. It does nothing for:

* extensionless specifiers — the actual failure mode here;
* bare specifiers, `paths` aliases, or `#imports` subpath imports;
* anything resolved through a package's `"exports"` field.

See [`rewriteRelativeImportExtensions`](https://www.typescriptlang.org/tsconfig/rewriteRelativeImportExtensions.html)
for the full list of what it declines to touch. Enumerate the specifiers either way.

> The TypeScript 4.7 release notes are the clearest statement of the output-extension rule, but one
> line on that page is now stale: it says the only way to import ESM from CJS is dynamic `import()`.
> Under `module: nodenext` on Node `^20.19.0 || >=22.12.0`, a synchronous `require()` of an ES
> module is supported. See [config-and-tooling.md](config-and-tooling.md) for the caveats.

## Every syntactic form that carries a specifier

A rewrite that only covers `import … from` is incomplete. All of these need the extension:

```ts
import a from './a.js'
import { b } from './b.js'
import * as c from './c.js'
import './side-effect.js'
import type { D } from './d.js'
import { type E, f } from './e.js'
export { g } from './g.js'
export * from './h.js'
export type { I } from './i.js'
const j = await import('./j.js')
```

`import type` and inline `type` specifiers are erased from the output, so they can never crash at
runtime — but leaving them extensionless is inconsistent, fails `TS2835`, and breaks the moment
someone removes the `type` keyword. Fix them too.

Dynamic `import()` with a computed specifier (`` await import(`./codemods/${name}.js`) ``) still needs
the extension in the template. These are invisible to a plain grep for `from '`.

`require()` calls, `require.resolve()`, and `import x = require('y')` are a different problem — see
[globals-and-interop.md](globals-and-interop.md).

## Do not use the compiler's error list as your worklist

`tsc --noEmit` only reports files inside the project's `include`/`files`. Packages routinely exclude
test directories, fixtures, and build scripts from the typecheck project. Test runners such as Vitest
and Jest resolve extensionless relative imports with their own resolver, so the tests stay green too.

The result is a package that typechecks clean, passes its whole suite, and still ships broken
imports. In practice, the file categories that get missed are, in order:

1. **Test files** — `__tests__/**/*.test.ts`, `*.spec.ts`. By far the most common miss.
2. **Test helpers** — `testUtils/`, `test-helpers/`, files re-exporting from `./index`.
3. **Fixture and template files** — `*.template`, `__testfixtures__/`, scaffolding sources that
   *generate* new code. If these still emit `require`/`__dirname`/extensionless imports, every file
   generated from them is born broken.
4. **Root-level config and build scripts** — `vite.config.mts`, `vite.setup.mts`, `build.mts`,
   `*.config.ts`.

## Enumerate and rewrite them with the bundled scripts

Scan the whole package, not just the typecheck project. The skill ships both halves as files, so
there is no inline quoting to get wrong. `<skill-dir>` is the directory containing `SKILL.md`:

```bash
# Rewrite: resolves each specifier on disk; file -> .js/.mjs/.cjs, directory -> /index.js.
node <skill-dir>/scripts/rewrite-relative-specifiers.mjs packages/<pkg>
git diff --stat

# Finish line: exits 1 while extensionless specifiers or CJS globals remain.
node <skill-dir>/scripts/scan-esm-leftovers.mjs packages/<pkg>
```

Both skip `node_modules`, `dist`, `build`, `out`, `coverage`, `__testfixtures__`, `.github/skills`,
and the skill's own directory. They also skip test-data directories (`fixtures`, `__fixtures__`,
`valid-data`, `invalid-data`, `testdata`) and list them, because those usually hold input the tests
parse rather than code Node runs; `--include <name>` processes one. Add `--exclude <dir>` for other
data directories (snapshot baselines, generated code). The rewrite only touches specifiers that
resolve on disk, so code embedded in test strings is left alone. It prints counts per directory
(`--verbose` lists each rewrite, `--dry-run` writes nothing), then JSON imports, computed `import()`
templates, and unresolved specifiers for you to handle by hand. Re-run the formatter afterwards.

The scan treats `.cjs`/`.cts` files and anything under a nested `package.json` with
`"type": "commonjs"` as intentionally CommonJS: it lists those scopes but does not fail on them.

"`scan-esm-leftovers.mjs` exits 0" is the finish line for this part of the migration, not "`tsc` is
quiet".

### Fallback without the scripts

`rg` is often not installed. `grep` and `git grep` are:

```bash
# Relative specifiers in from/import/import() position, then drop the ones that have an extension.
grep -rnE --include='*.ts' --include='*.tsx' --include='*.mts' --include='*.cts' \
  --include='*.js' --include='*.mjs' --include='*.jsx' --include='*.template' \
  --exclude-dir=node_modules --exclude-dir=dist \
  "(from|import)[[:space:]]*\(?[[:space:]]*['\"]\.\.?/[^'\"]*['\"]" packages/<pkg> \
  | grep -vE "\.(js|mjs|cjs|jsx|json|node|css|svg)['\"]"
```

This misses `from` on the line after a multi-line import list; the scripts do not.

Never put a multi-line rewrite in a double-quoted `node -e "…"` or `bash -c "…"`. A `!` inside
double quotes triggers bash history expansion and the command never runs. Write a `.mjs` file, or use
a quoted heredoc so the shell leaves the body alone:

```bash
node <<'EOF'
// script body; '!' and '$' are safe here
EOF
```

## Bare specifiers into dependencies

Relative specifiers are the bulk of the work, but deep imports into dependencies change too, and
they fail as `TS2307 Cannot find module`. If the dependency has no `"exports"` field, the deep path
needs the same file extension as a relative one: `pkg/src/Runner` becomes `pkg/src/Runner.js`. If it
declares `"exports"`, only the paths it lists are reachable. See
[globals-and-interop.md](globals-and-interop.md#deep-subpath-imports-ts2307).

## References

* [Node.js — Mandatory file extensions](https://nodejs.org/api/esm.html#mandatory-file-extensions)
* [Node.js — `import` specifiers: terminology](https://nodejs.org/api/esm.html#terminology)
* [Node.js — Modules: Packages, `"exports"`](https://nodejs.org/api/packages.html#exports)
* [TypeScript 4.7 — `type` in `package.json` and new extensions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html#type-in-packagejson-and-new-extensions)
* [TypeScript 4.7 — New file extensions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html#new-file-extensions)
* [TypeScript 5.7 — Path rewriting for relative paths](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-7.html#path-rewriting-for-relative-paths)
* [TypeScript — `rewriteRelativeImportExtensions`](https://www.typescriptlang.org/tsconfig/rewriteRelativeImportExtensions.html)
* [TypeScript — Modules Reference, `node16`/`node18`/`node20`/`nodenext`](https://www.typescriptlang.org/docs/handbook/modules/reference.html#node16-node18-node20-nodenext)
* [TypeScript — Modules Theory, module specifiers and output](https://www.typescriptlang.org/docs/handbook/modules/theory.html)
