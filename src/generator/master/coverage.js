// Coverage requirements (minimum staffing per team × template × skill × day type).
//
// Demand is sized from each team's real supply: weekly shift capacity of its schedulable
// members (contracted hours ÷ 8, reduced for expected leave and partial employment) times
// the team's demand ratio. Most teams get a ratio below 1 (coverable), some close to 1 and a
// few above it, so coverage gaps arise from the data instead of being injected.

import { ENUMS } from '../../domain/constants.js';
import { addDays } from '../../lib/dates.js';
import { ids } from '../../lib/ids.js';
import { employedDaysInWindow } from './workforce-details.js';

const SHIFT_HOURS = 8;
const SCHEDULABLE = new Set(ENUMS.SCHEDULABLE_ROLE);
const order = (list) => (value) => list.indexOf(value);
const templateOrder = order(ENUMS.TEMPLATE_CODE);
const dayTypeOrder = order(ENUMS.DAY_TYPE);

// Weekly occurrences per day type, used to turn per-day headcounts into weekly shifts.
// Holidays are rare and replace a weekday or weekend day, so they are left out.
const DAYS_PER_WEEK = { WEEKDAY: 5, WEEKEND: 2, HOLIDAY: 0 };

/** Weekly shifts the team can staff at contracted (or, with hoursKey, maximum) hours. */
export function weeklyShiftSupply(
  members,
  policiesById,
  window,
  expectedLeaveShare,
  hoursKey = 'contracted_weekly_hours',
) {
  let supply = 0;
  for (const employee of members) {
    const hours = policiesById.get(employee.policy_id)[hoursKey];
    supply += (hours / SHIFT_HOURS) * (employedDaysInWindow(employee, window) / window.days);
  }
  return supply * (1 - expectedLeaveShare);
}

export function buildCoverageRequirements({
  config,
  window,
  teams,
  employees,
  plans,
  skillsByName,
  policiesById,
  rng,
}) {
  const { coverage } = config;
  const membersByTeam = Map.groupBy(
    employees.filter((e) => SCHEDULABLE.has(e.employee_role)),
    (e) => e.team_id,
  );
  const canRevise = window.revisionDate <= window.endDate;
  const rows = [];

  for (const team of teams) {
    const plan = plans.get(team.team_id);
    if (plan.isOffice) continue;

    const pattern = config.operatingPatterns[plan.pattern];
    const dayTypes = ['WEEKDAY'];
    if (pattern.staffsWeekends) dayTypes.push('WEEKEND');
    if (pattern.staffsHolidays) dayTypes.push('HOLIDAY');
    const dayFactor = {
      WEEKDAY: 1,
      WEEKEND: coverage.weekendFactor,
      HOLIDAY: coverage.holidayFactor,
    };

    const supply = weeklyShiftSupply(
      membersByTeam.get(team.team_id) ?? [],
      policiesById,
      window,
      coverage.expectedLeaveShare,
    );
    // Weekly demand = Σ over templates of weight × (5 weekdays + 2 weekend days × weekend factor).
    const weekUnits = pattern.templates.reduce(
      (sum, code) =>
        sum +
        coverage.templateWeights[code] *
          (5 + (pattern.staffsWeekends ? 2 * coverage.weekendFactor : 0)),
      0,
    );
    const perUnit = (plan.demandRatio * supply) / weekUnits;

    /** Headcount per "template|skill|dayType" for a given demand level. */
    const headcounts = (unit) => {
      const result = new Map();
      for (const code of pattern.templates) {
        plan.coverageSkills.forEach(({ name, share }, skillIndex) => {
          for (const dayType of dayTypes) {
            let headcount = Math.round(
              unit * coverage.templateWeights[code] * share * dayFactor[dayType],
            );
            // Every template the team runs needs at least one person on its main skill on weekdays.
            if (skillIndex === 0 && dayType === 'WEEKDAY') headcount = Math.max(1, headcount);
            if (headcount >= 1)
              result.set(`${code}|${skillsByName.get(name).skill_id}|${dayType}`, headcount);
          }
        });
      }
      return result;
    };
    const weeklyDemand = (counts) =>
      [...counts].reduce((sum, [key, n]) => sum + n * DAYS_PER_WEEK[key.split('|')[2]], 0);
    const toRow = (key, headcount, from, to = null) => {
      const [code, skillId, dayType] = key.split('|');
      return {
        team_id: team.team_id,
        template_code: code,
        skill_id: skillId,
        day_type: dayType,
        min_headcount: headcount,
        effective_from: from,
        effective_to: to,
      };
    };

    const base = headcounts(perUnit);
    let revised = null;
    // A mid-window revision rescales the team's demand and recomputes every headcount with the
    // same formula. It is dropped if the new demand could not be staffed even at maximum hours.
    if (canRevise && rng.chance(coverage.revisionTeamShare)) {
      const factor = rng.float(coverage.revisionFactor.min, coverage.revisionFactor.max);
      const candidate = headcounts(perUnit * factor);
      const capacity = weeklyShiftSupply(
        membersByTeam.get(team.team_id) ?? [],
        policiesById,
        window,
        0,
        'max_weekly_scheduled_hours',
      );
      if (weeklyDemand(candidate) <= capacity) revised = candidate;
    }

    // Changed rows are closed the day before the revision and followed by a new row;
    // nothing is edited in place.
    const closeOn = addDays(window.revisionDate, -1);
    for (const [key, headcount] of base) {
      const next = revised?.get(key);
      if (!revised || next === headcount) rows.push(toRow(key, headcount, window.startDate));
      else {
        rows.push(toRow(key, headcount, window.startDate, closeOn));
        if (next !== undefined) rows.push(toRow(key, next, window.revisionDate));
      }
    }
    for (const [key, headcount] of revised ?? []) {
      if (!base.has(key)) rows.push(toRow(key, headcount, window.revisionDate));
    }
  }

  rows.sort(
    (a, b) =>
      a.team_id.localeCompare(b.team_id) ||
      templateOrder(a.template_code) - templateOrder(b.template_code) ||
      a.skill_id.localeCompare(b.skill_id) ||
      dayTypeOrder(a.day_type) - dayTypeOrder(b.day_type) ||
      a.effective_from.localeCompare(b.effective_from),
  );
  return rows.map((row, i) => ({ coverage_id: ids.coverageRequirement(i + 1), ...row }));
}
