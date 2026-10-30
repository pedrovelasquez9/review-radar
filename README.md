# review-radar

**English** · [Español](README.es.md)

**Claude Code mod · v0.4.0.** A review pane for the human in the loop. After Claude builds a feature, review-radar reads your branch diff and shows, **with the diff lines and their files**, only the changes a person must confirm: business logic, architecture, data and migrations, secrets, third-party services, security, infra, anything that looks like a mistake, and **changes nobody asked for**. Everything else is listed as "review in the PR".

See what changed in each version in the [changelog](CHANGELOG.md).

The goal: confirm or request changes on what matters without opening files one by one, and leave the routine for the pull request.

## What it does

- **Runs by itself.** At the end of every turn in which files may have changed (Edit, Write, Bash…), it diffs the working tree against where your branch left its base (`origin/HEAD`, else `origin/main`, `origin/master`, `main`, `master`). Committed, uncommitted and untracked files are included.
- **Judges by what a change does, not by stack.** No framework rules: the model classifies each change by its effect. It works the same in TypeScript, Python, Go, Ruby, SQL, YAML or Terraform.
- **Shows the change inline.** Each critical finding comes with its category, `file:line`, one sentence on what to check, and the diff hunk that holds it (a window around the line for long hunks).
- **Closes the loop.** Every finding has two buttons:
  - **✓ Reviewed** collapses it. The mark is tied to the code you saw: it holds across re-analyses while that hunk is unchanged.
  - **Request changes** writes a complete fix request into your prompt: the finding and its category, `file:line`, the problem it causes, the code under review as a diff, and the instruction to correct it (or revert it if it should not be there) and leave the rest as it is. Add anything of your own and send it: the session fixes it with no more context needed.
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

## How it works

1. **Diff.** `git diff` of the working tree against the merge base, plus untracked files. Lockfiles are left out of what the models read; only their names are passed on.
2. **Secret floor.** A deterministic scan of added lines for literal credentials (API keys, tokens, private keys, JWTs). A hit is always critical, whatever the model says.
3. **Triage (large diffs only).** When the changed files add up to 30,000 characters or more, **Haiku** at low effort sorts files into *inspect* or *routine* from their changed lines alone. Data and config files (by path and extension), files with a secret, and files Claude edited in this session always go on to the deep review. A file the triage skips or answers unreadably is inspected.
4. **Deep review.** The review model (**Opus** by default, at high effort) reads the full diff of the files to inspect, together with your requests in this session and the files Claude edited, and returns a summary plus findings. Its instructions are prompt-cached. If that model cannot answer (no access, blocked by your organization, an API error), **Sonnet** reviews instead and the summary says so.
5. **Incremental.** Each file's diff is hashed. On the next turn only files whose diff changed are sent again; unchanged files keep their findings (and the model is told about them). A turn that ran no file-changing tool does not run git at all. `/review-radar` and *Re-analyze* force a full review.

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

Set them in any of these ways:

- In a session: open `/config` and change the *Language*, *Review model* and *Analyze automatically* rows. The mod reloads with the new values.
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

- Open a session in a repository and work as usual. The **Review** pane opens beside the chat and fills in at the end of each turn that changed files (unless `autoAnalyze` is off). While an analysis runs, a highlighted loader at the top says which step it is on (reading the changes, sorting files by risk, deep review with the chosen model); results from the previous analysis stay below it, marked as such, until the new ones arrive. A toast tells you when something needs your review.
- `/review-radar` opens the pane, forces a full analysis and also prints the report, diffs included, in the transcript. Analysis takes about 20–30 s on a mid-sized branch.
- In the pane: read the summary, go through *Needs your review*, mark each finding **✓ Reviewed** or press **Request changes**, and unfold *Review in the PR* if you want the full list.

### Update or uninstall

```shell
claude plugin marketplace update review-radar
claude plugin update review-radar@review-radar
```

Then `/reload-plugins`. Use `/plugin` to disable or uninstall it.

## Limits

- Whether a change is business logic, architecture or a mistake is the model's judgment: it can miss things or vary between runs. Only the secret scan is deterministic. Use review-radar to focus your review, not to replace it.
- The deep review reads up to 150,000 characters of diff; past that the summary says it was cut. The triage reads up to 80,000. At most 40 untracked files are read.
- Incremental reuse keeps findings of unchanged files from an earlier run, so cross-file context for those files comes from that run.
- A turn whose only changes came from tools outside Edit/Write/NotebookEdit/Bash/PowerShell (for example an MCP tool), or from you editing files by hand, is not analyzed automatically: run `/review-radar`.
- Headless runs (`claude -p`, the SDK) analyze only when `/review-radar` is called.
- Unrequested changes are judged only in files Claude edited with Edit, Write or NotebookEdit in the main conversation. Files changed through Bash or by a subagent are reviewed like any other change, but not checked against your requests.
- An analysis runs again only when the diff changes, so a new prompt that widens the task updates the unrequested findings at the next change or with *Re-analyze*.

## Project layout

Claude Code lets a mod use its engine interface (`$`) and declare session state only in the hooks module itself, `register.tsx`. So `register.tsx` is the only file that talks to the engine: it wraps what the rest needs into plain functions (`engine.ts`) and hands the pane the state it read. Every other file is plain TypeScript you can read and test on its own.

| File | Responsibility |
| --- | --- |
| `hooks/register.tsx` | Entry point: connects the engine's events (session start, the command, tool calls, turn end, pane drawing) to the analysis and the pane, holds the session state, and reads the conversation for `intent.ts` |
| `hooks/engine.ts` | The `Engine` interface: what the analysis needs from Claude Code, as plain functions |
| `hooks/analysis.ts` | The pipeline: read the diff, reuse unchanged files, triage, deep review, attach diff excerpts, store the report |
| `hooks/git.ts` | The base branch and the branch diff, untracked files included |
| `hooks/diff.ts` | Reading a unified diff: per-file split, lockfiles, hunks, excerpts, hashing |
| `hooks/triage.ts` | Stage 1: triage prompt, its answer, and the files always reviewed in depth |
| `hooks/review.ts` | Stage 2: review prompt and its answer |
| `hooks/intent.ts` | Your requests and the files Claude edited, read from the session's conversation, for the `unrequested` category |
| `hooks/secrets.ts` | Deterministic secret scan and its merge with the model's findings |
| `hooks/models.ts` | Calls to the triage and review models, with the review model's fallback |
| `hooks/pane.tsx` | The pane, as a view of the report and the actions its buttons run |
| `hooks/text-report.ts` | The report as text, for `/review-radar` |
| `hooks/change-request.ts` | The fix request *Request changes* writes into the prompt |
| `hooks/messages.ts` | Every text the person sees, in English and Spanish |
| `hooks/settings.ts` | The plugin options and their defaults |
| `hooks/json.ts` | Extracting the JSON object from a model's answer |
| `types/index.d.ts` | Finding and report types, and the mod's state contract |
| `tests/` | One test file per module, plus `fixtures.ts`: sample diffs and a fake engine that answers like git and a model |

## Development

From inside the folder:

```shell
claude plugin validate .
claude plugin test .
npx tsc -p .
```

`tsc` reads the Claude Code types from `.claude-plugin/types/`, which Claude Code writes the first time it loads the mod (installed, or with `claude --plugin-dir .`). The folder is not versioned: it holds the MCP connectors of the machine that loaded the mod.

## License

[MIT](LICENSE) · [github.com/pedrovelasquez9/review-radar](https://github.com/pedrovelasquez9/review-radar)
