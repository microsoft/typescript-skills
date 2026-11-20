<!-- prettier-ignore-start -->

# Consumer smoke recipe

Use the baseline artifact matrix to select **all advertised** entry points/formats and observable APIs. Supply the project's paths, names, globals, fixtures, and expected accessors; no universal export shape is correct.

Run the same probes before and after migration, against clean production output and, for published packages, a packed consumer. Keep probe files inside a project-local scratch directory, outside package collections; record results before cleaning them up. These checks supplement the repository's tests, not replace them.

## Node: exact accessor and a real call

Place this starter in the consumer's lookup tree as `smoke-built.mjs`. Install the packed package with its runtime dependencies using the repository's manager; do not resolve the source workspace accidentally.

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const [mode, specifier, accessor, expectedType] = process.argv.slice(2);
assert.ok(
  (mode === "require" || mode === "import") &&
    specifier &&
    accessor &&
    expectedType,
  "usage: node smoke-built.mjs <require|import> <specifier> <accessor|.> <type>",
);
const loaded =
  mode === "require"
    ? createRequire(import.meta.url)(specifier)
    : await import(specifier);
console.log("export keys:", Object.keys(loaded));
const value =
  accessor === "."
    ? loaded
    : accessor.split(".").reduce((object, key) => object?.[key], loaded);
assert.equal(typeof value, expectedType);
```

- Use `.` only if consumers receive the module itself; use `default`, a named property, or a nested accessor **only when the baseline does**. Never auto-select `loaded.default ?? loaded`: that hides broken interop.
- Run `require` and `import` independently where advertised; their namespace shapes can differ. Include subpaths/browser conditions and external dependencies.
- Extend the starter with a representative API call and an assertion on its result. Instantiate an expected constructor, render an exported component, or run the built CLI with a real fixture. A function-type assertion alone is insufficient.
- Compare important export keys, callability, results, and errors with the baseline. Do not add dummy exports to make the probe pass.

## Browser and loader branches

| Contract                       | Probe                                                                                                                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser global/IIFE/UMD        | Load the built script in the existing real-browser runner, with documented external globals supplied. Check the exact global accessor, instantiate/call it, and assert a real result. Do not add `process`/`Buffer`/`global` to the page to mask missing browser shims.           |
| CommonJS branch of UMD         | Load through `require` with real dependencies, independently of the global branch. Assert the baseline direct/default/named shape and behavior.                                                                                                                                   |
| Advertised AMD branch          | Use the existing AMD loader or an isolated sandbox with `define.amd`. Assert named/anonymous registration and dependency IDs, resolve real dependencies, execute the factory, and check the returned API. Merely detecting `define` or testing the global branch is insufficient. |
| Dev and production application | Start each real serving path, verify readiness, load the UI, perform a representative operation, and check console/network errors. Include nested/base/trailing-slash URLs, redirects, CSS/SVG, and copied static/license assets. A dev-server fix is not production proof.       |

Use minimal VM stubs only for contracts they genuinely exercise. State when a VM probe does not replace a real DOM/browser/WebGL/worker lane.

## Workers and asynchronous resources

- Exercise the inline worker with a real message/response and terminate it.
- Force the **supported** external fallback condition (for example, Blob/CSP restrictions), then prove the external worker URL loads and the same API works. Preserve classic/module behavior; do not manufacture a new fallback the old API never offered.
- Serve under the recorded base/subpath and verify worker-relative/dynamic-import/WASM requests, status, MIME type, async initialization, and a meaningful result. Inspect actual resource loads, not just files on disk.
- Exercise the direct no-worker entry when published. Keep asynchronous/error/disposal semantics and assertions; do not inline resources to bypass failing fetches.

Record one ledger row per tested variant/branch. Missing branches, unexecuted API calls, failed resource requests, and a packed consumer that resolves source instead of artifacts remain unverified gates.

<!-- prettier-ignore-end -->
