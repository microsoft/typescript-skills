# TypeScript Skills

Skills for coding agents working with TypeScript, JavaScript, and Node.js.
The marketplace and plugin layout follows [dotnet/skills](https://github.com/dotnet/skills).
Skills use the [Agent Skills](https://agentskills.io) format.

## What's included

The `typescript` plugin currently includes these skills:

| Skill | Purpose |
| --- | --- |
| [typescript-project-setup](plugins/typescript/skills/typescript-project-setup/SKILL.md) | Create a new TypeScript project with a suitable configuration. |
| [typescript-publish-types](plugins/typescript/skills/typescript-publish-types/SKILL.md) | Publish TypeScript declarations that consumers can resolve from the packed package. |
| [typescript-build-references](plugins/typescript/skills/typescript-build-references/SKILL.md) | Add project references, incremental builds, and declaration emission without breaking existing builds or public APIs. |
| [typescript-strict](plugins/typescript/skills/typescript-strict/SKILL.md) | Enable strict type checking and fix resulting errors without weakening types, tests, or runtime behavior. |
| [typescript-update](plugins/typescript/skills/typescript-update/SKILL.md) | Upgrade TypeScript using version-specific migration guidance. |

`typescript-build-references` has no bundled scripts. In workspace monorepos it
checks references with
[`workspaces-to-typescript-project-references --check`](https://github.com/azu/monorepo-utils/tree/master/packages/@monorepo-utils/workspaces-to-typescript-project-references),
run through `npx`, and it adds `isolatedDeclarations` annotations by hand.

The skills provide instructions for configuring projects, managing build
references, publishing declarations with consumer verification, enabling strict type checking, and upgrading TypeScript. Automatic
invocation is not disabled.

## Installation

The following commands install the plugin and its skills.

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

This runs structural plugin/skill checks, checker regression tests, skill
formatting checks under representative consumer Prettier configurations, and
Markdown linting. It does not execute or evaluate the skills in an agent host.

See [CONTRIBUTING.md](CONTRIBUTING.md) for authoring and manual versioning,
and [tests/README.md](tests/README.md) for the initial benchmark results.
The results describe upstream experiments, not evaluations of the standalone
skills distributed in this repository.
There is no dashboard, scheduled agent evaluation, or automatic release process.

## License

[MIT](LICENSE).
