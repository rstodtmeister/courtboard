import type { ScoreLink } from './types';

type CourtReference = { court: string; tournamentId: string };

export function findCourtScoreLink(links: ScoreLink[], entry: CourtReference, now = Date.now()) {
  return links.find(link => link.tournament_id === entry.tournamentId && link.court === entry.court
    && !link.game_id && !link.disabled_at && link.token
    && (!link.expires_at || Date.parse(link.expires_at) > now));
}

export async function courtQrTokens(
  courts: CourtReference[],
  links: ScoreLink[],
  create: (court: string, tournamentId: string) => Promise<string | null>,
) {
  const entries: Array<{ court: string; token: string }> = [];
  for (const entry of courts) {
    const token = findCourtScoreLink(links, entry)?.token ?? await create(entry.court, entry.tournamentId);
    if (!token) throw new Error(`Schiedsrichter-Link für Court ${entry.court} konnte nicht erzeugt werden. Bitte erneut versuchen.`);
    entries.push({ court: entry.court, token });
  }
  return entries;
}
