/** Differences between two manifests (file list, rows, bytes, SHA-256, seed, config), as text. */
export function compareManifests(left, right) {
  const differences = [];
  const rightFiles = new Map(right.files.map((f) => [f.path, f]));
  const leftPaths = new Set(left.files.map((f) => f.path));
  for (const file of left.files) {
    const other = rightFiles.get(file.path);
    if (!other) {
      differences.push(`${file.path}: missing in the second set`);
      continue;
    }
    for (const key of ['rows', 'bytes', 'sha256']) {
      if (file[key] !== other[key])
        differences.push(`${file.path}: ${key} ${file[key]} ≠ ${other[key]}`);
    }
  }
  for (const file of right.files) {
    if (!leftPaths.has(file.path)) differences.push(`${file.path}: missing in the first set`);
  }
  for (const key of ['seed', 'config_sha256']) {
    if (left[key] !== right[key]) differences.push(`${key} ${left[key]} ≠ ${right[key]}`);
  }
  return differences;
}

export const sameEnvironment = (a, b) =>
  a.environment.node === b.environment.node && a.environment.sqlite === b.environment.sqlite;
