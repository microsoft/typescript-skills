import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(
  new URL(
    "../plugins/typescript/skills/typescript-update/scripts/check-ts7.mjs",
    import.meta.url,
  ),
);

function project(t, files) {
  const root = mkdtempSync(join(tmpdir(), "check-ts7-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (contents) => {
    for (const [path, value] of Object.entries(contents)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(
        join(root, path),
        typeof value === "string" ? value : JSON.stringify(value),
      );
    }
  };
  write(files);
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "baseline");
  return {
    write,
    remove: (path) => rmSync(join(root, path)),
    check() {
      const result = spawnSync(process.execPath, [script], {
        cwd: root,
        encoding: "utf8",
      });
      return {
        status: result.status,
        problems: result.stdout
          .split("\n")
          .filter((line) => line.startsWith("- ")),
      };
    },
  };
}

const workspace = {
  "package.json": {
    workspaces: ["packages/*"],
    devDependencies: { typescript: "^5.4.0" },
  },
  "packages/a/package.json": {
    devDependencies: { typescript: "5.4.5" },
    peerDependencies: { typescript: "^5.0.0" },
  },
  "test/fixture/package.json": { devDependencies: { typescript: "4.9.5" } },
};

test("lists every workspace declaration that does not allow 7.x", (t) => {
  const repo = project(t, workspace);
  const { status, problems } = repo.check();
  assert.equal(status, 1);
  assert.equal(problems.length, 3);
  assert.ok(
    problems.some((p) =>
      p.startsWith(
        '- packages/a/package.json peerDependencies: "^5.0.0" does not accept',
      ),
    ),
  );
  assert.ok(
    !problems.some((p) => p.includes("test/fixture")),
    "non-workspace fixtures are out of scope",
  );
});

test("accepts plain ^7, widened peers and the side-by-side layout", (t) => {
  const repo = project(t, workspace);
  repo.write({
    "package.json": {
      workspaces: ["packages/*"],
      devDependencies: {
        typescript: "npm:@typescript/typescript6@^6.0.2",
        "@typescript/native": "npm:typescript@^7.0.2",
      },
    },
    "packages/a/package.json": {
      devDependencies: { typescript: "^7.0.2" },
      peerDependencies: { typescript: "^5.0.0 || ^7" },
    },
  });
  assert.deepEqual(repo.check(), { status: 0, problems: [] });
});

test("reports declarations deleted instead of upgraded", (t) => {
  const repo = project(t, workspace);
  repo.write({
    "package.json": {
      workspaces: ["packages/*"],
      devDependencies: { typescript: "^7.0.2" },
    },
    "packages/a/package.json": { peerDependencies: { typescript: ">=5" } },
  });
  const { problems } = repo.check();
  assert.deepEqual(problems, [
    '- packages/a/package.json devDependencies: "5.4.5" was deleted. Keep the declaration and upgrade it instead',
  ]);
});

test("reports removed tsconfig options, including inherited generated configs", (t) => {
  const repo = project(t, {
    "package.json": { devDependencies: { typescript: "^7.0.2" } },
    "tsconfig.json": `{
      // comments and trailing commas are allowed
      "extends": "./.generated/tsconfig.json",
      "compilerOptions": { "baseUrl": ".", "outDir": "dist", },
      "include": ["src/**/*"],
    }`,
    ".generated/tsconfig.json": {
      compilerOptions: {
        importsNotUsedAsValues: "error",
        moduleResolution: "node10",
      },
    },
    "test/fixtures/old/tsconfig.json": { compilerOptions: { baseUrl: "." } },
  });
  const { problems } = repo.check();
  assert.equal(problems.length, 4);
  assert.ok(
    problems.some((p) => p.startsWith('- tsconfig.json: "baseUrl" is removed')),
  );
  assert.ok(
    problems.some((p) => p.includes('set "rootDir"') && p.includes('"./src"')),
  );
  assert.ok(
    problems.some((p) =>
      p.startsWith('- .generated/tsconfig.json: "importsNotUsedAsValues"'),
    ),
  );
  assert.ok(
    problems.some((p) =>
      p.startsWith('- .generated/tsconfig.json: "moduleResolution": "node10"'),
    ),
  );
});
