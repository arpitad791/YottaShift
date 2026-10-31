import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ENUMS } from '../domain/constants.js';
import { addDays, dateRange, nextIsoWeekday, toTimestamp } from '../lib/dates.js';

export const CONFIG_PATH = fileURLToPath(
  new URL('../../config/generator.config.json', import.meta.url),
);

export class ConfigError extends Error {}

const fail = (path, message) => {
  throw new ConfigError(`config.${path}: ${message}`);
};

function object(value, path, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail(path, 'must be an object');
  if (keys) {
    for (const key of keys) if (!(key in value)) fail(path, `missing key "${key}"`);
    for (const key of Object.keys(value))
      if (!keys.includes(key)) fail(path, `unknown key "${key}"`);
  }
  return value;
}

function number(value, path, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a number');
  if (integer && !Number.isInteger(value)) fail(path, 'must be an integer');
  if (value < min || value > max) fail(path, `must be between ${min} and ${max}`);
  return value;
}

function text(value, path) {
  if (typeof value !== 'string' || value.trim() === '') fail(path, 'must be a non-empty string');
  return value;
}

function bool(value, path) {
  if (typeof value !== 'boolean') fail(path, 'must be true or false');
  return value;
}

function date(value, path) {
  text(value, path);
  try {
    addDays(value, 0);
  } catch {
    fail(path, `"${value}" is not a real YYYY-MM-DD date`);
  }
  return value;
}

function oneOf(value, allowed, path) {
  if (!allowed.includes(value)) fail(path, `"${value}" is not one of ${allowed.join(', ')}`);
  return value;
}

function shares(value, path, allowed, { exactKeys = false } = {}) {
  object(value, path, exactKeys ? allowed : undefined);
  let total = 0;
  for (const [key, weight] of Object.entries(value)) {
    oneOf(key, allowed, `${path} key`);
    total += number(weight, `${path}.${key}`, { min: 0, max: 1 });
  }
  if (Math.abs(total - 1) > 1e-9) fail(path, `weights must sum to 1 (got ${total})`);
  return value;
}

function skill(value, path, minValidityDays) {
  object(value, path, ['name', 'category', 'certificationValidityDays']);
  text(value.name, `${path}.name`);
  oneOf(value.category, ENUMS.SKILL_CATEGORY, `${path}.category`);
  if (value.certificationValidityDays !== null) {
    // Validity must exceed the longest window so the expiry logic can place dates on both sides.
    number(value.certificationValidityDays, `${path}.certificationValidityDays`, {
      integer: true,
      min: minValidityDays,
    });
  }
}

export function validateConfig(config) {
  object(config, 'root', [
    'seed',
    'window',
    'profiles',
    'laborPolicies',
    'workforce',
    'sites',
    'operatingPatterns',
    'teamFunctions',
    'workforceOffice',
    'shiftTemplates',
    'templatesEffectiveFrom',
    'holidays',
    'coverage',
    'leaveEntitlementsPer90Days',
    'leaveBehaviour',
    'swapBehaviour',
    'attendanceBehaviour',
  ]);
  number(config.seed, 'seed', { integer: true, min: 0, max: 2 ** 32 - 1 });
  object(config.window, 'window', ['startDate']);
  date(config.window.startDate, 'window.startDate');

  object(config.profiles, 'profiles');
  if (Object.keys(config.profiles).length === 0) fail('profiles', 'needs at least one profile');
  let longestWindow = 0;
  for (const [name, profile] of Object.entries(config.profiles)) {
    const path = `profiles.${name}`;
    object(profile, path, [
      'teams',
      'employees',
      'days',
      'leaveRequests',
      'swapRequests',
      'anomaliesPerType',
      'boundaryCasesPerType',
    ]);
    number(profile.teams, `${path}.teams`, { integer: true, min: 2, max: 999 });
    number(profile.employees, `${path}.employees`, { integer: true, min: 10, max: 999_999 });
    number(profile.days, `${path}.days`, { integer: true, min: 7, max: 366 });
    number(profile.leaveRequests, `${path}.leaveRequests`, { integer: true, min: 0 });
    number(profile.swapRequests, `${path}.swapRequests`, { integer: true, min: 0 });
    number(profile.anomaliesPerType, `${path}.anomaliesPerType`, {
      integer: true,
      min: 0,
      max: 500,
    });
    number(profile.boundaryCasesPerType, `${path}.boundaryCasesPerType`, {
      integer: true,
      min: 0,
      max: 500,
    });
    longestWindow = Math.max(longestWindow, profile.days);
  }

  if (!Array.isArray(config.laborPolicies)) fail('laborPolicies', 'must be an array');
  const policyTypes = config.laborPolicies.map((policy, i) => {
    const path = `laborPolicies[${i}]`;
    object(policy, path, [
      'code',
      'employmentType',
      'contractedWeeklyHours',
      'maxWeeklyScheduledHours',
      'weeklyOvertimeCapHours',
      'minRestHours',
      'maxConsecutiveDays',
    ]);
    if (!/^[A-Z]{2}$/.test(policy.code)) fail(`${path}.code`, 'must be two capital letters');
    number(policy.contractedWeeklyHours, `${path}.contractedWeeklyHours`, { min: 1, max: 48 });
    number(policy.maxWeeklyScheduledHours, `${path}.maxWeeklyScheduledHours`, {
      min: policy.contractedWeeklyHours,
      max: 60,
    });
    number(policy.weeklyOvertimeCapHours, `${path}.weeklyOvertimeCapHours`, { min: 0, max: 30 });
    number(policy.minRestHours, `${path}.minRestHours`, { min: 1, max: 24 });
    number(policy.maxConsecutiveDays, `${path}.maxConsecutiveDays`, {
      integer: true,
      min: 1,
      max: 7,
    });
    return oneOf(policy.employmentType, ENUMS.EMPLOYMENT_TYPE, `${path}.employmentType`);
  });
  if ([...policyTypes].sort().join() !== [...ENUMS.EMPLOYMENT_TYPE].sort().join()) {
    fail('laborPolicies', 'needs exactly one policy per employment type');
  }

  const workforce = object(config.workforce, 'workforce', [
    'partTimeShare',
    'leadShare',
    'teamsPerHrPartner',
    'teamsPerOpsPartner',
    'joinerShare',
    'leaverShare',
    'meanTenureDays',
    'maxTenureDays',
    'teamCreatedFrom',
    'teamCreatedTo',
    'secondarySkillProbability',
    'crossTeamSkillProbability',
    'certificationExpiringShare',
    'teamSizeSpread',
  ]);
  for (const key of [
    'partTimeShare',
    'leadShare',
    'joinerShare',
    'leaverShare',
    'secondarySkillProbability',
    'crossTeamSkillProbability',
    'certificationExpiringShare',
  ]) {
    number(workforce[key], `workforce.${key}`, { min: 0, max: 1 });
  }
  number(workforce.teamsPerHrPartner, 'workforce.teamsPerHrPartner', { integer: true, min: 1 });
  number(workforce.teamsPerOpsPartner, 'workforce.teamsPerOpsPartner', { integer: true, min: 1 });
  number(workforce.meanTenureDays, 'workforce.meanTenureDays', { min: 30 });
  number(workforce.maxTenureDays, 'workforce.maxTenureDays', { integer: true, min: 60 });
  number(workforce.teamSizeSpread, 'workforce.teamSizeSpread', { min: 0, max: 1 });
  date(workforce.teamCreatedFrom, 'workforce.teamCreatedFrom');
  date(workforce.teamCreatedTo, 'workforce.teamCreatedTo');
  if (!(
    workforce.teamCreatedFrom <= workforce.teamCreatedTo &&
    workforce.teamCreatedTo < config.window.startDate
  )) {
    fail('workforce', 'teamCreatedFrom <= teamCreatedTo < window.startDate is required');
  }

  shares(config.sites, 'sites', ENUMS.SITE_CODE);

  if (!Array.isArray(config.shiftTemplates)) fail('shiftTemplates', 'must be an array');
  const templateCodes = config.shiftTemplates.map((template, i) => {
    const path = `shiftTemplates[${i}]`;
    object(template, path, ['code', 'name', 'startTime', 'endTime', 'isNight']);
    text(template.name, `${path}.name`);
    for (const key of ['startTime', 'endTime']) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(template[key])) fail(`${path}.${key}`, 'must be HH:MM');
    }
    if (template.startTime === template.endTime) fail(path, 'start and end must differ');
    bool(template.isNight, `${path}.isNight`);
    return oneOf(template.code, ENUMS.TEMPLATE_CODE, `${path}.code`);
  });
  if ([...templateCodes].sort().join() !== [...ENUMS.TEMPLATE_CODE].sort().join()) {
    fail('shiftTemplates', `needs exactly the templates ${ENUMS.TEMPLATE_CODE.join(', ')}`);
  }
  date(config.templatesEffectiveFrom, 'templatesEffectiveFrom');

  const patternNames = ENUMS.OPERATING_PATTERN;
  object(config.operatingPatterns, 'operatingPatterns', [...patternNames]);
  for (const name of patternNames) {
    const path = `operatingPatterns.${name}`;
    const pattern = object(config.operatingPatterns[name], path, [
      'templates',
      'staffsWeekends',
      'staffsHolidays',
      'sizeWeight',
      'minTeamSize',
    ]);
    if (!Array.isArray(pattern.templates) || pattern.templates.length === 0) {
      fail(`${path}.templates`, 'must be a non-empty array');
    }
    pattern.templates.forEach((code, i) => oneOf(code, templateCodes, `${path}.templates[${i}]`));
    bool(pattern.staffsWeekends, `${path}.staffsWeekends`);
    bool(pattern.staffsHolidays, `${path}.staffsHolidays`);
    number(pattern.sizeWeight, `${path}.sizeWeight`, { min: 0.1, max: 10 });
    number(pattern.minTeamSize, `${path}.minTeamSize`, { integer: true, min: 3 });
  }

  const coverage = object(config.coverage, 'coverage', [
    'templateWeights',
    'weekendFactor',
    'holidayFactor',
    'expectedLeaveShare',
    'demandTiers',
    'skillsPerTeam',
    'revisionTeamShare',
    'revisionFactor',
  ]);
  object(coverage.templateWeights, 'coverage.templateWeights', [...ENUMS.TEMPLATE_CODE]);
  for (const code of ENUMS.TEMPLATE_CODE) {
    number(coverage.templateWeights[code], `coverage.templateWeights.${code}`, {
      min: 0.1,
      max: 5,
    });
  }
  number(coverage.weekendFactor, 'coverage.weekendFactor', { min: 0.1, max: 2 });
  number(coverage.holidayFactor, 'coverage.holidayFactor', { min: 0.1, max: 2 });
  number(coverage.expectedLeaveShare, 'coverage.expectedLeaveShare', { min: 0, max: 0.5 });
  if (!Array.isArray(coverage.demandTiers) || coverage.demandTiers.length === 0) {
    fail('coverage.demandTiers', 'must be a non-empty array');
  }
  let tierTotal = 0;
  coverage.demandTiers.forEach((tier, i) => {
    const path = `coverage.demandTiers[${i}]`;
    object(tier, path, ['share', 'min', 'max']);
    tierTotal += number(tier.share, `${path}.share`, { min: 0, max: 1 });
    number(tier.min, `${path}.min`, { min: 0.1, max: 3 });
    number(tier.max, `${path}.max`, { min: tier.min, max: 3 });
  });
  if (Math.abs(tierTotal - 1) > 1e-9) fail('coverage.demandTiers', 'shares must sum to 1');
  object(coverage.skillsPerTeam, 'coverage.skillsPerTeam', ['min', 'max']);
  number(coverage.skillsPerTeam.min, 'coverage.skillsPerTeam.min', { integer: true, min: 1 });
  number(coverage.skillsPerTeam.max, 'coverage.skillsPerTeam.max', {
    integer: true,
    min: coverage.skillsPerTeam.min,
  });
  number(coverage.revisionTeamShare, 'coverage.revisionTeamShare', { min: 0, max: 1 });
  object(coverage.revisionFactor, 'coverage.revisionFactor', ['min', 'max']);
  number(coverage.revisionFactor.min, 'coverage.revisionFactor.min', { min: 0.1, max: 3 });
  number(coverage.revisionFactor.max, 'coverage.revisionFactor.max', {
    min: coverage.revisionFactor.min,
    max: 3,
  });

  const operationalFunctions = ENUMS.TEAM_FUNCTION.filter((f) => f !== 'WORKFORCE_OFFICE');
  object(config.teamFunctions, 'teamFunctions', operationalFunctions);
  let functionTotal = 0;
  const skillNames = [];
  for (const name of operationalFunctions) {
    const path = `teamFunctions.${name}`;
    const fn = object(config.teamFunctions[name], path, ['label', 'share', 'patterns', 'skills']);
    text(fn.label, `${path}.label`);
    functionTotal += number(fn.share, `${path}.share`, { min: 0, max: 1 });
    shares(fn.patterns, `${path}.patterns`, patternNames);
    if (!Array.isArray(fn.skills) || fn.skills.length < coverage.skillsPerTeam.max) {
      fail(
        `${path}.skills`,
        `needs at least coverage.skillsPerTeam.max (${coverage.skillsPerTeam.max}) skills`,
      );
    }
    fn.skills.forEach((s, i) => {
      skill(s, `${path}.skills[${i}]`, longestWindow + 1);
      skillNames.push(s.name);
    });
  }
  if (Math.abs(functionTotal - 1) > 1e-9) fail('teamFunctions', 'shares must sum to 1');

  const office = object(config.workforceOffice, 'workforceOffice', [
    'label',
    'site',
    'managerSkill',
    'hrPartnerSkill',
    'opsPartnerSkill',
  ]);
  text(office.label, 'workforceOffice.label');
  oneOf(office.site, ENUMS.SITE_CODE, 'workforceOffice.site');
  for (const key of ['managerSkill', 'hrPartnerSkill', 'opsPartnerSkill']) {
    skill(office[key], `workforceOffice.${key}`, longestWindow + 1);
    skillNames.push(office[key].name);
  }
  const duplicate = skillNames.find((name, i) => skillNames.indexOf(name) !== i);
  if (duplicate) fail('teamFunctions', `skill "${duplicate}" is listed twice`);

  if (!Array.isArray(config.holidays)) fail('holidays', 'must be an array');
  const holidayDates = config.holidays.map((holiday, i) => {
    const path = `holidays[${i}]`;
    object(holiday, path, ['date', 'name', 'type']);
    text(holiday.name, `${path}.name`);
    oneOf(holiday.type, ENUMS.HOLIDAY_TYPE, `${path}.type`);
    return date(holiday.date, `${path}.date`);
  });
  if (new Set(holidayDates).size !== holidayDates.length) fail('holidays', 'dates must be unique');

  object(config.leaveEntitlementsPer90Days, 'leaveEntitlementsPer90Days', [
    ...ENUMS.EMPLOYMENT_TYPE,
  ]);
  for (const type of ENUMS.EMPLOYMENT_TYPE) {
    const path = `leaveEntitlementsPer90Days.${type}`;
    const entry = object(config.leaveEntitlementsPer90Days[type], path, [
      'annualMin',
      'annualMax',
      'casual',
      'sick',
    ]);
    number(entry.annualMin, `${path}.annualMin`, { integer: true, min: 0, max: 60 });
    number(entry.annualMax, `${path}.annualMax`, { integer: true, min: entry.annualMin, max: 60 });
    number(entry.casual, `${path}.casual`, { integer: true, min: 0, max: 60 });
    number(entry.sick, `${path}.sick`, { integer: true, min: 0, max: 60 });
  }

  validateBehaviour(config);
  return config;
}

function range(value, path, bounds) {
  object(value, path, ['min', 'max']);
  number(value.min, `${path}.min`, bounds);
  number(value.max, `${path}.max`, { ...bounds, min: value.min });
  return value;
}

const probability = (value, path) => number(value, path, { min: 0, max: 1 });

function validateBehaviour(config) {
  const discretionary = ENUMS.LEAVE_TYPE.filter((t) => t !== 'SICK');
  const leave = object(config.leaveBehaviour, 'leaveBehaviour', [
    'typeShares',
    'durationDays',
    'noticeDays',
    'shortNoticeShare',
    'decisionDelayHours',
    'withdrawShare',
    'cancelShare',
    'requesterSpread',
  ]);
  shares(leave.typeShares, 'leaveBehaviour.typeShares', ENUMS.LEAVE_TYPE, { exactKeys: true });
  object(leave.durationDays, 'leaveBehaviour.durationDays', [...ENUMS.LEAVE_TYPE]);
  for (const type of ENUMS.LEAVE_TYPE) {
    const path = `leaveBehaviour.durationDays.${type}`;
    const durations = Object.keys(object(leave.durationDays[type], path));
    if (!durations.every((d) => /^[1-9]\d?$/.test(d))) fail(path, 'keys must be day counts 1–99');
    shares(leave.durationDays[type], path, durations);
  }
  object(leave.noticeDays, 'leaveBehaviour.noticeDays', discretionary);
  object(leave.shortNoticeShare, 'leaveBehaviour.shortNoticeShare', discretionary);
  for (const type of discretionary) {
    const notice = range(leave.noticeDays[type], `leaveBehaviour.noticeDays.${type}`, {
      integer: true,
      min: 1,
      max: 120,
    });
    // Short notice draws from 1 … minimum-1 days, so it needs a minimum above 1 to exist.
    const share = probability(
      leave.shortNoticeShare[type],
      `leaveBehaviour.shortNoticeShare.${type}`,
    );
    if (share > 0 && notice.min < 2)
      fail(`leaveBehaviour.shortNoticeShare.${type}`, 'needs noticeDays.min >= 2');
  }
  range(leave.decisionDelayHours, 'leaveBehaviour.decisionDelayHours', { min: 0.1, max: 168 });
  probability(leave.withdrawShare, 'leaveBehaviour.withdrawShare');
  probability(leave.cancelShare, 'leaveBehaviour.cancelShare');
  number(leave.requesterSpread, 'leaveBehaviour.requesterSpread', { min: 0, max: 2 });

  const swap = object(config.swapBehaviour, 'swapBehaviour', [
    'swapShare',
    'horizonDays',
    'minLeadHours',
    'sameSkillPreference',
    'freeCounterpartPreference',
    'crossTeamShare',
    'counterpartWindowDays',
    'meanResponseHours',
    'maxResponseHours',
    'cancelShare',
    'applyDelayMinutes',
  ]);
  for (const key of [
    'swapShare',
    'sameSkillPreference',
    'freeCounterpartPreference',
    'crossTeamShare',
    'cancelShare',
  ]) {
    probability(swap[key], `swapBehaviour.${key}`);
  }
  number(swap.horizonDays, 'swapBehaviour.horizonDays', { integer: true, min: 1, max: 60 });
  number(swap.minLeadHours, 'swapBehaviour.minLeadHours', { min: 0.5, max: 48 });
  number(swap.counterpartWindowDays, 'swapBehaviour.counterpartWindowDays', {
    integer: true,
    min: 0,
    max: 30,
  });
  number(swap.meanResponseHours, 'swapBehaviour.meanResponseHours', { min: 0.1, max: 168 });
  number(swap.maxResponseHours, 'swapBehaviour.maxResponseHours', {
    min: swap.meanResponseHours,
    max: 336,
  });
  range(swap.applyDelayMinutes, 'swapBehaviour.applyDelayMinutes', {
    integer: true,
    min: 0,
    max: 60,
  });

  const attendance = object(config.attendanceBehaviour, 'attendanceBehaviour', [
    'noShowShare',
    'lateShare',
    'lateMeanMinutes',
    'maxLateMinutes',
    'earlyLeaveShare',
    'earlyLeaveMinutes',
    'extensionShare',
    'extensionMinutes',
    'missingClockOutShare',
    'manualCorrectionShare',
    'mobileShare',
  ]);
  for (const key of [
    'noShowShare',
    'lateShare',
    'earlyLeaveShare',
    'extensionShare',
    'missingClockOutShare',
    'manualCorrectionShare',
    'mobileShare',
  ]) {
    probability(attendance[key], `attendanceBehaviour.${key}`);
  }
  // Late arrival plus early leave must still leave a positive worked time on an 8-hour shift.
  number(attendance.lateMeanMinutes, 'attendanceBehaviour.lateMeanMinutes', { min: 1, max: 120 });
  number(attendance.maxLateMinutes, 'attendanceBehaviour.maxLateMinutes', {
    integer: true,
    min: 6,
    max: 180,
  });
  range(attendance.earlyLeaveMinutes, 'attendanceBehaviour.earlyLeaveMinutes', {
    integer: true,
    min: 6,
    max: 180,
  });
  range(attendance.extensionMinutes, 'attendanceBehaviour.extensionMinutes', {
    integer: true,
    min: 16,
    max: 360,
  });
}

export function loadConfig(path = CONFIG_PATH) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new ConfigError(`Cannot read ${path}: ${error.message}`);
  }
  return validateConfig(parsed);
}

export function resolveProfile(config, name) {
  const profile = config.profiles[name];
  if (!profile) {
    throw new ConfigError(
      `Unknown profile "${name}". Available: ${Object.keys(config.profiles).join(', ')}`,
    );
  }
  return profile;
}

/**
 * The generation window. The snapshot is noon on the day after the last date, once the last
 * night shift has ended. Mid-window coverage revisions start on the first Monday at or after
 * the window's midpoint.
 */
export function buildWindow(startDate, days) {
  const endDate = addDays(startDate, days - 1);
  return Object.freeze({
    startDate,
    endDate,
    days,
    dates: Object.freeze(dateRange(startDate, days)),
    snapshotAt: toTimestamp(addDays(endDate, 1), '12:00'),
    revisionDate: nextIsoWeekday(addDays(startDate, Math.floor(days / 2)), 1),
  });
}
