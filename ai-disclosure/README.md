# AI Usage Disclosure

Required by Submission Guideline 03 ("Use LLMs transparently") and FAQ items 5–6. The prompts
themselves are in [prompt-history.md](prompt-history.md).

## Tools used

| Tool | Model | Used for |
| --- | --- | --- |
| Claude Code (Claude desktop app, Code tab) | Claude Opus 5.5 | Coding agent working in this repository: planning, code, tests, documentation, running commands and checks, and looking at the dashboard in the app's built-in browser |

No other AI tool was used.

## How the work was split

| Me | The AI agent |
| --- | --- |
| Supplied the brief, the FAQ and the submission guidelines, and set the constraints: build locally, phased plan with tracking, README per the guidelines, sparing comments, my MERN skill set as the reference stack | Read the PDFs, proposed the phased plan and the stack (Node + Express + React, with SQLite instead of MongoDB), and recorded every decision with its alternatives (tracking.md §8) |
| Chose the project name, created the GitHub repository and connected the remote | Wrote the domain design, schema, generator, scheduler, derivations, anomaly injection, validator, exports, API, dashboard, tests and documentation |
| Decided when each phase started; reviewed and made every commit and push myself (the agent was told never to commit) | Ran tests, lint, the validator, the reproducibility check, a clean-clone run and a browser check before reporting each phase as done |

## Where AI accelerated the work

- Turning the brief into a complete traceability matrix (every requirement → phase → evidence).
- Volume work: the data dictionary for 21 tables, the 42-rule catalogue, the four export formats
  and the manifest, 223 tests, and the dashboard views.
- Running and re-running the full pipeline after every change, and reading the outputs.

## Where I relied heavily on AI

The implementation was written by the agent; I directed it phase by phase. The design was
proposed by the agent and is documented with its reasoning and alternatives in
[tracking.md §8](../tracking.md#8-decision-log) and [docs/design-notes.md](../docs/design-notes.md),
so that every choice can be checked and explained rather than taken on trust.

## How the output was checked

Every phase had to pass checks on real runs before it counted as done: the tests (223), lint and
format, the validator reading only the exported files (full profile: PASS, 100 / 100 anomalies
found, 0 / 40 boundary cases flagged), two-run reproducibility (48 / 48 files identical), a clean
clone running every documented command, and a browser check of the dashboard.

Those checks caught real mistakes in the AI's own work, which were fixed rather than hidden.
Some examples:

- A coverage-revision rule that produced impossible staffing demand (caught by a capacity test).
- A fairness rule that never took effect because raw ratios almost never tie (fixed with 20 %
  load bands; night-shift fairness 0.971 → 0.977).
- Random swap partners causing 36 % double-booking rejections (unrealistic; partners now check
  the roster first).
- A hand-calculated test fixture with a wrong expected value (the code was right; the fixture
  was corrected).
- Counting errors in the documentation (rule count, foreign-key count, row totals), corrected
  against the code and data.
- Slow database loads from unindexed foreign keys (16.7 s → 10.5 s) and a slow API query
  (758 ms → 20 ms).
- A clean clone on Windows failing the format check and producing a different SQLite checksum
  because Git converted line endings (fixed with `.gitattributes` and schema normalisation).

## What I personally reviewed, changed or validated

_To be completed by me before submitting: what I read and checked myself (for example a rule
traced from `docs/business-rules.md` to the code and to a record in the dashboard, numbers
recomputed by hand, commands I ran on my machine), and anything I changed or rejected._

## Limitations of this record

- Prompts are copied from Claude Code's local session transcripts. Answers I gave by clicking
  buttons or question dialogs are recorded as the text they sent.
- AI responses and the agent's tool calls (file edits, commands) are not reproduced here; they
  remain in the local transcripts. The commit history shows the result of each phase.
- The YottaFlex brief and PDFs I supplied in the first prompt are referenced, not copied.
