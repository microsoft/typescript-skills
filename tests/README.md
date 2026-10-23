# Skill evaluation

Benchmarks and evaluation tooling are maintained separately from the distributed
skills. This repository does not currently include a runnable public evaluation
suite. The structural checker tests under `eng/` are not skill evaluations.

The [benchmark catalog](benchmarks.md) records actual task prompts, pinned public
repositories, toolchains, and English descriptions of the success graders.
It also explains how to specify a new benchmark without importing the harness.

## Initial results

These are the maintainer-provided, provisional cross-model averages from the
upstream `jsts-chat-features` dashboard. The comparison is the VS Code agent
without that product versus the same agent with the product, which includes
skills and other extension functionality. It is not an isolated test of these
standalone skill files, and **none of these numbers evaluates this PR's stubs**.

| Skill | skill usage/n | Tokens | Time | Score |
| --- | ---: | ---: | ---: | --- |
| typescript-update | 14.3/14.3 | +131.6% | +277.6% | +25.6 pp (9.2 -> 34.8%) |
| typescript-project-setup | 6.0/6.0 | +1.6% | -12.1% | +38.9 pp (11.1 -> 50.0%) |
| typescript-strict | 8.3/8.3 | +162.0% | +270.4% | +29.1 pp (11.1 -> 40.2%) |
| typescript-esm | 6.0/6.0 | +21.4% | +74.1% | 0.0 pp (66.7 -> 66.7%) |
| typescript-publish-types | 5.0/5.0 | +125.6% | +99.1% | +33.3 pp (46.7 -> 80%) |
| typescript-build-references | 5.7/5.7 | +84.5% | +136.7% | +52.2 pp (30 -> 82.2%) |
| typescript-build-project | 3.3/4.7 | +34.0% | +63.7% | 0.0 pp (71.7 -> 71.7%) |

`typescript-build-project` is a general build skill, evaluated during varied
modernization tasks. It may move to a separate `typescript-agent` plugin.
Its historical cohort includes one non-public case, so the result is not a
public-only comparison.

### Reading the table

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
  be omitted. Consequently `n` need not equal the catalog size; it is not a
  number of repeated trials or an all-attempt completion rate.
- **Tokens / Time:** for each model, percentage change in summed reported tokens
  or elapsed seconds across its matched tasks, relative to the unaided agent.
  Those percentage changes are then averaged across models. Positive means
  more tokens or more time; it is not a percentage-point change.
- **Score:** change in complete-task pass rate, in percentage points (`pp`),
  followed by unaided and product-assisted pass rates. The benchmark-specific
  pass rules are in the catalog; the score is not the average of every
  intermediate verifier dimension or every RewardKit reward.

## Updating results

Keep the summary table manual for now. For a new result, record the evaluated
skill and product revisions, host/version, model IDs, benchmark and grader
revision, invocation mode, baseline, run IDs, exclusions, and commands/outcomes.
Keep the two arms' inputs and environment consistent. Distinguish new agent
attempts from regrading existing submissions, and distinguish task success from
build, test, runtime, and safety diagnostics.

Do not replace these historical figures with a purported evaluation of unfinished
skills. Preserve uncertainty and missing evidence explicitly.
