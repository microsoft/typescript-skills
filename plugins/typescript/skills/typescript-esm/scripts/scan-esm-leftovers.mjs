#!/usr/bin/env node
/* eslint-disable */
// @ts-nocheck
// Report what is still CommonJS-shaped after an ESM migration. Exit code 0 means clean, 1 means
// findings remain, 2 means a usage error. Use it as the finish line, not `tsc` being quiet.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  DEFAULT_DATA_DIRS,
  DEFAULT_EXCLUDED_DIRS,
  blank,
  classifySpecifier,
  commonJsScopeFinder,
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

const USAGE = `Usage: node scan-esm-leftovers.mjs <package-root> [--strict] [--verbose] [--exclude <dir|relpath>]... [--include <default-skipped-dir>]...

Scans .ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs/*.template files under <package-root> for:
  - relative import/export/import() specifiers without a runtime extension (./x, ./dir)
  - bare __dirname / __filename
  - require(), require.resolve/main/cache, module.exports, exports.x =, import x = require()
.cjs/.cts files, and files under a nested package.json with "type": "commonjs", are intentionally
CommonJS: they are only checked for specifiers in import().

  --strict    also fail on unresolved specifiers and computed import() templates
  --verbose   print every finding (default: first 20 per category)
  --exclude   skip a directory name (any depth) or a path relative to the root
  --include   scan a directory that is skipped by default

Skipped by default: ${DEFAULT_EXCLUDED_DIRS.join(", ")}, .github/skills, and this skill's own directory.
Test-data directories are skipped and listed: ${DEFAULT_DATA_DIRS.join(", ")}.
Exit: 0 clean, 1 findings, 2 usage error.`;

const opts = parseArgs(process.argv.slice(2), USAGE);
const { files, skippedData } = listSourceFiles(opts.root, opts);
const commonJsScopeOf = commonJsScopeFinder(opts.root);

const CJS_PATTERNS = [
  ["__dirname", /(?<![.\w$])__dirname\b/g, /\b(?:const|let|var)\s+__dirname\b/],
  [
    "__filename",
    /(?<![.\w$])__filename\b/g,
    /\b(?:const|let|var)\s+__filename\b/,
  ],
  [
    "require()",
    /(?<![.\w$])require\s*\(/g,
    /\b(?:const|let|var)\s+require\s*=\s*createRequire\b/,
  ],
  [
    "require.resolve/main/cache",
    /(?<![.\w$])require\.(?:resolve|main|cache|extensions)\b/g,
    /\b(?:const|let|var)\s+require\s*=\s*createRequire\b/,
  ],
  ["module.exports", /(?<![.\w$])module\.exports\b/g, null],
  ["exports.x =", /(?<![.\w$])exports\.[\w$]+\s*=(?!=)/g, null],
  [
    "import x = require()",
    /\bimport\s+(?:type\s+)?[\w$]+\s*=\s*require\s*\(/g,
    null,
  ],
];

const findings = new Map();
const warnings = new Map();
const seen = new Set();
const commonJsScopes = new Map();
const add = (map, category, key, item) => {
  if (seen.has(category + "\0" + key)) return;
  seen.add(category + "\0" + key);
  if (!map.has(category)) map.set(category, []);
  map.get(category).push(item);
};

for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  const rel = toPosix(path.relative(opts.root, file));
  const lineOf = lineIndex(raw);
  const scope = /\.c[jt]s$/.test(file) ? undefined : commonJsScopeOf(file);
  if (scope !== undefined)
    commonJsScopes.set(scope, (commonJsScopes.get(scope) ?? 0) + 1);
  const isCommonJsFile = /\.c[jt]s$/.test(file) || scope !== undefined;

  // Specifiers: ignore comments, keep strings.
  const noComments = blank(raw, { strings: false });
  for (const s of findRelativeSpecifiers(noComments)) {
    if (
      isCommonJsFile &&
      !/\bimport\s*\(\s*$/.test(
        noComments.slice(Math.max(0, s.start - 40), s.start - 1),
      )
    )
      continue;
    const r = classifySpecifier(file, s.spec);
    const line = lineOf(s.start);
    const where = `${rel}:${line}: '${s.spec}'`;
    const key = `${rel}:${line}:${s.spec}`;
    if (r.kind === "rewrite")
      add(
        findings,
        "extensionless relative specifier",
        key,
        `${where} -> '${r.replacement}'`,
      );
    else if (r.kind === "json")
      add(
        findings,
        "JSON import without extension",
        key,
        `${where} -> '${r.replacement}' with { type: 'json' }`,
      );
    else if (r.kind === "unresolved")
      add(
        warnings,
        "unresolved relative specifier (test data, alias, or template?)",
        key,
        where,
      );
  }
  for (const t of findTemplateImports(noComments)) {
    const line = lineOf(t.index);
    add(
      warnings,
      "computed import() without extension",
      `${rel}:${line}`,
      `${rel}:${line}: import(\`${t.spec}\`)`,
    );
  }

  if (isCommonJsFile || /\.d\.[cm]?ts$/.test(file)) continue;

  // CommonJS globals: ignore comments and string contents. One finding per line and category.
  const code = blank(raw, { strings: true });
  const lines = raw.split("\n");
  for (const [category, re, shim] of CJS_PATTERNS) {
    if (shim && shim.test(code)) continue;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code))) {
      const line = lineOf(m.index);
      add(
        findings,
        category,
        `${rel}:${line}`,
        `${rel}:${line}: ${lines[line - 1].trim().slice(0, 120)}`,
      );
    }
  }
}

const print = (title, map) => {
  let total = 0;
  for (const items of map.values()) total += items.length;
  if (total === 0) return 0;
  out(`${title}:`);
  for (const [category, items] of map)
    printList(category, items, { verbose: opts.verbose, indent: "    " });
  out("");
  return total;
};

const nFindings = print("Leftovers", findings);
const nWarnings = print(
  "Review (not counted as failures unless --strict)",
  warnings,
);
if (commonJsScopes.size > 0) {
  const scopes = [...commonJsScopes]
    .map(([dir, n]) => `${dir}/ (${n} file(s))`)
    .join(", ");
  out(
    `Intentional CommonJS scopes ("type": "commonjs"), checked only for import() specifiers: ${scopes}`,
  );
}
printSkippedData(skippedData);
const failed = nFindings > 0 || (opts.strict && nWarnings > 0);
out(
  `${failed ? "FAIL" : "OK"}: ${nFindings} leftover(s), ${nWarnings} item(s) to review, ${files.length} file(s) scanned under ${toPosix(opts.root)}`,
);
process.exitCode = failed ? 1 : 0;
