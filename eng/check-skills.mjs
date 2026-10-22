import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

const marketplacePaths = [
  ".github/plugin/marketplace.json",
  ".claude-plugin/marketplace.json",
  ".cursor-plugin/marketplace.json",
  ".agents/plugins/marketplace.json",
];
const pluginManifestPaths = [
  "plugin.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
];
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function readJson(root, path) {
  try {
    return JSON.parse(readFileSync(join(root, path), "utf8"));
  } catch (error) {
    throw new Error(`${path}: ${error.message}`, { cause: error });
  }
}

function directories(root, path) {
  return readdirSync(join(root, path), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function checkName(value, path) {
  assert(
    typeof value === "string" && value.length <= 64 && namePattern.test(value),
    `${path}: expected a lowercase kebab-case name of at most 64 characters`,
  );
}

function checkDescription(value, path) {
  assert(
    typeof value === "string" && value.trim().length > 0 && value.length <= 1024,
    `${path}: expected a nonempty description of at most 1024 characters`,
  );
}

export function checkRepository(root) {
  const marketplaces = marketplacePaths.map((path) => {
    const marketplace = readJson(root, path);
    checkName(marketplace.name, `${path} name`);
    assert(
      typeof marketplace.owner?.name === "string" && marketplace.owner.name.trim(),
      `${path}: expected an owner name`,
    );
    assert(
      Array.isArray(marketplace.plugins) && marketplace.plugins.length > 0,
      `${path}: expected at least one plugin`,
    );

    const names = new Set();
    for (const plugin of marketplace.plugins) {
      checkName(plugin.name, `${path} plugin name`);
      checkDescription(plugin.description, `${path} ${plugin.name}`);
      assert(!names.has(plugin.name), `${path}: duplicate plugin ${plugin.name}`);
      names.add(plugin.name);
      assert.equal(
        plugin.source,
        `./plugins/${plugin.name}`,
        `${path}: ${plugin.name} must use its local plugin directory`,
      );
    }
    return {
      name: marketplace.name,
      owner: marketplace.owner,
      plugins: [...marketplace.plugins].sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

  for (let index = 1; index < marketplaces.length; index++) {
    assert.deepEqual(
      marketplaces[index],
      marketplaces[0],
      `${marketplacePaths[index]}: marketplace metadata differs from ${marketplacePaths[0]}`,
    );
  }

  const plugins = directories(root, "plugins");
  assert.deepEqual(
    plugins,
    marketplaces[0].plugins.map((plugin) => plugin.name).sort(),
    "plugins/: directories must match the marketplace entries",
  );

  let skillCount = 0;
  for (const plugin of plugins) {
    const pluginPath = `plugins/${plugin}`;
    const manifests = pluginManifestPaths.map((path) => readJson(root, `${pluginPath}/${path}`));
    const manifest = manifests[0];
    assert.equal(manifest.name, plugin, `${pluginPath}: manifest name must match its directory`);
    assert(
      typeof manifest.version === "string" && versionPattern.test(manifest.version),
      `${pluginPath}: expected a stable major.minor.patch version`,
    );
    checkDescription(manifest.description, pluginPath);
    assert.equal(
      manifest.description,
      marketplaces[0].plugins.find((entry) => entry.name === plugin).description,
      `${pluginPath}: description must match its marketplace entry`,
    );
    assert.deepEqual(manifest.skills, ["./skills/"], `${pluginPath}: expected skills at ./skills/`);

    for (let index = 1; index < manifests.length; index++) {
      for (const field of ["name", "version", "description", "skills"]) {
        assert.deepEqual(
          manifests[index][field],
          manifest[field],
          `${pluginPath}/${pluginManifestPaths[index]}: ${field} differs from plugin.json`,
        );
      }
    }

    const skills = directories(root, `${pluginPath}/skills`);
    assert(skills.length > 0, `${pluginPath}: expected at least one skill`);
    assert.deepEqual(
      directories(root, `tests/${plugin}`),
      skills,
      `tests/${plugin}: test directories must match the skills`,
    );

    for (const skill of skills) {
      checkName(skill, `${pluginPath}/skills/${skill}`);
      const path = `${pluginPath}/skills/${skill}/SKILL.md`;
      const content = readFileSync(join(root, path), "utf8");
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content);
      assert(frontmatter, `${path}: expected YAML frontmatter and a body`);

      let metadata;
      try {
        metadata = parse(frontmatter[1]);
      } catch (error) {
        throw new Error(`${path}: invalid YAML: ${error.message}`, { cause: error });
      }
      assert(metadata && typeof metadata === "object", `${path}: expected frontmatter fields`);
      assert.equal(metadata.name, skill, `${path}: name must match its directory`);
      checkDescription(metadata.description, path);
      assert(frontmatter[2].trim(), `${path}: expected a nonempty body`);
      if (Object.hasOwn(metadata, "disable-model-invocation")) {
        assert.equal(
          typeof metadata["disable-model-invocation"],
          "boolean",
          `${path}: disable-model-invocation must be a boolean`,
        );
      }
      if (metadata.metadata?.status === "stub") {
        assert.equal(
          metadata["disable-model-invocation"],
          true,
          `${path}: stubs must disable automatic invocation`,
        );
        assert.match(frontmatter[2], /not implemented/i, `${path}: stubs must state they are not implemented`);
      }
      assert(
        statSync(join(root, "tests", plugin, skill, "README.md")).isFile(),
        `tests/${plugin}/${skill}: expected a README.md test plan`,
      );
      skillCount++;
    }
  }

  return { plugins: plugins.length, skills: skillCount };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const result = checkRepository(root);
    console.log(`Checked ${result.plugins} plugin(s) and ${result.skills} skill(s). Structural checks only; no agent evaluations ran.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
