---
name: dependency-security
description: Use for any CVE, security advisory, Dependabot or Component Governance alert, or vulnerable npm, Yarn or pnpm package. The fix must be declared in every affected project's package.json (bump the direct dependency; add overrides for npm/pnpm or resolutions for Yarn for transitive copies), with the matching lockfile updated. Lockfile-only edits are not fixes.
---

# Dependency security fixes

A lockfile-only edit is not a fix. The next install that regenerates the
lockfile restores the vulnerable version unless `package.json` forbids it. So
every install root that resolves the vulnerable package needs the fix in its
own `package.json`, even when that root only gets the package transitively.

## 1. Find every install root

1. Record the package, the vulnerable range, and the first fixed version (from
   the advisory or the task).
2. List every lockfile in the repository, then search each one for the package:

   ```text
   git ls-files '*package-lock.json' '*npm-shrinkwrap.json' '*yarn.lock' '*pnpm-lock.yaml' '*bun.lock'
   ```

3. Each lockfile that resolves a vulnerable version is an install root to
   fix. Do not stop at the project that lists the package directly.
4. For each root, note the package manager (from the lockfile), the
   `package.json` that owns the lockfile, and whether the package is
   **direct** (listed in that `package.json` or one of its workspace
   packages) or **transitive**.

## 2. Declare the fix in package.json, in every root

| Package manager | Lockfile | Transitive fix |
|---|---|---|
| npm | `package-lock.json` | `overrides` |
| Yarn | `yarn.lock` | `resolutions` |
| pnpm | `pnpm-lock.yaml` | `pnpm.overrides` |
| Bun | `bun.lock` / `bun.lockb` | `overrides` |

- **Direct:** raise the range so it excludes every vulnerable version
  (`"lodash": "^4.17.15"` → `"^4.17.23"`). Do this in every workspace
  `package.json` that lists the package.
- **Transitive:** add the override in the `package.json` that owns the
  lockfile (the workspace root). An override in a nested workspace
  `package.json` is ignored.
- **Both:** the direct range and the override must agree.
- Make the smallest upgrade that fixes the advisory: the lowest fixed version
  on the release line the project already uses. Cross a major version only
  when no fixed version exists on the current one; then build and test.

## 3. Update each lockfile to match

- Let the package manager write the lockfile after the `package.json` edit:
  `npm install --package-lock-only --ignore-scripts --no-audit --no-fund
  --loglevel=error`, `yarn install --mode=update-lockfile` (Yarn Berry) or
  `yarn install --ignore-scripts` (Yarn 1), `pnpm install --lockfile-only`.
  Check that each command exits 0 (`; echo "exit=$?"`). Never use
  `--silent`, `--force` or `--legacy-peer-deps`.
- If the registry is unreachable (`E401`, `ENOTFOUND`), you may edit only the
  affected lockfile entries by hand. Keep each `resolved` URL on the same
  registry host and path pattern, change only the version in it, and update
  `version` (and `integrity` when you can obtain it). Never re-point
  `resolved` to another registry such as `registry.npmjs.org`. Say in the
  final message which lockfiles were edited by hand and why.
- Every entry for the package must end at or above the fixed version,
  including copies under other workspaces and nested `node_modules` paths.

## 4. Verify

1. Search every lockfile again: no vulnerable version may remain.
2. Confirm each root's `package.json` declares the fix (direct range or
   override).
3. If installs work, run the frozen install (`npm ci`, `yarn install
   --immutable`, `pnpm install --frozen-lockfile`) and the package manager's
   listing command (`npm ls <package>`, `yarn why <package>`, `pnpm why
   <package>`). Run the project's build and tests once. For an upgrade that
   crosses a major version, use the `typescript-project-validate` skill
   before and after the change.
4. If installs are blocked, do not write checks that can only fail. Report
   the blocker and say the evidence is limited to `package.json` and the
   lockfiles. Never call an install verified when it failed.

## 5. Report

List each install root with its `package.json` change (range or override),
its lockfile change, and how it was verified or why it could not be. A root
with a patched lockfile but no `package.json` change is incomplete.
