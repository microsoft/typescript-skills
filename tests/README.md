# Skill evaluation

Benchmarks and evaluation tooling are maintained separately from the distributed
skills. This repository does not currently include a runnable public evaluation
suite. The structural checker tests under `eng/` are not skill evaluations.

## Reporting format

Use this summary format when reporting benchmark results in a PR or evaluation
report. No results are published here yet.

| Skill | skill usage/n | Tokens | Time | Score |
| --- | --- | --- | --- | --- |

State how skill usage and `n` are measured, which baseline the token/time changes
compare against, and the score metric. Report score changes in percentage points
alongside the baseline and skill-assisted scores where applicable.
Include the evaluated revision, model, host, and benchmark version with the
report so the summary can be interpreted and reproduced when tooling is available.
