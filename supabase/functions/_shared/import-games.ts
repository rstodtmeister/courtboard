/** Keep repeated renderings of an identical HVV row, but never discard a different match. */
export function uniqueImportGames<T extends { number: string }>(games: T[]): T[] {
  const unique = new Map<string, T>();
  for (const game of games) {
    const number = game.number.trim();
    if (!number) {
      throw new Error('HVV-Import abgebrochen: Ein Spiel hat keine Spielnummer. Bitte den HVV-Spielplan prüfen. Vorhandene Spiele bleiben unverändert.');
    }
    const normalized = { ...game, number };
    const previous = unique.get(number);
    if (previous && JSON.stringify(previous) !== JSON.stringify(normalized)) {
      throw new Error(`HVV-Import abgebrochen: Die Spielnummer „${number}“ kommt mit unterschiedlichen Spieldaten mehrfach vor. Bitte den HVV-Spielplan prüfen. Vorhandene Spiele bleiben unverändert.`);
    }
    unique.set(number, normalized);
  }
  return [...unique.values()];
}
