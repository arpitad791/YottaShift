# Metrics — profile `starter`, seed 20261022

Computed from the generated tables only (docs/business-rules.md §5). Machine-readable version:
`metrics.json`.

## M-01 Coverage fill
| Measure | Value |
| --- | --- |
| Requirement slots (shift × team × skill) | 1156 |
| Required headcount | 2765 |
| Filled by qualified staff | 2752 (99.53 %) |
| Filled by staff who clocked in | 2696 (97.50 %) |

## M-02 Coverage gaps
| Measure | Value |
| --- | --- |
| Short slots | 12 |
| Missing headcount | 13 |
| Missing headcount-hours | 104 |
| Missing headcount after absences | 69 |

By template:

| Template | Short slots | Missing headcount | Headcount-hours |
| --- | --- | --- | --- |
| A | 2 | 2 | 16 |
| B | 1 | 1 | 8 |
| C | 5 | 5 | 40 |
| G | 4 | 5 | 40 |

Teams with the most missing headcount-hours:

| Team | Name | Short slots | Headcount-hours |
| --- | --- | --- | --- |
| TEAM-008 | Security BLR 01 | 5 | 40 |
| TEAM-002 | Warehouse BLR 01 | 3 | 32 |
| TEAM-003 | Customer Support BLR 01 | 2 | 16 |
| TEAM-001 | Warehouse PUN 01 | 1 | 8 |
| TEAM-009 | Field Service PUN 01 | 1 | 8 |

## M-03 Overtime
| Measure | Value |
| --- | --- |
| Employee-weeks | 926 |
| Weeks with overtime | 173 |
| Total overtime hours | 396.22 |
| Overtime per week p50 / p90 / max (h) | 1.07 / 7.86 / 12 |
| Overtime cap breaches | 3 |
| Scheduled ÷ contracted hours | 80.17 % |

## M-04 Leave
| Value | Count |
| --- | --- |
| `APPROVED` | 93 |
| `REJECTED` | 66 |
| `WITHDRAWN` | 1 |

Approval rate of decided requests by type: ANNUAL 36.67 % · CASUAL 65.22 % · SICK 77.27 % · UNPAID 77.78 %

Rejections by reason:

| Value | Count |
| --- | --- |
| `INSUFFICIENT_BALANCE` | 57 |
| `INSUFFICIENT_NOTICE` | 3 |
| `OVERLAPS_EXISTING_LEAVE` | 3 |
| `TEAM_LEAVE_CAP_REACHED` | 3 |

## M-05 Swaps
| Value | Count |
| --- | --- |
| `APPLIED` | 23 |
| `CANCELLED` | 1 |
| `EXPIRED` | 4 |
| `REJECTED` | 32 |

Approval rate of manager decisions: 38.46 % · expiry rate: 6.67 % · manager response p50 / p90: 7.4 h / 25.05 h

Rejections by reason:

| Value | Count |
| --- | --- |
| `DOUBLE_BOOKING` | 8 |
| `INSUFFICIENT_NOTICE` | 4 |
| `NOT_SAME_TEAM` | 1 |
| `ON_APPROVED_LEAVE` | 2 |
| `REST_RULE_BREACH` | 4 |
| `SKILL_NOT_HELD` | 12 |
| `WEEKLY_HOURS_BREACH` | 1 |

## M-06 Attendance
| Measure | Value |
| --- | --- |
| Due assignments | 2759 |
| Punctuality (clock-in ≤ 5 min late) | 92.85 % |
| Late (> 5 min) | 7.15 % |
| Early leave (> 5 min) | 3.19 % |
| Extension (> 15 min) | 10.10 % |
| No-show | 2.17 % |
| Uncorrected missing clock-out | 0.25 % |
| Clock-outs entered manually by ops | 1.08 % |

## M-07 Reconciliation
| Measure | Value |
| --- | --- |
| Assignments with a complete record | 99.75 % |
| Assignments with no record at all | 0 |
| Scheduled hours (all due) | 22072 |
| Worked hours (present) | 21875.32 |
| Worked ÷ scheduled (present) | 101.58 % |

## M-08 Fairness
Population: schedulable members employed for the whole window, compared within their team (177 people). Jain's index, 1 = perfectly even.

| Dimension | Mean across teams (min) |
| --- | --- |
| Night shifts | 0.9114 (min 0.856, 4 teams) |
| Weekend shifts | 0.8986 (min 0.8536, 5 teams) |
| Holiday shifts | 0.8867 (min 0.8371, 5 teams) |
| Hours per contracted hour | 0.9923 (min 0.9863, 9 teams) |
