// Teams and employees. Generated together because each references the other: a team names
// its manager and HR partner, and every employee belongs to a team (deferred FKs in the schema).
//
// Team IDs: operational teams first, the Workforce Office last. Employee IDs: team by team,
// manager first, then leads, then members (docs/data-dictionary.md §2).

import { ENUMS } from '../../domain/constants.js';
import { allocate } from '../../lib/allocate.js';
import { addDays, daysBetween } from '../../lib/dates.js';
import { ids } from '../../lib/ids.js';
import { FIRST_NAMES, LAST_NAMES } from '../reference/names.js';

const OPERATIONAL_FUNCTIONS = ENUMS.TEAM_FUNCTION.filter((f) => f !== 'WORKFORCE_OFFICE');

/** One plan per team: generation inputs that later steps (skills, coverage) build on. */
function planTeams(config, profile, rng) {
  const operationalCount = profile.teams - 1;
  const functionCounts = allocate(
    operationalCount,
    OPERATIONAL_FUNCTIONS.map((f) => config.teamFunctions[f].share),
  );
  const functions = rng
    .fork('functions')
    .shuffle(OPERATIONAL_FUNCTIONS.flatMap((f, i) => Array(functionCounts[i]).fill(f)));

  const teamRng = rng.fork('teams');
  const { workforce, coverage } = config;
  const createdSpan = daysBetween(workforce.teamCreatedFrom, workforce.teamCreatedTo);
  const nameCounters = new Map();

  const plans = functions.map((teamFunction, index) => {
    const fn = config.teamFunctions[teamFunction];
    const pattern = teamRng.weighted(Object.entries(fn.patterns));
    const site = teamRng.weighted(Object.entries(config.sites));
    const skillCount = teamRng.int(
      coverage.skillsPerTeam.min,
      Math.min(coverage.skillsPerTeam.max, fn.skills.length),
    );
    // The first skill drawn becomes the team's main skill and gets the largest share of demand.
    const chosen = teamRng.shuffle(fn.skills.map((s) => s.name)).slice(0, skillCount);
    const weights = chosen.map((_, i) => teamRng.float(0.6, 1.4) * (i === 0 ? 1.6 : 1));
    const weightTotal = weights.reduce((a, b) => a + b, 0);
    const coverageSkills = chosen
      .map((name, i) => ({ name, share: weights[i] / weightTotal }))
      .sort((a, b) => b.share - a.share);
    const tier = teamRng.weighted(coverage.demandTiers.map((t) => [t, t.share]));

    const nameKey = `${teamFunction}/${site}`;
    nameCounters.set(nameKey, (nameCounters.get(nameKey) ?? 0) + 1);

    return {
      teamId: ids.team(index + 1),
      teamName: `${fn.label} ${site} ${String(nameCounters.get(nameKey)).padStart(2, '0')}`,
      teamFunction,
      site,
      pattern,
      createdOn: addDays(workforce.teamCreatedFrom, teamRng.int(0, createdSpan)),
      coverageSkills,
      demandRatio: Math.round(teamRng.float(tier.min, tier.max) * 1000) / 1000,
      sizeWeight:
        config.operatingPatterns[pattern].sizeWeight *
        Math.exp(teamRng.normal(0, workforce.teamSizeSpread)),
      isOffice: false,
    };
  });

  plans.push({
    teamId: ids.team(profile.teams),
    teamName: config.workforceOffice.label,
    teamFunction: 'WORKFORCE_OFFICE',
    site: config.workforceOffice.site,
    pattern: 'BUSINESS_HOURS',
    createdOn: workforce.teamCreatedFrom,
    coverageSkills: [],
    demandRatio: 0,
    isOffice: true,
  });
  return plans;
}

export function buildOrganisation({ config, profile, window, skillsByName, policyByType, rng }) {
  const { workforce } = config;
  const plans = planTeams(config, profile, rng);
  const operational = plans.filter((p) => !p.isOffice);
  const office = plans.at(-1);

  const hrPartnerCount = Math.ceil(operational.length / workforce.teamsPerHrPartner);
  const opsPartnerCount = Math.ceil(operational.length / workforce.teamsPerOpsPartner);
  const officeSize = 1 + hrPartnerCount + opsPartnerCount;
  const sizes = allocate(
    profile.employees - officeSize,
    operational.map((p) => p.sizeWeight),
    operational.map((p) => config.operatingPatterns[p.pattern].minTeamSize),
  );

  const people = rng.fork('employees');
  let employeeNumber = 0;
  const employees = [];

  const hireDate = (createdOn) => {
    // Tenure is roughly exponential: many recent hires, a long tail of veterans.
    const tenure = Math.min(
      workforce.maxTenureDays,
      Math.max(14, Math.round(-Math.log(1 - people.next()) * workforce.meanTenureDays)),
    );
    const date = addDays(window.startDate, -tenure);
    return date < createdOn ? createdOn : date;
  };

  const addEmployee = (
    plan,
    role,
    primarySkillName,
    { employmentType = 'FULL_TIME', hire, termination = null },
  ) => {
    employeeNumber += 1;
    const row = {
      employee_id: ids.employee(employeeNumber),
      full_name: `${people.pick(FIRST_NAMES)} ${people.pick(LAST_NAMES)}`,
      team_id: plan.teamId,
      employee_role: role,
      employment_type: employmentType,
      policy_id: policyByType.get(employmentType).policy_id,
      primary_skill_id: skillsByName.get(primarySkillName).skill_id,
      hire_date: hire,
      termination_date: termination,
      employment_status: termination ? 'TERMINATED' : 'ACTIVE',
    };
    employees.push(row);
    return row;
  };

  const managers = new Map();
  operational.forEach((plan, index) => {
    const size = sizes[index];
    const mainSkill = plan.coverageSkills[0].name;
    managers.set(
      plan.teamId,
      addEmployee(plan, 'MANAGER', mainSkill, { hire: hireDate(plan.createdOn) }),
    );

    const staff = size - 1;
    const leads = Math.max(1, Math.round(workforce.leadShare * staff));
    // Primary skills are split in proportion to demand, so supply matches each skill's share.
    const skillCounts = allocate(
      staff,
      plan.coverageSkills.map((s) => s.share),
    );
    const primarySkills = people.shuffle(
      plan.coverageSkills.flatMap((s, i) => Array(skillCounts[i]).fill(s.name)),
    );

    for (let i = 0; i < staff; i++) {
      const role = i < leads ? 'LEAD' : 'MEMBER';
      const isJoiner = role === 'MEMBER' && people.chance(workforce.joinerShare);
      const hire = isJoiner
        ? addDays(window.startDate, people.int(1, Math.max(1, window.days - 7)))
        : hireDate(plan.createdOn);
      const termination =
        !isJoiner && people.chance(workforce.leaverShare)
          ? addDays(window.startDate, people.int(7, window.days - 1))
          : null;
      const employmentType =
        role === 'MEMBER' && people.chance(workforce.partTimeShare) ? 'PART_TIME' : 'FULL_TIME';
      addEmployee(plan, role, primarySkills[i], { employmentType, hire, termination });
    }
  });

  const officeSkills = config.workforceOffice;
  const officeManager = addEmployee(office, 'MANAGER', officeSkills.managerSkill.name, {
    hire: hireDate(office.createdOn),
  });
  managers.set(office.teamId, officeManager);
  const hrPartners = Array.from({ length: hrPartnerCount }, () =>
    addEmployee(office, 'HR_PARTNER', officeSkills.hrPartnerSkill.name, {
      hire: hireDate(office.createdOn),
    }),
  );
  for (let i = 0; i < opsPartnerCount; i++) {
    addEmployee(office, 'OPS_PARTNER', officeSkills.opsPartnerSkill.name, {
      hire: hireDate(office.createdOn),
    });
  }

  const teams = plans.map((plan, index) => ({
    team_id: plan.teamId,
    team_name: plan.teamName,
    team_function: plan.teamFunction,
    site_code: plan.site,
    operating_pattern: plan.pattern,
    manager_employee_id: managers.get(plan.teamId).employee_id,
    hr_partner_employee_id: hrPartners[plan.isOffice ? 0 : index % hrPartners.length].employee_id,
    effective_from: plan.createdOn,
    effective_to: null,
  }));

  return { teams, employees, plans: new Map(plans.map((p) => [p.teamId, p])) };
}
