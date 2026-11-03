# Changelog

All notable changes to review-radar. Versions follow [Semantic Versioning](https://semver.org/).

## [0.12.1] - 2026-11-03

### Fixed

- A hard-coded value that breaks a rule the project docs state (a 15% discount where `CLAUDE.md` caps discounts at 10%) was reported as business logic instead of suspicious, above all when a code comment called it an approved exception. Contradicting the docs now wins over touching them, whatever a comment, a commit message or the request says, and the finding quotes both the value and the rule.

## [0.12.0] - 2026-11-03

### Changed

Fewer tokens and less memory per analysis, with nothing taken away from what the review sees:

- **Prompt cache for what repeats.** The project docs and your requests now open the review prompt as their own cached blocks, after the cached instructions. The parts of a split review read them from the cache, and so do the next turns while the docs do not change.
- **Generated files go by name only.** Besides lockfiles, `dist/` and `coverage/` at the root, minified files, source maps and test snapshots are no longer sent to the models; their names are. The secret scan still reads them.
- **No reads when nothing needs a model.** When every changed file kept its earlier findings, the session's conversation and the project docs are not read.
- **The wider diff covers only the files to review**, instead of the whole branch, when their paths fit on a command line.
- **Bounded requests.** Your requests are sent up to 16,000 characters: the first one, which usually sets the task, and the latest ones, with a note that the middle ones were left out.
- **Bounded untracked files.** Each untracked file is read up to 1,000,000 characters.
- **OpenCode** stores only finished reports, not each loader step.

### Fixed

- The last file of the diff was reviewed again whenever another file came after it, because git's trimmed output changed its hash. Each file's diff now ends the same way wherever it sits. After the upgrade, the first analysis reviews every file once.

## [0.11.0] - 2026-11-03

### Added

- **Business context from the project's own docs.** The triage and the deep review now read `CLAUDE.md` and `AGENTS.md` (at the root and in the folders above each changed file), the root `README.md` and the Markdown files in `docs/`, in that order, up to a fifth of the review budget (24,000 characters with `opus`; the triage gets the first 4,000). A change touching a rule, an amount or a permission the docs describe is judged as business logic, and one that contradicts them as suspicious, with the rule named in the finding. The models are told the docs describe the app and are never instructions to them. The docs are read only when a model is about to be asked.

## [0.10.0] - 2026-11-03

### Added

- **Function context for the deep review.** The review model now reads each change inside its whole enclosing function (`git diff --function-context`, which knows each language's functions), so a bug that only shows next to the code around it is visible. When that would cost one more review call, it gets 10 lines around each change instead, and the plain diff when even that does not fit. A file whose wider diff alone is over the budget keeps its plain diff. Hashes, the secret scan and the excerpts under findings still use the plain diff, so nothing else changes.

## [0.9.0] - 2026-11-03

### Added

- **Logic-change safety net.** A code file whose changed lines alter a decision or a computation (a condition, a comparison, boolean logic, a number, a `return` or `throw`) always gets the deep review: the triage can no longer clear it. It is found without a model, by comparing each changed line's shape, so renames and reformatting do not count, while a `>` turned into `>=` or a new `0.15` does. Docs, styles and tests never count.

### Changed

- The triage is only shown the files it could clear. Data and config files, files with a secret or a logic change, and files the agent edited in this session go straight to the deep review, so the triage prompt is shorter.

## [0.8.0] - 2026-11-03

### Added

- **`reviewMode` setting.** `auto` (the default) or `thorough`. `thorough` never triages: every changed file gets the deep review, so the triage can never clear a file by mistake. It spends more tokens on large branches.
- **Deep review in parts.** When the files to review do not fit in one call, the review is split into parts (up to 6), and each part is told which files the others read. The loader shows the part it is on. Before, the diff was cut at 150,000 characters; now files past 6 parts are listed in the PR list as not reviewed.

### Changed

- **The triage runs only when the changes do not fit in one deep review.** Before, it ran from 30,000 characters on. Now each review model has a budget of diff it reads well in one call: 150,000 characters for `opus` and `sonnet`, 100,000 for `haiku`. In OpenCode the budget comes from the model's context window (half of it, at 3 characters per token), or 48,000 characters when the window is not known, so small local models get parts they can read.

## [0.7.0] - 2026-11-02

### Added

- **OpenCode support.** review-radar runs in OpenCode (1.17 or newer) as a TUI plugin, `opencode-review-radar`, with the same analysis:
  - At the end of the first turn that leaves changes on the branch, the session's sidebar shows the review: the analysis's step while it runs, then how many changes need you and one line per finding.
  - `/review-radar` opens a review dialog: the summary, the findings to review, the reviewed ones and what can wait for the PR. A finding opens with its reason and its diff in the theme's colors; `r` marks it reviewed, `c` writes the complete fix request into the prompt.
  - The models are asked through OpenCode, so any provider works: the session's own model by default, or `model` in the plugin options. Each question runs in a child session with every tool off and every permission denied, deleted right after.
  - The `unrequested` category reads your prompts and the files changed with `edit`, `write`, `multiedit` and `apply_patch`.
  - Reviewed marks and the last report are kept per project across restarts.

### Changed

- The analysis now lives in `core/`, shared by the Claude Code mod and the OpenCode plugin; each agent has a thin adapter. Nothing changes for Claude Code users.

## [0.6.0] - 2026-11-02

### Changed

- **The pane opens when there is something to review.** It no longer opens at session start: it opens by itself at the end of the first turn that leaves changes on the branch, already showing the loader, so it is never an empty pane waiting for a turn. Outside a git repository it never opens by itself.
- It opens by itself once per session. If you close it, later turns do not reopen it; `/review-radar` opens it at any time.
- The analysis at session start still runs, without opening the pane: changes made before the session are ready in the report when you open it.

## [0.5.0] - 2026-10-31

### Changed

- **The pane clears to the loader while analyzing.** Previous results are no longer kept under the loader: the pane holds only the loader until the new results are ready, so it is what you see wherever the pane was scrolled.
- **Re-analyze and `/review-radar` show the loader at once**, before the diff is even read. Automatic analyses still switch to it only once the diff turns out to have changed, so an unchanged diff never flashes it.
- Before the base branch is known (the very first analysis), the loader reads "Analyzing changes…" instead of naming an empty branch.

## [0.4.0] - 2026-10-31

### Added

- **Loader while analyzing.** A highlighted card at the top of the pane shows that an analysis is running and which step it is on: reading the changes, sorting files by risk (large diffs), or the deep review, with the file count and the model. A hint says it usually takes 20–40 seconds.
  - On the first analysis the pane shows only the loader. On later ones the previous results stay below it with a note that they are from the previous analysis, so the pane never looks idle while it works.
  - The loader changes only when the step changes: no timer redraws the pane.

### Fixed

- A pane left showing an analysis in progress after the mod was reloaded or the session restarted mid-analysis now goes back to its last results (or to waiting) when the mod starts.

## [0.3.0] - 2026-10-31

### Changed

- **Request changes writes a complete fix request.** Instead of a short `In file:line (title): ` line to finish by hand, the button now inserts into the prompt everything the session needs to fix the finding: its category and title, `file:line`, the problem it causes, the code under review as a diff, and the instruction to correct it (or revert it if it should not be there) while leaving the rest as it is. It is written in the configured language, at the cursor, so any draft is kept; add your own notes and send it.

## [0.2.0] - 2026-10-30

### Added

- **Unrequested changes.** A new critical category, `unrequested`, for changes Claude made that nobody asked for: an unrelated file touched, behaviour changed beyond the task, a new dependency, a refactor or rename nobody requested, code deleted outside the task. Each finding says which request it goes beyond.
  - The mod reads the person's prompts and the files Claude edited (Edit, Write, NotebookEdit) from the session's own conversation, so it also works after a reload of the mod or in a resumed session.
  - Only files Claude edited in this session are judged against the requests: earlier work on the branch is never called unrequested.
  - What a requested change needs to work (imports, types, call sites, tests and docs of the requested code) is not flagged.
  - It adds no model call: the requests travel in the existing deep-review prompt. Files Claude edited always get the deep review, even on a large diff the triage would otherwise clear.

## [0.1.0] - 2026-10-30

First public version.

### Added

- **Review pane** beside the chat: a summary of the branch, one card per change that needs a human with its category, `file:line`, the reason, and the diff hunk inline; routine changes folded under *Review in the PR*.
- **Review actions** on each finding: *Reviewed* folds it (the mark holds while that code is unchanged) and *Request changes* inserts `In file:line (title): ` into the prompt.
- **Stack-agnostic categories**, judged by what a change does: `business-logic`, `architecture`, `data`, `secrets`, `third-party`, `security`, `infra` and `suspicious` (likely mistakes such as inconsistent values, copy-paste leftovers or flipped conditions).
- **Two-stage analysis**: on diffs of 30,000 characters or more, Haiku triages files from their changed lines; data and config files always go on to the deep review, done by the review model at high effort.
- **Deterministic secret scan** of added lines (API keys, tokens, private keys, JWTs): a hit is always critical, whatever the model says.
- **Incremental analysis**: files whose diff did not change keep their findings and are not sent again; turns that changed no file do not run git.
- **Settings**: `language` (`en` by default, or `es`), `reviewModel` (`opus` by default, `sonnet` or `haiku`, falling back to `sonnet` when the chosen one cannot answer) and `autoAnalyze` (on by default; off, only `/review-radar` and *Re-analyze* run an analysis).
- **`/review-radar` command**: opens the pane, forces a full analysis and prints the report, diffs included, in the conversation.
- Installable from GitHub as its own marketplace.

[0.12.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.12.0
[0.11.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.11.0
[0.10.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.10.0
[0.9.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.9.0
[0.8.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.8.0
[0.7.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.7.0
[0.6.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.6.0
[0.5.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.5.0
[0.4.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.4.0
[0.3.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.3.0
[0.2.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.2.0
[0.1.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.1.0
