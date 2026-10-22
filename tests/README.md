# Manual skill evaluation

Tests mirror `plugins/<plugin>/skills/<skill>/` under `tests/<plugin>/<skill>/`.
Each skill currently has a test-plan stub only: no implemented fixtures, agent
evaluations, or passing results.

## Procedure

1. Add small, representative fixtures and explicit expected outcomes beside the
   skill's test plan. Record setup, build, and runtime commands, including relevant
   tool versions. Include an already-correct or out-of-scope case when applicable.
2. Run the same natural user request against a fresh copy of the fixture without
   the skill available, then against a separate fresh copy with the target skill
   available. Keep the model, host, tools, configuration, and inputs the same.
3. For baseline runs, ensure the target skill and other copies of its instructions
   are not discoverable. For skill-assisted runs, note whether it was loaded
   explicitly or selected automatically; distinguish these cases in the results.
4. Inspect the resulting files and run the fixture's acceptance commands. Check
   behavior, not just whether an agent says it succeeded. Record whether the skill
   activated and whether unexpected changes occurred.
5. Record both outcomes, the evaluated commit, and evidence links in the table.
   Mark skipped work as not run. Repeat important cases before drawing conclusions;
   these manual observations are not statistically significant comparisons.

Use disposable working copies for agent trials. Do not run migration experiments
against the repository's own marketplace files. Keep bulky transcripts and local
outputs in the ignored root `eval-results/` directory, attaching reviewed evidence
to a PR when needed. Do not publish credentials or sensitive project content.

## Results

Append one row per evaluated scenario. The initial rows are placeholders, not
evaluations. Record host/model versions, activation mode, commands, and evidence
in the notes or a linked report.

| Skill | Scenario/fixture | Model/host | Evaluated commit | Baseline outcome | Skill-assisted outcome | Notes/evidence |
| --- | --- | --- | --- | --- | --- | --- |
| typescript-update | Not implemented | N/A | N/A | Not run | Not run | Skill and test plan are stubs. |
| typescript-project-setup | Not implemented | N/A | N/A | Not run | Not run | Skill and test plan are stubs. |
| typescript-strict | Not implemented | N/A | N/A | Not run | Not run | Skill and test plan are stubs. |
| typescript-esm | Not implemented | N/A | N/A | Not run | Not run | Skill and test plan are stubs. |
| typescript-build-references | Not implemented | N/A | N/A | Not run | Not run | Skill and test plan are stubs. |
| typescript-build-project | Not implemented | N/A | N/A | Not run | Not run | Skill and test plan are stubs. |
