import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkRepository } from "./check-skills.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const skillPath = "plugins/typescript/skills/typescript-project-setup/SKILL.md";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "typescript-skills-check-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of [
    ".github/plugin",
    ".claude-plugin",
    ".cursor-plugin",
    ".agents/plugins",
    "plugins",
  ]) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(repositoryRoot, path), destination, { recursive: true });
  }
  return root;
}

function changeJson(root, path, change) {
  const value = JSON.parse(readFileSync(join(root, path), "utf8"));
  change(value);
  writeFileSync(join(root, path), JSON.stringify(value));
}

function changeSkill(root, change) {
  const path = join(root, skillPath);
  writeFileSync(path, change(readFileSync(path, "utf8")));
}

test("accepts the marketplace with the project setup skill", () => {
  assert.deepEqual(checkRepository(repositoryRoot), { plugins: 1, skills: 1 });
  assert.deepEqual(readdirSync(join(repositoryRoot, "plugins/typescript/skills")).sort(), [
    "typescript-project-setup",
  ]);
});

test("rejects marketplace drift", (t) => {
  const root = fixture(t);
  changeJson(root, ".claude-plugin/marketplace.json", (value) => {
    value.name = "different-marketplace";
  });
  assert.throws(() => checkRepository(root), /marketplace metadata differs/);
});

test("rejects duplicate marketplace entries", (t) => {
  const root = fixture(t);
  changeJson(root, ".github/plugin/marketplace.json", (value) => {
    value.plugins.push(value.plugins[0]);
  });
  assert.throws(() => checkRepository(root), /duplicate plugin typescript/);
});

test("rejects marketplace sources outside the matching plugin", (t) => {
  const root = fixture(t);
  changeJson(root, ".github/plugin/marketplace.json", (value) => {
    value.plugins[0].source = "../another-repository";
  });
  assert.throws(() => checkRepository(root), /must use its local plugin directory/);
});

test("rejects unlisted plugins", (t) => {
  const root = fixture(t);
  mkdirSync(join(root, "plugins/unlisted"));
  assert.throws(() => checkRepository(root), /directories must match the marketplace entries/);
});

test("rejects plugin compatibility version drift", (t) => {
  const root = fixture(t);
  changeJson(root, "plugins/typescript/.codex-plugin/plugin.json", (value) => {
    value.version = "0.2.0";
  });
  assert.throws(() => checkRepository(root), /version differs from plugin.json/);
});

test("rejects invalid versions", (t) => {
  const root = fixture(t);
  changeJson(root, "plugins/typescript/plugin.json", (value) => {
    value.version = "01.0";
  });
  assert.throws(() => checkRepository(root), /expected a stable major.minor.patch version/);
});

test("rejects missing SKILL.md files", (t) => {
  const root = fixture(t);
  rmSync(join(root, skillPath));
  assert.throws(() => checkRepository(root), /ENOENT.*SKILL.md/);
});

test("accepts skills without repository-local benchmark fixtures or test plans", (t) => {
  const root = fixture(t);
  assert.deepEqual(checkRepository(root), { plugins: 1, skills: 1 });
});

test("rejects skill names that differ from their directories", (t) => {
  const root = fixture(t);
  changeSkill(root, (content) => content.replace("name: typescript-project-setup", "name: different-name"));
  assert.throws(() => checkRepository(root), /name must match its directory/);
});

test("rejects malformed YAML", (t) => {
  const root = fixture(t);
  changeSkill(root, (content) => content.replace("name: typescript-project-setup", "name: ["));
  assert.throws(() => checkRepository(root), /invalid YAML/);
});

test("rejects duplicate YAML fields", (t) => {
  const root = fixture(t);
  changeSkill(root, (content) => content.replace("name: typescript-project-setup", "name: typescript-project-setup\nname: duplicate"));
  assert.throws(() => checkRepository(root), /invalid YAML/);
});

test("rejects empty descriptions", (t) => {
  const root = fixture(t);
  changeSkill(root, (content) => content.replace(/^description:.*$/m, 'description: ""'));
  assert.throws(() => checkRepository(root), /expected a nonempty description/);
});

test("accepts invocation control set to false", (t) => {
  const root = fixture(t);
  changeSkill(root, (content) => content.replace(
    "description: How to set up a new TypeScript project",
    'description: How to set up a new TypeScript project\ndisable-model-invocation: false',
  ));
  assert.deepEqual(checkRepository(root), { plugins: 1, skills: 1 });
});

test("rejects string-valued invocation flags", (t) => {
  const root = fixture(t);
  changeSkill(root, (content) => content.replace(
    "description: How to set up a new TypeScript project",
    'description: How to set up a new TypeScript project\ndisable-model-invocation: "true"',
  ));
  assert.throws(() => checkRepository(root), /disable-model-invocation must be a boolean/);
});

test("accepts CRLF skill frontmatter", (t) => {
  const root = fixture(t);
  changeSkill(root, (content) => content.replaceAll("\n", "\r\n"));
  assert.deepEqual(checkRepository(root), { plugins: 1, skills: 1 });
});

test("accepts skills with only the required frontmatter fields", (t) => {
  const root = fixture(t);
  changeSkill(root, (content) => content.replace("disable-model-invocation: true\n", ""));
  assert.deepEqual(checkRepository(root), { plugins: 1, skills: 1 });
});
