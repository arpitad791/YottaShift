# Prompt History

FAQ #6: "Include all prompts submitted to every AI tool you used. AI responses are optional. If a
tool cannot export prompts, keep a reasonable record and disclose the limitation."

**Tool:** Claude Code in the Claude desktop app (model: Claude Opus 5.5), used as a coding agent in
this repository. No other AI tool was used.

**Source:** every prompt below is copied verbatim from Claude Code's local session transcripts
for this project (two sessions; the second continued the first). Times are the transcript
timestamps converted to IST (+05:30).

| # | Time (IST) | Phase | Prompt |
| --- | --- | --- | --- |
| 1 | 2026-10-30 13:33 | 0 | _Attached: "YottaFlex AI Candidate Project-FAQ.pdf" and "YottaFlex AI Candidate Project Submission Guidelines.pdf"._<br>This is the project we have to build:<br>Problem statement<br>Read it carefully. Your build should cover every point below.<br>_[Pasted: the YottaFlex problem statement — business context, objective and scope, entities and IDs, the 10 generation steps, volumes (2,000 employees, 100 teams, 90 days, 5,000 leave requests), seed 20261022, edge cases, outputs, acceptance criteria, evaluation focus and public-data guidance. Not reproduced here because it is YottaFlex's material; README §1 summarises it.]_<br>Create proper structured phases to complete this project.<br>Read the both PDF files properly and note those points<br>About Prompt history inlclude only the prompts which can be showcased and not such prompts which says that everything is built from AI.<br>Create a README as they have instructed but also create a tracking.md file to track our phase based development. Create proper plan and put it in the tracking file. Do not miss out on any of the points. We have to build the solution locally. Create a proper folder structure wherever required with appropriate frame. You have the liberty to choose the teach stack however this is my skillset: MERN. Write appropriate comments wherever required during this project but dont flood them with unnecessary comments. Make sure to save all the instructions in memory file. That's it start working make no mistakes. |
| 2 | 2026-10-30 13:47 | 0 | suggest a good name for this project. I will do the git init and connect to github repo myself (Tell me the steps) and then I will ask you to start phase 1. |
| 3 | 2026-10-30 13:49 | 0 | what about YottaShift ? |
| 4 | 2026-10-30 13:54 | 1 | I chose YottaShift as the name. now start Phase 1. _(interrupted by me and re-sent as #5)_ |
| 5 | 2026-10-30 13:55 | 1 | I chose YottaShift as the name. now start Phase 1. DONT PUSH OR COMMIT ANYTHING BY YOURSELF ON GIT. |
| 6 | 2026-10-30 15:37 | 1 | Review first |
| 7 | 2026-10-30 15:39 | 1 | how to commit |
| 8 | 2026-10-30 15:48 | 2 | start Phase 2 |
| 9 | 2026-10-30 15:53 | 2 | _Answer in a question dialog ("Phase 1 isn't committed yet. How do you want to proceed?"):_ I'll commit now (Recommended) |
| 10 | 2026-10-30 16:07 | 3 | Start Phase 3 |
| 11 | 2026-10-30 16:36 | 4 | Start Phase 4 |
| 12 | 2026-10-30 16:58 | 5 | Start Phase 5 |
| 13 | 2026-10-30 17:12 | 6 | Start Phase 6 |
| 14 | 2026-10-30 22:40 | 7 | Start Phase 7 |
| 15 | 2026-10-30 22:55 | 8 | Start Phase 8 |
| 16 | 2026-10-30 23:13 | 9 | Start Phase 9 |
| 17 | 2026-10-30 23:33 | 10 | Committed, start Phase 10 |

_Prompts after #17 are added here as they are made._

## Notes on this record

- Several short prompts (#6, #8–#17) were sent with buttons that Claude Code offers at the end of
  a turn ("Review first", "Committed, start Phase 10"); they are recorded as the text they send.
- Between prompts the agent worked autonomously: it read and wrote files, ran commands and
  tests, and checked the dashboard in a built-in browser. Those tool calls and the AI responses
  are not reproduced (responses are optional per FAQ #6); they remain in the local session
  transcripts.
- Git commits and pushes were made by me, never by the AI (instruction in #5).
