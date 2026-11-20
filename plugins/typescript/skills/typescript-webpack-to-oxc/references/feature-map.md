<!-- prettier-ignore-start -->

# Conditional webpack feature map

Use this reference only for features observed in the affected route. It is not an exhaustive preflight requirement. Add discovered variants to the session ledger, then implement and execute their original consumers one slice at a time.

## Choose by the existing contract

Check the selected release's supported formats and APIs before configuring it. Use a small adapter entry or explicit compatibility wrapper where necessary; do not silently replace UMD with ESM, inline all resources, or switch test frameworks solely to make compilation work.

| Observed webpack feature                                           | Replacement responsibility and acceptance consumer                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entries, output, `libraryTarget`/`libraryExport`, `umdNamedDefine` | Preserve source/generated input ordering, filenames/directories, every format, all coexisting direct/default/named APIs and global accessors/aliases, and advertised named/anonymous AMD registration. Assert them together through each real loader entry point.                    |
| `externals`, aliases, resolution                                   | Preserve bundled/external choices, peers, browser global mappings/conditions, deep imports, and CJS interop. Probe package entry points, not only source imports.                                                                                                                    |
| `DefinePlugin`, `ProvidePlugin`, polyfills                         | Separate compile-time defines from injected modules/runtime shims. Preserve production `NODE_ENV`; check `process`, `Buffer`, `global`, and Node built-ins in browser dependencies. Execute dev and production; unresolved browser imports are not harmless.                         |
| TS/Babel loaders, transforms, minification                         | Preserve target syntax, JSX runtime/mode, decorators, other used transforms, and banners/licenses. Keep independent `tsc` typechecks/declaration producers: fast transpilation is not typechecking. Recheck final-output API after changing input module format or final transforms. |
| CSS/Sass/PostCSS, URL/raw/SVG loaders, copy plugins                | Preserve extraction/order, component versus URL/raw semantics, asset names/public paths, and static/license copies. Execute imports and nested/trailing-slash served URLs; an SVG component is not an image URL.                                                                     |
| `worker-loader`                                                    | Preserve constructor/API, classic/module mode, inline Blob behavior, supported external/CSP fallback, disposal, and base URLs. Worker query syntax alone does not prove equivalence.                                                                                                 |
| WASM, dynamic imports, splitting                                   | Preserve async initialization, resource status/MIME, worker-relative URLs, and published no-worker APIs. Blob locations cannot supply HTTP resource bases; execute real initialization/message results. See [consumer-smoke.md](consumer-smoke.md).                                  |
| Source maps, declarations, packaging                               | Chain maps to original sources; preserve declaration generation and `main`/`module`/`browser`/`exports`/`types`, subpaths, and publish contents. Inspect a packed consumer so source-workspace resolution cannot hide output defects.                                                |
| Dev-server/test plugins                                            | Replace integration within the existing runner when possible. Preserve proxy/base/redirect/static routes, watch/HMR/rebuilds, startup signals, hooks/globals, and every test lane. A working dev page does not prove production serving.                                             |

## Package and rare-route boundaries

- Distinguish root/member workspaces, independently installed packages, and directory-walking installers/builders; TS references are not install boundaries. Preserve the existing package-discovery route and generated-input ordering.
- Keep shared config outside enumerated package collections unless every existing walker handles non-package entries. Prefer directory + manifest checks over narrowing a glob to hide broken traversal.
- Follow actual callers in CI, containers, editor tasks, docs, publishing, pre/post hooks, lint API/fix/quiet routes, and test transforms. Inventory production/development/watch/release/example/style/library/CLI/platform variants as encountered; finish them all before delivery.
- Root `test` can omit API, declaration, native, renderer, browser, or distinct generic/CI routes. Preserve dependencies and permitted lifecycle/headless preparation those lanes consume, even when the new bundler itself no longer needs them.
- Read only the selected-release help/schema/types/examples needed for the observed feature. Verify imports for a genuine custom API runner; do not substitute a new optional API for a working integration while acceptance checks are red.

<!-- prettier-ignore-end -->
