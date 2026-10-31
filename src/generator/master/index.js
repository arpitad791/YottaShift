import { createRng } from '../../lib/rng.js';
import { buildWindow, resolveProfile } from '../config.js';
import { buildCoverageRequirements } from './coverage.js';
import { buildOrganisation } from './organisation.js';
import {
  buildHolidays,
  buildLaborPolicies,
  buildShiftTemplates,
  buildShifts,
  buildSkills,
} from './reference-tables.js';
import { buildEmployeeSkills, buildLeaveEntitlements } from './workforce-details.js';

export function generateMasterData(config, profileName) {
  const profile = resolveProfile(config, profileName);
  const window = buildWindow(config.window.startDate, profile.days);
  const rng = createRng(config.seed, 'master');

  const laborPolicies = buildLaborPolicies(config, window);
  const policyByType = new Map(laborPolicies.map((p) => [p.employment_type, p]));
  const policiesById = new Map(laborPolicies.map((p) => [p.policy_id, p]));
  const { rows: skills, byName: skillsByName } = buildSkills(config);
  const skillsById = new Map(skills.map((s) => [s.skill_id, s]));

  const { teams, employees, plans } = buildOrganisation({
    config,
    profile,
    window,
    skillsByName,
    policyByType,
    rng: rng.fork('organisation'),
  });
  const employeeSkills = buildEmployeeSkills({
    config,
    window,
    employees,
    plans,
    skillsByName,
    skillsById,
    rng: rng.fork('employee-skills'),
  });
  const leaveEntitlements = buildLeaveEntitlements({
    config,
    window,
    employees,
    rng: rng.fork('leave-entitlements'),
  });
  const shiftTemplates = buildShiftTemplates(config);
  const holidays = buildHolidays(config, window);
  const shifts = buildShifts(window, shiftTemplates, holidays);
  const coverageRequirements = buildCoverageRequirements({
    config,
    window,
    teams,
    employees,
    plans,
    skillsByName,
    policiesById,
    rng: rng.fork('coverage'),
  });

  return {
    profileName,
    profile,
    window,
    tables: [
      ['labor_policy', laborPolicies],
      ['skill', skills],
      ['team', teams],
      ['employee', employees],
      ['employee_skill', employeeSkills],
      ['leave_entitlement', leaveEntitlements],
      ['shift_template', shiftTemplates],
      ['holiday_calendar', holidays],
      ['shift', shifts],
      ['coverage_requirement', coverageRequirements],
    ],
  };
}
