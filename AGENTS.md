# Repository instructions

This repository distributes skills under `plugins/<plugin>/skills/<skill>/`.
Start with [CONTRIBUTING.md](CONTRIBUTING.md).

- `typescript-project-setup` and `typescript-publish-types` are implemented.
  Leave automatic invocation disabled for unfinished skills and retain explicit
  not-implemented behavior until implementing and evaluating them.
- Keep plugin metadata synchronized across root, Claude, and Codex manifests,
  and keep all four marketplace manifests in sync.
- Benchmark fixtures and evaluation tooling are maintained separately from the
  distributed skills. Include evaluation evidence in PRs; do not invent results.
- Run `npm run validate` after changing skills, manifests, or repository tooling.
  These checks are structural, not agent evaluations.
- Plugin versions are maintained manually.
