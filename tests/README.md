# Skill evaluation

Benchmarks and evaluation tooling are maintained separately from the distributed
skills. This repository does not currently include a runnable public evaluation
suite. The structural checker tests under `eng/` are not skill evaluations.

## Benchmark summary

Except for the updated `typescript-publish-types` row, these are the
maintainer-provided, provisional cross-model averages from the upstream
`jsts-chat-features` dashboard. The historical comparison is the VS Code agent
without that product versus the same agent with the product, which includes
skills and other extension functionality. It is not an isolated test of these
standalone skill files, and **none of these numbers evaluates this standalone
plugin**.

| Skill | skill usage/n | Tokens | Time | Score |
| --- | ---: | ---: | ---: | --- |
| typescript-update | 14.3/14.3 | +131.6% | +277.6% | +25.6 pp (9.2 -> 34.8%) |
| typescript-project-setup | 6.0/6.0 | +1.6% | -12.1% | +38.9 pp (11.1 -> 50.0%) |
| typescript-strict | 8.3/8.3 | +162.0% | +270.4% | +29.1 pp (11.1 -> 40.2%) |
| typescript-esm | 6.0/6.0 | +21.4% | +74.1% | 0.0 pp (66.7 -> 66.7%) |
| typescript-publish-types | Not reported | Not reported | Not reported | +49.1 pp (36.9 -> 86.0%); see controlled comparison below |
| typescript-build-references | 5.7/5.7 | +84.5% | +136.7% | +52.2 pp (30 -> 82.2%) |
| typescript-build-project | 3.3/4.7 | +34.0% | +63.7% | 0.0 pp (71.7 -> 71.7%) |

`typescript-build-project` is a general build skill, evaluated during varied
modernization tasks. It may move to a separate `typescript-agent` plugin.
Its historical cohort includes one non-public case, so the result is not a
public-only comparison.

### Reading the table

The following definitions describe the historical rows. The controlled
publish-types comparison below documents its different baseline and coverage.

- **Models:** GPT-6 Luna (`gpt-6-luna`), GPT-6.1 Sol (`gpt-6.1-sol`), and Claude
  Haiku 5.5 (`claude-haiku-5.5`). Each row is an unweighted arithmetic mean of
  the three model summaries, not a pooled task-level rate.
- **skill usage/n:** average product-use count / average matched task count.
  The reporter detects product use from a `skills/<name>/SKILL.md` read or an
  MCP tool call; this is not proof that the named skill was invoked or followed.
  Fractional counts come from averaging integer counts across models.
- **Cohort:** the reporter pairs tasks present in both arms, excludes a pair
  when either arm times out, and requires positive, finite token and elapsed-time
  measurements in both arms for this summary. Other unscorable results can also
  be omitted. Consequently `n` need not equal the full task count; it is not a
  number of repeated trials or an all-attempt completion rate.
- **Tokens / Time:** for each model, percentage change in summed reported tokens
  or elapsed seconds across its matched tasks, relative to the unaided agent.
  Those percentage changes are then averaged across models. Positive means
  more tokens or more time; it is not a percentage-point change.
- **Score:** change in complete-task pass rate, in percentage points (`pp`),
  followed by unaided and product-assisted pass rates. The score is not the
  average of every intermediate verifier dimension or every RewardKit reward.

### Publish-types controlled comparison

The November 10-11, 2026 pipelines evaluation compares the previous skill
(`368812458d53cef232824158160599a30b17ed4e`) with the simplified skill
(`4b76895820fdc26fa67cc0300ce4218388f619aa`). It uses three independent
repetitions per model: 27 arms total, with one fresh baseline shared by the
previous and recent skill arms within each model/repetition. The baseline
(`9cde090939915a885f841aa6bd65a400ed9f0a62`) retains the other four TypeScript
skills; it is **not unaided**.

| Model | Baseline | Previous skill | Recent skill | Recent minus previous |
| --- | ---: | ---: | ---: | ---: |
| GPT-6 Luna | 2/9 (22.2%) | 8/9 (88.9%) | 9/9 (100%) | +11.1 pp |
| Claude Haiku 5.5 | 4/14 (28.6%) | 11/14 (78.6%) | 10/14 (71.4%) | -7.1 pp |
| GPT-6.1 Sol | 9/15 (60.0%) | 9/15 (60.0%) | 13/15 (86.7%) | +26.7 pp |
| **Pooled matched cases** | **15/38 (39.5%)** | **28/38 (73.7%)** | **32/38 (84.2%)** | **+10.5 pp** |
| **Equal-model mean** | **36.9%** | **75.8%** | **86.0%** | **+10.2 pp** |

Counts pool repetitions within each model and include only cases graded in
all three arms of that model/repetition. The equal-model mean then averages
the three model rates; this is the aggregation used for the updated summary
row above. Pooled rates instead divide total successes by total matched cases.
Scores measure scalar `success.passed`, not an all-quality-gates pass rate.

All 27 arms completed, but only 38 of 54 possible observations have grades in
all three arms: Luna 9/18, Haiku 14/18, and Sol 15/18. Missing grades are
excluded, not failures, and this coverage is a significant limitation.
The simplified skill performs better overall on this matched subset, while
Haiku performs worse. This comparison does not reproduce the earlier overall
dropoff, but it does not establish a statistically significant improvement.

All arms use pipeline harness
`2ae24c321766995a3118e814a2dcd1a5ed58ace9`, with actual skill revisions and
shared-baseline artifact provenance verified. The configuration, accepted run
IDs, grades, pairwise reports, and execution details are recorded in
`sandersn/typescript-exp`, `evals/jsts/types/simpler-repeat3/`, at revision
`bf63ac6f7645f49d2237472c4ae357f21b90a5e9`. Skill-use, token, and time summaries
are not reported here; the older cohort's values must not be combined with
these scores.

The superseded October 20 publish-types result was +33.3 pp (46.7% to 80%),
with average skill usage 5.0/5.0, tokens +125.6%, and time +99.1%.
That bundled-product cohort differs in environment, baseline, and coverage;
its source skill commit was not verified. These are not directly comparable
before-and-after estimates of the simplification's effect.

## Updating results

Keep the summary table manual for now. For a new result, record the evaluated
skill and product revisions, host/version, model IDs, benchmark and grader
revision, invocation mode, baseline, run IDs, exclusions, and commands/outcomes.
Keep the two arms' inputs and environment consistent. Distinguish new agent
attempts from regrading existing submissions, and distinguish task success from
build, test, runtime, and safety diagnostics.

Do not replace these historical figures with a purported evaluation of unfinished
skills. Preserve uncertainty and missing evidence explicitly.
