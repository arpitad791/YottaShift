// Fair, constraint-aware roster building (R-SCH-01 … R-SCH-10, R-COV-01 … R-COV-04).
//
// For each date and team the scheduler fills required headcount slot by slot. Skills with the
// fewest qualified people are filled first, so multi-skilled staff are not used up on easy
// slots. Each slot goes to the eligible employee who ranks first on the R-SCH-09 fairness
// key. When nobody is eligible the slot stays empty: a coverage gap, never an unqualified fill.

import { ENUMS } from '../domain/constants.js';
import { compareKeys } from './roster-state.js';

const templateOrder = (code) => ENUMS.TEMPLATE_CODE.indexOf(code);

/** Index of coverage rows by team, template and day type (R-COV-01 lookup). */
export function coverageIndex(coverageRows) {
  const index = Map.groupBy(coverageRows, (r) => `${r.team_id}|${r.template_code}|${r.day_type}`);
  return (teamId, template, dayType, date) =>
    (index.get(`${teamId}|${template}|${dayType}`) ?? []).filter(
      (r) => r.effective_from <= date && (r.effective_to === null || date <= r.effective_to),
    );
}

/** Best eligible employee for one slot, or null. */
export function pickCandidate(
  state,
  { candidates, shift, skillId, atMs, tiebreak, exclude = null },
) {
  let best = null;
  let bestKey = null;
  for (const emp of candidates) {
    if (emp === exclude || state.check(emp, shift, skillId, atMs) !== null) continue;
    const key = state.fairnessKey(emp, shift, tiebreak(emp));
    if (best === null || compareKeys(key, bestKey) < 0) {
      best = emp;
      bestKey = key;
    }
  }
  return best;
}

/** Seeded per-employee tie-break values for one scheduling round. */
export function tiebreaker(rng) {
  const values = new Map();
  return (emp) => {
    if (!values.has(emp.id)) values.set(emp.id, rng.next());
    return values.get(emp.id);
  };
}

/**
 * Builds and publishes the roster for one ISO week (R-SCH-10). `assign` creates and records
 * an assignment; it is called once per filled slot.
 */
export function publishWeek(state, { week, publishMs, teams, requirementsFor, rng, assign }) {
  const tiebreak = tiebreaker(rng);
  for (const date of state.weekDates.get(week)) {
    for (const team of teams) {
      const members = state.byTeam.get(team.team_id) ?? [];
      const slots = [];
      for (const template of team.templates) {
        const shift = state.shiftByDateTemplate.get(`${date}|${template}`);
        for (const row of requirementsFor(team.team_id, template, shift.dayType, date)) {
          const qualified = members.filter(
            (e) => state.employedOn(e, date) && state.holdsSkill(e, row.skill_id, date),
          ).length;
          slots.push({ shift, skillId: row.skill_id, need: row.min_headcount, qualified });
        }
      }
      slots.sort(
        (a, b) =>
          a.qualified - b.qualified ||
          templateOrder(a.shift.template) - templateOrder(b.shift.template) ||
          a.skillId.localeCompare(b.skillId),
      );
      for (const slot of slots) {
        for (let n = 0; n < slot.need; n++) {
          const emp = pickCandidate(state, {
            candidates: members,
            shift: slot.shift,
            skillId: slot.skillId,
            atMs: publishMs,
            tiebreak,
          });
          if (emp === null) break;
          assign({
            emp,
            shift: slot.shift,
            teamId: team.team_id,
            skillId: slot.skillId,
            createdMs: publishMs,
          });
        }
      }
    }
  }
}
