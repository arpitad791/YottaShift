# Metrics — profile `full`, seed 20261022

Computed from the generated tables only (docs/business-rules.md §5). Machine-readable version:
`metrics.json`.

## M-01 Coverage fill
| Measure | Value |
| --- | --- |
| Requirement slots (shift × team × skill) | 46320 |
| Required headcount | 93932 |
| Filled by qualified staff | 93070 (99.08 %) |
| Filled by staff who clocked in | 91587 (97.50 %) |

## M-02 Coverage gaps
| Measure | Value |
| --- | --- |
| Short slots | 686 |
| Missing headcount | 862 |
| Missing headcount-hours | 6896 |
| Missing headcount after absences | 2345 |

By template:

| Template | Short slots | Missing headcount | Headcount-hours |
| --- | --- | --- | --- |
| A | 212 | 228 | 1824 |
| B | 194 | 228 | 1824 |
| C | 71 | 77 | 616 |
| G | 209 | 329 | 2632 |

Teams with the most missing headcount-hours:

| Team | Name | Short slots | Headcount-hours |
| --- | --- | --- | --- |
| TEAM-031 | Field Service BLR 04 | 68 | 1256 |
| TEAM-053 | Facilities CHN 03 | 64 | 792 |
| TEAM-097 | Security BLR 07 | 55 | 496 |
| TEAM-044 | Facilities CHN 02 | 44 | 480 |
| TEAM-070 | Facilities BLR 03 | 39 | 400 |

## M-03 Overtime
| Measure | Value |
| --- | --- |
| Employee-weeks | 25948 |
| Weeks with overtime | 7371 |
| Total overtime hours | 17591.69 |
| Overtime per week p50 / p90 / max (h) | 1.17 / 8 / 13.48 |
| Overtime cap breaches | 20 |
| Scheduled ÷ contracted hours | 83.41 % |

## M-04 Leave
| Value | Count |
| --- | --- |
| `APPROVED` | 3696 |
| `CANCELLED` | 89 |
| `REJECTED` | 1122 |
| `WITHDRAWN` | 93 |

Approval rate of decided requests by type: ANNUAL 63.38 % · CASUAL 79.13 % · SICK 91.49 % · UNPAID 81.22 %

Rejections by reason:

| Value | Count |
| --- | --- |
| `EMPLOYEE_NOT_ACTIVE` | 3 |
| `INSUFFICIENT_BALANCE` | 557 |
| `INSUFFICIENT_NOTICE` | 159 |
| `OVERLAPS_EXISTING_LEAVE` | 237 |
| `TEAM_LEAVE_CAP_REACHED` | 166 |

## M-05 Swaps
| Value | Count |
| --- | --- |
| `APPLIED` | 522 |
| `CANCELLED` | 70 |
| `EXPIRED` | 158 |
| `REJECTED` | 750 |

Approval rate of manager decisions: 40.10 % · expiry rate: 10.53 % · manager response p50 / p90: 7.78 h / 24.52 h

Rejections by reason:

| Value | Count |
| --- | --- |
| `ASSIGNMENT_CHANGED` | 3 |
| `CONSECUTIVE_DAYS_BREACH` | 10 |
| `DOUBLE_BOOKING` | 165 |
| `INSUFFICIENT_NOTICE` | 61 |
| `NOT_SAME_TEAM` | 33 |
| `ON_APPROVED_LEAVE` | 139 |
| `REST_RULE_BREACH` | 82 |
| `SKILL_NOT_HELD` | 239 |
| `WEEKLY_HOURS_BREACH` | 18 |

## M-06 Attendance
| Measure | Value |
| --- | --- |
| Due assignments | 93128 |
| Punctuality (clock-in ≤ 5 min late) | 93.11 % |
| Late (> 5 min) | 6.89 % |
| Early leave (> 5 min) | 3.06 % |
| Extension (> 15 min) | 9.38 % |
| No-show | 1.63 % |
| Uncorrected missing clock-out | 0.17 % |
| Clock-outs entered manually by ops | 1.01 % |

## M-07 Reconciliation
| Measure | Value |
| --- | --- |
| Assignments with a complete record | 99.83 % |
| Assignments with no record at all | 0 |
| Scheduled hours (all due) | 745024 |
| Worked hours (present) | 742120.87 |
| Worked ÷ scheduled (present) | 101.44 % |

## M-08 Fairness
Population: schedulable members employed for the whole window, compared within their team (1803 people). Jain's index, 1 = perfectly even.

| Dimension | Mean across teams (min) |
| --- | --- |
| Night shifts | 0.977 (min 0.8213, 39 teams) |
| Weekend shifts | 0.9483 (min 0.7748, 72 teams) |
| Holiday shifts | 0.9074 (min 0.7645, 72 teams) |
| Hours per contracted hour | 0.9938 (min 0.9594, 99 teams) |
