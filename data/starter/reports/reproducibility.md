# Reproducibility — profile `starter`, seed 20261022

**Result: ✅ identical**

Produced by `npm run reproduce -- --profile starter`. The generator ran twice from scratch with the same seed and
configuration (config SHA-256 `a3142c3be2ffa529…`) into separate folders;
every output file was compared by row count, size and SHA-256.

| Comparison | Files | Differences |
| --- | --- | --- |
| Run A vs run B | 48 | 0 |
| Run A vs published `manifest.json` | 48 | 0 |



## Files (run A)

| File | Rows | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `csv/labor_policy.csv` | 2 | 262 | `97399200cbf4873f…` |
| `csv/skill.csv` | 30 | 1,250 | `4e0d2882ff60b137…` |
| `csv/team.csv` | 10 | 1,078 | `b0d9f1944d8a3679…` |
| `csv/employee.csv` | 200 | 17,862 | `6acb0d5877fa4d18…` |
| `csv/employee_skill.csv` | 323 | 13,976 | `5626e88d1812cd68…` |
| `csv/leave_entitlement.csv` | 564 | 23,373 | `1b005b7335f78a72…` |
| `csv/shift_template.csv` | 4 | 281 | `87f15212c955ffde…` |
| `csv/holiday_calendar.csv` | 3 | 203 | `2e88421a8b392a88…` |
| `csv/shift.csv` | 112 | 11,671 | `bd0b573c06373b2a…` |
| `csv/coverage_requirement.csv` | 115 | 6,084 | `2e0d7bd34a0182e9…` |
| `csv/leave_request.csv` | 160 | 26,539 | `d668e9ef40360e3d…` |
| `csv/leave_request_event.csv` | 320 | 36,384 | `c280dcbd559b18b9…` |
| `csv/shift_assignment.csv` | 2831 | 307,458 | `d6d53a8b1f0d83ee…` |
| `csv/swap_request.csv` | 60 | 11,702 | `4a3b294c17b929ad…` |
| `csv/swap_request_event.csv` | 140 | 15,874 | `6f40ec05fce51904…` |
| `csv/shift_assignment_event.csv` | 2903 | 298,774 | `db127acf35c72c67…` |
| `csv/attendance_event.csv` | 5451 | 691,257 | `2a6bf59af2011834…` |
| `csv/employee_week_summary.csv` | 926 | 38,978 | `71482963d1762be2…` |
| `csv/coverage_status.csv` | 1156 | 72,987 | `9b43dbe54fd5852e…` |
| `csv/leave_balance.csv` | 564 | 13,226 | `767c7ed76a1a5055…` |
| `csv/attendance_reconciliation.csv` | 2759 | 328,335 | `786813de444ab660…` |
| `json/labor_policy.json` | 2 | 494 | `8e76cae37269ad85…` |
| `json/skill.json` | 30 | 4,409 | `1880c352648d8315…` |
| `json/team.json` | 10 | 2,670 | `25f7a5a18f8a960c…` |
| `json/employee.json` | 200 | 53,121 | `4e3ca1db35c6aaa6…` |
| `json/employee_skill.json` | 323 | 38,940 | `08551440f3052972…` |
| `json/leave_entitlement.json` | 564 | 69,563 | `53dcdd66f71e71ab…` |
| `json/shift_template.json` | 4 | 769 | `d49bd27b8cee72c5…` |
| `json/holiday_calendar.json` | 3 | 363 | `58e7ed7c091b4844…` |
| `json/shift.json` | 112 | 24,563 | `20ac07bd8b98b6ae…` |
| `json/coverage_requirement.json` | 115 | 20,826 | `728993767037b63a…` |
| `json/leave_request.json` | 160 | 64,217 | `4eff103506ab8cc4…` |
| `json/leave_request_event.json` | 320 | 87,559 | `438f8b150f42db39…` |
| `json/shift_assignment.json` | 2831 | 751,624 | `f5077522501a50fa…` |
| `json/swap_request.json` | 60 | 29,880 | `3cc8aaadf9571fa7…` |
| `json/swap_request_event.json` | 140 | 36,904 | `95d7c3ffbbfbb03f…` |
| `json/shift_assignment_event.json` | 2903 | 829,482 | `afc664195e35b34d…` |
| `json/attendance_event.json` | 5451 | 1,486,939 | `88c36fcfcf8e0c26…` |
| `json/employee_week_summary.json` | 926 | 192,556 | `8653e12d7edd4495…` |
| `json/coverage_status.json` | 1156 | 297,095 | `c6e99ee722bfd1ed…` |
| `json/leave_balance.json` | 564 | 59,975 | `f47cb202c3c6a03b…` |
| `json/attendance_reconciliation.json` | 2759 | 850,935 | `b01e85076cff245d…` |
| `sql/seed.sql` | 18633 | 2,467,291 | `52c67cebb3119d22…` |
| `sqlite/yottashift.db` | 18633 | 3,555,328 | `fbdb8a4a70abdd96…` |
| `ground_truth/ground_truth.csv` | 21 | 3,882 | `8eaa29e76674f26e…` |
| `ground_truth/ground_truth.json` | 21 | 8,711 | `6419cb9eb2cd9e0d…` |
| `reports/metrics.json` | — | 8,352 | `7c6ee5a9391afc7e…` |
| `reports/metrics.md` | — | 3,292 | `cc00768019187056…` |
