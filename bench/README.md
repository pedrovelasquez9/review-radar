# review-radar bench

Measures whether review-radar puts real defects in *Needs your review* and keeps clean changes out of it, against a baseline: the same model asked to review the plain diff with a short prompt. Everything runs on this machine, through the Claude Code CLI and your own login; nothing goes to any other service.

## Cases

41 branches over a small shop backend (`project.ts`, with its business rules in `docs/rules.md`): 27 basic ones in `cases.ts`, and 14 harder ones in `cases-hard.ts` (11 bugs, 3 clean). The basic ones:

- **17 with a planted bug**: a boundary moved, a check inverted or removed, a unit mixed up, a value against the documented rules, a secret, a destructive migration, customer data sent to a third party, a change nobody asked for, an unhandled new status, unbounded retries, a weak token check.
- **10 clean**: renames, tests, docs, comments, a helper extracted, a lookup table, readonly types. Any critical finding on them is a false alarm.

Each case is built as a real git repository (base on `main`, the change committed on a branch), and each review runs review-radar's own analysis (`core/`) on it with real git.

## Scoring

No model judges the results:

- A bug is **found** when a flagged finding is in its file and, when it gives a line, within 3 lines of the defect. The other flagged findings on that case are **extra alarms**.
- On a clean case every flagged finding is a **false alarm**.
- For review-radar, *flagged* means critical (*Needs your review*). For the baseline, everything it lists.

Models vary from run to run: read a number only with 2 or more runs per case.

## Run it

Sign the CLI in first (`claude auth login`), then from the repository root:

```shell
bun bench/run.ts --dry-run            # no model: checks cases, repositories and scoring (must score 100% and 0 alarms)
bun bench/run.ts                      # opus, 2 runs, both arms: 108 reviews
bun bench/run.ts --model sonnet --runs 3 --cases bug-,clean-readme --arms radar --parallel 2
```

Each review spends your Claude usage: a full run is 108 calls of the review model, plus a few small Haiku calls. The report goes to `bench/results/` (Markdown and the raw JSON), which git ignores.

The CLI is called with `--tools ""`, `--setting-sources ""` and `--strict-mcp-config`, so your plugins, hooks and MCP servers stay out of it, and with the review's own system prompt.

## Real cases

`--real` runs pairs mined from public repositories instead (`bench/mine.ts`): a commit that a later fix blamed, and a clean commit of the same repository. A model judge (`bench/judge.ts`, sonnet) reads the fix and decides whether a finding names the real bug. The sets are `real-cases.json` (tuning), `real-cases-heldout.json`, `real-cases-fresh.json`, and `real-cases-final.json`, which no change was tuned on:

```shell
bun bench/run.ts --real --real-file bench/real-cases-final.json --model sonnet --runs 2
bun bench/detectable.ts bench/results/<report>.json   # share of the bugs any review named
```
