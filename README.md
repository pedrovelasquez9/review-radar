# review-radar

**English** · [Español](README.es.md)

**Claude Code mod and OpenCode plugin · v0.14.0.** A review pane for the human in the loop. After the agent builds a feature, review-radar reads your branch diff and shows, **with the diff lines and their files**, only the changes a person must confirm: business logic, architecture, data and migrations, secrets, third-party services, security, infra, anything that looks like a mistake, and **changes nobody asked for**. Everything else is listed as "review in the PR". In [OpenCode](#opencode) the same review lives in the sidebar and a dialog.

On real bugs from public repositories it names nearly as many as a plain review of the diff, with a third of the alarms and a twelfth of the false defect claims ([the numbers](#how-well-it-works)). See what changed in each version in the [changelog](CHANGELOG.md).

The goal: confirm or request changes on what matters without opening files one by one, and leave the routine for the pull request.

## What it does

- **Runs by itself.** At the end of every turn in which files may have changed (Edit, Write, Bash…), it diffs the working tree against where your branch left its base (`origin/HEAD`, else `origin/main`, `origin/master`, `main`, `master`). Committed, uncommitted and untracked files are included.
- **Judges by what a change does, not by stack.** No framework rules: the model classifies each change by its effect. It works the same in TypeScript, Python, Go, Ruby, SQL, YAML or Terraform.
- **Shows the change inline.** Each critical finding comes with its category, `file:line`, one sentence on what to check, and the diff hunk that holds it (a window around the line for long hunks).
- **Closes the loop.** Every finding has two buttons:
  - **✓ Reviewed** collapses it. The mark is tied to the code you saw: it holds across re-analyses while that hunk is unchanged.
  - **Request changes** writes a complete fix request into your prompt: the finding and its category, `file:line`, the problem it causes, the code under review as a diff, and the instruction to correct it (or revert it if it should not be there) and leave the rest as it is. Add anything of your own and send it: the session fixes it with no more context needed.
  - **Request changes for all**, above the cards when two or more findings are still to review, writes one request with all of them, numbered, so the session fixes them in one pass. Findings you marked as reviewed are left out.
- **Leaves the rest for the PR.** Routine changes (tests, docs, styling, renames, refactors with no behaviour change) are folded under *Review in the PR*.

### Critical categories

| Category | What it covers |
| --- | --- |
| `business-logic` | Rules, calculations, pricing, state transitions, domain validation, anything that changes behaviour for users or money |
| `architecture` | New modules or layers, changed data flow, moved responsibilities, public API and contract changes |
| `data` | Schema and migration changes, backfills, destructive operations, persistence and serialization formats |
| `secrets` | Credentials, keys, tokens, config holding them, anything that could leak them |
| `third-party` | New or changed calls to external services, SDKs, webhooks, new hosts, new dependencies |
| `security` | Authentication and authorization, trust boundaries, crypto, CORS, injection surfaces |
| `infra` | Deploy, CI, containers, runtime config, production feature flags |
| `suspicious` | Likely mistakes in any file: values inconsistent with their neighbours or other files, copy-paste leftovers, removed things still referenced, flipped conditions |
| `unrequested` | Changes Claude made in this session that none of your prompts asked for: an unrelated file touched, behaviour changed beyond the task, a new dependency, a refactor nobody requested. The finding says which request it goes beyond |

### Changes nobody asked for

AI assistants sometimes do more than asked: a version bump a project rule asked for, a "while I was here" refactor, a dependency added on the way. review-radar compares what you asked for in the session with what Claude actually edited:

- It reads your prompts and the files Claude edited (Edit, Write, NotebookEdit) from the session's own conversation, so it keeps working after a reload or in a resumed session.
- Only files Claude edited in this session are judged: earlier work on the branch is never called unrequested.
- What your request needs to work (imports, types, call sites, tests and docs of the requested code) is not flagged, and later prompts can widen earlier ones.
- It costs no extra model call: your requests travel in the same deep-review prompt.

## How well it works

Measured with the bench in `bench/`, on this machine through the Claude Code CLI, with **sonnet** as the review model and 2 runs per case. Each case is compared against a **plain prompt**: the same model asked to review the same diff.

**Real bugs from public repositories.** The final set holds 25 commits that a later fix blamed, plus 25 clean commits, from 5 repositories no change was tuned on (sveltejs/kit, playwright, nitro, material-ui, storybook):

| | review-radar | plain prompt |
| --- | --- | --- |
| Real bugs named | 28% | 32% |
| Clean changes with no alarm | **39%** | 26% |
| Alarms per clean change | **0.71** | 1.92 |
| …of them, claiming a defect that is not there | **0.16** | 1.92 |
| Extra alarms on a change with a bug | **1.02** | 2.34 |

It names nearly as many real bugs as a plain review (25% against 30% on 46 held-out pairs, 22% against 30% on 27 more). It raises a third of the alarms, and makes a twelfth of the false defect claims. Most of its alarms are decisions to confirm (business logic, data, security, changes nobody asked for), which a plain review does not sort.

**Planted bugs.** On the 41 written cases (28 planted bugs, 13 clean changes), the current version finds and names **56 of 56** planted bugs and raises **no alarm** on clean changes. Earlier runs got the same 56 of 56 with opus and haiku. The plain prompt raised alarms on 42–96% of the clean changes.

Real bugs are hard to catch from a diff. Many need context the diff does not show: a fix that was incomplete, or behaviour that lives in the framework. A model also catches some on one run and misses them on the next, and each review names about 55–64% of the bugs that any review in the bench ever named. In the bench, which sends no cached prompt, a review costs 4–7 times a plain one.

## How it works

1. **Diff.** `git diff` of the working tree against the merge base, plus untracked files. Generated files (lockfiles, `dist/` and `coverage/` at the root, minified files, source maps, test snapshots) are left out of what the models read; only their names are passed on. The secret scan still reads them. Add your own exclusions in a `.reviewradarignore` at the repository root, in gitignore syntax: rules apply in order after the built-in ones and the last match decides, so `!yarn.lock` brings a lockfile back.
2. **Secret floor.** A deterministic scan of added lines for literal credentials (API keys, tokens, private keys, JWTs). A hit is always critical, whatever the model says.
3. **Triage (only when the changes do not fit in one review).** Each review model has a budget of diff it reads well in one call: 150,000 characters for `opus` and `sonnet`, 100,000 for `haiku`. When the changed files fit in it, every file goes to the deep review. Past it, and only in the `auto` mode, **Haiku** at low effort sorts files into *inspect* or *routine* from their changed lines alone. Data and config files (by path and extension), files with a secret, files Claude edited in this session, and code files with a **logic change** always go on to the deep review, and the triage is not even shown them. A logic change is a changed line that alters a decision or a computation (a condition, a comparison, boolean logic, a number, a `return` or `throw`), found without a model: each line is compared by its shape, so renames and reformatting do not count, while a `>` turned into `>=` or a new `0.15` does. Docs, styles and tests never count. A file the triage skips or answers unreadably is inspected. The `thorough` mode never triages.
4. **Deep review.** The review model (**Opus** by default, at high effort) reads the diff of the files to inspect with as much surrounding code as fits without one more call: the **whole enclosing function** of each change (`git diff --function-context`), else 10 lines around it, else the plain diff, plus the **related code** outside the diff, found with `git grep` and no model: where the names the diff defines or removes are used (a `switch` over a type that gained a case, a file reading a config key that was renamed) and where the functions its added lines call are defined (their parameters and units), up to a sixth of the review budget, together with your requests in this session and the files Claude edited, and returns a summary plus findings. When the files to review do not fit in its budget, the review is split into parts (up to 6 calls), each told which files the other parts read. Its instructions are prompt-cached, and so are the project docs and your requests, which open the prompt: the parts of a split review, and the next turns while the docs do not change, read them from the cache. If that model cannot answer (no access, blocked by your organization, an API error), **Sonnet** reviews instead and the summary says so.
5. **Bug hunt and second look.** The review hunts defects before it sorts decisions: edge cases (empty, null, boundaries, async order, error paths), each reported as a critical `bug` that quotes the faulty code; a defect is never softened into a "check that…" under another category. On a small diff (one part, up to 150 changed lines) a second call that only hunts bugs runs beside the review, without being told what the review found. Then one more call reads every claimed defect against the code: it can rule one out only by quoting the guard or check that handles it, and the quote must be in the diff or the related code. Those go to the PR list marked *Not confirmed on a second look*. The same call turns a note that hides a defect into a critical bug, and shows a defect told twice once.
6. **Project context.** Both models also read the app's own docs, to judge what is critical in *this* app: `REVIEW.md` first (notes written for whoever reviews the code: invariants, deliberate oddities, rules enforced elsewhere), then `CLAUDE.md` and `AGENTS.md`, each (at the root and in the folders above each changed file), the root `README.md`, and the Markdown files in `docs/`, in that order, up to a fifth of the review budget (24,000 characters with `opus`; the triage gets the first 4,000). A change that touches a rule, an amount or a permission the docs describe is business logic; one that contradicts them is suspicious, even when a code comment calls it an approved exception. The models are told the docs describe the app and are not instructions to them.
7. **Rules in code.** The model proposes; fixed rules decide what you see, so the same answer always ends the same way:
   - A finding is critical only if the branch caused it: its file is in the diff and its line, when given, is within 3 lines of a change. Otherwise it goes to the PR list, marked as already there before the branch. Literal secrets stay critical wherever they are.
   - The same defect reported twice (same file and category, close lines, similar title) is shown once.
   - Literal secrets are masked in the excerpts, titles and reasons the pane shows and *Request changes* copies into the prompt.
   - The diff, the docs and your requests reach the models between markers with a random tag, and the models are told only those markers delimit data: text in the diff cannot close its block and pass itself off as instructions.
   - A *Reviewed* mark is tied to the code, not to its line numbers, so it survives edits that only move it.
8. **Incremental.** Each file's diff is hashed. On the next turn only files whose diff changed are sent again; unchanged files keep their findings (and the model is told about them). A turn that ran no file-changing tool does not run git at all. `/review-radar` and *Re-analyze* force a full review.

## Requirements

- Claude Code with mod support, in the terminal or in a local session of Claude Desktop's **Code** tab. Tested with **Claude Code 2.1.309 on Windows**.
- A git repository. Outside one the pane says *Not a git repository*.
- Model access through your Claude Code session: the review model (`opus` by default), `sonnet` as its fallback, and `haiku` for the triage of large diffs. **Each analysis spends tokens on your account**, and the diff is sent to the model like any other prompt in your session.
- No npm install and no build step.

## Installation

### From GitHub (recommended)

At the prompt of a Claude Code terminal session:

```
/plugin install review-radar --marketplace pedrovelasquez9/review-radar
```

Answer `y` to add the marketplace, then pick a scope (the user scope, first in the list, enables it for your account on this computer), then set the options or keep the defaults. The mod is active right away.

From a shell:

```shell
claude plugin install review-radar --marketplace pedrovelasquez9/review-radar
```

In the Claude desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `pedrovelasquez9/review-radar`, then **Add plugin**.

Already open sessions pick it up after `/reload-plugins`.

### From a local clone

Inside the cloned `review-radar` folder:

```shell
claude plugin marketplace add .
claude plugin install review-radar@review-radar --scope user
```

Keep the folder in place: the marketplace reads from it, so edits reach your sessions after `/reload-plugins`.

### Try it for one session

```shell
claude plugin validate .
claude --plugin-dir .
```

Do not load an installed copy and a `--plugin-dir` copy at the same time.

## Configuration

| Option | Values | Default | What it does |
| --- | --- | --- | --- |
| `language` | `en`, `es` | `en` | Language of the pane, the report and the model's summaries and findings. Changing it redoes the next analysis in the new language. |
| `reviewModel` | `opus`, `sonnet`, `haiku` | `opus` | Model for the deep review. `sonnet` is cheaper and faster; `haiku` is cheapest and catches less. Falls back to `sonnet` when the chosen one cannot answer. |
| `autoAnalyze` | `true`, `false` | `true` | Analyze at the end of every turn that changed files. With `false`, only `/review-radar` and *Re-analyze* run an analysis, so tokens are spent only when you ask. |
| `maxAutoChangedLines` | a number, `0` for no limit | `3000` | An automatic analysis of more changed lines than this (added plus removed, generated and excluded files left out) calls no model: the secret scan still runs, and the pane lists the changed files until you run `/review-radar` or *Re-analyze*. |
| `reviewMode` | `auto`, `thorough` | `auto` | `auto` sorts out routine files with a fast model only when the changes do not fit in one deep review. `thorough` never does: every changed file gets the deep review, in several calls if needed. More tokens on large branches, nothing cleared by the sorting. |

Set them in any of these ways:

- In a session: open `/config` and change the *Language*, *Review model*, *Analyze automatically*, *Review mode* and *Lines reviewed automatically* rows. The mod reloads with the new values.
- When installing:

  ```shell
  claude plugin install review-radar@review-radar --scope user --config language=es --config autoAnalyze=false
  ```

- In `~/.claude/settings.json`:

  ```json
  {
    "pluginConfigs": {
      "review-radar@review-radar": {
        "options": { "language": "es", "reviewModel": "sonnet", "autoAnalyze": true }
      }
    }
  }
  ```

## Usage

- Open a session in a repository and work as usual. The **Review** pane opens beside the chat by itself at the end of the first turn that leaves changes on the branch, already showing the loader, and fills in at the end of each turn that changed files (unless `autoAnalyze` is off). Outside a git repository, or while nothing has changed, it stays closed; `/review-radar` opens it at any time. While an analysis runs, the pane is cleared to a highlighted loader that says which step it is on (reading the changes, sorting files by risk, deep review with the chosen model), and the new results replace it when they are ready. *Re-analyze* and `/review-radar` switch to the loader at once. A toast tells you when something needs your review.
- `/review-radar` opens the pane, forces a full analysis and also prints the report, diffs included, in the transcript. Analysis takes about 20–30 s on a mid-sized branch.
- In the pane: read the summary, go through *Needs your review*, mark each finding **✓ Reviewed** or press **Request changes**, or send everything still open at once with **Request changes for all**, and unfold *Review in the PR* if you want the full list.

### Update or uninstall

```shell
claude plugin marketplace update review-radar
claude plugin update review-radar@review-radar
```

Then `/reload-plugins`. Use `/plugin` to disable or uninstall it.

## Limits

- Whether a change is business logic, architecture or a mistake is the model's judgment: it can miss things or vary between runs. Only the secret scan is deterministic. Use review-radar to focus your review, not to replace it.
- The deep review reads up to 6 parts of the review budget (900,000 characters with `opus`); files past that are listed in the PR list as not reviewed, and the summary says the diff was cut. A single file larger than the budget is cut. The triage reads up to 80,000 characters. At most 40 untracked files are read, each up to 1,000,000 characters. Your requests are sent up to 16,000 characters: the first one and the latest ones, with a note that the middle ones were left out.
- Incremental reuse keeps findings of unchanged files from an earlier run, so cross-file context for those files comes from that run.
- A turn whose only changes came from tools outside Edit/Write/NotebookEdit/Bash/PowerShell (for example an MCP tool), or from you editing files by hand, is not analyzed automatically: run `/review-radar`.
- Headless runs (`claude -p`, the SDK) analyze only when `/review-radar` is called.
- The project docs are sent to the review model with the diff. Keep in them what a reviewer should know about the domain; long docs are cut at their share of the budget.
- Unrequested changes are judged only in files Claude edited with Edit, Write or NotebookEdit in the main conversation. Files changed through Bash or by a subagent are reviewed like any other change, but not checked against your requests.
- An analysis runs again only when the diff changes, so a new prompt that widens the task updates the unrequested findings at the next change or with *Re-analyze*.

## OpenCode

review-radar also runs in [OpenCode](https://opencode.ai) (1.17 or newer) as a TUI plugin, with the same analysis. OpenCode has no side panes, so the review lives in the terminal:

- **Sidebar.** At the end of the first turn that leaves changes on the branch, the session's sidebar shows a *Review* section: where the analysis is while it runs, then how many changes need you and one line per finding (`[category] title` and `file:line`). Findings you mark as reviewed leave it. Click it to open the review.
- **`/review-radar`** (also in the command list, *ctrl+p*) opens the review dialog: the summary, the findings to review, the reviewed ones, what can wait for the PR, and *Re-analyze*. With two or more findings still to review, *Request changes for all* writes one fix request with all of them into the prompt. Pick a finding to see its reason and its diff in the theme's diff colors, then:
  - `r` marks it reviewed (or not reviewed again),
  - `c` writes the complete fix request into the prompt (as *Request changes* does in Claude Code) and closes the dialog,
  - `←` goes back to the list, `esc` closes the dialog.
- A toast says when changes need your review.

OpenCode hides the sidebar in narrow terminals (about 120 columns or fewer); widen the window or open the review with `/review-radar`.

### Install in OpenCode

Add the package to the `plugin` list of your TUI config, `~/.config/opencode/tui.json` (all projects) or `.opencode/tui.json` (one project), with its options:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["opencode-review-radar", { "language": "en" }]]
}
```

From a local clone, use the clone's folder instead of the package name (run `bun install` in it first). Restart OpenCode to load it.

| Option | Values | Default |
| --- | --- | --- |
| `language` | `en`, `es` | `en` |
| `model` | `provider/model`, e.g. `anthropic/claude-opus-5-5` | the session's own model |
| `triageModel` | `provider/model`, for sorting large diffs | the review model |
| `autoAnalyze` | `true`, `false` | `true` |
| `reviewMode` | `auto`, `thorough` (see [Configuration](#configuration)) | `auto` |
| `maxAutoChangedLines` | a number, `0` for no limit (see [Configuration](#configuration)) | `3000` |

The models are asked through OpenCode itself, so any provider you set up there works. Each question runs in a child session of yours with every tool off and every permission denied, so the model can only answer; the child session is deleted right after. The review budget comes from the model's context window as OpenCode reports it (half of it, at 3 characters per token, up to 150,000 characters); for a model with no known window, 48,000 characters are assumed. The review's quality depends on the model: a small local model may miss findings or answer in English.

### Limits in OpenCode

- It needs the TUI: `opencode run` and other headless uses do not analyze.
- An analysis runs when a session goes idle (the agent finished its turn) and the branch diff changed since the last one.
- The `unrequested` category reads your prompts and the files changed with `edit`, `write`, `multiedit` and `apply_patch`.

## Project layout

The analysis is shared; each agent gets a thin adapter.

- `core/` is plain TypeScript with no agent API: the analysis talks to the agent only through the `Engine` port (`core/engine.ts`).
- `hooks/` is the Claude Code mod. Claude Code lets a mod use its engine interface (`$`) and declare session state only in the hooks module itself, `register.tsx`, so that file builds the `Engine` from `$` and hands the pane the state it read.
- `opencode/` is the OpenCode TUI plugin: its `Engine`, the sidebar and the review dialog.

| File | Responsibility |
| --- | --- |
| `core/engine.ts` | The `Engine` port: what the analysis needs from the agent, as plain functions |
| `core/analysis.ts` | The pipeline: read the diff, reuse unchanged files, triage, deep review, attach diff excerpts, store the report |
| `core/git.ts` | The base branch and the branch diff, untracked files included |
| `core/diff.ts` | Reading a unified diff: per-file split, lockfiles, hunks, excerpts, hashing |
| `core/triage.ts` | Stage 1: triage prompt, its answer, and the files always reviewed in depth |
| `core/review.ts` | Stage 2: review prompt and its answer |
| `core/intent.ts` | Your requests and the files the agent edited, for the `unrequested` category; each agent reads them from its own conversation |
| `core/logic-change.ts` | Deterministic check for changed conditions, comparisons and numbers, which the triage cannot clear |
| `core/project-context.ts` | Which docs give the business context (CLAUDE.md, AGENTS.md, README, docs/) and how much of each |
| `core/finding-rules.ts` | The rules that decide what is critical: pre-existing findings and duplicates |
| `core/ignore-rules.ts` | Generated files and `.reviewradarignore`, in gitignore syntax |
| `core/boundary.ts` | The tagged markers around untrusted text in prompts |
| `core/related-code.ts` | Usages and definitions outside the diff that the change depends on, found with `git grep` |
| `core/secrets.ts` | Deterministic secret scan and its merge with the model's findings |
| `core/report-view.ts` | What every view shows the same way: review keys, the headline, the loader's step |
| `core/text-report.ts` | The report as text, for `/review-radar` in Claude Code |
| `core/change-request.ts` | The fix request *Request changes* (one finding or all those still to review) writes into the prompt |
| `core/messages.ts` | Every text the person sees, in English and Spanish |
| `core/settings.ts` | The settings every agent reads into |
| `core/json.ts` | Extracting the JSON object from a model's answer |
| `hooks/register.tsx` | Claude Code entry point: connects the engine's events (session start, the command, tool calls, turn end, pane drawing) to the analysis and the pane, and holds the session state |
| `hooks/models.ts` | Claude Code's model calls, with the review model's fallback |
| `hooks/transcript.ts` | Your requests and Claude's edits, from Claude Code's transcript |
| `hooks/pane.tsx` | The pane, as a view of the report and the actions its buttons run |
| `hooks/settings.ts` | The mod's options and their defaults |
| `opencode/src/tui.ts` | OpenCode entry point: the turn-end analysis, the command, the sidebar slot |
| `opencode/src/engine.ts` | The `Engine` over OpenCode's plugin API, and which model reviews |
| `opencode/src/models.ts` | Model calls in a throwaway child session with tools and permissions off |
| `opencode/src/intent.ts` | Your requests and the agent's edits, from OpenCode's messages |
| `opencode/src/store.ts` | The report and the reviewed marks: Solid signals, saved per project |
| `opencode/src/sidebar.ts`, `review-dialog.ts`, `elements.ts` | The sidebar, the review dialog, and the OpenTUI builders they use |
| `opencode/src/settings.ts` | The plugin options and their defaults |
| `types/index.d.ts` | Finding and report types, and the mod's state contract |
| `tests/` | The core and the Claude Code mod: one test file per module, plus `fixtures.ts` with sample diffs and a fake engine |
| `opencode/tests/` | The OpenCode plugin: its views drawn with OpenTUI's test renderer, and its readers |

## Development

From inside the folder:

```shell
claude plugin validate .
claude plugin test .
npx tsc -p .
```

For the OpenCode plugin:

```shell
bun install
bun test opencode
npx tsc -p opencode
```

`tsc` reads the Claude Code types from `.claude-plugin/types/`, which Claude Code writes the first time it loads the mod (installed, or with `claude --plugin-dir .`). The folder is not versioned: it holds the MCP connectors of the machine that loaded the mod.

To measure the review itself, `bench/` has 41 written cases (28 planted bugs, 13 clean changes) and pairs mined from public repositories (`--real`), and runs review-radar and a plain-prompt baseline with your own Claude Code CLI login; `bun bench/run.ts --dry-run` checks it without calling a model. See [bench/README.md](bench/README.md).

## License

[MIT](LICENSE) · [github.com/pedrovelasquez9/review-radar](https://github.com/pedrovelasquez9/review-radar)
