# CommonJS globals and CommonJS-dependency interop

## Part 1: CommonJS globals do not exist in ESM

> ### No `require`, `exports`, or `module.exports`
>
> In most cases, the ES module `import` can be used to load CommonJS modules. If needed, a `require`
> function can be constructed within an ES module using `module.createRequire()`.
>
> ### No `__filename` or `__dirname`
>
> These CommonJS variables are not available in ES modules. `__filename` and `__dirname` use cases
> can be replicated via `import.meta.filename` and `import.meta.dirname`.
>
> — [Node.js, Differences between ES modules and CommonJS](https://nodejs.org/api/esm.html#differences-between-es-modules-and-commonjs)

The same section also removes [`require.main`](https://nodejs.org/api/esm.html#no-requiremain),
[`require.resolve`](https://nodejs.org/api/esm.html#no-requireresolve),
[`require.cache`](https://nodejs.org/api/esm.html#no-requirecache),
[`require.extensions`](https://nodejs.org/api/esm.html#no-requireextensions), and `NODE_PATH`. Each
has a documented replacement; check for all of them, not just `__dirname`.

### Replacement table

| CommonJS | ESM (Node ≥ 20.11 / 21.2) | ESM (older Node) |
| --- | --- | --- |
| `__dirname` | `import.meta.dirname` | `path.dirname(fileURLToPath(import.meta.url))` |
| `__filename` | `import.meta.filename` | `fileURLToPath(import.meta.url)` |
| `require('x')` | `import x from 'x'` (static) or `await import('x')` | same |
| `require(computed)` | `await import(computed)`, or `createRequire(import.meta.url)` | same |
| `require.resolve('./x')` | `import.meta.resolve('./x')` (returns a URL string) or `new URL('./x', import.meta.url)` | `createRequire(import.meta.url).resolve` |
| `require.main === module` | `import.meta.main` | `process.argv[1] === fileURLToPath(import.meta.url)` |
| `module.exports = x` | `export default x` | same |
| `exports.y = …` | `export const y = …` | same |
| reading a data file next to the source | `readFileSync(new URL('./data.json', import.meta.url))` | same |

`import.meta.dirname` and `import.meta.filename` were added in Node **v20.11.0** and **v21.2.0**
([docs](https://nodejs.org/api/esm.html#importmetadirname)). Gate on what the project actually
supports, in both directions:

* `engines.node` in `package.json`, and whatever Node versions CI runs. If any allows older than
   20.11, use the `fileURLToPath(import.meta.url)` form — it is portable across every version.
* The installed `@types/node`. An older `@types/node` will not declare `import.meta.dirname` even
   when the runtime has it, and you will get a type error for code that would have run fine. Either
   bump `@types/node` or use the portable form; do not cast around it.

`module.createRequire()` has been available since v12.2.0.

Caveat from the docs: `import.meta.dirname` and `import.meta.filename` are **only present on `file:`
modules**. Code loaded from `data:` or `http:` URLs, or evaluated via `--eval`, will not have them.
`import.meta.url` itself is always defined ([`import.meta`](https://nodejs.org/api/esm.html#importmeta)).

### `import.meta.dirname` in built output

`import.meta.dirname` resolves relative to the *emitted* file, exactly as `__dirname` did. A source
at `src/codemods/list.ts` that builds to `dist/codemods/list.js` gets `dist/codemods` either way, so
existing path arithmetic keeps working. What breaks is a bundler that inlines several sources into
one output file — then the directory is the bundle's, not the original module's. Check your emit
layout before relying on it.

### Editing hazards

Two mistakes account for most of the self-inflicted damage here:

**Deleting a still-used import.** Rewriting `path.join(__dirname, 'x.js')` to
`fileURLToPath(new URL('./x.js', import.meta.url))` removes one `path` usage, not necessarily all of
them. Deleting `import path from 'node:path'` then yields `TS2304: Cannot find name 'path'`. Check
the rest of the file first.

**Hand-formatting the replacement.** `import.meta.dirname` is longer than `__dirname`, so lines that
fit before now need rewrapping. Run the project's formatter instead of guessing; a formatting-only
lint failure is an easy way to fail an otherwise correct migration.

### Do not forget non-source files

`__dirname` also appears in test setup files (`vite.setup.mts`), build scripts (`build.mts`), and —
most damagingly — in code-generation templates (`templates/*.template`, scaffolding sources). A
template that still emits `__dirname` produces a broken file every time someone runs the generator.

## Part 2: CommonJS dependencies seen through `node16`/`nodenext`

Switching `moduleResolution` changes what a default import of a CommonJS dependency *means*. Files
you never touched can start failing. From the TypeScript modules reference:

> **When an ES module references a CommonJS module:** The `module.exports` of the CommonJS module is
> available as a default import to the ES module. Properties (other than `default`) of the CommonJS
> module's `module.exports` may or may not be available as named imports to the ES module.
>
> — [TypeScript, Modules Reference — Interoperability rules](https://www.typescriptlang.org/docs/handbook/modules/reference.html#interoperability-rules)

Node describes the runtime side the same way:

> When importing CommonJS modules, the `module.exports` object is provided as the default export.
> Named exports may be available, provided by static analysis as a convenience for better ecosystem
> compatibility.
>
> — [Node.js, Interoperability with CommonJS](https://nodejs.org/api/esm.html#interoperability-with-commonjs)

The asymmetry matters. Per
[CommonJS namespaces](https://nodejs.org/api/esm.html#commonjs-namespaces), the default import is
**reliable** — the docs state a CommonJS module "can be reliably imported using the ES module
default import or its corresponding sugar syntax", because the namespace wrapper "always provides a
default export key pointing to the CommonJS `module.exports` value". Named imports are a
**heuristic**: Node performs "a heuristic static analysis … against the source text of the CommonJS
module to get a best-effort static list of exports", necessarily *before* the CJS module is
evaluated. TypeScript cannot tell from a declaration file whether that analysis will succeed and
[optimistically assumes it will](https://www.typescriptlang.org/docs/handbook/modules/reference.html#interoperability-rules),
so a named import from a CJS package can typecheck cleanly and still be `undefined` at runtime.

Practical consequence: when a named import from a CommonJS dependency breaks, do not assume the
types are wrong. Import the default and destructure from it, and confirm by actually running the
code.

Under `--module commonjs` with `esModuleInterop`, TypeScript synthesised a default from
`export =`/`module.exports`, so `import f from 'cjs-pkg'` gave you the callable. Under
`node16`/`nodenext` the default import is the whole `module.exports` object. When the package's types
put the real export under `.default` (very common for Babel-compiled packages), the two disagree.

### `TS2349 This expression is not callable` on a default import

```text
error TS2349: This expression is not callable.
  Type 'typeof import("…/@types/babel__traverse/index")' has no call signatures.
```

You imported the module object, not the function. The typed fix is to reach for the property the
types actually declare:

```ts
import traverseModule from '@babel/traverse'

// `traverseModule` is module.exports; the callable is module.exports.default.
const traverse = traverseModule.default
```

Verify against the runtime, not just the types, because Node's named export detection for CJS is a
static-analysis best effort and TypeScript optimistically assumes it succeeds:

```bash
node --input-type=module -e 'import m from "@babel/traverse"; console.log(typeof m, Object.keys(m))'
```

Use whichever typed import matches what Node prints: the default import itself when it is the
callable, `.default` when the callable is there. If Node and the types agree but a test fails, the
test runner is loading the module differently (for example Jest transforming to CommonJS); fix the
runner configuration (`extensionsToTreatAsEsm`, ts-jest `useESM`, `--experimental-vm-modules`)
rather than the source.

Do **not** settle this with `// @ts-ignore`, `as any`, a double assertion (`as unknown as T`), or
`m.default ?? m` shape-probing. Each hides a real mismatch, and the next person has no way to tell
whether the runtime shape was ever checked.

`import * as ns from 'cjs-pkg'` is not the fix either: a namespace object is never callable. Node
constructs a Module Namespace Exotic Object there, and TypeScript rejects calling it.

### `TS2503 Cannot find namespace 'x'` on a type-only default import

```ts
import type yargs from 'yargs'
export const builder = (y: yargs.Argv) => { /* … */ }
//                         ^^^^^ TS2503: Cannot find namespace 'yargs'.
```

This compiles fine under `module: commonjs` and breaks under `nodenext`, because the *declaration
file* being consulted changed. `@types/yargs/index.d.ts` ends in `export = yargs` alongside
`declare namespace yargs { … }`, so a default import inherits namespace meaning. Once the importing
file is ESM, resolution picks the ESM-conditioned `@types/yargs/index.d.mts`, which ends in
`export default _instanceFactory` plus `export type { Argv, … }`. A default import binds a value and
its type — never a namespace — so `yargs.Argv` has nothing to refer to.

Import the named type directly. It is exported from both declaration files:

```ts
import type { Argv } from 'yargs'
export const builder = (y: Argv) => { /* … */ }
```

If you really need the whole namespace, `import type * as yargs from 'yargs'` works — but the named
import is clearer and survives future packaging changes. Expect this wherever a dependency ships
separate `.d.ts` and `.d.mts` entry points; the two are frequently not shaped alike.

### Deep subpath imports (`TS2307`)

```text
error TS2307: Cannot find module 'jscodeshift/src/Runner' or its corresponding type declarations.
```

> Like in CommonJS, module files within packages can be accessed by appending a path to the package
> name unless the package's `package.json` contains an `"exports"` field, in which case files within
> packages can only be accessed via the paths defined in `"exports"`.
>
> — [Node.js, `import` specifiers](https://nodejs.org/api/esm.html#import-specifiers)

First check the dependency's `package.json`.

**No `"exports"` field — the common case.** The deep path is reachable; it just needs a file
extension, exactly like a relative specifier, because ESM resolution does not try extensions there
either. This is the fix for `jscodeshift`:

```ts
import { run } from 'jscodeshift/src/Runner.js'
```

**`"exports"` blocks the path.** Options, best first:

1. Use a subpath the dependency actually exports, or its main entry, if it exposes the same API.
2. Upgrade the dependency to a version that exports what you need.
3. If CJS `require` still reaches the file, keep that one call site on `createRequire`, with a
   comment explaining why:

   ```ts
   import { createRequire } from 'node:module'
   const require = createRequire(import.meta.url)
   const { run } = require('pkg/src/Runner') as typeof import('pkg/src/Runner')
   ```

4. Ask upstream to add the subpath. Record this as a limitation rather than pretending it is fixed.

### `import x = require('y')`

Contrary to intuition, this syntax is *not* rejected in a file detected as ESM under
`node16`/`nodenext`. TypeScript accepts it (even with `verbatimModuleSyntax`) and emits a
`createRequire` shim:

```js
import { createRequire as _createRequire } from "module";
const __require = _createRequire(import.meta.url);
const b = __require("./b.cjs");
```

Verified with `tsc` 5.9.3 under `module: nodenext` in a `"type": "module"` package.

So it will compile — but leaving it in place means the migration did not happen for that import. It
keeps a synchronous CommonJS load and makes the output unusable anywhere `require` does not exist.
Convert it to a real `import` and apply the `.default` guidance above if the call site breaks. Keep
it only for the deep-subpath case above, with a comment saying why.

### `require()`-ing an ES module

Node `^20.19.0 || >=22.12.0` can `require()` an ES module synchronously (unflagged), and
TypeScript permits it under `nodenext`:

> In `node16` and `node18`, `require` cannot reference an ES module. […] In `nodenext`, to reflect
> the behavior of Node.js v22.12.0 and later, `require` can reference an ES module. In Node.js, an
> error is thrown if the ES module, or any of its imported modules, uses top-level `await`.
> TypeScript does not attempt to detect this case and will not emit a compile-time error.
>
> — [TypeScript, Modules Reference — interoperability rules](https://www.typescriptlang.org/docs/handbook/modules/reference.html#interoperability-rules)

Two consequences:

* Do not tell a consumer "you can just `require()` it now" unless their Node floor is
   `^20.19.0 || >=22.12.0` *and* nothing in the graph uses top-level `await`. If the migration
   relies on it, raise `engines.node` and the CI matrix to that range in the same change.
* Older TypeScript documentation — including the 4.7 release notes — states that dynamic `import()`
   is the *only* way for CJS to load ESM. That was true then and is no longer universally true. Do
   not repeat it as a blanket rule, and do not rely on the newer behaviour without checking the
   Node floor.

## References

* [Node.js — Differences between ES modules and CommonJS](https://nodejs.org/api/esm.html#differences-between-es-modules-and-commonjs)
* [Node.js — No `__filename` or `__dirname`](https://nodejs.org/api/esm.html#no-__filename-or-__dirname)
* [Node.js — No `require`, `exports`, or `module.exports`](https://nodejs.org/api/esm.html#no-require-exports-or-moduleexports)
* [Node.js — `import.meta`](https://nodejs.org/api/esm.html#importmeta) and [`import.meta.dirname`](https://nodejs.org/api/esm.html#importmetadirname)
* [Node.js — Interoperability with CommonJS](https://nodejs.org/api/esm.html#interoperability-with-commonjs)
* [Node.js — CommonJS namespaces](https://nodejs.org/api/esm.html#commonjs-namespaces)
* [Node.js — `module.createRequire()`](https://nodejs.org/api/module.html#modulecreaterequirefilename)
* [Node.js — Modules: Packages, `"exports"`](https://nodejs.org/api/packages.html#exports)
* [TypeScript — Modules Reference, interoperability rules](https://www.typescriptlang.org/docs/handbook/modules/reference.html#interoperability-rules)
* [TypeScript — Appendix: ESM/CJS Interop](https://www.typescriptlang.org/docs/handbook/modules/appendices/esm-cjs-interop.html)
