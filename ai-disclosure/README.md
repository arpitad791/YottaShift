# AI Usage Disclosure

This disclosure is provided in accordance with Submission Guideline 03
("Use LLMs transparently") and FAQ items 5–6.

The project was developed with substantial assistance from an AI coding
agent. This document explains which tools were used, how the development
work was divided, where AI contributed most, and how the resulting
implementation was checked.

The accompanying [prompt-history.md](prompt-history.md) contains a
chronological record of the major development instructions.

---

## 1. Tools Used

| Tool | Model | Purpose |
| --- | --- | --- |
| Claude Code (Claude desktop application) | Claude Opus 5.5 | Project planning, architecture, code generation, implementation, debugging, testing, documentation, terminal commands and dashboard verification using the built-in browser |

No other AI tool was used during development.

## 2. How the Work Was Split

AI assistance was used extensively throughout the development process.
I provided the project requirements, made decisions about the direction
of the application, defined phase-wise development goals and reviewed
the outputs produced during implementation.

The AI coding agent handled most of the actual implementation work.

| My contributions | AI agent contributions |
| --- | --- |
| Provided the original problem statement, FAQ and submission guidelines | Analysed the requirements and translated them into an implementation plan |
| Explained my existing MERN background and local development requirements | Recommended the Node.js, Express, React and SQLite architecture and explained the trade-offs |
| Selected the project name YottaShift | Created the initial project structure, tooling and documentation |
| Defined the development sequence and instructed the agent to work phase by phase | Implemented the database schema, domain models, seeded generator, scheduling engine and business rules |
| Reviewed phase outputs and decided when to proceed to the next phase | Implemented derived metrics, anomaly injection, ground-truth generation and validation |
| Provided instructions for the API and dashboard requirements | Developed the Express API, React dashboard, filtering, exception management and related functionality |
| Managed Git operations, including commits and pushes | Assisted with testing, debugging, performance improvements, documentation and deployment configuration |
| Set requirements for the final submission and deployment | Prepared the README, design notes and deployment-related configuration |

The implementation was divided into phases, with follow-up instructions and corrections
as the project progressed.

## 3. Where AI Contributed Most

AI assistance was particularly significant in the following areas:

- **Requirement analysis:** Converting the original problem statement
  into development phases, requirements and acceptance criteria.

- **Database and domain design:** Designing the relational schema,
  21 database tables, entity relationships, lifecycle transitions
  and 42 numbered business rules.

- **Data generation:** Implementing deterministic synthetic workforce
  data generation for the required employees, teams, shifts, leave
  requests and related records.

- **Scheduling and business logic:** Implementing leave decisions,
  employee scheduling, skill matching, attendance, overtime and
  shift-swap workflows.

- **Anomaly detection:** Creating labelled anomalies, separate
  ground-truth records, validation checks and evaluation metrics.

- **Backend development:** Implementing the Express API, data access,
  filtering, pagination, exception reviews and leave evaluation.

- **Frontend development:** Building the React dashboard with
  workforce metrics, coverage views, employee information,
  leave requests, swaps and validation results.

- **Testing and debugging:** Generating unit and integration tests,
  identifying implementation issues, fixing incorrect assumptions
  and improving performance.

- **Documentation and deployment:** Preparing technical documentation,
  setup instructions, project configuration and deployment files.

AI was responsible for a substantial portion of the code written
in this project. Its contribution was not limited to suggestions
or autocomplete.

## 4. How AI-Generated Work Was Evaluated

The generated implementation was checked throughout development
rather than being accepted without verification.

The main verification activities included:

| Verification area | What was checked |
| --- | --- |
| Database integrity | Schema constraints, primary keys, foreign keys and relationships |
| Business rules | Whether generated decisions followed the documented rules |
| Synthetic data | Expected volumes, valid relationships and realistic distributions |
| Anomaly detection | Detection results compared against the separate ground-truth dataset |
| Reproducibility | Two independent generation runs compared using output checksums |
| Automated testing | Unit tests, integration tests and negative test cases |
| Code quality | ESLint and Prettier checks |
| API | Endpoint behaviour, request validation and error responses |
| Frontend | Dashboard views, interactions, responsive layouts and API connectivity |
| Deployment | Build configuration, environment settings and frontend-backend connectivity |

### Results recorded during development

The project documentation records the following results:

- Full-profile validation: PASS.
- Labelled anomaly detection: 100 out of 100 detected.
- Boundary cases: 0 out of 40 incorrectly flagged.
- Reproducibility: 48 out of 48 output files identical.
- Clean-clone verification: documented setup and execution commands
  were tested.
- Frontend verification: all seven dashboard views were checked
  in the browser.

The repository currently contains different test totals in its
documentation (223 and 225). The final test count should be confirmed
by running `npm test` against the submitted version.

## 5. Examples of Issues Identified During Verification

Testing and reviewing the generated implementation helped identify
several issues that required further changes.


1. **Coverage calculation:** A coverage-revision rule initially
   produced unrealistic staffing demand. A capacity test helped
   identify and correct the issue.

2. **Scheduling fairness:** An initial fairness calculation rarely
   affected scheduling decisions because of how employee workload
   ratios were compared. The implementation was adjusted to use
   workload bands.

3. **Shift swaps:** Randomly selecting swap partners resulted in
   unrealistic double-booking rejections. The selection logic was
   improved to check the partner's existing roster.

4. **Database performance:** Missing indexes affected database
   loading and API response times. Indexing improvements reduced
   the recorded database loading time from approximately 16.7
   seconds to 10.5 seconds.

5. **API performance:** A slow team coverage query was optimised,
   reducing its recorded response time from approximately 758 ms
   to 20 ms.

6. **Cross-platform compatibility:** A clean clone on Windows
   exposed line-ending inconsistencies that affected formatting
   checks and SQLite checksums. The issue was addressed using
   `.gitattributes` and schema normalisation.

These demonstrate why the generated implementation was
tested and revised instead of relying solely on the initial output.

## 6. What I Personally Reviewed and Validated

My role included defining requirements, directing the development
sequence, reviewing implementation outputs and deciding whether
the project was ready to move to the next phase.

---

**Project:** YottaShift  
**AI Tool:** Claude Code  
**Model:** Claude Opus 5.5  
**Development Period:** October 30 – November 1, 2026