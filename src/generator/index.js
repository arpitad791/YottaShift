// Full dataset: master data first, then transactions and events built on it (Step 2 of the
// brief), then the derived tables recomputed from those source records (Step 6).

import { deriveTables } from '../derive/derived-tables.js';
import { generateMasterData } from './master/index.js';
import { generateTransactions } from './transactions/index.js';

export function generateDataset(config, profileName) {
  const master = generateMasterData(config, profileName);
  const transactions = generateTransactions(config, master);
  const source = [...master.tables, ...transactions.tables];
  return {
    profileName,
    profile: master.profile,
    window: master.window,
    stats: transactions.stats,
    tables: [...source, ...deriveTables(Object.fromEntries(source))],
  };
}
