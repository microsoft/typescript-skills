# TypeScript Skills

Skills for coding agents working with TypeScript, JavaScript, and Node.js.
The marketplace and plugin layout follows [dotnet/skills](https://github.com/dotnet/skills).
Skills use the [Agent Skills](https://agentskills.io) format.

> **Work in progress:** `typescript-build-references` is implemented. The other
> six skills remain stubs with automatic invocation disabled; explicitly invoking one only
> reports that it is not implemented.

## What's included

The initial `typescript` plugin groups the following skills:

| Skill | Purpose | Status |
| --- | --- | --- |
| [typescript-update](plugins/typescript/skills/typescript-update/SKILL.md) | Update to TypeScript 7. | Stub |
| [typescript-project-setup](plugins/typescript/skills/typescript-project-setup/SKILL.md) | Create a new TypeScript project with a suitable configuration. | Stub |
| [typescript-strict](plugins/typescript/skills/typescript-strict/SKILL.md) | Enable `strict` and fix the resulting errors. | Stub |
| [typescript-esm](plugins/typescript/skills/typescript-esm/SKILL.md) | Switch from CommonJS to ESM and fix errors. | Stub |
| [typescript-publish-types](plugins/typescript/skills/typescript-publish-types/SKILL.md) | Publish TypeScript declarations that consumers can resolve from the packed package. | Stub |
| [typescript-build-references](plugins/typescript/skills/typescript-build-references/SKILL.md) | Add project references, incremental builds, and declaration emission without breaking existing builds or public APIs. | Implemented |
| [typescript-build-project](plugins/typescript/skills/typescript-build-project/SKILL.md) | Build a complex TypeScript project correctly. | Stub |

`typescript-build-references` has no bundled scripts. In workspace monorepos it
checks references with
[`workspaces-to-typescript-project-references --check`](https://github.com/azu/monorepo-utils/tree/master/packages/@monorepo-utils/workspaces-to-typescript-project-references),
run through `npx`, and it adds `isolatedDeclarations` annotations by hand.

`typescript-build-project` is a general build skill. It remains in this plugin
for now and may move to a separate `typescript-agent` plugin.

## Installation

The following commands install the plugin, including `typescript-build-references`.
The remaining skills are development stubs, not usable task guidance.

### Copilot CLI and Claude Code

Add the marketplace, then install the plugin:

```text
/plugin marketplace add microsoft/typescript-skills
/plugin install typescript@typescript-skills
```

Restart the host if needed. Update the plugin manually with:

```text
/plugin update typescript@typescript-skills
```

### VS Code

For VS Code versions supporting agent plugins, enable plugin discovery in user settings:

```json
{
  "chat.plugins.enabled": true,
  "chat.plugins.marketplaces": ["microsoft/typescript-skills"]
}
```

Use `/plugins` in Copilot Chat to browse the marketplace and install `typescript`.

### Codex CLI

For Codex versions supporting plugins:

```sh
codex plugin marketplace add microsoft/typescript-skills
```

Open `/plugins` and install `typescript` from `typescript-skills`.
The Codex marketplace manifest is `.agents/plugins/marketplace.json`.

### Cursor

The repository includes a Cursor marketplace manifest, but this does not mean it
is published in Cursor's hosted marketplace. For local development, use Cursor's
local plugin import mechanism with this checkout.

## Development

Use Node.js 24 or later:

```sh
npm ci
npm run validate
```

This runs structural plugin/skill checks, checker regression tests, and Markdown
linting. It does not execute or evaluate the skills in an agent host.

See [CONTRIBUTING.md](CONTRIBUTING.md) for authoring and manual versioning,
and [tests/README.md](tests/README.md) for the initial benchmark results and
[benchmark catalog](tests/benchmarks.md). The results describe upstream
experiments, not evaluations of this standalone plugin.
There is no dashboard, scheduled agent evaluation, or automatic release process.

## License

[MIT](LICENSE).
