---
name: typescript-report-issue
description: Invoke with `/typescript-report-issue`. Skill Version 1.0
disable-model-invocation: true
---

To begin, ask the user to describe the bug they want to report in their own words.
Ask follow-up questions as necessary until you understand what to do next.

## Pre-Work

You should consult these documents before proceeding:
 * [TypeScript FAQ](https://github.com/microsoft/TypeScript/wiki/FAQ)
 * [tsc Security Properties](https://github.com/microsoft/TypeScript/wiki/tsc-Security-Properties)
 * [CONTRIBUTING.md](https://github.com/microsoft/TypeScript/blob/main/CONTRIBUTING.md)

You should also search for existing issues that might be a duplicate of what you're going to log.

If the issue seems to be addressed by one of these, consult your user on what to do next.

Otherwise, confirm with the user the kind of investigations you're going to do, and then present them with the option to either review a markdown draft file or post directly to the microsoft/TypeScript issue tracker.

## Issue Template

Agents should use a different issue form than the standard ones.

Fill out the following template.
Perform the necessary research, and asking the user questions where needed.
Each section is described below.

<!-- BEGIN AGENT TEMPLATE -->
```md

## TypeScript Version

The tested TypeScript version is _________.
<!--
Include these fields if it's relevant to the bug
 - OS for bugs involving file watching, symlinks, or performance
 - Editor for editor bugs
 - Package manager if a dependency is needed
-->

## User Goal

<!-- See "User Goal" -->

## Setup and Action

<!-- See "Setup and Action" -->

## Expected and Actual Behavior

**What actually happened**: <!-- describe what happened -->

**What I expected**: <!-- see "expected behavior" -->

## Agent Info

<!--
name your harness version, model, and "Skill Version 1.0",
e.g. Codex 3.141 + Claude Haiku 3.5 + Skill Version 1.0
-->
```
<!-- END AGENT TEMPLATE -->

When writing, please try to be as succinct as possible.
More text is more time for humans to read.
The TypeScript team does best when the bug report is short and sweet - set up the scenario, describe what went wrong, done.
Never describe what something **isn't** - don't say "This is a suggestion for a better error condition, not a request to change the language". We should be able to tell what something is by looking at it!

## User Goal

You must explain why you're here vis a vis the human that initiated your process.

Examples of good answers:
 * The user's goal is to submit a PR to this project, so I found a potential issue to make a PR for
 * The user wants to build their GitHub profile by finding bugs in TypeScript and fixing them
 * The user wants me to find as many bugs in as many popular repos as possible
 * The user encountered a problem and asked me to help narrow it down to a possible TypeScript bug
 * I was told to go look for differences between two versions of TypeScript
 * A code inspection process looking for potential problems turned up a possible issue

You don't need to disclose what the human was doing or any personal information about them, but we do need to understand the human intent behind why you're here.

## Setup and Action

Your setup should include a minimal example.
A minimal example does as many of these as possible:
 * Has zero dependencies. We will generally not accept issues that require complex type libraries. Try to "inline" definitions from dependencies until you have a self-contained repro.
 * Is a single file. While this isn't always possible, bugs should only use multiple files when it's actually needed.
 * Has minimal complexity. Code that isn't necessary to the repro should generally be removed
 * Keeps descriptive identifiers. Don't rename everything to single-character identifiers. You should rename things for simplicity's sake -- `EmployeeOnboardOptions` can just be `Options`, etc., but try to keep the *intent* of the code readable

If the setup involves more than a few files, publishing a sample repo is recommended. Ask your user for permission to do this.

Action describes what the user action is, e.g. running `tsc`, doing something in a code editor, or inspecting an emitted file.

For editor bugs, you can speak LSP directly to tsc to verify the issue.
Your report should be framed in terms of human verbs in the editor, though (e.g. "invoke signature help on this line").

You should double-check that your minimal example still reproduces the bug you started with.

## Expected Behavior

If the actual behavior is a crash or hang, no justification is required.
Otherwise, a bit of justification is usually helpful.

## Information You Should Not Include

Even if you ended up inspecting the TypeScript codebase for clues, you should generally **not** attempt to root-cause the issue.
These investigations are often misleading for future work.
Root-cause analysis should only be included with PRs.
Do not include information about your proposed fix.

You may, with reasonable justification, include this information if it feels particularly relevant (e.g. a performance issue and you took a profile).
