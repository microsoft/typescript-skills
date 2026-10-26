---
name: typescript-strict
description: Enable TypeScript strict mode (strict, noImplicitAny, strictNullChecks, etc.) in a project and fix the resulting errors without weakening types, tests, or runtime behavior. Use when asked to "enable strict mode", "turn on TypeScript strict", "fix strict errors", or migrate a codebase to strict type checking.
---

Your role is to turn on strict type checking and repair the code so the project is genuinely type-safe, without changing runtime behavior or weakening existing verification. Fixing the diagnostics matters; silencing them does not.

## 1. Establish a baseline first

- Read `package.json` (scripts, `packageManager`, `engines`), the lockfile(s), `.nvmrc`/`.node-version`, and CI config to learn the authoritative package manager, Node version, and build/lint/test commands.
- Resolve the declared package manager and workspace first (npm, Yarn incl. PnP, pnpm). Check for the declared compiler without fetching: look for a local `node_modules/.bin/tsc` or use the manager's local resolution (`npm exec --no-install tsc -- -v`, `yarn tsc -v`, `pnpm exec tsc -v`). Never use bare interactive `npx tsc` as an availability test: it can offer to install the unrelated npm package `tsc`.
- If dependencies or the compiler are missing, **execute** the frozen/immutable restore (`npm ci`, `yarn install --immutable`, `pnpm install --frozen-lockfile`) before any version, build, lint, or test probe, then confirm the compiler version. A restore failure is a blocker to report separately from compiler diagnostics. Never install another `tsc`, and do not switch managers or versions merely to unblock.
- Treat a terminal ID, partial output, or prompt as **pending**, never as passed or completed. Poll the same operation until it finishes and record its exit result. Resolve a blocked terminal before sending dependent checks to it. If you reject a prompt or cancel a command, confirm the shell is usable, run the recovery command immediately, and retry the intended operation; do not end by only promising to.
- Run the project's real build, lint, and test commands before changing anything and record the results, so later failures can be attributed correctly.
- Enumerate **every** TypeScript config and input: `extends` chains, `references`, `tsconfig.*.json` (tests, scripts, build, declarations), per-package configs in monorepos, and test runner configs (ts-node/ts-jest/mocha/vitest/jest). Test and secondary configs are in scope, not just the root one.

## 2. Enable strictness

- Set `"strict": true` in each config that type-checks project code (or in the shared base they extend). Do it for test and secondary configs too.
- Do not add opt-outs to get green: no `strict: false`, `noImplicitAny: false`, `strictNullChecks: false`, `skipLibCheck` added for convenience, new `exclude` entries, narrower `include`/`files`, `transpileOnly`/`isolatedModules` test runners, or separate relaxed configs. Preserve original input membership and verification strength.
- If the project is large, flags may be enabled incrementally (`noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictPropertyInitialization`, `useUnknownInCatchVariables`, ...) but the end state must be `strict: true`.
- This is not a compiler or dependency upgrade. Change tool/dependency versions only if strictness truly requires it (e.g. missing `@types/*`), and keep the manifest, lockfile, and package manager in sync.

## 3. Fix diagnostics by modeling types

Prefer these, roughly in order:

- Add precise annotations: structural interfaces/type aliases, recursive data types, discriminated unions, literal types.
- Narrow at boundaries: type guards, `in`/`typeof`/`instanceof` checks, and `unknown` for genuinely untyped input (JSON, catch variables, event payloads), validated before use.
- Preserve generic relationships. Keep type parameters, mapped, conditional, and indexed-access types connected to their inputs rather than collapsing them to `object`, `Function`, `Record<string, any>`, or `any`. Public/exported signatures and declaration output should stay as expressive as before or improve.
- Handle `null`/`undefined` with real checks, defaults that preserve current behavior, optional chaining, or by fixing the declared type. If a property is assigned outside the constructor, prefer restructuring initialization; use `!` only when an invariant is guaranteed and documented.
- Use `this` parameters, overloads, or generics for callback/receiver typing problems.

Forbidden (in production code and in the project's normal tests):

- New `any` (explicit, `as any`, `Record<string, any>`, `any[]`, `Function`), double assertions (`as unknown as T`), unjustified `as T` casts, and broad non-null assertions (`!`).
- `// @ts-ignore`, `// @ts-nocheck`, and `// @ts-expect-error` used to hide diagnostics. Same for `eslint-disable` of type-safety rules.
- Changing runtime semantics to satisfy types (reordering initialization, altering defaults, adding or dropping branches, changing exports/module format). A type fix should not change emitted JavaScript behavior; if a real bug is exposed, make the smallest correct fix, call it out, and add or run a test for it.

If a diagnostic truly cannot be modeled (e.g. a faulty third-party declaration), use the narrowest local escape with a comment explaining why and what would remove it, and list it in the final report. Never use that as the default.

Before supplying a local declaration, ambient module, or replacement for a dependency's types, inspect the installed package's own declarations and upstream type entry points (including test-only or subpath entries) and prefer those or a precisely modeled boundary. A replacement needs contract evidence: name the API/invariant source, keep the original generic, argument, and result relationships, do not substitute permissive signatures for a known API, and verify that valid usage compiles and invalid usage is still rejected. A removal comment alone is not enough. Preserve all original inputs; never check only the files that happen to compile.

### Legitimate exceptions vs. escapes

- `@ts-expect-error` in a dedicated negative type test that asserts something *should not* compile is a legitimate use. Keep such checks in test/type-test files, with a one-line reason, and report them as intentional rather than as strictness workarounds.
- Pre-existing `any`/casts that already existed before your change are not new regressions, but do not copy them into new code, and prefer tightening them when you edit those lines anyway.
- Report counts for both so a reviewer can tell intentional or pre-existing items from newly introduced escapes.

## 4. Verify everything, not just the compiler

- Type-check every config found in step 1 (e.g. `tsc -p` for each, or `tsc -b`), including tests and declaration/build outputs. Declaration emit for exported generics should still work and any generated-type assertions/tests must still pass.
- Run the project's **original** lint (e.g. ESLint, not just Prettier), build, and test commands in full, using the same runner configuration as before. Run the program/runtime or browser/Node entry points when relevant (including ESM/CJS variants).
- After touching `package.json`, restore from the lockfile with the frozen install command to confirm it is still consistent. Do not use `--no-package-lock` or switch package managers.
- Compare against the baseline. A new failure that was clean before is yours until proven otherwise; investigate rather than labeling it unrelated or flaky.
- Re-run diagnostics after each round of fixes; subagent or partial results do not replace a final whole-project check.
- Treat the completion ledger as real: dependencies restored, baseline finished, configs changed, diagnostics fixed, final checks finished. "Started" is not complete; continue past baseline setup through the final whole-project checks unless an unrecoverable blocker is reported.
- After the last semantic edit, audit the full patch, including new/untracked files: `any`, assertions/casts, `!`, `@ts-*` and lint disables, `.d.ts` files, ambient modules, custom matcher/fixture interfaces, and dynamic APIs returning `any`. Distinguish pre-existing or moved patterns from new weakening.

## 5. Finish honestly

- Don't end with an unanswered question or pending work; make reasonable assumptions and state them.
- Never describe remaining compiler errors as warnings or declare success while checks fail.
- Final report must include a pass/fail/not-run ledger for: strict config coverage (list configs), compile, lint, tests, runtime, lockfile restore; plus remaining type errors, escape hatches used (including assertions and declaration shims, with reasons, matching the final patch), real bugs found, and any dependency/config changes. If you could not finish, say so plainly and describe the state.
