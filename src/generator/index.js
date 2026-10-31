import { deriveTables } from '../derive/derived-tables.js';
import { createRng } from '../lib/rng.js';
import { injectAnomalies } from './anomalies/inject.js';
import { generateMasterData } from './master/index.js';
import { generateTransactions } from './transactions/index.js';

/** options.anomalies = false returns the clean baseline (no injection, empty ground truth). */
export function generateDataset(config, profileName, { anomalies = true } = {}) {
  const master = generateMasterData(config, profileName);
  const transactions = generateTransactions(config, master);
  let source = Object.fromEntries([...master.tables, ...transactions.tables]);
  let groundTruth = [];
  if (anomalies) {
    ({ tables: source, groundTruth } = injectAnomalies(source, {
      config,
      profile: master.profile,
      rng: createRng(config.seed, 'anomalies'),
    }));
  }
  const order = [...master.tables, ...transactions.tables].map(([name]) => name);
  const sourceTables = order.map((name) => [name, source[name]]);
  return {
    profileName,
    profile: master.profile,
    window: master.window,
    stats: transactions.stats,
    tables: [...sourceTables, ...deriveTables(source)],
    groundTruth,
  };
}
