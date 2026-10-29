# TypeScript Skills

Skills for coding agents working with TypeScript, JavaScript, and Node.js.
The marketplace and plugin layout follows [dotnet/skills](https://github.com/dotnet/skills).
Skills use the [Agent Skills](https://agentskills.io) format.

## What's included

The `typescript` plugin currently includes one skill:

| Skill | Purpose |
| --- | --- |
| [typescript-project-setup](plugins/typescript/skills/typescript-project-setup/SKILL.md) | Create a new TypeScript project with a suitable configuration. |

The skill provides instructions for installing TypeScript, configuring a new
project, and setting up builds. Automatic invocation is not disabled.

## Installation

The following commands install the plugin and its project setup skill.

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
and [tests/README.md](tests/README.md) for the initial benchmark results.
The results describe upstream experiments, not evaluations of the standalone
skill distributed in this repository.
There is no dashboard, scheduled agent evaluation, or automatic release process.

## License

[MIT](LICENSE).
