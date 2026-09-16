/** Values must come from HVV's actual Schiri1 options, never from a computed ID. */
export type HvvRefereeOption = { value: string; label: string; disabled?: boolean };
export type HvvSeedEntry = { seed: number; team: string };
export type HvvRefereeGame = {
  number: string;
  team_a?: string | null;
  team_b?: string | null;
  completed?: boolean;
  winner_team?: string | null;
};

type GameReference = { outcome: 'winner' | 'loser'; number: string };
function text(value: string) {
  return value.normalize('NFC').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de');
}
function teamKey(value: string) {
  // Ignore typography around the player separator, without fuzzy name matching.
  return text(value).replace(/\s*\/\s*/g, '/');
}
function reference(value: string): GameReference | null {
  const normalized = text(value);
  const prefix = normalized.match(/^(sieger|gewinner|verlierer)(?:\s+(?:aus|von))?\s+spiel\s*(?:nr\.?\s*)?(\d+)$/);
  if (prefix) return { outcome: prefix[1] === 'verlierer' ? 'loser' : 'winner', number: String(Number(prefix[2])) };
  const suffix = normalized.match(/^spiel\s*(?:nr\.?\s*)?(\d+)\s+(sieger|gewinner|verlierer)$/);
  return suffix ? { outcome: suffix[2] === 'verlierer' ? 'loser' : 'winner', number: String(Number(suffix[1])) } : null;
}
function seedNumber(value: string) {
  const label = text(value);
  const match = label.match(/^(?:setzung|setzplatz|setzliste|setzlisten(?:nummer|platz))\s*(?:nr\.?\s*)?(\d+)$/)
    ?? label.match(/^(\d+)\.?\s*(?:setzung|setzplatz|setzlistenplatz)$/)
    ?? label.match(/^(\d+)\.?$/);
  return match ? Number(match[1]) : null;
}
function resolvedTeam(value: string, games: HvvRefereeGame[], seen = new Set<string>()): string | null {
  const ref = reference(value);
  if (!ref) return value.trim() || null;
  const key = `${ref.outcome}:${ref.number}`;
  if (seen.has(key)) return null;
  const matches = games.filter(game => game.number.trim() === ref.number);
  if (matches.length !== 1) return null;
  const game = matches[0];
  if (!game.completed || !['1', '2'].includes(game.winner_team ?? '')) return null;
  const winnerA = game.winner_team === '1';
  const selectedA = ref.outcome === 'winner' ? winnerA : !winnerA;
  const selected = selectedA ? game.team_a : game.team_b;
  return selected ? resolvedTeam(selected, games, new Set([...seen, key])) : null;
}

/** Map a named team to its seed, or an unresolved reference to the matching HVV option.
 * Throws on ambiguity rather than assigning the wrong team or writing a display name as an ID.
 */
export function resolveHvvRefereeOption(
  referee: string,
  seeds: HvvSeedEntry[],
  options: HvvRefereeOption[],
  games: HvvRefereeGame[] = [],
): string {
  if (!referee.trim()) throw new Error('Kein Schiedsgericht ausgewählt.');
  const ref = reference(referee);
  const team = resolvedTeam(referee, games);
  const enabled = options.filter(option => !option.disabled && option.value !== '');
  let matching: HvvRefereeOption[];
  if (team) {
    const embeddedSeed = team.match(/\((\d+)\)\s*$/)?.[1];
    const entries = seeds.filter(entry => teamKey(entry.team) === teamKey(team));
    const numbers = new Set(embeddedSeed ? [Number(embeddedSeed)] : entries.map(entry => entry.seed));
    if (numbers.size !== 1) {
      throw new Error(`Schiri1: Für „${team}“ wurde keine eindeutige HVV-Setzlistennummer gefunden.`);
    }
    const seed = [...numbers][0];
    if (!Number.isSafeInteger(seed) || seed < 1 || seeds.some(entry => entry.seed === seed && teamKey(entry.team) !== teamKey(team))) {
      throw new Error(`Schiri1: Die HVV-Setzung für „${team}“ ist nicht eindeutig.`);
    }
    matching = enabled.filter(option => seedNumber(option.label) === seed);
  } else if (ref) {
    matching = enabled.filter(option => {
      const candidate = reference(option.label);
      return candidate?.number === ref.number && candidate.outcome === ref.outcome;
    });
  } else {
    throw new Error('Schiri1 konnte nicht zugeordnet werden.');
  }
  const values = new Set(matching.map(option => option.value));
  if (values.size !== 1) {
    throw new Error(`Schiri1: Keine eindeutige HVV-Auswahl für „${referee}“ gefunden.`);
  }
  return [...values][0];
}

export function hvvRefereeOptions(selectHtml: string): HvvRefereeOption[] {
  const decode = (value: string) => value
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ');
  const attribute = (tag: string, name: string) => {
    const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return decode(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
  };
  return [...selectHtml.matchAll(/<option\b[^>]*>[\s\S]*?<\/option>/gi)].map(match => ({
    value: attribute(match[0], 'value'),
    label: decode(match[0].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
    disabled: /\sdisabled(?:\s|=|>)/i.test(match[0]),
  }));
}
