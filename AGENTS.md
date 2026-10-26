# Repository instructions

This repository distributes skills under `plugins/<plugin>/skills/<skill>/`.
Start with [CONTRIBUTING.md](CONTRIBUTING.md).

- `typescript-build-references` is implemented; the other six initial skills
  remain stubs. Preserve those stubs' disabled automatic invocation and explicit
  not-implemented behavior unless implementing and evaluating that skill.
- Keep plugin metadata synchronized across root, Claude, and Codex manifests,
  and keep all four marketplace manifests in sync.
- Benchmark fixtures and evaluation tooling are maintained separately from the
  distributed skills. Include evaluation evidence in PRs; do not invent results.
- Run `npm run validate` after changing skills, manifests, or repository tooling.
  These checks are structural, not agent evaluations.
- Plugin versions are maintained manually.
