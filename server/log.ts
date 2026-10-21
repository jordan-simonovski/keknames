/** Bound memory and broadcast size even when players repeatedly pass without guessing. */
export function appendGameLog<T>(log: T[], entry: T): void {
  log.push(entry);
  if (log.length > 500) log.shift();
}
