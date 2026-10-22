# Contributing

Keep changes focused on one skill where practical. Skills should produce a
specific outcome, explain when to use them, and provide concrete verification.

## Repository layout

```text
.github/plugin/marketplace.json       Copilot marketplace
.claude-plugin/marketplace.json       Claude marketplace
.cursor-plugin/marketplace.json       Cursor marketplace
.agents/plugins/marketplace.json      Codex marketplace
plugins/
  typescript/
    plugin.json
    .claude-plugin/plugin.json
    .codex-plugin/plugin.json
    skills/
      <skill-name>/
        SKILL.md
        references/                  Optional supporting documents
        scripts/                     Optional executable helpers
        assets/                      Optional supporting files
tests/
  README.md                          Manual evaluation guide and results
  typescript/
    <skill-name>/
      README.md                      Test plan, followed by fixtures when implemented
eng/
  check-skills.mjs                    Lightweight structural checks
  check-skills.test.mjs               Checker regression tests
```

Do not add empty `scripts/`, `references/`, or `assets/` directories.
Do not copy the .NET repository's authoring helpers, dashboard, evaluation
pipeline, automated versioning, or maintenance agents as part of this scaffold.

## Implementing a skill

1. Replace the stub with prerequisites, required inputs, a bounded workflow,
   pitfalls, and validation. Keep `SKILL.md` focused; move supporting detail into
   `references/` when necessary.
2. Use a short kebab-case `name` matching the directory. Write a frontmatter
   `description` explaining when the runtime should select the skill, including
   important exclusions.
3. Add representative fixtures and expected outcomes under the matching
   `tests/typescript/<skill-name>/` directory. Update its test plan with exact
   commands and observable acceptance criteria.
4. Evaluate the skill manually as described in [tests/README.md](tests/README.md).
   Keep `disable-model-invocation: true` until the skill is ready for automatic
   selection; remove it when implementing and evaluating automatic selection.
5. Remove `metadata.status: stub` and obsolete stub warnings from the skill, test plan, and root README.
   Update plugin and marketplace descriptions when they no longer accurately
   describe implementation status.

Never claim a stub, a structural check, or a single manual trial proves that a
skill improves agent performance. Include no-op or out-of-scope cases where
appropriate, and preserve existing behavior when changing a project.

## Adding plugins and skills

Keep related skills in the existing plugin unless there is a clear reason to
split them. New plugins require all three plugin manifests, entries in all four
marketplace manifests, matching test directories, and a README entry.

The lightweight checker expects local marketplace sources at
`./plugins/<plugin-name>` and skills at `./skills/`. Keep each plugin's name,
version, description, and skills list consistent across its three manifests.
Keep marketplace names, owners, and plugin entries consistent across hosts;
host-specific display metadata can differ.

The initial default owner is recorded in `.github/CODEOWNERS`. Update ownership
when responsibility changes rather than inheriting .NET-specific owners.

## Local checks

Use Node.js 22 or later:

```sh
npm ci
npm run validate
```

Individual commands are `npm run check`, `npm test`, and `npm run lint`.
CI runs these same checks without model credentials. Static checks validate
metadata and layout, not host installation or skill quality.

The overrides in `package.json` keep the Markdown linter's transitive parsers on
patched releases: js-yaml (GHSA-r3ph-w7gj-g6xm), KaTeX (GHSA-238p-pmpm-9mq7),
and smol-toml (GHSA-r4xh-jqrq-34v2). Remove each override once the upstream
dependency includes the fix.

Build output ignores are root-scoped so nested fixture directories such as
`dist/` can be committed. Confirm fixture files are tracked with `git ls-files`;
do not commit dependencies, credentials, or unreviewed generated output.

## Manual releases

Each plugin is versioned independently. Start at `0.1.0` and manually update
`version` in its root, Claude, and Codex `plugin.json` files together when
releasing changed plugin content. Use semantic versioning: patch for compatible
fixes, minor for compatible additions, and major for breaking changes.
The initial checker accepts stable `major.minor.patch` versions.

Before release, run the local checks, review manual evaluation evidence, and
smoke-test installation and discovery in the supported hosts you are releasing
for. Record the host versions and any gaps. Push the reviewed change through the
normal PR process. A Git tag or GitHub Release can document a release, but no
workflow stamps versions, publishes releases, or submits to hosted marketplaces.
Users update installed plugins through their host.
