<!-- prettier-ignore-start -->

# Consumer smoke recipe

Open this file beside the loaded skill: resolve `references/consumer-smoke.md` from the directory of that full `SKILL.md` path, never by target-workspace search.

Replay the unchanged original consumer first, starting with one route and expanding as variants are encountered. Supply project-observed paths, globals, fixtures, and accessors; no universal export shape is correct. Keep one expected → actual row per branch with command, environment, and finished result.

Run the same probes against clean production output and, for published packages, a packed consumer. Keep probes project-local, outside package collections; record results before cleanup. Preserve source tests and fixtures as acceptance consumers, not pages to rewrite around changed output.

## When previous results expire

Changing source → generated JS input, TS `module`, interop/export mode, wrappers, injection, final minifier, or resource URL logic invalidates affected results. Rebuild, then execute the **same complete baseline alias/equality and real API assertions** against final output. Repair the first failed original boundary before another full suite.

In particular, `tsc` CommonJS input plus `exports: "default"` does not by itself unwrap the emitted namespace. Recheck direct/default/named shape after changing the bundler's input, even if a source-input bundle previously passed.

## Node: coexisting accessors and a real call

Place this starter in the consumer's lookup tree as `smoke-built.mjs`. Install the packed package with its runtime dependencies using the repository's manager; do not resolve the source workspace accidentally.

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const [mode, specifier, accessor, expectedType, ...aliases] =
  process.argv.slice(2);
assert.ok(
  (mode === "require" || mode === "import") &&
    specifier &&
    accessor &&
    expectedType,
  "usage: node smoke-built.mjs <require|import> <specifier> <accessor|.> <type> [equivalent-accessors...]",
);
const loaded =
  mode === "require"
    ? createRequire(import.meta.url)(specifier)
    : await import(specifier);
console.log("export keys:", Object.keys(loaded));
const read = (path) =>
  path === "."
    ? loaded
    : path.split(".").reduce((object, key) => object?.[key], loaded);
const value = read(accessor);
assert.equal(typeof value, expectedType);
for (const alias of aliases) assert.equal(read(alias), value, alias);
```

- Use `.` only if consumers receive the module itself; use `default`, a named property, or a nested accessor **only when the baseline does**. Never auto-select `loaded.default ?? loaded`: that hides broken interop.
- Run `require` and `import` independently where advertised; their namespace shapes can differ. Include subpaths/browser conditions and external dependencies.
- Assert required direct/default/named/global aliases **simultaneously**, including identity/values where relevant. Pass extra accessor paths only for baseline-equivalent values; add separate assertions for distinct APIs. Never drop a coexisting accessor or add dummy exports.
- Extend with a real API/result assertion: instantiate a constructor, render a component, or run the built CLI with a real fixture. File/regex/`typeof` checks alone are insufficient.

## Browser and loader branches

| Contract                       | Probe                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser global/IIFE/UMD        | Load the built script in the existing real-browser runner, with documented external globals supplied. Check the exact global accessor, instantiate/call it, and assert a real result. Do not add `process`/`Buffer`/`global` to the page to mask missing browser shims.                                                                                                                   |
| CommonJS branch of UMD         | Load through `require` with real dependencies, independently of the global branch. Assert the baseline direct/default/named shape and behavior.                                                                                                                                                                                                                                           |
| Advertised AMD branch          | Use the existing AMD loader or an isolated sandbox with `define.amd`. Assert named/anonymous registration and dependency IDs, resolve real dependencies, execute the factory, and check the returned API. Merely detecting `define` or testing the global branch is insufficient.                                                                                                         |
| Dev and production application | Start each real serving path, verify readiness, operate the UI, and check console/network errors. For directory routes, compare document/final redirect URLs with and without a trailing slash before child-resource resolution. Preserve canonical redirects or update the actual consumer equivalently, never relax its test. Include nested/base URLs, CSS/SVG, static/license assets. |

Use minimal VM stubs only for contracts they genuinely exercise. State when a VM probe does not replace a real DOM/browser/WebGL/worker lane.

Preserve public global aliases consumed by existing fixtures and nested pages. If a fixture adaptation is unavoidable, separately assert the original public alias/API and equivalent behavior; a convenient rewritten smoke page cannot establish compatibility.

## Readiness and service ownership

- Trace the real runner's startup condition: stdout strings, problem matchers, redirects, exit codes, and lifecycle timing can be machine APIs. If specs never start, inspect that predicate before changing browser setup or timeouts. Preserve the signal or update producer and actual consumer together.
- For each temporary server/watcher, record its process tree/port, bound readiness waits, and execute its real consumer, not just an HTTP 200 probe.
- Stop the owned process tree after probes and confirm exit/port release before replay. A detached terminal wrapper is not a stopped service; inspect the original process before creating another.

## Workers and asynchronous resources

- Exercise the inline worker with a real message/response and terminate it.
- Force the **supported** external fallback condition (for example, Blob/CSP restrictions), then prove the external worker URL loads and the same API works. Preserve classic/module behavior; do not manufacture a new fallback the old API never offered.
- **Blob locations are not HTTP asset bases.** If a Blob worker still fetches external WASM/dynamic resources, capture/pass a real serving or bundle base, or use an external-worker strategy. Do not resolve those resources from the Blob's `self.location`; choose the implementation supported by this release and the existing contract, not a universal bundler API or invented fallback.
- Serve under the recorded base/subpath. For each inline/fallback/dynamic route present, require a real message/response, actual resource request status/MIME, successful async initialization, and a meaningful result. Inspect resource loads, not just files on disk or worker-file HTTP status.
- Exercise the direct no-worker entry when published. Keep asynchronous/error/disposal semantics and assertions; do not inline resources to bypass failing fetches.

<!-- prettier-ignore-end -->
