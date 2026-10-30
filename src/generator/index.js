// Full dataset: master data first, then transactions and events built on it (Step 2 of the brief).

import { generateMasterData } from './master/index.js';
import { generateTransactions } from './transactions/index.js';

export function generateDataset(config, profileName) {
  const master = generateMasterData(config, profileName);
  const transactions = generateTransactions(config, master);
  return {
    profileName,
    profile: master.profile,
    window: master.window,
    stats: transactions.stats,
    tables: [...master.tables, ...transactions.tables],
  };
}
