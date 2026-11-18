#!/usr/bin/env node
// Lists what still blocks a TypeScript 7 upgrade: every `typescript` declaration
// that does not allow 7.x (in every package.json, including peers, overrides and
// resolutions) and every tsconfig option that TypeScript 7 rejects.
//
// Usage (from anywhere inside the project's git repository):
//   node <skill-dir>/scripts/check-ts7.mjs [--baseline <git-ref>]
//
// --baseline (default HEAD) is the commit before the upgrade. It is used to find
// declarations that were deleted instead of upgraded.
// Exits 1 if anything is listed, 0 if nothing is. Dependency-free and compatible
// with Node.js 16.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const REMOVED_OPTIONS = {
  baseUrl:
    "is removed (TS5102). Delete it and make `paths` relative to the tsconfig (`npx -y @andrewbranch/ts5to6 --fixBaseUrl <tsconfig>`)",
  outFile: "is removed. Use a bundler, or emit modules with `outDir`",
  out: "is removed. Use a bundler, or emit modules with `outDir`",
  downlevelIteration: "is removed. Delete it",
  importsNotUsedAsValues:
    "is removed (TS5023). Delete it; use `verbatimModuleSyntax` if import elision matters",
  preserveValueImports:
    "is removed (TS5023). Delete it; use `verbatimModuleSyntax` if import elision matters",
  keyofStringsOnly: "is removed. Delete it",
  suppressExcessPropertyErrors: "is removed. Delete it",
  suppressImplicitAnyIndexErrors: "is removed. Delete it",
  noImplicitUseStrict: "is removed. Delete it",
  noStrictGenericChecks: "is removed. Delete it",
  charset: "is removed. Delete it",
  ignoreDeprecations:
    "is not supported by TypeScript 7. Delete it and fix the deprecations instead",
};
const REMOVED_VALUES = {
  moduleResolution: {
    values: ["node", "node10", "classic"],
    fix: 'use "bundler", "node16" or "nodenext" (TS5108)',
  },
  module: {
    values: ["amd", "umd", "system", "none"],
    fix: 'use "esnext", "preserve", "commonjs" or "nodenext"',
  },
  target: { values: ["es3", "es5"], fix: 'use "es2015" or later' },
};

// ── Versions and ranges ───────────────────────────────────────────────────────

const INFINITY = Number.MAX_SAFE_INTEGER;
const version = (major, minor = 0, patch = 0) =>
  major * 1e8 + minor * 1e4 + patch;
const TS7 = [version(7), version(8)];

/** [low, high) bounds of one comparator such as `^5.4`, `>=4.8.4`, `7.x` or `*`. */
function comparatorBounds(text) {
  const match =
    /^(\^|~|>=|<=|>|<|=)?v?(\d+|[x*])(?:\.(\d+|[x*]))?(?:\.(\d+|[x*]))?/i.exec(
      text,
    );
  if (!match || /^[x*]$/i.test(match[2])) return [0, INFINITY];
  const [, op = "", majorText, minorText, patchText] = match;
  const wild = (part) => part === undefined || /^[x*]$/i.test(part);
  const major = Number(majorText);
  const minor = wild(minorText) ? 0 : Number(minorText);
  const patch = wild(patchText) ? 0 : Number(patchText);
  const low = version(major, minor, patch);
  const partialHigh = wild(minorText)
    ? version(major + 1)
    : wild(patchText)
      ? version(major, minor + 1)
      : low + 1;
  switch (op) {
    case "^":
      return [
        low,
        major > 0 || wild(minorText)
          ? version(major + 1)
          : version(0, minor + 1),
      ];
    case "~":
      return [
        low,
        wild(minorText) ? version(major + 1) : version(major, minor + 1),
      ];
    case ">=":
      return [low, INFINITY];
    case ">":
      return [partialHigh, INFINITY];
    case "<=":
      return [0, partialHigh];
    case "<":
      return [0, low];
    default:
      return [low, partialHigh];
  }
}

/** Each `||` alternative of a range as [low, high) bounds. */
function rangeBounds(range) {
  return range.split("||").map((alternative) => {
    const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(alternative.trim());
    const comparators = hyphen
      ? [`>=${hyphen[1]}`, `<=${hyphen[2]}`]
      : alternative
          .trim()
          .replace(/(\^|~|>=|<=|>|<|=)\s+/g, "$1")
          .split(/\s+/)
          .filter(Boolean);
    let low = 0;
    let high = INFINITY;
    for (const comparator of comparators) {
      const [l, h] = comparatorBounds(comparator);
      low = Math.max(low, l);
      high = Math.min(high, h);
    }
    return [low, high];
  });
}

/** The lowest version a range allows is 7.x, as an installed dependency must be. */
const requires7 = (range) => {
  const lowest = Math.min(...rangeBounds(range).map(([low]) => low));
  return lowest >= TS7[0] && lowest < TS7[1];
};
/** Some 7.x version is allowed, as a peer dependency must be. */
const allows7 = (range) =>
  rangeBounds(range).some(([low, high]) => low < TS7[1] && high > TS7[0]);

function parseAlias(specifier) {
  if (!specifier.startsWith("npm:"))
    return { name: "typescript", range: specifier };
  const body = specifier.slice(4);
  const at = body.lastIndexOf("@");
  return at > 0
    ? { name: body.slice(0, at), range: body.slice(at + 1) }
    : { name: body, range: "*" };
}

// ── Files ──────────────────────────────────────────────────────────────────────

const git = (args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 1 << 30,
  });
const outsideNodeModules = (file) =>
  file && !file.split("/").includes("node_modules");
const gitFiles = (...patterns) =>
  git([
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ...patterns,
  ])
    .split("\n")
    .filter(outsideNodeModules);

const LOCKFILES = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
];

/** Root, workspace member (npm/yarn `workspaces`, pnpm-workspace.yaml, lerna.json) and top-level standalone package directories. */
function workspaceMembers(manifestFiles) {
  const root = readJson("package.json") ?? {};
  const patterns = [].concat(
    Array.isArray(root.workspaces)
      ? root.workspaces
      : (root.workspaces?.packages ?? []),
    readJson("lerna.json")?.packages ?? [],
  );
  if (existsSync("pnpm-workspace.yaml")) {
    const lines = readFileSync("pnpm-workspace.yaml", "utf8").split("\n");
    const start = lines.findIndex((line) => /^packages:\s*$/.test(line));
    for (const line of start < 0 ? [] : lines.slice(start + 1)) {
      const item = /^\s+-\s*['"]?([^'"#]+?)['"]?\s*(#.*)?$/.exec(line);
      if (item) patterns.push(item[1]);
      else if (/^\S/.test(line)) break;
    }
  }
  const toRegExp = (glob) =>
    new RegExp(
      `^${glob
        .replace(/^\.\//, "")
        .replace(/\/+$/, "")
        .split("/")
        .map((part) =>
          part === "**"
            ? ".*"
            : part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"),
        )
        .join("/")}$`,
    );
  const include = patterns.filter((p) => !p.startsWith("!")).map(toRegExp);
  const exclude = patterns
    .filter((p) => p.startsWith("!"))
    .map((p) => toRegExp(p.slice(1)));
  const members = new Set(["."]);
  for (const file of manifestFiles) {
    const dir = dirname(file);
    if (
      include.some((re) => re.test(dir)) &&
      !exclude.some((re) => re.test(dir))
    )
      members.add(dir);
    // Top-level packages installed separately (their own lockfile), e.g. website/ or samples/.
    else if (
      !dir.includes("/") &&
      LOCKFILES.some((lockfile) => existsSync(join(dir, lockfile)))
    )
      members.add(dir);
  }
  return members;
}

/** JSON with comments and trailing commas, as tsconfig allows. */
function parseJsonc(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const string = /"(?:[^"\\]|\\.)*"/y;
      string.lastIndex = i;
      const match = string.exec(text);
      if (!match) throw new Error("unterminated string");
      out += match[0];
      i += match[0].length - 1;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i < 0) break;
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

function readJson(file, jsonc = false) {
  try {
    const text = readFileSync(file, "utf8");
    return jsonc ? parseJsonc(text) : JSON.parse(text);
  } catch {
    return undefined;
  }
}

// ── package.json declarations ──────────────────────────────────────────────────

function declarations(manifest) {
  const found = [];
  if (!manifest || typeof manifest !== "object") return found;
  for (const section of DEPENDENCY_SECTIONS) {
    const specifier = manifest[section]?.typescript;
    if (typeof specifier === "string") found.push({ section, specifier });
  }
  const overrideSources = [
    ["resolutions", manifest.resolutions],
    ["overrides", manifest.overrides],
    ["pnpm.overrides", manifest.pnpm?.overrides],
  ];
  for (const [source, map] of overrideSources) {
    for (const [key, specifier] of Object.entries(map ?? {})) {
      if (
        /(^|\/)typescript(@[^/]*)?$/.test(key) &&
        typeof specifier === "string"
      )
        found.push({
          section: `${source}["${key}"]`,
          specifier,
          override: true,
        });
    }
  }
  return found;
}

const hasNative7 = (manifest) =>
  ["dependencies", "devDependencies", "optionalDependencies"].some(
    (section) => {
      const alias = parseAlias(
        manifest?.[section]?.["@typescript/native"] ?? "",
      );
      return alias.name === "typescript" && requires7(alias.range);
    },
  );

function checkDeclaration(
  file,
  manifest,
  rootManifest,
  { section, specifier, override },
) {
  const where = `${file} ${section}: "${specifier}"`;
  if (
    /^(workspace|link|file|portal|git|github|https?|catalog):/.test(specifier)
  )
    return undefined;
  const alias = parseAlias(specifier);
  if (section === "peerDependencies") {
    return alias.name === "typescript" && allows7(alias.range)
      ? undefined
      : `${where} does not accept 7.x. Widen it, e.g. "${specifier} || ^7"`;
  }
  if (alias.name === "@typescript/typescript6" && !override) {
    return hasNative7(manifest) || hasNative7(rootManifest)
      ? undefined
      : `${where} is the 6.0 API alias, but no "@typescript/native": "npm:typescript@^7" is declared in this package or the workspace root`;
  }
  if (
    alias.name !== "typescript" ||
    !/\d/.test(alias.range) ||
    !requires7(alias.range)
  )
    return `${where} does not install TypeScript 7. Use "^7" (or the side-by-side layout in 6to7.md)`;
  return undefined;
}

function sameKind(before, after) {
  if (before.override || after.override)
    return before.section === after.section;
  return (
    (before.section === "peerDependencies") ===
    (after.section === "peerDependencies")
  );
}

function checkManifests(baseline) {
  const problems = [];
  const allFiles = gitFiles("package.json", "**/package.json");
  const members = workspaceMembers(allFiles);
  const files = new Set(allFiles.filter((file) => members.has(dirname(file))));
  let baselineFiles = [];
  try {
    baselineFiles = git(["ls-tree", "-r", "--name-only", baseline])
      .split("\n")
      .filter(
        (file) =>
          /(^|\/)package\.json$/.test(file) &&
          outsideNodeModules(file) &&
          members.has(dirname(file)),
      );
  } catch {
    problems.push(
      `cannot read git ref ${baseline}; deleted declarations were not checked`,
    );
  }
  const rootManifest = readJson("package.json");
  for (const file of [...files].sort()) {
    const manifest = readJson(file);
    for (const declaration of declarations(manifest)) {
      const problem = checkDeclaration(
        file,
        manifest,
        rootManifest,
        declaration,
      );
      if (problem) problems.push(problem);
    }
  }
  for (const file of baselineFiles.sort()) {
    let before;
    try {
      before = JSON.parse(git(["show", `${baseline}:${file}`]));
    } catch {
      continue;
    }
    const now = files.has(file) ? declarations(readJson(file)) : [];
    for (const declaration of declarations(before)) {
      if (!now.some((after) => sameKind(declaration, after)))
        problems.push(
          `${file} ${declaration.section}: "${declaration.specifier}" was deleted. Keep the declaration and upgrade it instead`,
        );
    }
  }
  return { problems, members };
}

// ── tsconfig options ───────────────────────────────────────────────────────────

function resolveExtends(from, specifier) {
  const candidates = [];
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const base = resolve(dirname(from), specifier);
    candidates.push(base, `${base}.json`, join(base, "tsconfig.json"));
  } else {
    for (let dir = resolve(dirname(from)); ; dir = dirname(dir)) {
      const base = join(dir, "node_modules", specifier);
      candidates.push(base, `${base}.json`, join(base, "tsconfig.json"));
      if (dirname(dir) === dir) break;
    }
  }
  return candidates.find(
    (file) => existsSync(file) && readJson(file, true) !== undefined,
  );
}

/** Configs a package builds with: tsconfig files at its root, and configs its scripts pass to tsc. */
function projectConfigs(members) {
  const configs = [];
  const atRoot = new Set(gitFiles("tsconfig*.json", "**/tsconfig*.json"));
  for (const file of atRoot)
    if (members.has(dirname(file))) configs.push(resolve(file));
  for (const dir of members) {
    const scripts = Object.values(
      readJson(join(dir, "package.json"))?.scripts ?? {},
    );
    for (const script of scripts) {
      for (const [, path] of String(script).matchAll(
        /(?:^|\s)(?:-p|--project|-b|--build)\s+([^\s&|;]+)/g,
      )) {
        const target = resolve(dir, path);
        configs.push(
          target.endsWith(".json") ? target : join(target, "tsconfig.json"),
        );
      }
    }
  }
  return configs;
}

/** Common leading directory of `include` patterns, e.g. "./src" for "src/**" and "src/types.d.ts". */
function includeRoot(include) {
  const dirs = [].concat(include ?? []).map((pattern) =>
    String(pattern)
      .replace(/^\.\//, "")
      .split("/")
      .filter(
        (part) => part && !/[*?]/.test(part) && !/\.[cm]?[jt]sx?$/.test(part),
      )
      .slice(0, 1)
      .join("/"),
  );
  return dirs.length && dirs.every((dir) => dir && dir === dirs[0])
    ? `./${dirs[0]}`
    : undefined;
}

function checkConfigs(members) {
  const problems = [];
  const root = process.cwd();
  const queue = projectConfigs(members);
  const effective = new Map();
  const options = (file) => {
    if (effective.has(file)) return effective.get(file);
    effective.set(file, {});
    const config = readJson(file, true) ?? {};
    const bases = []
      .concat(config.extends ?? [])
      .map((spec) => resolveExtends(file, spec))
      .filter(Boolean);
    const merged = Object.assign(
      {},
      ...bases.map(options),
      config.compilerOptions,
    );
    effective.set(file, merged);
    return merged;
  };
  const seen = new Set();
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const config = readJson(file, true);
    if (!config) continue;
    const name = relative(root, file);
    // Generated configs that the project extends (e.g. .svelte-kit/tsconfig.json) are checked too.
    for (const spec of [].concat(config.extends ?? [])) {
      const base = resolveExtends(file, spec);
      if (base && outsideNodeModules(relative(root, base))) queue.push(base);
    }
    for (const reference of config.references ?? []) {
      if (typeof reference?.path !== "string") continue;
      const target = resolve(dirname(file), reference.path);
      queue.push(
        target.endsWith(".json") ? target : join(target, "tsconfig.json"),
      );
    }
    for (const [option, value] of Object.entries(
      config.compilerOptions ?? {},
    )) {
      const lower = typeof value === "string" ? value.toLowerCase() : value;
      if (REMOVED_OPTIONS[option])
        problems.push(`${name}: "${option}" ${REMOVED_OPTIONS[option]}`);
      if (REMOVED_VALUES[option]?.values.includes(lower))
        problems.push(
          `${name}: "${option}": "${value}" is removed; ${REMOVED_VALUES[option].fix}`,
        );
      if (
        (option === "esModuleInterop" ||
          option === "allowSyntheticDefaultImports") &&
        value === false
      )
        problems.push(
          `${name}: "${option}": false is not allowed. Delete it and fix the imports`,
        );
    }
    if (!config.compilerOptions) continue;
    const all = options(file);
    const nodeModule = /^node(16|18|20|next)$/i;
    if (
      all.moduleResolution &&
      nodeModule.test(all.moduleResolution) !==
        nodeModule.test(all.module ?? "")
    )
      problems.push(
        `${name}: "module": "${all.module ?? "(default)"}" and "moduleResolution": "${all.moduleResolution}" must both be Node.js settings or neither (see 5to6.md)`,
      );
    if ((all.outDir || all.declarationDir) && !all.rootDir && !all.noEmit)
      problems.push(
        `${name}: sets "outDir" without "rootDir". TypeScript 6+ defaults rootDir to the tsconfig directory (TS5011 if the sources are elsewhere); set "rootDir" to the directory that contains the sources${includeRoot(config.include) ? ` (here probably "${includeRoot(config.include)}")` : ""} and check that the emitted paths still match package.json`,
      );
  }
  return problems;
}

// ── Main ───────────────────────────────────────────────────────────────────────

const flag = process.argv.indexOf("--baseline");
const baseline = flag >= 0 ? process.argv[flag + 1] : "HEAD";
try {
  process.chdir(git(["rev-parse", "--show-toplevel"]).trim());
} catch {
  console.error("check-ts7: run this inside the project's git repository");
  process.exit(2);
}
const manifests = checkManifests(baseline);
const problems = [...manifests.problems, ...checkConfigs(manifests.members)];
if (problems.length === 0) {
  console.log(
    "check-ts7: no remaining TypeScript 7 problems in package.json declarations or tsconfig options.",
  );
} else {
  console.log(`check-ts7: ${problems.length} problem(s) remain:`);
  for (const problem of problems) console.log(`- ${problem}`);
}
process.exit(problems.length ? 1 : 0);
