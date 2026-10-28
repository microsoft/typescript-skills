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
  <plugin>/
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
  README.md                          Results, methodology, and reporting format
eng/
  check-skills.mjs                    Repo structure checker
  check-skills.test.mjs               Checker regression tests
```

Do not add empty `scripts/`, `references/`, or `assets/` directories.

## Writing a skill

1. Create `plugins/<plugin>/skills/<skill-name>/SKILL.md` with YAML frontmatter
   and Markdown instructions. Include prerequisites, required inputs, a bounded
   workflow, pitfalls, and validation. Move supporting detail into `references/`
   when necessary.
2. Use a short kebab-case `name` matching the directory. Write a frontmatter
   `description` explaining when the runtime should select the skill, including
   important exclusions.
3. Verify representative tasks, failure cases, and already-correct or out-of-scope
   cases as appropriate. Check resulting files and runtime behavior rather than
   relying on the agent's report.
4. Include evaluation evidence in the PR: the evaluated revision, model and host,
   benchmark or scenario, invocation mode, commands, and outcomes. When comparing
   with a baseline, keep inputs and environment consistent. Explain anything not
   run rather than inventing results.

Evaluation tooling and benchmark fixtures are maintained separately from the
distributed skills. There is not yet a runnable public evaluation suite in this
repository; do not assume contributors can clone and run one.
See [tests/README.md](tests/README.md) for results and the reporting format.

### Invocation control

`disable-model-invocation: true` makes a skill manual-only in hosts that support
this option: the model cannot automatically select it, but the user can still
invoke it explicitly. It does not disable the model itself or prohibit tools.
This is a [Claude Code extension](https://code.claude.com/docs/en/skills#control-who-invokes-a-skill),
not a required field in the [Agent Skills specification](https://agentskills.io/specification).
Other hosts may handle it differently.

Leave automatic invocation disabled for unfinished instructions. When a skill
is ready for automatic selection, remove the flag and evaluate its routing as
well as its task behavior. Explicit not-implemented instructions also protect
unfinished skills when a host ignores the flag.

## Adding plugins and skills

Keep related skills in the existing plugin unless there is a clear reason to
split them. New plugins require all three plugin manifests, entries in all four
marketplace manifests, and a README entry.

The repo structure checker expects local marketplace sources at
`./plugins/<plugin-name>` and skills at `./skills/`. Keep each plugin's name,
version, description, and skills list consistent across its three manifests.
Keep marketplace names, owners, and plugin entries consistent across hosts;
host-specific display metadata can differ.

Ownership is recorded in `.github/CODEOWNERS`. Update it when responsibility changes.

## Local checks

Use Node.js 24 or later:

```sh
npm ci
npm run validate
```

Individual commands are `npm run check`, `npm test`, and `npm run lint`.
CI runs these same checks without model credentials. Static checks validate
metadata and layout, not host installation or skill quality.

The Markdown CLI currently pins transitive parsers to release ranges that exclude
available security fixes. The development-only overrides in `package.json`
select patched versions of [js-yaml](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm),
[KaTeX](https://github.com/advisories/GHSA-238p-pmpm-9mq7), and
[smol-toml](https://github.com/advisories/GHSA-r4xh-jqrq-34v2).
These packages are not shipped with the skills. The overrides cross upstream
dependency ranges, so check compatibility with `npm run validate` and remove each
override when the CLI supports a patched version without it.

## Manual releases

Each plugin is versioned independently. Start at `0.1.0` and manually update
`version` in its root, Claude, and Codex `plugin.json` files together when
releasing changed plugin content. Use semantic versioning: patch for compatible
fixes, minor for compatible additions, and major for breaking changes.
The repo structure checker accepts stable `major.minor.patch` versions.

Before release, run the local checks, review evaluation evidence, and smoke-test
installation and discovery in the supported hosts you are releasing for. Record
the host versions and any gaps. Push the reviewed change through the normal PR
process. A Git tag or GitHub Release can document a release, but no workflow stamps
versions, publishes releases, or submits to hosted marketplaces. Users update
installed plugins through their host.
