#!/usr/bin/env node
// Lists what still blocks a TypeScript 7 upgrade: every `typescript` declaration
// that does not allow 7.x (in the root, workspace and standalone packages,
// including peers, overrides and resolutions) and every tsconfig option that
// TypeScript 7 rejects.
//
// Usage, from anywhere inside the project's git repository:
//   npx -y -p semver@7 -p @manypkg/get-packages@2 -p get-tsconfig@4 -- \
//     node <skill-dir>/scripts/check-ts7.mjs [--baseline <git-ref>]
//
// --baseline (default HEAD) is the commit before the upgrade. It is used to find
// declarations that were deleted instead of upgraded.
// Exits 1 if anything is listed, 0 if nothing is, 2 on usage errors. Runs on
// Node.js 16 and later.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";

const NPX_COMMAND =
  "npx -y -p semver@7 -p @manypkg/get-packages@2 -p get-tsconfig@4 -- node <skill-dir>/scripts/check-ts7.mjs";

/** Load a dependency from the npx run directory (or, in this repository's tests, from node_modules). */
function load(name) {
  // npx's own install directory comes first, so the project's copies (e.g. an old semver) cannot shadow it.
  const bins = (process.env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry.endsWith(join("node_modules", ".bin")));
  const roots = [
    ...bins.filter((bin) => bin.includes(`${sep}_npx${sep}`)),
    import.meta.url,
    ...bins.filter((bin) => !bin.includes(`${sep}_npx${sep}`)),
  ].map((root) =>
    root === import.meta.url ? root : join(root, "..", "..", "package.json"),
  );
  for (const root of roots) {
    try {
      return createRequire(root)(name);
    } catch {}
  }
  console.error(`check-ts7: cannot load ${name}. Run it as:\n  ${NPX_COMMAND}`);
  process.exit(2);
}
const semver = load("semver");
const { getPackages } = load("@manypkg/get-packages");
const tools = load("@manypkg/tools");
const { parseTsconfig } = load("get-tsconfig");

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

/** The lowest version the range allows is 7.x, as an installed dependency must be. */
function requires7(range) {
  try {
    const lowest = semver.minVersion(range);
    return (
      lowest !== null &&
      semver.satisfies(lowest, "^7", { includePrerelease: true })
    );
  } catch {
    return false;
  }
}

/** Some 7.x version is allowed, as a peer dependency must be. */
function allows7(range) {
  try {
    return semver.intersects(range, "^7", { includePrerelease: true });
  } catch {
    return false;
  }
}

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

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

const LOCKFILES = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
];

/**
 * Root and workspace member directories (from the package manager's workspace
 * configuration), plus top-level packages installed separately with their own
 * lockfile, such as website/ or samples/.
 */
async function packageDirectories() {
  const members = new Set(["."]);
  try {
    // pnpm first: a pnpm-workspace.yaml is authoritative even when package.json also has "workspaces".
    const { PnpmTool, YarnTool, LernaTool, RushTool, BoltTool, RootTool } =
      tools;
    const { packages } = await getPackages(process.cwd(), {
      tools: [PnpmTool, YarnTool, LernaTool, RushTool, BoltTool, RootTool],
    });
    for (const pkg of packages)
      members.add(relative(process.cwd(), pkg.dir).split(sep).join("/") || ".");
  } catch (error) {
    console.error(
      `check-ts7: could not list workspace packages (${error.message}); checking the root and standalone packages only`,
    );
  }
  for (const entry of readdirSync(".", { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      entry.name === "node_modules" ||
      entry.name.startsWith(".")
    )
      continue;
    if (
      existsSync(join(entry.name, "package.json")) &&
      LOCKFILES.some((lock) => existsSync(join(entry.name, lock)))
    )
      members.add(entry.name);
  }
  return members;
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

function checkManifests(baseline, members) {
  const problems = [];
  const file = (dir) => (dir === "." ? "package.json" : `${dir}/package.json`);
  const rootManifest = readJson("package.json");
  for (const dir of [...members].sort()) {
    const manifest = readJson(file(dir));
    for (const declaration of declarations(manifest)) {
      const problem = checkDeclaration(
        file(dir),
        manifest,
        rootManifest,
        declaration,
      );
      if (problem) problems.push(problem);
    }
  }
  try {
    git(["rev-parse", "--verify", `${baseline}^{commit}`]);
  } catch {
    problems.push(
      `cannot read git ref ${baseline}; deleted declarations were not checked`,
    );
    return problems;
  }
  for (const dir of [...members].sort()) {
    let before;
    try {
      before = JSON.parse(git(["show", `${baseline}:${file(dir)}`]));
    } catch {
      continue;
    }
    const now = declarations(readJson(file(dir)));
    for (const declaration of declarations(before)) {
      if (!now.some((after) => sameKind(declaration, after)))
        problems.push(
          `${file(dir)} ${declaration.section}: "${declaration.specifier}" was deleted. Keep the declaration and upgrade it instead`,
        );
    }
  }
  return problems;
}

// ── tsconfig options ───────────────────────────────────────────────────────────

/** Configs a package builds with: tsconfig files at its root, and configs its scripts pass to tsc. */
function projectConfigs(members) {
  const configs = [];
  for (const dir of members) {
    for (const name of readdirSync(dir))
      if (/^tsconfig.*\.json$/.test(name)) configs.push(resolve(dir, name));
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
  const root = process.cwd();
  const queue = projectConfigs(members);
  const seen = new Set();
  const perConfig = [];
  // Option problems usually come from one shared base config, so they are grouped by the option and value.
  const inherited = new Map();
  const unreadable = new Map();
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const name = relative(root, file);
    let config;
    try {
      // Effective configuration, with `extends` (including generated configs such as .svelte-kit/tsconfig.json) merged in.
      config = parseTsconfig(file);
    } catch (error) {
      unreadable.set(error.message, [
        ...(unreadable.get(error.message) ?? []),
        name,
      ]);
      continue;
    }
    for (const reference of config.references ?? []) {
      if (typeof reference?.path !== "string") continue;
      const target = resolve(dirname(file), reference.path);
      queue.push(
        target.endsWith(".json") ? target : join(target, "tsconfig.json"),
      );
    }
    const text = readFileSync(file, "utf8");
    const report = (option, message) => {
      const entry = inherited.get(message) ?? { setIn: [], affected: [] };
      entry.affected.push(name);
      if (new RegExp(`"${option}"\\s*:`).test(text)) entry.setIn.push(name);
      inherited.set(message, entry);
    };
    const all = config.compilerOptions ?? {};
    for (const [option, value] of Object.entries(all)) {
      const lower = typeof value === "string" ? value.toLowerCase() : value;
      if (REMOVED_OPTIONS[option])
        report(option, `"${option}" ${REMOVED_OPTIONS[option]}`);
      if (REMOVED_VALUES[option]?.values.includes(lower))
        report(
          option,
          `"${option}": "${value}" is removed; ${REMOVED_VALUES[option].fix}`,
        );
      if (
        (option === "esModuleInterop" ||
          option === "allowSyntheticDefaultImports") &&
        value === false
      )
        report(
          option,
          `"${option}": false is not allowed. Delete it and fix the imports`,
        );
    }
    const nodeModule = /^node(16|18|20|next)$/i;
    if (
      all.moduleResolution &&
      nodeModule.test(all.moduleResolution) !==
        nodeModule.test(all.module ?? "")
    )
      perConfig.push(
        `${name}: "module": "${all.module ?? "(default)"}" and "moduleResolution": "${all.moduleResolution}" must both be Node.js settings or neither (see 5to6.md)`,
      );
    if ((all.outDir || all.declarationDir) && !all.rootDir && !all.noEmit)
      perConfig.push(
        `${name}: sets "outDir" without "rootDir". TypeScript 6+ defaults rootDir to the tsconfig directory (TS5011 if the sources are elsewhere); set "rootDir" to the directory that contains the sources${includeRoot(config.include) ? ` (here probably "${includeRoot(config.include)}")` : ""} and check that the emitted paths still match package.json`,
      );
  }
  const grouped = [...inherited].map(([message, { setIn, affected }]) => {
    const others = affected.filter((name) => !setIn.includes(name));
    const where = setIn.length
      ? setIn.join(", ")
      : `${others.shift()} (through "extends")`;
    const more = others.length
      ? ` Also inherited by ${others.length} other config(s): ${others.slice(0, 3).join(", ")}${others.length > 3 ? ", …" : ""}.`
      : "";
    return `${where}: ${message}.${more}`;
  });
  const unread = [...unreadable].map(
    ([message, names]) =>
      `${names[0]}${names.length > 1 ? ` and ${names.length - 1} other config(s)` : ""}: cannot be read (${message}). If it extends a package, install dependencies and rerun`,
  );
  return [...grouped, ...perConfig, ...unread];
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
const members = await packageDirectories();
const problems = [
  ...checkManifests(baseline, members),
  ...checkConfigs(members),
];
if (problems.length === 0) {
  console.log(
    "check-ts7: no remaining TypeScript 7 problems in package.json declarations or tsconfig options.",
  );
} else {
  console.log(`check-ts7: ${problems.length} problem(s) remain:`);
  for (const problem of problems) console.log(`- ${problem}`);
}
process.exit(problems.length ? 1 : 0);
