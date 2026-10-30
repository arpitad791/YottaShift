# Reproducibility — profile `full`, seed 20261022

**Result: ✅ identical**

Produced by `npm run reproduce -- --profile full`. The generator ran twice from scratch with the same seed and
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
| `csv/team.csv` | 100 | 9,551 | `69b64fec864c927d…` |
| `csv/employee.csv` | 2000 | 177,097 | `46b947e323b70cc9…` |
| `csv/employee_skill.csv` | 3179 | 135,951 | `1a511a1c279efb71…` |
| `csv/leave_entitlement.csv` | 5658 | 234,785 | `9b16b5f5992752e9…` |
| `csv/shift_template.csv` | 4 | 281 | `87f15212c955ffde…` |
| `csv/holiday_calendar.csv` | 5 | 286 | `4605caf1ead84b5a…` |
| `csv/shift.csv` | 360 | 37,079 | `e85a93a6a440032a…` |
| `csv/coverage_requirement.csv` | 1490 | 77,744 | `10baeb2ac4730824…` |
| `csv/leave_request.csv` | 5000 | 820,089 | `c0bf988e4006ca91…` |
| `csv/leave_request_event.csv` | 10089 | 1,145,654 | `70cf8da4f862a31a…` |
| `csv/shift_assignment.csv` | 95970 | 10,419,710 | `bad3ffe6713f746b…` |
| `csv/swap_request.csv` | 1500 | 287,580 | `cdb39001f3689ea0…` |
| `csv/swap_request_event.csv` | 3502 | 395,758 | `bfa4e96fda55f612…` |
| `csv/shift_assignment_event.csv` | 98812 | 10,181,726 | `2b338df41c960c42…` |
| `csv/attendance_event.csv` | 184575 | 23,403,530 | `e1df36bc03dee6b6…` |
| `csv/employee_week_summary.csv` | 25948 | 1,079,600 | `1b397ec12036bfb3…` |
| `csv/coverage_status.csv` | 46320 | 2,918,319 | `38d5c99e5c919275…` |
| `csv/leave_balance.csv` | 5658 | 133,601 | `da805fb96715fb70…` |
| `csv/attendance_reconciliation.csv` | 93128 | 11,106,897 | `c5925079203f591f…` |
| `json/labor_policy.json` | 2 | 494 | `8e76cae37269ad85…` |
| `json/skill.json` | 30 | 4,409 | `1880c352648d8315…` |
| `json/team.json` | 100 | 26,623 | `1866cf32be3b9ef6…` |
| `json/employee.json` | 2000 | 530,890 | `b1805975b095f192…` |
| `json/employee_skill.json` | 3179 | 382,405 | `cd4b702b8cf88443…` |
| `json/leave_entitlement.json` | 5658 | 698,683 | `5294b333f625bd24…` |
| `json/shift_template.json` | 4 | 769 | `d49bd27b8cee72c5…` |
| `json/holiday_calendar.json` | 5 | 584 | `4f4131f33e977cd7…` |
| `json/shift.json` | 360 | 78,723 | `9ca3071f9684d618…` |
| `json/coverage_requirement.json` | 1490 | 269,829 | `4809dd365ce33206…` |
| `json/leave_request.json` | 5000 | 2,003,729 | `7a948d2d0224cc18…` |
| `json/leave_request_event.json` | 10089 | 2,762,404 | `9fdf020202a2e1d1…` |
| `json/shift_assignment.json` | 95970 | 25,480,641 | `c4de2ef8ae7816ed…` |
| `json/swap_request.json` | 1500 | 747,688 | `f944ff81b900527f…` |
| `json/swap_request_event.json` | 3502 | 924,310 | `7b8b1afe0ccb5e6b…` |
| `json/shift_assignment_event.json` | 98812 | 28,248,111 | `5c6cdd78f484f873…` |
| `json/attendance_event.json` | 184575 | 50,349,520 | `84f8061afb58fd48…` |
| `json/employee_week_summary.json` | 25948 | 5,386,830 | `dafcb209b0170c54…` |
| `json/coverage_status.json` | 46320 | 11,904,243 | `8d28bb5093272827…` |
| `json/leave_balance.json` | 5658 | 603,152 | `760c54c50c3fcfdc…` |
| `json/attendance_reconciliation.json` | 93128 | 28,740,600 | `3dc90fc218868bd1…` |
| `sql/seed.sql` | 583330 | 80,286,784 | `c11a2e4d27c97444…` |
| `sqlite/yottashift.db` | 583330 | 107,753,472 | `027a12f7135306ff…` |
| `ground_truth/ground_truth.csv` | 140 | 24,748 | `153e1aeafa79f7c3…` |
| `ground_truth/ground_truth.json` | 140 | 57,661 | `f5a75a5456904e4c…` |
| `reports/metrics.json` | — | 35,771 | `4790c5798ce2f688…` |
| `reports/metrics.md` | — | 3,485 | `098a7032b8ff9612…` |
