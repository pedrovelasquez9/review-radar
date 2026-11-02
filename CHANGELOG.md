# Changelog

All notable changes to review-radar. Versions follow [Semantic Versioning](https://semver.org/).

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

[0.7.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.7.0
[0.6.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.6.0
[0.5.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.5.0
[0.4.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.4.0
[0.3.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.3.0
[0.2.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.2.0
[0.1.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.1.0
