import { ENUMS } from '../../domain/constants.js';
import { addMinutes, clockMinutes, isWeekend, isoWeek, toTimestamp } from '../../lib/dates.js';
import { ids } from '../../lib/ids.js';

export function buildLaborPolicies(config, window) {
  const year = window.startDate.slice(0, 4);
  // Enum order keeps policy rows stable even if the config lists them differently.
  return ENUMS.EMPLOYMENT_TYPE.map((type) => {
    const policy = config.laborPolicies.find((p) => p.employmentType === type);
    return {
      policy_id: ids.laborPolicy(policy.code, year),
      employment_type: type,
      contracted_weekly_hours: policy.contractedWeeklyHours,
      max_weekly_scheduled_hours: policy.maxWeeklyScheduledHours,
      weekly_overtime_cap_hours: policy.weeklyOvertimeCapHours,
      min_rest_hours: policy.minRestHours,
      max_consecutive_days: policy.maxConsecutiveDays,
      effective_from: window.startDate,
      effective_to: null,
    };
  });
}

export function buildSkills(config) {
  const catalogue = [];
  for (const fn of ENUMS.TEAM_FUNCTION) {
    if (fn === 'WORKFORCE_OFFICE') continue;
    for (const skill of config.teamFunctions[fn].skills)
      catalogue.push({ ...skill, teamFunction: fn });
  }
  const office = config.workforceOffice;
  for (const key of ['managerSkill', 'hrPartnerSkill', 'opsPartnerSkill']) {
    catalogue.push({ ...office[key], teamFunction: 'WORKFORCE_OFFICE' });
  }

  const rows = catalogue.map((skill, i) => ({
    skill_id: ids.skill(i + 1),
    skill_name: skill.name,
    skill_category: skill.category,
    requires_certification: skill.certificationValidityDays === null ? 0 : 1,
    certification_validity_days: skill.certificationValidityDays,
  }));
  const byName = new Map(
    rows.map((row, i) => [row.skill_name, { ...row, teamFunction: catalogue[i].teamFunction }]),
  );
  return { rows, byName };
}

export function buildShiftTemplates(config) {
  return ENUMS.TEMPLATE_CODE.map((code) => {
    const template = config.shiftTemplates.find((t) => t.code === code);
    return {
      template_code: code,
      template_name: template.name,
      start_time: template.startTime,
      end_time: template.endTime,
      duration_minutes: clockMinutes(template.startTime, template.endTime),
      is_overnight: template.endTime <= template.startTime ? 1 : 0,
      is_night: template.isNight ? 1 : 0,
      effective_from: config.templatesEffectiveFrom,
      effective_to: null,
    };
  });
}

export function buildHolidays(config, window) {
  return config.holidays
    .filter((h) => h.date >= window.startDate && h.date <= window.endDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((h) => ({
      holiday_id: ids.holiday(h.date),
      holiday_date: h.date,
      holiday_name: h.name,
      holiday_type: h.type,
    }));
}

/** One shift per date × template; day type follows R-COV-03 (holiday beats weekend). */
export function buildShifts(window, templates, holidays) {
  const holidayByDate = new Map(holidays.map((h) => [h.holiday_date, h.holiday_id]));
  const rows = [];
  for (const date of window.dates) {
    const holidayId = holidayByDate.get(date) ?? null;
    const dayType = holidayId ? 'HOLIDAY' : isWeekend(date) ? 'WEEKEND' : 'WEEKDAY';
    for (const template of templates) {
      const startAt = toTimestamp(date, template.start_time);
      rows.push({
        shift_id: ids.shift(date, template.template_code),
        shift_date: date,
        template_code: template.template_code,
        start_at: startAt,
        end_at: addMinutes(startAt, template.duration_minutes),
        iso_week: isoWeek(date),
        day_type: dayType,
        holiday_id: holidayId,
      });
    }
  }
  return rows;
}
