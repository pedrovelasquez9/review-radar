# Changelog

All notable changes to review-radar. Versions follow [Semantic Versioning](https://semver.org/).

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

[0.3.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.3.0
[0.2.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.2.0
[0.1.0]: https://github.com/pedrovelasquez9/review-radar/releases/tag/v0.1.0
