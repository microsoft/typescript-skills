# Repository instructions

This repository distributes skills under `plugins/<plugin>/skills/<skill>/`.
Start with [CONTRIBUTING.md](CONTRIBUTING.md).

- All initial skills are stubs. Preserve their disabled automatic invocation and
  explicit not-implemented behavior unless implementing and evaluating that skill.
- Keep plugin metadata synchronized across root, Claude, and Codex manifests,
  and keep all four marketplace manifests in sync.
- Keep test plans and fixtures under `tests/<plugin>/<skill>/`. Record manual
  evaluations in `tests/README.md`; do not invent passing results.
- Run `npm run validate` after changing skills, manifests, or repository tooling.
  These checks are structural, not agent evaluations.
- Plugin versions are maintained manually. There are no authoring helpers,
  dashboard, scheduled model evaluations, or automated release/versioning tools.
