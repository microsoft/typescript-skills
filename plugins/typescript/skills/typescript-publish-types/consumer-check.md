# Packed-consumer check

A fallback for when `attw` and `publint` are unavailable or crash, and a second opinion when
they disagree. It installs the artifact you would actually publish into a throwaway consumer and
type-checks an import of each entry point it is given, in every module mode that entry publishes.

It needs no network: it reuses the tarball and the TypeScript already in the repo.

## What it proves, and what it does not

Proves:

- each probed entry point resolves to a declaration **from the tarball**, not from `src/`. The
  package's name and `exports` are read from the extracted tarball, so a tarball passed with
  `--tarball` is what gets checked even if the source manifest has since changed.
- the declarations that entry pulls in are all present and error-free under `strict` with
  `skipLibCheck: false` — this is the check that catches a `.d.ts` importing a file the `files`
  filter dropped
- ESM and CJS entries are checked in their own resolution mode

Does not prove:

- **anything about entry points it was not given.** It derives entries from the `exports` map. A
  wildcard key, a single-target `exports`, or a package with no `exports` at all cannot be
  enumerated, so it prints a `note` and probes only what it can. Pass the deep imports from your
  step-1 inventory as arguments — otherwise a package whose root is fine and whose deep paths are
  untyped will pass.
- format masquerading (an ESM declaration served to `require`). `attw` remains the authority
  there; a passing run here never overrides an `attw` format error.
- runtime behaviour. It is a type check.

Two things decide which modes an entry is probed in, and neither is a general Node resolver. The
script reads the export value only to answer "does this entry publish this mode", following Node's
rule that conditions are tried in order, the first match decides, and a `null` target means *not
exported* rather than *try the next key*. It does not implement path mapping, nested fallback
arrays in full, or condition sets beyond `node`/`import`/`require`/`default`. The `ok`/`FAIL`
rows themselves come from `tsc`'s own resolution, which is the thing consumers experience.

An `exports` key set to `null` is the package excluding that path — including `"." : null` and a
`null` wildcard. It is never a public entry, and naming it as an argument does not make it one:
the script says it is excluded and skips it.

Two exit codes mean *nothing was checked*, and must not be read as a pass: `2` when the resolvable
TypeScript exposes no compiler API (TypeScript 7's native package is version metadata only — use
`attw` and rerun where a TypeScript 5 is resolvable), and `3` when no entry was derivable and none
was supplied.

## The script

Write it to a file. Do not paste it as a `-e` one-liner: the `!` and quoting get mangled.

```sh
#!/usr/bin/env bash
# Type-check the packed tarball from a real consumer lookup tree.
# Usage: bash packed-consumer-check.sh <package-dir> [--tarball <path>] [subpath ...]
#   --tarball  a tarball you already packed, so prepack/prepare do not run again
#   subpath    extra entry points to probe, e.g. ./lib/deep -- required for
#              wildcard exports and for packages with no exports map
set -euo pipefail

PKGDIR=$(cd "$1" && pwd); shift
TARBALL=""
if [ "${1:-}" = "--tarball" ]; then TARBALL=$(cd "$(dirname "$2")" && pwd)/$(basename "$2"); shift 2; fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT                        # cleans up on failure too

CONSUMER="$WORK/consumer"
mkdir -p "$CONSUMER/node_modules"
if [ -z "$TARBALL" ]; then
  # npm pack runs prepack/prepare, so this is a release-shaped artifact.
  # Use `pnpm pack` / `yarn pack` in repos managed by those tools.
  TARBALL="$WORK/$(cd "$PKGDIR" && npm pack --silent --pack-destination "$WORK")"
fi

# Everything about the package is read from the tarball, not from the source
# manifest, so an artifact passed with --tarball is what actually gets checked.
STAGE="$WORK/stage"
mkdir -p "$STAGE"
tar -xzf "$TARBALL" -C "$STAGE" --strip-components=1
NAME=$(node -p 'require(process.argv[1] + "/package.json").name' "$STAGE")
DEST="$CONSUMER/node_modules/$NAME"
mkdir -p "$(dirname "$DEST")"
mv "$STAGE" "$DEST"

# The packed copy needs its dependencies and the consumer needs a compiler.
# Reuse what is already installed: no network, no second install.
# In a monorepo the dependencies may be hoisted, so walk up to find them.
DIR="$PKGDIR"
while [ "$DIR" != "/" ] && [ ! -d "$DIR/node_modules" ]; do DIR=$(dirname "$DIR"); done
if [ -d "$DIR/node_modules" ]; then ln -s "$DIR/node_modules" "$DEST/node_modules"; fi
TS=$(cd "$PKGDIR" && node -p 'try { require.resolve("typescript/package.json") } catch { "" }')
if [ -z "$TS" ]; then
  echo "no typescript resolvable from $PKGDIR: install the repo's dependencies first" >&2
  exit 1
fi
ln -s "$(dirname "$TS")" "$CONSUMER/node_modules/typescript"

cat > "$CONSUMER/package.json" <<'JSON'
{ "name": "probe-consumer", "version": "0.0.0", "private": true }
JSON
cat > "$CONSUMER/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": false,
    "noEmit": true
  }
}
JSON

RESOLVED=0
node - "$DEST" "$CONSUMER" "$@" <<'NODE' || RESOLVED=$?
const fs = require("fs"), path = require("path");
const [dest, consumer, ...extra] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(path.join(dest, "package.json"), "utf8"));
// Load it as a bare specifier so the package's own exports map applies.
const req = require("module").createRequire(path.join(consumer, "probe.cjs"));
let ts = null;
try { ts = req("typescript"); } catch {}
if (!ts || typeof ts.resolveModuleName !== "function") {
  // TypeScript 7's native package exposes no compiler API, so the resolution
  // table cannot be built. Say so rather than half-checking.
  console.log(`note  the installed typescript (${ts?.version ?? "unknown"}) exposes no resolveModuleName`);
  console.log("note  run this with a TypeScript 5 resolvable from the package, and use attw meanwhile");
  process.exit(2);
}

// Does this export resolve under the given runtime conditions? This follows
// Node's rule that conditions are tried in order and the first *match* decides,
// and that a null target means "not exported" rather than "try the next key".
// It is not a full Node resolver: it answers only "is this mode published",
// and tsc's own resolution below is what the ok/FAIL rows are based on.
//   true = resolves, false = explicitly excluded, undefined = nothing matched
const resolve = (value, conds) => {
  if (value === null) return false;
  if (typeof value === "string") return true;
  if (Array.isArray(value)) return value.some(v => resolve(v, conds) === true) || undefined;
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value))
      if (k === "default" || conds.has(k)) {
        const r = resolve(v, conds);
        if (r !== undefined) return r;
      }
    return undefined;
  }
  return undefined;
};
const supports = (value, conds) => resolve(value, conds) === true;

const map = pkg.exports;
const hasSubpaths = map && typeof map === "object" && !Array.isArray(map)
  && Object.keys(map).some(k => k.startsWith("."));
const notes = [];
const excluded = new Set();                 // keys the package sets to null
const entries = new Map();                  // specifier -> exports value, or null for "both modes"
const add = (key, value) => entries.set(pkg.name + key.slice(1), value);

if (hasSubpaths) {
  for (const [key, value] of Object.entries(map)) {
    if (key === "./package.json") continue;
    if (value === null) {
      excluded.add(key);
      notes.push(`${key} is excluded by the package (null): not a public entry`);
      continue;
    }
    if (key.includes("*")) { notes.push(`${key} is a wildcard: pass concrete subpaths as arguments`); continue; }
    add(key, value);
  }
} else if (map === null) {
  notes.push("exports is null: the package exports nothing, so there is no entry to probe");
} else if (map === undefined) {
  add(".", null);                           // no exports map: both modes are reachable
  notes.push("no exports map: every published file is importable, but only the root entry is derivable");
  if (!extra.length) notes.push("pass the deep imports you inventoried as arguments to probe them");
} else {
  add(".", map);                            // a single target still says which modes it publishes
  notes.push("exports is a single target: only the root entry is derivable");
  if (!extra.length) notes.push("pass the deep imports you inventoried as arguments to probe them");
}

// A supplied subpath inherits the modes of the exports key that covers it, so
// an ESM-only package is not reported as failing in CJS.
const cover = sub => {
  if (!hasSubpaths) return { value: null };
  if (Object.prototype.hasOwnProperty.call(map, sub)) return { key: sub, value: map[sub] };
  for (const [key, value] of Object.entries(map)) {
    if (!key.includes("*")) continue;
    const [before, after] = key.split("*");
    if (sub.length >= before.length + after.length
        && sub.startsWith(before) && sub.endsWith(after)) return { key, value };
  }
  return { value: null };                   // exports does not route it: probing will say so
};
for (const raw of extra) {
  const sub = raw === "." || raw.startsWith("./") ? raw : "./" + raw.replace(/^\/+/, "");
  const { key, value } = cover(sub);
  if (value === null && key !== undefined) {
    // You cannot make an entry public by naming it: the package excluded it.
    notes.push(`${sub} is excluded by the package (${key} is null): not probing it`);
    continue;
  }
  add(sub, value);
}

for (const n of notes) console.log(`note  ${n}`);
if (entries.size === 0) {
  console.log("note  nothing to probe: no entry point was derivable and none was supplied");
  process.exit(3);
}
const opts = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext };
const MODES = [
  ["esm", "mts", ts.ModuleKind.ESNext, new Set(["node", "import"])],
  ["cjs", "cts", ts.ModuleKind.CommonJS, new Set(["node", "require"])],
];
let bad = 0;
for (const [spec, value] of entries) {
  for (const [label, ext, mode, conds] of MODES) {
    if (value !== null && !supports(value, conds)) continue;   // mode not published: not a defect
    const file = path.join(consumer, `probe-${spec.replace(/\W+/g, "_")}-${label}.${ext}`);
    // A side-effect import checks the entry's whole declaration graph without
    // asserting an export shape, so `export =` packages do not fail spuriously.
    fs.writeFileSync(file, `import ${JSON.stringify(spec)};\n`);
    const r = ts.resolveModuleName(spec, file, opts, ts.sys, undefined, undefined, mode);
    const to = r.resolvedModule?.resolvedFileName;
    const ok = to && /\.d\.[cm]?ts$/.test(to);
    if (!ok) bad++;
    console.log(`${ok ? "ok   " : "FAIL "} ${spec} (${label}) -> ${to ? path.relative(consumer, to) : "UNRESOLVED"}`);
  }
}
process.exitCode = bad ? 1 : 0;
NODE

# 2 = no usable compiler API, 3 = nothing to probe. Neither produced probe
# files, so compiling would only report an empty project.
if [ "$RESOLVED" = 2 ] || [ "$RESOLVED" = 3 ]; then
  echo "checked nothing: see the notes above"
  exit "$RESOLVED"
fi

echo "--- compiling probes (strict, skipLibCheck off) ---"
COMPILED=0
(cd "$CONSUMER" && node node_modules/typescript/bin/tsc -p .) || COMPILED=$?
[ "$COMPILED" = 0 ] && echo "probes compiled"
# An unresolved side-effect import is not a compile error, so a clean compile
# never cancels a FAIL above.
[ "$RESOLVED" = 0 ] || echo "some entries did not resolve to a declaration: see FAIL above"
[ "$RESOLVED" = 0 ] && [ "$COMPILED" = 0 ]
```

## Reading the output

A healthy dual-format package, with one concrete subpath supplied for its wildcard export:

```text
$ bash packed-consumer-check.sh /abs/pkg ./plugins/alpha
note  ./internal is excluded by the package (null): not a public entry
note  ./plugins/* is a wildcard: pass concrete subpaths as arguments
ok    my-pkg (esm) -> node_modules/my-pkg/dist/index.d.mts
ok    my-pkg (cjs) -> node_modules/my-pkg/dist/index.d.cts
ok    my-pkg/browser (esm) -> node_modules/my-pkg/dist/browser.d.mts
ok    my-pkg/browser (cjs) -> node_modules/my-pkg/dist/browser.d.cts
ok    my-pkg/plugins/alpha (esm) -> node_modules/my-pkg/dist/plugins/alpha.d.mts
--- compiling probes (strict, skipLibCheck off) ---
probes compiled
```

That table is the per-entry-point evidence to quote in your summary; quote the `note` lines too,
since they say what was *not* checked. Three shapes matter:

- `FAIL  my-pkg/raw (esm) -> .../dist/browser.mjs` — the subpath has no `types` condition, so the
  consumer gets a `.js` and an implicit `any`. Go back to step 3.
- `ok` on every line but `error TS2307: Cannot find module './internal.js'` during compilation —
  the routes are right and the declaration graph is broken, almost always a `files` or
  `.npmignore` filter dropping a referenced `.d.ts`. Go back to step 4.
- `probes compiled` followed by `some entries did not resolve to a declaration` — a side-effect
  import of an unresolved module is not a compile error, so a clean compile never cancels a `FAIL`.
  The exit status is nonzero; treat it as a failure.

An entry that publishes only `import` is checked only in ESM mode. A missing `cjs` row there is
correct, not a gap — and it applies to shorthand `exports` too, where the conditions sit at the top
level instead of under `"."`:

```text
$ bash packed-consumer-check.sh /abs/esm-only-pkg
note  exports is a single target: only the root entry is derivable
note  pass the deep imports you inventoried as arguments to probe them
ok    my-pkg (esm) -> node_modules/my-pkg/dist/index.d.mts
```

The gap to watch for is a package with no `exports` map:

```text
$ bash packed-consumer-check.sh /abs/legacy-pkg
note  no exports map: every published file is importable, but only the root entry is derivable
note  pass the deep imports you inventoried as arguments to probe them
ok    legacy-pkg (esm) -> node_modules/legacy-pkg/lib/index.d.ts
ok    legacy-pkg (cjs) -> node_modules/legacy-pkg/lib/index.d.ts
```

That is a pass, and it means almost nothing: every published file is importable. Supplying the deep
path from your inventory finds the real defect:

```text
$ bash packed-consumer-check.sh /abs/legacy-pkg ./lib/util/helper
ok    legacy-pkg (esm) -> node_modules/legacy-pkg/lib/index.d.ts
ok    legacy-pkg (cjs) -> node_modules/legacy-pkg/lib/index.d.ts
FAIL  legacy-pkg/lib/util/helper (esm) -> UNRESOLVED
FAIL  legacy-pkg/lib/util/helper (cjs) -> node_modules/legacy-pkg/lib/util/helper.js
```

## Reporting it

Do not report "the fallback passed" on its own. Report the table, the `note` lines, the compile
result, and the fact that this is a fallback: it does not replace an `attw` run that you could not
complete.
