# TypeScript Agent Skills

Skills for coding agents working with TypeScript, JavaScript, and Node.js.
The marketplace and plugin layout follows [dotnet/skills](https://github.com/dotnet/skills).
Skills use the [Agent Skills](https://agentskills.io) format.

> **Work in progress:** all six skills are stubs, not usable migration or build
> guidance. Automatic invocation is disabled. Explicitly invoking a stub only
> reports that it is not implemented.

## What's included

The initial `typescript` plugin groups the following skills:

| Skill | Intended purpose | Status |
| --- | --- | --- |
| [typescript-update](plugins/typescript/skills/typescript-update/SKILL.md) | Update to TypeScript 7. | Stub |
| [typescript-project-setup](plugins/typescript/skills/typescript-project-setup/SKILL.md) | Create a new TypeScript project with a suitable configuration. | Stub |
| [typescript-strict](plugins/typescript/skills/typescript-strict/SKILL.md) | Enable `strict` and fix the resulting errors. | Stub |
| [typescript-esm](plugins/typescript/skills/typescript-esm/SKILL.md) | Switch from CommonJS to ESM and fix errors. | Stub |
| [typescript-build-references](plugins/typescript/skills/typescript-build-references/SKILL.md) | Add project references and incremental builds to a monorepo. | Stub |
| [typescript-build-project](plugins/typescript/skills/typescript-build-project/SKILL.md) | Build a complex TypeScript project correctly. | Stub |

## Installation

The following commands install the scaffold for development. They do not turn
the stubs into implemented skills.

### Copilot CLI and Claude Code

Add the marketplace, then install the plugin:

```text
/plugin marketplace add microsoft/typescript-skills
/plugin install typescript@typescript-agent-skills
```

Restart the host if needed. Update the plugin manually with:

```text
/plugin update typescript@typescript-agent-skills
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

Open `/plugins` and install `typescript` from `typescript-agent-skills`.
The Codex marketplace manifest is `.agents/plugins/marketplace.json`; there are
no authoring helpers under `.agents/skills/`.

### Cursor

The repository includes a Cursor marketplace manifest, but this does not mean it
is published in Cursor's hosted marketplace. For local development, use Cursor's
local plugin import mechanism with this checkout.

## Development

Use Node.js 22 or later:

```sh
npm ci
npm run validate
```

This runs structural plugin/skill checks, checker regression tests, and Markdown
linting. It does not execute or evaluate the skills in an agent host.

See [CONTRIBUTING.md](CONTRIBUTING.md) for authoring and manual versioning,
and [tests/README.md](tests/README.md) for manual evaluation and results.
There is no dashboard, scheduled agent evaluation, or automatic release process.

## License

[MIT](LICENSE).
