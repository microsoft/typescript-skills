/* eslint-disable */
// @ts-nocheck
// Shared helpers for rewrite-relative-specifiers.mjs and scan-esm-leftovers.mjs.
// Dependency-free, and imports every Node global it uses, so it runs on any supported Node and does
// not trip a repo's lint or typecheck when this skill is copied into .github/skills/.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// The skill directory this script ships in. Never scan or rewrite it.
const SELF_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const DEFAULT_EXCLUDED_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  "__testfixtures__",
  ".next",
  ".turbo",
  ".yarn",
];

// Input data for the package's tests (parsed or generated from, not run by Node). Skipped by default
// and reported, so they can be reviewed by hand or opted in with --include.
export const DEFAULT_DATA_DIRS = [
  "fixtures",
  "__fixtures__",
  "valid-data",
  "invalid-data",
  "testdata",
];

export function out(line = "") {
  process.stdout.write(line + "\n");
}

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|template)$/;

// Extensions a specifier can already end in and be considered fully specified.
const RUNTIME_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".json",
  ".node",
  ".wasm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".html",
  ".txt",
  ".md",
  ".yaml",
  ".yml",
  ".graphql",
  ".gql",
  ".vue",
  ".svelte",
]);
const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

// Source extension found on disk -> extension to write in the specifier.
const CANDIDATES = [
  [".ts", ".js"],
  [".tsx", ".js"],
  [".d.ts", ".js"],
  [".js", ".js"],
  [".jsx", ".js"],
  [".mts", ".mjs"],
  [".d.mts", ".mjs"],
  [".mjs", ".mjs"],
  [".cts", ".cjs"],
  [".d.cts", ".cjs"],
  [".cjs", ".cjs"],
];

export function parseArgs(argv, usage) {
  const opts = {
    root: undefined,
    dryRun: false,
    strict: false,
    verbose: false,
    exclude: [],
    include: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--verbose" || a === "--all") opts.verbose = true;
    else if (a === "--exclude" || a === "--include") {
      const v = argv[++i];
      if (v === undefined) fail(usage);
      (a === "--exclude" ? opts.exclude : opts.include).push(v);
    } else if (a === "-h" || a === "--help") {
      process.stdout.write(usage + "\n");
      process.exit(0);
    } else if (a.startsWith("-")) fail(`Unknown option ${a}\n\n${usage}`);
    else if (opts.root === undefined) opts.root = a;
    else fail(`Unexpected argument ${a}\n\n${usage}`);
  }
  if (opts.root === undefined) fail(usage);
  opts.root = path.resolve(opts.root);
  if (!fs.existsSync(opts.root) || !fs.statSync(opts.root).isDirectory())
    fail(`Not a directory: ${opts.root}`);
  return opts;
}

function fail(message) {
  process.stderr.write(message + "\n");
  process.exit(2);
}

// --exclude/--include take a directory name (matched at any depth) or a path relative to the root.
// Returns { files, skippedData }: skippedData lists default-skipped data directories that exist.
export function listSourceFiles(root, { exclude = [], include = [] } = {}) {
  const excludedNames = new Set(
    DEFAULT_EXCLUDED_DIRS.filter((d) => !include.includes(d)),
  );
  const dataNames = new Set(
    DEFAULT_DATA_DIRS.filter((d) => !include.includes(d)),
  );
  const excludedPaths = new Set();
  for (const e of exclude) {
    const norm = toPosix(e).replace(/^\.\//, "").replace(/\/$/, "");
    if (norm.includes("/")) excludedPaths.add(norm);
    else excludedNames.add(norm);
  }
  const files = [];
  const skippedData = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const rel = toPosix(path.relative(root, full));
      if (ent.isDirectory()) {
        if (excludedNames.has(ent.name) || excludedPaths.has(rel)) continue;
        if (full === SELF_DIR || /(^|\/)\.github\/skills$/.test(rel)) continue;
        if (dataNames.has(ent.name)) {
          skippedData.push(rel);
          continue;
        }
        walk(full);
      } else if (
        ent.isFile() &&
        SOURCE_FILE.test(ent.name) &&
        !excludedNames.has(ent.name) &&
        !excludedPaths.has(rel)
      ) {
        files.push(full);
      }
    }
  };
  walk(root);
  return { files: files.sort(), skippedData: skippedData.sort() };
}

// The nearest package.json below `root` that explicitly says "type": "commonjs", as a path relative
// to root, or undefined. The root's own package.json is not consulted: that is the package being
// migrated.
export function commonJsScopeFinder(root) {
  const cache = new Map();
  const find = (dir) => {
    if (dir === root || !dir.startsWith(root + path.sep)) return undefined;
    if (cache.has(dir)) return cache.get(dir);
    let result;
    const manifest = path.join(dir, "package.json");
    if (isFile(manifest)) {
      try {
        if (JSON.parse(fs.readFileSync(manifest, "utf8")).type === "commonjs")
          result = toPosix(path.relative(root, dir));
      } catch {
        result = undefined;
      }
    } else {
      result = find(path.dirname(dir));
    }
    cache.set(dir, result);
    return result;
  };
  return (file) => find(path.dirname(file));
}

// Print a titled list, capped at `limit` items unless verbose.
export function printList(
  title,
  items,
  { verbose, limit = 20, indent = "  " },
) {
  if (items.length === 0) return;
  out(`\n${title} (${items.length}):`);
  const shown = verbose ? items : items.slice(0, limit);
  for (const item of shown) out(`${indent}${item}`);
  if (shown.length < items.length)
    out(`${indent}… ${items.length - shown.length} more (use --verbose)`);
}

export function printSkippedData(skippedData) {
  if (skippedData.length === 0) return;
  out(
    `\nSkipped test-data directories (review by hand; --include <name> to process): ${skippedData.join(", ")}`,
  );
}

export function toPosix(p) {
  return p.split(path.sep).join("/");
}

// Returns index -> 1-based line number.
export function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++)
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

const QUOTED_REL = String.raw`(['"])(\.\.?(?:\/[^'"\n]*)?)\1`;
const STATIC_PATTERNS = [
  // import x from '…', import { … } from '…', export … from '…', export * from '…', import type …
  new RegExp(String.raw`\bfrom\s*` + QUOTED_REL, "g"),
  // import '…'  (side effect)
  new RegExp(String.raw`\bimport\s*` + QUOTED_REL, "g"),
  // import('…'), typeof import('…'), JSDoc import('…')
  new RegExp(String.raw`\bimport\s*\(\s*` + QUOTED_REL, "g"),
];
const DYNAMIC_TEMPLATE = /\bimport\s*\(\s*`(\.\.?\/[^`]*)`/g;

// Every relative specifier in import/export/import() position.
// Returns { start, end, spec } where [start, end) spans the specifier text without quotes.
export function findRelativeSpecifiers(text) {
  const found = new Map();
  for (const re of STATIC_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const spec = m[2];
      const start = m.index + m[0].length - spec.length - 1;
      if (!found.has(start))
        found.set(start, { start, end: start + spec.length, spec });
    }
  }
  return [...found.values()].sort((a, b) => a.start - b.start);
}

// import(`./dir/${name}`) whose literal tail carries no runtime extension.
export function findTemplateImports(text) {
  const out = [];
  DYNAMIC_TEMPLATE.lastIndex = 0;
  let m;
  while ((m = DYNAMIC_TEMPLATE.exec(text))) {
    const spec = m[1];
    if (!hasRuntimeExtension(spec.replace(/\$\{[^}]*\}/g, "x")))
      out.push({ index: m.index, spec });
  }
  return out;
}

export function hasRuntimeExtension(spec) {
  return RUNTIME_EXTENSIONS.has(path.posix.extname(spec).toLowerCase());
}

export function hasTsExtension(spec) {
  return TS_EXTENSIONS.has(path.posix.extname(spec).toLowerCase());
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Classify a relative specifier written in `fromFile`:
//   { kind: 'ok' }                    already ends in a runtime extension (or a .ts one; left alone)
//   { kind: 'rewrite', replacement }  resolves on disk; replacement is the fully specified form
//   { kind: 'json', replacement }     resolves to a .json file; also needs `with { type: 'json' }`
//   { kind: 'unresolved' }            nothing on disk (test data, path alias, code-gen template)
// Like CommonJS resolution, a file wins over a directory of the same name.
export function classifySpecifier(fromFile, spec) {
  if (hasRuntimeExtension(spec) || hasTsExtension(spec)) return { kind: "ok" };
  const trimmed = spec.replace(/\/+$/, "");
  const base = path.resolve(
    path.dirname(fromFile),
    trimmed === "" ? "." : trimmed,
  );
  const namesDirectory =
    spec.endsWith("/") || trimmed === "." || trimmed === "..";

  if (!namesDirectory) {
    for (const [srcExt, outExt] of CANDIDATES) {
      if (isFile(base + srcExt))
        return { kind: "rewrite", replacement: trimmed + outExt };
    }
    if (isFile(base + ".json"))
      return { kind: "json", replacement: trimmed + ".json" };
  }
  if (isDir(base)) {
    for (const [srcExt, outExt] of CANDIDATES) {
      if (isFile(path.join(base, "index" + srcExt)))
        return { kind: "rewrite", replacement: trimmed + "/index" + outExt };
    }
  }
  return { kind: "unresolved" };
}

// Replace comments (and, with strings: true, string/template contents) with spaces. Offsets and
// newlines are preserved so line numbers stay correct. ' and " strings end at a newline, so a regex
// literal containing a quote cannot desynchronise the rest of the file.
export function blank(text, { strings }) {
  const out = text.split("");
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && text[i] !== "\n") out[i++] = " ";
    } else if (c === "/" && d === "*") {
      out[i++] = " ";
      out[i++] = " ";
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] !== "\n") out[i] = " ";
        i++;
      }
      if (i < n) {
        out[i++] = " ";
        out[i++] = " ";
      }
    } else if (c === "'" || c === '"' || c === "`") {
      i++;
      while (i < n && text[i] !== c) {
        if (c !== "`" && text[i] === "\n") break;
        if (text[i] === "\\") {
          if (strings) out[i] = " ";
          i++;
        }
        if (i < n && strings && text[i] !== "\n") out[i] = " ";
        i++;
      }
      i++;
    } else {
      i++;
    }
  }
  return out.join("");
}
