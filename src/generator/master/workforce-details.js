// Employee skills (bridge table) and leave entitlements, both derived from the organisation.

import { ENUMS } from '../../domain/constants.js';
import { addDays, daysBetween } from '../../lib/dates.js';

const SCHEDULABLE = new Set(ENUMS.SCHEDULABLE_ROLE);

const PROFICIENCY = {
  primaryMember: [
    ['BASIC', 0.2],
    ['INTERMEDIATE', 0.5],
    ['EXPERT', 0.3],
  ],
  primarySenior: [
    ['INTERMEDIATE', 0.4],
    ['EXPERT', 0.6],
  ],
  secondary: [
    ['BASIC', 0.5],
    ['INTERMEDIATE', 0.4],
    ['EXPERT', 0.1],
  ],
};

/** Days of the window during which the employee is employed (0 … window.days). */
export function employedDaysInWindow(employee, window) {
  const from = employee.hire_date > window.startDate ? employee.hire_date : window.startDate;
  const to =
    employee.termination_date && employee.termination_date < window.endDate
      ? employee.termination_date
      : window.endDate;
  return to < from ? 0 : daysBetween(from, to) + 1;
}

/**
 * Validity of one skill. Certifications: `certificationExpiringShare` of them lapse inside the
 * window, the rest stay valid past its end; valid_to = valid_from + validity − 1 in both cases,
 * and nothing is valid before the hire date.
 */
function validity(skill, employee, isPrimary, window, config, rng) {
  const hire = employee.hire_date;
  const days = skill.certification_validity_days;
  if (days === null) {
    if (isPrimary || hire >= window.startDate) return { valid_from: hire, valid_to: null };
    const learnedAfter = rng.int(0, Math.min(365, daysBetween(hire, window.startDate)));
    return { valid_from: addDays(hire, learnedAfter), valid_to: null };
  }
  const expiresInWindow = rng.chance(config.workforce.certificationExpiringShare);
  let validTo = expiresInWindow
    ? addDays(window.startDate, rng.int(0, window.days - 2))
    : addDays(window.endDate, rng.int(1, days - window.days));
  let validFrom = addDays(validTo, -(days - 1));
  if (validFrom < hire) {
    validFrom = hire;
    validTo = addDays(hire, days - 1);
  }
  return { valid_from: validFrom, valid_to: validTo };
}

export function buildEmployeeSkills({
  config,
  window,
  employees,
  plans,
  skillsByName,
  skillsById,
  rng,
}) {
  const rows = [];
  for (const employee of employees) {
    const plan = plans.get(employee.team_id);
    const held = [employee.primary_skill_id];

    if (SCHEDULABLE.has(employee.employee_role)) {
      for (const { name } of plan.coverageSkills) {
        const skillId = skillsByName.get(name).skill_id;
        if (!held.includes(skillId) && rng.chance(config.workforce.secondarySkillProbability)) {
          held.push(skillId);
        }
      }
      if (rng.chance(config.workforce.crossTeamSkillProbability)) {
        const pool = config.teamFunctions[plan.teamFunction].skills
          .map((s) => skillsByName.get(s.name).skill_id)
          .filter((id) => !held.includes(id));
        if (pool.length > 0) held.push(rng.pick(pool));
      }
    }

    const senior = employee.employee_role !== 'MEMBER';
    for (const skillId of [...held].sort()) {
      const isPrimary = skillId === employee.primary_skill_id;
      const proficiency = rng.weighted(
        isPrimary ? PROFICIENCY[senior ? 'primarySenior' : 'primaryMember'] : PROFICIENCY.secondary,
      );
      rows.push({
        employee_id: employee.employee_id,
        skill_id: skillId,
        proficiency,
        ...validity(skillsById.get(skillId), employee, isPrimary, window, config, rng),
      });
    }
  }
  return rows;
}

/**
 * Entitlements for schedulable employees only (they are the ones who request leave, A-04).
 * Configured per 90 days, scaled to the window length and to the days actually employed.
 */
export function buildLeaveEntitlements({ config, window, employees, rng }) {
  const rows = [];
  const scale = window.days / 90;
  for (const employee of employees) {
    if (!SCHEDULABLE.has(employee.employee_role)) continue;
    const entitlement = config.leaveEntitlementsPer90Days[employee.employment_type];
    const factor = (scale * employedDaysInWindow(employee, window)) / window.days;
    const days = {
      ANNUAL: rng.int(entitlement.annualMin, entitlement.annualMax),
      CASUAL: entitlement.casual,
      SICK: entitlement.sick,
    };
    for (const leaveType of ENUMS.ENTITLED_LEAVE_TYPE) {
      rows.push({
        employee_id: employee.employee_id,
        leave_type: leaveType,
        period_start: window.startDate,
        period_end: window.endDate,
        entitled_days: Math.round(days[leaveType] * factor),
      });
    }
  }
  return rows;
}
