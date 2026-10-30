import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWindow,
  ConfigError,
  loadConfig,
  resolveProfile,
  validateConfig,
} from '../src/generator/config.js';

const fresh = () => structuredClone(loadConfig());

describe('generator config', () => {
  it('loads the shipped config with the brief’s seed and full-scale volumes', () => {
    const config = loadConfig();
    assert.equal(config.seed, 20261022);
    assert.deepEqual(resolveProfile(config, 'full'), {
      teams: 100,
      employees: 2000,
      days: 90,
      leaveRequests: 5000,
      swapRequests: 1500,
      anomaliesPerType: 20,
      boundaryCasesPerType: 10,
    });
    assert.ok(resolveProfile(config, 'starter').employees < 2000);
  });

  const broken = [
    ['an unknown key', (c) => (c.workforce.partTimeShre = 0.2), /unknown key "partTimeShre"/],
    ['a missing key', (c) => delete c.coverage.weekendFactor, /missing key "weekendFactor"/],
    ['shares that do not sum to 1', (c) => (c.sites.BLR = 0.5), /must sum to 1/],
    ['an unknown enum value', (c) => (c.holidays[0].type = 'BANK'), /not one of/],
    ['an impossible date', (c) => (c.window.startDate = '2026-02-30'), /not a real/],
    [
      'a certification shorter than the window',
      (c) => (c.teamFunctions.WAREHOUSE.skills[2].certificationValidityDays = 30),
      /between/,
    ],
    [
      'a duplicated skill name',
      (c) => (c.teamFunctions.IT_NOC.skills[0].name = 'Patrol'),
      /listed twice/,
    ],
    [
      'a pattern using a template that does not exist',
      (c) => (c.operatingPatterns.EXTENDED_HOURS.templates = ['A', 'X']),
      /not one of/,
    ],
  ];
  for (const [name, mutate, message] of broken) {
    it(`rejects ${name}`, () => {
      const config = fresh();
      mutate(config);
      assert.throws(
        () => validateConfig(config),
        (error) => error instanceof ConfigError && message.test(error.message),
      );
    });
  }

  it('rejects an unknown profile name and lists the valid ones', () => {
    assert.throws(() => resolveProfile(loadConfig(), 'huge'), /Available: starter, full/);
  });
});

describe('generation window', () => {
  it('spans 90 days for the full profile with the snapshot after the last night shift', () => {
    const window = buildWindow('2026-01-01', 90);
    assert.equal(window.endDate, '2026-03-31');
    assert.equal(window.dates.length, 90);
    assert.equal(window.snapshotAt, '2026-04-01T12:00:00+05:30');
    assert.equal(window.revisionDate, '2026-02-16');
  });
});
