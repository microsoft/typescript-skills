#!/usr/bin/env node
/* eslint-disable */
// @ts-nocheck
// Rewrite extensionless relative import/export specifiers to the emitted-file form Node ESM needs:
// './util' -> './util.js', './lib' -> './lib/index.js', './m' (m.mts) -> './m.mjs'.
// Only specifiers that resolve on disk are rewritten; everything else is reported for review.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  DEFAULT_DATA_DIRS,
  DEFAULT_EXCLUDED_DIRS,
  classifySpecifier,
  findRelativeSpecifiers,
  findTemplateImports,
  lineIndex,
  listSourceFiles,
  out,
  parseArgs,
  printList,
  printSkippedData,
  toPosix,
} from "./lib.mjs";

const USAGE = `Usage: node rewrite-relative-specifiers.mjs <package-root> [--dry-run] [--verbose] [--exclude <dir|relpath>]... [--include <default-skipped-dir>]...

Rewrites relative specifiers in import, export ... from, export * from, import type, and import()
across .ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs/*.template files under <package-root>.

  --dry-run   report what would change; write nothing
  --verbose   list every rewritten specifier (default: counts by directory)
  --exclude   skip a directory name (any depth) or a path relative to the root
  --include   process a directory that is skipped by default

Skipped by default: ${DEFAULT_EXCLUDED_DIRS.join(", ")}, .github/skills, and this skill's own directory.
Test-data directories are skipped and listed: ${DEFAULT_DATA_DIRS.join(", ")}.`;

const opts = parseArgs(process.argv.slice(2), USAGE);
const { files, skippedData } = listSourceFiles(opts.root, opts);

let totalRewritten = 0;
let filesChanged = 0;
const byDir = new Map();
const rewrites = [];
const unresolved = [];
const json = [];
const computed = [];

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const rel = toPosix(path.relative(opts.root, file));
  const lineOf = lineIndex(text);
  const edits = [];
  for (const s of findRelativeSpecifiers(text)) {
    const r = classifySpecifier(file, s.spec);
    const where = `${rel}:${lineOf(s.start)}`;
    if (r.kind === "rewrite") {
      edits.push({ ...s, replacement: r.replacement });
      rewrites.push(`${where}: '${s.spec}' -> '${r.replacement}'`);
    } else if (r.kind === "json") {
      json.push(
        `${where}: '${s.spec}' -> '${r.replacement}' and add \`with { type: 'json' }\``,
      );
    } else if (r.kind === "unresolved") {
      unresolved.push(`${where}: '${s.spec}'`);
    }
  }
  for (const t of findTemplateImports(text)) {
    computed.push(`${rel}:${lineOf(t.index)}: import(\`${t.spec}\`)`);
  }
  if (edits.length === 0) continue;

  filesChanged++;
  totalRewritten += edits.length;
  const dir = rel.includes("/") ? rel.slice(0, rel.indexOf("/")) : ".";
  const counts = byDir.get(dir) ?? { specifiers: 0, files: 0 };
  counts.specifiers += edits.length;
  counts.files++;
  byDir.set(dir, counts);
  if (opts.dryRun) continue;
  let next = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    next = next.slice(0, e.start) + e.replacement + next.slice(e.end);
  }
  fs.writeFileSync(file, next);
}

const verb = opts.dryRun ? "Would rewrite" : "Rewrote";
out(
  `${verb} ${totalRewritten} specifier(s) in ${filesChanged} file(s); scanned ${files.length} file(s).`,
);
for (const [dir, c] of [...byDir].sort())
  out(`  ${dir}/: ${c.specifiers} in ${c.files} file(s)`);
if (opts.verbose) printList("Rewrites", rewrites, opts);
printList(
  "JSON imports: add the extension and `with { type: 'json' }` by hand",
  json,
  opts,
);
printList(
  "Computed import(): add the emitted extension inside the template by hand",
  computed,
  opts,
);
printList(
  "Unresolved: not found on disk (test data, path alias, or generated code?)",
  unresolved,
  opts,
);
printSkippedData(skippedData);
if (!opts.dryRun && totalRewritten > 0) {
  out(
    "\nNext: `git diff --stat`, run the project's formatter on the changed files, then scan-esm-leftovers.mjs.",
  );
}
