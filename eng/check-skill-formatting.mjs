import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as prettier from "prettier";

const ignoreStart = "<!-- prettier-ignore-start -->";
const ignoreEnd = "<!-- prettier-ignore-end -->";
const consumerConfigs = {
  default: {},
  "singleQuote/no-semi (Next.js style)": { singleQuote: true, semi: false, trailingComma: "es5" },
  "tabs/tabWidth 4": { useTabs: true, tabWidth: 4 },
  // Ignore ranges cannot protect frontmatter from prose rewrapping.
  "proseWrap always (content only)": { proseWrap: "always", printWidth: 80, contentOnly: true },
};

function* markdownFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* markdownFiles(full);
    } else if (entry.name.endsWith(".md")) {
      yield full;
    }
  }
}

export async function checkSkillFormatting(root) {
  const errors = [];
  const files = readdirSync(join(root, "plugins"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => [...markdownFiles(join(root, "plugins", entry.name, "skills"))]);

  for (const file of files) {
    const rel = relative(root, file);
    const text = readFileSync(file, "utf8");
    if (text.includes("\r")) {
      errors.push(`${rel}: contains CR characters; use LF line endings`);
    }

    const body = text.replace(/^---\n[\s\S]*?\n---\n\n/, "");
    if (!body.startsWith(`${ignoreStart}\n\n`)) {
      errors.push(`${rel}: content (after frontmatter) must start with ${ignoreStart}`);
    }
    if (!text.endsWith(`\n\n${ignoreEnd}\n`)) {
      errors.push(`${rel}: must end with ${ignoreEnd}`);
    }

    const unwrapped = text.replace(`${ignoreStart}\n\n`, "").replace(`\n\n${ignoreEnd}`, "");
    if (!(await prettier.check(unwrapped, { filepath: file }))) {
      errors.push(`${rel}: content is not Prettier-formatted; remove the ignore markers temporarily and run prettier --write`);
    }

    for (const [name, { contentOnly, ...options }] of Object.entries(consumerConfigs)) {
      if (!(await prettier.check(contentOnly ? body : text, { filepath: file, ...options }))) {
        errors.push(`${rel}: fails 'prettier --check' under consumer config: ${name}`);
      }
    }
  }

  if (files.length === 0) {
    errors.push(`no skill Markdown files found under ${join(root, "plugins")}`);
  }
  if (errors.length) {
    throw new Error(errors.join("\n"));
  }
  return { files: files.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const result = await checkSkillFormatting(root);
    console.log(`Checked formatting of ${result.files} skill Markdown files. No agent evaluations ran.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
