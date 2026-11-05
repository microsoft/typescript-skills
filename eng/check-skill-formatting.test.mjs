import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkSkillFormatting } from "./check-skill-formatting.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const skillPath = "plugins/typescript/skills/typescript-update/SKILL.md";
const guidePath = "plugins/typescript/skills/typescript-update/6to7.md";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "typescript-skill-formatting-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(repositoryRoot, "plugins"), join(root, "plugins"), { recursive: true });
  return root;
}

function changeFile(root, path, change) {
  const full = join(root, path);
  writeFileSync(full, change(readFileSync(full, "utf8")));
}

test("accepts shipped Markdown under representative consumer configurations", async () => {
  assert.deepEqual(await checkSkillFormatting(repositoryRoot), { files: 6 });
});

test("rejects CRLF in shipped Markdown", async (t) => {
  const root = fixture(t);
  changeFile(root, guidePath, (text) => text.replaceAll("\n", "\r\n"));
  await assert.rejects(checkSkillFormatting(root), /contains CR characters/);
});

test("rejects missing consumer ignore ranges with and without frontmatter", async (t) => {
  for (const path of [skillPath, guidePath]) {
    for (const marker of ["<!-- prettier-ignore-start -->", "<!-- prettier-ignore-end -->"]) {
      const root = fixture(t);
      changeFile(root, path, (text) => text.replace(marker, ""));
      await assert.rejects(checkSkillFormatting(root), /must (start|end) with/);
    }
  }
});

test("checks formatting inside consumer ignore ranges", async (t) => {
  const root = fixture(t);
  changeFile(root, guidePath, (text) => text.replace(
    '"devDependencies": {',
    '"devDependencies"   : {',
  ));
  await assert.rejects(checkSkillFormatting(root), /content is not Prettier-formatted/);
});

test("discovers supporting Markdown in nested skill directories", async (t) => {
  const root = fixture(t);
  const referenceDir = join(root, "plugins/typescript/skills/typescript-update/references");
  mkdirSync(referenceDir);
  writeFileSync(join(referenceDir, "example.md"), "# Example\n");
  await assert.rejects(checkSkillFormatting(root), /example\.md: content .* must start with/);
});

test("rejects a repository with no skill Markdown", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "typescript-skill-formatting-empty-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "plugins"));
  await assert.rejects(checkSkillFormatting(root), /no skill Markdown files found/);
});
